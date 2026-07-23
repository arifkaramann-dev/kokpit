// Finans: alış faturaları, kasa/cari, gider, rapor, e-Fatura, kargo, mutabakat — server/routers.ts bölünmesi (davranış birebir, Sprint 2).
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
import { createShipment, isKargoConfigured } from "../kargo";
import { applyCoupon, findCoupon, parseCoupons } from "@shared/campaigns";
import { parseBankStatement, reconcile } from "@shared/reconcile";
import { channelProfitReport } from "../reportUtils";
import { DEFAULT_CHANNEL_PROFILES, deriveUnitLaborOverhead, normalizeChannelProfile } from "@shared/pricing";
import { ENV } from "../_core/env";
import { toDecimalFields } from "./util";

const customerInput = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const expenseInput = z.object({
  category: z.string().min(1).default("diğer"),
  description: z.string().nullable().optional(),
  amount: z.number().min(0).default(0),
  expenseDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const accountInput = z.object({
  name: z.string().min(1),
  kind: z.enum(["kasa", "banka"]).default("kasa"),
  openingBalance: z.number().default(0),
  note: z.string().nullable().optional(),
});

const transactionInput = z.object({
  txnDate: z.string().nullable().optional(),
  accountId: z.number().nullable().optional(),
  direction: z.enum(["in", "out"]),
  amount: z.number().min(0).default(0),
  category: z.string().min(1).default("diğer"),
  customerName: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  orderId: z.number().nullable().optional(),
  orderNo: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});


const supplierInput = z.object({
  name: z.string().min(1),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  suppliesText: z.string().nullable().optional(),
  lastOrderDate: z.date().nullable().optional(),
  priceNotes: z.string().nullable().optional(),
});



export const purchasesRouter = router({
  list: protectedProcedure.query(() => db.listPurchases()),
  create: protectedProcedure
    .input(
      z.object({
        supplierName: z.string().nullable().optional(),
        invoiceNo: z.string().nullable().optional(),
        invoiceDate: z.date().nullable().optional(),
        note: z.string().nullable().optional(),
        items: z
          .array(
            z.object({
              name: z.string().min(1),
              qty: z.number().positive(),
              unit: z.string().min(1),
              unitCost: z.number().min(0),
            }),
          )
          .min(1),
      }),
    )
    .mutation(({ input }) =>
      db.createPurchase(
        {
          supplierName: input.supplierName ?? null,
          invoiceNo: input.invoiceNo ?? null,
          invoiceDate: input.invoiceDate ?? null,
          note: input.note ?? null,
        },
        input.items,
      ),
    ),
  parseInvoice: protectedProcedure
    .input(z.object({ mediaType: z.string(), data: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await extractInvoice(input.mediaType, input.data);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Fatura okunamadı",
        });
      }
    }),
  // Alış faturasını geriye dönük düzenle (cari ekstre düzeltmesi — finans başlığı).
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        totalAmount: z.number().min(0).optional(),
        invoiceDate: z.string().nullable().optional(),
        invoiceNo: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        supplierName: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { id, invoiceDate, ...rest } = input;
      return db.updatePurchase(id, {
        ...rest,
        ...(invoiceDate !== undefined
          ? { invoiceDate: invoiceDate ? new Date(invoiceDate) : null }
          : {}),
      });
    }),
  // Alış faturasını sil (eklediği hammadde stoğu geri alınır).
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePurchase(input.id)),
});


export const reportRouter = router({
  data: protectedProcedure.query(() => db.reportData()),
  vat: protectedProcedure.query(() => db.vatReport()),
  cashflow: protectedProcedure.query(() => db.cashflowReport()),
  // Ürün bazlı satış (adet + ciro, iptal hariç): üretim önerisi + kârlılık raporu.
  productSales: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
    .query(({ input }) => db.productSalesSince(input?.days ?? 30)),
  // Kanal bazlı toplu net kâr: finans onaylı kâr modeli v2 ile, sipariş başına.
  channelProfit: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [orders, items, costRows, products, cfg] = await Promise.all([
        db.listOrders(),
        db.listAllOrderItemRefs(),
        db.listProductMaterialCosts(),
        db.listProducts(),
        db.getSettings(),
      ]);
      let profiles = DEFAULT_CHANNEL_PROFILES;
      try {
        const parsed = JSON.parse(cfg.channelProfiles ?? "");
        if (Array.isArray(parsed) && parsed.length > 0) profiles = parsed.map(normalizeChannelProfile);
      } catch {
        /* kayıtlı profil yoksa varsayılanlar */
      }
      const costByProduct = new Map(costRows.map(r => [r.productId, parseFloat(String(r.materialCost)) || 0]));
      const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
      const costs = new Map(
        products.map(p => [
          p.id,
          {
            materialCost: costByProduct.get(p.id) ?? 0,
            packagingCost: num(p.packagingCost),
            shippingCost: num(p.shippingCost),
          },
        ]),
      );
      const laborOverhead = deriveUnitLaborOverhead(cfg).value;
      return { days, ...channelProfitReport(orders, items, costs, profiles, since, laborOverhead) };
    }),
});


