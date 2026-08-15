/**
 * Katalog v3 router'ı — Master / Listing / ChannelListing ve kapasite.
 *
 * Eski `products` router'ı yerinde kalır; bu modül yanına kurulur ki geçiş
 * sırasında çalışan sistem bozulmasın. İş mantığının tamamı saf fonksiyonlarda
 * (catalogPlan, catalogCodes, capacity); burada yalnız veri okuma/yazma var.
 */

import type { SalesMode } from "../capacity";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  bottleneckReport,
  computeCapacity,
  listingQty,
  listingQtyFor,
  type CapacityFormula,
  type CapacityMaterial,
  type MaterialType,
} from "../capacity";
import {
  buildBaseCode,
  buildChannelBarcode,
  buildChannelSku,
  buildInternalSku,
  buildSlug,
  looksLikeReadyToUse,
} from "../catalogCodes";
import {
  isNeutralColor,
  makeColorCodeIndex,
  nextColorNo,
  parseColorNo,
} from "@shared/colorCode";
import { mapToTrendyolCards } from "../cardMapping";
import { cubeKey, disambiguate, planListings, planMasters, type Readiness } from "../catalogPlan";
import {
  buildMasterExportMatrix,
  masterMatrixToParsed,
  planMasterImport,
  type MasterIORecord,
} from "@shared/masterIO";
import { salesNameOf } from "@shared/productName";
import { deriveUnitLaborOverhead } from "@shared/pricing";
import { runCapacityRecompute } from "../catalogJobs";
import { loadCapacityInputs } from "../capacityInputs";
import {
  flattenCategories,
  searchCategories,
  suggestForUseCases,
  type FlatCategory,
} from "../categorySuggest";
import { syncAllChannels, syncChannel } from "../channelSyncWorker";
import { generateContentBlock, templateContentBlock } from "../contentAi";
import { computeMasterCosts, marginOf, resolveUnitCosts, type CostMaterial } from "../costing";
import { qtyInMaterialUnit } from "@shared/units";
import { planFormulaBindings, type MatchableFormula } from "../formulaMatch";
import { BASE_VOLUME_ML, planBaseNormalization } from "../formulaBase";
import { auditRecipes, type AuditFormula, type AuditMaterial } from "../recipeAudit";
import { buildChannelRefIndex, resolveMasterByRef } from "../orderBinding";
import {
  pickBlock,
  planContentBlocks,
  resolveListingContent,
  type ContentBlockLike,
} from "../listingContent";
import {
  guessSource,
  imageUrlOf,
  isConstantOnlyAttribute,
  masterImagePath,
  resolveImages,
  resolveLogistics,
  type ChannelAttributeDef,
  type ImageRow,
} from "../masterFields";
import { findInvalidMasters, planCleanup } from "../masterAudit";
import { previewPairs, suggestFamilyPackagings } from "../generatePreview";
import { normalizeName, planRestructure } from "../catalogRestructure";
import { masterHealth, rollupBySeries } from "../masterHealth";
import {
  computeMasterRevenue,
  findDeadMasters,
  rollupRevenueBySeries,
  windowStart,
} from "../masterRevenue";
import {
  buildFormulation,
  groupUnmatchedLines,
  planProduction,
  resolveOrderLines,
} from "../productionPlan";
import { matchAttributeValues } from "../attributeMatch";
import { reconcileCatalogs, reconcileSummary } from "../marketplaceReconcile";
import { planProductImport } from "../productImport";
import { planPublications, summarizeSkips } from "../publishPlan";
import { GENERIC_USE_CASE_CODE, seedCatalogDimensions } from "../seedCatalog";
import { fetchHepsiburadaCategories, fetchHepsiburadaCategoryAttributes } from "../hepsiburada";
import {
  fetchTrendyolCategories,
  fetchTrendyolCategoryAttributes,
  fetchTrendyolExistingBarcodes,
  fetchTrendyolProducts,
  parseCardSettings,
  pushTrendyolProductCards,
  searchTrendyolBrands,
  updateTrendyolProductCards,
} from "../trendyolProducts";

/* ---- Pazaryeri kategori ağacı önbelleği ---------------------------------- */

/**
 * Kategori ağacı binlerce satır ve seyrek değişir; her arama tuşunda API'ye
 * gitmek hem yavaş hem kotayı yer. Süreç belleğinde tutulur.
 */
const categoryCache = new Map<string, { at: number; rows: FlatCategory[] }>();
const CATEGORY_TTL_MS = 6 * 60 * 60 * 1000;

async function loadChannelCategories(channelCode: string): Promise<FlatCategory[]> {
  const hit = categoryCache.get(channelCode);
  if (hit && Date.now() - hit.at < CATEGORY_TTL_MS) return hit.rows;

  let raw: unknown;
  try {
    if (channelCode === "trendyol") raw = await fetchTrendyolCategories();
    else if (channelCode === "hepsiburada") raw = await fetchHepsiburadaCategories();
    else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${channelCode}" kanalı için kategori listesi çekilemiyor — kimliği elle girin.`,
      });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Kategori listesi alınamadı",
    });
  }

  const rows = flattenCategories(raw);
  categoryCache.set(channelCode, { at: Date.now(), rows });
  return rows;
}

/**
 * Kullanıcının kurduğu "pazaryeri özelliği → eksen" eşlemesini haritaya çevirir.
 *
 * `channelAttributes.source` zaten bu bilgiyi tutuyor (Özellik Eşlemesi
 * ekranı). İçe aktarma bunu okumak yerine ad tahmini yapıyordu; Trendyol'un
 * "Renk" özelliği bu katalogda YARI-MAT/ŞEFFAF gibi YÜZEY değerleri taşıdığı
 * için tahmin yanlış eksene yazıyordu.
 *
 * Yalnız eksene bağlı kaynaklar alınır: "sabit" ve "hacim" bir boyut eksenine
 * karşılık gelmez.
 */
export function buildAxisMapping(rows: unknown): Record<string, "renk" | "ambalaj" | "form"> {
  const out: Record<string, "renk" | "ambalaj" | "form"> = {};
  for (const r of (rows as Record<string, unknown>[]) ?? []) {
    const name = normalizeName(String(r.attributeName ?? ""));
    const source = String(r.source ?? "");
    if (!name) continue;
    if (source !== "renk" && source !== "ambalaj" && source !== "form") continue;
    out[name] = source;
  }
  return out;
}

/* ---- Pazaryeri özellik (attribute) normalizasyonu ------------------------ */

/**
 * Kanal farkı gözetmeyen özellik satırı — kayıt katmanı bunu bekler.
 *
 * `options`: pazaryerinin o özellik için KABUL ETTİĞİ değerler. Yanıt bunu
 * zaten taşıyordu ama atılıyordu; saklanınca eşleme yazmak değil seçmek olur.
 */
type NormalizedAttribute = {
  attributeId: number;
  attributeName: string;
  isRequired: boolean;
  options: { valueId: number; valueName: string }[];
};

/**
 * Yanıt ağacında özellik dizisini bulur.
 *
 * Bir kaydın "özellik" sayılması için sayısal bir kimliği ve adı olmalı. Bilinen
 * alan adlarına (`data`, `attributes`, …) güvenmek kırılgandı: HB sarmalayıcıyı
 * değiştirdiğinde dizi yerine nesne bulunuyor ve döngü "not iterable" ile
 * çöküyordu. Arama sınırlı derinlikte yapılır — yanıt beklenmedikse boş döner,
 * çökmez.
 */
export function findAttributeArray(raw: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || raw == null || typeof raw !== "object") return [];

  const looksLikeAttribute = (v: unknown): boolean => {
    if (!v || typeof v !== "object") return false;
    const r = v as Record<string, unknown>;
    const hasId = Number(r.id ?? r.attributeId ?? 0) > 0;
    const hasName = typeof (r.name ?? r.attributeName) === "string";
    return hasId && hasName;
  };

  if (Array.isArray(raw)) {
    return raw.some(looksLikeAttribute) ? (raw as Record<string, unknown>[]) : [];
  }

  for (const value of Object.values(raw as Record<string, unknown>)) {
    const found = findAttributeArray(value, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

/** Ham değer dizisini `{valueId,valueName}` listesine indirger. */
export function normalizeOptionList(raw: unknown): { valueId: number; valueName: string }[] {
  const rows = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
  const out: { valueId: number; valueName: string }[] = [];
  for (const v of rows) {
    const valueId = Number(v.id ?? v.valueId ?? 0);
    const valueName = String(v.name ?? v.valueName ?? "").trim();
    if (!valueId || !valueName) continue;
    out.push({ valueId, valueName });
  }
  return out;
}

/**
 * Trendyol:
 * `{ categoryAttributes: [{ attribute: {id,name}, attributeValues: [{id,name}], required }] }`
 */
export function normalizeTrendyolAttributes(raw: unknown): NormalizedAttribute[] {
  const rows = ((raw as Record<string, unknown>)?.categoryAttributes ?? []) as Record<
    string,
    unknown
  >[];
  const out: NormalizedAttribute[] = [];
  for (const row of rows) {
    const attr = (row.attribute ?? {}) as Record<string, unknown>;
    const attributeId = Number(attr.id ?? 0);
    if (!attributeId) continue;
    out.push({
      attributeId,
      attributeName: String(attr.name ?? ""),
      isRequired: Boolean(row.required),
      options: normalizeOptionList(row.attributeValues),
    });
  }
  return out;
}

/**
 * Hepsiburada: yanıt sarmalayıcısı sürümden sürüme değişiyor
 * (`data` / `attributes` / düz dizi), zorunluluk alanı da
 * `mandatory` ya da `required` olabiliyor. Hepsi savunmacı denenir.
 */
export function normalizeHepsiburadaAttributes(raw: unknown): NormalizedAttribute[] {
  /*
   * Sarmalayıcı sürümden sürüme değişiyor ve bir seviye daha derin de olabiliyor
   * (`{data:{attributes:[…]}}`). Sabit alan adlarına güvenmek "rows is not
   * iterable" ile çöküyordu: bulunan şey dizi değil nesneydi. Artık özellik
   * dizisi ağaçta ARANIYOR; bulunamazsa çökmek yerine boş dönülüyor.
   */
  const rows = findAttributeArray(raw);
  const out: NormalizedAttribute[] = [];
  for (const row of rows) {
    // Kimlik sayısal olmayabilir (HB bazı özelliklerde metin anahtar verir);
    // sayıya çevrilemeyen satır atlanır — şemamız sayısal kimlik tutuyor.
    const attributeId = Number(row.id ?? row.attributeId ?? 0);
    if (!attributeId) continue;
    out.push({
      attributeId,
      attributeName: String(row.name ?? row.attributeName ?? ""),
      isRequired: Boolean(row.mandatory ?? row.required ?? false),
      options: normalizeOptionList(row.values ?? row.attributeValues ?? row.options),
    });
  }
  return out;
}

/**
 * `formulaScopes` satırlarını eşleştiricinin beklediği biçime çevirir.
 * Bir eksende satır yoksa alan tanımsız kalır → eksen serbest ("hepsi").
 */
function buildScopeMap(
  rows: { formulaId: number; kind: "seri" | "renk" | "form" | "hazirlik"; valueId: number }[],
): Map<number, { seri?: number[]; renk?: number[]; form?: number[]; hazirlik?: Readiness[] }> {
  const out = new Map<
    number,
    { seri?: number[]; renk?: number[]; form?: number[]; hazirlik?: Readiness[] }
  >();
  for (const r of rows) {
    const entry = out.get(r.formulaId) ?? {};
    if (r.kind === "hazirlik") {
      entry.hazirlik = [...(entry.hazirlik ?? []), r.valueId === 1 ? "r2u" : "konsantre"];
    } else {
      entry[r.kind] = [...(entry[r.kind] ?? []), r.valueId];
    }
    out.set(r.formulaId, entry);
  }
  return out;
}

/**
 * Master ↔ reçete bağlama planı. İki uç kullanır (elle "Reçeteleri Bağla" ve
 * baz çevriminin ardından otomatik tazeleme); aynı hesabı iki kez yazmak
 * ikisinin zamanla ayrışması demek olurdu.
 */
async function planBindings(rebindExisting: boolean) {
  const [formulas, masters, packagings, scopeRows] = await Promise.all([
    db.listFormulas(),
    db.listMasterProducts(),
    db.listPackagings(),
    db.listFormulaScopes(),
  ]);
  const scopesByFormula = buildScopeMap(scopeRows as never);
  const volumeById = new Map(
    (packagings as { id: number; volumeMl: string }[]).map(p => [p.id, num(p.volumeMl)]),
  );

  return planFormulaBindings({
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      familyId: m.familyId as number,
      readiness: m.readiness as Readiness,
      packagingVolumeMl: volumeById.get(m.packagingId as number) ?? 0,
      currentFormulaId: (m.formulaId as number | null) ?? null,
      currentScale: num(m.formulaScale) || null,
    })),
    formulas: (formulas as Record<string, unknown>[]).map(
      (f): MatchableFormula => ({
        id: f.id as number,
        outputType: f.outputType as "yari_mamul" | "mamul",
        seriesId: (f.seriesId as number | null) ?? null,
        colorId: (f.colorId as number | null) ?? null,
        familyId: (f.familyId as number | null) ?? null,
        readiness: (f.readiness as Readiness | null) ?? null,
        scopes: scopesByFormula.get(f.id as number),
        baseQty: num(f.baseQty),
        baseUnit: (f.baseUnit as string | null) ?? null,
      }),
    ),
    rebindExisting,
  });
}

/** Bağlı master'lar dahil tüm ölçekleri reçetenin GÜNCEL bazına göre tazeler. */
async function rebindAllFormulas(): Promise<number> {
  const plan = await planBindings(true);
  for (const b of plan.bindings) {
    await db.updateMasterProduct(b.masterId, {
      formulaId: b.formulaId,
      formulaScale: String(b.formulaScale),
    });
  }
  return plan.bindings.length;
}

/**
 * Katalog denetimi — bugünkü uyumluluk kurallarına uymayan master'ları bulur.
 *
 * İki uç (denetim ve temizlik) aynı hesabı kullanmalı: önizlemede temiz
 * görünüp temizlikte başka bir şey silinmesin.
 */
async function runMasterAudit() {
  const [masters, colors, families, packagings, sp, sf, sc, fp, history] = await Promise.all([
    db.listMasterProducts(),
    db.listColors(),
    db.listProductFamilies(),
    db.listPackagings(),
    db.listSeriesPackagings(),
    db.listSeriesFamilies(),
    db.listSeriesColors(),
    db.listFamilyPackagings(),
    db.listMastersWithHistory(),
  ]);

  const group = (rows: Record<string, unknown>[], key: string, val: string) => {
    const map = new Map<number, Set<number>>();
    for (const r of rows) {
      const k = r[key] as number;
      const set = map.get(k) ?? new Set<number>();
      set.add(r[val] as number);
      map.set(k, set);
    }
    return map;
  };
  const inactive = (rows: Record<string, unknown>[]) =>
    new Set(rows.filter(r => Number(r.isActive ?? 1) === 0).map(r => r.id as number));

  const violations = findInvalidMasters({
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      internalSku: String(m.internalSku ?? ""),
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      familyId: m.familyId as number,
      packagingId: m.packagingId as number,
      readiness: m.readiness as "konsantre" | "r2u",
      status: m.status as "taslak" | "aktif" | "arsiv",
    })),
    rules: {
      seriesPackagings: group(sp as never, "seriesId", "packagingId"),
      seriesFamilies: group(sf as never, "seriesId", "familyId"),
      seriesColors: group(sc as never, "seriesId", "colorId"),
      familyPackagings: group(fp as never, "familyId", "packagingId"),
      inactiveColors: inactive(colors as never),
      inactiveFamilies: inactive(families as never),
      inactivePackagings: inactive(packagings as never),
    },
    historyIds: history,
  });

  return { total: (masters as unknown[]).length, violations, plan: planCleanup(violations) };
}

/** productSeries JSON alanındaki {label,value} veya düz metin dizisini çözer. */
function parseStringArray(value: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  }
  return arr
    .map(x =>
      x && typeof x === "object"
        ? String((x as Record<string, unknown>).label ?? (x as Record<string, unknown>).value ?? "").trim()
        : String(x).trim(),
    )
    .filter(Boolean);
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};


/**
 * Birim başına işçilik + genel gider payı.
 *
 * Ayarlarda aylık genel gider, ortalama üretim adedi ve saatlik işçilik
 * zaten tanımlıydı ve eski modelin kanal kârı raporu bunları kullanıyordu;
 * küp katalog kullanmadığı için birim maliyet sistematik olarak düşük
 * çıkıyordu.
 */
async function unitLaborOverheadValue(): Promise<number> {
  return deriveUnitLaborOverhead(await db.getSettings()).value;
}

/**
 * Ambalaj çekimi verisi.
 *
 * Üst sınır kasıtlı: sütun `mediumtext` (16 MB) ve base64 veriyi ~%33
 * şişiriyor. İstemci yüklemeden önce küçültüyor; buradaki sınır o adım
 * atlandığında satırın sığmayıp sessizce kesilmesini önlüyor.
 */
const packagingImageData = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Geçersiz görsel verisi")
  .max(6_000_000, "Görsel çok büyük — daha küçük bir kare yükleyin");

/** Renk numarası verilecek satırlar — iki uçta da aynı sorgu. */
async function listColorNumbers() {
  return (await db.listColors()) as Array<{
    id: number;
    code: string;
    name: string;
    colorNo: number | null;
  }>;
}

/** `seriesColorNumbers` satırı — "bu seride bu rengin numarası". */
type SeriesColorNoRow = { seriesId: number; colorId: number; colorNo: number };

