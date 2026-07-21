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
import { getWhatsAppDiagnostics, sendWhatsAppText } from "../whatsapp";
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
import { createShipment, isKargoConfigured } from "../kargo";
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
  products: publicProcedure.query(async () => {
    const products = await db.listProducts();
    return products
      .filter(p => p.status !== "arsiv" && parseFloat(String(p.salePrice)) > 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        series: p.series,
        salePrice: parseFloat(String(p.salePrice)) || 0,
        discountPercent: parseFloat(String(p.discountPercent)) || 0,
        shortDescription: p.shortDescription,
        imageUrls: p.imageUrls,
        mockupUrl: p.mockupUrl,
        inStock: (p.stockQty ?? 0) > 0,
      }));
  }),
  product: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const p = await db.getProduct(input.id);
    if (!p || p.status === "arsiv") throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });
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
