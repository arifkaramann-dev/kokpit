import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows } from "./orderUtils";
import { extractInvoice } from "./_core/claude";
import { executeAssistantCommand, generateOrderNo } from "./assistant";
import { buildSaleTitle, deriveCombos, parseSetCount } from "./productUtils";
import { syncTrendyolOrders } from "./trendyol";
import { marketplaceStatus, syncAllMarketplaces } from "./marketplace";

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
  labelSize: z.string().nullable().optional(),
  labelText: z.string().nullable().optional(),
  usageGuide: z.string().nullable().optional(),
  safetyNotes: z.string().nullable().optional(),
  extraInfo: z.string().nullable().optional(),
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
  // Elden/dışarıdan satış girişleri doğrudan "Tamamlandı" olarak eklenebilir.
  status: z.enum(["new", "production", "ready", "done"]).optional(),
  // Kalem listesi gönderilirse toplam tutar ve özet bu satırlardan türetilir.
  items: z.array(orderItemInput).optional(),
});

export { itemsTotal, summarizeItems } from "./orderUtils";

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
          const id = await db.createProduct({
            parentId: parent.id,
            name: buildSaleTitle(parent.name, combo.use, combo.packaging, combo.color, combo.set),
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
    // Toplu zam/indirim: tüm ürünlerin (veya bir serinin) fiyatı yüzdeyle güncellenir.
    bulkPrice: protectedProcedure
      .input(z.object({ percent: z.number().min(-90).max(500), series: z.string().nullable().optional() }))
      .mutation(({ input }) => db.bulkUpdatePrices(input.percent, input.series ?? null)),
    images: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => db.getProductImages(input.productId)),
    setImage: protectedProcedure
      .input(z.object({ productId: z.number(), kind: z.enum(["main", "packaging", "usage"]), data: z.string().min(1) }))
      .mutation(({ input }) => db.setProductImage(input.productId, input.kind, input.data)),
    deleteImage: protectedProcedure
      .input(z.object({ productId: z.number(), kind: z.enum(["main", "packaging", "usage"]) }))
      .mutation(({ input }) => db.deleteProductImage(input.productId, input.kind)),
  }),

  production: router({
    // Üretim kaydı: reçete × adet kadar hammadde stoktan düşülür (hareket notuyla).
    produce: protectedProcedure
      .input(z.object({ productId: z.number(), qty: z.number().positive(), force: z.boolean().default(false) }))
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
        return { deducted: formula.length, missing };
      }),
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
    // Hangi pazaryerinin bağlı olduğunu / hangi ayarın eksik olduğunu döner.
    marketplaceStatus: protectedProcedure.query(() => marketplaceStatus()),
    // Yapılandırılmış tüm pazaryerlerinden tek seferde çeker; her biri için sonuç döner.
    syncAll: protectedProcedure.mutation(() => syncAllMarketplaces()),
    // Aynı sipariş numaralı mükerrer kayıtları temizler (eski yarış durumu artığı).
    dedupe: protectedProcedure.mutation(() => db.dedupeOrders()),
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

  dev: router({
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
          salePrice: project.salePrice,
          packagingCost: project.packagingCost,
          shippingCost: project.shippingCost,
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
  }),

  assistant: router({
    // Sesli/serbest metin komutu: Claude niyeti çözer, sunucu uygular.
    // WhatsApp webhook'u da aynı beyni kullanır (server/assistant.ts).
    command: protectedProcedure
      .input(z.object({ transcript: z.string().min(2) }))
      .mutation(async ({ input }) => {
        try {
          return await executeAssistantCommand(input.transcript);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Komut anlaşılamadı",
          });
        }
      }),
  }),

  settings: router({
    // Şirket/fatura bilgileri (unvan, adres, vergi no, IBAN, KDV oranı vb.).
    get: protectedProcedure.query(() => db.getSettings()),
    save: protectedProcedure
      .input(z.record(z.string(), z.string()))
      .mutation(({ input }) => db.setSettings(input)),
    nextInvoiceNo: protectedProcedure.mutation(() => db.nextInvoiceNo()),
  }),

  tasks: router({
    list: protectedProcedure.query(() => db.listTasks()),
    create: protectedProcedure
      .input(z.object({ kind: z.enum(["eksik", "gorev"]), title: z.string().min(1), note: z.string().nullable().optional() }))
      .mutation(({ input }) => db.createTask(input)),
    setStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["open", "done"]) }))
      .mutation(({ input }) => db.setTaskStatus(input.id, input.status)),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTask(input.id)),
  }),

  templates: router({
    list: protectedProcedure.query(() => db.listTemplates()),
    create: protectedProcedure
      .input(
        z.object({
          kind: z.enum(["etiket_boyutu", "etiket_yazisi", "kilavuz", "guvenlik", "ambalaj", "renk", "set_paket", "hammadde_kategori", "uygulama_yontemi", "kuruma_suresi", "kat_sayisi", "test_sonucu"]),
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
  }),

  purchases: router({
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
  }),

  report: router({
    data: protectedProcedure.query(() => db.reportData()),
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
  }),

  dashboard: router({
    summary: protectedProcedure.query(async () => {
      const [today, statusCounts, critical, upcoming, openTasks] = await Promise.all([
        db.countOrdersToday(),
        db.orderStatusCounts(),
        db.listCriticalMaterials(),
        db.upcomingCampaigns(30),
        db.listTasks(undefined, "open"),
      ]);
      return { today, statusCounts, critical, upcoming, openTasks };
    }),
  }),
});

export type AppRouter = typeof appRouter;
