import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accounts,
  campaigns,
  cheques,
  customers,
  devProjects,
  devTrialItems,
  devTrials,
  expenses,
  formulaItems,
  transactions,
  InsertAccount,
  InsertCheque,
  InsertCustomer,
  InsertDevProject,
  InsertExpense,
  InsertMaterial,
  InsertTransaction,
  InsertOrder,
  InsertOrderItem,
  InsertProduct,
  InsertUser,
  marketingTexts,
  marketplaceQuestions,
  InsertMarketplaceQuestion,
  crmOpportunities,
  InsertCrmOpportunity,
  materials,
  notifications,
  orderItems,
  orderEvents,
  orders,
  products,
  productImages,
  productMovements,
  productSeries,
  InsertProductSeries,
  productGenerations,
  InsertProductGeneration,
  productionRuns,
  purchaseItems,
  purchases,
  quoteItems,
  quotes,
  InsertQuote,
  InsertQuoteItem,
  settings,
  tasks,
  templates,
  stockMovements,
  suppliers,
  users,
  whatsappAuth,
  // Ürün mimarisi v3
  colors,
  contentBlocks,
  productFamilies,
  packagings,
  packagingInputs,
  useCases,
  useCaseChannelCategories,
  seriesPackagings,
  seriesFamilies,
  formulas,
  formulaInputs,
  masterProducts,
  listings,
  listingImages,
  masterImages,
  channelAttributes,
  channelAttributeValues,
  materialReservations,
  salesChannels,
  channelListings,
  InsertColor,
  InsertProductFamily,
  InsertPackaging,
  InsertUseCase,
  InsertFormula,
  InsertFormulaInput,
  InsertMasterProduct,
  InsertListing,
  InsertChannelListing,
} from "../drizzle/schema";
import { resolveProductIdForItem } from "./orderUtils";
import { isTokenRevoked } from "./authUtils";
import {
  accountBalance,
  collectionTotal,
  customerBalancesFrom,
  paymentStatusFor,
  supplierBalancesFrom,
  vatSummarySince,
} from "./financeUtils";
import { ENV } from "./_core/env";
import { parseChannelPrices, type MarketplaceChannel } from "@shared/pricing";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/* ------------------------- Materials (Hammadde) ------------------------- */

export async function listMaterials() {
  const db = await requireDb();
  return db.select().from(materials).orderBy(materials.category, materials.name);
}

export async function createMaterial(data: InsertMaterial) {
  const db = await requireDb();
  const [result] = await db.insert(materials).values(data);
  return result.insertId;
}

export async function updateMaterial(id: number, data: Partial<InsertMaterial>) {
  const db = await requireDb();
  await db.update(materials).set(data).where(eq(materials.id, id));
}

export async function deleteMaterial(id: number) {
  const db = await requireDb();
  await db.delete(formulaItems).where(eq(formulaItems.materialId, id));
  await db.delete(stockMovements).where(eq(stockMovements.materialId, id));
  await db.delete(materials).where(eq(materials.id, id));
}

export async function adjustStock(materialId: number, type: "in" | "out", qty: number, note?: string) {
  const db = await requireDb();
  const delta = type === "in" ? qty : -qty;
  await db.insert(stockMovements).values({ materialId, type, qty: String(qty), note });
  await db
    .update(materials)
    .set({ stockQty: sql`GREATEST(${materials.stockQty} + ${delta}, 0)` })
    .where(eq(materials.id, materialId));
}

export async function listStockMovements(materialId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.materialId, materialId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(50);
}

export async function listCriticalMaterials() {
  const db = await requireDb();
  return db
    .select()
    .from(materials)
    .where(sql`${materials.stockQty} <= ${materials.criticalQty}`)
    .orderBy(materials.name);
}

/* ------------------------- Products (Ürünler) ------------------------- */

export async function listProducts() {
  const db = await requireDb();
  return db.select().from(products).orderBy(products.parentId, products.name);
}

export async function getProduct(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0];
}

export async function createProduct(data: InsertProduct) {
  const db = await requireDb();
  const [result] = await db.insert(products).values(data);
  return result.insertId;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await requireDb();
  // Stok, ürün kartından mutlak değerle değiştirildiyse aradaki fark hareket
  // defterine işlenir; böylece productMovements ile stockQty sessizce ayrışmaz.
  if (data.stockQty !== undefined && data.stockQty !== null) {
    const current = await getProduct(id);
    const delta = data.stockQty - (current?.stockQty ?? 0);
    if (current && delta !== 0) {
      await db.insert(productMovements).values({
        productId: id,
        type: delta > 0 ? "in" : "out",
        qty: String(Math.abs(delta)),
        note: "Elle düzeltme (ürün kartı)",
      });
    }
  }
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await requireDb();
  // Türevleri, formülleri, görselleri ve mamul stok hareketlerini de temizle —
  // özellikle görseller (base64, MEDIUMTEXT) öksüz kalırsa veritabanını şişirir.
  const children = await db.select({ id: products.id }).from(products).where(eq(products.parentId, id));
  for (const pid of [...children.map(c => c.id), id]) {
    await db.delete(formulaItems).where(eq(formulaItems.productId, pid));
    await db.delete(productImages).where(eq(productImages.productId, pid));
    await db.delete(productMovements).where(eq(productMovements.productId, pid));
  }
  await db.delete(products).where(eq(products.parentId, id));
  await db.delete(products).where(eq(products.id, id));
}

/* ------------------------- Formula (Formül Defteri) ------------------------- */

export async function listFormulaItems(productId: number) {
  const db = await requireDb();
  return db
    .select({
      id: formulaItems.id,
      productId: formulaItems.productId,
      materialId: formulaItems.materialId,
      qty: formulaItems.qty,
      note: formulaItems.note,
      materialName: materials.name,
      materialUnit: materials.unit,
      materialUnitCost: materials.unitCost,
      materialCategory: materials.category,
    })
    .from(formulaItems)
    .leftJoin(materials, eq(formulaItems.materialId, materials.id))
    .where(eq(formulaItems.productId, productId));
}

/** Tüm reçete kalemleri (hafif küme): ürün başına üretilebilirlik hesabı için. */
export async function listAllFormulaItems() {
  const db = await requireDb();
  return db
    .select({
      productId: formulaItems.productId,
      materialId: formulaItems.materialId,
      qty: formulaItems.qty,
    })
    .from(formulaItems);
}

export async function addFormulaItem(productId: number, materialId: number, qty: number, note?: string) {
  const db = await requireDb();
  const [result] = await db.insert(formulaItems).values({ productId, materialId, qty: String(qty), note });
  return result.insertId;
}

export async function updateFormulaItem(id: number, qty: number, note?: string) {
  const db = await requireDb();
  await db.update(formulaItems).set({ qty: String(qty), note }).where(eq(formulaItems.id, id));
}

export async function deleteFormulaItem(id: number) {
  const db = await requireDb();
  await db.delete(formulaItems).where(eq(formulaItems.id, id));
}

/**
 * Kaynak ürünün reçetesini hedefe kopyalar (hedefin mevcut kalemleri silinir).
 * Çarpan set/paket türevleri için: miktarlar multiplier ile çarpılır.
 */
export async function copyFormula(fromProductId: number, toProductId: number, multiplier = 1) {
  const db = await requireDb();
  const source = await listFormulaItems(fromProductId);
  if (source.length === 0) return { copied: 0 };
  await db.delete(formulaItems).where(eq(formulaItems.productId, toProductId));
  for (const item of source) {
    await addFormulaItem(
      toProductId,
      item.materialId,
      (parseFloat(String(item.qty)) || 0) * multiplier,
      item.note ?? undefined,
    );
  }
  return { copied: source.length };
}

/** Hammaddenin geçtiği ürün reçeteleri (kritik stok "neyi etkiliyor" analizi). */
export async function listMaterialUsage(materialId: number) {
  const db = await requireDb();
  return db
    .select({
      productId: formulaItems.productId,
      qty: formulaItems.qty,
      productName: products.name,
      parentId: products.parentId,
    })
    .from(formulaItems)
    .leftJoin(products, eq(formulaItems.productId, products.id))
    .where(eq(formulaItems.materialId, materialId))
    .orderBy(products.name);
}

/* ------------------------- Orders (Siparişler) ------------------------- */

export async function listOrders(limit?: number) {
  const db = await requireDb();
  const q = db.select().from(orders).orderBy(desc(orders.sortOrder), desc(orders.createdAt));
  // limit verilmezse davranış eskisi gibi (tam liste) — finans/senkron yolları tam veri ister.
  return limit && limit > 0 ? q.limit(limit) : q;
}

/* ------------------------- Sipariş olay defteri ------------------------- */

const ORDER_STATUS_TR: Record<string, string> = {
  new: "Yeni",
  production: "Üretimde",
  ready: "Hazır",
  done: "Tamamlandı",
  cancelled: "İptal",
};
const PAYMENT_STATUS_TR: Record<string, string> = {
  unpaid: "Bekliyor",
  partial: "Kısmi",
  paid: "Ödendi",
};
const MP_CHANNELS = new Set(["trendyol", "hepsiburada", "n11", "ciceksepeti", "pazaryeri"]);

/** Sipariş zaman çizgisine bir olay ekler (denetim izi). Hata sipariş akışını bozmaz. */
export async function logOrderEvent(
  orderId: number,
  type: "created" | "synced" | "status" | "payment" | "cargo" | "note",
  message: string,
  meta?: Record<string, unknown>,
) {
  try {
    const db = await requireDb();
    await db.insert(orderEvents).values({
      orderId,
      type,
      message,
      meta: meta ? JSON.stringify(meta) : null,
    });
  } catch {
    /* olay kaydı ikincildir — asıl mutasyonu asla düşürmez */
  }
}

/** Bir siparişin olaylarını en yeniden eskiye döner. */
export async function listOrderEvents(orderId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(desc(orderEvents.createdAt));
}

export async function createOrder(data: InsertOrder) {
  const db = await requireDb();
  // Cari bağ: müşteri adı CRM'de kayıtlıysa ID ile bağla (isim değişse de ekstre kopmaz).
  if (data.customerId == null && data.customerName) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  // Adres/telefon boşsa cari kartından tamamla — kayıtlı müşterinin adresi kargo
  // etiketine ve faturaya taşınır (siparişte elle girilmesine gerek kalmaz).
  if (data.customerId != null && (!data.customerAddress?.trim() || !data.customerPhone?.trim())) {
    const contact = await getCustomerById(data.customerId);
    if (contact) {
      if (!data.customerAddress?.trim() && contact.address) data = { ...data, customerAddress: contact.address };
      if (!data.customerPhone?.trim() && contact.phone) data = { ...data, customerPhone: contact.phone };
    }
  }
  const [result] = await db.insert(orders).values(data);
  const id = Number(result.insertId);
  // İlk olay: elle mi açıldı yoksa pazaryerinden mi alındı?
  const ch = String(data.channel ?? "").toLowerCase();
  if (MP_CHANNELS.has(ch)) {
    await logOrderEvent(id, "synced", `Pazaryerinden alındı · ${data.channel}`);
  } else {
    await logOrderEvent(id, "created", `Sipariş oluşturuldu${data.channel ? ` · ${data.channel}` : ""}`);
  }
  return result.insertId;
}

export async function updateOrder(id: number, data: Partial<InsertOrder>) {
  const db = await requireDb();
  // Müşteri adı değiştirildiyse cari bağı da yeni ada göre tazele.
  if (data.customerName !== undefined && data.customerId === undefined) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  // İptal geçişleri mamul stoğu yönetir: iptale girişte kalemler iade edilir,
  // iptalden çıkışta yeniden düşülür. (Tüm durum değişimleri bu fonksiyondan
  // geçer: pano, asistan, pazaryeri senkronu.)
  // Durum/kargo/ödeme değişimini olay defterine yazmak için eski hâli çekeriz.
  const needsOld =
    data.status !== undefined ||
    data.cargoTrackingNumber !== undefined ||
    data.paymentStatus !== undefined;
  const old = needsOld ? await getOrder(id) : null;

  if (data.status !== undefined && old && old.status !== data.status) {
    const items = await db
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    if (old.status !== "cancelled" && data.status === "cancelled") {
      await applyItemsStock(items, "in", `İptal/iade: ${old.orderNo}`, id);
    } else if (old.status === "cancelled" && data.status !== "cancelled") {
      await applyItemsStock(items, "out", `İptal geri alındı: ${old.orderNo}`, id);
    }
  }
  await db.update(orders).set(data).where(eq(orders.id, id));

  // Olay kaydı (mutasyon başarılıysa) — zaman çizgisini besler.
  if (old) {
    if (data.status !== undefined && old.status !== data.status) {
      await logOrderEvent(
        id,
        "status",
        `Durum: ${ORDER_STATUS_TR[old.status] ?? old.status} → ${ORDER_STATUS_TR[data.status] ?? data.status}`,
        { from: old.status, to: data.status },
      );
    }
    if (
      data.cargoTrackingNumber !== undefined &&
      data.cargoTrackingNumber &&
      data.cargoTrackingNumber !== old.cargoTrackingNumber
    ) {
      await logOrderEvent(id, "cargo", `Kargo takip no: ${data.cargoTrackingNumber}`);
    }
    if (data.paymentStatus !== undefined && old.paymentStatus !== data.paymentStatus) {
      await logOrderEvent(
        id,
        "payment",
        `Ödeme: ${PAYMENT_STATUS_TR[old.paymentStatus] ?? old.paymentStatus} → ${PAYMENT_STATUS_TR[data.paymentStatus] ?? data.paymentStatus}`,
        { from: old.paymentStatus, to: data.paymentStatus },
      );
    }
  }
}

