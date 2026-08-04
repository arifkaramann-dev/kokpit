// Ürün & Üretim: hammadde, ürün/türev, üretim, formül, seri — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "../_core/cookies";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";
import { systemRouter } from "../_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { itemsTotal, summarizeItems, toItemRows } from "../orderUtils";
import { extractInvoice } from "../_core/claude";
import { executeAssistantCommand, generateOrderNo, generateQuoteNo } from "../assistant";
import { buildSaleTitle, deriveCombos, parseSetCount, renameVariantTitle, splitExistingCombos } from "../productUtils";
import { computePrice, extractJson, parseFeatures, pickReferenceProduct, scoreReference, suggestSku } from "../autofill";
import { computeReorderSuggestions, summarizeReorder } from "../reorder";
import {
  materialMatrixToParsed,
  planMaterialImport,
  type MaterialIORecord,
} from "@shared/materialIO";
import { importUrunKayit } from "../importSeed";
import { answerTrendyolQuestion, syncTrendyolOrders, pushTrendyolStockPrice, getTrendyolCommonLabelPdf, TrendyolLabelNotAllowedError, isTrendyolConfigured } from "../trendyol";
import { isHepsiburadaConfigured } from "../hepsiburada";
import { isN11Configured } from "../n11";
import { isCiceksepetiConfigured } from "../ciceksepeti";
import {
  fetchTrendyolCategoryAttributes,
  getTrendyolProductBatchStatus,
  mapProductsToTrendyolItems,
  parseCardSettings,
  pushTrendyolProductCards,
  searchTrendyolBrands,
} from "../trendyolProducts";
import { pushHepsiburadaStockPrice } from "../hepsiburada";
import {
  hbCatalogSendTestProduct,
  hbCatalogStatus,
  hbCreateTestOrder,
  hbListListings,
  hbListPaidOrdersRaw,
  hbListingTestPush,
  hbPackageOrder,
  hbTestInfo,
} from "../hepsiburadaTest";
import { pushN11StockPrice } from "../n11";
import { pushCiceksepetiStockPrice } from "../ciceksepeti";
import { marketplaceStatus, syncAllMarketplaces, testMarketplaceConnection } from "../marketplace";
import {
  generateQuestionAnswer,
  getAutoAnswerEnabled,
  setAutoAnswerEnabled,
  syncMarketplaceQuestions,
} from "../marketplaceQuestions";
import { notifyOwner } from "../notify";
import { getPaytrIframeToken, isPaytrConfigured } from "../paytr";
import { buildInvoicePayload, isEfaturaConfigured, sendInvoice } from "../efatura";
import { isKargoConfigured } from "../kargo";
import { applyCoupon, findCoupon, parseCoupons } from "@shared/campaigns";
import { parseBankStatement, reconcile } from "@shared/reconcile";
import { channelProfitReport } from "../reportUtils";
import { DEFAULT_CHANNEL_PROFILES, deriveUnitLaborOverhead, normalizeChannelProfile, effectiveChannelPrice, parseChannelPrices, MARKETPLACE_CHANNELS } from "@shared/pricing";
import { ENV } from "../_core/env";
import { toDecimalFields } from "./util";

/* ------------------------- Zod schemas ------------------------- */

const materialInput = z.object({
  name: z.string().min(1),
  category: z.string().min(1).default("diğer"),
  unit: z.string().min(1).default("gr"),
  /**
   * Kalem türü — çok seviyeli reçetenin temel ayrımı. Form'da yoktu ve her
   * kalem "hammadde" kalıyordu; ambalaj kalemleri de dahil, ki reçeteye
   * girdiklerinde hacimle ölçeklenip maliyeti bozuyorlar.
   */
  type: z.enum(["hammadde", "yari_mamul", "ambalaj", "masraf"]).optional(),
  stockQty: z.number().min(0).default(0),
  criticalQty: z.number().min(0).default(0),
  unitCost: z.number().min(0).default(0),
  supplierId: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Ürün motoru v2: kalite seviyesi, birim fiyat ve tedarikçi adı.
  tier: z.enum(["premium", "mid", "eco"]).nullable().optional(),
  pricePerUnit: z.number().min(0).nullable().optional(),
  supplier: z.string().nullable().optional(),
});

const productInput = z.object({
  parentId: z.number().nullable().optional(),
  name: z.string().min(1),
  series: z.string().nullable().optional(),
  colorCode: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  surfaceType: z.string().nullable().optional(),
  additives: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  salePrice: z.number().min(0).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  packagingCost: z.number().min(0).default(0),
  shippingCost: z.number().min(0).default(0),
  packaging: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  // Kanal bazlı fiyat JSON'u (trendyol/hepsiburada/n11/ciceksepeti → fiyat/indirim).
  // Boş kanal = taban (web) fiyatı kullanılır. Fiyat & Kâr ve pazaryeri push okur.
  channelPrices: z.string().nullable().optional(),
  stockQty: z.number().min(0).optional(),
  criticalQty: z.number().min(0).optional(),
  labelSize: z.string().nullable().optional(),
  labelText: z.string().nullable().optional(),
  usageGuide: z.string().nullable().optional(),
  safetyNotes: z.string().nullable().optional(),
  extraInfo: z.string().nullable().optional(),
  // Pazaryeri ürün kartı alanları (ÜRÜN KAYIT paritesi).
  sku: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  profitMargin: z.number().min(0).max(999).nullable().optional(),
  vatRate: z.number().min(0).max(100).nullable().optional(),
  desi: z.number().min(0).nullable().optional(),
  paintType: z.string().nullable().optional(),
  features: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  applicationText: z.string().nullable().optional(),
  imageUrls: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  mockupUrl: z.string().nullable().optional(),
  labelWarnings: z.string().nullable().optional(),
  // Yaşam döngüsü (Faz A3): taslak → satista → arsiv. Push yalnız "satista" gönderir.
  status: z.enum(["taslak", "satista", "arsiv"]).optional(),
});

