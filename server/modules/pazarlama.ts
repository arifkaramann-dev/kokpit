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
import { resolveImages } from "../masterFields";
import { itemsTotal, summarizeItems, toItemRows } from "../orderUtils";
import { buildStoreProduct, buildStorefront, type StoreGroup } from "../storefrontCatalog";
import { extractInvoice } from "../_core/claude";
import { executeAssistantCommand, generateOrderNo, generateQuoteNo } from "../assistant";
import { buildSaleTitle, deriveCombos, parseSetCount, planGenerationSync, renameVariantTitle } from "../productUtils";
import { computePrice, extractJson, parseFeatures, pickReferenceProduct, scoreReference, suggestSku } from "../autofill";
import { computeReorderSuggestions, summarizeReorder } from "../reorder";
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
      });

      return {
        beforeAfterImageUrl: beforeAfter.url,
        packagingImageUrl: packaging.url,
        marketingImageUrl: marketing.url,
      };
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
          });
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
        await db.updateProductGeneration(input.generationId, { status: "error" });
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
        /** v3 ürün bağı — cevap taslağı ilan içeriğinden beslenir. */
        masterId: z.number().nullable().optional(),
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
        masterId: q.masterId,
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
      });
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
/** Decimal (string) alanları sayıya çevirir. */
const storeNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Vitrin verisini v3 kataloğundan yükler.
 *
 * Web kanalına hiç yayın yapılmamışsa null döner ve çağıran ESKİ modele
 * düşer. Böylece katalog taşınırken canlı mağaza bir an bile boş kalmaz;
 * ilk yayın yapıldığı anda vitrin kendiliğinden v3'e geçer.
 */
async function loadV3Storefront(): Promise<StoreGroup[] | null> {
  const channels = (await db.listSalesChannels()) as { id: number; code: string }[];
  const web = channels.find(c => c.code === "web");
  if (!web) return null;

  const [channelListings, listings, masters, colors, packagings, series, lImages, mImages] =
    await Promise.all([
      db.listChannelListings(),
      db.listListings(),
      db.listMasterProducts(),
      db.listColors(),
      db.listPackagings(),
      db.listProductSeries(),
      db.listListingImages(),
      db.listMasterImages(),
    ]);

  const publications = (channelListings as Record<string, unknown>[])
    .filter(c => c.channelId === web.id)
    .map(c => ({
      listingId: c.listingId as number,
      masterId: c.masterId as number,
      price: storeNum(c.price),
      discountPercent: storeNum(c.discountPercent),
      status: c.status as "taslak" | "canli" | "durduruldu",
    }));
  if (publications.every(p => p.status !== "canli")) return null;

  const storeListings = (listings as Record<string, unknown>[]).map(l => ({
    id: l.id as number,
    masterId: l.masterId as number,
    isPrimary: Number(l.isPrimary ?? 0) === 1,
    title: String(l.title ?? ""),
    slug: (l.slug as string | null) ?? null,
    shortDescription: (l.shortDescription as string | null) ?? null,
    longDescription: (l.longDescription as string | null) ?? null,
    applicationText: (l.applicationText as string | null) ?? null,
    status: l.status as "taslak" | "aktif" | "arsiv",
  }));

  // Görsel: ilanın kendi görseli yoksa master'ınki devralınır.
  const byListing = new Map<number, { url: string | null; id?: number; sortOrder: number }[]>();
  for (const i of lImages as { listingId: number; url: string; sortOrder: number }[]) {
    byListing.set(i.listingId, [
      ...(byListing.get(i.listingId) ?? []),
      { url: i.url, sortOrder: Number(i.sortOrder ?? 0) },
    ]);
  }
  const byMaster = new Map<number, { url: string | null; id?: number; sortOrder: number }[]>();
  for (const i of mImages as { id: number; masterId: number; url: string | null; sortOrder: number }[]) {
    byMaster.set(i.masterId, [
      ...(byMaster.get(i.masterId) ?? []),
      { id: i.id, url: i.url, sortOrder: Number(i.sortOrder ?? 0) },
    ]);
  }
  const imagesOf = new Map<number, string[]>();
  for (const l of storeListings) {
    const urls = resolveImages({
      listingImages: byListing.get(l.id) ?? [],
      masterImages: byMaster.get(l.masterId) ?? [],
      limit: 8,
    });
    if (urls.length > 0 && !imagesOf.has(l.masterId)) imagesOf.set(l.masterId, urls);
  }

  return buildStorefront({
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      familyId: m.familyId as number,
      packagingId: m.packagingId as number,
      baseCode: (m.baseCode as string | null) ?? null,
      internalSku: String(m.internalSku ?? ""),
      status: m.status as "taslak" | "aktif" | "arsiv",
      basePrice: storeNum(m.basePrice),
      discountPercent: storeNum(m.discountPercent),
      buildableQty: Number(m.buildableQty ?? 0),
      stockQty: Number(m.stockQty ?? 0),
    })),
    listings: storeListings,
    publications,
    colors: new Map(
      (colors as { id: number; name: string; hex: string | null }[]).map(c => [
        c.id,
        { name: c.name, hex: c.hex },
      ]),
    ),
    packagings: new Map(
      (packagings as { id: number; name: string; volumeMl: string }[]).map(p => [
        p.id,
        { name: p.name, volumeMl: storeNum(p.volumeMl) },
      ]),
    ),
    series: new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name])),
    imagesOf,
  });
}

