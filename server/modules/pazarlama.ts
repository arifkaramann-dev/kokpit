// Pazarlama & Büyüme: geliştirme, soru-cevap, şablon, kampanya, AI metin, mağaza, kupon — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
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
import { buildSaleTitle, deriveCombos, parseSetCount, planGenerationSync, renameVariantTitle } from "../productUtils";
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
import { answerHepsiburadaQuestion, pushHepsiburadaStockPrice } from "../hepsiburada";
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
import { DEFAULT_CHANNEL_PROFILES, deriveUnitLaborOverhead, normalizeChannelProfile } from "@shared/pricing";
import { ENV } from "../_core/env";
import { toDecimalFields } from "./util";

const devProjectInput = z.object({
  name: z.string().min(1),
  targetUse: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  colorCode: z.string().nullable().optional(),
  colorHex: z.string().nullable().optional(),
  applicationNotes: z.string().nullable().optional(),
  dryingTime: z.string().nullable().optional(),
  coats: z.string().nullable().optional(),
  testNotes: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  packaging: z.string().nullable().optional(),
  labelSize: z.string().nullable().optional(),
  labelText: z.string().nullable().optional(),
  usageGuide: z.string().nullable().optional(),
  safetyNotes: z.string().nullable().optional(),
  packagingCost: z.number().min(0).optional(),
  shippingCost: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  currentStep: z.number().min(1).max(5).optional(),
  status: z.enum(["active", "done", "archived"]).optional(),
  notes: z.string().nullable().optional(),
  // Ürün motoru v2: otomatik kod, seçilen yüzeyler ve ambalaj boyutları.
  autoCode: z.string().nullable().optional(),
  targetSurfaces: z.array(z.string()).nullable().optional(),
  packagingSelection: z.array(z.string()).nullable().optional(),
  // Seçilen renkler: {label, value, hex?} — varyantlar Renk × Ambalaj üretilir.
  colorSelection: z
    .array(z.object({ label: z.string(), value: z.string(), hex: z.string().nullable().optional() }))
    .nullable()
    .optional(),
});

const devTrialItemInput = z.object({
  materialId: z.number(),
  qty: z.number().positive(),
  note: z.string().nullable().optional(),
});


const campaignInput = z.object({
  name: z.string().min(1),
  productGroup: z.string().nullable().optional(),
  startDate: z.date(),
  endDate: z.date(),
  discountPercent: z.number().min(0).max(100).default(0),
  note: z.string().nullable().optional(),
  status: z.enum(["planned", "active", "done"]).default("planned"),
});

// ---------------------------------------------------------------------------
// Varyant içerik üretimi yardımcıları
// ---------------------------------------------------------------------------
// Bir alandaki değeri güvenle string dizisine çevirir (dizi veya JSON metni).
function parseStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Tek bir varyant için AI içeriğini üretir. Başarısızlıkta (JSON parse/erişim
// hatası) bir kez daha dener, yine olmazsa null döner. Böylece çağıran taraf
// şablon içeriğini koruyabilir.
type VariantAIOpts = {
  packaging: string;
  colorLabel: string;
  colorValue: string;
  colorHex: string | null;
  baseLabel: string;
  baseGuide: string;
};
async function generateVariantAIContent(
  project: Awaited<ReturnType<typeof db.getDevProject>>,
  seriesRec: Awaited<ReturnType<typeof db.getProductSeriesByName>> | null,
  surfaces: string[],
  opts: VariantAIOpts,
): Promise<Record<string, string> | null> {
  if (!project) return null;
  const { packaging, colorLabel, colorValue, colorHex, baseLabel, baseGuide } = opts;

  const systemPrompt = `Sen Art of Colour markasının e-ticaret içerik motorusun. Art of Colour Türkiye'de otomotiv rötuş boyaları, bukalemun efekt boyalar, airbrush, sedefli (Vivid), transparan (Candy) boyalar, vernik ve astar üretir. Türkçe, doğru sektörel terimlerle (bazkat, 1K/2K, örtücülük, opaklık, vernik) yaz. Abartılı/yanıltıcı iddia, sahte yorum veya uydurma istatistik ekleme. SADECE geçerli JSON döndür, başka metin yazma.`;

  const colorLine = colorLabel
    ? `Renk: ${colorLabel}${colorValue && colorValue !== colorLabel ? " (" + colorValue + ")" : ""}${colorHex ? " " + colorHex : ""}`
    : `Renk kodu: ${project.colorCode || "-"}`;

  const userPrompt = `Ürün: ${project.name}
Seri: ${project.series || "-"}
${colorLine}
Ambalaj/Hacim: ${packaging}
Hedef yüzeyler: ${surfaces.length ? surfaces.join(", ") : (project.targetUse || "-")}
Uygulama notu: ${project.applicationNotes || "-"}
Kuruma: ${project.dryingTime || "-"} | Kat: ${project.coats || "-"}
Test notları: ${project.testNotes || "-"}
Etiket şablonu (varsa taban al): ${baseLabel || "-"}
Kılavuz şablonu (varsa taban al): ${baseGuide || "-"}

Aşağıdaki JSON şemasına birebir uy (alanları Türkçe doldur, başlık ve açıklamada rengi belirt):
{
  "trendyolTitle": "en fazla 100 karakter, SEO uyumlu başlık",
  "trendyolDescription": "en fazla 2000 karakter, SEO uyumlu ürün açıklaması",
  "hepsiburadaTitle": "en fazla 80 karakter başlık",
  "hepsiburadaDescription": "en fazla 1500 karakter açıklama",
  "labelContent": "Etiket metni: Ürün adı, Seri, ${colorLabel ? "Renk (" + colorLabel + ")" : "Renk kodu"}, Hacim (${packaging}), İçindekiler, Uyarılar, Kısa kullanım talimatı, Üretici: [Üretici bilgisi]",
  "guideContent": "Adım adım kullanım kılavuzu",
  "applicationNotes": "Her hedef yüzey için ayrı paragraf${surfaces.length ? " (" + surfaces.join(", ") + ")" : ""}"
}`;

  // İki deneme: geçici hatalarda / bozuk JSON'da bir kez daha dene.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = response.choices[0]?.message?.content;
      const text = typeof raw === "string" ? raw : "";
      const parsed = extractJson(text);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        return parsed as Record<string, string>;
      }
    } catch {
      // sıradaki denemeye geç
    }
  }
  return null;
}