/** Barkod/SKU tekilliği (Faz A1): dolu değer katalogda başka üründe olamaz. */
async function assertUniqueIdentity(
  barcode: string | null | undefined,
  sku: string | null | undefined,
  excludeId?: number,
) {
  const wantedBarcode = barcode?.trim();
  const wantedSku = sku?.trim();
  if (!wantedBarcode && !wantedSku) return;
  const all = await db.listProducts();
  for (const p of all) {
    if (excludeId !== undefined && p.id === excludeId) continue;
    if (wantedBarcode && p.barcode?.trim() === wantedBarcode) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Bu barkod zaten "${p.name}" ürününde kayıtlı — çift barkod pazaryeri eşleşmesini bozar.`,
      });
    }
    if (wantedSku && p.sku?.trim() === wantedSku) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Bu SKU zaten "${p.name}" ürününde kayıtlı.`,
      });
    }
  }
}

/** Seri bağı (Faz A2): ürüne yazılan seri adı kayıtlı değilse varsayılanlarla açılır. */
async function ensureSeriesRecord(series: string | null | undefined) {
  const name = series?.trim();
  if (!name) return;
  const existing = await db.getProductSeriesByName(name);
  if (!existing) await db.createProductSeries({ name });
}

/** Hiyerarşi koruması (Faz A4): türevin altına türev eklenemez. */
async function assertValidParent(parentId: number | null | undefined) {
  if (!parentId) return;
  const parent = await db.getProduct(parentId);
  if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Ana ürün bulunamadı" });
  if (parent.parentId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Türev ürünün altına türev eklenemez — ana ürünü seçin.",
    });
  }
}

/** Arşive alınan ürün eski isActive bayrağıyla da tutarlı kalsın (geriye uyum). */
function withStatusFlags<T extends { status?: "taslak" | "satista" | "arsiv" }>(data: T) {
  if (!data.status) return data;
  return { ...data, isActive: data.status === "arsiv" ? 0 : 1 };
}