export async function deleteOrder(id: number) {
  const db = await requireDb();
  // Silinen siparişin ürün bağlı kalemleri stoğa iade edilir (iptal değilse —
  // iptalde iade zaten yapılmıştır).
  const order = await getOrder(id);
  if (order && order.status !== "cancelled") {
    const items = await db
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    await applyItemsStock(items, "in", `Sipariş silindi: ${order.orderNo}`, id);
  }
  await db.delete(orderItems).where(eq(orderItems.orderId, id));
  await db.delete(orders).where(eq(orders.id, id));
}

export async function getOrder(id: number) {
  const db = await requireDb();
  const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return result[0];
}

export async function getOrderByOrderNo(orderNo: string) {
  const db = await requireDb();
  const result = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
  return result[0];
}

/** Siparişin ödeme durumu/tutarı/yöntemini günceller. */
export async function setOrderPayment(
  id: number,
  data: { paymentStatus: "unpaid" | "partial" | "paid"; paidAmount: string; paymentMethod: string | null },
) {
  const db = await requireDb();
  const old = await getOrder(id);
  await db.update(orders).set(data).where(eq(orders.id, id));
  if (old && old.paymentStatus !== data.paymentStatus) {
    const method = data.paymentMethod ? ` · ${data.paymentMethod}` : "";
    await logOrderEvent(
      id,
      "payment",
      `Ödeme: ${PAYMENT_STATUS_TR[old.paymentStatus] ?? old.paymentStatus} → ${PAYMENT_STATUS_TR[data.paymentStatus] ?? data.paymentStatus}${method}`,
      { from: old.paymentStatus, to: data.paymentStatus, paidAmount: data.paidAmount },
    );
  }
}

/* ------------------------- Müşteriler (CRM) ------------------------- */

export async function listCustomers() {
  const db = await requireDb();
  return db.select().from(customers).orderBy(customers.name);
}

/**
 * Cari ID çözümleme (V2 göçü): isimden müşteri/tedarikçi ID'si bulur.
 * Türkçe küçük harf + trim ile eşleşir; birden fazla aynı isim varsa en
 * eski kayıt (en küçük id) esas alınır. Bulunamazsa null — kayıt isimle
 * yaşamaya devam eder (pazaryeri müşterisi gibi CRM dışı adlar için normal).
 */
const trKey = (n: string) => n.trim().toLocaleLowerCase("tr-TR");

export async function resolveCustomerIdByName(name: string | null | undefined): Promise<number | null> {
  if (!name?.trim()) return null;
  const db = await requireDb();
  const rows = await db.select({ id: customers.id, name: customers.name }).from(customers);
  const needle = trKey(name);
  const hits = rows.filter(c => trKey(c.name) === needle).sort((a, b) => a.id - b.id);
  return hits[0]?.id ?? null;
}

export async function resolveSupplierIdByName(name: string | null | undefined): Promise<number | null> {
  if (!name?.trim()) return null;
  const db = await requireDb();
  const rows = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const needle = trKey(name);
  const hits = rows.filter(s => trKey(s.name) === needle).sort((a, b) => a.id - b.id);
  return hits[0]?.id ?? null;
}

/** Tek müşteri kaydını ID ile getirir (kargo/fatura için adres-telefon kaynağı). */
export async function getCustomerById(id: number | null | undefined) {
  if (id == null) return null;
  const db = await requireDb();
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row ?? null;
}

export async function createCustomer(data: InsertCustomer) {
  const db = await requireDb();
  const [res] = await db.insert(customers).values(data);
  return Number(res.insertId);
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const db = await requireDb();
  await db.update(customers).set(data).where(eq(customers.id, id));
}

export async function deleteCustomer(id: number) {
  const db = await requireDb();
  await db.delete(customers).where(eq(customers.id, id));
}

/* ------------------------- Giderler ------------------------- */

export async function listExpenses(limit = 200) {
  const db = await requireDb();
  return db.select().from(expenses).orderBy(desc(expenses.expenseDate)).limit(limit);
}

export async function createExpense(data: InsertExpense) {
  const db = await requireDb();
  const [res] = await db.insert(expenses).values(data);
  return Number(res.insertId);
}

export async function updateExpense(id: number, data: Partial<InsertExpense>) {
  const db = await requireDb();
  await db.update(expenses).set(data).where(eq(expenses.id, id));
}

export async function deleteExpense(id: number) {
  const db = await requireDb();
  await db.delete(expenses).where(eq(expenses.id, id));
}

/* ------------------------- Kasa & Banka + Cari (ön muhasebe) ------------------------- */

const toNum = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;

/** Hesapları, güncel bakiyeleriyle (açılış + gelen − giden) birlikte döner. */
export async function listAccounts() {
  const db = await requireDb();
  const [accs, txns] = await Promise.all([
    db.select().from(accounts).orderBy(accounts.name),
    db.select({ accountId: transactions.accountId, direction: transactions.direction, amount: transactions.amount }).from(transactions),
  ]);
  return accs.map(a => ({
    ...a,
    balance: accountBalance(a.openingBalance, txns.filter(t => t.accountId === a.id)),
  }));
}

export async function createAccount(data: InsertAccount) {
  const db = await requireDb();
  const [res] = await db.insert(accounts).values(data);
  return Number(res.insertId);
}

export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await requireDb();
  await db.update(accounts).set(data).where(eq(accounts.id, id));
}

export async function deleteAccount(id: number) {
  const db = await requireDb();
  await db.update(transactions).set({ accountId: null }).where(eq(transactions.accountId, id));
  await db.delete(accounts).where(eq(accounts.id, id));
}

/** Para/cari hareketlerini (en yeni önce) döner; müşteri/hesaba göre süzülebilir. */
export async function listTransactions(filter?: { customerName?: string; accountId?: number; limit?: number }) {
  const db = await requireDb();
  const conds = [];
  if (filter?.customerName) {
    // ID-öncelikli süzme: kayıtlı müşteriyse ID'yle bağlı tüm hareketler gelir.
    const customerId = await resolveCustomerIdByName(filter.customerName);
    conds.push(
      customerId != null
        ? or(eq(transactions.customerId, customerId), and(isNull(transactions.customerId), eq(transactions.customerName, filter.customerName)))!
        : eq(transactions.customerName, filter.customerName),
    );
  }
  if (filter?.accountId) conds.push(eq(transactions.accountId, filter.accountId));
  // Sıralama + limit SQL'de: tablo büyüdükçe tüm satırları çekip JS'te dilimlemeyelim.
  const base = db.select().from(transactions);
  const filtered = conds.length ? base.where(and(...conds)) : base;
  return filtered.orderBy(desc(transactions.txnDate), desc(transactions.id)).limit(filter?.limit ?? 300);
}

/**
 * Hareket ekler. Tahsilat/ödeme bir siparişe bağlıysa (orderId) o siparişin
 * ödenen tutarı ve ödeme durumu otomatik güncellenir (mevcut model korunur).
 */
export async function createTransaction(data: InsertTransaction) {
  const db = await requireDb();
  // Cari bağ: isim varsa ID'ye çevirip birlikte sakla (isim görüntü/yedek kalır).
  if (data.customerId == null && data.customerName) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  if (data.supplierId == null && data.supplierName) {
    data = { ...data, supplierId: await resolveSupplierIdByName(data.supplierName) };
  }
  const [res] = await db.insert(transactions).values(data);
  if (data.orderId && data.category === "tahsilat" && data.direction === "in") {
    const [ord] = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (ord) {
      const collected = collectionTotal(
        await db
          .select({ amount: transactions.amount, direction: transactions.direction, category: transactions.category })
          .from(transactions)
          .where(eq(transactions.orderId, data.orderId)),
      );
      const status = paymentStatusFor(collected, toNum(ord.totalAmount));
      await db.update(orders).set({ paidAmount: String(Math.max(0, collected)), paymentStatus: status }).where(eq(orders.id, data.orderId));
    }
  }
  return Number(res.insertId);
}

export async function deleteTransaction(id: number) {
  const db = await requireDb();
  await db.delete(transactions).where(eq(transactions.id, id));
}

/** İki hesap arasında transfer: kaynaktan çıkış + hedefe giriş (iki hareket). */
export async function transferBetweenAccounts(fromId: number, toId: number, amount: number, note: string | null) {
  const db = await requireDb();
  const [from] = await db.select().from(accounts).where(eq(accounts.id, fromId)).limit(1);
  const [to] = await db.select().from(accounts).where(eq(accounts.id, toId)).limit(1);
  const now = new Date();
  await db.insert(transactions).values({
    txnDate: now, accountId: fromId, direction: "out", amount: String(amount), category: "transfer",
    description: `Transfer → ${to?.name ?? ""}`, note,
  } as never);
  await db.insert(transactions).values({
    txnDate: now, accountId: toId, direction: "in", amount: String(amount), category: "transfer",
    description: `Transfer ← ${from?.name ?? ""}`, note,
  } as never);
}

/**
 * Müşteri 360° profili: sipariş + teklif geçmişi ve özet istatistikler.
 * ID-öncelikli eşleşme (ledger ile aynı mantık): kayıtlıysa ID ile TÜM
 * kayıtlar, değilse isimle. Ekstre (customerLedger) finansı verir; bu ise
 * satış/etkileşim tarafını verir.
 */
export async function customerProfile(name: string) {
  const db = await requireDb();
  const customerId = await resolveCustomerIdByName(name);
  const ordCond =
    customerId != null
      ? or(eq(orders.customerId, customerId), and(isNull(orders.customerId), eq(orders.customerName, name)))
      : eq(orders.customerName, name);
  const qCond =
    customerId != null
      ? or(eq(quotes.customerId, customerId), and(isNull(quotes.customerId), eq(quotes.customerName, name)))
      : eq(quotes.customerName, name);

  const [ords, qts] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        totalAmount: orders.totalAmount,
        paymentStatus: orders.paymentStatus,
        channel: orders.channel,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(ordCond)
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select({
        id: quotes.id,
        quoteNo: quotes.quoteNo,
        status: quotes.status,
        totalAmount: quotes.totalAmount,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(qCond)
      .orderBy(desc(quotes.createdAt))
      .limit(50),
  ]);

  const active = ords.filter(o => o.status !== "cancelled");
  const totalSpent = active.reduce((s, o) => s + (parseFloat(String(o.totalAmount)) || 0), 0);
  return {
    orders: ords,
    quotes: qts,
    stats: {
      orderCount: active.length,
      totalSpent,
      lastOrderAt: ords[0]?.createdAt ?? null,
      openQuotes: qts.filter(q => q.status === "sent" || q.status === "draft").length,
    },
  };
}

/**
 * Tüm müşterilerin cari bakiyesi (küçük harf ada göre): sipariş toplamı (borç)
 * − tahsilat (alacak). Pozitif = müşteri bize borçlu.
 */
export async function customerBalances(): Promise<Record<string, number>> {
  const db = await requireDb();
  const [ords, txns, custs] = await Promise.all([
    db.select({ name: orders.customerName, customerId: orders.customerId, total: orders.totalAmount, status: orders.status }).from(orders),
    db.select({ name: transactions.customerName, customerId: transactions.customerId, direction: transactions.direction, amount: transactions.amount, category: transactions.category }).from(transactions),
    db.select({ id: customers.id, name: customers.name }).from(customers),
  ]);
  // ID'li kayıtlar müşterinin GÜNCEL adı altında toplanır (ad değişse de cari
  // bölünmez); ID'siz (CRM dışı) kayıtlar kayıtlı isimle yaşar. Saf mantık
  // financeUtils'te (birim testli).
  return customerBalancesFrom(ords, txns, custs);
}

