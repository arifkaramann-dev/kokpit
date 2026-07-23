// Sistem: auth, asistan, ayarlar, bildirim, görevler, kokpit özeti, HB test — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
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
import { runAssistant } from "../assistantAgent";
import { buildSaleTitle, deriveCombos, parseSetCount, renameVariantTitle } from "../productUtils";
import { computePrice, extractJson, parseFeatures, pickReferenceProduct, scoreReference, suggestSku } from "../autofill";
import { computeReorderSuggestions, summarizeReorder } from "../reorder";
import { overdueCheques } from "../financeUtils";
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
  MP_KEY_PREFIX,
  getMarketplaceCredentials,
  saveMarketplaceCredentials,
} from "../marketplaceCredentials";
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

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return {
      success: true,
    } as const;
  }),
  // Tüm cihazlardaki oturumları geçersiz kılar (telefon çalındı, şifre sızdı vb.).
  // Bu andan önce imzalanmış her token sunucuda reddedilir.
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await db.setSettings({ "auth.sessionsRevokedAt": String(Date.now()) });
    db.clearSessionRevocationCache();
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});


export const assistantRouter = router({
  // Sesli uyandırma (Picovoice) yapılandırması. AccessKey varsa istemci
  // Porcupine'i başlatır; yoksa Web Speech tabanlı uyandırmaya düşer.
  wakeConfig: protectedProcedure.query(() => ({
    accessKey: ENV.picovoiceAccessKey,
    keywordPath: ENV.picovoiceKeywordPath,
    keywordLabel: ENV.picovoiceKeywordLabel,
    modelPath: ENV.picovoiceModelPath,
  })),
  // Sesli/serbest metin komutu: Claude niyeti çözer, sunucu uygular.
  // Uygulama içi asistan runAssistant beynini kullanır (server/assistantAgent.ts).
  command: protectedProcedure
    .input(z.object({ transcript: z.string().min(2) }))
    .mutation(async ({ input }) => {
      try {
        return await runAssistant(input.transcript, "app");
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Komut anlaşılamadı",
        });
      }
    }),
});


export const settingsRouter = router({
  // Şirket/fatura bilgileri (unvan, adres, vergi no, IBAN, KDV oranı vb.).
  // Maliyet parametrelerinden türetilen adet başı işçilik+genel gider payı da
  // eklenir: unitLaborOverheadEffective (elle değer boşsa otomatik hesap).
  get: protectedProcedure.query(async (): Promise<Record<string, string>> => {
    const cfg = await db.getSettings();
    // Pazaryeri kimlik bilgileri ("mp:" ön ekli) burada sızdırılmaz; onlar
    // maskeli olarak settings.marketplaceCredentials üzerinden döner.
    const publicCfg: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (!k.startsWith(MP_KEY_PREFIX)) publicCfg[k] = v;
    }
    const derived = deriveUnitLaborOverhead(publicCfg);
    return {
      ...publicCfg,
      unitLaborOverheadEffective: String(derived.value),
      unitLaborOverheadSource: derived.source,
    };
  }),
  // Pazaryeri kimlik bilgileri: her alanın durumu (sırlar maskeli). Ham sır dönmez.
  marketplaceCredentials: protectedProcedure.query(() => getMarketplaceCredentials()),
  // Uygulama içinden pazaryeri anahtarı kaydet → DB + anında env overlay tazelenir.
  saveMarketplaceCredentials: protectedProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(({ input }) => saveMarketplaceCredentials(input)),
  save: protectedProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(({ input }) => {
      // Türetilmiş alanlar kaydedilmez (form ekranı olduğu gibi geri yollar).
      const { unitLaborOverheadEffective: _e, unitLaborOverheadSource: _s, ...rest } = input;
      return db.setSettings(rest);
    }),
  nextInvoiceNo: protectedProcedure.mutation(() => db.nextInvoiceNo()),
  // Bağlantı Durumu kartı: hangi entegrasyon yapılandırılmış, zamanlayıcı canlı mı?
  // Gizli değer sızdırmaz — yalnızca "tanımlı mı" bilgisi döner.
  integrationStatus: protectedProcedure.query(async () => {
    const cfg = await db.getSettings();
    const lastTick = parseInt(cfg["scheduler.lastTickAt"] ?? "0", 10) || 0;
    return {
      integrations: [
        { key: "trendyol", label: "Trendyol", ok: isTrendyolConfigured(), hint: "TRENDYOL_SELLER_ID / API_KEY / API_SECRET" },
        { key: "hepsiburada", label: "Hepsiburada", ok: isHepsiburadaConfigured(), hint: "HEPSIBURADA_MERCHANT_ID / USERNAME / PASSWORD" },
        { key: "n11", label: "N11", ok: isN11Configured(), hint: "N11 API anahtarları" },
        { key: "ciceksepeti", label: "Çiçeksepeti", ok: isCiceksepetiConfigured(), hint: "Çiçeksepeti API anahtarı" },
        { key: "ai", label: "AI (Claude)", ok: Boolean(process.env.ANTHROPIC_API_KEY), hint: "ANTHROPIC_API_KEY" },
        { key: "efatura", label: "e-Fatura (Bizimhesap)", ok: isEfaturaConfigured(), hint: "EFATURA_PROVIDER + BIZIMHESAP_FIRM_ID" },
        { key: "kargo", label: "Kargo (Geliver)", ok: isKargoConfigured(), hint: "GELIVER_API_TOKEN (KARGO.md)" },
        { key: "paytr", label: "PayTR (mağaza ödemesi)", ok: isPaytrConfigured(), hint: "PAYTR_MERCHANT_ID / KEY / SALT" },
      ],
      scheduler: {
        disabled: process.env.SCHEDULER_DISABLED === "1",
        lastTickAt: lastTick,
      },
    };
  }),
  // ÜRÜN KAYIT Excel verilerini tek tuşla aktarır (Render ücretsiz planda
  // Shell yok). Idempotent: tekrar basmak var olan kayıtları ezmez.
  importUrunKayit: protectedProcedure.mutation(async () => {
    try {
      return await importUrunKayit();
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "İçe aktarma başarısız",
      });
    }
  }),
});


