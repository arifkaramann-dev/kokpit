// Satış: sipariş panosu ve teklifler — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
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

const orderItemInput = z.object({
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const orderInput = z.object({
  customerName: z.string().min(1),
  channel: z.string().default("web"),
  totalAmount: z.number().min(0).default(0),
  itemsSummary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.string().nullable().optional(),
  // Elden/dışarıdan satış girişleri doğrudan "Tamamlandı" olarak eklenebilir.
  status: z.enum(["new", "production", "ready", "done", "cancelled"]).optional(),
  // Kalem listesi gönderilirse toplam tutar ve özet bu satırlardan türetilir.
  items: z.array(orderItemInput).optional(),
});

const quoteInput = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
  items: z.array(orderItemInput).optional(),
});



export const ordersRouter = router({
  // limit: pano/palet gibi ekranlar tam tabloyu çekmesin diye (pazaryeri hacmi
  // büyüdükçe ilk darboğaz burasıydı). Girdisiz çağrı eski davranış: tam liste.
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(5000).optional() }).optional())
    .query(({ input }) => db.listOrders(input?.limit)),
  items: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(({ input }) => db.listOrderItems(input.orderId)),
  // Toplu içerik dökümü: seçilen siparişlerin kalemleri tek sorguda.
  itemsBulk: protectedProcedure
    .input(z.object({ orderIds: z.array(z.number()).min(1).max(300) }))
    .query(({ input }) => db.listOrderItemsBulk(input.orderIds)),
  syncTrendyol: protectedProcedure.mutation(async () => {
    try {
      return await syncTrendyolOrders();
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Trendyol senkronizasyonu başarısız",
      });
    }
  }),
  // Hangi pazaryerinin bağlı olduğunu / hangi ayarın eksik olduğunu döner.
  marketplaceStatus: protectedProcedure.query(() => marketplaceStatus()),
  // Yapılandırılmış tüm pazaryerlerinden tek seferde çeker; her biri için sonuç döner.
  syncAll: protectedProcedure.mutation(() => syncAllMarketplaces()),
  // Aynı sipariş numaralı mükerrer kayıtları temizler (eski yarış durumu artığı).
  dedupe: protectedProcedure.mutation(() => db.dedupeOrders()),
  // Pazaryerinin resmi kargo etiketini (Trendyol ortak etiket, ZPL→PDF) çeker.
  // Base64 PDF döner; istemci yeni sekmede açıp yazdırır.
  shippingLabel: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const order = await db.getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Sipariş bulunamadı" });
      if (order.channel !== "trendyol") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Resmi kargo etiketi yalnızca Trendyol siparişleri için çekilebilir.",
        });
      }
      if (!order.cargoTrackingNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bu siparişte kargo takip numarası yok — kargoya verildikten sonra senkronla ve tekrar dene.",
        });
      }
      // Ortak etiket bu hesapta kapalıysa (COMMON_LABEL_NOT_ALLOWED) Trendyol'u
      // her seferinde yormayız: 7 gün doğrudan kendi etikete düşülür, sonra bir
      // kez daha denenir (kategori sorumlusu yetkiyi açmış olabilir).
      const cfg = await db.getSettings();
      const blockedAt = Date.parse(cfg.trendyolCommonLabelBlockedAt ?? "");
      if (Number.isFinite(blockedAt) && Date.now() - blockedAt < 7 * 24 * 60 * 60 * 1000) {
        return {
          pdfBase64: null,
          fallback: "not_allowed" as const,
          message:
            "Trendyol ortak etiket yetkisi bu hesapta kapalı — kendi barkodlu etiketimiz kullanılıyor. Yetki için kategori sorumlusuna başvurulabilir; haftada bir otomatik yeniden denenir.",
        };
      }
      try {
        const pdf = await getTrendyolCommonLabelPdf(order.cargoTrackingNumber);
        // Yetki açılmışsa eski engel kaydını temizle.
        if (cfg.trendyolCommonLabelBlockedAt) await db.setSettings({ trendyolCommonLabelBlockedAt: "" });
        return { pdfBase64: pdf.toString("base64"), fallback: null, message: null };
      } catch (error) {
        if (error instanceof TrendyolLabelNotAllowedError) {
          await db.setSettings({ trendyolCommonLabelBlockedAt: new Date().toISOString() });
          return { pdfBase64: null, fallback: "not_allowed" as const, message: error.message };
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Etiket alınamadı",
        });
      }
    }),
  // Pazaryerine gerçek istek atıp ham HTTP sonucunu döner (401 teşhisi için).
  testConnection: protectedProcedure
    .input(z.object({ key: z.enum(["trendyol", "hepsiburada", "n11", "ciceksepeti"]) }))
    .mutation(({ input }) => testMarketplaceConnection(input.key)),
  create: protectedProcedure.input(orderInput).mutation(async ({ input }) => {
    const { items, ...order } = input;
    if (items?.length) {
      order.totalAmount = itemsTotal(items);
      order.itemsSummary = summarizeItems(items);
    }
    const id = await db.createOrder({
      ...(toDecimalFields(order, ["totalAmount", "paidAmount"]) as never as object),
      orderNo: generateOrderNo(),
    } as never);
    if (items?.length) {
      await db.replaceOrderItems(Number(id), toItemRows(items));
    }
    return id;
  }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: orderInput.partial() }))
    .mutation(async ({ input }) => {
      const { items, ...order } = input.data;
      if (items !== undefined) {
        order.totalAmount = itemsTotal(items);
        order.itemsSummary = items.length ? summarizeItems(items) : null;
        await db.replaceOrderItems(input.id, toItemRows(items));
      }
      await db.updateOrder(input.id, toDecimalFields(order, ["totalAmount", "paidAmount"]) as never);
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["new", "production", "ready", "done", "cancelled"]) }))
    .mutation(({ input }) => db.updateOrder(input.id, { status: input.status })),
  // Ödeme durumu/tutarı: kart üzerinden hızlı tahsilat işaretleme.
  setPayment: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        paymentStatus: z.enum(["unpaid", "partial", "paid"]),
        paidAmount: z.number().min(0).default(0),
        paymentMethod: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      db.setOrderPayment(input.id, {
        paymentStatus: input.paymentStatus,
        paidAmount: String(input.paidAmount),
        paymentMethod: input.paymentMethod ?? null,
      }),
    ),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteOrder(input.id)),
});