export const customersRouter = router({
  list: protectedProcedure.query(() => db.listCustomers()),
  create: protectedProcedure.input(customerInput).mutation(({ input }) => db.createCustomer(input as never)),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: customerInput.partial() }))
    .mutation(({ input }) => db.updateCustomer(input.id, input.data as never)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCustomer(input.id)),
  // Müşteri cari ekstresi: siparişler (borç) + tahsilatlar (alacak) + bakiye.
  ledger: protectedProcedure.input(z.object({ name: z.string() })).query(({ input }) => db.customerLedger(input.name)),
  // Müşteri 360°: sipariş + teklif geçmişi ve özet (LTV, sipariş sayısı, son sipariş).
  profile: protectedProcedure.input(z.object({ name: z.string() })).query(({ input }) => db.customerProfile(input.name)),
  // Tüm müşterilerin cari bakiyesi (küçük harf ada göre).
  balances: protectedProcedure.query(() => db.customerBalances()),
});


// Çek & Senet portföyü.
export const chequesRouter = router({
  list: protectedProcedure.query(() => db.listCheques()),
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(["cek", "senet"]).default("cek"),
        direction: z.enum(["alinan", "verilen"]).default("alinan"),
        partyName: z.string().nullable().optional(),
        bank: z.string().nullable().optional(),
        serialNo: z.string().nullable().optional(),
        amount: z.number().min(0).default(0),
        dueDate: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { dueDate, ...rest } = input;
      return db.createCheque({
        ...(toDecimalFields(rest, ["amount"]) as never as object),
        dueDate: dueDate ? new Date(dueDate) : null,
      } as never);
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["portfoyde", "tahsil", "odendi", "karsiliksiz", "iade"]) }))
    .mutation(({ input }) => db.updateCheque(input.id, { status: input.status })),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCheque(input.id)),
});


// Kasa & Banka hesapları (ön muhasebe).
export const accountsRouter = router({
  list: protectedProcedure.query(() => db.listAccounts()),
  create: protectedProcedure.input(accountInput).mutation(({ input }) =>
    db.createAccount(toDecimalFields(input, ["openingBalance"]) as never),
  ),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: accountInput.partial() }))
    .mutation(({ input }) => db.updateAccount(input.id, toDecimalFields(input.data, ["openingBalance"]) as never)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAccount(input.id)),
  transfer: protectedProcedure
    .input(z.object({ fromId: z.number(), toId: z.number(), amount: z.number().positive(), note: z.string().nullable().optional() }))
    .mutation(({ input }) => {
      if (input.fromId === input.toId) throw new TRPCError({ code: "BAD_REQUEST", message: "Aynı hesaba transfer olmaz." });
      return db.transferBetweenAccounts(input.fromId, input.toId, input.amount, input.note ?? null);
    }),
});


// Para/cari hareketleri: tahsilat, ödeme, gelir, gider, transfer.
export const transactionsRouter = router({
  list: protectedProcedure
    .input(z.object({ customerName: z.string().optional(), accountId: z.number().optional(), limit: z.number().optional() }).optional())
    .query(({ input }) => db.listTransactions(input ?? undefined)),
  create: protectedProcedure.input(transactionInput).mutation(({ input }) => {
    const { txnDate, ...rest } = input;
    return db.createTransaction({
      ...(toDecimalFields(rest, ["amount"]) as never as object),
      txnDate: txnDate ? new Date(txnDate) : new Date(),
    } as never);
  }),
  // Hareketi geriye dönük düzenle (tutar/tarih/açıklama) — cari ekstre düzeltmesi.
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        amount: z.number().min(0).optional(),
        txnDate: z.string().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { id, txnDate, ...rest } = input;
      return db.updateTransaction(id, {
        ...rest,
        ...(txnDate !== undefined ? { txnDate: new Date(txnDate) } : {}),
      });
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTransaction(input.id)),
});