// AI erişilemese/başarısız olsa bile dolu kalması için şablon tabanlı içerik
// üretir. Böylece hiçbir varyant boş açıklama ile kalmaz.
function templateVariantContent(
  project: NonNullable<Awaited<ReturnType<typeof db.getDevProject>>>,
  surfaces: string[],
  opts: VariantAIOpts,
): Record<string, string> {
  const { packaging, colorLabel, baseLabel, baseGuide } = opts;
  const seriesPart = project.series ? ` ${project.series}` : "";
  const colorPart = colorLabel ? ` ${colorLabel}` : "";
  const title = `Art of Colour ${project.name}${seriesPart}${colorPart} ${packaging}`.replace(/\s+/g, " ").trim();
  const surfLine = surfaces.length ? surfaces.join(", ") : (project.targetUse || "çeşitli yüzeyler");
  const desc = [
    `${title} — Art of Colour kalitesiyle profesyonel sonuçlar için geliştirilmiştir.`,
    project.description || "",
    "",
    "ÖZELLİKLER",
    `- Renk: ${colorLabel || project.colorCode || "-"}`,
    project.series ? `- Seri: ${project.series}` : "",
    `- Ambalaj/Hacim: ${packaging}`,
    `- Uygun yüzeyler: ${surfLine}`,
    project.dryingTime ? `- Kuruma süresi: ${project.dryingTime}` : "",
    project.coats ? `- Önerilen kat sayısı: ${project.coats}` : "",
    project.applicationNotes ? `\nUYGULAMA\n${project.applicationNotes}` : "",
  ]
    .filter(l => l !== null && l !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const guide =
    baseGuide ||
    project.usageGuide ||
    `1) Uygulama yüzeyini temizleyin, yağ ve tozdan arındırın.
2) Ürünü uygulamadan önce iyice çalkalayın.
3) İnce ve düzgün katlar halinde uygulayın (${project.coats || "2-3"} kat önerilir).
4) Katlar arasında ${project.dryingTime || "yeterli kuruma süresi"} bekleyin.
5) Gerekirse son kat olarak vernik uygulayın.`;
  const labelText =
    baseLabel ||
    `${project.name}${project.series ? " · " + project.series : ""}${colorLabel ? " · " + colorLabel : ""} · ${packaging}
İçindekiler ve uyarılar için ürün etiketine bakınız.
Üretici: Art of Colour`;
  return {
    trendyolTitle: title,
    trendyolDescription: desc,
    hepsiburadaTitle: title,
    hepsiburadaDescription: desc,
    labelContent: labelText,
    guideContent: guide,
    applicationNotes: project.applicationNotes || `${surfLine} yüzeylerinde kullanıma uygundur.`,
  };
}

const clipStr = (s: string | undefined | null, max: number) => (s ? String(s).slice(0, max) : "");



export const devRouter = router({
  list: protectedProcedure.query(() => db.listDevProjects()),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const project = await db.getDevProject(input.id);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });
    const trials = await db.listDevTrials(input.id);
    return { project, trials };
  }),
  create: protectedProcedure.input(devProjectInput).mutation(({ input }) =>
    db.createDevProject(toDecimalFields(input, ["packagingCost", "shippingCost", "salePrice"]) as never),
  ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: devProjectInput.partial() }))
    .mutation(({ input }) =>
      db.updateDevProject(
        input.id,
        toDecimalFields(input.data, ["packagingCost", "shippingCost", "salePrice"]) as never,
      ),
    ),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteDevProject(input.id)),
  addTrial: protectedProcedure
    .input(z.object({ projectId: z.number(), notes: z.string().nullable().optional(), items: z.array(devTrialItemInput) }))
    .mutation(({ input }) => db.createDevTrial(input.projectId, { notes: input.notes ?? null }, input.items)),
  updateTrial: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        result: z.enum(["pending", "success", "partial", "fail"]).optional(),
        notes: z.string().nullable().optional(),
        items: z.array(devTrialItemInput).optional(),
      }),
    )
    .mutation(({ input }) =>
      db.updateDevTrial(input.id, { result: input.result, notes: input.notes }, input.items),
    ),
  deleteTrial: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteDevTrial(input.id)),
  chooseTrial: protectedProcedure
    .input(z.object({ projectId: z.number(), trialId: z.number() }))
    .mutation(({ input }) => db.chooseDevTrial(input.projectId, input.trialId)),
  // Adım 5: projeyi formülü ve fiyatıyla eksiksiz bir ürüne dönüştürür.
  convert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getDevProject(input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });
      if (project.productId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu proje zaten ürüne dönüştürülmüş" });
      }
      const chosenItems = await db.getChosenDevTrialItems(input.id);
      if (!chosenItems || chosenItems.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Önce 2. adımda başarılı bir reçeteyi 'Seçili Reçete' yapın.",
        });
      }
      const descriptionParts = [
        project.targetUse ? `Kullanım alanı: ${project.targetUse}` : null,
        project.applicationNotes ? `Uygulama: ${project.applicationNotes}` : null,
        project.dryingTime ? `Kuruma süresi: ${project.dryingTime}` : null,
        project.coats ? `Önerilen kat sayısı: ${project.coats}` : null,
        project.testNotes ? `Test notları: ${project.testNotes}` : null,
      ].filter(Boolean);
      // Seri şablonu varsa açıklamalar/kâr oranı otomatik dolar; projede fiyat
      // girilmediyse seçili reçete maliyetinden seri kârıyla fiyat önerilir.
      const seriesRec = project.series ? await db.getProductSeriesByName(project.series) : null;
      const projectPrice = parseFloat(String(project.salePrice)) || 0;
      let suggestedPrice = projectPrice;
      if (!projectPrice && seriesRec) {
        const materialCost = chosenItems.reduce(
          (sum, item) => sum + (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.unitCost ?? 0)) || 0),
          0,
        );
        suggestedPrice = computePrice({
          materialCost,
          packagingCost: parseFloat(String(project.packagingCost)) || 0,
          shippingCost: parseFloat(String(project.shippingCost)) || 0,
          profitMargin: parseFloat(String(seriesRec.profitMargin)) || 35,
          vatRate: parseFloat(String(seriesRec.vatRate)) || 20,
        }).salePrice;
      }
      const productId = await db.createProduct({
        name: project.name,
        series: project.series,
        colorCode: project.colorCode,
        colorHex: project.colorHex,
        surfaceType: project.targetUse,
        // Projede açıklama yazıldıysa onu kullan; yoksa test notlarından derle.
        description: project.description || descriptionParts.join("\n") || null,
        packaging: project.packaging,
        labelSize: project.labelSize,
        labelText: project.labelText,
        usageGuide: project.usageGuide,
        safetyNotes: project.safetyNotes,
        salePrice: String(suggestedPrice),
        packagingCost: project.packagingCost,
        shippingCost: project.shippingCost,
        sku: suggestSku(project.name, project.packaging),
        category: seriesRec?.category ?? null,
        profitMargin: seriesRec?.profitMargin ?? null,
        vatRate: seriesRec?.vatRate ?? null,
        shortDescription: seriesRec?.shortDescription ?? null,
        longDescription: seriesRec?.longDescription ?? null,
        applicationText: seriesRec?.applicationText ?? null,
      } as never);
      for (const item of chosenItems) {
        await db.addFormulaItem(Number(productId), item.materialId, parseFloat(item.qty), item.note ?? undefined);
      }
      await db.updateDevProject(input.id, {
        status: "done",
        currentStep: 5,
        productId: Number(productId),
      });
      return { productId: Number(productId) };
    }),

  /* ---------------- Ürün motoru v2: Ürünleştirme çıktıları ---------------- */

  // Bir projenin üretilmiş varyant çıktılarını (productGenerations) listeler.
  generations: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => db.listProductGenerations(input.projectId)),

  // Tek bir varyant çıktısını düzenleyip kaydeder (kullanıcı AI metnini elle düzeltir).
  updateGeneration: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          trendyolTitle: z.string().nullable().optional(),
          trendyolDescription: z.string().nullable().optional(),
          hepsiburadaTitle: z.string().nullable().optional(),
          hepsiburadaDescription: z.string().nullable().optional(),
          labelContent: z.string().nullable().optional(),
          guideContent: z.string().nullable().optional(),
          applicationNotes: z.string().nullable().optional(),
          suggestedPrice: z.number().min(0).optional(),
          status: z.enum(["generating", "ready", "listed", "error"]).optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      db.updateProductGeneration(input.id, toDecimalFields(input.data, ["suggestedPrice"]) as never),
    ),

  deleteGeneration: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.deleteProductGeneration(input.id)),

  // AI görsel üretimi: bir varyant için before/after, ambalaj ve pazarlama görseli üretir.
  // Ürün Çıktıları ekranından tetiklenir, S3'e yüklenir, URL'ler generation kaydına yazılır.
  generateVariantImages: protectedProcedure
    .input(z.object({ generationId: z.number() }))
    .mutation(async ({ input }) => {
      const gen = await db.getProductGeneration(input.generationId);
      if (!gen) throw new TRPCError({ code: "NOT_FOUND", message: "Varyant bulunamadı" });
      const project = await db.getDevProject(gen.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });

      // Temel ürün bilgisi prompt'a gömülür.
      const baseName = project.name || "boya";
      const colorDesc = gen.color ? `${gen.color} renk` : "renk";
      const packagingDesc = gen.packaging || "ambalaj";
      const seriesInfo = project.series ? `, ${project.series} serisi` : "";
      const useInfo = project.targetUse ? `, ${project.targetUse}` : "";

      // 1) Before/After: çizikli/soluk yüzey → o renge boyanmış temiz yüzey.
      const beforeAfterPrompt = `Before/after karşılaştırma görseli: Sol tarafta eski soluk/çizikli yüzey, sağ tarafta ${colorDesc}${gen.colorHex ? ` (${gen.colorHex})` : ""} ile boyanmış parlak temiz yüzey. ${baseName}${seriesInfo}${useInfo}. Profesyonel diptik görsel, temiz stüdyo ışıklandırma, gerçekçi doku.`;

      // 2) Ambalaj: o renk etiketli ürün şişesi/kutusu.
      const packagingPrompt = `Profesyonel e-ticaret ürün fotoğrafı: ${baseName} ${colorDesc}${gen.colorHex ? ` (${gen.colorHex} ton)` : ""}, ${packagingDesc} ambalajında${seriesInfo}${useInfo}. Temiz beyaz stüdyo arka planı, yumuşak gölgeler, yüksek çözünürlük, gerçekçi. Türk oto rötuş/hobi boya markası Art of Colour ürünü.`;

      // 3) Pazarlama: sosyal medya kartı, üzerinde başlık/slogan, o renk vurgusu.
      const marketingPrompt = `Sosyal medya pazarlama görseli (Instagram/Facebook post): ${baseName} ${colorDesc}${gen.colorHex ? ` (${gen.colorHex} renk tonu)` : ""}, ${packagingDesc}${seriesInfo}. Dikkat çekici düzen, modern tipografi, marka adı "Art of Colour", slogan "Renklerle Yaşam Veriyoruz", profesyonel grafik tasarım, renk harmonisi. 1080x1080 kare format.`;

      const [beforeAfter, packaging, marketing] = await Promise.all([
        generateImage({ prompt: beforeAfterPrompt }),
        generateImage({ prompt: packagingPrompt }),
        generateImage({ prompt: marketingPrompt }),
      ]);

      await db.updateProductGeneration(input.generationId, {
        beforeAfterImageUrl: beforeAfter.url ?? null,
        packagingImageUrl: packaging.url ?? null,
        marketingImageUrl: marketing.url ?? null,
      } as never);

      return {
        beforeAfterImageUrl: beforeAfter.url,
        packagingImageUrl: packaging.url,
        marketingImageUrl: marketing.url,
      };
    }),

  // Varyant çıktılarını (productGenerations) ana Ürünler tablosuna aktarır:
  // TEK bir ana (parent) ürün + her varyant için o ana ürünün altında türev (child) ürün.
  // Böylece varyantlar ayrı ayrı ürün değil, tek ürünün varyantları olarak listelenir.
  // Zaten aktarılmış varyantlar (productId dolu) atlanır — mükerrer kayıt olmaz.
  publishToProducts: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getDevProject(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });

      const gens = await db.listProductGenerations(input.projectId);
      if (!gens.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aktarılacak varyant yok. Önce varyantları oluşturun." });
      }

      const chosenItems = (await db.getChosenDevTrialItems(input.projectId)) ?? [];
      const seriesRec = project.series ? await db.getProductSeriesByName(project.series) : null;

      // 1) Ana (parent) ürünü bul ya da oluştur. Proje daha önce ürüne dönüştürüldüyse
      //    (project.productId) ve o ürün bir ana ürünse onu kullan; yoksa yeni ana ürün aç.
      let parentId: number | null = null;
      if (project.productId) {
        const existing = await db.getProduct(project.productId);
        if (existing && !existing.parentId) parentId = existing.id;
      }
      if (!parentId) {
        const descriptionParts = [
          project.targetUse ? `Kullanım alanı: ${project.targetUse}` : null,
          project.applicationNotes ? `Uygulama: ${project.applicationNotes}` : null,
          project.dryingTime ? `Kuruma süresi: ${project.dryingTime}` : null,
          project.coats ? `Önerilen kat sayısı: ${project.coats}` : null,
        ].filter(Boolean);
        const newParentId = await db.createProduct({
          name: project.name,
          series: project.series,
          colorCode: project.colorCode,
          colorHex: project.colorHex,
          surfaceType: project.targetUse,
          description: project.description || descriptionParts.join("\n") || null,
          status: "taslak",
          salePrice: String(parseFloat(String(project.salePrice)) || 0),
          packagingCost: project.packagingCost,
          shippingCost: project.shippingCost,
          sku: suggestSku(project.name, "ANA"),
          category: seriesRec?.category ?? null,
          profitMargin: seriesRec?.profitMargin ?? null,
          vatRate: seriesRec?.vatRate ?? null,
          shortDescription: seriesRec?.shortDescription ?? null,
          longDescription: seriesRec?.longDescription ?? null,
          applicationText: seriesRec?.applicationText ?? null,
        } as never);
        parentId = Number(newParentId);
        // Ana ürünün reçetesi de seçili denemeden kopyalanır.
        for (const item of chosenItems) {
          await db.addFormulaItem(parentId, item.materialId, parseFloat(item.qty), item.note ?? undefined);
        }
        await db.updateDevProject(input.projectId, { productId: parentId });
      }

      // Mevcut SKU'larla çakışmayı önlemek için tekil SKU üretici.
      const existingSkus = new Set(
        (await db.listProducts()).map(p => p.sku?.trim()).filter((s): s is string => !!s),
      );
      const uniqueSku = (base: string) => {
        let candidate = base;
        for (let i = 2; existingSkus.has(candidate); i++) candidate = `${base}-${i}`;
        existingSkus.add(candidate);
        return candidate;
      };

      const parent = await db.getProduct(parentId);
      // Emniyet ağı: generation kaydı (eski sürümde silinip yeniden açıldığı
      // için) productId bağını kaybetmiş olabilir. Bu ana ürünün altındaki
      // türevleri SKU'ya göre de eşleştir ki aynı varyant ikinci kez ürün
      // olarak açılmasın.
      const siblingBySku = new Map<string, number>();
      for (const p of await db.listProducts()) {
        if (p.parentId === parentId && p.sku?.trim()) siblingBySku.set(p.sku.trim(), p.id);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;

      // 2) Her varyant çıktısı için türev (child) ürün oluştur ya da güncelle.
      for (const g of gens) {
        // AI metinlerini ürün alanlarına eşle.
        const images = [g.packagingImageUrl, g.beforeAfterImageUrl, g.marketingImageUrl].filter(Boolean) as string[];
        const variantData = {
          parentId,
          name: buildSaleTitle(project.name, null, g.packaging, g.color ?? null, null),
          series: project.series,
          colorCode: g.color ?? project.colorCode,
          colorHex: g.colorHex ?? project.colorHex,
          surfaceType: project.targetUse,
          packaging: g.packaging,
          description: g.trendyolDescription || parent?.description || null,
          shortDescription: g.trendyolTitle || seriesRec?.shortDescription || null,
          longDescription: g.hepsiburadaDescription || seriesRec?.longDescription || null,
          applicationText: g.applicationNotes || seriesRec?.applicationText || null,
          labelText: g.labelContent ?? null,
          usageGuide: g.guideContent ?? null,
          salePrice: String(parseFloat(String(g.suggestedPrice)) || parseFloat(String(project.salePrice)) || 0),
          packagingCost: project.packagingCost,
          shippingCost: project.shippingCost,
          category: seriesRec?.category ?? null,
          profitMargin: seriesRec?.profitMargin ?? null,
          vatRate: seriesRec?.vatRate ?? null,
          imageUrls: images.length ? JSON.stringify(images) : null,
          mockupUrl: g.packagingImageUrl ?? null,
        };

        // Bağlı ürün varsa onu, yoksa aynı SKU'lu mevcut türevi güncelle.
        const linkedId =
          g.productId ??
          siblingBySku.get(g.variantCode || suggestSku(project.name, g.packaging)) ??
          null;
        if (linkedId) {
          const existingVariant = await db.getProduct(linkedId);
          if (existingVariant) {
            await db.updateProduct(linkedId, variantData as never);
            // Kopan bağ yeniden kurulur ki sonraki aktarımlar da güncelleme olsun.
            if (g.productId !== linkedId) {
              await db.updateProductGeneration(g.id, { productId: linkedId, status: "listed" } as never);
            }
            updated++;
            continue;
          }
          // Ürün silinmişse yeniden oluştur (aşağı düşer).
        }

        const variantId = await db.createProduct({
          ...variantData,
          sku: uniqueSku(g.variantCode || suggestSku(project.name, g.packaging)),
        } as never);
        // Reçeteyi türev ürüne kopyala (maliyet analizi boş kalmasın).
        for (const item of chosenItems) {
          await db.addFormulaItem(Number(variantId), item.materialId, parseFloat(item.qty), item.note ?? undefined);
        }
        await db.updateProductGeneration(g.id, { productId: Number(variantId), status: "listed" } as never);
        created++;
      }

      // Proje artık ürünleşti: liste kartı ve pano "Adım 5/5"te takılı kalmasın.
      // (Eski `convert` ucu arayüzden çağrılmadığı için status hep "active"
      // kalıyor, proje bitmiş görünmüyordu.)
      if (project.status !== "done") {
        await db.updateDevProject(input.projectId, { status: "done", currentStep: 5 });
      }

      return { parentId, created, updated, skipped, total: gens.length };
    }),

  // Adım 5 "Ürünleştir" ana aksiyonu: her seçili ambalaj için bir varyant kaydı
  // açar ve AI ile pazaryeri metinleri, etiket içeriği, kullanım kılavuzu ve
  // uygulama notlarını tek onayla üretir. Şablon (seri) + AI birlikte kullanılır.
  generateProductContent: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        // İstemci Adım 1'de seçmediyse burada da ambalaj listesi geçebilir.
        packaging: z.array(z.string()).optional(),
        // Aynı şekilde renk listesi de burada geçilebilir (aksi halde projeden okunur).
        colors: z
          .array(z.object({ label: z.string(), value: z.string(), hex: z.string().nullable().optional() }))
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const project = await db.getDevProject(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });

      // 1) Seçili reçete kontrolü.
      const chosenItems = await db.getChosenDevTrialItems(input.projectId);
      if (!chosenItems || chosenItems.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Önce 2. adımda bir reçeteyi ⭐ ile 'Seçili Reçete' yapın.",
        });
      }

      // 2) Ambalaj seçimi kontrolü (Adım 1'de seçilmiş olmalı).
      const parseArr = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === "string" && v.trim()) {
          try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p.map(String) : [];
          } catch {
            return [];
          }
        }
        return [];
      };
      const packagingList = input.packaging?.length ? input.packaging : parseArr(project.packagingSelection);
      if (packagingList.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Önce 1. adımda en az bir ambalaj boyutu seçin.",
        });
      }

      const surfaces = parseArr(project.targetSurfaces);
      const seriesRec = project.series ? await db.getProductSeriesByName(project.series) : null;

      // Renk listesi: istemciden gelen > projedeki colorSelection. Boşsa tek bir
      // "renksiz" varyant üretilir (eski davranışla uyumlu). {label,value,hex}.
      type ColorOpt = { label: string; value: string; hex?: string | null };
      const parseColors = (v: unknown): ColorOpt[] => {
        let arr: unknown[] = [];
        if (Array.isArray(v)) arr = v;
        else if (typeof v === "string" && v.trim()) {
          try {
            const p = JSON.parse(v);
            if (Array.isArray(p)) arr = p;
          } catch {
            arr = [];
          }
        }
        return arr
          .map(x => {
            if (x && typeof x === "object") {
              const o = x as Record<string, unknown>;
              const value = String(o.value ?? o.label ?? "").trim();
              if (!value) return null;
              return {
                label: String(o.label ?? o.value ?? "").trim() || value,
                value,
                hex: o.hex != null ? String(o.hex) : null,
              } as ColorOpt;
            }
            const s = String(x).trim();
            return s ? ({ label: s, value: s, hex: null } as ColorOpt) : null;
          })
          .filter((x): x is ColorOpt => !!x);
      };
      const colorList = input.colors?.length ? input.colors : parseColors(project.colorSelection);
      // Renk seçilmemişse projedeki tek renk (varsa) ya da renksiz tek varyant.
      const effectiveColors: (ColorOpt | null)[] = colorList.length
        ? colorList
        : project.colorCode || project.colorHex
          ? [{ label: project.colorCode || "Renk", value: project.colorCode || "", hex: project.colorHex }]
          : [null];

      // Maliyet: seçili reçete hammadde maliyeti + ambalaj maliyeti.
      const materialCost = chosenItems.reduce(
        (sum, item) =>
          sum + (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.unitCost ?? 0)) || 0),
        0,
      );
      const packagingCost = parseFloat(String(project.packagingCost)) || 0;
      const costPrice = +(materialCost + packagingCost).toFixed(2);
      const profitMargin = seriesRec ? parseFloat(String(seriesRec.profitMargin)) || 35 : 35;
      const vatRate = seriesRec ? parseFloat(String(seriesRec.vatRate)) || 20 : 20;
      const projectPrice = parseFloat(String(project.salePrice)) || 0;

      // Şablon değişkenlerini doldurur: {{renk}}, {{seri}}, {{ambalaj}}.
      // Renk, o an işlenen varyantın rengidir (yoksa projedeki tek renk/ad).
      const fillTemplate = (tpl: string | null | undefined, packaging: string, colorLabel: string) =>
        (tpl ?? "")
          .replaceAll("{{renk}}", colorLabel || project.colorCode || project.name)
          .replaceAll("{{seri}}", project.series || "")
          .replaceAll("{{ambalaj}}", packaging);

      // Kod dostu bir renk parçası üretir (boşlukları -, büyük harf).
      const codeSlug = (s: string) =>
        s
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "-")
          .replace(/[^A-Z0-9-]/g, "");

      const autoCode = project.autoCode || project.colorCode || "";
      const created: number[] = [];
      const updated: number[] = [];

      // Yeniden üretimde varyant kayıtları SİLİNMEZ, varyant koduna göre
      // güncellenir. Silip yeniden açmak mükerrerliği önlüyordu ama ürünlere
      // aktarılmış varyantın productId bağını ve üretilmiş görsellerini de
      // siliyordu; bağ kopunca "Ürünlere Aktar" aynı türevleri ikinci kez
      // oluşturuyordu (SKU'su -2'li kopyalar). Artık yalnızca matriste artık
      // yeri olmayan (bayat) kayıtlar silinir.
      const existingGens = await db.listProductGenerations(input.projectId);
      const wantedCodes: string[] = [];
      for (const color of effectiveColors) {
        const seg = codeSlug(color?.value || color?.label || "");
        for (const packaging of packagingList) {
          wantedCodes.push([autoCode || project.name, seg || null, packaging].filter(Boolean).join("-"));
        }
      }
      const { reuse, staleIds } = planGenerationSync(existingGens, wantedCodes);
      for (const staleId of staleIds) await db.deleteProductGeneration(staleId);

      // Renk × Ambalaj matrisi: her renk için her ambalaj bir varyant.
      for (const color of effectiveColors) {
        const colorLabel = color?.label ?? "";
        const colorValue = color?.value ?? "";
        const colorHex = color?.hex ?? null;
        const colorSeg = codeSlug(colorValue || colorLabel);

        for (const packaging of packagingList) {
          // Varyant kodu: autoCode-RENK-ambalaj (renk yoksa autoCode-ambalaj).
          const base = autoCode || project.name;
          const variantCode = [base, colorSeg || null, packaging].filter(Boolean).join("-");

          // Bu varyant için önerilen fiyat: projede fiyat girildiyse onu baz al,
          // yoksa maliyet + seri kârı ile hesapla.
          const suggestedPrice = projectPrice
            ? projectPrice
            : computePrice({ materialCost, packagingCost, shippingCost: 0, profitMargin, vatRate }).salePrice;

          // Şablon tabanlı taban içerik (kılavuz/etiket şablonları).
          const baseGuide =
            fillTemplate(seriesRec?.guideTemplate, packaging, colorLabel) ||
            project.usageGuide ||
            "";
          const baseLabel =
            fillTemplate(seriesRec?.labelTemplate, packaging, colorLabel) ||
            project.labelText ||
            "";

          // İçerik SERİDEN devralınır (Plan A). Kısa/uzun açıklama, uygulama ve
          // SSS seri bazlıdır; varyantta yalnızca renk/gramaj değişir. Böylece
          // varyant başına AI çağrısı YOK — 85 varyant bile anında hazır olur ve
          // gateway timeout ("unexpected token") tamamen ortadan kalkar.
          // Seride içerik yoksa şablon tabanlı içeriğe düşer (dolu kalsın).
          const seriesLong = fillTemplate(seriesRec?.longDescription, packaging, colorLabel).trim();
          const seriesApp = fillTemplate(seriesRec?.applicationText, packaging, colorLabel).trim();

          const tpl = templateVariantContent(project, surfaces, {
            packaging,
            colorLabel,
            colorValue,
            colorHex,
            baseLabel,
            baseGuide,
          });

          // Başlık: her varyantta renk+gramaj değişir (SEO). Açıklama: seriden
          // gelen uzun açıklama + uygulama metni (yoksa şablon açıklaması).
          const title = tpl.trendyolTitle;
          const longBody = [seriesLong, seriesApp].filter(Boolean).join("\n\n");
          const description = longBody || tpl.trendyolDescription;
          const appNotes = seriesApp || tpl.applicationNotes || null;

          const content = {
            packaging,
            color: colorLabel || null,
            colorHex: colorHex || null,
            // İçerik seriden hazır geldiği için varyant doğrudan "ready".
            status: "ready" as const,
            trendyolTitle: clipStr(title, 100),
            trendyolDescription: clipStr(description, 2000),
            hepsiburadaTitle: clipStr(title, 80),
            hepsiburadaDescription: clipStr(description, 1500),
            labelContent: tpl.labelContent || null,
            guideContent: tpl.guideContent || null,
            applicationNotes: appNotes,
            suggestedPrice: String(suggestedPrice),
            costPrice: String(costPrice),
          };

          // Var olan varyant: içeriği tazelenir, productId ve görselleri korunur.
          const existing = reuse.get(variantCode);
          if (existing) {
            await db.updateProductGeneration(existing.id, content as never);
            updated.push(existing.id);
            continue;
          }
          const genId = await db.createProductGeneration({
            projectId: input.projectId,
            variantCode,
            ...content,
          } as never);
          created.push(genId);
        }
      }

      return {
        created,
        updated,
        removed: staleIds.length,
        count: created.length + updated.length,
      };
    }),

  // Tek bir varyantın AI içeriğini üretir/yeniler. Ürün Çıktıları ekranı, yeni
  // üretilen varyantları (status "generating") tek tek bu uçla zenginleştirir;
  // her çağrı ayrı bir HTTP isteği olduğundan timeout ve toplu hata riski olmaz.
  // Başarısızlıkta şablon içeriği korunur, status "error" olur (yeniden denenebilir).
  enrichVariant: protectedProcedure
    .input(z.object({ generationId: z.number() }))
    .mutation(async ({ input }) => {
      const gen = await db.getProductGeneration(input.generationId);
      if (!gen) throw new TRPCError({ code: "NOT_FOUND", message: "Varyant bulunamadı" });
      const project = await db.getDevProject(gen.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Proje bulunamadı" });

      const surfaces = parseStrArray(project.targetSurfaces);
      const seriesRec = project.series ? await db.getProductSeriesByName(project.series) : null;

      const ai = await generateVariantAIContent(project, seriesRec, surfaces, {
        packaging: gen.packaging,
        colorLabel: gen.color ?? "",
        colorValue: gen.color ?? "",
        colorHex: gen.colorHex ?? null,
        baseLabel: gen.labelContent ?? "",
        baseGuide: gen.guideContent ?? "",
      });

      if (!ai) {
        // AI başarısız: mevcut (şablon) içeriği koru, hatayı işaretle.
        await db.updateProductGeneration(input.generationId, { status: "error" } as never);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI içerik üretilemedi. 'AI ile Yenile' ile tekrar deneyebilirsiniz.",
        });
      }

      // Yalnızca AI'nin doldurduğu alanları güncelle; boş dönenlerde mevcut
      // (şablon) içerik korunur.
      const patch: Record<string, unknown> = { status: "ready" };
      if (ai.trendyolTitle) patch.trendyolTitle = clipStr(ai.trendyolTitle, 100);
      if (ai.trendyolDescription) patch.trendyolDescription = clipStr(ai.trendyolDescription, 2000);
      if (ai.hepsiburadaTitle) patch.hepsiburadaTitle = clipStr(ai.hepsiburadaTitle, 80);
      if (ai.hepsiburadaDescription) patch.hepsiburadaDescription = clipStr(ai.hepsiburadaDescription, 1500);
      if (ai.labelContent) patch.labelContent = ai.labelContent;
      if (ai.guideContent) patch.guideContent = ai.guideContent;
      if (ai.applicationNotes) patch.applicationNotes = ai.applicationNotes;

      await db.updateProductGeneration(input.generationId, patch as never);
      return { ok: true, generationId: input.generationId };
    }),
});