const productSeriesInput = z.object({
  name: z.string().min(1),
  /** Serinin satış adındaki karşılığı — "CANDY" değil "CANDY PAINT". */
  nameEn: z.string().max(128).nullable().optional(),
  profitMargin: z.number().min(0).max(999).default(35),
  vatRate: z.number().min(0).max(100).default(20),
  category: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  applicationText: z.string().nullable().optional(),
  faqContent: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Ürün motoru v2: kod ön eki, ambalaj/yüzey şablonları, kılavuz/etiket şablonları.
  prefix: z.string().max(10).nullable().optional(),
  packagingOptions: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .nullable()
    .optional(),
  applicationSurfaces: z.array(z.string()).nullable().optional(),
  // Renk seçenekleri: {label, value, hex?} — varyantlar Renk × Ambalaj üretilir.
  colorOptions: z
    .array(z.object({ label: z.string(), value: z.string(), hex: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  guideTemplate: z.string().nullable().optional(),
  labelTemplate: z.string().nullable().optional(),
});

/** products tablosundaki decimal alanlar (mutation girişinde stringe çevrilir). */
const productDecimalFields = [
  "salePrice",
  "discountPercent",
  "packagingCost",
  "shippingCost",
  "profitMargin",
  "vatRate",
  "desi",
];



export const materialsRouter = router({
  list: protectedProcedure.query(() => db.listMaterials()),
  critical: protectedProcedure.query(() => db.listCriticalMaterials()),
  // Yeniden sipariş önerisi: kritik eşik altı hammadde → önerilen alım miktarı +
  // tedarikçi + tahmini maliyet (saf mantık reorder.ts, testli).
  reorderSuggestions: protectedProcedure.query(async () => {
    const [mats, suppliers] = await Promise.all([db.listMaterials(), db.listSuppliers()]);
    const suggestions = computeReorderSuggestions(
      mats as never,
      (suppliers as { id: number; name: string }[]).map(s => ({ id: s.id, name: s.name })),
    );
    return { suggestions, summary: summarizeReorder(suggestions) };
  }),
  create: protectedProcedure.input(materialInput).mutation(({ input }) =>
    db.createMaterial(toDecimalFields(input, ["stockQty", "criticalQty", "unitCost", "pricePerUnit"]) as never),
  ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: materialInput.partial() }))
    .mutation(({ input }) =>
      db.updateMaterial(input.id, toDecimalFields(input.data, ["stockQty", "criticalQty", "unitCost", "pricePerUnit"]) as never),
    ),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteMaterial(input.id)),
  adjustStock: protectedProcedure
    .input(z.object({ materialId: z.number(), type: z.enum(["in", "out"]), qty: z.number().positive(), note: z.string().optional() }))
    .mutation(({ input }) => db.adjustStock(input.materialId, input.type, input.qty, input.note)),
  movements: protectedProcedure.input(z.object({ materialId: z.number() })).query(({ input }) => db.listStockMovements(input.materialId)),
  // Hammaddenin geçtiği reçeteler: kritik stok "hangi ürünleri etkiliyor" analizi.
  usage: protectedProcedure.input(z.object({ materialId: z.number() })).query(({ input }) => db.listMaterialUsage(input.materialId)),

  /**
   * Excel/CSV ile toplu hammadde yükleme — oluştur-veya-güncelle.
   *
   * Plan istemcide çıkarılır (kullanıcı diff'i görüp onaylar) ama BURADA
   * yeniden kurulur: istemciden gelen plana güvenmek, kullanıcının önizlemede
   * gördüğünden başka bir şeyin yazılabilmesi demek olurdu. Aynı dosya, aynı
   * saf fonksiyon, aynı sonuç.
   *
   * Stok değişimi `adjustStock` üzerinden yürür ki hareket defteri ayrışmasın:
   * ürün stoğunu tabloda sessizce değiştirmek, "bu stok nereden geldi"
   * sorusunu cevapsız bırakır.
   */
  bulkImport: protectedProcedure
    .input(
      z.object({
        /** Dosyanın ham hücre matrisi (ilk satır başlık). */
        matrix: z.array(z.array(z.string())).min(2).max(5001),
        matchBy: z.enum(["ad", "id"]).default("ad"),
        /** Tanınmayan tedarikçileri açsın mı? */
        createSuppliers: z.boolean().default(true),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [materials, suppliers] = await Promise.all([db.listMaterials(), db.listSuppliers()]);
      const supplierRows = (suppliers as { id: number; name: string }[]).map(s => ({
        id: s.id,
        name: s.name,
      }));

      const { parsed, error } = materialMatrixToParsed(input.matrix);
      if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: error ?? "Dosya okunamadı." });

      const records = (materials as Record<string, unknown>[]).map(
        (m): MaterialIORecord => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          category: String(m.category ?? ""),
          unit: String(m.unit ?? ""),
          type: (m.type as MaterialIORecord["type"]) ?? "hammadde",
          stockQty: m.stockQty as string,
          criticalQty: m.criticalQty as string,
          unitCost: m.unitCost as string,
          supplierId: (m.supplierId as number | null) ?? null,
          notes: (m.notes as string | null) ?? null,
        }),
      );

      const plan = planMaterialImport(records, parsed, {
        matchBy: input.matchBy,
        suppliers: supplierRows,
      });

      if (input.dryRun) return { dryRun: true as const, created: 0, updated: 0, plan };

      // Yeni tedarikçiler önce açılır ki satırlar onlara bağlanabilsin.
      const supplierIdByName = new Map(
        supplierRows.map(s => [s.name.trim().toLocaleLowerCase("tr-TR"), s.id]),
      );
      if (input.createSuppliers) {
        for (const name of plan.newSuppliers) {
          const key = name.trim().toLocaleLowerCase("tr-TR");
          if (supplierIdByName.has(key)) continue;
          const id = await db.createSupplier({ name: name.trim() });
          supplierIdByName.set(key, Number(id));
        }
      }
      const resolveSupplier = (name: string | null) =>
        name ? (supplierIdByName.get(name.trim().toLocaleLowerCase("tr-TR")) ?? null) : null;

      const decimals = ["stockQty", "criticalQty", "unitCost"];
      const byId = new Map(records.map(m => [m.id, m]));

      let updated = 0;
      for (const u of plan.updates) {
        const data: Record<string, unknown> = { ...u.data };
        const supplierId = resolveSupplier(u.newSupplier);
        if (supplierId != null) data.supplierId = supplierId;

        // Stok, tablodaki sayıyı ezmek yerine hareket olarak işlenir —
        // "hangi stok nereden geldi" sorusu cevapsız kalmasın.
        const targetStock = data.stockQty;
        delete data.stockQty;
        if (Object.keys(data).length > 0) {
          await db.updateMaterial(u.id, toDecimalFields(data, decimals) as never);
        }
        if (typeof targetStock === "number") {
          const current = parseFloat(String(byId.get(u.id)?.stockQty ?? "0")) || 0;
          const diff = Math.round((targetStock - current) * 10000) / 10000;
          if (diff !== 0) {
            await db.adjustStock(u.id, diff > 0 ? "in" : "out", Math.abs(diff), "Excel ile toplu güncelleme");
          }
        }
        updated++;
      }

      let created = 0;
      for (const c of plan.creates) {
        const data: Record<string, unknown> = { ...c.data };
        const supplierId = resolveSupplier(c.newSupplier);
        if (supplierId != null) data.supplierId = supplierId;
        await db.createMaterial(toDecimalFields(data, decimals) as never);
        created++;
      }

      return { dryRun: false as const, created, updated, plan };
    }),
});