/**
 * Bir müşterinin cari ekstresi: siparişleri (borç) + tahsilatları (alacak/ödeme)
 * tarih sırasıyla, yürüyen bakiyeyle. Bakiye > 0 → müşteri bize borçlu.
 */
export async function customerLedger(name: string) {
  const db = await requireDb();
  // ID-öncelikli eşleşme: müşteri kayıtlıysa ID ile bağlı TÜM hareketler gelir
  // (geçmişte farklı yazılmış adlar dahil); ID'siz eski kayıtlar isimle yakalanır.
  const customerId = await resolveCustomerIdByName(name);
  const orderCond = customerId != null
    ? or(eq(orders.customerId, customerId), and(isNull(orders.customerId), eq(orders.customerName, name)))
    : eq(orders.customerName, name);
  const txnCond = customerId != null
    ? or(eq(transactions.customerId, customerId), and(isNull(transactions.customerId), eq(transactions.customerName, name)))
    : eq(transactions.customerName, name);
  const [ords, txns] = await Promise.all([
    db.select().from(orders).where(orderCond),
    db.select().from(transactions).where(txnCond),
  ]);
  type Entry = { date: Date; label: string; debit: number; credit: number; ref: string; type: "order" | "txn"; id: number };
  const entries: Entry[] = [];
  for (const o of ords) {
    if (o.status === "cancelled") continue; // iptal/iade cari ekstreye girmez
    entries.push({ date: new Date(o.createdAt), label: "Sipariş", debit: toNum(o.totalAmount), credit: 0, ref: o.orderNo, type: "order", id: o.id });
  }
  for (const t of txns) {
    const isIn = t.direction === "in";
    entries.push({
      date: new Date(t.txnDate),
      label: t.category === "tahsilat" ? "Tahsilat" : t.description || t.category,
      debit: isIn ? 0 : toNum(t.amount),
      credit: isIn ? toNum(t.amount) : 0,
      ref: t.orderNo ?? "",
      type: "txn",
      id: t.id,
    });
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  let running = 0;
  const rows = entries.map(e => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  return { rows, balance: running };
}

/**
 * KDV raporu: satış KDV'si (siparişler, KDV dahil kabul) − alış KDV'si
 * (alış faturaları) = ödenecek KDV. Bu ay ve bu yıl için ayrı hesaplar.
 */
export async function vatReport() {
  const db = await requireDb();
  const [vatRow, ords, purs] = await Promise.all([
    db.select().from(settings).where(eq(settings.key, "vatRate")).limit(1),
    db.select({ total: orders.totalAmount, date: orders.createdAt, status: orders.status }).from(orders),
    db.select({ total: purchases.totalAmount, date: purchases.invoiceDate, created: purchases.createdAt }).from(purchases),
  ]);
  const rate = parseFloat(vatRow[0]?.value ?? "") || 20;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  // Saf hesap financeUtils'te (birim testli); iptal/iade matraha girmez.
  return {
    rate,
    month: vatSummarySince(ords, purs, rate, monthStart),
    year: vatSummarySince(ords, purs, rate, yearStart),
  };
}

/**
 * Tedarikçi cari bakiyeleri (küçük harf ada göre): alış faturaları (borç)
 * − tedarikçiye ödemeler. Pozitif = biz tedarikçiye borçluyuz.
 */
export async function supplierBalances(): Promise<Record<string, number>> {
  const db = await requireDb();
  const [purs, txns, sups] = await Promise.all([
    db.select({ name: purchases.supplierName, supplierId: purchases.supplierId, total: purchases.totalAmount }).from(purchases),
    db.select({ name: transactions.supplierName, supplierId: transactions.supplierId, direction: transactions.direction, amount: transactions.amount }).from(transactions),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
  ]);
  // Saf mantık financeUtils'te (birim testli).
  return supplierBalancesFrom(purs, txns, sups);
}

/** Tedarikçi cari ekstresi: alış faturaları (borç) + ödemeler (alacak) + bakiye. */
export async function supplierLedger(name: string) {
  const db = await requireDb();
  const supplierId = await resolveSupplierIdByName(name);
  const purCond = supplierId != null
    ? or(eq(purchases.supplierId, supplierId), and(isNull(purchases.supplierId), eq(purchases.supplierName, name)))
    : eq(purchases.supplierName, name);
  const txnCond = supplierId != null
    ? or(eq(transactions.supplierId, supplierId), and(isNull(transactions.supplierId), eq(transactions.supplierName, name)))
    : eq(transactions.supplierName, name);
  const [purs, txns] = await Promise.all([
    db.select().from(purchases).where(purCond),
    db.select().from(transactions).where(txnCond),
  ]);
  type Entry = { date: Date; label: string; debit: number; credit: number; ref: string; type: "purchase" | "txn"; id: number };
  const entries: Entry[] = [];
  for (const p of purs) {
    entries.push({ date: new Date((p.invoiceDate ?? p.createdAt) as never), label: "Alış Faturası", debit: toNum(p.totalAmount), credit: 0, ref: p.invoiceNo ?? "", type: "purchase", id: p.id });
  }
  for (const t of txns) {
    const isOut = t.direction === "out";
    entries.push({ date: new Date(t.txnDate), label: isOut ? "Ödeme" : t.description || t.category, debit: 0, credit: isOut ? toNum(t.amount) : -toNum(t.amount), ref: "", type: "txn", id: t.id });
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  let running = 0;
  const rows = entries.map(e => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  return { rows, balance: running };
}

/**
 * Nakit akışı raporu: kasa/banka hareketlerinden girişler/çıkışlar/net,
 * bu ay ve bu yıl için, ayrıca bu ayın kategori kırılımı.
 */
export async function cashflowReport() {
  const db = await requireDb();
  const rows = await db
    .select({ date: transactions.txnDate, direction: transactions.direction, amount: transactions.amount, category: transactions.category })
    .from(transactions);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  const sum = (since: number) => {
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (new Date(r.date).getTime() < since) continue;
      if (r.direction === "in") inflow += toNum(r.amount);
      else outflow += toNum(r.amount);
    }
    return { inflow, outflow, net: inflow - outflow };
  };

  // Bu ay kategori kırılımı (transfer hariç, iç hareket olduğundan).
  const catMap = new Map<string, { in: number; out: number }>();
  for (const r of rows) {
    if (new Date(r.date).getTime() < monthStart || r.category === "transfer") continue;
    const cur = catMap.get(r.category) ?? { in: 0, out: 0 };
    if (r.direction === "in") cur.in += toNum(r.amount);
    else cur.out += toNum(r.amount);
    catMap.set(r.category, cur);
  }
  const categories = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));

  return { month: sum(monthStart), year: sum(yearStart), categories };
}

/* ------------------------- Çek & Senet ------------------------- */

export async function listCheques() {
  const db = await requireDb();
  return db.select().from(cheques).orderBy(cheques.dueDate);
}

export async function createCheque(data: InsertCheque) {
  const db = await requireDb();
  const [res] = await db.insert(cheques).values(data);
  return Number(res.insertId);
}

export async function updateCheque(id: number, data: Partial<InsertCheque>) {
  const db = await requireDb();
  await db.update(cheques).set(data).where(eq(cheques.id, id));
}

export async function deleteCheque(id: number) {
  const db = await requireDb();
  await db.delete(cheques).where(eq(cheques.id, id));
}

/* ------------------------- Teklifler ------------------------- */

export async function listQuotes() {
  const db = await requireDb();
  return db.select().from(quotes).orderBy(desc(quotes.createdAt));
}

export async function getQuote(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return rows[0];
}

export async function createQuote(data: InsertQuote) {
  const db = await requireDb();
  // Cari bağ: müşteri kayıtlıysa ID ile bağla (siparişle aynı kural).
  if (data.customerId == null && data.customerName) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  const [res] = await db.insert(quotes).values(data);
  return Number(res.insertId);
}

export async function updateQuote(id: number, data: Partial<InsertQuote>) {
  const db = await requireDb();
  if (data.customerName !== undefined && data.customerId === undefined) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  await db.update(quotes).set(data).where(eq(quotes.id, id));
}

export async function deleteQuote(id: number) {
  const db = await requireDb();
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
  await db.delete(quotes).where(eq(quotes.id, id));
}

export async function listQuoteItems(quoteId: number) {
  const db = await requireDb();
  return db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(quoteItems.id);
}

/**
 * Teklif kalemlerini komple değiştirir. Siparişten farkı: teklif stok
 * YÜRÜTMEZ — ürün eşleşmesi yalnızca dönüşümde doğru kalem bağlansın diye
 * yapılır (barkod → ad, resolveProductIdForItem).
 */
export async function replaceQuoteItems(
  quoteId: number,
  items: (Omit<InsertQuoteItem, "quoteId"> & { barcode?: string | null })[],
) {
  const db = await requireDb();
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  if (items.length === 0) return;
  const refs = await db
    .select({ id: products.id, name: products.name, barcode: products.barcode })
    .from(products);
  const rows = items.map(({ barcode, ...item }) => ({
    ...item,
    productId: item.productId ?? resolveProductIdForItem({ productName: item.productName, barcode }, refs),
    quoteId,
  }));
  await db.insert(quoteItems).values(rows);
}

/** Ödenmemiş/kısmi ödenmiş siparişleri kalan borca göre döner (tahsilat takibi). */
export async function listUnpaidOrders(limit = 8) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      customerName: orders.customerName,
      totalAmount: orders.totalAmount,
      paidAmount: orders.paidAmount,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(sql`${orders.paymentStatus} <> 'paid' AND ${orders.status} <> 'cancelled'`);
  const num = (v: string | null) => parseFloat(v ?? "0") || 0;
  return rows
    .map(o => ({ ...o, due: Math.max(0, num(o.totalAmount) - num(o.paidAmount)) }))
    .filter(o => o.due > 0)
    .sort((a, b) => b.due - a.due)
    .slice(0, limit);
}

/**
 * Kokpit için finans özeti: tahsil edilecek (alacak) toplamı ve bu ayın
 * cirosu/gideri/net kârı. Gider = giderler + alış faturaları (hammadde).
 */
export async function financeSummary() {
  const db = await requireDb();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const num = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;

  const [orderRows, expenseRows, purchaseRows] = await Promise.all([
    db
      .select({ total: orders.totalAmount, paid: orders.paidAmount, status: orders.paymentStatus, orderStatus: orders.status, createdAt: orders.createdAt })
      .from(orders),
    db.select({ amount: expenses.amount, date: expenses.expenseDate }).from(expenses),
    db.select({ amount: purchases.totalAmount, date: purchases.createdAt }).from(purchases),
  ]);

  let receivables = 0;
  let monthRevenue = 0;
  for (const o of orderRows) {
    if (o.orderStatus === "cancelled") continue; // iptal/iade ciroya ve alacağa girmez
    if (o.status !== "paid") receivables += Math.max(0, num(o.total) - num(o.paid));
    if (o.createdAt && o.createdAt >= start) monthRevenue += num(o.total);
  }
  let monthExpense = 0;
  for (const e of expenseRows) if (e.date && e.date >= start) monthExpense += num(e.amount);
  for (const p of purchaseRows) if (p.date && p.date >= start) monthExpense += num(p.amount);

  // Kasa/banka toplam bakiyesi (açılış + gelen − giden).
  const accs = await listAccounts();
  const cashTotal = accs.reduce((s, a) => s + a.balance, 0);

  return {
    receivables,
    monthRevenue,
    monthExpense,
    monthNet: monthRevenue - monthExpense,
    cashTotal,
  };
}

/**
 * Dönem karşılaştırma: son `days` günlük pencere ile hemen öncesindeki aynı
 * uzunluktaki pencereyi kıyaslar (ciro, gider, net, sipariş adedi). Ciro
 * mantığı financeSummary ile birebir (iptal hariç, sipariş toplamı).
 */