/**
 * v3 vitrin kartını eski vitrin biçimine çevirir.
 *
 * Vitrin sayfası (`Storefront.tsx`) eski alan adlarını bekliyor. Geçiş
 * boyunca iki ayrı render yolu tutmak yerine sunucu tek biçim döner.
 */
function toStoreWire(g: StoreGroup) {
  return {
    id: g.id,
    name: g.name,
    series: g.series,
    shortDescription: g.shortDescription,
    // Vitrin JSON dizi bekliyor (eski `products.imageUrls` alanı da öyleydi).
    imageUrls: g.imageUrls.length > 0 ? JSON.stringify(g.imageUrls) : null,
    mockupUrl: null as string | null,
    minPrice: g.minPrice,
    maxPrice: g.maxPrice,
    inStock: g.inStock,
    options: g.options.map(o => ({
      id: o.masterId,
      name: o.packagingName,
      packaging: o.packagingName,
      colorCode: g.colorName || null,
      colorHex: g.colorHex,
      salePrice: o.salePrice,
      discountPercent: o.discountPercent,
      inStock: o.inStock,
    })),
  };
}

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
    // Önce v3: web kanalına yayın yapılmışsa vitrin oradan beslenir.
    // Çıktı eski biçime uyarlanır — vitrin sayfası tek şekil görür, geçiş
    // sırasında iki ayrı render yolu tutmak gerekmez.
    const v3 = await loadV3Storefront();
    if (v3) return v3.map(toStoreWire);

    return [];
  }),
  product: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const v3 = await loadV3Storefront();
    if (v3) {
      const listings = (await db.listListings()) as Record<string, unknown>[];
      const found = buildStoreProduct({
        masterId: input.id,
        groups: v3,
        listings: listings.map(l => ({
          id: l.id as number,
          masterId: l.masterId as number,
          isPrimary: Number(l.isPrimary ?? 0) === 1,
          title: String(l.title ?? ""),
          slug: (l.slug as string | null) ?? null,
          shortDescription: (l.shortDescription as string | null) ?? null,
          longDescription: (l.longDescription as string | null) ?? null,
          applicationText: (l.applicationText as string | null) ?? null,
          status: l.status as "taslak" | "aktif" | "arsiv",
        })),
      });
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
      const option = found.options.find(o => o.masterId === input.id) ?? found.options[0];
      return {
        id: input.id,
        name: found.name,
        series: found.series,
        salePrice: option.salePrice,
        discountPercent: option.discountPercent,
        shortDescription: found.shortDescription,
        description: found.description,
        usageGuide: found.usageGuide,
        imageUrls: found.imageUrls.length > 0 ? JSON.stringify(found.imageUrls) : null,
        mockupUrl: null,
        inStock: option.inStock,
      };
    }

    throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
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
      // Fiyat SUNUCUDA doğrulanır — istemciden gelen fiyata güvenilmez.
      // v3 vitrindeyse sipariş satırı doğrudan master'a bağlanır; böylece
      // web siparişi de üretim planına ve getiri raporuna girer.
      const v3 = await loadV3Storefront();
      const lines: {
        productName: string;
        quantity: number;
        unitPrice: number;
        masterId?: number | null;
      }[] = [];
      let subtotal = 0;

      if (v3) {
        const optionOf = new Map(
          v3.flatMap(g => g.options.map(o => [o.masterId, { option: o, group: g }] as const)),
        );
        for (const it of input.items) {
          const hit = optionOf.get(it.productId);
          if (!hit || hit.option.netPrice <= 0) continue;
          const name = [hit.group.name, hit.option.packagingName].filter(Boolean).join(" · ");
          lines.push({
            productName: name,
            quantity: it.quantity,
            unitPrice: hit.option.netPrice,
            masterId: it.productId,
          });
          subtotal += hit.option.netPrice * it.quantity;
        }
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
        }),
      );
      await db.replaceOrderItems(
        orderId,
        lines.map(l => ({
          productName: l.productName,
          quantity: l.quantity,
          unitPrice: String(l.unitPrice),
          masterId: l.masterId ?? null,
        })) as never,
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