// Pazaryeri/müşteri soru-cevap kuyruğu (Helpdesk). Soru çekme canlıda pazaryeri
// API'siyle beslenir; burada kuyruk + AI cevap taslağı + yanıtlama akışı.
export const questionsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.enum(["new", "answered", "dismissed"]).optional() }).optional())
    .query(({ input }) => db.listMarketplaceQuestions(input?.status)),
  newCount: protectedProcedure.query(() => db.countNewMarketplaceQuestions()),
  // Elle soru ekleme (pazaryerinden kopyala-yapıştır ya da WhatsApp/e-posta).
  create: protectedProcedure
    .input(
      z.object({
        source: z.enum(["trendyol", "hepsiburada", "n11", "ciceksepeti", "whatsapp", "email", "elle"]).default("elle"),
        customerName: z.string().nullable().optional(),
        questionText: z.string().min(1),
        productId: z.number().nullable().optional(),
        productName: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => db.createMarketplaceQuestion(input as never)),
  // Oto-çekme + oto-cevap: pazaryerinden cevap bekleyen soruları çeker, kuyruğa
  // ekler; oto-cevap açıksa AI güvenilir cevapları otomatik gönderir.
  syncNow: protectedProcedure.mutation(() => syncMarketplaceQuestions()),
  // Oto-cevap ayarı (aç/kapa) — açıkken güvenilir AI cevapları otomatik gönderilir.
  autoAnswer: protectedProcedure.query(() => getAutoAnswerEnabled()),
  setAutoAnswer: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await setAutoAnswerEnabled(input.enabled);
      return { enabled: input.enabled };
    }),
  // AI cevap taslağı: ürün kılavuzu/açıklaması + soru → nazik, bilgilendirici yanıt.
  generateDraft: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const q = await db.getMarketplaceQuestion(input.id);
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Soru bulunamadı" });
      const { answer } = await generateQuestionAnswer({
        questionText: q.questionText,
        productId: q.productId,
        productName: q.productName,
      });
      await db.updateMarketplaceQuestion(input.id, { answerDraft: answer });
      return { draft: answer };
    }),
  // Yanıtla: taslağı (veya düzenlenmiş metni) kalıcı cevap olarak işaretle.
  // Soru bir pazaryerinden geldiyse (source+externalId), cevabı o pazaryerine
  // de gönderir; böylece elle onaylanan cevap da müşteriye ulaşır.
  answer: protectedProcedure
    .input(z.object({ id: z.number(), answerText: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const q = await db.getMarketplaceQuestion(input.id);
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Soru bulunamadı" });
      if (q.source === "trendyol" && q.externalId) {
        try {
          await answerTrendyolQuestion(q.externalId, input.answerText);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Trendyol'a gönderilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
          });
        }
      } else if (q.source === "hepsiburada" && q.externalId) {
        try {
          await answerHepsiburadaQuestion(q.externalId, input.answerText);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Hepsiburada'ya gönderilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
          });
        }
      }
      await db.updateMarketplaceQuestion(input.id, {
        answerText: input.answerText,
        status: "answered",
        answeredAt: new Date(),
      } as never);
      return { ok: true };
    }),
  dismiss: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.updateMarketplaceQuestion(input.id, { status: "dismissed" })),
});