export async function periodStats(days: number) {
  const db = await requireDb();
  const now = Date.now();
  const curStart = new Date(now - days * 86400000);
  const prevStart = new Date(now - 2 * days * 86400000);
  const num = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;

  const [orderRows, expenseRows, purchaseRows] = await Promise.all([
    db
      .select({ total: orders.totalAmount, orderStatus: orders.status, createdAt: orders.createdAt })
      .from(orders),
    db.select({ amount: expenses.amount, date: expenses.expenseDate }).from(expenses),
    db.select({ amount: purchases.totalAmount, date: purchases.createdAt }).from(purchases),
  ]);

  const windowStats = (from: Date, to: Date) => {
    let revenue = 0;
    let orderCount = 0;
    let expense = 0;
    for (const o of orderRows) {
      if (o.orderStatus === "cancelled") continue;
      if (o.createdAt && o.createdAt >= from && o.createdAt < to) {
        revenue += num(o.total);
        orderCount += 1;
      }
    }
    for (const e of expenseRows) if (e.date && e.date >= from && e.date < to) expense += num(e.amount);
    for (const p of purchaseRows) if (p.date && p.date >= from && p.date < to) expense += num(p.amount);
    return { revenue, expense, net: revenue - expense, orderCount };
  };

  return {
    days,
    current: windowStats(curStart, new Date(now)),
    previous: windowStats(prevStart, curStart),
  };
}

/**
 * Aynı sipariş numarasından birden fazla varsa (eski yarış durumundan kalma
 * mükerrerler) en eskisini (en küçük id) tutup diğerlerini siler. Silme
 * deleteOrder üzerinden yürür ki mükerrer kaydın düştüğü mamul stok geri gelsin
 * (yarışta her kopya kendi stok düşümünü yapmıştı).
 */
export async function dedupeOrders() {
  const db = await requireDb();
  const all = await db.select({ id: orders.id, orderNo: orders.orderNo }).from(orders);
  const keep = new Map<string, number>();
  for (const o of all) {
    const prev = keep.get(o.orderNo);
    if (prev === undefined || o.id < prev) keep.set(o.orderNo, o.id);
  }
  let removed = 0;
  for (const o of all) {
    if (keep.get(o.orderNo) !== o.id) {
      await deleteOrder(o.id);
      removed++;
    }
  }
  return { removed };
}

export async function listOrderItems(orderId: number) {
  const db = await requireDb();
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
}

/** Birden çok siparişin kalemleri tek sorguda (toplu içerik dökümü yazdırma için). */
export async function listOrderItemsBulk(orderIds: number[]) {
  if (orderIds.length === 0) return [];
  const db = await requireDb();
  return db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(orderItems.orderId, orderItems.id);
}

/**
 * Ürün bazlı satış özeti (son N gün): adet + ciro, iptal siparişler hariç.
 * Üretim önerisi (satış hızı) ve Ürün Kârlılığı raporu kullanır.
 * matched=false satırı, ürünle eşleşmeyen serbest kalemlerin toplamıdır.
 */
export async function productSalesSince(days: number) {
  const db = await requireDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      productId: orderItems.productId,
      qty: sql<string>`SUM(${orderItems.quantity})`,
      revenue: sql<string>`SUM(${orderItems.quantity} * ${orderItems.unitPrice})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(sql`${orders.createdAt} >= ${since} AND ${orders.status} <> 'cancelled'`)
    .groupBy(orderItems.productId);
  return rows.map(r => ({
    productId: r.productId,
    qty: parseFloat(r.qty) || 0,
    revenue: parseFloat(r.revenue) || 0,
  }));
}

/** Kanal kâr raporu için tüm sipariş kalemlerinin hafif listesi. */
export async function listAllOrderItemRefs() {
  const db = await requireDb();
  return db
    .select({ orderId: orderItems.orderId, productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems);
}

/* --------------- Mamul stok hareketleri (Faz 0.2) --------------- */

/**
 * Mamul stok hareketi kaydeder ve products.stockQty'yi günceller.
 * stockQty tam sayı olduğundan ondalıklı satış miktarı yuvarlanır (hareket
 * kaydı gerçek miktarı taşır). Eksi bakiye serbesttir: "üretilecek" sinyali.
 */
export async function recordProductMovement(
  productId: number,
  type: "in" | "out",
  qty: number,
  note?: string | null,
  orderId?: number | null,
) {
  if (!(qty > 0)) return;
  const db = await requireDb();
  await db.insert(productMovements).values({
    productId,
    type,
    qty: String(qty),
    note: note ?? null,
    orderId: orderId ?? null,
  });
  const delta = Math.round(qty);
  if (delta !== 0) {
    await db
      .update(products)
      .set({ stockQty: sql`${products.stockQty} ${type === "in" ? sql`+` : sql`-`} ${delta}` })
      .where(eq(products.id, productId));
  }
}

/** Kalem listesindeki ürün bağlı satırlar için stok iadesi/düşümü uygular. */
async function applyItemsStock(
  items: { productId?: number | null; quantity?: unknown }[],
  type: "in" | "out",
  note: string,
  orderId: number,
) {
  for (const item of items) {
    if (item.productId == null) continue;
    const qty = toNum(String(item.quantity));
    if (qty > 0) await recordProductMovement(item.productId, type, qty, note, orderId);
  }
}

/** Ürünün mamul stok hareket geçmişi (üretim/satış/iade/elle düzeltme). */
export async function listProductMovements(productId: number, limit = 50) {
  const db = await requireDb();
  return db
    .select()
    .from(productMovements)
    .where(eq(productMovements.productId, productId))
    .orderBy(desc(productMovements.id))
    .limit(limit);
}

/** Üretim emri kaydı + mamul stok girişi (hammadde düşümü çağıran tarafta). */
export async function recordProductionRun(productId: number, qty: number, note?: string | null) {
  const db = await requireDb();
  await db.insert(productionRuns).values({ productId, qty, note: note ?? null });
  await recordProductMovement(productId, "in", qty, "Üretim girişi");
}

export async function getProductionRun(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(productionRuns).where(eq(productionRuns.id, id)).limit(1);
  return rows[0];
}

export async function setProductionRunNote(id: number, note: string) {
  const db = await requireDb();
  await db.update(productionRuns).set({ note }).where(eq(productionRuns.id, id));
}

export async function listProductionRuns(limit = 50) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: productionRuns.id,
      productId: productionRuns.productId,
      qty: productionRuns.qty,
      note: productionRuns.note,
      createdAt: productionRuns.createdAt,
      productName: products.name,
    })
    .from(productionRuns)
    .leftJoin(products, eq(productionRuns.productId, products.id))
    .orderBy(desc(productionRuns.id))
    .limit(limit);
  return rows;
}

/**
 * Siparişin kalemlerini komple değiştirir (sil + yeniden ekle).
 * Her kalem katalogla eşleştirilir (barkod → ad); eşleşen kaleme productId
 * yazılır. Mamul stok da burada yürür: eski kalemler iade edilir, yeni
 * kalemler düşülür (sipariş iptal durumundaysa stok işlemi yapılmaz —
 * iptalde stok zaten iade edilmiştir).
 */
export async function replaceOrderItems(
  orderId: number,
  items: (Omit<InsertOrderItem, "orderId"> & { barcode?: string | null })[]
) {
  const db = await requireDb();
  const order = await getOrder(orderId);
  const stockActive = order != null && order.status !== "cancelled";
  const oldItems = await db
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (stockActive && oldItems.length > 0) {
    await applyItemsStock(oldItems, "in", "Kalem güncelleme iadesi", orderId);
  }
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length > 0) {
    const refs = await db
      .select({ id: products.id, name: products.name, barcode: products.barcode })
      .from(products);
    const rows = items.map(({ barcode, ...item }) => ({
      ...item,
      productId: item.productId ?? resolveProductIdForItem({ productName: item.productName, barcode }, refs),
      orderId,
    }));
    await db.insert(orderItems).values(rows);
    if (stockActive) {
      await applyItemsStock(rows, "out", `Satış: ${order?.orderNo ?? orderId}`, orderId);
    }
  }
}

export async function countOrdersToday() {
  const db = await requireDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` })
    .from(orders)
    .where(and(gte(orders.createdAt, start), sql`${orders.status} <> 'cancelled'`));
  return rows[0];
}

export async function orderStatusCounts() {
  const db = await requireDb();
  return db
    .select({ status: orders.status, count: sql<number>`COUNT(*)` })
    .from(orders)
    .groupBy(orders.status);
}

/* ------------------------- Suppliers (Tedarikçiler) ------------------------- */

export async function listSuppliers() {
  const db = await requireDb();
  return db.select().from(suppliers).orderBy(suppliers.name);
}

export async function createSupplier(data: typeof suppliers.$inferInsert) {
  const db = await requireDb();
  const [result] = await db.insert(suppliers).values(data);
  return result.insertId;
}

export async function updateSupplier(id: number, data: Partial<typeof suppliers.$inferInsert>) {
  const db = await requireDb();
  await db.update(suppliers).set(data).where(eq(suppliers.id, id));
}

export async function deleteSupplier(id: number) {
  const db = await requireDb();
  await db.delete(suppliers).where(eq(suppliers.id, id));
}

/* ------------------------- Campaigns (Kampanyalar) ------------------------- */

export async function listCampaigns() {
  const db = await requireDb();
  return db.select().from(campaigns).orderBy(campaigns.startDate);
}

export async function createCampaign(data: typeof campaigns.$inferInsert) {
  const db = await requireDb();
  const [result] = await db.insert(campaigns).values(data);
  return result.insertId;
}

