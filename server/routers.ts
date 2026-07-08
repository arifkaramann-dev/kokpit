import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows } from "./orderUtils";
import { syncTrendyolOrders } from "./trendyol";

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
});

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
  // Kalem listesi gönderilirse toplam tutar ve özet bu satırlardan türetilir.
  items: z.array(orderItemInput).optional(),
});

export { itemsTotal, summarizeItems } from "./orderUtils";

const supplierInput = z.object({
  name: z.string().min(1),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  suppliesText: z.string().nullable().optional(),
  lastOrderDate: z.date().nullable().optional(),
  priceNotes: z.string().nullable().optional(),
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

/* ------------------------- Helpers ------------------------- */

function toDecimalFields<T extends Record<string, unknown>>(
  data: T,
  fields: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) {
    if (typeof out[f] === "number") out[f] = String(out[f]);
  }
  return out;
}

function generateOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AOC-${ymd}-${rand}`;
}

/* ------------------------- App router ------------------------- */

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  materials: router({
    list: protectedProcedure.query(() => db.listMaterials()),
    critical: protectedProcedure.query(() => db.listCriticalMaterials()),
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
  }),

  products: router({
    list: protectedProcedure.query(() => db.listProducts()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getProduct(input.id)),
    create: protectedProcedure.input(productInput).mutation(({ input }) =>
      db.createProduct(toDecimalFields(input, ["salePrice", "discountPercent", "packagingCost", "shippingCost"]) as never),
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: productInput.partial() }))
      .mutation(({ input }) =>
        db.updateProduct(input.id, toDecimalFields(input.data, ["salePrice", "discountPercent", "packagingCost", "shippingCost"]) as never),
      ),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteProduct(input.id)),
  }),

  formula: router({
    list: protectedProcedure.input(z.object({ productId: z.number() })).query(({ input }) => db.listFormulaItems(input.productId)),
    add: protectedProcedure
      .input(z.object({ productId: z.number(), materialId: z.number(), qty: z.number().positive(), note: z.string().optional() }))
      .mutation(({ input }) => db.addFormulaItem(input.productId, input.materialId, input.qty, input.note)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), qty: z.number().positive(), note: z.string().optional() }))
      .mutation(({ input }) => db.updateFormulaItem(input.id, input.qty, input.note)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteFormulaItem(input.id)),
  }),

  orders: router({
    list: protectedProcedure.query(() => db.listOrders()),
    items: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(({ input }) => db.listOrderItems(input.orderId)),
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
    create: protectedProcedure.input(orderInput).mutation(async ({ input }) => {
      const { items, ...order } = input;
      if (items?.length) {
        order.totalAmount = itemsTotal(items);
        order.itemsSummary = summarizeItems(items);
      }
      const id = await db.createOrder({
        ...(toDecimalFields(order, ["totalAmount"]) as never as object),
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
        await db.updateOrder(input.id, toDecimalFields(order, ["totalAmount"]) as never);
      }),
    setStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["new", "production", "ready", "done"]) }))
      .mutation(({ input }) => db.updateOrder(input.id, { status: input.status })),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteOrder(input.id)),
  }),

  suppliers: router({
    list: protectedProcedure.query(() => db.listSuppliers()),
    create: protectedProcedure.input(supplierInput).mutation(({ input }) => db.createSupplier(input as never)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: supplierInput.partial() }))
      .mutation(({ input }) => db.updateSupplier(input.id, input.data as never)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteSupplier(input.id)),
  }),

  campaigns: router({
    list: protectedProcedure.query(() => db.listCampaigns()),
    upcoming: protectedProcedure.query(() => db.upcomingCampaigns(30)),
    create: protectedProcedure.input(campaignInput).mutation(({ input }) =>
      db.createCampaign(toDecimalFields(input, ["discountPercent"]) as never),
    ),
    update: protectedProcedure
      .input(z.object({ id: z.number(), data: campaignInput.partial() }))
      .mutation(({ input }) => db.updateCampaign(input.id, toDecimalFields(input.data, ["discountPercent"]) as never)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCampaign(input.id)),
  }),

  marketing: router({
    history: protectedProcedure.query(() => db.listMarketingTexts()),
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
  }),

  dashboard: router({
    summary: protectedProcedure.query(async () => {
      const [today, statusCounts, critical, upcoming] = await Promise.all([
        db.countOrdersToday(),
        db.orderStatusCounts(),
        db.listCriticalMaterials(),
        db.upcomingCampaigns(30),
      ]);
      return { today, statusCounts, critical, upcoming };
    }),
  }),
});

export type AppRouter = typeof appRouter;