export const templatesRouter = router({
  list: protectedProcedure.query(() => db.listTemplates()),
  create: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["etiket_boyutu", "etiket_yazisi", "kilavuz", "guvenlik", "ambalaj", "renk", "set_paket", "hammadde_kategori", "uygulama_yontemi", "kuruma_suresi", "kat_sayisi", "test_sonucu", "ozellik", "urun_turu", "zemin", "kategori"]),
        name: z.string().min(1),
        content: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      db.createTemplate({ kind: input.kind, name: input.name, content: input.content ?? null }),
    ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1), content: z.string().nullable().optional() }))
    .mutation(({ input }) => db.updateTemplate(input.id, { name: input.name, content: input.content ?? null })),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTemplate(input.id)),
});


export const campaignsRouter = router({
  list: protectedProcedure.query(() => db.listCampaigns()),
  upcoming: protectedProcedure.query(() => db.upcomingCampaigns(30)),
  create: protectedProcedure.input(campaignInput).mutation(({ input }) =>
    db.createCampaign(toDecimalFields(input, ["discountPercent"]) as never),
  ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: campaignInput.partial() }))
    .mutation(({ input }) => db.updateCampaign(input.id, toDecimalFields(input.data, ["discountPercent"]) as never)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCampaign(input.id)),
});


export const marketingRouter = router({
  history: protectedProcedure.query(() => db.listMarketingTexts()),
  // Elle yazılan metinleri de aynı arşive kaydeder (AI zorunlu değil).
  saveManual: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(["urun_aciklamasi", "instagram_post", "reklam_metni"]),
        productName: z.string().nullable().optional(),
        content: z.string().min(1),
      }),
    )
    .mutation(({ input }) =>
      db.saveMarketingText({
        contentType: input.contentType,
        productName: input.productName ?? null,
        prompt: null,
        content: input.content,
      }),
    ),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteMarketingText(input.id)),
  generate: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(["urun_aciklamasi", "instagram_post", "reklam_metni"]),
        productName: z.string().min(1),
        productDetails: z.string().optional(),
        tone: z.enum(["profesyonel", "samimi", "enerjik"]).default("profesyonel"),
        extraInstructions: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const typeLabels: Record<string, string> = {
        urun_aciklamasi: "SEO uyumlu e-ticaret ürün açıklaması (başlık + paragraflar + özellik listesi)",
        instagram_post: "Instagram gönderi metni (dikkat çekici açılış, emoji kullanımı serbest, hashtag önerileriyle)",
        reklam_metni: "kısa ve dönüşüm odaklı reklam metni (Google/Meta reklamları için 2-3 varyasyon)",
      };

      const systemPrompt = `Sen Art of Colour markasının pazarlama metni yazarısın. Art of Colour, Türkiye'de otomotiv rötuş boyaları, bukalemun/renk değiştiren efekt boyalar (Meteor serisi), airbrush boyaları, sedefli boyalar (Vivid), transparan boyalar (Candy), vernikler (Gloss), astarlar (Primer), RAL kodlu boyalar ve 3D baskı astarları üreten butik bir boya markasıdır. Hedef kitle: oto boyacıları, airbrush sanatçıları, hobi kullanıcıları, balık yemi (rapala) boyayanlar, 3D baskı meraklıları ve modifiye tutkunları.

Görevin: ${typeLabels[input.contentType]} yazmak.
Ton: ${input.tone}.
Türkçe yaz. Sektörel terimleri doğru kullan (bazkat, 1K/2K, astar, vernik, opaklık, örtücülük vb.). Abartılı ve yanıltıcı iddialardan kaçın. Asla sahte müşteri yorumu veya uydurma istatistik ekleme.`;

      const userPrompt = `Ürün: ${input.productName}${input.productDetails ? `\nÜrün detayları: ${input.productDetails}` : ""}${input.extraInstructions ? `\nEk yönergeler: ${input.extraInstructions}` : ""}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : "";
      if (!content) throw new Error("AI metin üretemedi, lütfen tekrar deneyin.");

      const id = await db.saveMarketingText({
        contentType: input.contentType,
        productName: input.productName,
        prompt: userPrompt,
        content,
      });

      return { id, content };
    }),
});


// Kendi web mağazası (Tema B) — HERKESE AÇIK uçlar (giriş gerektirmez).
export const storefrontRouter = router({
  // Vitrin: satışta ve fiyatı olan ürünler (yalnızca gerekli alanlar dışa açılır).
  /**
   * Vitrin listesi — ana ürün altında GRUPLANMIŞ.
   *
   * İki hata birden düzeltildi:
   *  1) Filtre yalnız "arsiv"i eliyordu, yani TASLAK ürünler herkese açık
   *     vitrinde görünüyordu. Artık sadece "satista" olanlar dışa açılır.
   *  2) Ana ürün ve türevleri aynı düzlemde dönüyordu; parentId dışa hiç
   *     açılmadığı için vitrin gruplayamıyor, her türev ayrı kart oluyordu.
   *     Artık grup döner: kart ana üründür, ambalaj/renk seçimi türevlerdir.
   *
   * Türevi olan ana ürün kendisi satılmaz (kavramsal kayıttır); türevi
   * olmayan ana ürün tek seçenekli grup olarak doğrudan satılır.
   */
  products: publicProcedure.query(async () => {
    const products = await db.listProducts();
    const sellable = products.filter(
      p => p.status === "satista" && parseFloat(String(p.salePrice)) > 0,
    );
    const view = (p: (typeof products)[number]) => ({
      id: p.id,
      name: p.name,
      packaging: p.packaging,
      colorCode: p.colorCode,
      colorHex: p.colorHex,
      salePrice: parseFloat(String(p.salePrice)) || 0,
      discountPercent: parseFloat(String(p.discountPercent)) || 0,
      inStock: (p.stockQty ?? 0) > 0,
    });
    const net = (v: { salePrice: number; discountPercent: number }) =>
      v.salePrice * (1 - v.discountPercent / 100);

    const childrenOf = new Map<number, typeof sellable>();
    for (const p of sellable) {
      if (p.parentId == null) continue;
      childrenOf.set(p.parentId, [...(childrenOf.get(p.parentId) ?? []), p]);
    }

    // Ana ürünü satışta olmayan ama türevi satışta olan gruplar da görünmeli;
    // başlık/görsel için ana ürün kaydı katalogdan okunur.
    const byId = new Map(products.map(p => [p.id, p]));
    const groupIds = new Set<number>([
      ...sellable.filter(p => p.parentId == null).map(p => p.id),
      ...Array.from(childrenOf.keys()),
    ]);

    const groups = [];
    for (const id of Array.from(groupIds)) {
      const head = byId.get(id);
      if (!head || head.status === "arsiv") continue;
      const variants = (childrenOf.get(id) ?? []).map(view);
      // Türevi yoksa ana ürünün kendisi tek seçenektir.
      const options =
        variants.length > 0
          ? variants
          : head.status === "satista" && parseFloat(String(head.salePrice)) > 0
            ? [view(head)]
            : [];
      if (options.length === 0) continue;

      const prices = options.map(net);
      groups.push({
        id: head.id,
        name: head.name,
        series: head.series,
        shortDescription: head.shortDescription,
        // Görsel ana üründen, yoksa ilk seçenekten.
        imageUrls: head.imageUrls ?? byId.get(options[0].id)?.imageUrls ?? null,
        mockupUrl: head.mockupUrl ?? byId.get(options[0].id)?.mockupUrl ?? null,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        inStock: options.some(o => o.inStock),
        options,
      });
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }),
  product: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const p = await db.getProduct(input.id);
    // Taslak ürün de vitrine açılmamalı — kart hazırlanırken müşteriye görünüyordu.
    if (!p || p.status !== "satista") throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
    return {
      id: p.id,
      name: p.name,
      series: p.series,
      salePrice: parseFloat(String(p.salePrice)) || 0,
      discountPercent: parseFloat(String(p.discountPercent)) || 0,
      shortDescription: p.shortDescription,
      description: p.description,
      usageGuide: p.usageGuide,
      imageUrls: p.imageUrls,
      mockupUrl: p.mockupUrl,
      inStock: (p.stockQty ?? 0) > 0,
    };
  }),
  // Kupon doğrulama (sepet ekranında anında geri bildirim).
  checkCoupon: publicProcedure
    .input(z.object({ code: z.string(), subtotal: z.number(), shipping: z.number().default(0) }))
    .query(async ({ input }) => {
      const cfg = await db.getSettings();
      const coupon = findCoupon(parseCoupons(cfg.storeCoupons), input.code);
      return applyCoupon(input.subtotal, input.shipping, coupon);
    }),
  // Sipariş oluşturma: fiyatlar SUNUCUDA doğrulanır (client fiyatına güvenilmez).
  createOrder: publicProcedure
    .input(
      z.object({
        customerName: z.string().min(2),
        phone: z.string().min(7),
        address: z.string().min(5),
        email: z.string().email().optional(),
        couponCode: z.string().optional(),
        items: z.array(z.object({ productId: z.number(), quantity: z.number().int().positive() })).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const products = await db.listProducts();
      const byId = new Map(products.map(p => [p.id, p]));
      const lines: { productName: string; quantity: number; unitPrice: number }[] = [];
      let subtotal = 0;
      for (const it of input.items) {
        const p = byId.get(it.productId);
        if (!p || p.status === "arsiv") continue;
        const base = parseFloat(String(p.salePrice)) || 0;
        const disc = parseFloat(String(p.discountPercent)) || 0;
        const unit = +(base * (1 - disc / 100)).toFixed(2);
        if (unit <= 0) continue;
        lines.push({ productName: p.name, quantity: it.quantity, unitPrice: unit });
        subtotal += unit * it.quantity;
      }
      if (lines.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Sepette geçerli ürün yok" });

      // Kupon (varsa) sunucuda tekrar doğrulanır.
      let discount = 0;
      if (input.couponCode) {
        const cfg = await db.getSettings();
        const res = applyCoupon(subtotal, 0, findCoupon(parseCoupons(cfg.storeCoupons), input.couponCode));
        if (res.ok) discount = res.discount;
      }
      const total = Math.max(0, +(subtotal - discount).toFixed(2));

      const summary = lines.map(l => `${l.quantity}× ${l.productName}`).join(", ");
      const orderId = Number(
        await db.createOrder({
          orderNo: generateOrderNo(),
          customerName: input.customerName.trim(),
          channel: "magaza",
          status: "new",
          totalAmount: String(total),
          itemsSummary: summary,
          notes: discount > 0 ? `Kupon indirimi: ${discount.toFixed(2)} ₺ (${input.couponCode})` : null,
          customerPhone: input.phone.trim(),
          customerAddress: input.address.trim(),
          paymentStatus: "unpaid",
        } as never),
      );
      await db.replaceOrderItems(
        orderId,
        lines.map(l => ({ productName: l.productName, quantity: l.quantity, unitPrice: String(l.unitPrice) })) as never,
      );
      await notifyOwner({
        kind: "magaza-siparis",
        title: `🛒 Web mağazadan yeni sipariş — ${total.toFixed(0)} ₺`,
        body: `${input.customerName}\n${summary}`,
        link: "/siparisler",
      });
      return { orderId, total, paymentConfigured: isPaytrConfigured() };
    }),
  // PAYTR iframe token'ı (yalnızca yapılandırılmışsa). Client bunu iframe'de gösterir.
  paytrToken: publicProcedure
    .input(z.object({ orderId: z.number(), email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      if (!isPaytrConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PAYTR yapılandırılmamış" });
      const order = await db.getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Sipariş bulunamadı" });
      const items = await db.listOrderItems(input.orderId);
      const total = parseFloat(String(order.totalAmount)) || 0;
      const base = ENV.publicStoreUrl || "";
      const ip = (ctx.req?.headers["x-forwarded-for"]?.toString().split(",")[0] || ctx.req?.ip || "127.0.0.1").trim();
      const token = await getPaytrIframeToken({
        merchantOid: order.orderNo.replace(/[^a-zA-Z0-9]/g, ""),
        email: input.email,
        paymentAmountKurus: Math.round(total * 100),
        userName: order.customerName,
        userAddress: order.customerAddress ?? "-",
        userPhone: order.customerPhone ?? "-",
        userIp: ip,
        basket: items.map(i => ({ name: i.productName, price: parseFloat(String(i.unitPrice)) || 0, quantity: Number(i.quantity) || 1 })),
        okUrl: `${base}/magaza/tamam`,
        failUrl: `${base}/magaza/hata`,
        testMode: !ENV.isProduction,
      });
      return { token };
    }),
});


// Kupon yönetimi (admin) — ayarlar JSON'unda saklanır (şema gerektirmez).
export const couponsRouter = router({
  list: protectedProcedure.query(async () => parseCoupons((await db.getSettings()).storeCoupons)),
  save: protectedProcedure
    .input(
      z.array(
        z.object({
          code: z.string().min(1),
          type: z.enum(["percent", "fixed", "freeShipping"]),
          value: z.number().min(0),
          minSubtotal: z.number().min(0).optional(),
          expiresAt: z.string().nullable().optional(),
          active: z.boolean().optional(),
        }),
      ),
    )
    .mutation(({ input }) => db.setSettings({ storeCoupons: JSON.stringify(input) })),
});