// Teklifler: sipariş öncesi fiyat teklifi; kabul edilince tek tıkla siparişe dönüşür.
export const quotesRouter = router({
  list: protectedProcedure.query(() => db.listQuotes()),
  items: protectedProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(({ input }) => db.listQuoteItems(input.quoteId)),
  create: protectedProcedure.input(quoteInput).mutation(async ({ input }) => {
    const { items, validUntil, ...quote } = input;
    const data: Record<string, unknown> = { ...quote, quoteNo: generateQuoteNo() };
    if (items?.length) {
      data.totalAmount = String(itemsTotal(items));
      data.itemsSummary = summarizeItems(items);
    }
    data.validUntil = validUntil ? new Date(validUntil) : null;
    const id = await db.createQuote(data as never);
    if (items?.length) await db.replaceQuoteItems(id, toItemRows(items));
    return id;
  }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: quoteInput.partial() }))
    .mutation(async ({ input }) => {
      // Dönüşmüş teklif dondurulur: kalem/tutar değişse siparişle sessizce ayrışırdı.
      const existing = await db.getQuote(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Teklif bulunamadı" });
      if (existing.status === "converted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Siparişe dönüşmüş teklif düzenlenemez." });
      }
      const { items, validUntil, ...quote } = input.data;
      const data: Record<string, unknown> = { ...quote };
      if (items !== undefined) {
        data.totalAmount = String(itemsTotal(items));
        data.itemsSummary = items.length ? summarizeItems(items) : null;
        await db.replaceQuoteItems(input.id, toItemRows(items));
      }
      if (validUntil !== undefined) data.validUntil = validUntil ? new Date(validUntil) : null;
      await db.updateQuote(input.id, data as never);
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]) }))
    .mutation(async ({ input }) => {
      const quote = await db.getQuote(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Teklif bulunamadı" });
      if (quote.status === "converted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Siparişe dönüşmüş teklifin durumu değiştirilemez." });
      }
      await db.updateQuote(input.id, { status: input.status });
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteQuote(input.id)),
  // Kabul edilen teklifi siparişe dönüştürür: sipariş + kalemler oluşur
  // (mamul stok düşümü replaceOrderItems'ta), teklif "converted" işaretlenir.
  convert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const quote = await db.getQuote(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Teklif bulunamadı" });
      if (quote.status === "converted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu teklif zaten siparişe dönüştürülmüş." });
      }
      const qItems = await db.listQuoteItems(input.id);
      const orderNo = generateOrderNo();
      const orderId = await db.createOrder({
        orderNo,
        customerName: quote.customerName,
        customerId: quote.customerId,
        channel: "elden",
        status: "new",
        totalAmount: quote.totalAmount,
        itemsSummary: quote.itemsSummary,
        notes: [quote.notes, `Teklif ${quote.quoteNo} kabulüyle oluşturuldu`].filter(Boolean).join("\n"),
        customerPhone: quote.customerPhone,
        customerAddress: quote.customerAddress,
      } as never);
      if (qItems.length > 0) {
        await db.replaceOrderItems(
          Number(orderId),
          qItems.map(i => ({
            productName: i.productName,
            productId: i.productId,
            quantity: String(i.quantity),
            unitPrice: String(i.unitPrice),
          })),
        );
      }
      await db.updateQuote(input.id, { status: "converted", orderId: Number(orderId) });
      return { orderId: Number(orderId), orderNo };
    }),
});

/* ------------------------- CRM Satış Boru Hattı ------------------------- */

const opportunityInput = z.object({
  title: z.string().min(1),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  expectedAmount: z.number().min(0).optional(),
  stage: z.enum(["yeni", "gorusme", "teklif", "kazanildi", "kaybedildi"]).optional(),
  nextStep: z.string().nullable().optional(),
  nextStepDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const toOpportunityRow = (input: z.infer<typeof opportunityInput>) => ({
  ...input,
  expectedAmount: input.expectedAmount != null ? String(input.expectedAmount) : undefined,
  nextStepDate: input.nextStepDate ? new Date(input.nextStepDate) : null,
});

export const crmRouter = router({
  list: protectedProcedure.query(() => db.listOpportunities()),
  create: protectedProcedure
    .input(opportunityInput)
    .mutation(({ input }) => db.createOpportunity(toOpportunityRow(input) as never)),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: opportunityInput.partial() }))
    .mutation(({ input }) =>
      db.updateOpportunity(input.id, toOpportunityRow(input.data as z.infer<typeof opportunityInput>) as never),
    ),
  setStage: protectedProcedure
    .input(z.object({ id: z.number(), stage: z.enum(["yeni", "gorusme", "teklif", "kazanildi", "kaybedildi"]) }))
    .mutation(({ input }) => db.updateOpportunity(input.id, { stage: input.stage })),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteOpportunity(input.id)),
});