export const katalogRouter = router({
  /* ---- Boyutlar --------------------------------------------------------- */

  dimensions: protectedProcedure.query(async () => {
    const [colors, families, packagings, useCases, channels, sp, sf, sc, scn] = await Promise.all([
      db.listColors(),
      db.listProductFamilies(),
      db.listPackagings(),
      db.listUseCases(),
      db.listSalesChannels(),
      db.listSeriesPackagings(),
      db.listSeriesFamilies(),
      db.listSeriesColors(),
      // Katalog kodunu kuran ikinci parça. Renklerle AYNI sorguda dönüyor:
      // ayrı sorgu olsaydı ekranlar kodu önce varsayılan numarayla basıp
      // numaralar gelince değiştirirdi — kod gözün önünde zıplardı.
      db.listSeriesColorNumbers(),
    ]);
    return {
      colors,
      families,
      packagings,
      useCases,
      channels,
      seriesPackagings: sp,
      seriesFamilies: sf,
      seriesColors: sc,
      seriesColorNumbers: scn,
    };
  }),

  /**
   * Boyutları şirketin mevcut sözlüğünden tohumlar (seriler, şablonlar,
   * hammadde kayıtları). Idempotent — tekrar çalıştırmak zarar vermez.
   */
  seedDimensions: protectedProcedure.mutation(async () => {
    const seeded = await seedCatalogDimensions();
    // Tohumlama var olan satıra dokunmaz; daha önce yazılmış çakışan SKU
    // ekleri burada onarılır — aksi halde master üretimi "kod çakışması"
    // ile durur ve kullanıcının elinden bir şey gelmez.
    const repaired = await db.repairSkuSegments();
    return { ...seeded, repaired };
  }),

  /** SKU eklerini tek başına onarır — tohumlamayı yeniden çalıştırmadan. */
  repairSkuSegments: protectedProcedure.mutation(() => db.repairSkuSegments()),

  /**
   * Boyut ekleme/düzenleme — Tanımlar sayfası. Renk, ambalaj, form ve kullanım
   * alanı artık TEK kaynak; eskiden aynı sözlük hem Şablonlar'da hem burada
   * duruyor ve senkron olmuyordu.
   */
  saveDimension: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["colors", "families", "packagings", "useCases"]),
        id: z.number().nullable().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        // Renk
        /** Satış adında kullanılan uluslararası ad — "MAGENTA". */
        nameEn: z.string().nullable().optional(),
        /** Renk numarası — katalog kodunun sayı kısmı (CND1008 → 1008). */
        colorNo: z.number().int().positive().max(99999999).nullable().optional(),
        hex: z.string().nullable().optional(),
        finish: z.enum(["duz", "metalik", "sedef", "candy", "neon", "seffaf"]).optional(),
        seriesId: z.number().nullable().optional(),
        // Ambalaj
        volumeMl: z.number().min(0).optional(),
        materialId: z.number().nullable().optional(),
        // Form / ambalaj SKU eki
        skuSegment: z.string().nullable().optional(),
        // Kullanım alanı
        titlePattern: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { kind, id, ...rest } = input;
      const data: Record<string, unknown> = { code: rest.code.trim(), name: rest.name.trim() };
      if (rest.sortOrder !== undefined) data.sortOrder = rest.sortOrder;
      if (rest.isActive !== undefined) data.isActive = rest.isActive ? 1 : 0;
      if (kind === "colors") {
        data.nameEn = rest.nameEn?.trim() || null;
        // Kod her yerde AYNI yazılsın: büyük harf ve boşluksuz. "cnd 1324" ile
        // "CND1324" iki ayrı kod olarak durursa tekillik indeksi işe yaramaz.
        data.colorNo = rest.colorNo ?? null;
        data.hex = rest.hex ?? null;
        if (rest.finish) data.finish = rest.finish;
        data.seriesId = rest.seriesId ?? null;

        // Aynı numarayı iki renge vermek, depoda yanlış şişenin kutulanması
        // demek. Veritabanı da engelliyor ama oradan gelen hata ("Duplicate
        // entry") kullanıcıya HANGİ rengin o numarayı tuttuğunu söylemiyor.
        if (data.colorNo != null) {
          const clash = (await listColorNumbers()).find(
            c => c.id !== id && c.colorNo === data.colorNo,
          );
          if (clash) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${data.colorNo} numarası zaten "${clash.name}" renginde kullanılıyor.`,
            });
          }
        }
      }
      if (kind === "packagings") {
        if (rest.volumeMl !== undefined) data.volumeMl = String(rest.volumeMl);
        data.materialId = rest.materialId ?? null;
        data.skuSegment = rest.skuSegment ?? null;
      }
      if (kind === "families") data.skuSegment = rest.skuSegment ?? null;
      if (kind === "useCases") data.titlePattern = rest.titlePattern ?? null;

      if (id) {
        await db.updateDimension(kind, id, data);
        return { id };
      }
      return { id: await db.createDimension(kind, data) };
    }),

  /* ---- Renk numarası (CND1008'in "1008"i) --------------------------------- */

  /**
   * Sıradaki renk numarasını ÖNERİR — yazmaz.
   *
   * `seriesId` verilirse O SERİNİN dizisinden devam eder (CANDY'nin 1004'ü ile
   * METEOR'un 1004'ü ayrı renkler olabilir; ön ek onları ayırır). Verilmezse
   * rengin varsayılan numarası için tüm numaralara bakılır.
   *
   * Numara insanın kararı: form açıkken önerilir, kullanıcı beğenmezse elle
   * değiştirir.
   */
  nextColorNo: protectedProcedure
    .input(z.object({ seriesId: z.number().int().positive().nullable() }).optional())
    .query(async ({ input }) => {
      const seriesId = input?.seriesId ?? null;
      if (seriesId == null) {
        const colors = await listColorNumbers();
        return { colorNo: nextColorNo(colors.map(c => c.colorNo)) };
      }
      const rows = await db.listSeriesColorNumbers();
      return {
        colorNo: nextColorNo(
          (rows as SeriesColorNoRow[]).filter(r => r.seriesId === seriesId).map(r => r.colorNo),
        ),
      };
    }),

  /**
   * Bir seride bir rengin numarasını yazar — katalog kodunun gerçek tanım yeri.
   *
   * `colorNo: null` kaydı siler: renk o seride varsayılan numarasına döner.
   * Aynı seride iki rengin aynı numarayı taşıması engellenir; farklı serilerde
   * aynı numara serbesttir (CND1004 ≠ MTR1004).
   */
  setSeriesColorNo: protectedProcedure
    .input(
      z.object({
        seriesId: z.number().int().positive(),
        colorId: z.number().int().positive(),
        colorNo: z.number().int().positive().max(99999999).nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.colorNo != null) {
        const [rows, colors] = await Promise.all([db.listSeriesColorNumbers(), listColorNumbers()]);
        const clash = (rows as SeriesColorNoRow[]).find(
          r =>
            r.seriesId === input.seriesId &&
            r.colorId !== input.colorId &&
            r.colorNo === input.colorNo,
        );
        if (clash) {
          const name = colors.find(c => c.id === clash.colorId)?.name ?? "başka bir renk";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Bu seride ${input.colorNo} numarası zaten "${name}" renginde kullanılıyor.`,
          });
        }
      }
      await db.setSeriesColorNumber(input.seriesId, input.colorId, input.colorNo);
      return { ok: true };
    }),

  /**
   * Numarası olmayan renklere toplu numara verir.
   *
   * ── Neden toplu ───────────────────────────────────────────────────────────
   * Katalogda onlarca renk var; tek tek açıp yazmak saatlik bir iş ve yarısı
   * unutuluyor. Dolu numaralara DOKUNMAZ: elle verilmiş numara her zaman
   * kazanır. Önce `dryRun` ile ne olacağı görülür.
   *
   * ── İki kip ───────────────────────────────────────────────────────────────
   * `seriesId` verilirse O SERİNİN kendi dizisi doldurulur (CANDY 1001, 1002…)
   * ve yalnız o seride üretilen renkler işlenir — seride olmayan renge o
   * serinin kodunu vermek anlamsız. Verilmezse rengin varsayılan numarası
   * yazılır.
   *
   * ── Renksiz atlanır ───────────────────────────────────────────────────────
   * "Renksiz / Nötr" bir renk değil, `masterProducts.colorId` NOT NULL kalsın
   * diye duran yer tutucudur. Ona numara verilince tinerin etiketine renk kodu
   * basılıyordu; artık listeye hiç girmiyor.
   */
  assignColorNumbers: protectedProcedure
    .input(
      z
        .object({
          dryRun: z.boolean().default(true),
          seriesId: z.number().int().positive().nullable().default(null),
        })
        .default({ dryRun: true, seriesId: null }),
    )
    .mutation(async ({ input }) => {
      const colors = (await listColorNumbers()).filter(c => !isNeutralColor(c.code));
      const seriesId = input.seriesId;

      if (seriesId == null) {
        // Aynı çalıştırmada üretilen numaralar da sayılmalı, yoksa iki renk
        // aynı numarayı alır ve tekillik indeksi kaydı reddeder.
        const used = colors.map(c => c.colorNo);
        const plan = colors
          .filter(c => c.colorNo == null)
          .sort((a, b) => a.name.localeCompare(b.name, "tr"))
          .map(c => {
            const no = nextColorNo(used);
            used.push(no);
            return { colorId: c.id, name: c.name, colorNo: no };
          });

        if (input.dryRun) return { dryRun: true, assigned: 0, plan };
        for (const p of plan) await db.updateDimension("colors", p.colorId, { colorNo: p.colorNo });
        return { dryRun: false, assigned: plan.length, plan };
      }

      const [numbers, links] = await Promise.all([
        db.listSeriesColorNumbers(),
        db.listSeriesColors(),
      ]);
      const rows = numbers as SeriesColorNoRow[];
      // Seri kapsamı boşsa (hiç bağ yok) seri tüm renklere açıktır — kapsam
      // ekranındaki kuralın aynısı, bkz. `catalogPlan`.
      const scope = new Set(
        (links as { seriesId: number; colorId: number }[])
          .filter(l => l.seriesId === seriesId)
          .map(l => l.colorId),
      );
      const inSeries = scope.size > 0 ? colors.filter(c => scope.has(c.id)) : colors;
      const has = new Set(rows.filter(r => r.seriesId === seriesId).map(r => r.colorId));
      const used = rows.filter(r => r.seriesId === seriesId).map(r => r.colorNo);

      const plan = inSeries
        .filter(c => !has.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .map(c => {
          const no = nextColorNo(used);
          used.push(no);
          return { colorId: c.id, name: c.name, colorNo: no };
        });

      if (input.dryRun) return { dryRun: true, assigned: 0, plan };
      for (const p of plan) await db.setSeriesColorNumber(seriesId, p.colorId, p.colorNo);
      return { dryRun: false, assigned: plan.length, plan };
    }),

  /** Kullanımdaki boyut silinemez — küp koordinatını öksüz bırakırdı. */
  deleteDimension: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["colors", "families", "packagings", "useCases"]),
        id: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const used = await db.countDimensionUsage(input.kind, input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bu tanım ${used} kayıtta kullanılıyor — önce onları değiştirin. Silmek yerine "pasif" yapabilirsiniz.`,
        });
      }
      await db.deleteDimension(input.kind, input.id);
      return { ok: true };
    }),

  /* ---- Ambalaj çekimleri ------------------------------------------------- */

  /**
   * Ambalaj çekimlerinin listesi — görsel VERİSİ olmadan.
   *
   * İstemci hangi ambalajın hangi seride çekimi olduğunu bilmek istiyor,
   * görselin kendisini değil: karta çizilirken `/api/img/packaging/{id}`
   * adresinden geliyor. Böylece bu sorgu ambalaj sayısıyla değil, base64
   * yığınıyla büyümüyor.
   */
  packagingImages: protectedProcedure.query(() => db.listPackagingImageRefs()),

  savePackagingImage: protectedProcedure
    .input(
      z.object({
        packagingId: z.number().int().positive(),
        /** NULL = tüm seriler için varsayılan çekim. */
        seriesId: z.number().int().positive().nullable().optional(),
        data: packagingImageData,
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.savePackagingImage({
        packagingId: input.packagingId,
        seriesId: input.seriesId ?? null,
        data: input.data,
      });
      return { id };
    }),

  deletePackagingImage: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.deletePackagingImage(input.id);
      return { ok: true };
    }),

  seriesCompatibility: protectedProcedure
    .input(
      z.object({
        seriesId: z.number(),
        packagingIds: z.array(z.number()),
        familyIds: z.array(z.number()),
        /**
         * Bu seride üretilecek renkler. Verilmezse renk bağına dokunulmaz;
         * boş dizi bağı KALDIRIR (seri tüm renklere açılır).
         */
        colorIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await db.setSeriesPackagings(input.seriesId, input.packagingIds);
      await db.setSeriesFamilies(input.seriesId, input.familyIds);
      if (input.colorIds) await db.setSeriesColors(input.seriesId, input.colorIds);
      return { ok: true };
    }),

  /** Seri uyumluluk matrisi — hangi seride hangi renk/form/ambalaj üretiliyor. */
  seriesLinks: protectedProcedure.query(async () => {
    const [sp, sf, sc, fp] = await Promise.all([
      db.listSeriesPackagings(),
      db.listSeriesFamilies(),
      db.listSeriesColors(),
      db.listFamilyPackagings(),
    ]);
    return { packagings: sp, families: sf, colors: sc, familyPackagings: fp };
  }),

  /** Form × ambalaj uyumluluğu. */
  setFamilyPackagings: protectedProcedure
    .input(z.object({ familyId: z.number(), packagingIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.setFamilyPackagings(input.familyId, input.packagingIds);
      return { ok: true };
    }),

  /**
   * Hazırlık eksenini TEKRAR EDEN ambalajlar.
   *
   * "30 ml (ReadyToUse)" bir ambalaj değil, 30 ml ambalajın kullanıma hazır
   * halidir. Hazırlık zaten ayrı eksen; böyle bir satır listede kalırsa aynı
   * ürün iki kez üretilir ("30 ML + r2u" ve "30 ml (ReadyToUse) + r2u").
   */
  redundantPackagings: protectedProcedure.query(async () => {
    const rows = (await db.listPackagings()) as { id: number; name: string; isActive: number }[];
    return rows
      .filter(p => p.isActive !== 0 && looksLikeReadyToUse(p.name))
      .map(p => ({ id: p.id, name: p.name }));
  }),

  setPackagingActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.setPackagingActive(input.id, input.isActive);
      return { ok: true };
    }),

  /**
   * Katalog denetimi: bugünkü kurallara UYMAYAN master'lar.
   *
   * Uyumluluk kuralları sonradan sıkılaştı (form × ambalaj kısıtı, seri × renk
   * bağı, pasif boyut). Kural değişince önce üretilmiş master'lar yerinde
   * kalıyordu: "Sprey · 100 ml" gibi hiç var olmayan bir ürün katalogda
   * duruyor, listeyi ve raporları kirletiyordu.
   */
  auditMasters: protectedProcedure.query(async () => {
    const { total, plan, violations } = await runMasterAudit();
    return {
      total,
      invalid: violations.length,
      deletable: plan.deletable.length,
      archivable: plan.archivable.length,
      byReason: plan.byReason,
      sample: violations.slice(0, 30),
    };
  }),

  /**
   * Denetimde çıkan master'ları temizler.
   *
   * Geçmişi olan (ilanı ya da satışı bulunan) master SİLİNMEZ, arşivlenir:
   * silmek ciro raporunu ve pazaryeri eşleşmesini koparırdı. `dryRun` ile
   * ne olacağı önce görünür — 540 kaydın üstünde tek tıkla iş yapılmaz.
   */
  cleanupMasters: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const { total, plan, violations } = await runMasterAudit();
      const summary = {
        total,
        invalid: violations.length,
        byReason: plan.byReason,
        sample: violations.slice(0, 30),
      };
      if (input.dryRun) {
        return {
          dryRun: true,
          deleted: 0,
          archived: 0,
          willDelete: plan.deletable.length,
          willArchive: plan.archivable.length,
          ...summary,
        };
      }

      for (const v of plan.deletable) await db.deleteMasterProduct(v.masterId);
      for (const v of plan.archivable) {
        await db.updateMasterProduct(v.masterId, { status: "arsiv" });
      }
      return {
        dryRun: false,
        deleted: plan.deletable.length,
        archived: plan.archivable.length,
        willDelete: plan.deletable.length,
        willArchive: plan.archivable.length,
        ...summary,
      };
    }),

  /**
   * Form × ambalaj kuralını otomatik önerir ve isteğe bağlı uygular.
   *
   * Kural sistemde vardı ama TANIMSIZ form serinin BÜTÜN ambalajlarıyla
   * eşleştiği için sprey 30/100/250 ml de üretiyordu. Kuralın var olması
   * yetmiyor; kullanıcının onu gireceği anı sistemin söylemesi gerekiyor.
   */
  suggestFamilyPackagings: protectedProcedure
    .input(z.object({ apply: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const [families, packagings] = await Promise.all([
        db.listProductFamilies(),
        db.listPackagings(),
      ]);

      const suggestions = suggestFamilyPackagings({
        families: (families as { id: number; name: string }[]).map(f => ({
          id: f.id,
          name: f.name,
        })),
        packagings: (packagings as { id: number; name: string; volumeMl: string }[]).map(p => ({
          id: p.id,
          name: p.name,
          volumeMl: num(p.volumeMl),
        })),
      });

      const packagingName = new Map(
        (packagings as { id: number; name: string }[]).map(p => [p.id, p.name]),
      );
      const detailed = suggestions.map(s => ({
        ...s,
        packagingNames: s.packagingIds.map(id => packagingName.get(id) ?? `#${id}`),
      }));

      // Boş öneri kuralı silmek demek olurdu; o formu olduğu gibi bırak.
      const applicable = detailed.filter(s => s.packagingIds.length > 0);
      if (!input.apply) return { applied: false, suggestions: detailed };

      for (const s of applicable) {
        await db.setFamilyPackagings(s.familyId, s.packagingIds);
      }
      return { applied: true, count: applicable.length, suggestions: detailed };
    }),

  /**
   * Katalog yeniden yapılandırma — ürün tipi eksenini düzeltir.
   *
   * Katalog 300 varyanta şişmişti çünkü tek bir kavram (R2U) üç ayrı yerde
   * yaşıyordu: master'daki `readiness` bayrağı, "(ReadyToUse)" adlı ayrı bir
   * ambalaj kaydı, ve ürün tipinde hiç. Oysa R2U ürünün tipidir (farklı sıvı,
   * farklı reçete); buna karşılık "Airbrush" AYNI sıvıdır — o pazarlama
   * kimliği; rötuş de ayrı sıvı değil, kapağında fırça olan ayrı ambalajdır.
   *
   * Hedef model dışarıdan verilir; bu uç onu uygular. `dryRun` varsayılan
   * olarak açıktır: 165 kaydı arşivleyen bir işlem önizlemesiz çalışmamalı.
   */
  restructureCatalog: protectedProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(true),
        types: z
          .array(
            z.object({
              name: z.string().min(1),
              skuSegment: z.string().min(1).max(8),
              packagingNames: z.array(z.string().min(1)).default([]),
            }),
          )
          .min(1),
        /** Adında bunlardan biri geçen ambalaj pasife alınır. */
        retirePackagingPatterns: z.array(z.string()).default(["readytouse"]),
      }),
    )
    .mutation(async ({ input }) => {
      const [families, packagings, masters] = await Promise.all([
        db.listProductFamilies(),
        db.listPackagings(),
        db.listMasterProducts(),
      ]);

      const toPlanInput = () => ({
        families: (families as Record<string, unknown>[]).map(f => ({
          id: f.id as number,
          name: String(f.name ?? ""),
          isActive: Number(f.isActive ?? 1) === 1,
        })),
        packagings: (packagings as Record<string, unknown>[]).map(p => ({
          id: p.id as number,
          name: String(p.name ?? ""),
          isActive: Number(p.isActive ?? 1) === 1,
        })),
        masters: (masters as Record<string, unknown>[]).map(m => ({
          id: m.id as number,
          internalSku: String(m.internalSku ?? ""),
          familyId: m.familyId as number,
          packagingId: m.packagingId as number,
          readiness: (m.readiness as "konsantre" | "r2u") ?? "konsantre",
          status: (m.status as "taslak" | "aktif" | "arsiv") ?? "taslak",
        })),
        target: input.types,
        retirePackagingPatterns: input.retirePackagingPatterns,
      });

      const plan = planRestructure(toPlanInput());
      if (input.dryRun) return { dryRun: true as const, ...plan, applied: 0 };

      // 1) Eksik ürün tiplerini aç. Kod alanı zorunlu; addan türetilir.
      for (const f of plan.familiesToCreate) {
        await db.createDimension("families", {
          code: normalizeName(f.name).replace(/\s+/g, "-").slice(0, 32) || f.skuSegment,
          name: f.name,
          skuSegment: f.skuSegment,
        });
      }

      // 2) Hedefte olmayan tipleri pasife al — silmek geçmişi koparırdı.
      for (const f of plan.familiesToRetire) {
        await db.updateDimension("families", f.id, { isActive: 0 });
      }

      // 3) Mükerrer ambalajları pasife al.
      for (const p of plan.packagingsToRetire) {
        await db.updateDimension("packagings", p.id, { isActive: 0 });
      }

      // 4) Kuralı yaz. Yeni açılan tiplerin kimliği artık okunabilir.
      const freshFamilies = (await db.listProductFamilies()) as Record<string, unknown>[];
      const idByName = new Map(
        freshFamilies.map(f => [normalizeName(String(f.name ?? "")), f.id as number]),
      );
      const packById = new Map(
        (packagings as Record<string, unknown>[]).map(p => [p.id as number, p]),
      );
      let rulesWritten = 0;
      for (const rule of plan.rules) {
        const familyId = idByName.get(normalizeName(rule.familyName));
        if (familyId == null) continue;
        const ids = rule.packagingIds.filter(id => packById.has(id));
        await db.setFamilyPackagings(familyId, ids);
        rulesWritten++;
      }

      // 5) Uymayan master'ları ARŞİVLE (silme değil: geri alınabilir olmalı).
      for (const m of plan.mastersToArchive) {
        await db.updateMasterProduct(m.id, { status: "arsiv" });
      }

      await runCapacityRecompute();

      return {
        dryRun: false as const,
        ...plan,
        applied: plan.mastersToArchive.length,
        rulesWritten,
      };
    }),

  /* ---- Master üretimi --------------------------------------------------- */

  /**
   * Seyrek küpün kesişiminden master üretir. `dryRun` ile önce ne olacağını
   * gösterir — 24.300 kayıt açma kazasının önündeki asıl koruma budur.
   */
  generateMasters: protectedProcedure
    .input(
      z.object({
        seriesIds: z.array(z.number()).default([]),
        readiness: z.array(z.enum(["konsantre", "r2u"])).default(["konsantre"]),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(5000).default(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const [series, colors, families, packagings, sp, sf, sc, fp, existing] = await Promise.all([
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
        db.listSeriesPackagings(),
        db.listSeriesFamilies(),
        db.listSeriesColors(),
        db.listFamilyPackagings(),
        db.listMasterProducts(),
      ]);

      // Form × ambalaj kısıtı — "Airbrush · SPREY 400ML" burada elenir.
      const fpMap = new Map<number, Set<number>>();
      for (const r of fp as { familyId: number; packagingId: number }[]) {
        const set = fpMap.get(r.familyId) ?? new Set<number>();
        set.add(r.packagingId);
        fpMap.set(r.familyId, set);
      }

      const packBySeries = new Map<number, number[]>();
      for (const r of sp as { seriesId: number; packagingId: number }[]) {
        packBySeries.set(r.seriesId, [...(packBySeries.get(r.seriesId) ?? []), r.packagingId]);
      }
      const famBySeries = new Map<number, number[]>();
      for (const r of sf as { seriesId: number; familyId: number }[]) {
        famBySeries.set(r.seriesId, [...(famBySeries.get(r.seriesId) ?? []), r.familyId]);
      }
      const colorBySeries = new Map<number, number[]>();
      for (const r of sc as { seriesId: number; colorId: number }[]) {
        colorBySeries.set(r.seriesId, [...(colorBySeries.get(r.seriesId) ?? []), r.colorId]);
      }

      // Pasife alınan boyut ÜRETİME GİRMEZ. Eskiden `isActive` hiç
      // okunmuyordu: "pasife al" düğmesi satırı işaretliyor ama master
      // üretimi onu yine kullanıyordu.
      const inactivePack = new Set(
        (packagings as { id: number; isActive: number }[]).filter(p => p.isActive === 0).map(p => p.id),
      );
      const inactiveFam = new Set(
        (families as { id: number; isActive: number }[]).filter(f => f.isActive === 0).map(f => f.id),
      );
      const inactiveColor = new Set(
        (colors as { id: number; isActive: number }[]).filter(c => c.isActive === 0).map(c => c.id),
      );

      const planSeries = (series as { id: number; name: string; prefix: string | null }[])
        .map(s => ({
          id: s.id,
          name: s.name,
          prefix: s.prefix,
          packagingIds: (packBySeries.get(s.id) ?? []).filter(id => !inactivePack.has(id)),
          familyIds: (famBySeries.get(s.id) ?? []).filter(id => !inactiveFam.has(id)),
          colorIds: (colorBySeries.get(s.id) ?? []).filter(id => !inactiveColor.has(id)),
          readiness: input.readiness as Readiness[],
        }))
        .filter(s => s.packagingIds.length > 0 && s.familyIds.length > 0);

      if (planSeries.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hiçbir serinin ambalaj/form uyumluluğu tanımlı değil. Önce 'Boyutları Tohumla' çalıştırın.",
        });
      }

      const plan = planMasters({
        series: planSeries,
        colors: (colors as {
          id: number;
          code: string;
          name: string;
          seriesId: number | null;
          isActive: number;
        }[])
          .filter(c => c.isActive !== 0)
          .map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          seriesId: c.seriesId,
        })),
        families: families as never,
        packagings: (packagings as { id: number; code: string; name: string; skuSegment: string | null; volumeMl: string }[]).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          skuSegment: p.skuSegment,
          volumeMl: num(p.volumeMl),
        })),
        existingKeys: new Set(
          (existing as Record<string, unknown>[]).map(m =>
            cubeKey({
              seriesId: m.seriesId as number,
              colorId: m.colorId as number,
              familyId: m.familyId as number,
              packagingId: m.packagingId as number,
              readiness: m.readiness as Readiness,
            }),
          ),
        ),
        familyPackagings: fpMap,
        existingSkus: new Set(
          (existing as Record<string, unknown>[]).map(m => String(m.internalSku ?? "")),
        ),
        onlySeriesIds: input.seriesIds,
      });

      // Çakışma ARTIK ÜRETİMİ DURDURMAZ: kod otomatik ayrıştırılır. Eskiden
      // burada hata atılıyordu ve kullanıcı çıkmaza giriyordu — iki ambalajın
      // hacmi aynıysa (30 ML PET / 30 ML CAM) SKU eki de aynı oluyordu ve
      // elle düzeltmekten başka yol yoktu. Yine de bildirilir ki ekler
      // iyileştirilebilsin.
      const conflictNote =
        plan.conflicts.length > 0
          ? `${plan.conflicts.length} kod çakışması otomatik ayrıştırıldı (${plan.conflicts
              .slice(0, 3)
              .map(c => c.internalSku)
              .join(", ")}). Tanımlar'dan SKU eklerini netleştirebilirsiniz.`
          : null;

      if (input.dryRun) {
        /*
         * Önizleme okunabilir olmalı. Önce yalnız 20 iç SKU dönüyordu
         * (`aoccndyesilab30`); o diziden "Sprey · 30 ml" çiftinin saçma
         * olduğunu görmek imkânsızdı. Kullanıcı onaylıyor, sonra katalogda
         * varyantların çoğunun çöp olduğunu fark ediyordu.
         */
        const preview = previewPairs({
          families: (families as { id: number; name: string }[]).map(f => ({
            id: f.id,
            name: f.name,
          })),
          packagings: (packagings as { id: number; name: string; volumeMl: string }[]).map(p => ({
            id: p.id,
            name: p.name,
            volumeMl: num(p.volumeMl),
          })),
          familyPackagings: fpMap,
        });

        return {
          dryRun: true,
          willCreate: plan.create.length,
          alreadyExists: plan.existing.length,
          sample: plan.create.slice(0, 20).map(m => m.internalSku),
          created: 0,
          conflictNote,
          breakdown: plan.breakdown,
          /** Üretilecek form × ambalaj çiftleri — okunabilir adlarla. */
          pairs: preview.pairs,
          /** Gözle bakınca yanlış görünen çiftler; üretim engellenmez, uyarılır. */
          suspects: preview.suspects,
          /** Kuralı hiç girilmemiş formlar — "hepsi" ile eşleşiyorlar. */
          unconstrainedFamilies: preview.unconstrainedFamilies,
        };
      }

      if (plan.create.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${plan.create.length} master çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      let created = 0;
      for (const m of plan.create) {
        await db.createMasterProduct({
          seriesId: m.seriesId,
          colorId: m.colorId,
          familyId: m.familyId,
          packagingId: m.packagingId,
          readiness: m.readiness,
          baseCode: m.baseCode,
          internalSku: m.internalSku,
          formulaScale: String(m.formulaScale),
          status: "taslak",
        });
        created++;
      }
      return {
        dryRun: false,
        willCreate: plan.create.length,
        alreadyExists: plan.existing.length,
        created,
        sample: [],
        conflictNote,
        breakdown: plan.breakdown,
      };
    }),

  masters: protectedProcedure.query(() => db.listMasterProducts()),

  /* ---- İlan üretimi ----------------------------------------------------- */

  /**
   * Master × kullanım alanı matrisinden ilan üretir. Kimlik
   * (masterId, useCaseId) olduğu için ikinci çalıştırma mükerrer açmaz —
   * eski varyant üreticisinin sil-ve-yeniden-aç yaklaşımı tam da bu yüzden
   * pazaryeri bağlarını koparıyordu.
   */
  generateListings: protectedProcedure
    .input(
      z.object({
        masterIds: z.array(z.number()).default([]),
        useCaseIds: z.array(z.number()).default([]),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, series, colors, families, packagings, useCases, existing] = await Promise.all([
        db.listMasterProducts(),
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
        db.listUseCases(),
        db.listListings(),
      ]);

      const generic = (useCases as { id: number; code: string }[]).find(
        u => u.code === GENERIC_USE_CASE_CODE,
      );
      if (!generic) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "'Genel' kullanım alanı yok — önce 'Boyutları Tohumla' çalıştırın.",
        });
      }

      const nameById = <T extends { id: number; name: string }>(rows: unknown) =>
        new Map((rows as T[]).map(r => [r.id, r.name]));
      const seriesName = nameById(series);
      const colorName = nameById(colors);
      const familyName = nameById(families);
      const packagingName = nameById(packagings);

      const wanted = input.masterIds.length ? new Set(input.masterIds) : null;
      const contexts = (masters as Record<string, unknown>[])
        .filter(m => !wanted || wanted.has(m.id as number))
        .map(m => ({
          masterId: m.id as number,
          seriesName: seriesName.get(m.seriesId as number) ?? null,
          colorName: colorName.get(m.colorId as number) ?? null,
          familyName: familyName.get(m.familyId as number) ?? null,
          packagingName: packagingName.get(m.packagingId as number) ?? null,
        }));

      const chosenUseCases = (useCases as { id: number; code: string; name: string; titlePattern: string | null }[])
        .filter(u => u.id === generic.id || !input.useCaseIds.length || input.useCaseIds.includes(u.id));

      const plan = planListings({
        masters: contexts,
        useCases: chosenUseCases,
        genericUseCaseId: generic.id,
        existingKeys: new Set(
          (existing as { masterId: number; useCaseId: number }[]).map(l => `${l.masterId}:${l.useCaseId}`),
        ),
      });

      if (input.dryRun) {
        return {
          dryRun: true,
          willCreate: plan.create.length,
          willUpdate: plan.update.length,
          created: 0,
          sample: plan.create.slice(0, 20).map(l => l.title),
        };
      }

      // İçerik: blok → seri şablonu zinciriyle çözülür ve ilanın kendi
      // koordinatıyla kişiselleştirilir. Eskiden buraya yalnız başlık ve slug
      // yazılıyordu; ilanlar boş gövdeyle açılıyordu.
      const blocks = (await db.listContentBlocks()) as unknown as ContentBlockLike[];
      const masterById = new Map(masters.map(m => [m.id as number, m]));
      const seriesById = new Map(
        (series as Record<string, unknown>[]).map(s => [s.id as number, s]),
      );
      const colorNameById = nameById(colors);
      const familyNameById = nameById(families);
      const packagingNameById = nameById(packagings);
      const useCaseNameById = nameById(useCases);

      let created = 0;
      let withContent = 0;
      for (const l of plan.create) {
        const m = masterById.get(l.masterId);
        const s = m ? seriesById.get(m.seriesId as number) : undefined;
        const vars = {
          marka: "Artofcolour",
          seri: s ? String(s.name ?? "") : null,
          renk: m ? (colorNameById.get(m.colorId as number) ?? null) : null,
          form: m ? (familyNameById.get(m.familyId as number) ?? null) : null,
          ambalaj: m ? (packagingNameById.get(m.packagingId as number) ?? null) : null,
          kullanim: l.isPrimary ? null : (useCaseNameById.get(l.useCaseId) ?? null),
        };
        const content = resolveListingContent({
          block: m
            ? pickBlock(blocks, {
                seriesId: m.seriesId as number,
                useCaseId: l.useCaseId,
                familyId: m.familyId as number,
              })
            : null,
          series: s
            ? {
                shortDescription: (s.shortDescription as string | null) ?? null,
                longDescription: (s.longDescription as string | null) ?? null,
                applicationText: (s.applicationText as string | null) ?? null,
                labelTemplate: (s.labelTemplate as string | null) ?? null,
              }
            : null,
          vars,
        });
        if (content.source !== "yok") withContent++;

        await db.createListing({
          masterId: l.masterId,
          useCaseId: l.useCaseId,
          title: l.title,
          slug: l.slug,
          isPrimary: l.isPrimary ? 1 : 0,
          shortDescription: content.shortDescription,
          longDescription: content.longDescription,
          applicationText: content.applicationText,
          status: "taslak",
        });
        created++;
      }
      return {
        dryRun: false,
        willCreate: plan.create.length,
        willUpdate: plan.update.length,
        created,
        withContent,
        sample: [],
      };
    }),

  /* ---- İçerik blokları --------------------------------------------------- */

  contentBlocks: protectedProcedure.query(async () => {
    const [blocks, series, useCases, families] = await Promise.all([
      db.listContentBlocks(),
      db.listProductSeries(),
      db.listUseCases(),
      db.listProductFamilies(),
    ]);
    const sName = new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name]));
    const uName = new Map((useCases as { id: number; name: string }[]).map(u => [u.id, u.name]));
    const fName = new Map((families as { id: number; name: string }[]).map(f => [f.id, f.name]));
    return (blocks as Record<string, unknown>[]).map(b => ({
      id: b.id as number,
      seriesId: b.seriesId as number,
      useCaseId: b.useCaseId as number,
      familyId: (b.familyId as number | null) ?? null,
      seriesName: sName.get(b.seriesId as number) ?? "?",
      useCaseName: uName.get(b.useCaseId as number) ?? "?",
      familyName: b.familyId != null ? (fName.get(b.familyId as number) ?? "?") : null,
      shortDescription: (b.shortDescription as string | null) ?? null,
      longDescription: (b.longDescription as string | null) ?? null,
      applicationText: (b.applicationText as string | null) ?? null,
      labelText: (b.labelText as string | null) ?? null,
      titlePattern: (b.titlePattern as string | null) ?? null,
      source: b.source as string,
      generatedAt: b.generatedAt as Date | null,
    }));
  }),

  /**
   * İçerik bloklarını üretir. AI seri × kullanım alanı başına BİR KEZ çağrılır;
   * metin renk/ambalajdan bağımsız yazdırılıp değişkenle kişiselleştirilir.
   * Böylece 63 çağrı binlerce ilanı doldurur — eski akış varyant başına
   * çağırdığı için 85 varyantta timeout'a giriyordu.
   */
  generateContentBlocks: protectedProcedure
    .input(
      z.object({
        seriesIds: z.array(z.number()).default([]),
        regenerate: z.boolean().default(false),
        perFamily: z.boolean().default(false),
        useAi: z.boolean().default(true),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(80),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, blocks, listings, series, useCases, families, sp] = await Promise.all([
        db.listMasterProducts(),
        db.listContentBlocks(),
        db.listListings(),
        db.listProductSeries(),
        db.listUseCases(),
        db.listProductFamilies(),
        db.listSeriesPackagings(),
      ]);

      // Hangi master hangi kullanım alanlarında ilanlanmış — blok yalnız
      // gerçekten kullanılan kombinasyonlar için üretilir, boşa AI çağrılmaz.
      const useCasesByMaster = new Map<number, Set<number>>();
      for (const l of listings as { masterId: number; useCaseId: number }[]) {
        const set = useCasesByMaster.get(l.masterId) ?? new Set<number>();
        set.add(l.useCaseId);
        useCasesByMaster.set(l.masterId, set);
      }
      const allUseCaseIds = (useCases as { id: number }[]).map(u => u.id);
      const wantedSeries = input.seriesIds.length ? new Set(input.seriesIds) : null;

      const planInput = (masters as Record<string, unknown>[])
        .filter(m => !wantedSeries || wantedSeries.has(m.seriesId as number))
        .map(m => ({
          seriesId: m.seriesId as number,
          familyId: m.familyId as number,
          // İlan açılmamışsa tüm kullanım alanları aday sayılır — içerik önce
          // hazırlanıp sonra ilan üretmek doğru sıra.
          useCaseIds: Array.from(useCasesByMaster.get(m.id as number) ?? new Set(allUseCaseIds)),
        }));

      const todo = planContentBlocks({
        masters: planInput,
        existing: blocks as unknown as ContentBlockLike[],
        regenerate: input.regenerate,
        perFamily: input.perFamily,
      });

      if (input.dryRun) {
        return { dryRun: true, willGenerate: todo.length, generated: 0, aiFailed: 0 };
      }
      if (todo.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${todo.length} blok çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      const sById = new Map((series as Record<string, unknown>[]).map(s => [s.id as number, s]));
      const uById = new Map((useCases as { id: number; name: string }[]).map(u => [u.id, u]));
      const fById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));
      const packBySeries = new Map<number, number[]>();
      for (const r of sp as { seriesId: number; packagingId: number }[]) {
        packBySeries.set(r.seriesId, [...(packBySeries.get(r.seriesId) ?? []), r.packagingId]);
      }

      let generated = 0;
      let aiFailed = 0;
      for (const t of todo) {
        const s = sById.get(t.seriesId);
        const u = uById.get(t.useCaseId);
        if (!s || !u) continue;
        const ctx = {
          seriesName: String(s.name ?? ""),
          seriesNotes: (s.notes as string | null) ?? null,
          useCaseName: u.name,
          familyName: t.familyId != null ? (fById.get(t.familyId)?.name ?? null) : null,
          surfaces: parseStringArray(s.applicationSurfaces),
          // Serinin kendi metinleri jenerik şablonu yener — kullanıcı Seriler
          // ekranında bunları giriyor, blok üretimi eskiden hiç bakmıyordu.
          seriesContent: {
            shortDescription: (s.shortDescription as string | null) ?? null,
            longDescription: (s.longDescription as string | null) ?? null,
            applicationText: (s.applicationText as string | null) ?? null,
            guideTemplate: (s.guideTemplate as string | null) ?? null,
            labelTemplate: (s.labelTemplate as string | null) ?? null,
          },
        };

        // AI başarısız olursa şablona düşülür — hiçbir ilan boş kalmasın.
        const ai = input.useAi ? await generateContentBlock(ctx) : null;
        if (input.useAi && !ai) aiFailed++;
        const content = ai ?? templateContentBlock(ctx);

        await db.upsertContentBlock(t, {
          ...content,
          source: ai ? "ai" : "sablon",
          generatedAt: new Date(),
        });
        generated++;
      }
      return { dryRun: false, willGenerate: todo.length, generated, aiFailed };
    }),

  saveContentBlock: protectedProcedure
    .input(
      z.object({
        seriesId: z.number(),
        useCaseId: z.number(),
        familyId: z.number().nullable().optional(),
        titlePattern: z.string().nullable().optional(),
        shortDescription: z.string().nullable().optional(),
        longDescription: z.string().nullable().optional(),
        applicationText: z.string().nullable().optional(),
        labelText: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { seriesId, useCaseId, familyId, ...content } = input;
      const id = await db.upsertContentBlock(
        { seriesId, useCaseId, familyId: familyId ?? null },
        { ...content, source: "elle" },
      );
      return { id };
    }),

  listings: protectedProcedure.query(() => db.listListings()),

  /* ---- Kanal yayını ----------------------------------------------------- */

  channelListings: protectedProcedure.query(() => db.listChannelListings()),

  /** Kullanım alanı × kanal → pazaryeri kategorisi. Toplu yayının ön koşulu. */
  channelCategories: protectedProcedure.query(() => db.listUseCaseChannelCategories()),

  /**
   * Pazaryeri kategori ağacı — arama ve otomatik öneri için.
   *
   * Kategori kimliğini panelden elle bulup kopyalamak, kullanım alanı × kanal
   * başına ayrı ayrı yapılan bir işti. Ağaç API'den çekilip yaprak listesine
   * düzleştirilir; arama ve öneri saf modülde yapılır.
   *
   * Ağaç büyük (binlerce satır) ve seyrek değişir; bellekte tutulur.
   */
  channelCategoryTree: protectedProcedure
    .input(z.object({ channelId: z.number(), query: z.string().default("") }))
    .query(async ({ input }) => {
      const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
      const channel = channels.find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const flat = await loadChannelCategories(channel.code);
      return {
        channelCode: channel.code,
        total: flat.length,
        results: searchCategories(flat, input.query, 40),
      };
    }),

  /**
   * Eşlenmemiş kullanım alanları için kategori önerisi.
   *
   * Öneri KESİN DEĞİLDİR ve otomatik yazılmaz — kullanıcı onaylar. Yanlış
   * kategori kartın reddedilmesine ya da yanlış vitrinde görünmesine yol
   * açar; puan ekranda gösterilir ki güven seviyesi görünsün.
   */
  suggestChannelCategories: protectedProcedure
    .input(z.object({ channelId: z.number(), onlyUnmapped: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const [channels, useCases, mapped, series] = await Promise.all([
        db.listSalesChannels(),
        db.listUseCases(),
        db.listUseCaseChannelCategories(),
        db.listProductSeries(),
      ]);
      const channel = (channels as { id: number; code: string }[]).find(
        c => c.id === input.channelId,
      );
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const already = new Set(
        (mapped as { useCaseId: number; channelId: number }[])
          .filter(m => m.channelId === input.channelId)
          .map(m => m.useCaseId),
      );
      const targets = (useCases as { id: number; name: string }[]).filter(
        u => !input.onlyUnmapped || !already.has(u.id),
      );
      if (targets.length === 0) return { channelCode: channel.code, rows: [] };

      const flat = await loadChannelCategories(channel.code);
      // Seri adları ek ipucu: "CANDY", "SPREY" gibi terimler kategori
      // adlarında geçebiliyor.
      const extraTerms = (series as { name: string }[]).map(x => x.name).slice(0, 12);

      return {
        channelCode: channel.code,
        rows: suggestForUseCases({ useCases: targets, categories: flat, extraTerms }),
      };
    }),


  setChannelCategory: protectedProcedure
    .input(
      z.object({
        useCaseId: z.number(),
        channelId: z.number(),
        categoryId: z.string().min(1),
        categoryName: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.setUseCaseChannelCategory(
        input.useCaseId,
        input.channelId,
        input.categoryId.trim(),
        input.categoryName ?? null,
      );
      return { id };
    }),

  /**
   * Toplu kanal yayını. Tek tek açmak 500 master × 3 ilan × 2 kanal = 3.000
   * tıklama demekti.
   *
   * Kodlar burada bir kez üretilip saklanır; gönderimde yeniden hesaplanmaz.
   * Mükerrer ilan kilidi (master × kanal × kategori) plan aşamasında önden
   * yakalanır ki toplu işlem ortasında veritabanı hatasına düşmesin.
   */
  bulkPublish: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        seriesIds: z.array(z.number()).default([]),
        includeUnbuildable: z.boolean().default(false),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(3000).default(1000),
      }),
    )
    .mutation(async ({ input }) => {
      const [listings, masters, existing, categories, channels] = await Promise.all([
        db.listListings(),
        db.listMasterProducts(),
        db.listChannelListings(),
        db.listUseCaseChannelCategories(),
        db.listSalesChannels(),
      ]);
      const channel = (channels as { id: number; code: string }[]).find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const wantedSeries = input.seriesIds.length ? new Set(input.seriesIds) : null;
      const masterRows = (masters as Record<string, unknown>[]).filter(
        m => !wantedSeries || wantedSeries.has(m.seriesId as number),
      );
      const allowedMasters = new Set(masterRows.map(m => m.id as number));

      const plan = planPublications({
        listings: (listings as Record<string, unknown>[])
          .filter(l => allowedMasters.has(l.masterId as number))
          .map(l => ({
            id: l.id as number,
            masterId: l.masterId as number,
            useCaseId: l.useCaseId as number,
            status: l.status as "taslak" | "aktif" | "arsiv",
            // Boş gövdeli ilan pazaryerine gönderilemez.
            hasContent: !!(
              (l.shortDescription as string | null)?.trim() ||
              (l.longDescription as string | null)?.trim()
            ),
          })),
        masters: masterRows.map(m => ({
          id: m.id as number,
          status: m.status as "taslak" | "aktif" | "arsiv",
          basePrice: num(m.basePrice),
          buildableQty: Number(m.buildableQty ?? 0),
        })),
        existing: (existing as Record<string, unknown>[]).map(e => ({
          listingId: e.listingId as number,
          masterId: e.masterId as number,
          channelId: e.channelId as number,
          channelCategoryId: (e.channelCategoryId as string | null) ?? null,
        })),
        channelId: input.channelId,
        categoryOf: new Map(
          (categories as { useCaseId: number; channelId: number; categoryId: string }[])
            .filter(c => c.channelId === input.channelId)
            .map(c => [c.useCaseId, c.categoryId]),
        ),
        includeUnbuildable: input.includeUnbuildable,
      });

      if (input.dryRun) {
        return {
          dryRun: true,
          willPublish: plan.create.length,
          published: 0,
          skipped: summarizeSkips(plan.skip),
        };
      }
      if (plan.create.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${plan.create.length} yayın çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      let seq = await db.nextChannelSequence();
      let published = 0;
      for (const c of plan.create) {
        await db.createChannelListing({
          listingId: c.listingId,
          masterId: c.masterId,
          channelId: c.channelId,
          channelSku: buildChannelSku(channel.code, seq),
          channelBarcode: buildChannelBarcode(seq),
          channelCategoryId: c.channelCategoryId,
          price: String(c.price),
          syncState: "kirli",
          status: "taslak",
        });
        seq++;
        published++;
      }
      return {
        dryRun: false,
        willPublish: plan.create.length,
        published,
        skipped: summarizeSkips(plan.skip),
      };
    }),

  /* ---- Kapasite --------------------------------------------------------- */

  /**
   * Üretilebilir adedi hesaplar, master'lara yazar ve miktarı değişen
   * yayınları kirli işaretler. Kirli satırları işçi toplu gönderir.
   */
  recomputeCapacity: protectedProcedure
    .input(z.object({ persist: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);

      const capById = new Map(
        data.rawMasters.map(m => [m.id as number, Number(m.virtualStockCap ?? 10)]),
      );
      const prevById = new Map(data.rawMasters.map(m => [m.id as number, Number(m.buildableQty ?? 0)]));

      // Yalnız ilana yazılacak SAYI değişenler kirlenir: tavan sayesinde
      // kapasite 600'den 40'a düşse bile ilan 10'da kalır, gönderim gerekmez.
      const dirtyMasters = report.masters
        .filter(m => {
          const cap = capById.get(m.masterId) ?? 10;
          return listingQty(m.buildable, cap) !== listingQty(prevById.get(m.masterId) ?? 0, cap);
        })
        .map(m => m.masterId);

      let written = 0;
      let dirtied = 0;
      if (input.persist) {
        written = await db.writeBuildableQty(
          report.masters.map(m => ({ masterId: m.masterId, buildable: m.buildable })),
        );
        dirtied = await db.markChannelListingsDirty(dirtyMasters);
      }

      return {
        masters: report.masters.length,
        written,
        dirtied,
        cycles: report.cycles,
        zeroed: report.masters.filter(m => m.buildable <= 0).length,
        bottlenecks: bottleneckReport(report).slice(0, 20),
      };
    }),

  /** Darboğaz raporu — hangi kalemi almazsan kaç ürünün önü tıkalı. */
  bottlenecks: protectedProcedure.query(async () => {
    const data = await loadCapacityInputs();
    const report = computeCapacity(data);
    const unitCost = new Map(
      data.rawMaterials.map(m => [m.id as number, num(m.unitCost)]),
    );
    return bottleneckReport(report).map(r => ({
      ...r,
      unitCost: unitCost.get(r.materialId) ?? 0,
    }));
  }),

  formulas: protectedProcedure.query(async () => {
    const [formulas, inputs, masters, scopeRows, materials] = await Promise.all([
      db.listFormulas(),
      db.listFormulaInputs(),
      db.listMasterProducts(),
      db.listFormulaScopes(),
      db.listMaterials(),
    ]);
    const scopeMap = buildScopeMap(scopeRows as never);
    type InputRow = {
      id: number;
      formulaId: number;
      inputMaterialId: number;
      qtyPerBase: string;
      unit: string | null;
    };
    const byFormula = new Map<number, InputRow[]>();
    for (const i of inputs as InputRow[]) {
      byFormula.set(i.formulaId, [...(byFormula.get(i.formulaId) ?? []), i]);
    }

    /*
     * Reçete maliyeti SUNUCUDA hesaplanır.
     *
     * Önce istemcide `miktar × birimFiyat` olarak hesaplanıyordu; birim
     * dönüşümü olmadığı için kg fiyatlı kaleme gram miktarı girildiğinde
     * rozet 1000 kat şişik çıkıyordu. Hesabın maliyet motoruyla aynı yerden
     * gelmesi, iki ekranın aynı ürüne iki farklı maliyet yazmasını önler.
     */
    const costMaterials = (materials as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      name: String(m.name ?? ""),
      type: (m.type as CostMaterial["type"]) ?? "hammadde",
      unitCost: (m.unitCost as string | null) ?? null,
      unit: (m.unit as string | null) ?? null,
    }));
    const materialById = new Map(costMaterials.map(m => [m.id, m]));
    const capacityFormulas = formulas.map(f => ({
      id: f.id,
      outputType: f.outputType as "yari_mamul" | "mamul",
      outputMaterialId: f.outputMaterialId,
      baseQty: f.baseQty,
      baseUnit: f.baseUnit,
      wastePercent: f.wastePercent,
      inputs: (byFormula.get(f.id) ?? []).map(i => ({
        inputMaterialId: i.inputMaterialId,
        qtyPerBase: num(i.qtyPerBase),
        unit: i.unit,
      })),
    }));
    const resolvedUnitCost = resolveUnitCosts(costMaterials, capacityFormulas);

    /** Bir baz partinin hammadde maliyeti + çevrilemeyen birimler. */
    const batchCostOf = (formulaId: number, wastePercent: unknown) => {
      const yieldRatio = 1 - Math.min(Math.max(num(wastePercent), 0), 99) / 100;
      const mismatches: string[] = [];
      let total = 0;
      for (const row of byFormula.get(formulaId) ?? []) {
        const mat = materialById.get(row.inputMaterialId);
        if (mat?.type === "masraf") continue;
        const conv = qtyInMaterialUnit(num(row.qtyPerBase), row.unit, mat?.unit);
        if (conv.mismatch && mat) mismatches.push(mat.name);
        total += conv.qty * (resolvedUnitCost.get(row.inputMaterialId) ?? 0);
      }
      if (yieldRatio > 0) total /= yieldRatio;
      return { batchCost: Math.round(total * 10000) / 10000, mismatches };
    };
    const usage = new Map<number, number>();
    for (const m of masters as { formulaId: number | null }[]) {
      if (m.formulaId != null) usage.set(m.formulaId, (usage.get(m.formulaId) ?? 0) + 1);
    }
    return formulas.map(f => {
      const { batchCost, mismatches } = batchCostOf(f.id, f.wastePercent);
      const base = num(f.baseQty);
      return {
        id: f.id,
        name: f.name,
        outputType: f.outputType,
        outputMaterialId: f.outputMaterialId,
        seriesId: f.seriesId,
        colorId: f.colorId,
        familyId: f.familyId,
        readiness: f.readiness,
        baseQty: f.baseQty,
        baseUnit: f.baseUnit,
        wastePercent: f.wastePercent,
        notes: f.notes,
        // Çoklu kapsam: boş eksen "hepsi" demektir.
        seriesIds: scopeMap.get(f.id)?.seri ?? [],
        colorIds: scopeMap.get(f.id)?.renk ?? [],
        familyIds: scopeMap.get(f.id)?.form ?? [],
        readinessList: scopeMap.get(f.id)?.hazirlik ?? [],
        inputs: byFormula.get(f.id) ?? [],
        masterCount: usage.get(f.id) ?? 0,
        /** Bir baz partinin hammadde maliyeti (fire dahil). */
        batchCost,
        /** Baz birim başına maliyet — ambalaj hacmiyle çarpılınca ürün maliyeti. */
        costPerBaseUnit: base > 0 ? Math.round((batchCost / base) * 10000) / 10000 : 0,
        /** Birimi çevrilemeyen satırların kalemleri — sayı güvenilmez. */
        unitMismatches: mismatches,
      };
    });
  }),

  /**
   * Ambalaj maliyeti — şişe + kapak + etiket + koli.
   *
   * `packagingInputs` tablosu baştan beri vardı ve kapasite/maliyet motorları
   * onu okuyordu, ama veriyi girecek hiçbir ekran yazılmamıştı. Bu yüzden
   * 30 ml şişe ile 400 ml sprey kutusunun farklı maliyeti sisteme
   * girilemiyordu; ambalaj maliyeti fiilen sıfır sayılıyordu.
   *
   * Ambalaj kalemleri hacimle ÖLÇEKLENMEZ: 400 ml kutu, 30 ml şişenin 13
   * katı değildir. Bu yüzden reçetede değil, ambalaj tanımında dururlar.
   */
  /**
   * Satış modunu değiştirir — ilan miktarının hangi kuraldan çıkacağını belirler.
   *
   * Tek kural bütün katalogda çalışmıyor: çok satanlar rafta hazır durur,
   * geri kalanı sipariş gelince üretilir, bazıları hammadde stokta olmasa
   * bile termin sözüyle satılır. Miktar yalnız kapasiteden türeyince
   * reçetesi bağlanmamış her ürün ilanda 0 yazıp satışa kapanıyordu.
   */
  setSalesMode: protectedProcedure
    .input(
      z.object({
        masterIds: z.array(z.number()).min(1),
        salesMode: z.enum(["siparis_uzerine", "stoktan", "tedarikli"]),
        /** `tedarikli` modda vaat edilen termin; diğer modlarda yok sayılır. */
        leadTimeDays: z.number().int().min(0).max(365).optional(),
        /** `stoktan` modda raftaki mamul adedi. */
        stockQty: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const patch: Record<string, unknown> = {
        salesMode: input.salesMode,
        leadTimeDays: input.salesMode === "tedarikli" ? (input.leadTimeDays ?? 0) : 0,
      };
      if (input.salesMode === "stoktan" && input.stockQty != null) {
        patch.stockQty = input.stockQty;
      }
      for (const id of input.masterIds) {
        await db.updateMasterProduct(id, patch as never);
      }
      // İlan miktarı moda bağlı; kanal gönderimi için yeniden hesapla.
      await runCapacityRecompute();
      return { updated: input.masterIds.length, salesMode: input.salesMode };
    }),

  /**
   * Raftaki mamul adedini elle yazar.
   *
   * Stok bugüne kadar yalnız `setSalesMode` üzerinden ve yalnız satış modu
   * `stoktan` iken girilebiliyordu; yani sayıyı düzeltmek için önce ürünün
   * satış kuralını değiştirmek gerekiyordu. İkisi ayrı karar: kaç tane var
   * sorusunun cevabı, ilan miktarının hangi kuraldan çıkacağından bağımsız.
   * Hammadde defteri tamamlanana kadar katalogdaki tek güvenilir adet budur.
   */
  setStock: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        stockQty: z.number().int().min(0).max(1000000),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateMasterProduct(input.masterId, { stockQty: input.stockQty } as never);
      // İlan miktarı stoktan türeyebilir — kanal gönderimi tazelensin.
      await runCapacityRecompute();
      return { ok: true };
    }),

  /**
   * Ürünün satış adını yazar ya da temizler.
   *
   * Boşaltmak geçerli bir işlem: ad silinince `displayNameOf` koordinattan
   * türetilene döner, ürün adsız kalmaz.
   */
  setName: protectedProcedure
    .input(z.object({ masterId: z.number(), name: z.string().trim().max(255) }))
    .mutation(async ({ input }) => {
      await db.updateMasterProduct(input.masterId, { name: input.name || null } as never);
      return { ok: true };
    }),

  /**
   * Boş satış adlarını koordinattan üretip yazar.
   *
   * 88 ürünün adını tek tek yazmak yapılmayacak bir iştir; adsız kalınca da
   * katalog kod dökümü gibi görünür. Üretim `salesNameOf` ile TEK yerden
   * yapılır — kartta gördüğünüz öneriyle yazılan ad birebir aynıdır.
   *
   * Varsayılan yalnız BOŞ olanları doldurur: elle yazılmış adı ezmek,
   * kullanıcının emeğini sessizce silmek olurdu. `overwrite` açıkça istenir.
   */
  generateNames: protectedProcedure
    .input(
      z.object({
        overwrite: z.boolean().default(false),
        dryRun: z.boolean().default(true),
        seriesIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, series, colors, families, packagings] = await Promise.all([
        db.listMasterProducts(),
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
      ]);
      const seriesById = new Map(
        (series as { id: number; name: string; nameEn: string | null }[]).map(s => [s.id, s]),
      );
      const colorById = new Map(
        (colors as { id: number; name: string; nameEn: string | null }[]).map(c => [c.id, c]),
      );
      const familyById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));
      const packagingById = new Map(
        (packagings as { id: number; name: string }[]).map(p => [p.id, p]),
      );

      const wanted = input.seriesIds?.length ? new Set(input.seriesIds) : null;
      const changes: { masterId: number; sku: string; old: string; next: string }[] = [];

      for (const m of masters as Record<string, unknown>[]) {
        if (wanted && !wanted.has(m.seriesId as number)) continue;
        const current = ((m.name as string | null) ?? "").trim();
        if (current && !input.overwrite) continue;

        const s = seriesById.get(m.seriesId as number);
        const c = colorById.get(m.colorId as number);
        const next = salesNameOf({
          seriesNameEn: s?.nameEn ?? null,
          seriesName: s?.name ?? null,
          colorNameEn: c?.nameEn ?? null,
          colorName: c?.name ?? null,
          family: familyById.get(m.familyId as number)?.name ?? null,
          packaging: packagingById.get(m.packagingId as number)?.name ?? null,
          readiness: String(m.readiness ?? "konsantre"),
        });
        if (!next || next === current) continue;
        changes.push({
          masterId: m.id as number,
          sku: String(m.internalSku ?? ""),
          old: current,
          next,
        });
      }

      if (input.dryRun) {
        return { dryRun: true as const, updated: 0, willUpdate: changes.length, sample: changes.slice(0, 20) };
      }
      for (const ch of changes) {
        await db.updateMasterProduct(ch.masterId, { name: ch.next } as never);
      }
      return {
        dryRun: false as const,
        updated: changes.length,
        willUpdate: changes.length,
        sample: changes.slice(0, 20),
      };
    }),

  /**
   * Barkodu (GTIN) yazar ya da temizler.
   *
   * Alan şemada ve sağlık kontrolünde vardı ama hiçbir ekrandan
   * doldurulamıyordu — barkodsuz ürün pazaryerine açılamaz.
   */
  setGtin: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        gtin: z.string().trim().max(20),
      }),
    )
    .mutation(async ({ input }) => {
      const gtin = input.gtin.trim();
      if (gtin && !/^\d{8,14}$/.test(gtin)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Barkod 8-14 haneli rakam olmalı",
        });
      }
      // Aynı barkod iki üründe olursa pazaryeri kartları birbirine karışır.
      if (gtin) {
        const clash = (await db.listMasterProducts()).find(
          m => m.id !== input.masterId && (m.gtin ?? "").trim() === gtin,
        );
        if (clash) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Bu barkod ${clash.internalSku} ürününde kullanılıyor`,
          });
        }
      }
      await db.updateMasterProduct(input.masterId, { gtin: gtin || null } as never);
      return { ok: true };
    }),

  /**
   * Katalogu Excel/CSV matrisi olarak verir.
   *
   * Dışa aktarılan dosya düzenlenip geri yüklenebilsin diye kimlik (ID + Kod)
   * ve koordinat sütunları da yazılır; `bulkImportMasters` aynı alan
   * kataloğunu okur, ikisi ayrışamaz.
   */
  exportMasters: protectedProcedure.query(async () => {
    const [masters, series, colors, families, packagings] = await Promise.all([
      db.listMasterProducts(),
      db.listProductSeries(),
      db.listColors(),
      db.listProductFamilies(),
      db.listPackagings(),
    ]);
    const nameById = (rows: unknown[]) =>
      new Map((rows as { id: number; name: string }[]).map(r => [r.id, r.name]));
    const seriesName = nameById(series);
    const colorName = nameById(colors);
    const familyName = nameById(families);
    const packagingName = nameById(packagings);

    const records: MasterIORecord[] = (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      internalSku: String(m.internalSku ?? ""),
      name: (m.name as string | null) ?? null,
      gtin: (m.gtin as string | null) ?? null,
      basePrice: num(m.basePrice),
      stockQty: Number(m.stockQty ?? 0),
      status: (m.status as MasterIORecord["status"]) ?? "taslak",
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      familyId: m.familyId as number,
      packagingId: m.packagingId as number,
      readiness: (m.readiness as MasterIORecord["readiness"]) ?? "konsantre",
      series: seriesName.get(m.seriesId as number) ?? null,
      colorName: colorName.get(m.colorId as number) ?? null,
      family: familyName.get(m.familyId as number) ?? null,
      packaging: packagingName.get(m.packagingId as number) ?? null,
    }));

    return {
      matrix: buildMasterExportMatrix(records, { numeric: true }),
      count: records.length,
    };
  }),

  /**
   * Excel/CSV ile toplu ürün yükleme — oluştur-veya-güncelle.
   *
   * Plan istemcide de çıkarılır (kullanıcı farkı görüp onaylar) ama BURADA
   * yeniden kurulur: istemciden gelen plana güvenmek, kullanıcının
   * önizlemede gördüğünden başka bir şeyin yazılabilmesi demek olurdu.
   * Aynı dosya, aynı saf fonksiyon, aynı sonuç.
   *
   * Yeni ürünün kodu küp üretimiyle AYNI kurallardan geçer (`buildInternalSku`
   * + `disambiguate`): aynı ürün hangi yoldan açılırsa açılsın aynı kodu alsın,
   * yoksa Excel'den ve sihirbazdan açılan ürün iki farklı kayda dönüşürdü.
   */
  bulkImportMasters: protectedProcedure
    .input(
      z.object({
        /** Dosyanın ham hücre matrisi (ilk satır başlık). */
        matrix: z.array(z.array(z.string())).min(2).max(5001),
        matchBy: z.enum(["kod", "id"]).default("kod"),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, series, colors, families, packagings] = await Promise.all([
        db.listMasterProducts(),
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
      ]);

      const { parsed, error } = masterMatrixToParsed(input.matrix);
      if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: error ?? "Dosya okunamadı." });

      const dimRows = {
        series: series as { id: number; name: string; prefix: string | null }[],
        colors: colors as { id: number; name: string; code: string }[],
        families: families as { id: number; name: string; code: string; skuSegment: string | null }[],
        packagings: packagings as {
          id: number;
          name: string;
          code: string;
          skuSegment: string | null;
          volumeMl: string;
        }[],
      };

      const records: MasterIORecord[] = (masters as Record<string, unknown>[]).map(m => ({
        id: m.id as number,
        internalSku: String(m.internalSku ?? ""),
        name: (m.name as string | null) ?? null,
        gtin: (m.gtin as string | null) ?? null,
        basePrice: num(m.basePrice),
        stockQty: Number(m.stockQty ?? 0),
        status: (m.status as MasterIORecord["status"]) ?? "taslak",
        seriesId: m.seriesId as number,
        colorId: m.colorId as number,
        familyId: m.familyId as number,
        packagingId: m.packagingId as number,
        readiness: (m.readiness as MasterIORecord["readiness"]) ?? "konsantre",
        series: null,
        colorName: null,
        family: null,
        packaging: null,
      }));

      const plan = planMasterImport(records, parsed, {
        matchBy: input.matchBy,
        dims: {
          series: dimRows.series.map(s => ({ id: s.id, name: s.name })),
          colors: dimRows.colors.map(c => ({ id: c.id, name: c.name })),
          families: dimRows.families.map(f => ({ id: f.id, name: f.name })),
          packagings: dimRows.packagings.map(p => ({ id: p.id, name: p.name })),
        },
      });

      if (input.dryRun) return { dryRun: true as const, created: 0, updated: 0, plan };

      /** Decimal sütunlar metin olarak yazılır; sayı geçmek sessiz yuvarlama yapar. */
      const toRow = (data: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        if ("name" in data) out.name = String(data.name ?? "").trim() || null;
        if ("gtin" in data) out.gtin = String(data.gtin ?? "").trim() || null;
        if ("basePrice" in data) out.basePrice = String(data.basePrice);
        if ("stockQty" in data) out.stockQty = Number(data.stockQty);
        if ("status" in data) out.status = data.status;
        return out;
      };

      let updated = 0;
      for (const u of plan.updates) {
        await db.updateMasterProduct(u.id, toRow(u.data) as never);
        updated++;
      }

      const seriesById = new Map(dimRows.series.map(s => [s.id, s]));
      const colorById = new Map(dimRows.colors.map(c => [c.id, c]));
      const familyById = new Map(dimRows.families.map(f => [f.id, f]));
      const packagingById = new Map(dimRows.packagings.map(p => [p.id, p]));
      const takenSkus = new Set(records.map(r => r.internalSku));

      let created = 0;
      for (const c of plan.creates) {
        const s = seriesById.get(c.coord.seriesId);
        const color = colorById.get(c.coord.colorId);
        const family = familyById.get(c.coord.familyId);
        const packaging = packagingById.get(c.coord.packagingId);
        if (!s || !color || !family || !packaging) continue;

        const baseCode = ["aoc", s.prefix ?? "", color.code]
          .filter(Boolean)
          .join("")
          .toLowerCase();
        const rawSku = buildInternalSku({
          baseCode,
          familySegment: family.skuSegment ?? family.code,
          packagingSegment: packaging.skuSegment ?? packaging.code,
          readiness: c.coord.readiness,
        });
        const internalSku = takenSkus.has(rawSku)
          ? disambiguate(rawSku, c.coord, takenSkus)
          : rawSku;
        takenSkus.add(internalSku);

        const volumeMl = num(packaging.volumeMl);
        await db.createMasterProduct({
          seriesId: c.coord.seriesId,
          colorId: c.coord.colorId,
          familyId: c.coord.familyId,
          packagingId: c.coord.packagingId,
          readiness: c.coord.readiness,
          baseCode,
          internalSku,
          formulaScale: String(volumeMl > 0 ? volumeMl / BASE_VOLUME_ML : 1),
          // Varsayılan taslak: fiyatı/reçetesi tamamlanmadan pazaryerine
          // gitmesin. Dosyada Durum yazılmışsa kullanıcının dediği geçerlidir,
          // o yüzden yayılım bu satırdan sonra gelir.
          status: "taslak",
          ...toRow(c.data),
        } as never);
        created++;
      }

      // Stok ve durum ilan miktarını besler — kanal gönderimi tazelensin.
      if (updated > 0 || created > 0) await runCapacityRecompute();
      return { dryRun: false as const, created, updated, plan };
    }),

  packagingCosts: protectedProcedure.query(async () => {
    const [packagings, packInputs, materials] = await Promise.all([
      db.listPackagings(),
      db.listPackagingInputs(),
      db.listMaterials(),
    ]);

    const costMaterials = (materials as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      name: String(m.name ?? ""),
      type: (m.type as CostMaterial["type"]) ?? "hammadde",
      unitCost: (m.unitCost as string | null) ?? null,
      unit: (m.unit as string | null) ?? null,
    }));
    const materialById = new Map(costMaterials.map(m => [m.id, m]));

    type PackInputRow = {
      id: number;
      packagingId: number;
      materialId: number;
      qtyPerUnit: string;
      unit: string | null;
    };
    const byPackaging = new Map<number, PackInputRow[]>();
    for (const pi of packInputs as PackInputRow[]) {
      byPackaging.set(pi.packagingId, [...(byPackaging.get(pi.packagingId) ?? []), pi]);
    }

    return (packagings as Record<string, unknown>[]).map(p => {
      const id = p.id as number;
      const rows = byPackaging.get(id) ?? [];
      const mismatches: string[] = [];
      let cost = 0;

      // Ana kap ambalaj tanımının kendi alanında; adet başına 1 sayılır.
      const containerId = (p.materialId as number | null) ?? null;
      if (containerId != null) {
        const mat = materialById.get(containerId);
        if (mat?.type !== "masraf") cost += num(mat?.unitCost);
      }

      for (const row of rows) {
        const mat = materialById.get(row.materialId);
        if (mat?.type === "masraf") continue;
        const conv = qtyInMaterialUnit(num(row.qtyPerUnit), row.unit, mat?.unit);
        if (conv.mismatch && mat) mismatches.push(mat.name);
        cost += conv.qty * num(mat?.unitCost);
      }

      return {
        id,
        code: String(p.code ?? ""),
        name: String(p.name ?? ""),
        volumeMl: num(p.volumeMl),
        isActive: Number(p.isActive ?? 1) === 1,
        containerMaterialId: containerId,
        containerName: containerId != null ? (materialById.get(containerId)?.name ?? null) : null,
        containerCost: containerId != null ? num(materialById.get(containerId)?.unitCost) : 0,
        inputs: rows.map(r => ({
          id: r.id,
          materialId: r.materialId,
          qtyPerUnit: num(r.qtyPerUnit),
          unit: r.unit,
        })),
        /** Bir adet ambalajın toplam maliyeti (kap + kapak + etiket + koli). */
        unitCost: Math.round(cost * 10000) / 10000,
        unitMismatches: mismatches,
      };
    });
  }),

  savePackagingInputs: protectedProcedure
    .input(
      z.object({
        packagingId: z.number(),
        inputs: z
          .array(
            z.object({
              materialId: z.number(),
              qtyPerUnit: z.number().min(0),
              unit: z.string().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input }) => {
      await db.setPackagingInputs(
        input.packagingId,
        input.inputs.filter(i => i.qtyPerUnit > 0),
      );
      // Ambalaj maliyeti değişti: master maliyetleri ve kapasite yeniden çıkar.
      await runCapacityRecompute();
      return { ok: true, count: input.inputs.length };
    }),

  saveFormula: protectedProcedure
    .input(
      z.object({
        id: z.number().nullable().optional(),
        name: z.string().min(1),
        outputType: z.enum(["yari_mamul", "mamul"]).default("mamul"),
        outputMaterialId: z.number().nullable().optional(),
        // Tek değerli eksenler — geriye dönük uyum.
        seriesId: z.number().nullable().optional(),
        colorId: z.number().nullable().optional(),
        familyId: z.number().nullable().optional(),
        readiness: z.enum(["konsantre", "r2u"]).nullable().optional(),
        /**
         * Çoklu kapsam. Boş dizi = o eksende sınır yok ("hepsi").
         * Doluysa tek değerli kolonun yerine geçer.
         */
        seriesIds: z.array(z.number()).optional(),
        colorIds: z.array(z.number()).optional(),
        familyIds: z.array(z.number()).optional(),
        readinessList: z.array(z.enum(["konsantre", "r2u"])).optional(),
        baseQty: z.number().positive().default(1000),
        baseUnit: z.string().default("ml"),
        wastePercent: z.number().min(0).max(99).default(0),
        notes: z.string().nullable().optional(),
        inputs: z
          .array(
            z.object({
              inputMaterialId: z.number(),
              qtyPerBase: z.number().min(0),
              /** Miktarın birimi; boş bırakılırsa kalemin kendi birimi sayılır. */
              unit: z.string().nullable().optional(),
              note: z.string().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.outputType === "yari_mamul" && !input.outputMaterialId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Yarı mamul reçetesi hangi kalemi ürettiğini bildirmeli — çıktı kalemini seçin.",
        });
      }
      // Kendi kendini besleyen reçete BOM'da sonsuz döngü demektir.
      if (
        input.outputType === "yari_mamul" &&
        input.inputs.some(i => i.inputMaterialId === input.outputMaterialId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reçete kendi çıktısını girdi olarak kullanamaz (döngü).",
        });
      }

      const payload = {
        name: input.name.trim(),
        outputType: input.outputType,
        outputMaterialId: input.outputType === "yari_mamul" ? input.outputMaterialId : null,
        seriesId: input.seriesId ?? null,
        colorId: input.colorId ?? null,
        familyId: input.familyId ?? null,
        readiness: input.readiness ?? null,
        baseQty: String(input.baseQty),
        baseUnit: input.baseUnit,
        wastePercent: String(input.wastePercent),
        notes: input.notes ?? null,
      };

      const id = input.id
        ? (await db.updateFormula(input.id, payload as never), input.id)
        : await db.createFormula(payload as never);
      await db.setFormulaInputs(id, input.inputs);

      // Çoklu kapsam. Alan hiç gönderilmediyse mevcut kapsama dokunulmaz;
      // gönderildiyse (boş dizi dahil) o eksen sıfırlanır.
      const scopes: { kind: "seri" | "renk" | "form" | "hazirlik"; valueId: number }[] = [];
      for (const v of input.seriesIds ?? []) scopes.push({ kind: "seri", valueId: v });
      for (const v of input.colorIds ?? []) scopes.push({ kind: "renk", valueId: v });
      for (const v of input.familyIds ?? []) scopes.push({ kind: "form", valueId: v });
      for (const v of input.readinessList ?? []) {
        scopes.push({ kind: "hazirlik", valueId: v === "r2u" ? 1 : 0 });
      }
      const touched =
        input.seriesIds !== undefined ||
        input.colorIds !== undefined ||
        input.familyIds !== undefined ||
        input.readinessList !== undefined;
      if (touched) await db.setFormulaScopes(id, scopes);

      return { id };
    }),

  /**
   * Master'ları koordinatına uyan reçeteye bağlar ve ambalaj hacminden ölçeği
   * hesaplar. 5.000 master'ı elle bağlamak gerçekçi olmadığı için gerekli;
   * en özel reçete kazanır (renk bazlı > seri bazlı).
   */
  bindFormulas: protectedProcedure
    .input(z.object({ rebindExisting: z.boolean().default(false), dryRun: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const plan = await planBindings(input.rebindExisting);

      if (input.dryRun) {
        return { dryRun: true, bound: 0, willBind: plan.bindings.length, unmatched: plan.unmatched.length };
      }
      for (const b of plan.bindings) {
        await db.updateMasterProduct(b.masterId, {
          formulaId: b.formulaId,
          formulaScale: String(b.formulaScale),
        });
      }
      return {
        dryRun: false,
        bound: plan.bindings.length,
        willBind: plan.bindings.length,
        unmatched: plan.unmatched.length,
      };
    }),

  /* ---- Reçete sağlığı: maliyeti bozan veri hataları ---------------------- */

  /**
   * "Fiyat neden saçma çıkıyor?" sorusunun tek ekranlık cevabı.
   *
   * Maliyet motoru doğru; onu besleyen veri yanlış olduğunda sonuç sessizce
   * saçmalıyordu (reçeteye konmuş şişe, 500 ml bazlı reçete, hacimsiz ambalaj).
   * Bu uç hataları isimleriyle listeler; düzeltmeler ayrı uçlarda.
   */
  recipeAudit: protectedProcedure.query(async () => {
    const [formulas, formulaInputs, materials, packagings, packagingInputs, masters] =
      await Promise.all([
        db.listFormulas(),
        db.listFormulaInputs(),
        db.listMaterials(),
        db.listPackagings(),
        db.listPackagingInputs(),
        db.listMasterProducts(),
      ]);

    const auditMaterials = (materials as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      name: String(m.name ?? ""),
      type: (m.type as AuditMaterial["type"]) ?? "hammadde",
      unit: (m.unit as string | null) ?? null,
      unitCost: (m.unitCost as string | null) ?? null,
    }));
    const matById = new Map(auditMaterials.map(m => [m.id, m]));

    const inputsByFormula = new Map<number, AuditFormula["inputs"]>();
    for (const fi of formulaInputs as Record<string, unknown>[]) {
      const key = fi.formulaId as number;
      inputsByFormula.set(key, [
        ...(inputsByFormula.get(key) ?? []),
        {
          inputMaterialId: fi.inputMaterialId as number,
          qtyPerBase: num(fi.qtyPerBase),
          unit: (fi.unit as string | null) ?? null,
        },
      ]);
    }

    // Ambalaj adet maliyeti: ana kap + ek kalemler (packagingCosts ile aynı kural).
    const packInputs = new Map<number, { materialId: number; qtyPerUnit: number; unit: string | null }[]>();
    for (const pi of packagingInputs as Record<string, unknown>[]) {
      const key = pi.packagingId as number;
      packInputs.set(key, [
        ...(packInputs.get(key) ?? []),
        {
          materialId: pi.materialId as number,
          qtyPerUnit: num(pi.qtyPerUnit),
          unit: (pi.unit as string | null) ?? null,
        },
      ]);
    }

    const auditPackagings = (packagings as Record<string, unknown>[]).map(p => {
      const id = p.id as number;
      let cost = 0;
      const containerId = (p.materialId as number | null) ?? null;
      if (containerId != null) {
        const mat = matById.get(containerId);
        if (mat?.type !== "masraf") cost += num(mat?.unitCost);
      }
      for (const row of packInputs.get(id) ?? []) {
        const mat = matById.get(row.materialId);
        if (mat?.type === "masraf") continue;
        const conv = qtyInMaterialUnit(row.qtyPerUnit, row.unit, mat?.unit);
        cost += conv.qty * num(mat?.unitCost);
      }
      return {
        id,
        name: String(p.name ?? ""),
        volumeMl: num(p.volumeMl),
        isActive: Number(p.isActive ?? 1) === 1,
        unitCost: Math.round(cost * 10000) / 10000,
      };
    });

    const result = auditRecipes({
      formulas: (formulas as Record<string, unknown>[]).map(f => ({
        id: f.id as number,
        name: String(f.name ?? ""),
        outputType: f.outputType as "yari_mamul" | "mamul",
        baseQty: num(f.baseQty),
        baseUnit: (f.baseUnit as string | null) ?? null,
        inputs: inputsByFormula.get(f.id as number) ?? [],
      })),
      materials: auditMaterials,
      packagings: auditPackagings,
      masters: (masters as Record<string, unknown>[]).map(m => ({
        id: m.id as number,
        internalSku: (m.internalSku as string | null) ?? null,
        formulaId: (m.formulaId as number | null) ?? null,
        formulaScale: (m.formulaScale as string | null) ?? null,
        packagingId: (m.packagingId as number | null) ?? null,
        status: (m.status as string | null) ?? null,
      })),
    });
    return { ...result, targetBaseMl: BASE_VOLUME_ML };
  }),

  /**
   * Mamul reçetelerini 1 litre bazına çevirir.
   *
   * Baz miktar ve TÜM girdi miktarları aynı çarpanla ölçeklenir; oran
   * korunduğu için litre başına maliyet birebir aynı kalır. Değişen tek şey
   * ambalaj ölçeğinin doğru çıkması: 500 ml bazlı reçetede 250 ml ürün 0,5
   * alıyordu, 1 lt bazında 0,25 alır.
   *
   * Çevrimden sonra ürünler yeniden bağlanır — yoksa reçete 1 litre olur ama
   * master'lardaki eski ölçek yerinde kalır ve hata büyür.
   */
  normalizeFormulaBase: protectedProcedure
    .input(
      z.object({
        dryRun: z.boolean().default(true),
        /** Yalnız bu reçeteler; boşsa 1 litre olmayan tüm mamul reçeteleri. */
        formulaIds: z.array(z.number()).default([]),
      }),
    )
    .mutation(async ({ input }) => {
      const [formulas, formulaInputs] = await Promise.all([
        db.listFormulas(),
        db.listFormulaInputs(),
      ]);

      type InputRow = {
        id: number;
        formulaId: number;
        inputMaterialId: number;
        qtyPerBase: string;
        unit: string | null;
        note: string | null;
      };
      const rows = formulaInputs as InputRow[];
      const byFormula = new Map<number, InputRow[]>();
      for (const i of rows) byFormula.set(i.formulaId, [...(byFormula.get(i.formulaId) ?? []), i]);

      const scope = (formulas as Record<string, unknown>[]).filter(
        f => input.formulaIds.length === 0 || input.formulaIds.includes(f.id as number),
      );

      const plan = planBaseNormalization(
        scope.map(f => ({
          id: f.id as number,
          name: String(f.name ?? ""),
          outputType: f.outputType as "yari_mamul" | "mamul",
          baseQty: num(f.baseQty),
          baseUnit: (f.baseUnit as string | null) ?? null,
          inputs: (byFormula.get(f.id as number) ?? []).map(i => ({
            id: i.id,
            inputMaterialId: i.inputMaterialId,
            qtyPerBase: num(i.qtyPerBase),
            unit: i.unit,
          })),
        })),
      );

      if (input.dryRun) {
        return {
          dryRun: true,
          converted: 0,
          willConvert: plan.changes.length,
          alreadyOk: plan.alreadyOk.length,
          skipped: plan.skipped,
          changes: plan.changes,
          rebound: 0,
        };
      }

      for (const change of plan.changes) {
        await db.updateFormula(change.formulaId, {
          baseQty: String(change.toQty),
          baseUnit: change.toUnit,
        });
        const original = byFormula.get(change.formulaId) ?? [];
        const scaled = new Map(change.inputs.map(i => [i.id, i.to]));
        await db.setFormulaInputs(
          change.formulaId,
          original.map(i => ({
            inputMaterialId: i.inputMaterialId,
            qtyPerBase: scaled.get(i.id) ?? num(i.qtyPerBase),
            unit: i.unit,
            note: i.note,
          })),
        );
      }

      // Baz değişti: master ölçekleri de tazelenmeli, yoksa hata büyür.
      const rebound = plan.changes.length > 0 ? await rebindAllFormulas() : 0;
      await runCapacityRecompute();

      return {
        dryRun: false,
        converted: plan.changes.length,
        willConvert: plan.changes.length,
        alreadyOk: plan.alreadyOk.length,
        skipped: plan.skipped,
        changes: plan.changes,
        rebound,
      };
    }),

  /**
   * Reçeteye yanlışlıkla konmuş ambalaj kalemini ambalaj tanımlarına taşır.
   *
   * Reçetede kaldığı sürece ambalaj HACİMLE ölçeklenir (250 ml üründe 0,25
   * şişe, 5 lt üründe 5 şişe). Ambalaj tanımında ise adet başına sabittir —
   * doğrusu budur. Hedef ambalajlar verilmezse bu reçeteye bağlı master'ların
   * kullandığı ambalajlar seçilir.
   */
  movePackagingLineToPackagings: protectedProcedure
    .input(
      z.object({
        formulaId: z.number(),
        materialId: z.number(),
        /** Boşsa reçeteye bağlı master'ların ambalajları. */
        packagingIds: z.array(z.number()).default([]),
        qtyPerUnit: z.number().positive().default(1),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [formulaInputs, masters, packagingInputs] = await Promise.all([
        db.listFormulaInputs(),
        db.listMasterProducts(),
        db.listPackagingInputs(),
      ]);

      type InputRow = {
        id: number;
        formulaId: number;
        inputMaterialId: number;
        qtyPerBase: string;
        unit: string | null;
        note: string | null;
      };
      const lines = (formulaInputs as InputRow[]).filter(i => i.formulaId === input.formulaId);
      const target = lines.find(i => i.inputMaterialId === input.materialId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bu kalem reçetede bulunamadı." });
      }

      const targets =
        input.packagingIds.length > 0
          ? input.packagingIds
          : Array.from(
              new Set(
                (masters as Record<string, unknown>[])
                  .filter(m => m.formulaId === input.formulaId && m.status !== "arsiv")
                  .map(m => m.packagingId as number | null)
                  .filter((id): id is number => id != null),
              ),
            );

      if (input.dryRun) {
        return { dryRun: true, packagings: targets, removedFromFormula: false };
      }

      // Ambalaj tanımına ekle (aynı kalem zaten varsa miktarı ezmeyip korur —
      // kullanıcının elle girdiği değer sessizce değişmemeli).
      type PackRow = { packagingId: number; materialId: number; qtyPerUnit: string; unit: string | null };
      const existing = packagingInputs as PackRow[];
      for (const packagingId of targets) {
        const current = existing.filter(p => p.packagingId === packagingId);
        if (current.some(p => p.materialId === input.materialId)) continue;
        await db.setPackagingInputs(packagingId, [
          ...current.map(p => ({
            materialId: p.materialId,
            qtyPerUnit: num(p.qtyPerUnit),
            unit: p.unit,
          })),
          { materialId: input.materialId, qtyPerUnit: input.qtyPerUnit, unit: target.unit },
        ]);
      }

      // Reçeteden çıkar.
      await db.setFormulaInputs(
        input.formulaId,
        lines
          .filter(i => i.inputMaterialId !== input.materialId)
          .map(i => ({
            inputMaterialId: i.inputMaterialId,
            qtyPerBase: num(i.qtyPerBase),
            unit: i.unit,
            note: i.note,
          })),
      );

      await runCapacityRecompute();
      return { dryRun: false, packagings: targets, removedFromFormula: true };
    }),

  /* ---- Ürün takibi ------------------------------------------------------ */

  /**
   * Ürün listesi + takip sütunları: eksikler · getiri (maliyet/marj) ·
   * hedef pazar (açılmış ilanlar) · pazarlama fırsatı (açılmamış kullanım
   * alanı ve kanal).
   *
   * Tek uçta toplanıyor çünkü hepsi aynı veriden türüyor; ayrı ayrı
   * sorgulamak aynı tabloları defalarca okumak olurdu.
   */
  trackList: protectedProcedure.query(async () => {
    const [listings, channelListings, useCases, channels, colors, packagings, series, families, listingImages] =
      await Promise.all([
        db.listListings(),
        db.listChannelListings(),
        db.listUseCases(),
        db.listSalesChannels(),
        db.listColors(),
        db.listPackagings(),
        db.listProductSeries(),
        db.listProductFamilies(),
        db.listListingImages(),
      ]);
    const masterImages = await db.listMasterImageRefs();
    const data = await loadCapacityInputs();

    const laborOverheadValue = await unitLaborOverheadValue();

    const costs = computeMasterCosts({
      masters: data.masters,
      materials: data.costMaterials,
      formulas: data.formulas,
      packagings: data.packagings,
      unitLaborOverhead: laborOverheadValue,
    });
    const costById = new Map(costs.map(c => [c.masterId, c]));

    const imageCount = new Map<number, number>();
    for (const img of listingImages as { listingId: number }[]) {
      imageCount.set(img.listingId, (imageCount.get(img.listingId) ?? 0) + 1);
    }
    // Master görselleri ilanlara miras kalır; "görsel yok" uyarısı bunu
    // saymazsa görseli master'da olan ürün eksik görünürdü.
    const masterImageCount = new Map<number, number>();
    // Kartta gösterilecek kapak görseli: sortOrder'ı en küçük olan.
    const coverByMaster = new Map<number, { id: number; url: string; sortOrder: number }>();
    for (const img of masterImages as {
      id: number;
      masterId: number;
      url: string | null;
      sortOrder: number;
    }[]) {
      masterImageCount.set(img.masterId, (masterImageCount.get(img.masterId) ?? 0) + 1);
      const current = coverByMaster.get(img.masterId);
      if (!current || img.sortOrder < current.sortOrder) {
        coverByMaster.set(img.masterId, {
          id: img.id,
          url: img.url?.trim() || masterImagePath(img.id),
          sortOrder: img.sortOrder,
        });
      }
    }

    const healthListings = (listings as Record<string, unknown>[]).map(l => ({
      id: l.id as number,
      masterId: l.masterId as number,
      useCaseId: l.useCaseId as number,
      title: String(l.title ?? ""),
      shortDescription: (l.shortDescription as string | null) ?? null,
      longDescription: (l.longDescription as string | null) ?? null,
      status: l.status as "taslak" | "aktif" | "arsiv",
      imageCount:
        (imageCount.get(l.id as number) ?? 0) || (masterImageCount.get(l.masterId as number) ?? 0),
    }));
    const healthChannels = (channelListings as Record<string, unknown>[]).map(c => ({
      listingId: c.listingId as number,
      masterId: c.masterId as number,
      channelId: c.channelId as number,
      status: c.status as "taslak" | "canli" | "durduruldu",
    }));

    // Fiyat: master'ın taban fiyatı; kanalda özel fiyat varsa en yükseği.
    const priceByMaster = new Map<number, number>();
    for (const m of data.rawMasters) priceByMaster.set(m.id as number, num(m.basePrice));
    for (const c of channelListings as { masterId: number; price: string }[]) {
      const p = num(c.price);
      if (p > (priceByMaster.get(c.masterId) ?? 0)) priceByMaster.set(c.masterId, p);
    }

    const allUseCaseIds = (useCases as { id: number }[]).map(u => u.id);
    const allChannelIds = (channels as { id: number }[]).map(c => c.id);
    const colorById = new Map(
      (colors as { id: number; name: string; hex: string | null; nameEn: string | null }[]).map(
        c => [c.id, c],
      ),
    );
    const packById = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p]));
    const seriesById = new Map(
      (series as { id: number; name: string; nameEn: string | null }[]).map(s => [s.id, s]),
    );
    const familyById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));

    const rows = data.rawMasters.map(m => {
      const masterId = m.id as number;
      const cost = costById.get(masterId);
      const price = priceByMaster.get(masterId) ?? 0;
      const health = masterHealth({
        master: {
          id: masterId,
          formulaId: (m.formulaId as number | null) ?? null,
          buildableQty: Number(m.buildableQty ?? 0),
          stockQty: Number(m.stockQty ?? 0),
          gtin: (m.gtin as string | null) ?? null,
          status: m.status as "taslak" | "aktif" | "arsiv",
        },
        listings: healthListings,
        channelListings: healthChannels,
        allUseCaseIds,
        allChannelIds,
        costKnown: (cost?.totalCost ?? 0) > 0 && (cost?.unknownInputs.length ?? 0) === 0,
        hasPrice: price > 0,
      });
      const color = colorById.get(m.colorId as number);
      return {
        masterId,
        internalSku: String(m.internalSku ?? ""),
        // Gruplama için kimlikler: liste düz değil, seri → renk → varyant
        // ağacı olarak gösterilir.
        seriesId: m.seriesId as number,
        colorId: m.colorId as number,
        baseCode: (m.baseCode as string | null) ?? null,
        series: seriesById.get(m.seriesId as number)?.name ?? null,
        family: familyById.get(m.familyId as number)?.name ?? null,
        packaging: packById.get(m.packagingId as number)?.name ?? null,
        colorName: color?.name ?? null,
        colorHex: color?.hex ?? null,
        readiness: String(m.readiness ?? "konsantre"),
        status: String(m.status ?? "taslak"),
        buildable: Number(m.buildableQty ?? 0),
        cost: cost?.totalCost ?? 0,
        unknownInputs: cost?.unknownInputs ?? [],
        unitMismatches: cost?.unitMismatches ?? [],
        price,
        ...marginOf(price, cost?.totalCost ?? 0),
        health,
        // Satış modu ve ondan çıkan ilan miktarı: ürünün üretime takılmadan
        // satılıp satılamayacağını satırda görmek için.
        salesMode: (m.salesMode as SalesMode | null) ?? "siparis_uzerine",
        leadTimeDays: Number(m.leadTimeDays ?? 0),
        stockQty: Number(m.stockQty ?? 0),
        // Kart ekranı barkodu ve kapak görselini satırda ister; bunlar için
        // ürün başına ayrı sorgu atmak listeyi N+1'e çevirirdi.
        gtin: (m.gtin as string | null) ?? null,
        name: (m.name as string | null) ?? null,
        // Önerilen satış adı — kartta yer tutucu olarak gösterilir ve
        // `generateNames` bunun aynısını yazar; öneri ile yazılan ad
        // ayrışmasın diye tek fonksiyondan gelir.
        suggestedName: salesNameOf({
          seriesNameEn: seriesById.get(m.seriesId as number)?.nameEn ?? null,
          seriesName: seriesById.get(m.seriesId as number)?.name ?? null,
          colorNameEn: color?.nameEn ?? null,
          colorName: color?.name ?? null,
          family: familyById.get(m.familyId as number)?.name ?? null,
          packaging: packById.get(m.packagingId as number)?.name ?? null,
          readiness: String(m.readiness ?? "konsantre"),
        }),
        imageUrl: coverByMaster.get(masterId)?.url ?? null,
        imageId: coverByMaster.get(masterId)?.id ?? null,
        imageCount: masterImageCount.get(masterId) ?? 0,
        listingQty: listingQtyFor({
          salesMode: m.salesMode as SalesMode | null,
          buildable: Number(m.buildableQty ?? 0),
          cap: Number(m.virtualStockCap ?? 10),
          stockQty: Number(m.stockQty ?? 0),
          reservedQty: Number(m.reservedQty ?? 0),
        }),
      };
    });

    return {
      rows: rows.sort((a, b) => a.health.score - b.health.score),
      series: rollupBySeries(
        rows.map(r => ({
          seriesId: r.seriesId,
          health: r.health,
          buildable: r.buildable,
          stockQty: r.stockQty,
        })),
      ).map(s => ({ ...s, seriesName: seriesById.get(s.seriesId)?.name ?? `#${s.seriesId}` })),
      useCases,
      channels,
    };
  }),

  /**
   * Fiyat & Kâr tablosu — v3 maliyetiyle.
   *
   * Eski Fiyat Motoru `products.costSummary`'yi okuyordu: tek seviyeli, fire
   * ve ambalaj hariç. Aynı ürün iki ekranda farklı maliyet gösteriyordu.
   * Tek doğru kaynak `costing.ts`.
   */
  priceTable: protectedProcedure.query(async () => {
    const [colors, packagings, series, families, channelListings] = await Promise.all([
      db.listColors(),
      db.listPackagings(),
      db.listProductSeries(),
      db.listProductFamilies(),
      db.listChannelListings(),
    ]);
    const data = await loadCapacityInputs();
    const laborOverheadValue = await unitLaborOverheadValue();
    const costs = computeMasterCosts({
      masters: data.masters,
      materials: data.costMaterials,
      formulas: data.formulas,
      packagings: data.packagings,
      unitLaborOverhead: laborOverheadValue,
    });
    const costById = new Map(costs.map(c => [c.masterId, c]));

    const channelPrices = new Map<number, { channelId: number; price: number }[]>();
    for (const c of channelListings as { masterId: number; channelId: number; price: string }[]) {
      channelPrices.set(c.masterId, [
        ...(channelPrices.get(c.masterId) ?? []),
        { channelId: c.channelId, price: num(c.price) },
      ]);
    }

    const nameOf = <T extends { id: number; name: string }>(rows: unknown) =>
      new Map((rows as T[]).map(r => [r.id, r.name]));
    const colorName = nameOf(colors);
    const packName = nameOf(packagings);
    const seriesName = nameOf(series);
    const familyName = nameOf(families);

    return data.rawMasters.map(m => {
      const masterId = m.id as number;
      const cost = costById.get(masterId);
      const price = num(m.basePrice);
      const discount = num(m.discountPercent);
      const net = price * (1 - discount / 100);
      return {
        masterId,
        internalSku: String(m.internalSku ?? ""),
        seriesId: m.seriesId as number,
        series: seriesName.get(m.seriesId as number) ?? null,
        family: familyName.get(m.familyId as number) ?? null,
        packaging: packName.get(m.packagingId as number) ?? null,
        colorName: colorName.get(m.colorId as number) ?? null,
        status: String(m.status ?? "taslak"),
        cost: cost?.totalCost ?? 0,
        materialCost: cost?.materialCost ?? 0,
        packagingCost: cost?.packagingCost ?? 0,
        unknownInputs: cost?.unknownInputs ?? [],
        basePrice: price,
        discountPercent: discount,
        netPrice: Math.round(net * 100) / 100,
        ...marginOf(net, cost?.totalCost ?? 0),
        channels: channelPrices.get(masterId) ?? [],
      };
    });
  }),

  /** Toplu fiyat güncelleme — yüzdeyle zam/indirim, seri kapsamlı. */
  bulkPrice: protectedProcedure
    .input(
      z.object({
        percent: z.number().min(-90).max(500),
        seriesIds: z.array(z.number()).default([]),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const masters = (await db.listMasterProducts()) as Record<string, unknown>[];
      const wanted = input.seriesIds.length ? new Set(input.seriesIds) : null;
      const targets = masters.filter(
        m => (!wanted || wanted.has(m.seriesId as number)) && num(m.basePrice) > 0,
      );
      if (input.dryRun) return { dryRun: true, affected: targets.length, updated: 0 };

      let updated = 0;
      for (const m of targets) {
        const next = Math.round(num(m.basePrice) * (1 + input.percent / 100) * 100) / 100;
        await db.updateMasterProduct(m.id as number, { basePrice: String(next) });
        updated++;
      }
      // Fiyat değişimi pazaryerine gitmeli.
      await db.markChannelListingsDirty(targets.map(m => m.id as number));
      return { dryRun: false, affected: targets.length, updated };
    }),

  /** Tek master'ın kartı — künye, reçete, kapasite, ilanlar, fiyat tek yerde. */
  masterCard: protectedProcedure
    .input(z.object({ masterId: z.number() }))
    .query(async ({ input }) => {
      const master = await db.getMasterProduct(input.masterId);
      if (!master) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });

      const [listings, channelListings, useCases, channels, colors, packagings, series, families, formulas, formulaInputs, seriesColorNumbers] =
        await Promise.all([
          db.listListingsByMaster(input.masterId),
          db.listChannelListings(),
          db.listUseCases(),
          db.listSalesChannels(),
          db.listColors(),
          db.listPackagings(),
          db.listProductSeries(),
          db.listProductFamilies(),
          db.listFormulas(),
          db.listFormulaInputs(),
          db.listSeriesColorNumbers(),
        ]);
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);
      const capacity = report.masters.find(r => r.masterId === input.masterId) ?? null;

      const laborOverheadValue = await unitLaborOverheadValue();

      const [cost] = computeMasterCosts({
        masters: data.masters.filter(m => m.id === input.masterId),
        materials: data.costMaterials,
        formulas: data.formulas,
        packagings: data.packagings,
        unitLaborOverhead: laborOverheadValue,
      });

      const formula = master.formulaId
        ? (formulas as Record<string, unknown>[]).find(f => f.id === master.formulaId)
        : null;
      const matName = new Map(data.rawMaterials.map(m => [m.id as number, String(m.name ?? "")]));
      const recipe = formula
        ? (formulaInputs as { formulaId: number; inputMaterialId: number; qtyPerBase: string }[])
            .filter(i => i.formulaId === formula.id)
            .map(i => ({
              materialId: i.inputMaterialId,
              name: matName.get(i.inputMaterialId) ?? `#${i.inputMaterialId}`,
              qtyPerBase: num(i.qtyPerBase),
              // Bu master için gerçek birim ihtiyaç (ambalaj hacmiyle ölçekli).
              qtyPerUnit: num(i.qtyPerBase) * num(master.formulaScale),
            }))
        : [];

      const myChannels = (channelListings as Record<string, unknown>[]).filter(
        c => c.masterId === input.masterId,
      );
      const usedUseCases = new Set((listings as { useCaseId: number }[]).map(l => l.useCaseId));

      // Künye rengin KİMLİĞİNİ yazıyor: kod, Türkçe ad, uluslararası ad ve renk
      // kodu. Eskiden yalnız ad dönüyordu; kart "Fuşya" deyip renk kodunu
      // saklıyordu, oysa ilanda ve müşteri yazışmasında sorulan tam olarak o.
      const colorById = new Map(
        (
          colors as {
            id: number;
            code: string;
            colorNo: number | null;
            name: string;
            nameEn: string | null;
            hex: string | null;
            finish: string | null;
          }[]
        ).map(c => [c.id, c]),
      );
      const packagingRow = (packagings as Record<string, unknown>[]).find(
        p => p.id === master.packagingId,
      );
      // Pazaryerine giden desi/ağırlık/KDV: master → ambalaj → hacimden tahmin.
      // Nereden geldiği de dönülür ki "neden 1 desi?" ekranda cevaplanabilsin.
      const logistics = resolveLogistics({
        master: {
          desi: master.desi != null ? num(master.desi) : null,
          weightG: master.weightG != null ? num(master.weightG) : null,
        },
        packaging: packagingRow
          ? {
              volumeMl: packagingRow.volumeMl != null ? num(packagingRow.volumeMl) : null,
              weightG: packagingRow.weightG != null ? num(packagingRow.weightG) : null,
              desi: packagingRow.desi != null ? num(packagingRow.desi) : null,
            }
          : null,
        series: (() => {
          const s = (series as Record<string, unknown>[]).find(s => s.id === master.seriesId);
          return s ? { vatRate: s.vatRate != null ? num(s.vatRate) : null } : null;
        })(),
      });

      // Görsel satırı base64 taşıyabilir; istemciye yalnız adres gider —
      // aksi halde her kart açılışında megabaytlarca veri akardı.
      const imageRows = (await db.listMasterImages(input.masterId)) as Record<string, unknown>[];

      return {
        master,
        logistics,
        images: imageRows.map(i => ({
          id: i.id as number,
          url: imageUrlOf({
            id: i.id as number,
            url: (i.url as string | null) ?? null,
            sortOrder: Number(i.sortOrder ?? 0),
          }),
          role: (i.role as string | null) ?? null,
          sortOrder: Number(i.sortOrder ?? 0),
          /** Dışarıdan mı geldi, biz mi barındırıyoruz. */
          hosted: i.data != null,
        })),
        identity: {
          series: (series as { id: number; name: string }[]).find(s => s.id === master.seriesId)?.name ?? null,
          family: (families as { id: number; name: string }[]).find(f => f.id === master.familyId)?.name ?? null,
          packaging: (packagings as { id: number; name: string; volumeMl: string }[]).find(p => p.id === master.packagingId) ?? null,
          color: colorById.get(master.colorId) ?? null,
          /**
           * Katalog kodu — BU ÜRÜNÜN serisiyle birleşmiş hâli.
           *
           * Ön ek üründen, numara önce serinin kendi kaydından
           * (`seriesColorNumbers`), yoksa rengin varsayılanından geliyor:
           * aynı yeşil CANDY kartında CND1008, METEOR kartında MTR1004
           * olabilir.
           */
          colorCode: makeColorCodeIndex({
            series: series as { id: number; prefix: string | null }[],
            overrides: seriesColorNumbers as { seriesId: number; colorId: number; colorNo: number }[],
          }).codeOf(
            master.seriesId as number,
            master.colorId as number,
            colorById.get(master.colorId)?.colorNo ?? null,
          ),
        },
        formula: formula ? { id: formula.id, name: formula.name, baseQty: formula.baseQty, baseUnit: formula.baseUnit } : null,
        recipe,
        capacity,
        cost,
        listings,
        channelListings: myChannels,
        // Pazarlama fırsatı: henüz ilan açılmamış kullanım alanları.
        openUseCases: (useCases as { id: number; name: string }[]).filter(u => !usedUseCases.has(u.id)),
        channels,
      };
    }),

  /**
   * Taban (web) fiyatı. Kanal yayınında fiyat girilmezse bu kullanılır —
   * her kanala ayrı fiyat girmek zorunda kalınmasın.
   */
  setBasePrice: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        basePrice: z.number().min(0).max(1000000),
        discountPercent: z.number().min(0).max(100).default(0),
        /** true: fiyatı olmayan kanal yayınlarına da yaz. */
        applyToChannels: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateMasterProduct(input.masterId, {
        basePrice: String(input.basePrice),
        discountPercent: String(input.discountPercent),
      });

      let updated = 0;
      if (input.applyToChannels) {
        const rows = (await db.listChannelListings()) as { id: number; masterId: number; price: string }[];
        for (const c of rows.filter(c => c.masterId === input.masterId && num(c.price) <= 0)) {
          // Fiyat değişimi pazaryerine gönderilmeli — kirli işaretlenir.
          await db.updateChannelListing(c.id, {
            price: String(input.basePrice),
            discountPercent: String(input.discountPercent),
            syncState: "kirli",
          });
          updated++;
        }
      }
      return { updated };
    }),

  cockpit: protectedProcedure.query(async () => {
    const [masters, listings, channelListings, dirty] = await Promise.all([
      db.listMasterProducts(),
      db.listListings(),
      db.listChannelListings(),
      db.listDirtyChannelListings(),
    ]);
    const data = await loadCapacityInputs();
    const report = computeCapacity(data);
    const necks = bottleneckReport(report);

    const rows = masters as Record<string, unknown>[];
    return {
      masters: rows.length,
      aktif: rows.filter(m => m.status === "aktif").length,
      recetesiz: rows.filter(m => m.formulaId == null).length,
      uretilemeyen: report.masters.filter(m => m.buildable <= 0).length,
      listings: (listings as unknown[]).length,
      canliYayin: (channelListings as { status: string }[]).filter(c => c.status === "canli").length,
      senkronBekleyen: (dirty as unknown[]).length,
      // En acil alım: kapasitesi tamamen sıfırlanan ürün sayısına göre.
      darbogazlar: necks.slice(0, 5),
      receteDongusu: report.cycles.length,
    };
  }),

  /* ---- Pazaryeri gönderimi ---------------------------------------------- */

  /** Kirli kuyruğun durumu — kaç yayın gönderim bekliyor. */
  syncStatus: protectedProcedure.query(async () => {
    const [dirty, channels] = await Promise.all([
      db.listDirtyChannelListings(),
      db.listSalesChannels(),
    ]);
    const byChannel = new Map<number, { kirli: number; hata: number }>();
    for (const d of dirty as { channelId: number; syncState: string }[]) {
      const row = byChannel.get(d.channelId) ?? { kirli: 0, hata: 0 };
      if (d.syncState === "hata") row.hata++;
      else row.kirli++;
      byChannel.set(d.channelId, row);
    }
    return (channels as { id: number; code: string; name: string }[]).map(c => ({
      channelId: c.id,
      code: c.code,
      name: c.name,
      ...(byChannel.get(c.id) ?? { kirli: 0, hata: 0 }),
    }));
  }),

  /**
   * Stok/fiyat gönderimi — v3 yayınlarından. Eski `pushToTrendyol` ailesi
   * `products` tablosunu okuyordu; v3'te üretilen hiçbir şey pazaryerine
   * gitmiyordu. Zincirin son halkası burası.
   */
  syncChannel: protectedProcedure
    .input(z.object({ channelId: z.number(), dryRun: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
      const channel = channels.find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });
      return syncChannel(channel.id, channel.code, { dryRun: input.dryRun });
    }),

  syncAllChannels: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }))
    .mutation(({ input }) => syncAllChannels({ dryRun: input.dryRun })),

  /**
   * Satılabilir ürün listesi — elden sipariş/teklif formları ve komut paleti.
   *
   * Eski `products.list` ile aynı işi görür ama v3 kataloğundan besler:
   * arşiv olmayan her master tek satır, okunur ad + taban fiyat + kapasite.
   * Bu uç sayesinde sipariş satırı `masterId` ile yazılır ve bağ tahmine
   * kalmaz (bkz. `orderBinding.ts`).
   */
  sellableList: protectedProcedure.query(async () => {
    const [masters, colors, packagings, series, families] = await Promise.all([
      db.listMasterProducts(),
      db.listColors(),
      db.listPackagings(),
      db.listProductSeries(),
      db.listProductFamilies(),
    ]);
    const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
    const packName = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p.name]));
    const seriesName = new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name]));
    const familyName = new Map((families as { id: number; name: string }[]).map(f => [f.id, f.name]));

    return (masters as Record<string, unknown>[])
      .filter(m => m.status !== "arsiv")
      .map(m => {
        const color = colorById.get(m.colorId as number);
        const parts = [
          seriesName.get(m.seriesId as number),
          color?.name,
          familyName.get(m.familyId as number),
          packName.get(m.packagingId as number),
          m.readiness === "r2u" ? "Kullanıma hazır" : null,
        ].filter(Boolean);
        return {
          masterId: m.id as number,
          name: parts.join(" · "),
          internalSku: String(m.internalSku ?? ""),
          hex: color?.hex ?? null,
          basePrice: num(m.basePrice),
          buildableQty: Number(m.buildableQty ?? 0),
          status: m.status as "taslak" | "aktif" | "arsiv",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }),

  /**
   * v3 üretim emri: master + adet → çok seviyeli reçete patlatılır, hammadde
   * düşer, mamul stok artar, emir kaydı yazılır.
   *
   * Eski `production.produce` tek seviyeli `formulaItems` okuyordu; yarı mamul
   * içeren reçetelerde eksik düşüm yapıyordu. Bu uç `planProduction` ile
   * hammaddeye kadar iner.
   *
   * Eksik hammadde varsa `force` olmadan üretim yapılmaz — sessizce eksi stok
   * yazmak envanteri bozar.
   */
  produceMaster: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        qty: z.number().positive().max(100000),
        force: z.boolean().default(false),
        note: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const plan = planProduction({
        demand: [{ masterId: input.masterId, qty: input.qty }],
        masters: (data.masters as Record<string, unknown>[]).map(m => ({
          id: m.id as number,
          formulaId: (m.formulaId as number | null) ?? null,
          formulaScale: num(m.formulaScale) || 1,
          packagingId: (m.packagingId as number | null) ?? null,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as MaterialType) ?? "hammadde",
          stockQty: num(m.stockQty),
          reservedQty: num(m.reservedQty),
        })),
      });

      if (plan.missingFormula.length > 0 && !input.force) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bu ürünün reçetesi yok — önce Reçeteler'den bağlayın.",
        });
      }
      const short = plan.shortages;
      if (short.length > 0 && !input.force) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Hammadde yetersiz: ${short
            .slice(0, 5)
            .map(n => `${n.name} (eksik ${Math.ceil(n.missing)})`)
            .join(" · ")}`,
        });
      }

      for (const n of plan.needs) {
        if (n.needed > 0) {
          await db.adjustStock(n.materialId, "out", n.needed, `Üretim: ${input.qty} adet`);
        }
      }
      const note = [
        input.note?.trim() || null,
        short.length > 0 ? `Eksik stokla zorlandı: ${short.map(n => n.name).join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      await db.recordMasterProductionRun(input.masterId, Math.round(input.qty), note || null);

      // Üretim kapasiteyi ve dolayısıyla pazaryeri stoğunu değiştirir;
      // zamanlayıcıyı beklemeden yeniden hesaplanır.
      await runCapacityRecompute();
      return { deducted: plan.needs.length, shortages: short.map(n => n.name) };
    }),

  /**
   * Üretim öncesi önizleme: "10 adet yapsam neyim eksik?"
   *
   * Üretimle aynı hesap (planProduction) kullanılır — önizlemede yeşil görünüp
   * üretimde patlayan bir durum olmaz.
   */
  productionPreview: protectedProcedure
    .input(z.object({ masterId: z.number(), qty: z.number().positive().max(100000) }))
    .query(async ({ input }) => {
      const data = await loadCapacityInputs();
      const plan = planProduction({
        demand: [{ masterId: input.masterId, qty: input.qty }],
        masters: (data.masters as Record<string, unknown>[]).map(m => ({
          id: m.id as number,
          formulaId: (m.formulaId as number | null) ?? null,
          formulaScale: num(m.formulaScale) || 1,
          packagingId: (m.packagingId as number | null) ?? null,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as MaterialType) ?? "hammadde",
          stockQty: num(m.stockQty),
          reservedQty: num(m.reservedQty),
        })),
      });
      const laborOverheadValue = await unitLaborOverheadValue();
      const [cost] = computeMasterCosts({
        masters: data.masters.filter(m => m.id === input.masterId),
        materials: data.costMaterials,
        formulas: data.formulas,
        packagings: data.packagings,
        unitLaborOverhead: laborOverheadValue,
      });
      return { ...plan, unitCost: cost?.totalCost ?? 0 };
    }),

  /**
   * Üretim kuyruğu: neyi üretmek gerekiyor.
   *
   * Eski kuyruk mamul stoğuna bakıyordu (eksi stok = üret). Siparişe göre
   * üretimde mamul stok tutulmadığı için o kuyruk hep boştu. v3 kuyruğu AÇIK
   * SİPARİŞ TALEBİNDEN gelir; ikinci sırada kritik eşiğin altına düşen mamul
   * stoklar durur (toptan için tampon tutulan ürünler).
   */
  productionQueue: protectedProcedure.query(async () => {
    const [orders, listings, channelListings, colors, packagings] = await Promise.all([
      db.listOrders(),
      db.listListings(),
      db.listChannelListings(),
      db.listColors(),
      db.listPackagings(),
    ]);
    const openOrders = (orders as Record<string, unknown>[]).filter(
      o => o.status === "new" || o.status === "production",
    );
    const items = openOrders.length
      ? ((await db.listOrderItemsBulk(openOrders.map(o => o.id as number))) as Record<
          string,
          unknown
        >[])
      : [];

    const refsByListing = new Map<number, string[]>();
    for (const c of channelListings as { listingId: number; channelSku: string; channelBarcode: string }[]) {
      refsByListing.set(c.listingId, [
        ...(refsByListing.get(c.listingId) ?? []),
        c.channelSku,
        c.channelBarcode,
      ]);
    }
    const resolved = resolveOrderLines(
      items.map(i => ({
        id: i.id as number,
        orderId: i.orderId as number,
        productName: String(i.productName ?? ""),
        quantity: num(i.quantity),
        channelRef: (i.channelRef as string | null) ?? null,
        masterId: (i.masterId as number | null) ?? null,
      })),
      (listings as { id: number; masterId: number; title: string }[]).map(l => ({
        masterId: l.masterId,
        listingId: l.id,
        title: l.title,
        channelRefs: refsByListing.get(l.id) ?? [],
      })),
    );

    const demand = new Map<number, number>();
    for (const r of resolved) {
      if (r.masterId == null) continue;
      demand.set(r.masterId, (demand.get(r.masterId) ?? 0) + r.line.quantity);
    }

    const data = await loadCapacityInputs();
    const masters = data.masters as Record<string, unknown>[];
    const colorName = new Map((colors as { id: number; name: string }[]).map(c => [c.id, c.name]));
    const packName = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p.name]));

    const rows = masters
      .map(m => {
        const id = m.id as number;
        const needed = demand.get(id) ?? 0;
        const stock = Number(m.stockQty ?? 0);
        const critical = Number(m.criticalQty ?? 0);
        // Sipariş talebi stoktan karşılanamayan kısım + kritik eşik açığı.
        const forOrders = Math.max(0, needed - stock);
        const forBuffer = critical > 0 ? Math.max(0, critical - stock) : 0;
        return {
          masterId: id,
          label: [colorName.get(m.colorId as number), packName.get(m.packagingId as number)]
            .filter(Boolean)
            .join(" · "),
          internalSku: String(m.internalSku ?? ""),
          ordered: needed,
          stockQty: stock,
          criticalQty: critical,
          buildableQty: Number(m.buildableQty ?? 0),
          suggested: Math.max(forOrders, forBuffer),
          reason: forOrders > 0 ? ("siparis" as const) : ("tampon" as const),
        };
      })
      .filter(r => r.suggested > 0)
      .sort((a, b) => {
        if (a.reason !== b.reason) return a.reason === "siparis" ? -1 : 1;
        return b.suggested - a.suggested;
      });

    return {
      rows,
      unmatchedLines: resolved.filter(r => r.masterId == null).length,
    };
  }),

  /** v3 üretim geçmişi. */
  productionRuns: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(50) }).default({ limit: 50 }))
    .query(({ input }) => db.listMasterProductionRuns(input.limit)),

  /* ---- Sipariş ↔ master bağı -------------------------------------------- */

  /**
   * Bağsız sipariş kalemlerini kanal kodundan çözer ve yazar.
   *
   * Geçmiş siparişler bu kolonlar yokken düştü; ayrıca ilan sonradan
   * yayınlandığında da bağ kurulabilir hale gelir. Zamanlayıcı da çağırır.
   */
  bindOrders: protectedProcedure.mutation(() => db.backfillOrderBinding()),

  /** Bağı olmayan kalemler — "elle bağla" iş listesi. */
  unboundOrderItems: protectedProcedure.query(() => db.listUnboundOrderItems()),

  /** Tek kalemi elle bağlar; null göndermek bağı kaldırır. */
  bindOrderItem: protectedProcedure
    .input(z.object({ itemId: z.number(), masterId: z.number().nullable() }))
    .mutation(async ({ input }) => {
      await db.bindOrderItem(input.itemId, input.masterId);
      return { ok: true };
    }),

  /**
   * Bağlanamayan sipariş satırından ürün AÇAR ve bağlar.
   *
   * ── Neden ────────────────────────────────────────────────────────────────
   * Pazaryerinde satılan ama katalogda karşılığı olmayan ürünler siparişte
   * "bağlanmamış satır" olarak birikiyordu: üretim planına, stok düşümüne ve
   * getiri raporuna hiç girmiyorlar. Tek çare ürünü elle açıp satırı elle
   * bağlamaktı — kimse yapmıyordu.
   *
   * ── Mükerrer olmama garantisi ────────────────────────────────────────────
   * Üç kademe: (1) kanal kodu zaten bir ilana bağlıysa YENİ ÜRÜN AÇILMAZ, o
   * master'a bağlanır; (2) aynı küp koordinatında (seri×renk×form×ambalaj×
   * hazırlık) master varsa o kullanılır — küp tekilliği veritabanı kısıtıdır;
   * (3) yalnız ikisi de yoksa yeni master açılır.
   *
   * Kanal kodu ilanla birlikte KAYDEDİLİR: aynı üründen bir daha sipariş
   * geldiğinde `backfillOrderBinding` onu kendiliğinden bağlar — bu iş bir
   * kez yapılır.
   */
  createMasterFromOrderLine: protectedProcedure
    .input(
      z.object({
        itemId: z.number(),
        seriesId: z.number(),
        colorId: z.number(),
        familyId: z.number(),
        packagingId: z.number(),
        readiness: z.enum(["konsantre", "r2u"]).default("konsantre"),
        /** Boşsa satırın birim fiyatı taban fiyat olur. */
        basePrice: z.number().min(0).optional(),
        /** Kanal ilanının açılacağı pazaryeri; yoksa yalnız iç ilan açılır. */
        channelId: z.number().nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const item = await db.getOrderItem(input.itemId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Sipariş satırı bulunamadı." });

      const channelRef = (item.channelRef ?? "").trim();
      const productName = String(item.productName ?? "").trim() || "İsimsiz ürün";

      const [masters, channelListingRows, colors, packagings, families, seriesRows, useCases] =
        await Promise.all([
          db.listMasterProducts(),
          db.listChannelListings(),
          db.listColors(),
          db.listPackagings(),
          db.listProductFamilies(),
          db.listProductSeries(),
          db.listUseCases(),
        ]);

      // (1) Kanal kodu zaten tanınıyorsa yeni ürün AÇMA — sadece bağla.
      if (channelRef) {
        const { index } = buildChannelRefIndex(
          (channelListingRows as Record<string, unknown>[]).map(c => ({
            masterId: c.masterId as number,
            listingId: c.listingId as number,
            channelSku: (c.channelSku as string | null) ?? null,
            channelBarcode: (c.channelBarcode as string | null) ?? null,
          })),
        );
        const hit = resolveMasterByRef(channelRef, index);
        if (hit) {
          const bound = await db.bindOrderItemsByChannelRef(channelRef, hit.masterId);
          return { masterId: hit.masterId, created: false, reason: "kanal_kodu" as const, bound };
        }
      }

      // (2) Aynı küp koordinatında master varsa onu kullan (küp tekil).
      const existingCube = (masters as Record<string, unknown>[]).find(
        m =>
          m.seriesId === input.seriesId &&
          m.colorId === input.colorId &&
          m.familyId === input.familyId &&
          m.packagingId === input.packagingId &&
          m.readiness === input.readiness,
      );

      const seriesRow = (seriesRows as { id: number; name: string; prefix: string | null }[]).find(
        s => s.id === input.seriesId,
      );
      const color = (colors as { id: number; code: string; name: string }[]).find(
        c => c.id === input.colorId,
      );
      const family = (families as { id: number; code: string; skuSegment: string | null }[]).find(
        f => f.id === input.familyId,
      );
      const pack = (packagings as { id: number; code: string; skuSegment: string | null }[]).find(
        p => p.id === input.packagingId,
      );

      let masterId: number;
      let created = false;
      if (existingCube) {
        masterId = existingCube.id as number;
      } else {
        const baseCode = buildBaseCode({
          brand: "aoc",
          seriesPrefix: seriesRow?.prefix ?? null,
          colorCode: color?.code,
        });
        masterId = await db.createMasterProduct({
          seriesId: input.seriesId,
          colorId: input.colorId,
          familyId: input.familyId,
          packagingId: input.packagingId,
          readiness: input.readiness,
          baseCode,
          internalSku: buildInternalSku({
            baseCode,
            familySegment: family?.skuSegment ?? family?.code,
            packagingSegment: pack?.skuSegment ?? pack?.code,
            readiness: input.readiness,
          }),
          // Pazaryerinde zaten satılıyor: taslak değil aktif açılır, yoksa
          // ilan kapalı sayılıp stok gönderimi dışında kalır.
          status: "aktif",
          basePrice: String(input.basePrice ?? num(item.unitPrice)),
          // Ürün gerçekte satıldığı için satışı kapasiteye bağlamıyoruz;
          // reçetesi bağlanana kadar "üretemediğini satamama" durumu doğardı.
          salesMode: "tedarikli",
        });
        created = true;
      }

      // İç ilan: başlık pazaryerinden gelen adla açılır — elle yazmak zorunda
      // kalmamak için. Zaten ilanı varsa yenisi açılmaz.
      const listingRows = await db.listListingsByMaster(masterId);
      let listingId = (listingRows as { id: number }[])[0]?.id ?? null;
      if (listingId == null) {
        const generic = (useCases as { id: number; code: string }[])[0];
        listingId = await db.createListing({
          masterId,
          useCaseId: generic?.id ?? 1,
          title: productName.slice(0, 255),
          slug: buildSlug(productName),
          isPrimary: 1,
          // İlanın kendi durumu: taslak|aktif|arsiv. "canli" KANAL yayınının
          // durumudur (aşağıdaki createChannelListing) — ikisi ayrı enum.
          // Ürün pazaryerinde zaten satıldığı için taslak değil aktif açılır.
          status: "aktif",
        });
      }

      // Kanal ilanı: barkodu SAKLAMAK bu işin tekrar edilmemesini sağlar —
      // aynı üründen sonraki sipariş kendiliğinden bağlanır.
      if (channelRef && input.channelId) {
        const already = (channelListingRows as Record<string, unknown>[]).some(
          c => c.channelId === input.channelId && c.channelBarcode === channelRef,
        );
        if (!already) {
          await db.createChannelListing({
            listingId,
            masterId,
            channelId: input.channelId,
            channelSku: channelRef.slice(0, 96),
            channelBarcode: channelRef.slice(0, 64),
            price: String(input.basePrice ?? num(item.unitPrice)),
            status: "canli",
          });
        }
      }

      // Aynı kanal kodunu taşıyan TÜM bağsız satırlar bağlanır: geçmiş
      // siparişler de tek işlemde raporlara girsin.
      const bound = channelRef
        ? await db.bindOrderItemsByChannelRef(channelRef, masterId)
        : (await db.bindOrderItem(input.itemId, masterId), 1);

      await runCapacityRecompute();
      return {
        masterId,
        created,
        reason: created ? ("yeni" as const) : ("kup" as const),
        bound,
      };
    }),

  /* ---- Getiri: hangi renk para kazandırıyor ----------------------------- */

  /**
   * Master ve seri başına satış/ciro/kâr + ölü renkler.
   *
   * `orderItems.masterId` bağına dayanır. Bağı olmayan kalem hesaba GİRMEZ —
   * yanlış master'a ciro yazmaktansa dışarıda kalır; bağsız sayısı ayrıca
   * bildirilir ki rakamın ne kadarının eksik olduğu görünsün.
   */
  revenue: protectedProcedure
    .input(z.object({ days: z.number().min(0).max(3650).default(90) }).default({ days: 90 }))
    .query(async ({ input }) => {
      const [items, orders, series, colors, packagings] = await Promise.all([
        db.listAllOrderItems(),
        db.listOrders(),
        db.listProductSeries(),
        db.listColors(),
        db.listPackagings(),
      ]);
      const data = await loadCapacityInputs();
      const laborOverheadValue = await unitLaborOverheadValue();
      const costs = computeMasterCosts({
        masters: data.masters,
        materials: data.costMaterials,
        formulas: data.formulas,
        packagings: data.packagings,
        unitLaborOverhead: laborOverheadValue,
      });
      const unitCosts = new Map(costs.map(c => [c.masterId, c.totalCost]));

      const orderRow = new Map(
        (orders as Record<string, unknown>[]).map(o => [
          o.id as number,
          { status: String(o.status ?? ""), createdAt: o.createdAt as Date },
        ]),
      );

      let unbound = 0;
      const lines = (items as Record<string, unknown>[]).map(i => {
        const order = orderRow.get(i.orderId as number);
        if (i.masterId == null) unbound += 1;
        return {
          masterId: (i.masterId as number | null) ?? null,
          orderId: i.orderId as number,
          quantity: num(i.quantity),
          unitPrice: num(i.unitPrice),
          soldAt: order?.createdAt ?? (i.createdAt as Date) ?? new Date(),
          cancelled: order?.status === "cancelled",
        };
      });

      const revenue = computeMasterRevenue({
        lines,
        unitCosts,
        since: windowStart(input.days),
      });

      const masters = data.masters as Record<string, unknown>[];
      const seriesOf = new Map(masters.map(m => [m.id as number, m.seriesId as number]));
      const colorName = new Map((colors as { id: number; name: string }[]).map(c => [c.id, c.name]));
      const packName = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p.name]));
      const seriesName = new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name]));
      const masterById = new Map(masters.map(m => [m.id as number, m]));

      const label = (masterId: number) => {
        const m = masterById.get(masterId);
        if (!m) return `#${masterId}`;
        return [
          colorName.get(m.colorId as number) ?? "",
          packName.get(m.packagingId as number) ?? "",
        ]
          .filter(Boolean)
          .join(" · ");
      };

      const activeIds = masters.filter(m => m.status === "aktif").map(m => m.id as number);

      return {
        days: input.days,
        unboundItemCount: unbound,
        masters: revenue.map(r => ({ ...r, label: label(r.masterId) })),
        series: rollupRevenueBySeries(revenue, seriesOf).map(s => ({
          ...s,
          name: seriesName.get(s.seriesId) ?? `#${s.seriesId}`,
        })),
        dead: findDeadMasters({ activeMasterIds: activeIds, revenue }).map(d => ({
          ...d,
          label: label(d.masterId),
        })),
      };
    }),

  /* ---- Master görselleri: ilanlar devralır ------------------------------ */

  addMasterImage: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        url: z.string().url("Geçerli bir görsel adresi girin").nullish(),
        /** Yüklenen dosya (data URL). Adres yerine bu verilebilir. */
        data: z.string().min(1).nullish(),
        role: z.string().max(32).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.url && !input.data) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dosya yükleyin ya da adres girin" });
      }
      await db.addMasterImage(input);
      return { ok: true };
    }),

  /**
   * Bir görseli o rengin tüm ambalajlarına birden atar.
   *
   * 30/100/250/500 ml aynı fotoğrafı kullanır; tek tek eklemek dört kat işti.
   */
  assignImageToColor: protectedProcedure
    .input(
      z.object({
        colorId: z.number(),
        /** Verilirse yalnız o serinin ürünleri; boşsa rengin tüm ürünleri. */
        seriesId: z.number().nullish(),
        url: z.string().url("Geçerli bir görsel adresi girin").nullish(),
        data: z.string().min(1).nullish(),
        role: z.string().max(32).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.url && !input.data) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dosya yükleyin ya da adres girin" });
      }
      return db.assignImageToColor(input);
    }),

  deleteMasterImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteMasterImage(input.id);
      return { ok: true };
    }),

  /**
   * Görseli eksik ürünler — RENGE göre gruplanır.
   *
   * Ürün ürün listelemek yanıltıcı olurdu: 40 eksik satır aslında 10 renk
   * demek ve renk başına tek görsel hepsini kapatır. İş listesi o yüzden
   * renk düzleminde verilir.
   */
  missingImages: protectedProcedure.query(async () => {
    const [rows, colors, series] = await Promise.all([
      db.listMastersMissingImages(),
      db.listColors(),
      db.listProductSeries(),
    ]);
    const colorName = new Map(
      (colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]),
    );
    const seriesName = new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name]));

    const groups = new Map<string, {
      colorId: number;
      seriesId: number;
      colorName: string;
      hex: string | null;
      seriesName: string;
      count: number;
    }>();
    for (const r of rows as Record<string, unknown>[]) {
      const colorId = r.colorId as number;
      const seriesId = r.seriesId as number;
      const key = `${seriesId}|${colorId}`;
      const g = groups.get(key) ?? {
        colorId,
        seriesId,
        colorName: colorName.get(colorId)?.name ?? `#${colorId}`,
        hex: colorName.get(colorId)?.hex ?? null,
        seriesName: seriesName.get(seriesId) ?? `#${seriesId}`,
        count: 0,
      };
      g.count += 1;
      groups.set(key, g);
    }
    return {
      totalMasters: (rows as unknown[]).length,
      groups: Array.from(groups.values()).sort((a, b) => b.count - a.count),
    };
  }),

  /* ---- Pazaryeri özellikleri: master'ın küpünden ------------------------ */

  channelAttributes: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(({ input }) => db.listChannelAttributes(input.channelId)),

  saveChannelAttribute: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        categoryId: z.string().min(1),
        attributeId: z.number(),
        attributeName: z.string().max(160).nullish(),
        source: z.enum(["renk", "ambalaj", "form", "seri", "hacim", "sabit"]),
        constantValueId: z.number().nullish(),
        constantText: z.string().max(255).nullish(),
        isRequired: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      await db.upsertChannelAttribute(input);
      return { ok: true };
    }),

  deleteChannelAttribute: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteChannelAttribute(input.id);
      return { ok: true };
    }),

  /**
   * Bir sabit değeri kanaldaki TÜM kategorilere yayar.
   *
   * Trendyol'un yasal alanları (Üretici Adı, İthalatçı Mail Adresi, Menşei…)
   * her kategoride aynı kimlikle ve aynı değerle tekrarlanır. Elle doldurmak
   * 18 alan × kategori sayısı kadar aynı metni yazmak demekti; bir kategoride
   * girilen değer buradan diğerlerine kopyalanır. Yalnız aynı özellik kimliği
   * tanımlı kategorilere yazılır — olmayan yere satır uydurulmaz.
   */
  applyChannelAttributeConstant: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        attributeId: z.number(),
        constantValueId: z.number().nullish(),
        constantText: z.string().max(255).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = (await db.listChannelAttributes(input.channelId)) as Record<string, unknown>[];
      const targets = rows.filter(
        r => (r.attributeId as number) === input.attributeId && String(r.source) === "sabit",
      );
      for (const r of targets) {
        await db.upsertChannelAttribute({
          channelId: input.channelId,
          categoryId: String(r.categoryId),
          attributeId: input.attributeId,
          attributeName: (r.attributeName as string | null) ?? null,
          source: "sabit",
          constantValueId: input.constantValueId ?? null,
          constantText: input.constantText ?? null,
          isRequired: Number(r.isRequired ?? 1) === 1,
        });
      }
      return { applied: targets.length };
    }),

  /**
   * Kategorinin zorunlu özelliklerini Trendyol'dan çeker ve tanım olarak
   * kaydeder. `source` ada bakılarak tahmin edilir (Renk → renk ekseni);
   * tahmin yalnız YENİ satırda uygulanır — kullanıcının seçtiği kaynak
   * yeniden içe aktarmada ezilmez.
   */
  importChannelAttributes: protectedProcedure
    .input(z.object({ channelId: z.number(), categoryId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const categoryId = Number(input.categoryId);
      if (!categoryId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kategori kimliği sayı olmalı" });
      }
      /*
       * Özellikler kanalın KENDİ ucundan çekilir. Eskiden kanal ne olursa olsun
       * Trendyol'a sorulurdu: Hepsiburada kategorisiyle (ör. 60007334) Trendyol'a
       * gidilince "category.not.found" 404'ü dönüyordu — kullanıcı Hepsiburada
       * ekranındayken Trendyol hatası görüyordu.
       */
      const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
      const channel = channels.find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      let rows: NormalizedAttribute[];
      try {
        if (channel.code === "trendyol") {
          rows = normalizeTrendyolAttributes(await fetchTrendyolCategoryAttributes(categoryId));
        } else if (channel.code === "hepsiburada") {
          rows = normalizeHepsiburadaAttributes(await fetchHepsiburadaCategoryAttributes(categoryId));
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${channel.code}" kanalı için özellik listesi çekilemiyor — özellikleri elle tanımlayın.`,
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Kategori özellikleri alınamadı",
        });
      }

      /*
       * Boş sonuç sessizce "0 özellik" diye geçiyordu; kullanıcı neyin yanlış
       * olduğunu anlamıyordu. Kategori yanlışsa ya da yanıt beklenmedik şekilde
       * geldiyse bunu söylemek gerekir.
       */
      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Bu kategori için özellik alınamadı (kategori ${input.categoryId}). ` +
            `Kategori kimliği ${channel.code} tarafında geçerli mi kontrol edin — ` +
            `Kategori Eşlemesi sekmesinden pazaryeri ağacından seçmek en güvenlisi.`,
        });
      }

      const existing = (await db.listChannelAttributes(input.channelId)) as Record<string, unknown>[];
      const inCategory = new Map(
        existing
          .filter(e => String(e.categoryId) === input.categoryId)
          .map(e => [e.attributeId as number, String(e.source ?? "sabit")]),
      );

      let added = 0;
      let updated = 0;
      let options = 0;
      let repaired = 0;
      for (const row of rows) {
        const previousSource = inCategory.get(row.attributeId);
        const isNew = previousSource === undefined;
        /*
         * Yasal/kurumsal alan bir eksene bağlanmışsa bu eski hatalı tahmindir
         * ("Paket Görseli" → ambalaj) ve kullanıcı düzeltemeden ekranda
         * eşlenemeyen bir panel üretir. Yeniden çekmek düzeltsin: kaynak
         * "sabit"e çekilir, girilmiş sabit değer korunur.
         */
        const needsRepair =
          !isNew && previousSource !== "sabit" && isConstantOnlyAttribute(row.attributeName);
        if (needsRepair) repaired += 1;
        await db.upsertChannelAttribute({
          channelId: input.channelId,
          categoryId: input.categoryId,
          attributeId: row.attributeId,
          attributeName: row.attributeName,
          source: guessSource(row.attributeName),
          isRequired: row.isRequired,
          // Mevcut satırda kullanıcının seçimi korunur.
          keepSource: !isNew && !needsRepair,
          keepConstants: true,
        });
        // Seçenek kataloğu: eşlemeyi elle YAZMAK yerine SEÇMEYİ mümkün kılar.
        await db.replaceChannelAttributeOptions(
          input.channelId,
          input.categoryId,
          row.attributeId,
          row.options,
        );
        options += row.options.length;
        if (isNew) added += 1;
        else updated += 1;
      }
      return { added, updated, total: rows.length, options, repaired };
    }),

  /**
   * Pazaryeri ↔ Kokpit ürün mutabakatı.
   *
   * "Trendyol'daki ürünler sistemde var mı, güncelleyebilir miyim?" sorusunun
   * cevabı. Güncelleme yalnız iki tarafta da kaydı olan ürün için mümkün;
   * bu uç hangilerinin öyle olduğunu ve kalanların neden olmadığını söyler.
   */
  reconcileMarketplace: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .mutation(async ({ input }) => {
      const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
      const channel = channels.find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });
      if (channel.code !== "trendyol") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${channel.code}" kanalı için ürün listesi çekilemiyor — şimdilik yalnız Trendyol.`,
        });
      }

      let remoteRows;
      try {
        remoteRows = await fetchTrendyolProducts();
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Pazaryeri ürün listesi alınamadı",
        });
      }

      const [channelListings, listings] = await Promise.all([
        db.listChannelListings(),
        db.listListings(),
      ]);
      const titleById = new Map(
        (listings as Record<string, unknown>[]).map(l => [l.id as number, String(l.title ?? "")]),
      );

      const localRows = (channelListings as Record<string, unknown>[])
        .filter(c => c.channelId === input.channelId)
        .map(c => ({
          channelListingId: c.id as number,
          barcode: String(c.channelBarcode ?? ""),
          sku: String(c.channelSku ?? ""),
          title: titleById.get(c.listingId as number) ?? String(c.channelSku ?? ""),
        }));

      const result = reconcileCatalogs(
        localRows,
        remoteRows.map(r => ({
          barcode: r.barcode,
          title: r.title,
          stockCode: r.stockCode,
          approved: r.approved,
          onSale: r.onSale,
          quantity: r.quantity,
          salePrice: r.salePrice,
        })),
      );

      /*
       * "Bu ürün Kokpit'te ne olur?" cevabı aynı çağrıda dönüyor.
       *
       * Önce yalnız karşılaştırma dönüyordu; ürün oluşturmak için ekranda ayrı
       * bir panel açıp İKİNCİ bir önizleme çalıştırmak gerekiyordu. Kullanıcı
       * ortada sadece metin listesi görüyor, pazaryerindeki ürünün nasıl ürün
       * olacağını anlamıyordu. Karşılık ve eksik burada hesaplanır ki tek
       * satırda "şu olacak" ya da "şu eksik" yazabilelim.
       */
      const [colors, packagings, families, attrDefs] = await Promise.all([
        db.listColors(),
        db.listPackagings(),
        db.listProductFamilies(),
        db.listChannelAttributes(input.channelId),
      ]);
      const dim = (rows: unknown) =>
        (rows as Record<string, unknown>[]).map(r => ({
          id: r.id as number,
          name: String(r.name ?? ""),
        }));

      /*
       * Hangi pazaryeri özelliğinin hangi eksenimize denk geldiği TAHMİN
       * EDİLMEZ: kullanıcı bunu Özellik Eşlemesi'nde belirliyor. İçe aktarma
       * eskiden ad tahmini yapıyordu ve Trendyol'un "Renk" özelliği bu
       * katalogda YARI-MAT, ŞEFFAF gibi yüzey değerleri taşıdığı için
       * bunları renk sanıyordu.
       */
      const axisMapping = buildAxisMapping(attrDefs);

      const byBarcode = new Map(remoteRows.map(r => [r.barcode, r]));
      const plan = planProductImport({
        candidates: result.onlyRemote.map(x => ({
          barcode: x.remote.barcode,
          title: x.remote.title,
          stockCode: x.remote.stockCode,
          salePrice: x.remote.salePrice,
          attributes: byBarcode.get(x.remote.barcode)?.attributes ?? [],
        })),
        colors: dim(colors),
        packagings: dim(packagings),
        families: dim(families),
        axisMapping,
      });
      const planByBarcode = new Map(
        [...plan.ready, ...plan.blocked].map(r => [r.candidate.barcode, r]),
      );

      return {
        summary: {
          ...reconcileSummary(result),
          creatable: plan.ready.length,
          // Eşleme kurulmamışsa ekran uyarır: okuma ad tahminine düşer.
          axisMapped: Object.keys(axisMapping).length,
        },
        // Ekran listeleri sınırlanır: binlerce satır tarayıcıyı kilitler.
        matched: result.matched.slice(0, 200),
        onlyRemote: result.onlyRemote.slice(0, 200).map(x => {
          const p = planByBarcode.get(x.remote.barcode);
          return {
            ...x,
            colorName: p?.colorName ?? null,
            packagingName: p?.packagingName ?? null,
            familyName: p?.familyName ?? null,
            missing: p?.missing ?? [],
            suggested: p?.suggested ?? [],
          };
        }),
        onlyLocal: result.onlyLocal.slice(0, 200),
        missingDefinitions: plan.missingDefinitions,
      };
    }),

  /**
   * Gönderim önizlemesinden tek ilanı düzeltir.
   *
   * Metin normalde içerik zincirinden (blok → seri) türetilir. Buradaki yazma
   * o ilana ÖZELDİR ve zinciri ezer: tek bir ilanın başlığını düzeltmek için
   * blok metnini değiştirmek, aynı bloğu paylaşan bütün ilanları etkilerdi.
   */
  saveListingForPush: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        channelListingId: z.number().optional(),
        title: z.string().trim().min(1).optional(),
        longDescription: z.string().optional(),
        price: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.longDescription !== undefined) patch.longDescription = input.longDescription;
      if (Object.keys(patch).length > 0) {
        await db.updateListing(input.listingId, patch as never);
      }

      if (input.price !== undefined && input.channelListingId) {
        // Fiyat değişince satır kirlenir ki stok/fiyat gönderimi de yakalasın.
        await db.updateChannelListing(input.channelListingId, {
          price: String(input.price),
          syncState: "kirli",
        } as never);
      }
      return { ok: true };
    }),

  /**
   * Pazaryerinde olup Kokpit'te olmayan ürünlerden master üretir.
   *
   * Kataloğumuz küp (seri × renk × ambalaj × form); pazaryeri kaydı bu
   * koordinatları taşımaz, yalnız başlık taşır. Koordinat başlıktan çözülür ve
   * SADECE Tanımlar'da mevcut boyut değerleri eşleşir — başlıkta geçen ama
   * tanımlı olmayan bir renk için yeni renk yaratılmaz. Çözülemeyen ürün
   * oluşturulmaz, nedeni bildirilir.
   *
   * Seri başlıkta genelde geçmediği için parti başına dışarıdan verilir.
   */
  importFromMarketplace: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        seriesId: z.number(),
        useCaseId: z.number(),
        barcodes: z.array(z.string()).default([]),
        /** Pazaryerinden okunan ama Tanımlar'da olmayan değerler eklensin mi? */
        createMissingDefinitions: z.boolean().default(false),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
      const channel = channels.find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });
      if (channel.code !== "trendyol") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${channel.code}" kanalı için içe aktarma şimdilik yok.`,
        });
      }

      const [remoteRows, channelListings, colors, packagings, families, series] = await Promise.all([
        fetchTrendyolProducts(),
        db.listChannelListings(),
        db.listColors(),
        db.listPackagings(),
        db.listProductFamilies(),
        db.listProductSeries(),
      ]);

      const seriesRow = (series as Record<string, unknown>[]).find(s => s.id === input.seriesId);
      if (!seriesRow) throw new TRPCError({ code: "NOT_FOUND", message: "Seri bulunamadı" });

      // Zaten bizde olan barkodlar aday değil.
      const known = new Set(
        (channelListings as Record<string, unknown>[])
          .filter(c => c.channelId === input.channelId)
          .map(c => String(c.channelBarcode ?? "").trim().toLocaleLowerCase("tr")),
      );
      const wanted = new Set(input.barcodes.map(b => b.trim()));
      const candidates = remoteRows
        .filter(r => !known.has(r.barcode.trim().toLocaleLowerCase("tr")))
        .filter(r => wanted.size === 0 || wanted.has(r.barcode.trim()))
        .map(r => ({
          barcode: r.barcode,
          title: r.title,
          stockCode: r.stockCode,
          salePrice: r.salePrice,
        }));

      const dim = (rows: unknown) =>
        (rows as Record<string, unknown>[]).map(r => ({
          id: r.id as number,
          name: String(r.name ?? ""),
        }));

      const plan = planProductImport({
        candidates: candidates.map(c => ({ ...c })),
        colors: dim(colors),
        packagings: dim(packagings),
        families: dim(families),
      });

      if (input.dryRun) {
        return {
          dryRun: true,
          created: 0,
          createdDefinitions: 0,
          ready: plan.ready.slice(0, 200),
          blocked: plan.blocked.slice(0, 200),
          missingDefinitions: plan.missingDefinitions,
          readyCount: plan.ready.length,
          blockedCount: plan.blocked.length,
        };
      }

      /*
       * Eksik tanımları oluşturma — yalnız istenirse.
       *
       * Pazaryerinden okunan renk/ambalaj/form adları Tanımlar'da yoksa ürün
       * oluşturulamıyordu ve kullanıcı her birini elle eklemek zorundaydı.
       * Yine de sessizce yapılmaz: tanım yaratmak kataloğu kalıcı olarak
       * büyütür, kararı kullanıcı verir.
       */
      let createdDefinitions = 0;
      let effectivePlan = plan;
      if (input.createMissingDefinitions && plan.missingDefinitions.length > 0) {
        const table = { renk: "colors", ambalaj: "packagings", form: "families" } as const;
        for (const def of plan.missingDefinitions) {
          try {
            await db.createDimension(table[def.axis], { name: def.name, isActive: 1 });
            createdDefinitions += 1;
          } catch (error) {
            console.error(`[katalog] ${def.axis} tanımı eklenemedi (${def.name}):`, error);
          }
        }
        // Plan yeni tanımlarla YENİDEN kurulur; yoksa az önce eklenen renk
        // için ürün hâlâ "çözülemedi" sayılır ve içe aktarma boşa çıkardı.
        if (createdDefinitions > 0) {
          const [c2, p2, f2] = await Promise.all([
            db.listColors(),
            db.listPackagings(),
            db.listProductFamilies(),
          ]);
          effectivePlan = planProductImport({
            candidates: candidates.map(c => ({ ...c })),
            colors: dim(c2),
            packagings: dim(p2),
            families: dim(f2),
          });
        }
      }

      /*
       * Yazma: master → ilan → kanal yayını. Bir kalemin hatası partiyi
       * durdurmaz; kalanlar yazılır ve hata bildirilir. Yarım kalan bir
       * içe aktarma, hiç olmayandan iyidir ama sessiz olmamalı.
       */
      let created = 0;
      const failures: string[] = [];
      const brand = "Artofcolour";

      for (const row of effectivePlan.ready) {
        try {
          const baseCode = buildBaseCode({
            brand,
            seriesPrefix: (seriesRow.prefix as string | null) ?? String(seriesRow.name ?? ""),
            colorCode: row.colorName,
          });
          const internalSku = buildInternalSku({
            baseCode,
            familySegment: row.familyName,
            packagingSegment: row.packagingName,
          });

          const masterId = await db.createMasterProduct({
            seriesId: input.seriesId,
            colorId: row.colorId!,
            familyId: row.familyId!,
            packagingId: row.packagingId!,
            baseCode,
            internalSku,
            status: "aktif",
            basePrice: String(row.candidate.salePrice || 0),
          } as never);

          const listingId = await db.createListing({
            masterId,
            useCaseId: input.useCaseId,
            title: row.candidate.title,
            slug: buildSlug(row.candidate.title),
          } as never);

          await db.createChannelListing({
            listingId,
            masterId,
            channelId: input.channelId,
            // Pazaryerindeki gerçek değerler: bağ buradan kurulur, yenisi
            // üretilirse aynı ürün ikinci kez açılırdı.
            channelSku: row.candidate.stockCode || internalSku,
            channelBarcode: row.candidate.barcode,
            price: String(row.candidate.salePrice || 0),
            status: "canli",
            syncState: "temiz",
          } as never);

          created += 1;
        } catch (error) {
          failures.push(
            `${row.candidate.title}: ${error instanceof Error ? error.message : "yazılamadı"}`,
          );
        }
      }

      return {
        dryRun: false,
        created,
        createdDefinitions,
        ready: [],
        blocked: effectivePlan.blocked.slice(0, 200),
        missingDefinitions: effectivePlan.missingDefinitions,
        readyCount: effectivePlan.ready.length,
        blockedCount: effectivePlan.blocked.length,
        failures,
      };
    }),

  /**
   * Pazaryerindeki bir ürünü bizdeki ilana bağlar (barkodu ona çevirir).
   *
   * Bağlandıktan sonra güncellemeler o ürüne gider. Yanlış bağlama, sonraki
   * güncellemede BAŞKA bir ürünün başlığını ezeceği için otomatik yapılmaz;
   * kullanıcı onaylar.
   */
  linkMarketplaceProduct: protectedProcedure
    .input(z.object({ channelListingId: z.number(), barcode: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const rows = (await db.listChannelListings()) as Record<string, unknown>[];
      const target = rows.find(r => r.id === input.channelListingId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "İlan bulunamadı" });

      // Barkod kanal içinde tekil: başka ilan bu barkodu tutuyorsa çakışır.
      const clash = rows.find(
        r =>
          r.channelId === target.channelId &&
          r.id !== target.id &&
          String(r.channelBarcode ?? "").trim() === input.barcode.trim(),
      );
      if (clash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bu barkod başka bir ilana bağlı (${String(clash.channelSku ?? clash.id)}). Önce onu çözün.`,
        });
      }

      await db.setChannelListingBarcode(input.channelListingId, input.barcode.trim());
      return { ok: true };
    }),

  /**
   * Son gönderim partileri ve sonuçları.
   *
   * Kart gönderiliyor, sonuç asenkron geliyor ve kullanıcı ne olduğunu
   * göremiyordu — "gitti mi, açıldı mı, neden açılmadı?" sorusunun ekranda
   * karşılığı yoktu.
   */
  marketplaceBatches: protectedProcedure
    .input(z.object({ marketplace: z.string().optional(), limit: z.number().max(200).default(50) }))
    .query(({ input }) => db.listMarketplaceBatchJobs(input.marketplace, input.limit)),

  /** Pazaryerinin kabul ettiği değerler — eşleme ekranındaki seçim listesi. */
  channelAttributeOptions: protectedProcedure
    .input(z.object({ channelId: z.number(), categoryId: z.string().optional() }))
    .query(({ input }) => db.listChannelAttributeOptions(input.channelId, input.categoryId)),

  /**
   * Eşlenmemiş boyut değerlerini pazaryeri seçenekleriyle ada göre eşleştirir.
   *
   * `dryRun` ile ne yazılacağı önce gösterilir — yanlış değer ürünü yanlış
   * renkle listeler, onaysız yazılmaz. Yalnız EKSİK olanlara dokunur; kullanıcı
   * elle düzelttiği bir eşleme varsa üzerine yazmaz.
   */
  autoMatchAttributeValues: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        categoryId: z.string().min(1),
        attributeId: z.number(),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [defs, existing, options, colors, packagings, families, series] = await Promise.all([
        db.listChannelAttributes(input.channelId),
        db.listChannelAttributeValues(input.channelId),
        db.listChannelAttributeOptions(input.channelId, input.categoryId),
        db.listColors(),
        db.listPackagings(),
        db.listProductFamilies(),
        db.listProductSeries(),
      ]);

      const def = (defs as Record<string, unknown>[]).find(
        d => d.attributeId === input.attributeId && String(d.categoryId) === input.categoryId,
      );
      if (!def) throw new TRPCError({ code: "NOT_FOUND", message: "Özellik tanımı bulunamadı" });

      const kind = String(def.source);
      if (kind === "sabit" || kind === "hacim") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bu özellik bir eksene bağlı değil — otomatik eşleme yalnız eksenli özellikler için.",
        });
      }

      const src =
        kind === "renk" ? colors : kind === "ambalaj" ? packagings : kind === "form" ? families : series;
      const already = new Set(
        (existing as Record<string, unknown>[])
          .filter(v => v.attributeId === input.attributeId)
          .map(v => v.dimensionId as number),
      );
      // Elle eşlenmişe dokunulmaz: otomatik eşleme kullanıcının kararını ezmez.
      const pending = (src as Record<string, unknown>[])
        .map(r => ({ id: r.id as number, name: String(r.name ?? "") }))
        .filter(r => !already.has(r.id));

      const { proposals, unmatched } = matchAttributeValues(
        pending,
        (options as Record<string, unknown>[]).map(o => ({
          valueId: o.valueId as number,
          valueName: String(o.valueName ?? ""),
        })),
      );

      if (input.dryRun) {
        return { dryRun: true, applied: 0, proposals, unmatched };
      }

      for (const p of proposals) {
        await db.upsertChannelAttributeValue({
          channelId: input.channelId,
          attributeId: input.attributeId,
          dimensionKind: kind as "renk" | "ambalaj" | "form" | "seri",
          dimensionId: p.dimensionId,
          attributeValueId: p.valueId,
          attributeText: null,
        });
      }
      return { dryRun: false, applied: proposals.length, proposals, unmatched };
    }),

  channelAttributeValues: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(({ input }) => db.listChannelAttributeValues(input.channelId)),

  saveChannelAttributeValue: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        attributeId: z.number(),
        dimensionKind: z.enum(["renk", "ambalaj", "form", "seri"]),
        dimensionId: z.number(),
        attributeValueId: z.number().nullish(),
        attributeText: z.string().max(255).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.attributeValueId && !input.attributeText?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Değer kimliği ya da metin girin — boş eşleme kartı düşürür",
        });
      }
      await db.upsertChannelAttributeValue(input);
      return { ok: true };
    }),

  deleteChannelAttributeValue: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteChannelAttributeValue(input.id);
      return { ok: true };
    }),

  /**
   * Eşleme karnesi: hangi özellik hangi boyut değerinde boş kalmış.
   *
   * Kart açma anında "eşleme yok" hatası almak yerine önceden görülür;
   * ekran doğrudan doldurulacak listeyi verir.
   */
  attributeCoverage: protectedProcedure
    .input(z.object({ channelId: z.number() }))
    .query(async ({ input }) => {
      const [defs, values, colors, packagings, families, series] = await Promise.all([
        db.listChannelAttributes(input.channelId),
        db.listChannelAttributeValues(input.channelId),
        db.listColors(),
        db.listPackagings(),
        db.listProductFamilies(),
        db.listProductSeries(),
      ]);
      const mapped = new Set(
        (values as Record<string, unknown>[]).map(
          v => `${v.attributeId}|${v.dimensionKind}|${v.dimensionId}`,
        ),
      );
      const dimensionRows = (kind: string): { id: number; name: string }[] => {
        const src =
          kind === "renk"
            ? colors
            : kind === "ambalaj"
              ? packagings
              : kind === "form"
                ? families
                : series;
        return (src as Record<string, unknown>[]).map(r => ({
          id: r.id as number,
          name: String(r.name ?? ""),
        }));
      };

      return (defs as Record<string, unknown>[])
        .filter(d => d.source !== "sabit" && d.source !== "hacim")
        .map(d => {
          const kind = String(d.source);
          const rows = dimensionRows(kind);
          const missing = rows.filter(
            r => !mapped.has(`${d.attributeId}|${kind}|${r.id}`),
          );
          return {
            id: d.id as number,
            categoryId: String(d.categoryId ?? ""),
            attributeId: d.attributeId as number,
            attributeName: (d.attributeName as string | null) ?? null,
            source: kind,
            isRequired: Number(d.isRequired ?? 1) === 1,
            total: rows.length,
            mapped: rows.length - missing.length,
            missing: missing.slice(0, 50),
          };
        });
    }),

  /**
   * Trendyol'da SIFIRDAN ürün kartı açar. Eski uç erişilemez hale gelen
   * ProductDetail sayfasında kalmıştı; mantık v3 nesnelerine taşındı.
   * Sonuç asenkron: batchRequestId ile sorgulanır.
   */
  /*
   * Trendyol keşif araçları — Ayarlar'daki marka/kategori alanlarını doldurmak
   * için. Emekli `products` router'ındaydı; kart gönderimi burada olduğu için
   * buraya taşındı.
   */
  trendyolBrandSearch: protectedProcedure
    .input(z.object({ name: z.string().min(2) }))
    .mutation(async ({ input }) => {
      try {
        return await searchTrendyolBrands(input.name);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Marka araması başarısız",
        });
      }
    }),

  trendyolCategoryAttributes: protectedProcedure
    .input(z.object({ categoryId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await fetchTrendyolCategoryAttributes(input.categoryId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Kategori özellikleri alınamadı",
        });
      }
    }),

  pushCardsToTrendyol: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        seriesIds: z.array(z.number()).default([]),
        includeUnbuildable: z.boolean().default(false),
        /** Pazaryerinde zaten kayıtlı olanlar güncellensin mi? */
        updateExisting: z.boolean().default(true),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const cfg = parseCardSettings(await db.getSettings());
      if (!cfg.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Trendyol ürün açma ayarları eksik: ${cfg.missing.join(" · ")} (Ayarlar sayfasından girin)`,
        });
      }

      const [
        channelListings,
        listings,
        masters,
        images,
        mImages,
        packagings,
        series,
        attrDefs,
        attrValues,
      ] = await Promise.all([
        db.listChannelListings(),
        db.listListings(),
        db.listMasterProducts(),
        db.listListingImages(),
        db.listMasterImages(),
        db.listPackagings(),
        db.listProductSeries(),
        db.listChannelAttributes(input.channelId),
        db.listChannelAttributeValues(input.channelId),
      ]);

      const imagesByListing = new Map<number, ImageRow[]>();
      for (const img of images as { listingId: number; url: string; sortOrder: number }[]) {
        const row = { url: img.url, sortOrder: Number(img.sortOrder ?? 0) };
        imagesByListing.set(img.listingId, [...(imagesByListing.get(img.listingId) ?? []), row]);
      }
      const imagesByMaster = new Map<number, ImageRow[]>();
      for (const img of mImages as { id: number; masterId: number; url: string | null; sortOrder: number }[]) {
        // `id` taşınır: yüklenen görselin adresi ondan türetilir.
        const row = { id: img.id, url: img.url, sortOrder: Number(img.sortOrder ?? 0) };
        imagesByMaster.set(img.masterId, [...(imagesByMaster.get(img.masterId) ?? []), row]);
      }

      const packagingById = new Map(
        (packagings as Record<string, unknown>[]).map(p => [
          p.id as number,
          {
            volumeMl: p.volumeMl != null ? num(p.volumeMl) : null,
            weightG: p.weightG != null ? num(p.weightG) : null,
            desi: p.desi != null ? num(p.desi) : null,
          },
        ]),
      );
      const seriesById = new Map(
        (series as Record<string, unknown>[]).map(s => [
          s.id as number,
          { vatRate: s.vatRate != null ? num(s.vatRate) : null },
        ]),
      );

      // Özellik tanımları kategori başına gruplanır — eşleme yoksa harita boş
      // kalır ve eski sabit liste devreye girer.
      const defsByCategory: Record<string, ChannelAttributeDef[]> = {};
      for (const a of attrDefs as Record<string, unknown>[]) {
        const key = String(a.categoryId ?? "");
        (defsByCategory[key] ??= []).push({
          attributeId: a.attributeId as number,
          attributeName: (a.attributeName as string | null) ?? null,
          source: a.source as ChannelAttributeDef["source"],
          constantValueId: (a.constantValueId as number | null) ?? null,
          constantText: (a.constantText as string | null) ?? null,
          isRequired: Number(a.isRequired ?? 1) === 1,
        });
      }

      const wantedSeries = input.seriesIds.length ? new Set(input.seriesIds) : null;
      const masterRows = (masters as Record<string, unknown>[]).filter(
        m => !wantedSeries || wantedSeries.has(m.seriesId as number),
      );
      const allowed = new Set(masterRows.map(m => m.id as number));

      const { items, problems } = mapToTrendyolCards({
        channelListings: (channelListings as Record<string, unknown>[])
          .filter(c => c.channelId === input.channelId && allowed.has(c.masterId as number))
          .map(c => ({
            id: c.id as number,
            listingId: c.listingId as number,
            masterId: c.masterId as number,
            channelSku: String(c.channelSku ?? ""),
            channelBarcode: String(c.channelBarcode ?? ""),
            channelCategoryId: (c.channelCategoryId as string | null) ?? null,
            groupKey: (c.groupKey as string | null) ?? null,
            price: num(c.price),
            discountPercent: num(c.discountPercent),
          })),
        listings: (listings as Record<string, unknown>[]).map(l => ({
          id: l.id as number,
          masterId: l.masterId as number,
          useCaseId: l.useCaseId as number,
          title: String(l.title ?? ""),
          shortDescription: (l.shortDescription as string | null) ?? null,
          longDescription: (l.longDescription as string | null) ?? null,
          // İlanın kendi görseli yoksa master'ınki devralınır. Pazaryeri
          // MUTLAK adres ister — kendi barındırdığımız görseller publicBaseUrl
          // ile tam adrese çevrilir.
          imageUrls: resolveImages({
            listingImages: imagesByListing.get(l.id as number) ?? [],
            masterImages: imagesByMaster.get(l.masterId as number) ?? [],
            limit: 8,
            publicBaseUrl: (cfg.value as { publicBaseUrl?: string }).publicBaseUrl ?? "",
          }),
        })),
        masters: masterRows.map(m => {
          const packaging = packagingById.get(m.packagingId as number) ?? null;
          const logistics = resolveLogistics({
            master: {
              desi: m.desi != null ? num(m.desi) : null,
              weightG: m.weightG != null ? num(m.weightG) : null,
            },
            packaging,
            series: seriesById.get(m.seriesId as number) ?? null,
          });
          return {
            id: m.id as number,
            baseCode: (m.baseCode as string | null) ?? null,
            internalSku: String(m.internalSku ?? ""),
            status: m.status as "taslak" | "aktif" | "arsiv",
            basePrice: num(m.basePrice),
            discountPercent: num(m.discountPercent),
            buildableQty: Number(m.buildableQty ?? 0),
            virtualStockCap: Number(m.virtualStockCap ?? 10),
            salesMode: (m.salesMode as SalesMode | null) ?? null,
            stockQty: Number(m.stockQty ?? 0),
            reservedQty: Number(m.reservedQty ?? 0),
            desi: logistics.desi,
            vatRate: logistics.vatRate,
            seriesId: m.seriesId as number,
            colorId: m.colorId as number,
            familyId: m.familyId as number,
            packagingId: m.packagingId as number,
            volumeMl: packaging?.volumeMl ?? null,
          };
        }),
        settings: cfg.value as never,
        attributeDefs: defsByCategory,
        attributeValues: (attrValues as Record<string, unknown>[]).map(v => ({
          attributeId: v.attributeId as number,
          dimensionKind: v.dimensionKind as "renk" | "ambalaj" | "form" | "seri",
          dimensionId: v.dimensionId as number,
          attributeValueId: (v.attributeValueId as number | null) ?? null,
          attributeText: (v.attributeText as string | null) ?? null,
        })),
        includeUnbuildable: input.includeUnbuildable,
      });

      /*
       * Trendyol'da HÂLEN kayıtlı barkodlar ayıklanır.
       *
       * Trendyol mevcut bir barkod için "oluştur" kabul etmiyor ve tek kalem
       * yüzünden TÜM parti düşüyordu: içinde gerçekten yeni ürünler olsa bile
       * hiçbiri açılmıyordu ve kullanıcı "barkod zaten kayıtlı" hatasında
       * kilitli kalıyordu. Var olanlar burada ayrılıp bildirilir, yeniler gider.
       *
       * Liste çekilemezse (ağ/kota) gönderim durdurulmaz — eskisi gibi denenir.
       */
      let existing = new Set<string>();
      let existingCheckFailed = false;
      try {
        existing = await fetchTrendyolExistingBarcodes();
      } catch {
        existingCheckFailed = true;
      }

      const isKnown = (i: unknown) =>
        existing.has(String((i as { barcode?: string }).barcode ?? ""));
      const fresh = items.filter(i => !isKnown(i));
      /*
       * Var olanlar ATLANMIYOR, GÜNCELLENİYOR.
       *
       * Sistemde yalnız "oluştur" vardı; Trendyol'da kayıtlı bir ürün için
       * doğru karşılık onu güncellemektir. Atlamak, başlık/görsel/özellik
       * düzeltmelerinin pazaryerine hiç gitmemesi demekti.
       */
      const stale = input.updateExisting ? items.filter(isKnown) : [];
      const skipped = input.updateExisting ? 0 : items.length - fresh.length;

      const allProblems = [...problems];
      if (skipped > 0) {
        allProblems.push(
          `${skipped} kalem Trendyol'da zaten kayıtlı — güncelleme kapalı olduğu için dokunulmadı.`,
        );
      }

      if (input.dryRun) {
        /*
         * Önizleme artık SAYI değil KALEM döner.
         *
         * "1 yeni kart · 0 güncelleme" bildirimi ne gideceğini göstermiyordu:
         * başlık, açıklama ve fiyat ancak pazaryerine düştükten sonra görülüyor,
         * yanlışsa ürün yayına yanlış çıkıyordu. Kalemler ilan kimliğiyle
         * birlikte döner ki ekran gönderim öncesi düzeltme yapabilsin.
         */
        const bySku = new Map(
          (channelListings as Record<string, unknown>[])
            .filter(c => c.channelId === input.channelId)
            .map(c => [String(c.channelSku ?? ""), c]),
        );
        const detail = (rows: typeof items, mode: "yeni" | "guncelleme") =>
          rows.map(i => {
            const cl = bySku.get(i.stockCode);
            const item = i as unknown as Record<string, unknown>;
            return {
              mode,
              barcode: String(item.barcode ?? ""),
              stockCode: i.stockCode,
              title: String(item.title ?? ""),
              description: String(item.description ?? ""),
              listPrice: Number(item.listPrice ?? 0),
              salePrice: Number(item.salePrice ?? 0),
              imageCount: Array.isArray(item.images) ? item.images.length : 0,
              attributeCount: Array.isArray(item.attributes) ? item.attributes.length : 0,
              categoryId: Number(item.categoryId ?? 0) || null,
              listingId: (cl?.listingId as number) ?? null,
              channelListingId: (cl?.id as number) ?? null,
            };
          });

        return {
          dryRun: true,
          willSend: fresh.length,
          willUpdate: stale.length,
          sent: 0,
          updated: 0,
          batchRequestId: null,
          updateBatchRequestId: null,
          alreadyOnMarketplace: items.length - fresh.length,
          items: [...detail(fresh, "yeni"), ...detail(stale, "guncelleme")],
          problems: allProblems,
        };
      }
      if (fresh.length === 0 && stale.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            skipped > 0
              ? `Açılacak yeni kart yok — ${skipped} kalemin hepsi Trendyol'da zaten kayıtlı. Güncellemeyi açın ya da stok/fiyat gönderimini kullanın.`
              : `Gönderilebilir kart yok — ${allProblems.slice(0, 3).join(" · ")}`,
        });
      }

      const withContext = (base: string) =>
        existingCheckFailed
          ? `${base} (Mevcut ürün listesi çekilemediği için yeni/mevcut ayrımı yapılamadı.)`
          : base;

      let created: { batchRequestId: string | null; sent: number } = {
        batchRequestId: null,
        sent: 0,
      };
      if (fresh.length > 0) {
        try {
          created = await pushTrendyolProductCards(fresh as never);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: withContext(
              error instanceof Error ? error.message : "Trendyol ürün gönderimi başarısız",
            ),
          });
        }
      }

      /*
       * Güncelleme hatası kart AÇILIŞINI geçersiz kılmaz: yeni kartlar gitmişse
       * o kazanç korunur, güncelleme sorunu ayrıca bildirilir. Aksi hâlde
       * kullanıcı hata görüp tekrar dener ve yeni kartlar ikinci kez gider.
       */
      let updated: { batchRequestId: string | null; sent: number } = {
        batchRequestId: null,
        sent: 0,
      };
      if (stale.length > 0) {
        try {
          updated = await updateTrendyolProductCards(stale as never);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Trendyol ürün güncellemesi başarısız";
          if (created.sent === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: withContext(msg) });
          }
          allProblems.push(`${stale.length} kalem güncellenemedi: ${msg}`);
        }
      }

      /*
       * Kartlar Trendyol'a GİTTİ. Buradan sonrası yalnızca takip kaydı —
       * hata verirse gönderimi başarısız SAYMAYIZ: kullanıcı "başarısız" görüp
       * tekrar denerse aynı barkodlar ikinci kez gider ve "barkod zaten kayıtlı"
       * hatasına düşer. Takip kaydı kaybolur, kart açılışı kaybolmaz.
       */
      let tracked = 0;
      try {
        const allListings = (await db.listChannelListings()) as Record<string, unknown>[];
        const bySku = new Map(
          allListings
            .filter(l => l.channelId === input.channelId)
            .map(l => [String(l.channelSku ?? ""), l.id as number]),
        );
        const track = async (batchId: string | null, rows: typeof items) => {
          if (!batchId) return;
          for (const item of rows) {
            const listingId = bySku.get(item.stockCode);
            if (listingId) {
              await db.saveMarketplaceBatchJob(listingId, "trendyol", batchId);
              tracked += 1;
            }
          }
        };
        await track(created.batchRequestId, fresh);
        await track(updated.batchRequestId, stale);
      } catch (error) {
        console.error("[katalog] batch takip kaydı yazılamadı:", error);
      }

      return {
        dryRun: false,
        willSend: fresh.length,
        willUpdate: stale.length,
        sent: created.sent,
        updated: updated.sent,
        batchRequestId: created.batchRequestId,
        updateBatchRequestId: updated.batchRequestId,
        tracked,
        alreadyOnMarketplace: items.length - fresh.length,
        problems: allProblems,
      };
    }),

  /**
   * Ürün Geliştirme çıktısını v3 kataloğuna aktarır.
   *
   * `dev.publishToProducts` eski `products` tablosuna yazıyordu; haftada 2-3
   * kez yapılan geliştirme işi yeni katalogda görünmeyen ürünler üretiyordu.
   * Bu uç aynı varyantları master + ilan olarak açar.
   *
   * Boyutlar ADA göre eşlenir; eşleşmeyen renk/ambalaj otomatik açılmaz,
   * bildirilir — sessizce yanlış koordinatta master açmaktansa kullanıcının
   * Tanımlar'dan eklemesi doğru.
   */
  importFromDevProject: protectedProcedure
    .input(z.object({ projectId: z.number(), dryRun: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const project = await db.getDevProject(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });

      const [gens, series, colors, packagings, families, useCases, masters] = await Promise.all([
        db.listProductGenerations(input.projectId),
        db.listProductSeries(),
        db.listColors(),
        db.listPackagings(),
        db.listProductFamilies(),
        db.listUseCases(),
        db.listMasterProducts(),
      ]);
      if ((gens as unknown[]).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Aktarılacak varyant yok — önce 5. adımdan varyantları oluşturun.",
        });
      }

      const seriesRow = (series as { id: number; name: string; prefix: string | null }[]).find(
        s => s.name?.trim().toLowerCase() === project.series?.trim().toLowerCase(),
      );
      if (!seriesRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${project.series}" serisi katalogda yok — Şablonlar'dan ekleyin.`,
        });
      }
      const generic = (useCases as { id: number; code: string }[]).find(
        u => u.code === GENERIC_USE_CASE_CODE,
      );
      if (!generic) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "'Genel' kullanım alanı yok — boyutları tohumlayın." });
      }

      const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
      const colorByName = new Map(
        (colors as { id: number; name: string; code: string }[]).flatMap(c => [
          [norm(c.name), c.id] as const,
          [norm(c.code), c.id] as const,
        ]),
      );
      const packByName = new Map(
        (packagings as { id: number; name: string }[]).map(p => [norm(p.name), p.id]),
      );
      // Form belirtilmediği için serinin ilk formu kullanılır; geliştirme
      // projesinde form ekseni yok.
      const familyId = (families as { id: number }[])[0]?.id;
      if (!familyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Form tanımı yok — boyutları tohumlayın." });
      }

      const existingCubes = new Set(
        (masters as Record<string, unknown>[]).map(m =>
          cubeKey({
            seriesId: m.seriesId as number,
            colorId: m.colorId as number,
            familyId: m.familyId as number,
            packagingId: m.packagingId as number,
            readiness: m.readiness as Readiness,
          }),
        ),
      );

      const plan: { generationId: number; colorId: number; packagingId: number; title: string }[] = [];
      const problems: string[] = [];

      for (const g of gens as Record<string, unknown>[]) {
        const colorName = String(g.color ?? "").trim();
        const packName = String(g.packaging ?? "").trim();
        const colorId = colorName ? colorByName.get(norm(colorName)) : colorByName.get("renksiz / nötr");
        const packagingId = packByName.get(norm(packName));
        if (!colorId) {
          problems.push(`"${colorName || "renksiz"}" rengi Tanımlar'da yok`);
          continue;
        }
        if (!packagingId) {
          problems.push(`"${packName}" ambalajı Tanımlar'da yok`);
          continue;
        }
        const key = cubeKey({ seriesId: seriesRow.id, colorId, familyId, packagingId, readiness: "konsantre" });
        if (existingCubes.has(key)) {
          problems.push(`${colorName} · ${packName} zaten katalogda var`);
          continue;
        }
        existingCubes.add(key);
        plan.push({
          generationId: g.id as number,
          colorId,
          packagingId,
          title: String(g.trendyolTitle ?? project.name),
        });
      }

      if (input.dryRun) {
        return { dryRun: true, willCreate: plan.length, created: 0, problems: Array.from(new Set(problems)) };
      }

      const packVolume = new Map(
        (packagings as { id: number; volumeMl: string; skuSegment: string | null; code: string }[]).map(p => [
          p.id,
          { volume: num(p.volumeMl), segment: p.skuSegment ?? p.code },
        ]),
      );
      const colorCode = new Map((colors as { id: number; code: string }[]).map(c => [c.id, c.code]));
      const familySegment =
        (families as { id: number; skuSegment: string | null; code: string }[]).find(f => f.id === familyId) ?? null;

      let created = 0;
      for (const p of plan) {
        const gen = (gens as Record<string, unknown>[]).find(g => g.id === p.generationId)!;
        const baseCode = buildBaseCode({
          brand: "aoc",
          seriesPrefix: seriesRow.prefix,
          colorCode: colorCode.get(p.colorId),
        });
        const pack = packVolume.get(p.packagingId);
        const masterId = await db.createMasterProduct({
          seriesId: seriesRow.id,
          colorId: p.colorId,
          familyId,
          packagingId: p.packagingId,
          readiness: "konsantre",
          baseCode,
          internalSku: buildInternalSku({
            baseCode,
            familySegment: familySegment?.skuSegment ?? familySegment?.code,
            packagingSegment: pack?.segment,
          }),
          // Reçete henüz bağlı değil; şirket standardı 1 litre baz varsayılır.
          // Reçete bağlanınca "Reçeteleri Bağla" ölçeği gerçek baza göre tazeler.
          formulaScale: String(pack && pack.volume > 0 ? pack.volume / BASE_VOLUME_ML : 1),
          basePrice: String(num(gen.suggestedPrice)),
          status: "taslak",
        });

        // Geliştirmede üretilen metin doğrudan ilana taşınır — yeniden
        // yazdırmak hem AI maliyeti hem gözden geçirilmiş içeriğin kaybı olur.
        await db.createListing({
          masterId,
          useCaseId: generic.id,
          title: p.title.slice(0, 255),
          slug: buildSlug(p.title),
          isPrimary: 1,
          shortDescription: (gen.trendyolTitle as string | null) ?? null,
          longDescription: (gen.trendyolDescription as string | null) ?? null,
          applicationText: (gen.applicationNotes as string | null) ?? null,
          status: "taslak",
        });
        created++;
      }
      return { dryRun: false, willCreate: plan.length, created, problems: Array.from(new Set(problems)) };
    }),

  /* ---- Üretim brifingi -------------------------------------------------- */

  /**
   * "Bu siparişler için ne üreteceğim, neyim eksik?"
   *
   * Bugün sipariş gelince sistem hiçbir şey söylemiyor; içerik dökümü yalnız
   * ad ve adet basıyor. Bu uç sipariş satırlarını master'a bağlar, çok
   * seviyeli reçeteden malzeme ihtiyacını patlatır ve eksikleri listeler.
   */
  briefing: protectedProcedure
    .input(
      z.object({
        // Boş ise açık siparişler (yeni + üretimde) alınır.
        orderIds: z.array(z.number()).default([]),
      }),
    )
    .query(async ({ input }) => {
      const [orders, listings, channelListings, colors, packagings, series, families] =
        await Promise.all([
          db.listOrders(),
          db.listListings(),
          db.listChannelListings(),
          db.listColors(),
          db.listPackagings(),
          db.listProductSeries(),
          db.listProductFamilies(),
        ]);

      const openOrders = (orders as {
        id: number;
        orderNo: string;
        status: string;
        customerName: string;
        channel: string | null;
      }[]).filter(
        o => (input.orderIds.length ? input.orderIds.includes(o.id) : o.status === "new" || o.status === "production"),
      );
      if (openOrders.length === 0) {
        return {
          orders: [],
          lines: [],
          demand: [],
          // Dolu dönüşle aynı alanlar: iki dal arasında biçim farkı olursa
          // istemci her alanda "belki yok" kontrolü yapmak zorunda kalır.
          formulation: [] as ReturnType<typeof buildFormulation>,
          plan: { needs: [], shortages: [], steps: [], missingFormula: [], canProduce: true },
          unmatched: [],
        };
      }

      const items = await db.listOrderItemsBulk(openOrders.map(o => o.id));

      // Çözümleme için ilan başlıkları + pazaryeri kodları.
      const refsByListing = new Map<number, string[]>();
      for (const c of channelListings as { listingId: number; channelSku: string; channelBarcode: string }[]) {
        refsByListing.set(c.listingId, [
          ...(refsByListing.get(c.listingId) ?? []),
          c.channelSku,
          c.channelBarcode,
        ]);
      }
      const resolvable = (listings as { id: number; masterId: number; title: string }[]).map(l => ({
        masterId: l.masterId,
        listingId: l.id,
        title: l.title,
        channelRefs: refsByListing.get(l.id) ?? [],
      }));

      // Satır hangi pazaryerinden geldi: aynı ürünün kodu kanaldan kanala
      // değiştiği için gruplama bunu bilmeden doğru toplayamaz.
      const channelByOrder = new Map(openOrders.map(o => [o.id, o.channel ?? null]));

      const resolved = resolveOrderLines(
        (items as {
          id: number;
          orderId: number;
          productName: string;
          quantity: string;
          channelRef: string | null;
          masterId: number | null;
        }[]).map(i => ({
          id: i.id,
          orderId: i.orderId,
          productName: i.productName,
          quantity: num(i.quantity),
          // Kayıtlı bağ ve kanal kodu artık taşınıyor: bulanık başlık
          // eşleştirmesi kritik yoldan çıkıp yedek yola iniyor.
          channelRef: i.channelRef,
          channel: channelByOrder.get(i.orderId) ?? null,
          masterId: i.masterId,
        })),
        resolvable,
      );

      // Master başına toplam talep.
      const demandMap = new Map<number, number>();
      for (const r of resolved) {
        if (r.masterId == null) continue;
        demandMap.set(r.masterId, (demandMap.get(r.masterId) ?? 0) + r.line.quantity);
      }

      const data = await loadCapacityInputs();
      const plan = planProduction({
        demand: Array.from(demandMap.entries()).map(([masterId, qty]) => ({ masterId, qty })),
        masters: data.masters.map(m => ({ ...m, formulaScale: num(m.formulaScale) })),
        formulas: data.formulas,
        packagings: data.packagings,
        materials: data.materials,
      });

      // Üretim listesi: renk ve ambalaj bilgisiyle — bugünkü içerik dökümünde
      // renk seçeneği bile yoktu, oysa boyada üretilecek şey tam olarak o.
      const masterById = new Map(data.rawMasters.map(m => [m.id as number, m]));
      const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
      const packById = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p]));
      const seriesById = new Map((series as { id: number; name: string }[]).map(s => [s.id, s]));
      const familyById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));

      const demand = Array.from(demandMap.entries()).map(([masterId, qty]) => {
        const m = masterById.get(masterId);
        const color = m ? colorById.get(m.colorId as number) : undefined;
        return {
          masterId,
          qty,
          internalSku: (m?.internalSku as string) ?? "",
          series: m ? (seriesById.get(m.seriesId as number)?.name ?? null) : null,
          family: m ? (familyById.get(m.familyId as number)?.name ?? null) : null,
          packaging: m ? (packById.get(m.packagingId as number)?.name ?? null) : null,
          colorName: color?.name ?? null,
          colorHex: color?.hex ?? null,
          readiness: (m?.readiness as string) ?? "konsantre",
          buildable: Number(m?.buildableQty ?? 0),
        };
      });

      /*
       * Tezgâh formülasyonu — üretimin asıl istenen çıktısı.
       *
       * Toplam malzeme dökümü satın alma için doğru ama boyayı yapan kişi
       * için işe yaramaz: sekiz rengin pigmenti tek satırda toplanır. Ürün
       * bazında "şu kadar için şunu tart" listesi, üretim kaydı tutmadan da
       * işi yürütmenin yolu.
       */
      const formulaNames = new Map(
        (await db.listFormulas()).map(f => [f.id as number, String(f.name ?? "")]),
      );
      const formulation = buildFormulation({
        demand: demand.map(d => ({ masterId: d.masterId, qty: d.qty })),
        masters: data.masters.map(m => ({ ...m, formulaScale: num(m.formulaScale) })),
        formulas: data.formulas,
        packagings: data.packagings,
        materials: data.materials,
        formulaNames,
      });

      return {
        orders: openOrders.map(o => ({ id: o.id, orderNo: o.orderNo, customerName: o.customerName, status: o.status })),
        lines: resolved.map(r => ({
          id: r.line.id,
          orderId: r.line.orderId,
          productName: r.line.productName,
          quantity: r.line.quantity,
          masterId: r.masterId,
          via: r.via,
        })),
        demand: demand.sort((a, b) => b.qty - a.qty),
        formulation,
        plan,
        /*
         * Eşleşmeyen satırlar tek tek değil, GRUPLU döner.
         *
         * Aynı üründen iki sipariş gelince liste aynı metni alt alta iki kez
         * basıyordu ve satırda yalnız başlık vardı — "Sprey Astar 400 Ml"
         * hangi renk olduğunu söylemiyor. Stok kodu siparişle birlikte zaten
         * geliyor ve saklanıyor, sadece buraya taşınmıyordu.
         */
        unmatched: groupUnmatchedLines(
          resolved.filter(r => r.masterId == null).map(r => r.line),
          (colors as { code: string; name: string; hex: string | null }[]).map(c => ({
            code: c.code,
            name: c.name,
            hex: c.hex,
          })),
        ),
      };
    }),

  /**
   * Brifingdeki ürünlerin tamamını tek işlemde "üretildi" olarak işler.
   *
   * ── Neden ────────────────────────────────────────────────────────────────
   * Ürün başına "üret" tıklamak, kalemi seçmek, adedi yazmak ve onaylamak
   * gerçek bir iş yüküydü: yüzlerce ürünlü bir katalogda günde onlarca kez
   * yapılması imkânsız. Sonuç, kimsenin üretim kaydı tutmaması ve hammadde
   * stoğunun gerçeği yansıtmamasıydı.
   *
   * Burada gün sonunda tek düğme: açık siparişlerin tamamı için hammadde
   * düşülür ve her ürün için bir emir kaydı yazılır. Eksik hammadde varsayılan
   * olarak İŞLEMİ DURDURMAZ (`force`), çünkü fiilen üretim yapılmıştır —
   * stoğun eksiye düşmesi, kaydı hiç tutmamaktan iyidir ve eksikler
   * raporlanır.
   */
  produceBriefing: protectedProcedure
    .input(
      z.object({
        items: z.array(z.object({ masterId: z.number(), qty: z.number().positive() })).min(1).max(500),
        note: z.string().max(500).nullish(),
        /** Kapalıysa eksik hammadde varsa hiçbir şey yazılmaz. */
        allowShortage: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const masters = (data.masters as Record<string, unknown>[]).map(m => ({
        id: m.id as number,
        formulaId: (m.formulaId as number | null) ?? null,
        formulaScale: num(m.formulaScale) || 1,
        packagingId: (m.packagingId as number | null) ?? null,
      }));
      const materials = data.rawMaterials.map(m => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as MaterialType) ?? "hammadde",
        stockQty: num(m.stockQty),
        reservedQty: num(m.reservedQty),
      }));

      // Toplam plan: hammadde tek seferde düşülür, yarı mamuller bir kez
      // patlatılır — ürün ürün düşmek yarı mamul stoğunu iki kez saydırırdı.
      const plan = planProduction({
        demand: input.items,
        masters,
        formulas: data.formulas,
        packagings: data.packagings,
        materials,
      });

      if (plan.shortages.length > 0 && !input.allowShortage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Hammadde yetersiz: ${plan.shortages
            .slice(0, 5)
            .map(n => `${n.name} (eksik ${Math.ceil(n.missing)})`)
            .join(" · ")}`,
        });
      }

      for (const n of plan.needs) {
        if (n.needed > 0) {
          await db.adjustStock(n.materialId, "out", n.needed, "Üretim brifingi");
        }
      }

      const note = [
        input.note?.trim() || "Üretim brifingi",
        plan.shortages.length > 0
          ? `Eksik stokla: ${plan.shortages.map(n => n.name).slice(0, 6).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      for (const item of input.items) {
        await db.recordMasterProductionRun(item.masterId, Math.round(item.qty), note);
      }

      await runCapacityRecompute();
      return {
        produced: input.items.length,
        units: input.items.reduce((s, i) => s + i.qty, 0),
        deducted: plan.needs.length,
        shortages: plan.shortages.map(n => n.name),
        missingFormula: plan.missingFormula.length,
      };
    }),

  /**
   * "Üretmediğini satamama" durumunu kaldırır.
   *
   * İlan miktarı varsayılan olarak eldeki hammaddeden üretilebilir adetten
   * gelir; reçetesi bağlanmamış ya da hammaddesi biten her ürün ilanda 0 yazıp
   * satışa kapanıyor. Oysa iş modeli sipariş üzerine üretim: 3 günde tedarik
   * edilebilen bir ürünü satışa kapatmak doğrudan sipariş kaybı.
   *
   * Bu uç seçilen (ya da kapanmış olan tüm) ürünleri `tedarikli` moduna alır:
   * hammadde bağımsız, termin sözüyle satışta kalırlar.
   */
  keepSellable: protectedProcedure
    .input(
      z.object({
        /** Boşsa: kapasitesi 0 olduğu için ilanı kapanan tüm aktif ürünler. */
        masterIds: z.array(z.number()).default([]),
        leadTimeDays: z.number().int().min(0).max(365).default(3),
        virtualStockCap: z.number().int().min(1).max(10000).optional(),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const masters = (await db.listMasterProducts()) as Record<string, unknown>[];
      const targets =
        input.masterIds.length > 0
          ? masters.filter(m => input.masterIds.includes(m.id as number))
          : masters.filter(
              m =>
                m.status !== "arsiv" &&
                Number(m.buildableQty ?? 0) <= 0 &&
                m.salesMode !== "tedarikli" &&
                m.salesMode !== "stoktan",
            );

      if (input.dryRun) {
        return { dryRun: true as const, updated: 0, willUpdate: targets.length };
      }
      for (const m of targets) {
        await db.updateMasterProduct(m.id as number, {
          salesMode: "tedarikli",
          leadTimeDays: input.leadTimeDays,
          ...(input.virtualStockCap != null ? { virtualStockCap: input.virtualStockCap } : {}),
        });
      }
      await runCapacityRecompute();
      return { dryRun: false as const, updated: targets.length, willUpdate: targets.length };
    }),

  /**
   * Hammadde tipini değiştirir. Yarı mamuller bugün "hammadde" olarak duruyor
   * (MİX BOYA, BAZKAT BOYA, baz binder…); tipleri işaretlenmeden çok seviyeli
   * BOM devreye girmez.
   */
  setMaterialType: protectedProcedure
    .input(
      z.object({
        materialId: z.number(),
        type: z.enum(["hammadde", "yari_mamul", "ambalaj", "masraf"]),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateMaterial(input.materialId, { type: input.type });
      return { ok: true };
    }),
});