export const expensesRouter = router({
  list: protectedProcedure.query(() => db.listExpenses()),
  create: protectedProcedure.input(expenseInput).mutation(({ input }) => {
    const { expenseDate, ...rest } = input;
    return db.createExpense({
      ...(toDecimalFields(rest, ["amount"]) as never as object),
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
    } as never);
  }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: expenseInput.partial() }))
    .mutation(({ input }) => {
      const { expenseDate, ...rest } = input.data;
      return db.updateExpense(input.id, {
        ...(toDecimalFields(rest, ["amount"]) as never as object),
        ...(expenseDate ? { expenseDate: new Date(expenseDate) } : {}),
      } as never);
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteExpense(input.id)),
});


export const suppliersRouter = router({
  list: protectedProcedure.query(() => db.listSuppliers()),
  create: protectedProcedure.input(supplierInput).mutation(({ input }) => db.createSupplier(input as never)),
  update: protectedProcedure
    .input(z.object({ id: z.number(), data: supplierInput.partial() }))
    .mutation(({ input }) => db.updateSupplier(input.id, input.data as never)),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteSupplier(input.id)),
  // Tedarikçi cari: alış faturaları (borç) − ödemeler (alacak).
  ledger: protectedProcedure.input(z.object({ name: z.string() })).query(({ input }) => db.supplierLedger(input.name)),
  balances: protectedProcedure.query(() => db.supplierBalances()),
});


// e-Fatura / e-Arşiv (Tema C) — payload üretimi + (yapılandırılmışsa) gönderim.
export const invoicesRouter = router({
  configured: protectedProcedure.query(() => ({ efatura: isEfaturaConfigured() })),
  // Siparişten fatura taslağı üretir; entegratör bağlıysa gönderir.
  fromOrder: protectedProcedure
    .input(z.object({ orderId: z.number(), send: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const order = await db.getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Sipariş bulunamadı" });
      const items = await db.listOrderItems(input.orderId);
      const cfg = await db.getSettings();
      const vat = parseFloat(cfg.vatRate ?? "20") || 20;
      const payload = buildInvoicePayload({
        company: {
          name: cfg.companyName ?? "",
          taxNumber: cfg.taxNumber ?? "",
          taxOffice: cfg.taxOffice ?? "",
          address: cfg.companyAddress ?? "",
        },
        customer: {
          name: order.customerName,
          address: order.customerAddress,
          phone: order.customerPhone,
        },
        lines: items.map(i => ({
          name: i.productName,
          quantity: Number(i.quantity) || 1,
          unitPrice: parseFloat(String(i.unitPrice)) || 0,
          vatPercent: vat,
        })),
        note: cfg.invoiceNote ?? null,
      });
      const result = input.send ? await sendInvoice(payload) : { sent: false, provider: null, externalId: null, reason: "Taslak" };
      return { payload, result };
    }),
});


// Kargo (Tema D) — gönderi oluşturma (yapılandırılmışsa canlı, yoksa manuel).
export const kargoRouter = router({
  configured: protectedProcedure.query(() => ({ kargo: isKargoConfigured() })),
  createShipment: protectedProcedure
    .input(z.object({ orderId: z.number(), desi: z.number().optional() }))
    .mutation(async ({ input }) => {
      const order = await db.getOrder(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Sipariş bulunamadı" });
      const res = await createShipment({
        orderNo: order.orderNo,
        recipientName: order.customerName,
        phone: order.customerPhone ?? "",
        address: order.customerAddress ?? "",
        desi: input.desi,
      });
      if (res.created && res.trackingNumber) {
        await db.updateOrder(input.orderId, {
          cargoTrackingNumber: res.trackingNumber,
          cargoProviderName: res.provider,
          cargoTrackingLink: res.trackingUrl,
        } as never);
      }
      return res;
    }),
});


// Banka ekstresi mutabakatı (Tema C) — CSV yükle, tahsilat/ödemelerle eşleştir.
export const reconcileRouter = router({
  match: protectedProcedure
    .input(z.object({ csv: z.string().min(1), dayTolerance: z.number().default(3) }))
    .mutation(async ({ input }) => {
      const parsed = parseBankStatement(input.csv);
      if (parsed.lines.length === 0) return { matches: [], errors: parsed.errors };
      const txns = await db.listTransactions({ limit: 1000 });
      const ledger = txns.map(t => {
        const amt = parseFloat(String(t.amount)) || 0;
        // Giriş (in) = para girişi (+), çıkış (out) = ödeme (−).
        const sign = t.direction === "in" ? 1 : -1;
        return {
          id: t.id,
          date: new Date(t.txnDate ?? t.createdAt).toISOString().slice(0, 10),
          amount: sign * Math.abs(amt),
          label: `${t.category} · ${t.description ?? t.customerName ?? ""}`.trim(),
        };
      });
      return { matches: reconcile(parsed.lines, ledger, input.dayTolerance), errors: parsed.errors };
    }),
});
