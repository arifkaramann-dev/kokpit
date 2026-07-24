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
import { buildSaleTitle, deriveCombos, parseSetCount, renameVariantTitle } from "../productUtils";
import { computePrice, extractJson, parseFeatures, pickReferenceProduct, scoreReference, suggestSku } from "../autofill";
import { computeReorderSuggestions, summarizeReorder } from "../reorder";
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
  stockQty: z.number().min(0).default(0),
  criticalQty: z.number().min(0).default(0),
  unitCost: z.number().min(0).default(0),
  supplierId: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
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
  if (!existing) await db.createProductSeries({ name } as never);
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
  profitMargin: z.number().min(0).max(999).default(35),
  vatRate: z.number().min(0).max(100).default(20),
  category: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  applicationText: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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
    db.createMaterial(toDecimalFields(input, ["stockQty", "criticalQty", "unitCost"]) as never),
  ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: materialInput.partial() }))
    .mutation(({ input }) =>
      db.updateMaterial(input.id, toDecimalFields(input.data, ["stockQty", "criticalQty", "unitCost"]) as never),
    ),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteMaterial(input.id)),
  adjustStock: protectedProcedure
    .input(z.object({ materialId: z.number(), type: z.enum(["in", "out"]), qty: z.number().positive(), note: z.string().optional() }))
    .mutation(({ input }) => db.adjustStock(input.materialId, input.type, input.qty, input.note)),
  movements: protectedProcedure.input(z.object({ materialId: z.number() })).query(({ input }) => db.listStockMovements(input.materialId)),
  // Hammaddenin geçtiği reçeteler: kritik stok "hangi ürünleri etkiliyor" analizi.
  usage: protectedProcedure.input(z.object({ materialId: z.number() })).query(({ input }) => db.listMaterialUsage(input.materialId)),
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
              await db.updateProduct(v.id, { name: nextName } as never);
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
  // Faz A1: mevcut verideki çift barkod/SKU grupları (unique indeks öncesi temizlik raporu).
  duplicateIdentity: protectedProcedure.query(async () => {
    const all = await db.listProducts();
    const byBarcode = new Map<string, string[]>();
    const bySku = new Map<string, string[]>();
    for (const p of all) {
      const b = p.barcode?.trim();
      const s = p.sku?.trim();
      if (b) byBarcode.set(b, [...(byBarcode.get(b) ?? []), p.name]);
      if (s) bySku.set(s, [...(bySku.get(s) ?? []), p.name]);
    }
    const dupes = (m: Map<string, string[]>, kind: "barkod" | "sku") =>
      Array.from(m.entries())
        .filter(([, names]) => names.length > 1)
        .map(([value, names]) => ({ kind, value, names }));
    return [...dupes(byBarcode, "barkod"), ...dupes(bySku, "sku")];
  }),
  // Faz A5: görseli olan ürün ID'leri (sağlık skoru görsel kontrolü).
  idsWithImages: protectedProcedure.query(() => db.listProductIdsWithImages()),
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
        await db.updateProduct(input.productId, { mockupUrl: url } as never);
      } else {
        let list: string[] = [];
        try {
          const arr = JSON.parse(p.imageUrls ?? "[]");
          if (Array.isArray(arr)) list = arr.filter(x => typeof x === "string");
        } catch {
          // bozuk JSON — sıfırdan başla
        }
        list.push(url);
        await db.updateProduct(input.productId, { imageUrls: JSON.stringify(list) } as never);
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
        if (!existing) await db.createProductSeries({ name } as never);
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
  // Ana üründen yüzey × ambalaj × renk kombinasyonlarını tek tıkla türetir.
  deriveMany: protectedProcedure
    .input(
      z.object({
        parentId: z.number(),
        uses: z.array(z.string().min(1)).default([]),
        packagings: z.array(z.string().min(1)).default([]),
        colors: z.array(z.string().min(1)).default([]),
        sets: z.array(z.string().min(1)).default([]),
      }),
    )
    .mutation(async ({ input }) => {
      const parent = await db.getProduct(input.parentId);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Ana ürün bulunamadı" });
      if (parent.parentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Türevden türetme yapılamaz — ana ürünü seçin." });
      }
      // SKU tekilliği (Faz A1): mevcut SKU'larla çakışan öneriye sayı eklenir.
      const existingSkus = new Set(
        (await db.listProducts()).map(p => p.sku?.trim()).filter((s): s is string => !!s),
      );
      const uniqueSku = (base: string) => {
        let candidate = base;
        for (let i = 2; existingSkus.has(candidate); i++) candidate = `${base}-${i}`;
        existingSkus.add(candidate);
        return candidate;
      };
      const combos = deriveCombos(input.uses, input.packagings, input.colors, input.sets);
      const noSelection =
        input.uses.length === 0 &&
        input.packagings.length === 0 &&
        input.colors.length === 0 &&
        input.sets.length === 0;
      if (combos.length === 0 || noSelection) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "En az bir seçenek işaretleyin" });
      }
      if (combos.length > 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${combos.length} kombinasyon çok fazla (en fazla 60)` });
      }
      for (const combo of combos) {
        // Set/paket türevlerinde fiyat ve ambalaj maliyeti adetle çarpılır.
        const setCount = parseSetCount(combo.set);
        const title = buildSaleTitle(parent.name, combo.use, combo.packaging, combo.color, combo.set);
        const id = await db.createProduct({
          parentId: parent.id,
          name: title,
          series: parent.series,
          colorCode: parent.colorCode,
          colorHex: parent.colorHex,
          surfaceType: combo.use ?? parent.surfaceType,
          packaging: combo.packaging ?? parent.packaging,
          description: parent.description,
          salePrice: String((parseFloat(parent.salePrice) || 0) * setCount),
          discountPercent: parent.discountPercent,
          packagingCost: String((parseFloat(parent.packagingCost) || 0) * setCount),
          shippingCost: parent.shippingCost,
          labelSize: parent.labelSize,
          labelText: parent.labelText,
          usageGuide: parent.usageGuide,
          safetyNotes: parent.safetyNotes,
          extraInfo: parent.extraInfo,
          // Pazaryeri alanları ana üründen devralınır; SKU türev başlığından üretilir.
          sku: uniqueSku(suggestSku(title, combo.packaging ?? parent.packaging)),
          category: parent.category,
          profitMargin: parent.profitMargin,
          vatRate: parent.vatRate,
          desi: parent.desi,
          paintType: parent.paintType,
          features: parent.features,
          shortDescription: parent.shortDescription,
          longDescription: parent.longDescription,
          applicationText: parent.applicationText,
          labelWarnings: parent.labelWarnings,
        } as never);
        await db.copyProductImages(parent.id, Number(id));
        // Reçete de kopyalanır ki türevin maliyet analizi boş kalmasın;
        // set/paket türevlerinde malzeme miktarları adetle çarpılır.
        const formula = await db.listFormulaItems(parent.id);
        for (const item of formula) {
          await db.addFormulaItem(
            Number(id),
            item.materialId,
            (parseFloat(String(item.qty)) || 0) * setCount,
            item.note ?? undefined,
          );
        }
      }
      return { count: combos.length };
    }),
  // Ana ürün kartındaki seçili alan gruplarını tüm türevlere kopyalar.
  // Türeve özgü alanlara (ad, fiyat, ambalaj, barkod, SKU, stok, renk,
  // yüzey, katkılar) bilinçli olarak dokunulmaz.
  propagateToVariants: protectedProcedure
    .input(
      z.object({
        parentId: z.number(),
        groups: z
          .array(z.enum(["aciklamalar", "etiket", "pazaryeri", "medya", "maliyet"]))
          .min(1),
        // true: türevde dolu olan alanın üzerine yazılmaz, yalnız boşlar doldurulur
        // (bilinçli farklılaştırılmış türev içeriği korunur).
        onlyEmpty: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const parent = await db.getProduct(input.parentId);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Ana ürün bulunamadı" });
      const variants = (await db.listProducts()).filter(p => p.parentId === parent.id);
      if (variants.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu ana ürünün türevi yok" });
      }
      const groupFields = {
        aciklamalar: ["description", "shortDescription", "longDescription", "applicationText"],
        etiket: ["labelText", "usageGuide", "safetyNotes", "labelWarnings", "labelSize", "extraInfo"],
        pazaryeri: ["category", "paintType", "features"],
        medya: ["imageUrls", "videoUrl", "mockupUrl"],
        maliyet: ["profitMargin", "vatRate", "desi", "discountPercent", "shippingCost"],
      } as const;
      // Değerler DB'den okunduğu için decimal alanlar zaten string; dönüşüm gerekmez.
      const isFilled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
      let updated = 0;
      for (const variant of variants) {
        const patch: Record<string, unknown> = {};
        for (const group of input.groups) {
          for (const field of groupFields[group]) {
            if (input.onlyEmpty && isFilled((variant as Record<string, unknown>)[field])) continue;
            patch[field] = (parent as Record<string, unknown>)[field];
          }
        }
        if (Object.keys(patch).length > 0) {
          await db.updateProduct(variant.id, patch as never);
          updated++;
        }
      }
      return { count: updated };
    }),
  // Toplu zam/indirim: tüm ürünlerin (veya bir serinin) fiyatı yüzdeyle güncellenir.
  bulkPrice: protectedProcedure
    .input(z.object({ percent: z.number().min(-90).max(500), series: z.string().nullable().optional() }))
    .mutation(({ input }) => db.bulkUpdatePrices(input.percent, input.series ?? null)),
  // Fiyat & Kâr tablosu: tüm ürünlerin hammadde maliyeti tek sorguda.
  costSummary: protectedProcedure.query(async () => {
    const rows = await db.listProductMaterialCosts();
    return rows.map(r => ({ productId: r.productId, materialCost: parseFloat(String(r.materialCost)) || 0 }));
  }),
  // Otomatik doldurma (ÜRÜN KAYIT Excel mantığı): reçete maliyeti + seri kâr
  // oranı → fiyat önerisi; seri şablonlarından açıklamalar; SKU/barkod önerisi.
  // Ek olarak: türev ekleniyorsa ana üründen, değilse aynı serideki en dolu
  // ürün kartından etiket/kılavuz/pazaryeri alanları referans alınır.
  autofill: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        series: z.string().nullable().optional(),
        packaging: z.string().nullable().optional(),
        // Reçetesi/maliyeti okunacak ürün: düzenlenen ürünün kendisi veya ana ürün.
        recipeProductId: z.number().nullable().optional(),
        // Türev ekleme akışında ana ürün — içerik referansı olarak öncelikli.
        parentProductId: z.number().nullable().optional(),
        // Düzenlenen ürünün kendisi referans adayı olmasın diye hariç tutulur.
        excludeProductId: z.number().nullable().optional(),
      }),
    )
    .query(async ({ input }) => {
      const seriesRec = input.series ? await db.getProductSeriesByName(input.series) : null;
      const recipeProduct = input.recipeProductId ? await db.getProduct(input.recipeProductId) : null;
      const materialCost = input.recipeProductId
        ? await db.getProductMaterialCost(input.recipeProductId)
        : 0;
      const packagingCost = recipeProduct ? parseFloat(String(recipeProduct.packagingCost)) || 0 : 0;
      const shippingCost = recipeProduct ? parseFloat(String(recipeProduct.shippingCost)) || 0 : 0;
      const profitMargin = seriesRec ? parseFloat(String(seriesRec.profitMargin)) || 35 : 35;
      const vatRate = seriesRec ? parseFloat(String(seriesRec.vatRate)) || 20 : 20;
      const price = computePrice({ materialCost, packagingCost, shippingCost, profitMargin, vatRate });
      const sku = suggestSku(input.name, input.packaging);

      // İçerik referansı: ana ürün > aynı serideki en dolu kart.
      const parentProduct = input.parentProductId ? await db.getProduct(input.parentProductId) : null;
      const siblings = input.series
        ? await db.listSeriesReferenceCandidates(input.series, input.excludeProductId ?? null)
        : [];
      const ref =
        (parentProduct && scoreReference(parentProduct) > 0 ? parentProduct : null) ??
        pickReferenceProduct(siblings.filter(s => s.id !== input.parentProductId));
      const refStr = (v: string | null | undefined) => (v && v.trim() ? v : null);
      const refNum = (v: unknown) => {
        const n = parseFloat(String(v ?? ""));
        return Number.isFinite(n) && n > 0 ? n : null;
      };

      return {
        sku,
        // Excel'de barkod = satıcı stok kodu; pazaryerinde ayrı barkod varsa elle değiştirilir.
        barcode: sku,
        profitMargin,
        vatRate,
        // Seri şablonu öncelikli, yoksa referans ürünün kartı.
        category: seriesRec?.category ?? refStr(ref?.category) ?? null,
        shortDescription: seriesRec?.shortDescription ?? refStr(ref?.shortDescription) ?? null,
        longDescription: seriesRec?.longDescription ?? refStr(ref?.longDescription) ?? null,
        applicationText: seriesRec?.applicationText ?? refStr(ref?.applicationText) ?? null,
        // Referans karttan gelen alanlar (yalnızca boş form alanlarına yazılır).
        reference: ref
          ? {
              id: ref.id,
              name: ref.name,
              labelSize: refStr(ref.labelSize),
              labelText: refStr(ref.labelText),
              usageGuide: refStr(ref.usageGuide),
              safetyNotes: refStr(ref.safetyNotes),
              extraInfo: refStr(ref.extraInfo),
              labelWarnings: refStr(ref.labelWarnings),
              paintType: refStr(ref.paintType),
              features: parseFeatures(ref.features),
              desi: refNum(ref.desi),
              criticalQty: ref.criticalQty > 0 ? ref.criticalQty : null,
              packagingCost: refNum(ref.packagingCost),
              shippingCost: refNum(ref.shippingCost),
              packaging: refStr(ref.packaging),
            }
          : null,
        seriesFound: !!seriesRec,
        hasRecipe: materialCost > 0,
        materialCost,
        packagingCost,
        shippingCost,
        ...price,
      };
    }),
  // AI ile içerik üretimi: kısa/uzun açıklama, uygulama metni, etiket yazısı,
  // uyarılar ve 5 özellik. Seri şablonu yoksa veya ürüne özel metin istenince kullanılır.
  aiFill: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        series: z.string().nullable().optional(),
        packaging: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        surfaceType: z.string().nullable().optional(),
        paintType: z.string().nullable().optional(),
        extraInstructions: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const systemPrompt = `Sen Art of Colour markasının ürün içerik yazarısın. Art of Colour; oto rötuş boyaları, renk değiştiren efekt boyalar (METEOR), sedefli boyalar (VİVİD), transparan boyalar (CANDY), vernik (GLOSS), astarlar (PRİMER/PRIME X), RAL kodlu spreyler ve airbrush boyaları üreten butik bir Türk boya markasıdır.
Görevin: verilen ürün için pazaryeri ürün kartı içeriği üretmek. Türkçe yaz, sektörel terimleri doğru kullan (bazkat, 1K/2K, astar, vernik, örtücülük). Abartılı/yanıltıcı iddia yazma.
YALNIZCA şu anahtarlarla geçerli bir JSON nesnesi döndür, başka hiçbir şey yazma:
{
"shortDescription": "1-2 cümlelik vurucu özet (düz metin)",
"longDescription": "Başlık + madde işaretli özellikler + kullanım alanları içeren HTML (<p>, <ul>, <li>, <strong> kullan)",
"applicationText": "Adım adım uygulama talimatı (yüzey hazırlığı, çalkalama, kat sayısı, kuruma süreleri) HTML formatında",
"labelText": "Etiket üzerine basılacak 2-3 cümlelik kısa tanıtım (düz metin)",
"labelWarnings": "Etiket güvenlik uyarıları: ısı/güneş, çocuklardan uzak, havalandırma vb. (düz metin, kısa)",
"features": ["en fazla 5 özellik", "örn. Hızlı Kuruma", "Parlak", "Tüm Yüzeylere"]
}`;
      const userPrompt = [
        `Ürün adı: ${input.name}`,
        input.series ? `Seri: ${input.series}` : null,
        input.packaging ? `Ambalaj: ${input.packaging}` : null,
        input.color ? `Renk: ${input.color}` : null,
        input.surfaceType ? `Yüzey/kullanım alanı: ${input.surfaceType}` : null,
        input.paintType ? `Ürün türü: ${input.paintType}` : null,
        input.extraInstructions ? `Ek yönergeler: ${input.extraInstructions}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = response.choices[0]?.message?.content;
      const parsed = extractJson(typeof raw === "string" ? raw : "");
      if (!parsed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "AI içerik üretemedi, lütfen tekrar deneyin." });
      }
      const str = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string) : null);
      const features = Array.isArray(parsed.features)
        ? (parsed.features as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 5)
        : [];
      return {
        shortDescription: str("shortDescription"),
        longDescription: str("longDescription"),
        applicationText: str("applicationText"),
        labelText: str("labelText"),
        labelWarnings: str("labelWarnings"),
        features,
      };
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
  // Faz C: Trendyol'da SIFIRDAN ürün kartı açma — ana ürünün "satista" türevleri
  // ortak productMainId ile TEK ilan (varyant seçicili) olarak gönderilir.
  // Ayarlar: Ayarlar sayfası → Trendyol Ürün Açma. Sonuç asenkron: batchRequestId.
  pushCardToTrendyol: protectedProcedure
    .input(z.object({ parentId: z.number() }))
    .mutation(async ({ input }) => {
      const parent = await db.getProduct(input.parentId);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
      if (parent.parentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Türev seçildi — ürün kartı ana üründen açılır." });
      }
      const cfg = parseCardSettings(await db.getSettings());
      if (!cfg.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Trendyol ürün açma ayarları eksik: ${cfg.missing.join(" · ")} (Ayarlar sayfasından girin)`,
        });
      }
      const all = await db.listProducts();
      const variants = all.filter(p => p.parentId === parent.id);
      const refs = await db.listAllProductImageRefs();
      const imageKinds = new Map<number, string[]>();
      for (const r of refs) {
        imageKinds.set(r.productId, [...(imageKinds.get(r.productId) ?? []), r.kind]);
      }
      const { items, problems } = mapProductsToTrendyolItems(parent, variants, imageKinds, cfg.value);
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Gönderilebilir ürün yok — ${problems.join(" · ")}`,
        });
      }
      try {
        const result = await pushTrendyolProductCards(items);
        return { ...result, problems };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Trendyol ürün gönderimi başarısız",
        });
      }
    }),
  // Batch sonucu sorgulama: kalem bazında başarı/hata mesajları.
  trendyolCardBatchStatus: protectedProcedure
    .input(z.object({ batchRequestId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await getTrendyolProductBatchStatus(input.batchRequestId);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Batch sorgusu başarısız",
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