export const productsRouter = router({
  list: protectedProcedure.query(() => db.listProducts()),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getProduct(input.id)),
  create: protectedProcedure.input(productInput).mutation(async ({ input }) => {
    await assertValidParent(input.parentId);
    await assertUniqueIdentity(input.barcode, input.sku);
    await ensureSeriesRecord(input.series);
    return db.createProduct(toDecimalFields(withStatusFlags(input), productDecimalFields) as never);
  }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: productInput.partial() }))
    .mutation(async ({ input }) => {
      if (input.data.parentId !== undefined) await assertValidParent(input.data.parentId);
      if (input.data.barcode !== undefined || input.data.sku !== undefined) {
        await assertUniqueIdentity(input.data.barcode, input.data.sku, input.id);
      }
      if (input.data.series !== undefined) await ensureSeriesRecord(input.data.series);

      // Ana ürün adı değişiyorsa türev başlıklarındaki gömülü eski adı da güncelle.
      // Türev başlığı buildSaleTitle ile üretilir ve ana ürün adını birebir taşır;
      // ad değiştiğinde yeniden üretilmediği için türevlere yansımıyordu (bug).
      let renamedVariants = 0;
      if (input.data.name !== undefined) {
        const current = await db.getProduct(input.id);
        if (current && current.parentId == null && current.name !== input.data.name) {
          const variants = (await db.listProducts()).filter(p => p.parentId === input.id);
          for (const v of variants) {
            const nextName = renameVariantTitle(v.name, current.name, input.data.name);
            if (nextName !== v.name) {
              await db.updateProduct(v.id, { name: nextName });
              renamedVariants++;
            }
          }
        }
      }

      await db.updateProduct(
        input.id,
        toDecimalFields(withStatusFlags(input.data), productDecimalFields) as never,
      );
      return { renamedVariants };
    }),
  // AI görsel üretimi: ürün kartından stüdyo/pazaryeri görseli üretir, S3 URL'ini
  // mockup alanına ya da görsel link listesine yazar (base64 değil — dayanıklı URL,
  // storefront/pazaryeri linklerini besler). Forge (BUILT_IN_FORGE_*) gerektirir.
  generateImage: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        target: z.enum(["mockup", "imageList"]).default("mockup"),
        instructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const p = await db.getProduct(input.productId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
      const bits = [
        `Ürün fotoğrafı: ${p.name}`,
        p.series ? `${p.series} serisi` : null,
        p.colorCode ? `renk kodu ${p.colorCode}` : null,
        p.packaging ? `${p.packaging} ambalajında` : null,
        p.paintType ? `(${p.paintType})` : null,
      ].filter(Boolean);
      const prompt = `${bits.join(", ")}. Profesyonel e-ticaret ürün görseli, temiz beyaz stüdyo arka planı, yumuşak ışık, yüksek çözünürlük, gerçekçi. Türk oto rötuş/hobi boya markası Art of Colour ürünü.${
        input.instructions ? ` Ek yönerge: ${input.instructions}` : ""
      }`;
      let url: string;
      try {
        const res = await generateImage({ prompt });
        if (!res.url) throw new Error("Görsel üretildi ama URL dönmedi");
        url = res.url;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Görsel üretilemedi",
        });
      }
      if (input.target === "mockup") {
        await db.updateProduct(input.productId, { mockupUrl: url });
      } else {
        let list: string[] = [];
        try {
          const arr = JSON.parse(p.imageUrls ?? "[]");
          if (Array.isArray(arr)) list = arr.filter(x => typeof x === "string");
        } catch {
          // bozuk JSON — sıfırdan başla
        }
        list.push(url);
        await db.updateProduct(input.productId, { imageUrls: JSON.stringify(list) });
      }
      return { url };
    }),
  // Excel/CSV toplu içe aktarma: oluştur-veya-güncelle (client planı sunucuda
  // yeniden doğrulanır). Tek listProducts çekimiyle çift barkod/SKU ve üst ürün
  // eşleşmesi bellekte kontrol edilir; başarısız satırlar rapor olarak döner.
  bulkImport: protectedProcedure
    .input(
      z.object({
        creates: z
          .array(z.object({ data: productInput.partial(), parentRef: z.string().nullable().optional() }))
          .max(2000),
        updates: z
          .array(z.object({ id: z.number(), data: productInput.partial() }))
          .max(3000),
      }),
    )
    .mutation(async ({ input }) => {
      const all = await db.listProducts();
      const byId = new Map(all.map(p => [p.id, p]));
      const barcodeOwner = new Map<string, number>(); // barkod → ürün id
      const skuOwner = new Map<string, number>();
      const byBarcode = new Map<string, number>();
      const bySku = new Map<string, number>();
      for (const p of all) {
        if (p.barcode?.trim()) {
          barcodeOwner.set(p.barcode.trim(), p.id);
          byBarcode.set(p.barcode.trim(), p.id);
        }
        if (p.sku?.trim()) {
          skuOwner.set(p.sku.trim(), p.id);
          bySku.set(p.sku.trim(), p.id);
        }
      }
      const seriesSeen = new Set(
        all.map(p => p.series?.trim().toLowerCase()).filter((s): s is string => !!s),
      );
      const ensureSeries = async (series: unknown) => {
        const name = typeof series === "string" ? series.trim() : "";
        if (!name || seriesSeen.has(name.toLowerCase())) return;
        seriesSeen.add(name.toLowerCase());
        const existing = await db.getProductSeriesByName(name);
        if (!existing) await db.createProductSeries({ name });
      };

      let created = 0;
      let updated = 0;
      const failed: Array<{ ref: string; reason: string }> = [];

      // Güncellemeler.
      for (const u of input.updates) {
        const current = byId.get(u.id);
        if (!current) {
          failed.push({ ref: `ID ${u.id}`, reason: "Ürün bulunamadı" });
          continue;
        }
        const nb = u.data.barcode?.trim();
        const ns = u.data.sku?.trim();
        if (nb && (barcodeOwner.get(nb) ?? u.id) !== u.id) {
          failed.push({ ref: current.name, reason: `Barkod "${nb}" başka üründe` });
          continue;
        }
        if (ns && (skuOwner.get(ns) ?? u.id) !== u.id) {
          failed.push({ ref: current.name, reason: `SKU "${ns}" başka üründe` });
          continue;
        }
        try {
          await ensureSeries(u.data.series);
          await db.updateProduct(u.id, toDecimalFields(withStatusFlags(u.data), productDecimalFields) as never);
          // Kimlik değiştiyse sahiplik haritasını güncel tut.
          if (nb) barcodeOwner.set(nb, u.id);
          if (ns) skuOwner.set(ns, u.id);
          updated++;
        } catch (e) {
          failed.push({ ref: current.name, reason: e instanceof Error ? e.message : "Güncelleme hatası" });
        }
      }

      // Yeni ürünler.
      for (const c of input.creates) {
        const name = typeof c.data.name === "string" ? c.data.name.trim() : "";
        if (!name) {
          failed.push({ ref: "(adsız)", reason: "Ürün adı boş" });
          continue;
        }
        const nb = c.data.barcode?.trim();
        const ns = c.data.sku?.trim();
        if (nb && barcodeOwner.has(nb)) {
          failed.push({ ref: name, reason: `Barkod "${nb}" zaten kullanımda` });
          continue;
        }
        if (ns && skuOwner.has(ns)) {
          failed.push({ ref: name, reason: `SKU "${ns}" zaten kullanımda` });
          continue;
        }
        // Üst ürün eşleşmesi (barkod ya da SKU); türev ancak ana ürüne bağlanır.
        let parentId: number | null = null;
        const ref = c.parentRef?.trim();
        if (ref) {
          const pid = byBarcode.get(ref) ?? bySku.get(ref) ?? null;
          const parent = pid !== null ? byId.get(pid) : undefined;
          if (parent && !parent.parentId) parentId = parent.id;
        }
        try {
          await ensureSeries(c.data.series);
          const payload = { ...c.data, name, parentId };
          const newId = await db.createProduct(
            toDecimalFields(withStatusFlags(payload), productDecimalFields) as never,
          );
          const idNum = Number(newId);
          byId.set(idNum, { ...(payload as object), id: idNum } as never);
          if (nb) {
            barcodeOwner.set(nb, idNum);
            byBarcode.set(nb, idNum);
          }
          if (ns) {
            skuOwner.set(ns, idNum);
            bySku.set(ns, idNum);
          }
          created++;
        } catch (e) {
          failed.push({ ref: name, reason: e instanceof Error ? e.message : "Oluşturma hatası" });
        }
      }

      return { created, updated, failed };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteProduct(input.id)),
  // Mamul stok hareket geçmişi: üretim/satış/iade/elle düzeltme kayıtları.
  movements: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .query(({ input }) => db.listProductMovements(input.productId)),
  // Mamul stok giriş/çıkışı hareket kaydıyla (sayım farkı, fire, numune vb.).
  adjustStock: protectedProcedure
    .input(z.object({ productId: z.number(), type: z.enum(["in", "out"]), qty: z.number().positive(), note: z.string().optional() }))
    .mutation(({ input }) =>
      db.recordProductMovement(
        input.productId,
        input.type,
        input.qty,
        input.note?.trim() || (input.type === "in" ? "Elle giriş" : "Elle çıkış"),
      ),
    ),
  // Toplu zam/indirim: tüm ürünlerin (veya bir serinin) fiyatı yüzdeyle güncellenir.
  bulkPrice: protectedProcedure
    .input(z.object({ percent: z.number().min(-90).max(500), series: z.string().nullable().optional() }))
    .mutation(({ input }) => db.bulkUpdatePrices(input.percent, input.series ?? null)),
  // Fiyat & Kâr tablosu: tüm ürünlerin hammadde maliyeti tek sorguda.
  costSummary: protectedProcedure.query(async () => {
    const rows = await db.listProductMaterialCosts();
    return rows.map(r => ({ productId: r.productId, materialCost: parseFloat(String(r.materialCost)) || 0 }));
  }),
  // Önizlemede onaylanan yeni fiyat listesi (formülle/CSV ile toplu güncelleme).
  applyPrices: protectedProcedure
    .input(
      z.object({
        updates: z
          .array(z.object({ id: z.number(), salePrice: z.number().min(0).max(1000000), discountPercent: z.number().min(0).max(100).optional() }))
          .min(1)
          .max(2000),
        // Dolu ise fiyat o pazaryerine özel yazılır (taban/web fiyatı değişmez).
        channel: z.enum(MARKETPLACE_CHANNELS).nullable().optional(),
      }),
    )
    .mutation(({ input }) => db.applyPriceUpdates(input.updates, input.channel ?? null)),
  // Barkodlu ürünlerin stok ve fiyatını Trendyol'a gönderir (mevcut listelemeleri günceller).
  pushToTrendyol: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const all = await db.listProducts();
      const chosen = input.ids?.length ? all.filter(p => input.ids!.includes(p.id)) : all;
      const items = chosen
        // Yalnız "satista" ürünler pazaryerine gider (Faz A3).
        .filter(p => p.status === "satista" && p.barcode && p.barcode.trim())
        .map(p => {
          // Trendyol'a özel fiyat varsa o kullanılır, yoksa taban (web) fiyatı.
          const eff = effectiveChannelPrice(
            { salePrice: parseFloat(String(p.salePrice)) || 0, discountPercent: parseFloat(String(p.discountPercent)) || 0 },
            parseChannelPrices(p.channelPrices),
            "trendyol",
          );
          return {
            barcode: p.barcode!.trim(),
            quantity: p.stockQty ?? 0,
            listPrice: eff.salePrice,
            salePrice: +(eff.salePrice * (1 - eff.discountPercent / 100)).toFixed(2),
          };
        });
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Barkodu olan ürün yok. Ürün düzenlemede barkod girin, sonra tekrar deneyin.",
        });
      }
      try {
        return await pushTrendyolStockPrice(items);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Trendyol'a gönderim başarısız",
        });
      }
    }),
  // Barkodlu ürünlerin stok ve fiyatını Hepsiburada'ya gönderir (barkod = merchantSku varsayımı).
  pushToHepsiburada: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const all = await db.listProducts();
      const chosen = input.ids?.length ? all.filter(p => input.ids!.includes(p.id)) : all;
      const items = chosen
        // Yalnız "satista" ürünler pazaryerine gider (Faz A3).
        .filter(p => p.status === "satista" && p.barcode && p.barcode.trim())
        .map(p => {
          // Hepsiburada'ya özel fiyat varsa o kullanılır, yoksa taban (web) fiyatı.
          const eff = effectiveChannelPrice(
            { salePrice: parseFloat(String(p.salePrice)) || 0, discountPercent: parseFloat(String(p.discountPercent)) || 0 },
            parseChannelPrices(p.channelPrices),
            "hepsiburada",
          );
          return {
            merchantSku: p.barcode!.trim(),
            price: +(eff.salePrice * (1 - eff.discountPercent / 100)).toFixed(2),
            availableStock: p.stockQty ?? 0,
          };
        });
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Barkodu olan ürün yok. Ürün düzenlemede barkod girin, sonra tekrar deneyin.",
        });
      }
      try {
        return await pushHepsiburadaStockPrice(items);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Hepsiburada'ya gönderim başarısız",
        });
      }
    }),
  // N11'e stok/fiyat gönderimi (SKU önce, yoksa barkod ile eşleşir).
  pushToN11: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const all = await db.listProducts();
      const chosen = input.ids?.length ? all.filter(p => input.ids!.includes(p.id)) : all;
      const items = chosen
        .filter(p => p.status === "satista" && ((p.sku && p.sku.trim()) || (p.barcode && p.barcode.trim())))
        .map(p => {
          const eff = effectiveChannelPrice(
            { salePrice: parseFloat(String(p.salePrice)) || 0, discountPercent: parseFloat(String(p.discountPercent)) || 0 },
            parseChannelPrices(p.channelPrices),
            "n11",
          );
          return {
            sellerStockCode: (p.sku?.trim() || p.barcode!.trim()),
            quantity: p.stockQty ?? 0,
            price: +(eff.salePrice * (1 - eff.discountPercent / 100)).toFixed(2),
          };
        });
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SKU/barkodu olan satıştaki ürün yok. Ürün kartında SKU veya barkod girin.",
        });
      }
      try {
        return await pushN11StockPrice(items);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "N11'e gönderim başarısız",
        });
      }
    }),
  // Çiçeksepeti'ne stok/fiyat gönderimi.
  pushToCiceksepeti: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const all = await db.listProducts();
      const chosen = input.ids?.length ? all.filter(p => input.ids!.includes(p.id)) : all;
      const items = chosen
        .filter(p => p.status === "satista" && ((p.sku && p.sku.trim()) || (p.barcode && p.barcode.trim())))
        .map(p => {
          const eff = effectiveChannelPrice(
            { salePrice: parseFloat(String(p.salePrice)) || 0, discountPercent: parseFloat(String(p.discountPercent)) || 0 },
            parseChannelPrices(p.channelPrices),
            "ciceksepeti",
          );
          return {
            stockCode: (p.sku?.trim() || p.barcode!.trim()),
            quantity: p.stockQty ?? 0,
            price: +(eff.salePrice * (1 - eff.discountPercent / 100)).toFixed(2),
          };
        });
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SKU/barkodu olan satıştaki ürün yok. Ürün kartında SKU veya barkod girin.",
        });
      }
      try {
        return await pushCiceksepetiStockPrice(items);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Çiçeksepeti'ne gönderim başarısız",
        });
      }
    }),
  // Keşif uçları (Ayarlar → eşleme kurarken): marka ID ve kategori özellikleri.
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
  images: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .query(({ input }) => db.getProductImages(input.productId)),
  // Tüm ürünlerin hangi görsellere sahip olduğunun hafif listesi (dışa aktarım linkleri için).
  allImageRefs: protectedProcedure.query(() => db.listAllProductImageRefs()),
  setImage: protectedProcedure
    .input(z.object({ productId: z.number(), kind: z.enum(["main", "packaging", "usage"]), data: z.string().min(1) }))
    .mutation(({ input }) => db.setProductImage(input.productId, input.kind, input.data)),
  deleteImage: protectedProcedure
    .input(z.object({ productId: z.number(), kind: z.enum(["main", "packaging", "usage"]) }))
    .mutation(({ input }) => db.deleteProductImage(input.productId, input.kind)),
});


