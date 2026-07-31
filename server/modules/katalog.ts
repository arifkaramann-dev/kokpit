/**
 * Katalog v3 router'ı — Master / Listing / ChannelListing ve kapasite.
 *
 * Eski `products` router'ı yerinde kalır; bu modül yanına kurulur ki geçiş
 * sırasında çalışan sistem bozulmasın. İş mantığının tamamı saf fonksiyonlarda
 * (catalogPlan, catalogCodes, capacity); burada yalnız veri okuma/yazma var.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  bottleneckReport,
  computeCapacity,
  listingQty,
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
import { mapToTrendyolCards } from "../cardMapping";
import { cubeKey, planListings, planMasters, type Readiness } from "../catalogPlan";
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
import {
  pickBlock,
  planContentBlocks,
  resolveListingContent,
  type ContentBlockLike,
} from "../listingContent";
import {
  guessSource,
  imageUrlOf,
  resolveImages,
  resolveLogistics,
  type ChannelAttributeDef,
  type ImageRow,
} from "../masterFields";
import { findInvalidMasters, planCleanup } from "../masterAudit";
import { masterHealth, rollupBySeries } from "../masterHealth";
import {
  computeMasterRevenue,
  findDeadMasters,
  rollupRevenueBySeries,
  windowStart,
} from "../masterRevenue";
import { planProduction, resolveOrderLines } from "../productionPlan";
import { planPublications, summarizeSkips } from "../publishPlan";
import { GENERIC_USE_CASE_CODE, seedCatalogDimensions } from "../seedCatalog";
import { fetchHepsiburadaCategories } from "../hepsiburada";
import {
  fetchTrendyolCategories,
  fetchTrendyolCategoryAttributes,
  parseCardSettings,
  pushTrendyolProductCards,
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


export const katalogRouter = router({
  /* ---- Boyutlar --------------------------------------------------------- */

  dimensions: protectedProcedure.query(async () => {
    const [colors, families, packagings, useCases, channels, sp, sf] = await Promise.all([
      db.listColors(),
      db.listProductFamilies(),
      db.listPackagings(),
      db.listUseCases(),
      db.listSalesChannels(),
      db.listSeriesPackagings(),
      db.listSeriesFamilies(),
    ]);
    return { colors, families, packagings, useCases, channels, seriesPackagings: sp, seriesFamilies: sf };
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
        data.hex = rest.hex ?? null;
        if (rest.finish) data.finish = rest.finish;
        data.seriesId = rest.seriesId ?? null;
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
        await db.updateMasterProduct(v.masterId, { status: "arsiv" } as never);
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
        return {
          dryRun: true,
          willCreate: plan.create.length,
          alreadyExists: plan.existing.length,
          sample: plan.create.slice(0, 20).map(m => m.internalSku),
          created: 0,
          conflictNote,
          breakdown: plan.breakdown,
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
        } as never);
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
        } as never);
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

  /**
   * İlanı bir kanalda yayına hazırlar. Pazaryeri SKU'su ve barkodu BURADA
   * bir kez üretilip saklanır; gönderim anında yeniden hesaplanmaz — türetme
   * kuralı değişirse tüm eşleşmeler kalıcı kopar.
   */
  publishListing: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        channelId: z.number(),
        channelCategoryId: z.string().nullable().optional(),
        price: z.number().min(0).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      const [listings, channels, existing] = await Promise.all([
        db.listListings(),
        db.listSalesChannels(),
        db.listChannelListings(),
      ]);
      const listing = (listings as { id: number; masterId: number }[]).find(l => l.id === input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "İlan bulunamadı" });
      const channel = (channels as { id: number; code: string }[]).find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const already = (existing as { listingId: number; channelId: number }[]).find(
        c => c.listingId === input.listingId && c.channelId === input.channelId,
      );
      if (already) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu ilan zaten bu kanalda yayında." });
      }

      // Mükerrer ilan kilidi: aynı master, aynı kanal, aynı kategori.
      const clash = (existing as { masterId: number; channelId: number; channelCategoryId: string | null }[]).find(
        c =>
          c.masterId === listing.masterId &&
          c.channelId === input.channelId &&
          (c.channelCategoryId ?? null) === (input.channelCategoryId ?? null),
      );
      if (clash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Bu ürünün bu kanalda aynı kategoride ilanı zaten var. Pazaryerleri aynı kategorideki mükerrer ilanı yaptırıma tabi tutar — farklı kategori seçin.",
        });
      }

      const seq = await db.nextChannelSequence();
      const id = await db.createChannelListing({
        listingId: input.listingId,
        masterId: listing.masterId,
        channelId: input.channelId,
        channelSku: buildChannelSku(channel.code, seq),
        channelBarcode: buildChannelBarcode(seq),
        channelCategoryId: input.channelCategoryId ?? null,
        price: String(input.price),
        syncState: "kirli",
        status: "taslak",
      } as never);
      return { id, channelSku: buildChannelSku(channel.code, seq), channelBarcode: buildChannelBarcode(seq) };
    }),

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
        } as never);
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

  /** Bir master'ın kapasitesi ve darboğazı (ürün kartı için). */
  capacityOf: protectedProcedure
    .input(z.object({ masterId: z.number() }))
    .query(async ({ input }) => {
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);
      const row = report.masters.find(m => m.masterId === input.masterId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Master bulunamadı" });
      return row;
    }),

  /* ---- Hammadde rezervasyonu -------------------------------------------- */

  /**
   * Sipariş için hammadde rezerve eder. Atomik WHERE koşulu aşırı satış
   * kalkanıdır: yetmezse rezerv açılmaz ve eksik kalemler bildirilir.
   * Sipariş yine de kabul edilir (müşteri kaybedilmez), yalnız işaretlenir.
   */
  reserveForOrder: protectedProcedure
    .input(
      z.object({
        items: z.array(z.object({ masterId: z.number(), qty: z.number().positive() })).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const formulaById = new Map(data.formulas.map(f => [f.id, f]));
      const masterById = new Map(data.masters.map(m => [m.id, m]));
      const packById = new Map(data.packagings.map(p => [p.id, p]));
      const matName = new Map(data.materials.map(m => [m.id, m.name]));

      // Master başına hammadde ihtiyacını topla (aynı kalem birden çok üründe).
      const need = new Map<number, number>();
      for (const item of input.items) {
        const master = masterById.get(item.masterId);
        if (!master?.formulaId) continue;
        const f = formulaById.get(master.formulaId);
        if (!f) continue;
        const waste = Math.min(Math.max(num(f.wastePercent), 0), 99);
        const scale = num(master.formulaScale) || 1;
        for (const inp of f.inputs) {
          const per = (num(inp.qtyPerBase) * scale) / (1 - waste / 100);
          need.set(inp.inputMaterialId, (need.get(inp.inputMaterialId) ?? 0) + per * item.qty);
        }
        const pack = master.packagingId != null ? packById.get(master.packagingId) : undefined;
        if (pack?.materialId != null) {
          need.set(pack.materialId, (need.get(pack.materialId) ?? 0) + item.qty);
        }
        for (const pi of pack?.inputs ?? []) {
          need.set(pi.materialId, (need.get(pi.materialId) ?? 0) + num(pi.qtyPerUnit) * item.qty);
        }
      }

      const reserved: { materialId: number; qty: number }[] = [];
      const short: { materialId: number; name: string; qty: number }[] = [];
      for (const [materialId, qty] of Array.from(need.entries())) {
        if (qty <= 0) continue;
        const ok = await db.reserveMaterial(materialId, qty);
        if (ok) reserved.push({ materialId, qty });
        else short.push({ materialId, name: matName.get(materialId) ?? `#${materialId}`, qty });
      }

      // Kısmi rezervasyon bırakma: bir kalem yetmediyse hepsini geri aç ki
      // yarım rezerv başka siparişlerin kapasitesini boşuna kilitlemesin.
      if (short.length > 0) {
        for (const r of reserved) await db.releaseMaterial(r.materialId, r.qty);
        return { ok: false, reserved: 0, short };
      }
      return { ok: true, reserved: reserved.length, short: [] };
    }),

  releaseForOrder: protectedProcedure
    .input(z.object({ items: z.array(z.object({ materialId: z.number(), qty: z.number().positive() })) }))
    .mutation(async ({ input }) => {
      for (const i of input.items) await db.releaseMaterial(i.materialId, i.qty);
      return { released: input.items.length };
    }),

  /* ---- Reçeteler (çok seviyeli BOM) ------------------------------------- */

  /** Reçeteler + girdileri + hangi master'lara bağlı oldukları. */
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

      const plan = planFormulaBindings({
        masters: (masters as Record<string, unknown>[]).map(m => ({
          id: m.id as number,
          seriesId: m.seriesId as number,
          colorId: m.colorId as number,
          familyId: m.familyId as number,
          readiness: m.readiness as Readiness,
          packagingVolumeMl: volumeById.get(m.packagingId as number) ?? 0,
          currentFormulaId: (m.formulaId as number | null) ?? null,
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
          }),
        ),
        rebindExisting: input.rebindExisting,
      });

      if (input.dryRun) {
        return { dryRun: true, bound: 0, willBind: plan.bindings.length, unmatched: plan.unmatched.length };
      }
      for (const b of plan.bindings) {
        await db.updateMasterProduct(b.masterId, {
          formulaId: b.formulaId,
          formulaScale: String(b.formulaScale),
        } as never);
      }
      return {
        dryRun: false,
        bound: plan.bindings.length,
        willBind: plan.bindings.length,
        unmatched: plan.unmatched.length,
      };
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
    const masterImages = await db.listMasterImages();
    const data = await loadCapacityInputs();

    const costs = computeMasterCosts({
      masters: data.masters,
      materials: data.rawMaterials.map(m => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
        unitCost: (m.unitCost as string) ?? 0,
      })),
      formulas: data.formulas,
      packagings: data.packagings,
    });
    const costById = new Map(costs.map(c => [c.masterId, c]));

    const imageCount = new Map<number, number>();
    for (const img of listingImages as { listingId: number }[]) {
      imageCount.set(img.listingId, (imageCount.get(img.listingId) ?? 0) + 1);
    }
    // Master görselleri ilanlara miras kalır; "görsel yok" uyarısı bunu
    // saymazsa görseli master'da olan ürün eksik görünürdü.
    const masterImageCount = new Map<number, number>();
    for (const img of masterImages as { masterId: number }[]) {
      masterImageCount.set(img.masterId, (masterImageCount.get(img.masterId) ?? 0) + 1);
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
    const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
    const packById = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p]));
    const seriesById = new Map((series as { id: number; name: string }[]).map(s => [s.id, s]));
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
        price,
        ...marginOf(price, cost?.totalCost ?? 0),
        health,
      };
    });

    return {
      rows: rows.sort((a, b) => a.health.score - b.health.score),
      series: rollupBySeries(
        rows.map(r => ({ seriesId: r.seriesId, health: r.health, buildable: r.buildable })),
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
    const costs = computeMasterCosts({
      masters: data.masters,
      materials: data.rawMaterials.map(m => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
        unitCost: (m.unitCost as string) ?? 0,
      })),
      formulas: data.formulas,
      packagings: data.packagings,
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
        await db.updateMasterProduct(m.id as number, { basePrice: String(next) } as never);
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

      const [listings, channelListings, useCases, channels, colors, packagings, series, families, formulas, formulaInputs] =
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
        ]);
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);
      const capacity = report.masters.find(r => r.masterId === input.masterId) ?? null;

      const [cost] = computeMasterCosts({
        masters: data.masters.filter(m => m.id === input.masterId),
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
          unitCost: (m.unitCost as string) ?? 0,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
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

      const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
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
      } as never);

      let updated = 0;
      if (input.applyToChannels) {
        const rows = (await db.listChannelListings()) as { id: number; masterId: number; price: string }[];
        for (const c of rows.filter(c => c.masterId === input.masterId && num(c.price) <= 0)) {
          // Fiyat değişimi pazaryerine gönderilmeli — kirli işaretlenir.
          await db.updateChannelListing(c.id, {
            price: String(input.basePrice),
            discountPercent: String(input.discountPercent),
            syncState: "kirli",
          } as never);
          updated++;
        }
      }
      return { updated };
    }),

  /** Kanala özel fiyat — taban fiyattan farklıysa. */
  setChannelPrice: protectedProcedure
    .input(
      z.object({
        channelListingId: z.number(),
        price: z.number().min(0).max(1000000),
        discountPercent: z.number().min(0).max(100).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateChannelListing(input.channelListingId, {
        price: String(input.price),
        discountPercent: String(input.discountPercent),
        syncState: "kirli",
      } as never);
      return { ok: true };
    }),

  /**
   * Kokpit özeti — ana ekran v3'ten habersizdi, `listProducts()` sayıyordu.
   * Sabah açınca yeni sistemin durumu görünsün.
   */
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
      const [cost] = computeMasterCosts({
        masters: data.masters.filter(m => m.id === input.masterId),
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
          unitCost: (m.unitCost as string) ?? 0,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
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
      const costs = computeMasterCosts({
        masters: data.masters,
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
          unitCost: (m.unitCost as string) ?? 0,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
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

  masterImages: protectedProcedure
    .input(z.object({ masterId: z.number().optional() }).default({}))
    .query(({ input }) => db.listMasterImages(input.masterId)),

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
      let raw: unknown;
      try {
        raw = await fetchTrendyolCategoryAttributes(categoryId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Kategori özellikleri alınamadı",
        });
      }
      const rows = ((raw as Record<string, unknown>)?.categoryAttributes ?? []) as Record<
        string,
        unknown
      >[];
      const existing = (await db.listChannelAttributes(input.channelId)) as Record<string, unknown>[];
      const known = new Set(
        existing
          .filter(e => String(e.categoryId) === input.categoryId)
          .map(e => e.attributeId as number),
      );

      let added = 0;
      let updated = 0;
      for (const row of rows) {
        const attr = (row.attribute ?? {}) as Record<string, unknown>;
        const attributeId = Number(attr.id ?? 0);
        if (!attributeId) continue;
        const attributeName = String(attr.name ?? "");
        const isNew = !known.has(attributeId);
        await db.upsertChannelAttribute({
          channelId: input.channelId,
          categoryId: input.categoryId,
          attributeId,
          attributeName,
          source: guessSource(attributeName),
          isRequired: Boolean(row.required),
          // Mevcut satırda kullanıcının seçimi korunur.
          keepSource: !isNew,
        });
        if (isNew) added += 1;
        else updated += 1;
      }
      return { added, updated, total: rows.length };
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
  pushCardsToTrendyol: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        seriesIds: z.array(z.number()).default([]),
        includeUnbuildable: z.boolean().default(false),
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

      if (input.dryRun) {
        return { dryRun: true, willSend: items.length, sent: 0, batchRequestId: null, problems };
      }
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Gönderilebilir kart yok — ${problems.slice(0, 3).join(" · ")}`,
        });
      }
      try {
        const result = await pushTrendyolProductCards(items as never);
        return { dryRun: false, willSend: items.length, ...result, problems };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Trendyol ürün gönderimi başarısız",
        });
      }
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
          formulaScale: String(pack && pack.volume > 0 ? pack.volume / 1000 : 1),
          basePrice: String(num(gen.suggestedPrice)),
          status: "taslak",
        } as never);

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
        } as never);
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

      const openOrders = (orders as { id: number; orderNo: string; status: string; customerName: string }[]).filter(
        o => (input.orderIds.length ? input.orderIds.includes(o.id) : o.status === "new" || o.status === "production"),
      );
      if (openOrders.length === 0) {
        return {
          orders: [],
          lines: [],
          demand: [],
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
        plan,
        unmatched: resolved
          .filter(r => r.masterId == null)
          .map(r => ({ id: r.line.id, orderId: r.line.orderId, productName: r.line.productName, quantity: r.line.quantity })),
      };
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
      await db.updateMaterial(input.materialId, { type: input.type } as never);
      return { ok: true };
    }),
});
