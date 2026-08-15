// Ürün & Üretim: hammadde, ürün/türev, üretim, formül, seri — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
import { MAX_COAT_LAYERS, coatSystemOf } from "@shared/color/coatSystem";
import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "../_core/cookies";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";
import { systemRouter } from "../_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { generateSeriesBanner } from "../contentAi";
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
import { answerTrendyolQuestion, syncTrendyolOrders, pushTrendyolStockPrice, getTrendyolCommonLabelPdf, TrendyolLabelNotAllowedError, isTrendyolConfigured } from "../trendyol";
import { isHepsiburadaConfigured } from "../hepsiburada";
import { isN11Configured } from "../n11";
import { isCiceksepetiConfigured } from "../ciceksepeti";
import {
  fetchTrendyolCategoryAttributes,
  getTrendyolProductBatchStatus,
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
  /**
   * Kat sistemi — "bu seri hangi katmanlarla uygulanır".
   * Boş bırakılırsa seri adından varsayılan türetilir (coatSystem.ts).
   */
  coatSystem: z
    .array(z.object({ label: z.string().min(1).max(60), product: z.string().max(80).nullable().optional() }))
    .max(MAX_COAT_LAYERS)
    .nullable()
    .optional(),
  /** Banner sloganı ve maddeleri — AI serinin kendi metninden kısaltır. */
  bannerSlogan: z.string().max(160).nullable().optional(),
  bannerBullets: z.array(z.string().max(80)).max(3).nullable().optional(),
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
      // Kat sistemi kayıtlı değilse seri adından türetilen varsayılan döner:
      // ekran da kart da aynı zinciri görsün, "boş" diye farklı davranmasın.
      coatSystem: coatSystemOf({ name: s.name, coatSystem: (s as { coatSystem?: unknown }).coatSystem }),
      bannerSlogan: (s as { bannerSlogan?: string | null }).bannerSlogan ?? null,
      bannerBullets: asArray((s as { bannerBullets?: unknown }).bannerBullets) as string[],
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
  /**
   * Banner metnini ÖNERİR — yazmaz.
   *
   * Kullanıcı öneriyi görüp düzeltebilsin diye kaydetme ayrı adım: AI'ın
   * yazdığı bir cümle onay görmeden reklam karesine basılmamalı.
   */
  suggestBannerText: protectedProcedure
    .input(z.object({ seriesId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const all = await db.listProductSeries();
      const s = all.find(x => x.id === input.seriesId);
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Seri bulunamadı" });

      const chain = coatSystemOf({ name: s.name, coatSystem: (s as { coatSystem?: unknown }).coatSystem })
        .map(l => l.label)
        .join(" → ");
      const out = await generateSeriesBanner({
        seriesName: s.name,
        shortDescription: s.shortDescription,
        longDescription: s.longDescription,
        coatSystem: chain,
      });
      if (!out) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Serinin tanıtım metni boş — AI kısaltacak bir şey bulamadı. Önce serinin kısa/uzun açıklamasını doldurun.",
        });
      }
      return out;
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