export const productionRouter = router({
  // Üretim kaydı: reçete × adet kadar hammadde stoktan düşülür (hareket notuyla).
  produce: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        qty: z.number().positive(),
        force: z.boolean().default(false),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const product = await db.getProduct(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
      const formula = await db.listFormulaItems(input.productId);
      if (formula.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu ürünün reçetesi yok — önce Formül Defteri'nden ekleyin." });
      }
      const mats = await db.listMaterials();
      const byId = new Map(mats.map(m => [m.id, m]));
      const missing: string[] = [];
      for (const f of formula) {
        const m = byId.get(f.materialId);
        const need = input.qty * (parseFloat(String(f.qty)) || 0);
        const stock = m ? parseFloat(String(m.stockQty)) || 0 : 0;
        if (!m || stock < need) {
          missing.push(`${f.materialName ?? "?"} (gereken ${need}, stok ${stock})`);
        }
      }
      if (missing.length > 0 && !input.force) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Stok yetersiz: ${missing.join(", ")}` });
      }
      for (const f of formula) {
        const need = input.qty * (parseFloat(String(f.qty)) || 0);
        if (need > 0) {
          await db.adjustStock(f.materialId, "out", need, `Üretim: ${input.qty}× ${product.name}`);
        }
      }
      // Üretim emri kaydı + mamul stok girişi (Faz 0.2): üretilen adet
      // ürünün stoğuna eklenir, üretim geçmişi productionRuns'ta izlenir.
      const noteParts = [
        input.note?.trim() || null,
        missing.length > 0 ? `Eksik stokla zorlandı: ${missing.join(", ")}` : null,
      ].filter((s): s is string => !!s);
      await db.recordProductionRun(input.productId, Math.round(input.qty), noteParts.length > 0 ? noteParts.join(" · ") : null);
      return { deducted: formula.length, missing };
    }),
  // Üretim geçmişi: son üretim emirleri (ürün adıyla).
  runs: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(50) }).optional())
    .query(({ input }) => db.listProductionRuns(input?.limit ?? 50)),
  // Yanlış girilen üretim emrini geri alır: hammaddeler GÜNCEL reçeteye göre
  // stoğa iade edilir, mamul stok girişi geri düşülür. Kayıt silinmez —
  // notuna "geri alındı" damgası vurulur (izlenebilirlik).
  undo: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const run = await db.getProductionRun(input.id);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Üretim kaydı bulunamadı" });
      if (run.note?.startsWith("⛔")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu üretim kaydı zaten geri alınmış." });
      }
      const product = await db.getProduct(run.productId);
      const formula = await db.listFormulaItems(run.productId);
      for (const f of formula) {
        const back = run.qty * (parseFloat(String(f.qty)) || 0);
        if (back > 0) {
          await db.adjustStock(f.materialId, "in", back, `Üretim geri alındı: ${run.qty}× ${product?.name ?? `#${run.productId}`}`);
        }
      }
      await db.recordProductMovement(run.productId, "out", run.qty, "Üretim geri alındı");
      const stamp = new Date().toLocaleDateString("tr-TR");
      await db.setProductionRunNote(input.id, `⛔ Geri alındı (${stamp})${run.note ? ` — ${run.note}` : ""}`);
      return { restoredMaterials: formula.length };
    }),
});


export const formulaRouter = router({
  list: protectedProcedure.input(z.object({ productId: z.number() })).query(({ input }) => db.listFormulaItems(input.productId)),
  // Tüm reçete kalemleri (hafif): Üretim sayfası her ürün için "mevcut
  // hammaddeyle kaç adet üretilebilir" hesabını istemcide yapar.
  all: protectedProcedure.query(() => db.listAllFormulaItems()),
  add: protectedProcedure
    .input(z.object({ productId: z.number(), materialId: z.number(), qty: z.number().positive(), note: z.string().optional() }))
    .mutation(({ input }) => db.addFormulaItem(input.productId, input.materialId, input.qty, input.note)),
  update: protectedProcedure
    .input(z.object({ id: z.number(), qty: z.number().positive(), note: z.string().optional() }))
    .mutation(({ input }) => db.updateFormulaItem(input.id, input.qty, input.note)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteFormulaItem(input.id)),
  // Başka ürünün reçetesini bu ürüne kopyalar (mevcut kalemler değiştirilir).
  // Çarpan: set/paket türevleri için miktarları katlar (örn. 2'li set → 2).
  copyFrom: protectedProcedure
    .input(
      z.object({
        fromProductId: z.number(),
        toProductId: z.number(),
        multiplier: z.number().positive().max(100).default(1),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.fromProductId === input.toProductId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kaynak ve hedef ürün aynı olamaz." });
      }
      const result = await db.copyFormula(input.fromProductId, input.toProductId, input.multiplier);
      if (result.copied === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kaynak ürünün reçetesi boş — kopyalanacak kalem yok." });
      }
      return result;
    }),
});


// Ürün serileri: seri bazlı kâr oranı, KDV ve hazır açıklama şablonları.
export const seriesRouter = router({
  list: protectedProcedure.query(() => db.listProductSeries()),
  // Ürün motoru v2: prefix + ambalaj seçenekleri + uygulanabilir yüzeyleri
  // normalize edip döndürür (JSON alanlar güvenli parse edilir). Adım 1'deki
  // seri dropdown'u ve yüzey/ambalaj çoklu seçimleri bunu okur.
  getSeriesWithDetails: protectedProcedure.query(async () => {
    const rows = await db.listProductSeries();
    const asArray = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string" && v.trim()) {
        try {
          const p = JSON.parse(v);
          return Array.isArray(p) ? p : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    return rows.map(s => ({
      id: s.id,
      name: s.name,
      nameEn: (s as { nameEn?: string | null }).nameEn ?? null,
      prefix: (s.prefix ?? "").trim() || null,
      profitMargin: s.profitMargin,
      vatRate: s.vatRate,
      category: s.category,
      packagingOptions: asArray(s.packagingOptions) as { label: string; value: string }[],
      applicationSurfaces: asArray(s.applicationSurfaces) as string[],
      colorOptions: asArray(s.colorOptions) as { label: string; value: string; hex?: string | null }[],
      guideTemplate: s.guideTemplate ?? null,
      labelTemplate: s.labelTemplate ?? null,
      shortDescription: s.shortDescription ?? null,
      longDescription: s.longDescription ?? null,
      applicationText: s.applicationText ?? null,
      faqContent: (s as { faqContent?: string | null }).faqContent ?? null,
    }));
  }),
  // Otomatik ürün/renk kodu üretir: prefix + 4 haneli sıra no (örn. CND0042).
  // seriesId verilirse serinin prefix'i kullanılır; doğrudan prefix de verilebilir.
  getNextCode: protectedProcedure
    .input(z.object({ seriesId: z.number().optional(), prefix: z.string().optional() }))
    .query(async ({ input }) => {
      let prefix = input.prefix?.trim() ?? "";
      if (!prefix && input.seriesId) {
        const all = await db.listProductSeries();
        const s = all.find(x => x.id === input.seriesId);
        prefix = (s?.prefix ?? "").trim();
      }
      if (!prefix) {
        return { code: null, prefix: null };
      }
      const code = await db.getNextSeriesCode(prefix);
      return { code, prefix: prefix.toUpperCase() };
    }),
  // Bir projenin tüm varyant çıktılarını Excel için satır matrisine çevirir.
  // Client (xlsx) bu matrisi .xlsx dosyasına yazar (mevcut ProductImport paritesi).
  exportToExcel: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const gens = await db.listProductGenerations(input.projectId);
      const header = [
        "Varyant Kodu",
        "Renk",
        "Ambalaj",
        "Durum",
        "Trendyol Başlık",
        "Trendyol Açıklama",
        "Hepsiburada Başlık",
        "Hepsiburada Açıklama",
        "Etiket İçeriği",
        "Kullanım Kılavuzu",
        "Uygulama Notları",
        "Önerilen Fiyat",
        "Maliyet",
      ];
      const rows = gens.map(g => [
        g.variantCode,
        g.color ?? "",
        g.packaging,
        g.status,
        g.trendyolTitle ?? "",
        g.trendyolDescription ?? "",
        g.hepsiburadaTitle ?? "",
        g.hepsiburadaDescription ?? "",
        g.labelContent ?? "",
        g.guideContent ?? "",
        g.applicationNotes ?? "",
        parseFloat(String(g.suggestedPrice)) || 0,
        parseFloat(String(g.costPrice)) || 0,
      ]);
      return { matrix: [header, ...rows] };
    }),
  // Seri bazlı içerik üretimi: TEK LLM çağrısında kısa açıklama, uzun açıklama,
  // uygulama metni ve SSS/blog üretir. İçerik seri bazlıdır — varyantlarda
  // sadece renk/gramaj değişir, bu metinler tüm varyantlarca paylaşılır.
  // Böylece varyant başına ayrı AI çağrısı (85+) tamamen ortadan kalkar.
  generateContent: protectedProcedure
    .input(z.object({ id: z.number(), extraInstructions: z.string().nullable().optional() }))
    .mutation(async ({ input }) => {
      const all = await db.listProductSeries();
      const series = all.find(s => s.id === input.id);
      if (!series) throw new TRPCError({ code: "NOT_FOUND", message: "Seri bulunamadı" });

      const asArray = (v: unknown): unknown[] => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string" && v.trim()) {
          try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        }
        return [];
      };
      const surfaces = (asArray(series.applicationSurfaces) as unknown[]).map(String);
      const packaging = (asArray(series.packagingOptions) as { label?: string; value?: string }[])
        .map(p => p?.label || p?.value)
        .filter(Boolean);
      const colors = (asArray(series.colorOptions) as { label?: string }[])
        .map(c => c?.label)
        .filter(Boolean);

      const systemPrompt = `Sen Art of Colour markasının web içerik yazarısın. Art of Colour; oto rötuş boyaları, renk değiştiren efekt boyalar (METEOR), sedefli boyalar (VİVİD), transparan boyalar (CANDY), vernik (GLOSS), astarlar (PRİMER/PRIME X), RAL kodlu spreyler ve airbrush boyaları üreten bir Türk boya markasıdır.
Görevin: verilen ürün SERİSİ için web sitesinde kullanılacak içerik üretmek. İçerik SERİ bazlıdır; tek tek renk/gramaj varyantı için değil, tüm seri için geçerli olmalı. Renk ve gramaj gibi varyanta özel detayları metne gömme — bunun yerine {{renk}} ve {{ambalaj}} yer tutucularını gerektiğinde kullanabilirsin (opsiyonel). Türkçe yaz, sektörel terimleri doğru kullan (bazkat, 1K/2K, astar, vernik, örtücülük). Abartılı/yanıltıcı iddia veya uydurma istatistik yazma.
YALNIZCA şu anahtarlarla geçerli bir JSON nesnesi döndür, başka hiçbir şey yazma:
{
"shortDescription": "1-2 cümlelik kısa açıklama — web sitesinde ürünün yanında görünen vurucu tanıtım metni (düz metin)",
"longDescription": "Ürün hakkında detaylı bilgi: giriş paragrafı + madde işaretli özellikler + kullanım alanları. HTML formatında (<p>, <ul>, <li>, <strong>)",
"applicationText": "Adım adım uygulama/kullanım metni: yüzey hazırlığı, çalkalama, kat sayısı, katlar arası bekleme, kuruma süreleri, vernik. HTML formatında",
"faqContent": "Sıkça Sorulan Sorular — blog tarzı, uygulama ve ürün hakkında en az 5 soru-cevap. HTML formatında (<h3> soru, <p> cevap)"
}`;
      const userPrompt = [
        `Seri: ${series.name}`,
        series.category ? `Kategori: ${series.category}` : null,
        colors.length ? `Renk seçenekleri: ${colors.join(", ")}` : null,
        packaging.length ? `Ambalaj/hacim seçenekleri: ${packaging.join(", ")}` : null,
        surfaces.length ? `Uygulanabilir yüzeyler: ${surfaces.join(", ")}` : null,
        series.notes ? `Notlar: ${series.notes}` : null,
        input.extraInstructions ? `Ek yönergeler: ${input.extraInstructions}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      let parsed: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          });
          const raw = response.choices[0]?.message?.content;
          const p = extractJson(typeof raw === "string" ? raw : "");
          if (p && typeof p === "object" && Object.keys(p).length > 0) parsed = p;
        } catch {
          // sıradaki denemeye geç
        }
      }
      if (!parsed) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI içerik üretemedi, lütfen tekrar deneyin." });
      }
      const str = (k: string) => (typeof parsed![k] === "string" ? (parsed![k] as string) : null);
      const patch = {
        shortDescription: str("shortDescription"),
        longDescription: str("longDescription"),
        applicationText: str("applicationText"),
        faqContent: str("faqContent"),
      };
      await db.updateProductSeries(input.id, patch as never);
      return patch;
    }),
  create: protectedProcedure.input(productSeriesInput).mutation(async ({ input }) => {
    const existing = await db.getProductSeriesByName(input.name);
    if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Bu isimde bir seri zaten var." });
    return db.createProductSeries(toDecimalFields(input, ["profitMargin", "vatRate"]) as never);
  }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: productSeriesInput.partial() }))
    .mutation(({ input }) =>
      db.updateProductSeries(input.id, toDecimalFields(input.data, ["profitMargin", "vatRate"]) as never),
    ),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteProductSeries(input.id)),
});