// Bildirim merkezi: zamanlayıcı/nöbetçi bildirimleri (zil ikonu).
export const notificationsRouter = router({
  list: protectedProcedure.query(() => db.listNotifications(30)),
  unreadCount: protectedProcedure.query(() => db.unreadNotificationCount()),
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => db.markNotificationRead(input.id)),
  markAllRead: protectedProcedure.mutation(() => db.markAllNotificationsRead()),
});


export const tasksRouter = router({
  list: protectedProcedure.query(() => db.listTasks()),
  create: protectedProcedure
    .input(z.object({ kind: z.enum(["eksik", "gorev"]), title: z.string().min(1), note: z.string().nullable().optional() }))
    .mutation(({ input }) => db.createTask(input)),
  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "done"]) }))
    .mutation(({ input }) => db.setTaskStatus(input.id, input.status)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTask(input.id)),
});


export const dashboardRouter = router({
  // Dönem karşılaştırma: seçilen pencere (gün) vs bir önceki aynı pencere.
  periodStats: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365) }))
    .query(({ input }) => db.periodStats(input.days)),
  summary: protectedProcedure.query(async () => {
    const [today, statusCounts, critical, upcoming, openTasks, finance, unpaid, newQuestions, products, cheques, cfg] =
      await Promise.all([
        db.countOrdersToday(),
        db.orderStatusCounts(),
        db.listCriticalMaterials(),
        db.upcomingCampaigns(30),
        db.listTasks(undefined, "open"),
        db.financeSummary(),
        db.listUnpaidOrders(6),
        db.countNewMarketplaceQuestions(),
        db.listProducts(),
        db.listCheques(),
        db.getSettings(),
      ]);
    // Üretim kuyruğu sayısı: Stok Nöbetçisi / Üretim sayfası kuralıyla aynı
    // (eksi stok veya kritik eşiğin altı, pasifler hariç).
    const productionQueue = products.filter(
      p =>
        p.status !== "arsiv" &&
        ((p.stockQty ?? 0) < 0 || ((p.criticalQty ?? 0) > 0 && (p.stockQty ?? 0) <= (p.criticalQty ?? 0))),
    ).length;
    const schedulerLastTickAt = parseInt(cfg["scheduler.lastTickAt"] ?? "0", 10) || 0;
    const schedulerDisabled = process.env.SCHEDULER_DISABLED === "1";
    // Vadesi geçen çek/senet (Çek Nöbetçisi ile aynı kural) — Kokpit'te aksiyon.
    const oc = overdueCheques(cheques);
    const overdueChequesCount = oc.incoming.length + oc.outgoing.length;
    return {
      today,
      statusCounts,
      critical,
      upcoming,
      openTasks,
      finance,
      unpaid,
      newQuestions,
      productionQueue,
      overdueChequesCount,
      overdueChequesTotal: oc.totalIncoming + oc.totalOutgoing,
      schedulerLastTickAt,
      schedulerDisabled,
    };
  }),
});




// Hepsiburada canlıya geçiş test paneli (SIT ortamı) — HB'nin istediği
// 3 kanıtı üretir: katalog trackingId, listing uploadId, sipariş+paketleme.
export const hbTestRouter = router({
  info: protectedProcedure.query(() => hbTestInfo()),
  sendProduct: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().int().positive(),
        merchantSku: z.string().min(1),
        name: z.string().min(1),
        brand: z.string().min(1),
        price: z.number().positive(),
        stock: z.number().int().min(0).optional(),
        barcode: z.string().optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await hbCatalogSendTestProduct(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Katalog gönderimi başarısız" });
      }
    }),
  productStatus: protectedProcedure
    .input(z.object({ trackingId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await hbCatalogStatus(input.trackingId);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Durum sorgusu başarısız" });
      }
    }),
  listings: protectedProcedure.mutation(async () => {
    try {
      return await hbListListings();
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Listeleme çekilemedi" });
    }
  }),
  pushListing: protectedProcedure
    .input(z.object({ merchantSku: z.string().min(1), price: z.number().positive(), stock: z.number().int().min(0) }))
    .mutation(async ({ input }) => {
      try {
        return await hbListingTestPush(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Stok/fiyat gönderimi başarısız" });
      }
    }),
  createOrder: protectedProcedure
    .input(
      z.object({
        hbSku: z.string().min(1),
        merchantSku: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        price: z.number().positive().optional(),
        rawBody: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await hbCreateTestOrder(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Test siparişi oluşturulamadı" });
      }
    }),
  listOrders: protectedProcedure.mutation(async () => {
    try {
      return await hbListPaidOrdersRaw();
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Siparişler çekilemedi" });
    }
  }),
  packageOrder: protectedProcedure
    .input(z.object({ orderNumber: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await hbPackageOrder(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Paketleme başarısız" });
      }
    }),
});