export async function updateCampaign(id: number, data: Partial<typeof campaigns.$inferInsert>) {
  const db = await requireDb();
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await requireDb();
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

export async function upcomingCampaigns(days = 30) {
  const db = await requireDb();
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(campaigns)
    .where(and(lte(campaigns.startDate, until), gte(campaigns.endDate, now)))
    .orderBy(campaigns.startDate);
}

/* ------------------------- Marketing Texts (AI Metinleri) ------------------------- */

export async function listMarketingTexts() {
  const db = await requireDb();
  return db.select().from(marketingTexts).orderBy(desc(marketingTexts.createdAt)).limit(100);
}

export async function saveMarketingText(data: typeof marketingTexts.$inferInsert) {
  const db = await requireDb();
  const [result] = await db.insert(marketingTexts).values(data);
  return result.insertId;
}

export async function deleteMarketingText(id: number) {
  const db = await requireDb();
  await db.delete(marketingTexts).where(eq(marketingTexts.id, id));
}

/* ------------------------- Ürün Geliştirme ------------------------- */

export async function listDevProjects() {
  const db = await requireDb();
  return db.select().from(devProjects).orderBy(desc(devProjects.updatedAt));
}

export async function getDevProject(id: number) {
  const db = await requireDb();
  const result = await db.select().from(devProjects).where(eq(devProjects.id, id)).limit(1);
  return result[0];
}

export async function createDevProject(data: InsertDevProject) {
  const db = await requireDb();
  const [result] = await db.insert(devProjects).values(data);
  return result.insertId;
}

export async function updateDevProject(id: number, data: Partial<InsertDevProject>) {
  const db = await requireDb();
  await db.update(devProjects).set(data).where(eq(devProjects.id, id));
}

export async function deleteDevProject(id: number) {
  const db = await requireDb();
  const trials = await db.select({ id: devTrials.id }).from(devTrials).where(eq(devTrials.projectId, id));
  for (const trial of trials) {
    await db.delete(devTrialItems).where(eq(devTrialItems.trialId, trial.id));
  }
  await db.delete(devTrials).where(eq(devTrials.projectId, id));
  await db.delete(devProjects).where(eq(devProjects.id, id));
}

export async function listDevTrials(projectId: number) {
  const db = await requireDb();
  const trials = await db
    .select()
    .from(devTrials)
    .where(eq(devTrials.projectId, projectId))
    .orderBy(devTrials.trialNo);
  const items = await db
    .select({
      id: devTrialItems.id,
      trialId: devTrialItems.trialId,
      materialId: devTrialItems.materialId,
      qty: devTrialItems.qty,
      note: devTrialItems.note,
      materialName: materials.name,
      materialUnit: materials.unit,
      materialUnitCost: materials.unitCost,
    })
    .from(devTrialItems)
    .leftJoin(materials, eq(devTrialItems.materialId, materials.id))
    .where(
      sql`${devTrialItems.trialId} IN (SELECT id FROM devTrials WHERE projectId = ${projectId})`
    );
  return trials.map(trial => ({
    ...trial,
    items: items.filter(item => item.trialId === trial.id),
  }));
}

export async function createDevTrial(
  projectId: number,
  data: { notes?: string | null },
  items: { materialId: number; qty: number; note?: string | null }[]
) {
  const db = await requireDb();
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${devTrials.trialNo}), 0)` })
    .from(devTrials)
    .where(eq(devTrials.projectId, projectId));
  const [result] = await db.insert(devTrials).values({
    projectId,
    trialNo: Number(maxRow?.max ?? 0) + 1,
    notes: data.notes ?? null,
  });
  const trialId = Number(result.insertId);
  if (items.length > 0) {
    await db.insert(devTrialItems).values(
      items.map(item => ({
        trialId,
        materialId: item.materialId,
        qty: String(item.qty),
        note: item.note ?? null,
      }))
    );
  }
  return trialId;
}

export async function updateDevTrial(
  id: number,
  data: { result?: "pending" | "success" | "partial" | "fail"; notes?: string | null },
  items?: { materialId: number; qty: number; note?: string | null }[]
) {
  const db = await requireDb();
  await db.update(devTrials).set(data).where(eq(devTrials.id, id));
  if (items !== undefined) {
    await db.delete(devTrialItems).where(eq(devTrialItems.trialId, id));
    if (items.length > 0) {
      await db.insert(devTrialItems).values(
        items.map(item => ({
          trialId: id,
          materialId: item.materialId,
          qty: String(item.qty),
          note: item.note ?? null,
        }))
      );
    }
  }
}

export async function deleteDevTrial(id: number) {
  const db = await requireDb();
  await db.delete(devTrialItems).where(eq(devTrialItems.trialId, id));
  await db.delete(devTrials).where(eq(devTrials.id, id));
}

export async function chooseDevTrial(projectId: number, trialId: number) {
  const db = await requireDb();
  await db.update(devTrials).set({ isChosen: 0 }).where(eq(devTrials.projectId, projectId));
  await db.update(devTrials).set({ isChosen: 1 }).where(eq(devTrials.id, trialId));
}

export async function getChosenDevTrialItems(projectId: number) {
  const db = await requireDb();
  const [chosen] = await db
    .select({ id: devTrials.id })
    .from(devTrials)
    .where(and(eq(devTrials.projectId, projectId), eq(devTrials.isChosen, 1)))
    .limit(1);
  if (!chosen) return null;
  // Hammadde birim maliyeti de döner: ürünleştirmede fiyat önerisi hesaplanabilsin.
  return db
    .select({
      id: devTrialItems.id,
      trialId: devTrialItems.trialId,
      materialId: devTrialItems.materialId,
      qty: devTrialItems.qty,
      note: devTrialItems.note,
      unitCost: materials.unitCost,
    })
    .from(devTrialItems)
    .leftJoin(materials, eq(devTrialItems.materialId, materials.id))
    .where(eq(devTrialItems.trialId, chosen.id));
}

/* ------------------------- Strateji & Rapor ------------------------- */

/** Rapor sayfasının tek seferde ihtiyaç duyduğu tüm veri kümeleri. */
export async function reportData() {
  const db = await requireDb();
  const [allProducts, formulaRows, textRows, allOrders, allOrderItems, allMaterials, allCampaigns, imageRows, expenseRows] =
    await Promise.all([
      db.select().from(products),
      db
        .select({
          productId: formulaItems.productId,
          qty: formulaItems.qty,
          unitCost: materials.unitCost,
        })
        .from(formulaItems)
        .leftJoin(materials, eq(formulaItems.materialId, materials.id)),
      db.select({ productName: marketingTexts.productName }).from(marketingTexts),
      db.select().from(orders),
      db.select().from(orderItems),
      db.select().from(materials),
      db.select().from(campaigns),
      // Görsel verisinin kendisi ağır (base64); tamamlama kontrolü için kimlikler yeter.
      db.select({ productId: productImages.productId, kind: productImages.kind }).from(productImages),
      db.select().from(expenses),
    ]);
  return {
    products: allProducts,
    formulas: formulaRows,
    marketingTexts: textRows,
    // İptal/iade siparişler analiz/ciro grafiklerine girmez.
    orders: allOrders.filter(o => o.status !== "cancelled"),
    orderItems: allOrderItems,
    materials: allMaterials,
    campaigns: allCampaigns,
    productImages: imageRows,
    expenses: expenseRows,
  };
}

/* ------------------------- Alış Faturaları ------------------------- */

/**
 * Faturayı kaydeder ve kalemleri hammaddelere uygular:
 * isimden eşleşen hammaddenin stoğu artar + birim maliyeti güncellenir,
 * eşleşmeyen için yeni hammadde oluşturulur. Hepsi stok hareketine işlenir.
 */
export async function createPurchase(
  header: {
    supplierName: string | null;
    invoiceNo: string | null;
    invoiceDate: Date | null;
    note: string | null;
  },
  items: { name: string; qty: number; unit: string; unitCost: number }[]
) {
  const db = await requireDb();
  const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const [res] = await db.insert(purchases).values({
    supplierName: header.supplierName,
    // Cari bağ: tedarikçi kayıtlıysa ID ile bağla (ekstre ada değil ID'ye dayanır).
    supplierId: await resolveSupplierIdByName(header.supplierName),
    invoiceNo: header.invoiceNo,
    invoiceDate: header.invoiceDate,
    note: header.note,
    totalAmount: String(total),
  });
  const purchaseId = Number(res.insertId);

  const existing = await db.select().from(materials);
  const byName = new Map(existing.map(m => [m.name.trim().toLowerCase(), m]));
  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const name = item.name.trim();
    const found = byName.get(name.toLowerCase());
    let materialId: number;
    if (!found) {
      const [r] = await db.insert(materials).values({
        name,
        category: "diğer",
        unit: item.unit || "adet",
        stockQty: String(item.qty),
        criticalQty: "0",
        unitCost: String(item.unitCost),
      });
      materialId = Number(r.insertId);
      createdCount++;
    } else {
      materialId = found.id;
      await db
        .update(materials)
        .set({
          stockQty: sql`${materials.stockQty} + ${item.qty}`,
          unitCost: String(item.unitCost),
        })
        .where(eq(materials.id, found.id));
      updatedCount++;
    }
    await db.insert(stockMovements).values({
      materialId,
      type: "in",
      qty: String(item.qty),
      note: `Fatura girişi${header.invoiceNo ? ` (${header.invoiceNo})` : ""}${header.supplierName ? ` — ${header.supplierName}` : ""}`,
    });
    await db.insert(purchaseItems).values({
      purchaseId,
      materialId,
      name,
      qty: String(item.qty),
      unit: item.unit || "adet",
      unitCost: String(item.unitCost),
    });
  }
  return { purchaseId, createdCount, updatedCount };
}

/**
 * Toplu (kalemsiz) alış faturası: tedarikçi cari ekstresine yalnız BORÇ kaydı
 * ekler — hammadde/stok hareketi YOK. Asistanın "tedarikçiye X liralık alış
 * faturası gir" komutu içindir; kullanıcı kalem detayı vermeden sadece tutarı
 * söylediğinde fatura tedarikçinin carisine "Alış Faturası" satırı olarak düşer
 * (gider değil). Kalem/stok gerektiren tam fatura için createPurchase kullanılır.
 */
export async function createPurchaseInvoice(header: {
  supplierName: string | null;
  amount: number;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  note: string | null;
}) {
  const db = await requireDb();
  const [res] = await db.insert(purchases).values({
    supplierName: header.supplierName,
    // Cari bağ: tedarikçi kayıtlıysa ID ile bağla (ekstre ada değil ID'ye dayanır).
    supplierId: await resolveSupplierIdByName(header.supplierName),
    invoiceNo: header.invoiceNo,
    invoiceDate: header.invoiceDate,
    note: header.note,
    totalAmount: String(header.amount),
  });
  return { purchaseId: Number(res.insertId) };
}

export async function listPurchases() {
  const db = await requireDb();
  const rows = await db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100);
  const items = await db.select().from(purchaseItems);
  return rows.map(p => ({ ...p, items: items.filter(i => i.purchaseId === p.id) }));
}

/**
 * Alış faturasının FİNANS başlığını geriye dönük düzenler (cari ekstre düzeltme):
 * tutar, tarih, fatura no, tedarikçi, not. Kalem/stok girişleri değişmez — yalnız
 * cari/muhasebe kaydı düzeltilir. Tedarikçi adı değişirse cari bağ (ID) yenilenir.
 */
export async function updatePurchase(
  id: number,
  data: {
    totalAmount?: number;
    invoiceDate?: Date | null;
    invoiceNo?: string | null;
    note?: string | null;
    supplierName?: string | null;
  },
) {
  const db = await requireDb();
  const patch: Record<string, unknown> = {};
  if (data.totalAmount != null) patch.totalAmount = String(data.totalAmount);
  if (data.invoiceDate !== undefined) patch.invoiceDate = data.invoiceDate;
  if (data.invoiceNo !== undefined) patch.invoiceNo = data.invoiceNo;
  if (data.note !== undefined) patch.note = data.note;
  if (data.supplierName !== undefined) {
    patch.supplierName = data.supplierName;
    patch.supplierId = await resolveSupplierIdByName(data.supplierName);
  }
  if (Object.keys(patch).length === 0) return { updated: false };
  await db.update(purchases).set(patch as never).where(eq(purchases.id, id));
  return { updated: true };
}

/**
 * Alış faturasını siler ve eklediği hammadde stoğunu geri alır (fatura hiç
 * girilmemiş gibi): her kalem için materyal stoğu düşülür ve izlenebilirlik
 * amacıyla ters bir stok hareketi ("out") yazılır. Birim maliyet geçmişi
 * saklanmadığından son bilinen maliyet olduğu gibi kalır.
 */
export async function deletePurchase(id: number) {
  const db = await requireDb();
  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
  const [pur] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  for (const it of items) {
    const qty = toNum(it.qty);
    if (qty > 0) {
      await db
        .update(materials)
        .set({ stockQty: sql`${materials.stockQty} - ${qty}` })
        .where(eq(materials.id, it.materialId));
      await db.insert(stockMovements).values({
        materialId: it.materialId,
        type: "out",
        qty: String(qty),
        note: `Fatura silindi (geri alım)${pur?.invoiceNo ? ` — ${pur.invoiceNo}` : ""}`,
      });
    }
  }
  await db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
  await db.delete(purchases).where(eq(purchases.id, id));
  return { deleted: true, reversedItems: items.length };
}

/**
 * Para/cari hareketini (tahsilat/ödeme/gider/gelir) geriye dönük düzenler:
 * tutar, tarih, açıklama. Hareket bir siparişe bağlıysa (orderId) siparişin
 * ödeme durumu yeniden hesaplanır.
 */
export async function updateTransaction(
  id: number,
  data: { amount?: number; txnDate?: Date; description?: string | null },
) {
  const db = await requireDb();
  const patch: Record<string, unknown> = {};
  if (data.amount != null) patch.amount = String(data.amount);
  if (data.txnDate !== undefined) patch.txnDate = data.txnDate;
  if (data.description !== undefined) patch.description = data.description;
  if (Object.keys(patch).length === 0) return { updated: false };
  await db.update(transactions).set(patch as never).where(eq(transactions.id, id));

  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (txn?.orderId && txn.category === "tahsilat" && txn.direction === "in") {
    const [ord] = await db.select().from(orders).where(eq(orders.id, txn.orderId)).limit(1);
    if (ord) {
      const collected = collectionTotal(
        await db
          .select({ amount: transactions.amount, direction: transactions.direction, category: transactions.category })
          .from(transactions)
          .where(eq(transactions.orderId, txn.orderId)),
      );
      const status = paymentStatusFor(collected, toNum(ord.totalAmount));
      await db
        .update(orders)
        .set({ paidAmount: String(Math.max(0, collected)), paymentStatus: status })
        .where(eq(orders.id, txn.orderId));
    }
  }
  return { updated: true };
}

/* ------------------------- Şablonlar & Görseller ------------------------- */

export async function listTemplates() {
  const db = await requireDb();
  return db.select().from(templates).orderBy(templates.kind, templates.name);
}

export async function createTemplate(data: { kind: string; name: string; content: string | null }) {
  const db = await requireDb();
  const [r] = await db.insert(templates).values(data as never);
  return r.insertId;
}

export async function updateTemplate(id: number, data: { name?: string; content?: string | null }) {
  const db = await requireDb();
  await db.update(templates).set(data).where(eq(templates.id, id));
}

export async function deleteTemplate(id: number) {
  const db = await requireDb();
  await db.delete(templates).where(eq(templates.id, id));
}

export async function getProductImages(productId: number) {
  const db = await requireDb();
  return db.select().from(productImages).where(eq(productImages.productId, productId));
}

export async function getProductImage(productId: number, kind: "main" | "packaging" | "usage") {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, kind)))
    .limit(1);
  return rows[0];
}

/** Tüm ürün görsellerinin hafif listesi (veri hariç): dışa aktarımda link üretmek için. */
export async function listAllProductImageRefs() {
  const db = await requireDb();
  return db
    .select({ productId: productImages.productId, kind: productImages.kind })
    .from(productImages);
}

export async function setProductImage(productId: number, kind: "main" | "packaging" | "usage", data: string) {
  const db = await requireDb();
  await db
    .delete(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, kind)));
  await db.insert(productImages).values({ productId, kind, data });
}

export async function deleteProductImage(productId: number, kind: "main" | "packaging" | "usage") {
  const db = await requireDb();
  await db
    .delete(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, kind)));
}

/** Görseli olan ürün ID'leri (sağlık skoru: görsel var/yok tek sorguda). */
export async function listProductIdsWithImages(): Promise<number[]> {
  const db = await requireDb();
  const rows = await db
    .selectDistinct({ productId: productImages.productId })
    .from(productImages);
  return rows.map(r => r.productId);
}

export async function copyProductImages(fromProductId: number, toProductId: number) {
  const db = await requireDb();
  const rows = await db.select().from(productImages).where(eq(productImages.productId, fromProductId));
  for (const row of rows) {
    await db.insert(productImages).values({ productId: toProductId, kind: row.kind, data: row.data });
  }
}

/* ------------------------- Görevler & Eksik Listesi ------------------------- */

export async function listTasks(kind?: "eksik" | "gorev", status?: "open" | "done") {
  const db = await requireDb();
  const conds = [];
  if (kind) conds.push(eq(tasks.kind, kind));
  if (status) conds.push(eq(tasks.status, status));
  const query = db.select().from(tasks);
  const rows = conds.length ? await query.where(and(...conds)) : await query;
  // Açık olanlar üstte, sonra en yeniler.
  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function createTask(data: { kind: "eksik" | "gorev"; title: string; note?: string | null }) {
  const db = await requireDb();
  const [res] = await db.insert(tasks).values({ kind: data.kind, title: data.title, note: data.note ?? null });
  return Number(res.insertId);
}

export async function setTaskStatus(id: number, status: "open" | "done") {
  const db = await requireDb();
  await db.update(tasks).set({ status, doneAt: status === "done" ? new Date() : null }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await requireDb();
  await db.delete(tasks).where(eq(tasks.id, id));
}

/* ------------------------- Toplu Fiyat Güncelleme ------------------------- */

/** Tüm ürünlerin (ya da bir serinin) satış fiyatını yüzdeyle günceller. */
/**
 * Tüm ürünlerin formülden gelen hammadde maliyetini TEK sorguda hesaplar
 * (Fiyat & Kâr tablosu ürün başına ayrı sorgu atmasın diye).
 */
export async function listProductMaterialCosts() {
  const db = await requireDb();
  return db
    .select({
      productId: formulaItems.productId,
      materialCost: sql<string>`COALESCE(SUM(${formulaItems.qty} * ${materials.unitCost}), 0)`,
    })
    .from(formulaItems)
    .leftJoin(materials, eq(formulaItems.materialId, materials.id))
    .groupBy(formulaItems.productId);
}

/** Tek ürünün formülden gelen hammadde maliyeti (otomatik doldurma için). */
export async function getProductMaterialCost(productId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      materialCost: sql<string>`COALESCE(SUM(${formulaItems.qty} * ${materials.unitCost}), 0)`,
    })
    .from(formulaItems)
    .leftJoin(materials, eq(formulaItems.materialId, materials.id))
    .where(eq(formulaItems.productId, productId));
  return parseFloat(String(rows[0]?.materialCost ?? "0")) || 0;
}

/* ------------------------- Ürün Serileri ------------------------- */

export async function listProductSeries() {
  const db = await requireDb();
  return db.select().from(productSeries).orderBy(productSeries.name);
}

export async function getProductSeriesByName(name: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(productSeries)
    .where(sql`LOWER(${productSeries.name}) = LOWER(${name})`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Otomatik doldurma referans adayları: aynı serideki en son güncellenen
 * ürünler (düzenlenen ürünün kendisi hariç). Seçim (en dolu kart) saf
 * fonksiyonla yapılır — bkz. autofill.ts / pickReferenceProduct.
 */
export async function listSeriesReferenceCandidates(series: string, excludeId: number | null) {
  const db = await requireDb();
  const bySeries = sql`LOWER(${products.series}) = LOWER(${series})`;
  return db
    .select()
    .from(products)
    .where(excludeId ? and(bySeries, sql`${products.id} != ${excludeId}`) : bySeries)
    .orderBy(desc(products.updatedAt))
    .limit(15);
}

export async function createProductSeries(data: InsertProductSeries) {
  const db = await requireDb();
  const [r] = await db.insert(productSeries).values(data);
  return r.insertId;
}

export async function updateProductSeries(id: number, data: Partial<InsertProductSeries>) {
  const db = await requireDb();
  await db.update(productSeries).set(data).where(eq(productSeries.id, id));
}

export async function deleteProductSeries(id: number) {
  const db = await requireDb();
  await db.delete(productSeries).where(eq(productSeries.id, id));
}

/**
 * Ürün motoru v2: bir seriye ait projelerin sayısından sıra no üretir.
 * Kod = prefix + (mevcut sayı + 1) 4 hane sıfırla dolgulu. Örn. CND0042.
 * Sıra no seri bazında değil, o prefixle üretilmiş tüm devProjects sayısından
 * hesaplanır — böylece aynı seride kod tekrarı olmaz.
 */
export async function getNextSeriesCode(prefix: string) {
  const db = await requireDb();
  const clean = prefix.trim().toUpperCase();
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(devProjects)
    .where(sql`${devProjects.autoCode} LIKE ${clean + "%"}`);
  const next = Number(row?.n ?? 0) + 1;
  return `${clean}${String(next).padStart(4, "0")}`;
}

/* ------------------------- Ürün Motoru v2 — Ürünleştirme çıktıları ------------------------- */

export async function listProductGenerations(projectId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(productGenerations)
    .where(eq(productGenerations.projectId, projectId))
    .orderBy(productGenerations.id);
}

export async function getProductGeneration(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(productGenerations).where(eq(productGenerations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProductGeneration(data: InsertProductGeneration) {
  const db = await requireDb();
  const [r] = await db.insert(productGenerations).values(data);
  return Number(r.insertId);
}

export async function updateProductGeneration(id: number, data: Partial<InsertProductGeneration>) {
  const db = await requireDb();
  await db.update(productGenerations).set(data).where(eq(productGenerations.id, id));
}

export async function deleteProductGeneration(id: number) {
  const db = await requireDb();
  await db.delete(productGenerations).where(eq(productGenerations.id, id));
}

/** Bir proje ürünleştirilmeden önce eski varyant kayıtlarını temizler (yeniden üretim). */
export async function deleteProductGenerationsByProject(projectId: number) {
  const db = await requireDb();
  await db.delete(productGenerations).where(eq(productGenerations.projectId, projectId));
}

/**
 * Önizlemesi onaylanmış toplu fiyat listesini uygular (formül/CSV güncellemeleri).
 * `channel` verilirse fiyat o pazaryerine özel kayda (products.channelPrices JSON)
 * yazılır; taban salePrice değişmez. `channel` yoksa taban fiyat güncellenir
 * (web sitesi / varsayılan fiyat).
 */
export async function applyPriceUpdates(
  updates: { id: number; salePrice: number; discountPercent?: number }[],
  channel?: MarketplaceChannel | null,
) {
  const db = await requireDb();
  let affected = 0;
  if (channel) {
    for (const u of updates) {
      const [row] = await db
        .select({ channelPrices: products.channelPrices })
        .from(products)
        .where(eq(products.id, u.id))
        .limit(1);
      if (!row) continue;
      const map = parseChannelPrices(row.channelPrices);
      map[channel] = {
        salePrice: +u.salePrice.toFixed(2),
        ...(u.discountPercent != null ? { discountPercent: u.discountPercent } : {}),
      };
      const [result] = await db
        .update(products)
        .set({ channelPrices: JSON.stringify(map) })
        .where(eq(products.id, u.id));
      affected += result.affectedRows ?? 0;
    }
    return { affected };
  }
  for (const u of updates) {
    const [result] = await db
      .update(products)
      .set({ salePrice: u.salePrice.toFixed(2) })
      .where(eq(products.id, u.id));
    affected += result.affectedRows ?? 0;
  }
  return { affected };
}

export async function bulkUpdatePrices(percent: number, series: string | null) {
  const db = await requireDb();
  const factor = 1 + percent / 100;
  const setExpr = { salePrice: sql`ROUND(${products.salePrice} * ${factor}, 2)` };
  const [result] = series
    ? await db.update(products).set(setExpr).where(eq(products.series, series))
    : await db.update(products).set(setExpr);
  return { affected: result.affectedRows ?? 0 };
}

/* ------------------------- CRM Satış Boru Hattı ------------------------- */

export async function listOpportunities() {
  const db = await requireDb();
  return db.select().from(crmOpportunities).orderBy(desc(crmOpportunities.updatedAt)).limit(500);
}

export async function createOpportunity(data: InsertCrmOpportunity) {
  const db = await requireDb();
  // Cari bağ: müşteri kayıtlıysa ID ile bağla (isim değişse de fırsat kopmaz).
  if (data.customerId == null && data.customerName) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  const [r] = await db.insert(crmOpportunities).values(data);
  return Number(r.insertId);
}

export async function updateOpportunity(id: number, data: Partial<InsertCrmOpportunity>) {
  const db = await requireDb();
  if (data.customerId == null && data.customerName) {
    data = { ...data, customerId: await resolveCustomerIdByName(data.customerName) };
  }
  await db.update(crmOpportunities).set(data).where(eq(crmOpportunities.id, id));
}

export async function deleteOpportunity(id: number) {
  const db = await requireDb();
  await db.delete(crmOpportunities).where(eq(crmOpportunities.id, id));
}

/* ------------------------- Ayarlar (Şirket / Fatura) ------------------------- */

/* ------------------------- Bildirimler (Faz 1) ------------------------- */

/**
 * Bildirim oluşturur. Aynı tür+başlıktan son 24 saatte kaydedilmişse tekrar
 * yazmaz (nöbetçi ajanların spam'ini önler); o durumda null döner.
 */
export async function createNotification(data: {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<number | null> {
  const db = await requireDb();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dup = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.kind, data.kind), eq(notifications.title, data.title), gte(notifications.createdAt, dayAgo)))
    .limit(1);
  if (dup.length > 0) return null;
  const [res] = await db.insert(notifications).values({
    kind: data.kind,
    title: data.title,
    body: data.body ?? null,
    link: data.link ?? null,
  });
  return Number(res.insertId);
}

export async function listNotifications(limit = 30) {
  const db = await requireDb();
  return db.select().from(notifications).orderBy(desc(notifications.id)).limit(limit);
}

export async function unreadNotificationCount(): Promise<number> {
  const db = await requireDb();
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(eq(notifications.status, "unread"));
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(id: number) {
  const db = await requireDb();
  await db.update(notifications).set({ status: "read" }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead() {
  const db = await requireDb();
  await db.update(notifications).set({ status: "read" }).where(eq(notifications.status, "unread"));
}

/* ------------------------- Pazaryeri soru-cevap kuyruğu ------------------------- */

export async function listMarketplaceQuestions(status?: "new" | "answered" | "dismissed") {
  const db = await requireDb();
  const rows = status
    ? await db.select().from(marketplaceQuestions).where(eq(marketplaceQuestions.status, status)).orderBy(desc(marketplaceQuestions.id))
    : await db.select().from(marketplaceQuestions).orderBy(desc(marketplaceQuestions.id));
  return rows;
}

export async function getMarketplaceQuestion(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(marketplaceQuestions).where(eq(marketplaceQuestions.id, id)).limit(1);
  return rows[0];
}

/** Pazaryeri soru kimliğiyle mevcut kaydı bulur (oto-çekmede çift kayıt önleme). */
export async function getMarketplaceQuestionByExternal(source: string, externalId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(marketplaceQuestions)
    .where(and(eq(marketplaceQuestions.source, source as never), eq(marketplaceQuestions.externalId, externalId)))
    .limit(1);
  return rows[0];
}

export async function createMarketplaceQuestion(data: InsertMarketplaceQuestion) {
  const db = await requireDb();
  const [r] = await db.insert(marketplaceQuestions).values(data);
  return r.insertId;
}

export async function updateMarketplaceQuestion(id: number, data: Partial<InsertMarketplaceQuestion>) {
  const db = await requireDb();
  await db.update(marketplaceQuestions).set(data).where(eq(marketplaceQuestions.id, id));
}

/** Yeni (cevaplanmamış) soru sayısı — bildirim/rozet için. */
export async function countNewMarketplaceQuestions(): Promise<number> {
  const db = await requireDb();
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(marketplaceQuestions)
    .where(eq(marketplaceQuestions.status, "new"));
  return Number(rows[0]?.n ?? 0);
}

/**
 * "Tüm oturumları kapat" (auth.logoutAll) sonrası eski token'ları reddetmek için.
 * Ayar tabanlı (migration istemez); her istekte DB'ye gitmemek için 60 sn önbellek.
 */
let revokedCache: { value: number; fetchedAt: number } | null = null;
export async function isSessionRevoked(issuedAtSeconds?: number): Promise<boolean> {
  const now = Date.now();
  if (!revokedCache || now - revokedCache.fetchedAt > 60_000) {
    try {
      const cfg = await getSettings();
      revokedCache = { value: parseInt(cfg["auth.sessionsRevokedAt"] ?? "0", 10) || 0, fetchedAt: now };
    } catch {
      return false; // DB yoksa (yerel araç/ilk kurulum) iptal kontrolü atlanır
    }
  }
  return isTokenRevoked(revokedCache.value, issuedAtSeconds);
}

/** logoutAll yazdıktan sonra önbelleği anında düşürür (60 sn beklenmesin). */
export function clearSessionRevocationCache() {
  revokedCache = null;
}

export async function getSettings() {
  const db = await requireDb();
  const rows = await db.select().from(settings);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}

export async function setSettings(entries: Record<string, string>) {
  const db = await requireDb();
  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: { value } });
  }
  return { saved: Object.keys(entries).length };
}

/* --------------------- WhatsApp köprüsü oturum saklama --------------------- */
/* Baileys auth state'i (creds + signal anahtarları) DB'de tutulur; Render'ın
 * geçici diski sıfırlansa bile oturum kalıcı olur. Bkz. server/whatsapp.ts. */

export async function getWhatsappAuth(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  const db = await requireDb();
  const rows = await db.select().from(whatsappAuth).where(inArray(whatsappAuth.name, names));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.name] = r.data;
  return out;
}

export async function setWhatsappAuth(name: string, data: string): Promise<void> {
  const db = await requireDb();
  await db.insert(whatsappAuth).values({ name, data }).onDuplicateKeyUpdate({ set: { data } });
}

export async function deleteWhatsappAuth(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const db = await requireDb();
  await db.delete(whatsappAuth).where(inArray(whatsappAuth.name, names));
}

/** Tüm WhatsApp oturumunu siler (çıkış yapıldığında; sonraki başlangıçta yeni QR). */
export async function clearWhatsappAuth(): Promise<void> {
  const db = await requireDb();
  await db.delete(whatsappAuth);
}

/** Fatura numarası sayacını 1 artırır ve yeni değeri döner (atomik değil; tek kullanıcı içindir). */
export async function nextInvoiceNo() {
  const db = await requireDb();
  const rows = await db.select().from(settings).where(eq(settings.key, "invoiceCounter")).limit(1);
  const current = rows[0]?.value ? parseInt(rows[0].value, 10) || 0 : 0;
  const next = current + 1;
  await db
    .insert(settings)
    .values({ key: "invoiceCounter", value: String(next) })
    .onDuplicateKeyUpdate({ set: { value: String(next) } });
  return next;
}

/* ==========================================================================
 * ÜRÜN MİMARİSİ v3 — boyutlar, master, ilan, kanal yayını, kapasite
 * ========================================================================== */

/* ---- Boyutlar ----------------------------------------------------------- */

export async function listColors() {
  const db = await requireDb();
  return db.select().from(colors).orderBy(colors.sortOrder, colors.name);
}

export async function listProductFamilies() {
  const db = await requireDb();
  return db.select().from(productFamilies).orderBy(productFamilies.sortOrder, productFamilies.name);
}

export async function listPackagings() {
  const db = await requireDb();
  return db.select().from(packagings).orderBy(packagings.sortOrder, packagings.name);
}

export async function listUseCases() {
  const db = await requireDb();
  return db.select().from(useCases).orderBy(useCases.sortOrder, useCases.name);
}

export async function listSalesChannels() {
  const db = await requireDb();
  return db.select().from(salesChannels).orderBy(salesChannels.code);
}

export async function listSeriesPackagings() {
  const db = await requireDb();
  return db.select().from(seriesPackagings);
}

export async function listSeriesFamilies() {
  const db = await requireDb();
  return db.select().from(seriesFamilies);
}

/**
 * Boyut satırlarını koda göre ekler; var olana dokunmaz (idempotent tohumlama).
 * Dönen değer: kod → id eşlemesi.
 */
async function upsertByCode<T extends { id: number; code: string }>(
  table: typeof colors | typeof productFamilies | typeof packagings | typeof useCases | typeof salesChannels,
  rows: Record<string, unknown>[],
): Promise<{ map: Map<string, number>; created: number }> {
  const db = await requireDb();
  const existing = (await db.select().from(table as never)) as unknown as T[];
  const map = new Map(existing.map(r => [r.code, r.id]));
  let created = 0;
  for (const row of rows) {
    const code = String(row.code ?? "");
    if (!code || map.has(code)) continue;
    const [res] = await db.insert(table as never).values(row as never);
    map.set(code, Number(res.insertId));
    created++;
  }
  return { map, created };
}

export async function seedColors(rows: InsertColor[]) {
  return upsertByCode(colors, rows as never);
}
export async function seedFamilies(rows: InsertProductFamily[]) {
  return upsertByCode(productFamilies, rows as never);
}
export async function seedPackagings(rows: InsertPackaging[]) {
  return upsertByCode(packagings, rows as never);
}
export async function seedUseCases(rows: InsertUseCase[]) {
  return upsertByCode(useCases, rows as never);
}
export async function seedSalesChannels(rows: { code: string; name: string }[]) {
  return upsertByCode(salesChannels, rows as never);
}

/** Seri × ambalaj / seri × form uyumluluğu — küpü seyrek tutan kısıt. */
export async function setSeriesPackagings(seriesId: number, packagingIds: number[]) {
  const db = await requireDb();
  await db.delete(seriesPackagings).where(eq(seriesPackagings.seriesId, seriesId));
  for (const packagingId of packagingIds) {
    await db.insert(seriesPackagings).values({ seriesId, packagingId });
  }
}

export async function setSeriesFamilies(seriesId: number, familyIds: number[]) {
  const db = await requireDb();
  await db.delete(seriesFamilies).where(eq(seriesFamilies.seriesId, seriesId));
  for (const familyId of familyIds) {
    await db.insert(seriesFamilies).values({ seriesId, familyId });
  }
}

/* ---- Formüller (çok seviyeli BOM) --------------------------------------- */

export async function listFormulas() {
  const db = await requireDb();
  return db.select().from(formulas);
}

export async function listFormulaInputs() {
  const db = await requireDb();
  return db.select().from(formulaInputs);
}

export async function listPackagingInputs() {
  const db = await requireDb();
  return db.select().from(packagingInputs);
}

export async function createFormula(data: InsertFormula) {
  const db = await requireDb();
  const [r] = await db.insert(formulas).values(data);
  return Number(r.insertId);
}

export async function updateFormula(id: number, data: Partial<InsertFormula>) {
  const db = await requireDb();
  await db.update(formulas).set(data).where(eq(formulas.id, id));
}

export async function setFormulaInputs(
  formulaId: number,
  rows: { inputMaterialId: number; qtyPerBase: number; note?: string | null }[],
) {
  const db = await requireDb();
  await db.delete(formulaInputs).where(eq(formulaInputs.formulaId, formulaId));
  for (const row of rows) {
    await db.insert(formulaInputs).values({
      formulaId,
      inputMaterialId: row.inputMaterialId,
      qtyPerBase: String(row.qtyPerBase),
      note: row.note ?? null,
    } as InsertFormulaInput);
  }
}

/* ---- Master ürünler ------------------------------------------------------ */

export async function listMasterProducts() {
  const db = await requireDb();
  return db.select().from(masterProducts).orderBy(masterProducts.internalSku);
}

export async function getMasterProduct(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(masterProducts).where(eq(masterProducts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createMasterProduct(data: InsertMasterProduct) {
  const db = await requireDb();
  const [r] = await db.insert(masterProducts).values(data);
  return Number(r.insertId);
}

export async function updateMasterProduct(id: number, data: Partial<InsertMasterProduct>) {
  const db = await requireDb();
  await db.update(masterProducts).set(data).where(eq(masterProducts.id, id));
}

/**
 * Kapasite sonuçlarını master'lara yazar. Yalnız DEĞİŞEN satırlara dokunur —
 * 5.000 master'da her hesapta 5.000 UPDATE atmanın anlamı yok.
 */
export async function writeBuildableQty(rows: { masterId: number; buildable: number }[]) {
  const db = await requireDb();
  const current = await db
    .select({ id: masterProducts.id, buildableQty: masterProducts.buildableQty })
    .from(masterProducts);
  const byId = new Map(current.map(r => [r.id, r.buildableQty]));
  const now = new Date();
  let changed = 0;
  for (const row of rows) {
    if (byId.get(row.masterId) === row.buildable) continue;
    await db
      .update(masterProducts)
      .set({ buildableQty: row.buildable, buildableComputedAt: now })
      .where(eq(masterProducts.id, row.masterId));
    changed++;
  }
  return changed;
}

/* ---- İlanlar ------------------------------------------------------------- */

export async function listListings() {
  const db = await requireDb();
  return db.select().from(listings);
}

export async function listListingsByMaster(masterId: number) {
  const db = await requireDb();
  return db.select().from(listings).where(eq(listings.masterId, masterId));
}

export async function createListing(data: InsertListing) {
  const db = await requireDb();
  const [r] = await db.insert(listings).values(data);
  return Number(r.insertId);
}

export async function updateListing(id: number, data: Partial<InsertListing>) {
  const db = await requireDb();
  await db.update(listings).set(data).where(eq(listings.id, id));
}

/* ---- Kanal yayınları ----------------------------------------------------- */

export async function listChannelListings() {
  const db = await requireDb();
  return db.select().from(channelListings);
}

export async function createChannelListing(data: InsertChannelListing) {
  const db = await requireDb();
  const [r] = await db.insert(channelListings).values(data);
  return Number(r.insertId);
}

export async function updateChannelListing(id: number, data: Partial<InsertChannelListing>) {
  const db = await requireDb();
  await db.update(channelListings).set(data).where(eq(channelListings.id, id));
}

/**
 * Bir kanalda üretilmiş en büyük sıra numarası. Pazaryeri SKU'su ve barkodu
 * buradan devam eder; kodlar bir kez üretilip saklandığı için sayaç asla
 * geriye sarmaz.
 */
export async function nextChannelSequence(): Promise<number> {
  const db = await requireDb();
  const [row] = await db
    .select({ n: sql<number>`COALESCE(MAX(${channelListings.id}), 0)` })
    .from(channelListings);
  return Number(row?.n ?? 0) + 1;
}

/**
 * Kapasitesi değişen master'ların yayınlarını kirli işaretler.
 * Satış anında hesap yapılmaz; işçi kirli satırları toplu gönderir.
 */
export async function markChannelListingsDirty(masterIds: number[]) {
  if (masterIds.length === 0) return 0;
  const db = await requireDb();
  await db
    .update(channelListings)
    .set({ syncState: "kirli" })
    .where(inArray(channelListings.masterId, masterIds));
  return masterIds.length;
}

/* ---- Hammadde rezervasyonu ---------------------------------------------- */

/**
 * Açık sipariş için hammadde rezerve eder — ATOMİK.
 *
 * Sipariş ile üretim arasındaki günlerde hammadde "boşta" görünmesin diye
 * rezerv burada açılır. WHERE koşulu aşırı satış kalkanıdır: yetersizse hiç
 * satır güncellenmez ve çağıran bunu görür. Yarış durumu (iki pazaryerinden
 * aynı anda sipariş) uygulama katmanında değil, veritabanında çözülür.
 */
export async function reserveMaterial(materialId: number, qty: number): Promise<boolean> {
  const db = await requireDb();
  const [res] = await db
    .update(materials)
    .set({ reservedQty: sql`${materials.reservedQty} + ${qty}` })
    .where(
      and(
        eq(materials.id, materialId),
        sql`${materials.stockQty} - ${materials.reservedQty} - ${materials.safetyQty} >= ${qty}`,
      ),
    );
  return (res as { affectedRows?: number }).affectedRows !== 0;
}

/** Rezervi geri açar (sipariş iptali/iadesi). Eksiye düşmez. */
export async function releaseMaterial(materialId: number, qty: number) {
  const db = await requireDb();
  await db
    .update(materials)
    .set({ reservedQty: sql`GREATEST(0, ${materials.reservedQty} - ${qty})` })
    .where(eq(materials.id, materialId));
}

/** Üretim tamamlandı: rezerv kapanır ve gerçek stok düşer. */
export async function consumeMaterial(materialId: number, qty: number) {
  const db = await requireDb();
  await db
    .update(materials)
    .set({
      reservedQty: sql`GREATEST(0, ${materials.reservedQty} - ${qty})`,
      stockQty: sql`GREATEST(0, ${materials.stockQty} - ${qty})`,
    })
    .where(eq(materials.id, materialId));
}

/* ---- Boyut düzenleme (Tanımlar sayfası) --------------------------------- */

type DimensionTable = "colors" | "families" | "packagings" | "useCases";

const dimensionTables = {
  colors,
  families: productFamilies,
  packagings,
  useCases,
} as const;

export async function updateDimension(
  kind: DimensionTable,
  id: number,
  data: Record<string, unknown>,
) {
  const db = await requireDb();
  const table = dimensionTables[kind];
  await db.update(table as never).set(data as never).where(eq((table as never as { id: never }).id, id));
}

export async function createDimension(kind: DimensionTable, data: Record<string, unknown>) {
  const db = await requireDb();
  const [r] = await db.insert(dimensionTables[kind] as never).values(data as never);
  return Number(r.insertId);
}

/**
 * Boyut silme — yalnız KULLANILMIYORSA. Master'a bağlı bir rengi silmek
 * küp koordinatını öksüz bırakır; sessizce bozulmasındansa engellenmeli.
 */
export async function countDimensionUsage(kind: DimensionTable, id: number): Promise<number> {
  const db = await requireDb();
  const col =
    kind === "colors"
      ? masterProducts.colorId
      : kind === "families"
        ? masterProducts.familyId
        : kind === "packagings"
          ? masterProducts.packagingId
          : null;
  if (col === null) {
    const [row] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(listings)
      .where(eq(listings.useCaseId, id));
    return Number(row?.n ?? 0);
  }
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(masterProducts).where(eq(col, id));
  return Number(row?.n ?? 0);
}

export async function deleteDimension(kind: DimensionTable, id: number) {
  const db = await requireDb();
  const table = dimensionTables[kind];
  await db.delete(table as never).where(eq((table as never as { id: never }).id, id));
}

export async function listListingImages() {
  const db = await requireDb();
  return db.select().from(listingImages);
}

/* ---- Görseller: master → ilan mirası ------------------------------------ */

export async function listMasterImages(masterId?: number) {
  const db = await requireDb();
  const q = db.select().from(masterImages);
  return masterId ? q.where(eq(masterImages.masterId, masterId)) : q;
}

export async function addMasterImage(input: { masterId: number; url: string; role?: string | null }) {
  const db = await requireDb();
  const [row] = await db
    .select({ n: sql<number>`COALESCE(MAX(sortOrder), -1)` })
    .from(masterImages)
    .where(eq(masterImages.masterId, input.masterId));
  await db.insert(masterImages).values({
    masterId: input.masterId,
    url: input.url,
    role: input.role ?? null,
    sortOrder: Number(row?.n ?? -1) + 1,
  });
}

export async function deleteMasterImage(id: number) {
  const db = await requireDb();
  await db.delete(masterImages).where(eq(masterImages.id, id));
}

/* ---- Pazaryeri özellik eşlemesi ----------------------------------------- */

export async function listChannelAttributes(channelId?: number) {
  const db = await requireDb();
  const q = db.select().from(channelAttributes);
  return channelId ? q.where(eq(channelAttributes.channelId, channelId)) : q;
}

/**
 * Özellik tanımını ekler/günceller. UNIQUE(kanal, kategori, özellik) sayesinde
 * "yeniden içe aktar" mükerrer satır açmaz; kullanıcının seçtiği `source`
 * korunur — pazaryerinden gelen tahmin onu ezmemelidir.
 */
export async function upsertChannelAttribute(input: {
  channelId: number;
  categoryId: string;
  attributeId: number;
  attributeName?: string | null;
  source?: "renk" | "ambalaj" | "form" | "seri" | "hacim" | "sabit";
  constantValueId?: number | null;
  constantText?: string | null;
  isRequired?: boolean;
  /** true ise mevcut satırın kaynağı korunur (içe aktarma modu). */
  keepSource?: boolean;
}) {
  const db = await requireDb();
  const values = {
    channelId: input.channelId,
    categoryId: input.categoryId,
    attributeId: input.attributeId,
    attributeName: input.attributeName ?? null,
    source: input.source ?? ("sabit" as const),
    constantValueId: input.constantValueId ?? null,
    constantText: input.constantText ?? null,
    isRequired: input.isRequired === false ? 0 : 1,
  };
  const update: Record<string, unknown> = {
    attributeName: values.attributeName,
    isRequired: values.isRequired,
  };
  if (!input.keepSource) {
    update.source = values.source;
    update.constantValueId = values.constantValueId;
    update.constantText = values.constantText;
  }
  await db.insert(channelAttributes).values(values).onDuplicateKeyUpdate({ set: update });
}

export async function deleteChannelAttribute(id: number) {
  const db = await requireDb();
  await db.delete(channelAttributes).where(eq(channelAttributes.id, id));
}

export async function listChannelAttributeValues(channelId?: number) {
  const db = await requireDb();
  const q = db.select().from(channelAttributeValues);
  return channelId ? q.where(eq(channelAttributeValues.channelId, channelId)) : q;
}

export async function upsertChannelAttributeValue(input: {
  channelId: number;
  attributeId: number;
  dimensionKind: "renk" | "ambalaj" | "form" | "seri";
  dimensionId: number;
  attributeValueId?: number | null;
  attributeText?: string | null;
}) {
  const db = await requireDb();
  const values = {
    channelId: input.channelId,
    attributeId: input.attributeId,
    dimensionKind: input.dimensionKind,
    dimensionId: input.dimensionId,
    attributeValueId: input.attributeValueId ?? null,
    attributeText: input.attributeText ?? null,
  };
  await db
    .insert(channelAttributeValues)
    .values(values)
    .onDuplicateKeyUpdate({
      set: { attributeValueId: values.attributeValueId, attributeText: values.attributeText },
    });
}

export async function deleteChannelAttributeValue(id: number) {
  const db = await requireDb();
  await db.delete(channelAttributeValues).where(eq(channelAttributeValues.id, id));
}

/* ---- Hammadde rezervasyon defteri --------------------------------------- */

export async function listOrderReservations(orderId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(materialReservations)
    .where(and(eq(materialReservations.orderId, orderId), eq(materialReservations.state, "rezerve")));
}

export async function hasActiveReservation(orderId: number): Promise<boolean> {
  const db = await requireDb();
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(materialReservations)
    .where(and(eq(materialReservations.orderId, orderId), eq(materialReservations.state, "rezerve")));
  return Number(row?.n ?? 0) > 0;
}

export async function recordReservation(orderId: number, materialId: number, qty: number) {
  const db = await requireDb();
  await db.insert(materialReservations).values({ orderId, materialId, qty: String(qty) });
}

/**
 * Siparişin açık rezervlerini kapatır ve toplam sayaçları düzeltir.
 *
 * `consume` = üretim yapıldı: rezerv düşer VE gerçek stok düşer.
 * `release` = iptal/iade: yalnız rezerv düşer, stok yerinde kalır.
 *
 * Sayaç (materials.reservedQty) satırlardan türetilir; ikisi ayrışmasın diye
 * kapatma ve sayaç düşümü aynı yerde yapılır.
 */
export async function closeOrderReservations(orderId: number, mode: "consume" | "release") {
  const rows = await listOrderReservations(orderId);
  if (rows.length === 0) return 0;
  const db = await requireDb();
  for (const r of rows) {
    const qty = parseFloat(String(r.qty)) || 0;
    if (mode === "consume") await consumeMaterial(r.materialId, qty);
    else await releaseMaterial(r.materialId, qty);
  }
  await db
    .update(materialReservations)
    .set({ state: mode === "consume" ? "tuketildi" : "iptal" })
    .where(and(eq(materialReservations.orderId, orderId), eq(materialReservations.state, "rezerve")));
  return rows.length;
}

/* ---- İçerik blokları ----------------------------------------------------- */

export async function listContentBlocks() {
  const db = await requireDb();
  return db.select().from(contentBlocks);
}

/**
 * Blok kaydı — koordinat (seri × kullanım alanı × form) tekildir, o yüzden
 * varsa güncellenir. Böylece "yeniden üret" mükerrer blok açmaz.
 */
export async function upsertContentBlock(
  coord: { seriesId: number; useCaseId: number; familyId: number | null },
  data: Record<string, unknown>,
) {
  const db = await requireDb();
  const rows = await db
    .select({ id: contentBlocks.id })
    .from(contentBlocks)
    .where(
      and(
        eq(contentBlocks.seriesId, coord.seriesId),
        eq(contentBlocks.useCaseId, coord.useCaseId),
        coord.familyId === null
          ? isNull(contentBlocks.familyId)
          : eq(contentBlocks.familyId, coord.familyId),
      ),
    )
    .limit(1);
  if (rows[0]) {
    await db.update(contentBlocks).set(data).where(eq(contentBlocks.id, rows[0].id));
    return rows[0].id;
  }
  const [r] = await db.insert(contentBlocks).values({ ...coord, ...data } as never);
  return Number(r.insertId);
}

export async function deleteContentBlock(id: number) {
  const db = await requireDb();
  await db.delete(contentBlocks).where(eq(contentBlocks.id, id));
}

/* ---- Kullanım alanı × kanal kategori eşlemesi ---------------------------- */

export async function listUseCaseChannelCategories() {
  const db = await requireDb();
  return db.select().from(useCaseChannelCategories);
}

export async function setUseCaseChannelCategory(
  useCaseId: number,
  channelId: number,
  categoryId: string,
  categoryName: string | null,
) {
  const db = await requireDb();
  const rows = await db
    .select({ id: useCaseChannelCategories.id })
    .from(useCaseChannelCategories)
    .where(
      and(
        eq(useCaseChannelCategories.useCaseId, useCaseId),
        eq(useCaseChannelCategories.channelId, channelId),
      ),
    )
    .limit(1);
  if (rows[0]) {
    await db
      .update(useCaseChannelCategories)
      .set({ categoryId, categoryName })
      .where(eq(useCaseChannelCategories.id, rows[0].id));
    return rows[0].id;
  }
  const [r] = await db
    .insert(useCaseChannelCategories)
    .values({ useCaseId, channelId, categoryId, categoryName });
  return Number(r.insertId);
}

/* ---- Kanal senkron kuyruğu ----------------------------------------------- */

/** Gönderim bekleyen yayınlar (kirli veya hatalı). */
export async function listDirtyChannelListings(channelId?: number) {
  const db = await requireDb();
  const conds = [inArray(channelListings.syncState, ["kirli", "hata"] as never)];
  if (channelId) conds.push(eq(channelListings.channelId, channelId));
  return db.select().from(channelListings).where(and(...conds));
}

/** Gönderim sonucu — başarıda pushedQty önbelleği tazelenir. */
export async function markChannelSynced(ids: number[], pushedQty: Map<number, number>) {
  if (ids.length === 0) return;
  const db = await requireDb();
  const now = new Date();
  for (const id of ids) {
    await db
      .update(channelListings)
      .set({
        syncState: "temiz",
        syncedAt: now,
        pushedQty: pushedQty.get(id) ?? 0,
        lastError: null,
        status: "canli",
      })
      .where(eq(channelListings.id, id));
  }
}

/** Gönderim hatası — satır "hata" kalır ve sonraki turda yeniden denenir. */
export async function markChannelSyncFailed(ids: number[], message: string) {
  if (ids.length === 0) return;
  const db = await requireDb();
  await db
    .update(channelListings)
    .set({ syncState: "hata", lastError: message.slice(0, 500) })
    .where(inArray(channelListings.id, ids));
}
