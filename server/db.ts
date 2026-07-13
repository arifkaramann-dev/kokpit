import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
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
  materials,
  orderItems,
  orders,
  products,
  productImages,
  purchaseItems,
  purchases,
  settings,
  tasks,
  templates,
  stockMovements,
  suppliers,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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
  // Hareket kaydı ve bakiye güncellemesi tek transaction'da: biri başarısız
  // olursa ikisi de geri alınır (stok hareketi ile bakiye asla uyuşmaz kalmaz).
  await db.transaction(async tx => {
    await tx.insert(stockMovements).values({ materialId, type, qty: String(qty), note });
    await tx
      .update(materials)
      .set({ stockQty: sql`GREATEST(${materials.stockQty} + ${delta}, 0)` })
      .where(eq(materials.id, materialId));
  });
}

/**
 * Üretim için birden çok hammaddeyi tek transaction'da stoktan düşer. Yarıda
 * kesilirse (API hatası/bağlantı kopması) hiçbiri düşmez — kısmi düşüm olmaz.
 */
export async function deductStockBatch(
  deductions: { materialId: number; qty: number; note?: string }[],
) {
  const items = deductions.filter(d => d.qty > 0);
  if (items.length === 0) return;
  const db = await requireDb();
  await db.transaction(async tx => {
    for (const d of items) {
      await tx.insert(stockMovements).values({ materialId: d.materialId, type: "out", qty: String(d.qty), note: d.note });
      await tx
        .update(materials)
        .set({ stockQty: sql`GREATEST(${materials.stockQty} - ${d.qty}, 0)` })
        .where(eq(materials.id, d.materialId));
    }
  });
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
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await requireDb();
  // Türevleri ve formülleri de temizle
  const children = await db.select({ id: products.id }).from(products).where(eq(products.parentId, id));
  for (const child of children) {
    await db.delete(formulaItems).where(eq(formulaItems.productId, child.id));
  }
  await db.delete(products).where(eq(products.parentId, id));
  await db.delete(formulaItems).where(eq(formulaItems.productId, id));
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

/* ------------------------- Orders (Siparişler) ------------------------- */

export async function listOrders() {
  const db = await requireDb();
  return db.select().from(orders).orderBy(desc(orders.sortOrder), desc(orders.createdAt));
}

export async function createOrder(data: InsertOrder) {
  const db = await requireDb();
  const [result] = await db.insert(orders).values(data);
  return result.insertId;
}

export async function updateOrder(id: number, data: Partial<InsertOrder>) {
  const db = await requireDb();
  await db.update(orders).set(data).where(eq(orders.id, id));
}

export async function deleteOrder(id: number) {
  const db = await requireDb();
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
  await db.update(orders).set(data).where(eq(orders.id, id));
}

/* ------------------------- Müşteriler (CRM) ------------------------- */

export async function listCustomers() {
  const db = await requireDb();
  return db.select().from(customers).orderBy(customers.name);
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
  return accs.map(a => {
    let bal = toNum(a.openingBalance);
    for (const t of txns) {
      if (t.accountId !== a.id) continue;
      bal += t.direction === "in" ? toNum(t.amount) : -toNum(t.amount);
    }
    return { ...a, balance: bal };
  });
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
  if (filter?.customerName) conds.push(eq(transactions.customerName, filter.customerName));
  if (filter?.accountId) conds.push(eq(transactions.accountId, filter.accountId));
  const q = db.select().from(transactions);
  const rows = conds.length ? await q.where(and(...conds)) : await q;
  return rows.sort((a, b) => new Date(b.txnDate).getTime() - new Date(a.txnDate).getTime()).slice(0, filter?.limit ?? 300);
}

/**
 * Hareket ekler. Tahsilat/ödeme bir siparişe bağlıysa (orderId) o siparişin
 * ödenen tutarı ve ödeme durumu otomatik güncellenir (mevcut model korunur).
 */
export async function createTransaction(data: InsertTransaction) {
  const db = await requireDb();
  const [res] = await db.insert(transactions).values(data);
  if (data.orderId && data.category === "tahsilat" && data.direction === "in") {
    const [ord] = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (ord) {
      const collected = (await db.select({ amount: transactions.amount, direction: transactions.direction, category: transactions.category })
        .from(transactions)
        .where(eq(transactions.orderId, data.orderId)))
        .filter(t => t.category === "tahsilat")
        .reduce((s, t) => s + (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount)), 0);
      const total = toNum(ord.totalAmount);
      const status = collected <= 0 ? "unpaid" : collected + 0.001 >= total ? "paid" : "partial";
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
  // Çıkış ve giriş hareketi tek transaction'da: biri başarısız olursa para bir
  // hesaptan düşülüp diğerine eklenmeden "kaybolmaz".
  await db.transaction(async tx => {
    await tx.insert(transactions).values({
      txnDate: now, accountId: fromId, direction: "out", amount: String(amount), category: "transfer",
      description: `Transfer → ${to?.name ?? ""}`, note,
    } as never);
    await tx.insert(transactions).values({
      txnDate: now, accountId: toId, direction: "in", amount: String(amount), category: "transfer",
      description: `Transfer ← ${from?.name ?? ""}`, note,
    } as never);
  });
}

/**
 * Tüm müşterilerin cari bakiyesi (küçük harf ada göre): sipariş toplamı (borç)
 * − tahsilat (alacak). Pozitif = müşteri bize borçlu.
 */
export async function customerBalances(): Promise<Record<string, number>> {
  const db = await requireDb();
  const [ords, txns] = await Promise.all([
    db.select({ name: orders.customerName, total: orders.totalAmount }).from(orders),
    db.select({ name: transactions.customerName, direction: transactions.direction, amount: transactions.amount, category: transactions.category }).from(transactions),
  ]);
  const key = (n: string) => n.trim().toLocaleLowerCase("tr-TR");
  const out: Record<string, number> = {};
  for (const o of ords) out[key(o.name)] = (out[key(o.name)] ?? 0) + toNum(o.total);
  for (const t of txns) {
    if (!t.name || t.category !== "tahsilat") continue;
    out[key(t.name)] = (out[key(t.name)] ?? 0) - (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/**
 * Bir müşterinin cari ekstresi: siparişleri (borç) + tahsilatları (alacak/ödeme)
 * tarih sırasıyla, yürüyen bakiyeyle. Bakiye > 0 → müşteri bize borçlu.
 */
export async function customerLedger(name: string) {
  const db = await requireDb();
  const [ords, txns] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerName, name)),
    db.select().from(transactions).where(eq(transactions.customerName, name)),
  ]);
  type Entry = { date: Date; label: string; debit: number; credit: number; ref: string };
  const entries: Entry[] = [];
  for (const o of ords) {
    entries.push({ date: new Date(o.createdAt), label: "Sipariş", debit: toNum(o.totalAmount), credit: 0, ref: o.orderNo });
  }
  for (const t of txns) {
    const isIn = t.direction === "in";
    entries.push({
      date: new Date(t.txnDate),
      label: t.category === "tahsilat" ? "Tahsilat" : t.description || t.category,
      debit: isIn ? 0 : toNum(t.amount),
      credit: isIn ? toNum(t.amount) : 0,
      ref: t.orderNo ?? "",
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
    db.select({ total: orders.totalAmount, date: orders.createdAt }).from(orders),
    db.select({ total: purchases.totalAmount, date: purchases.invoiceDate, created: purchases.createdAt }).from(purchases),
  ]);
  const rate = parseFloat(vatRow[0]?.value ?? "") || 20;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const vatOf = (gross: number) => gross - gross / (1 + rate / 100);

  const calc = (since: number) => {
    let salesGross = 0;
    for (const o of ords) if (new Date(o.date).getTime() >= since) salesGross += toNum(o.total);
    let buyGross = 0;
    for (const p of purs) {
      const t = new Date((p.date ?? p.created) as never).getTime();
      if (t >= since) buyGross += toNum(p.total);
    }
    const salesVat = vatOf(salesGross);
    const buyVat = vatOf(buyGross);
    return { salesGross, salesVat, buyGross, buyVat, payable: salesVat - buyVat };
  };

  return { rate, month: calc(monthStart), year: calc(yearStart) };
}

/**
 * Tedarikçi cari bakiyeleri (küçük harf ada göre): alış faturaları (borç)
 * − tedarikçiye ödemeler. Pozitif = biz tedarikçiye borçluyuz.
 */
export async function supplierBalances(): Promise<Record<string, number>> {
  const db = await requireDb();
  const [purs, txns] = await Promise.all([
    db.select({ name: purchases.supplierName, total: purchases.totalAmount }).from(purchases),
    db.select({ name: transactions.supplierName, direction: transactions.direction, amount: transactions.amount }).from(transactions),
  ]);
  const key = (n: string) => n.trim().toLocaleLowerCase("tr-TR");
  const out: Record<string, number> = {};
  for (const p of purs) if (p.name) out[key(p.name)] = (out[key(p.name)] ?? 0) + toNum(p.total);
  for (const t of txns) {
    if (!t.name) continue;
    // Tedarikçiye ödeme (out) borcumuzu azaltır.
    out[key(t.name)] = (out[key(t.name)] ?? 0) - (t.direction === "out" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/** Tedarikçi cari ekstresi: alış faturaları (borç) + ödemeler (alacak) + bakiye. */
export async function supplierLedger(name: string) {
  const db = await requireDb();
  const [purs, txns] = await Promise.all([
    db.select().from(purchases).where(eq(purchases.supplierName, name)),
    db.select().from(transactions).where(eq(transactions.supplierName, name)),
  ]);
  type Entry = { date: Date; label: string; debit: number; credit: number; ref: string };
  const entries: Entry[] = [];
  for (const p of purs) {
    entries.push({ date: new Date((p.invoiceDate ?? p.createdAt) as never), label: "Alış Faturası", debit: toNum(p.totalAmount), credit: 0, ref: p.invoiceNo ?? "" });
  }
  for (const t of txns) {
    const isOut = t.direction === "out";
    entries.push({ date: new Date(t.txnDate), label: isOut ? "Ödeme" : t.description || t.category, debit: 0, credit: isOut ? toNum(t.amount) : -toNum(t.amount), ref: "" });
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
    .where(sql`${orders.paymentStatus} <> 'paid'`);
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
      .select({ total: orders.totalAmount, paid: orders.paidAmount, status: orders.paymentStatus, createdAt: orders.createdAt })
      .from(orders),
    db.select({ amount: expenses.amount, date: expenses.expenseDate }).from(expenses),
    db.select({ amount: purchases.totalAmount, date: purchases.createdAt }).from(purchases),
  ]);

  let receivables = 0;
  let monthRevenue = 0;
  for (const o of orderRows) {
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
 * Aynı sipariş numarasından birden fazla varsa (eski yarış durumundan kalma
 * mükerrerler) en eskisini (en küçük id) tutup diğerlerini siler.
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
      await db.delete(orderItems).where(eq(orderItems.orderId, o.id));
      await db.delete(orders).where(eq(orders.id, o.id));
      removed++;
    }
  }
  return { removed };
}

export async function listOrderItems(orderId: number) {
  const db = await requireDb();
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
}

/** Tüm sipariş kalemleri (kârlılık analizi için toplu okuma). */
export async function listAllOrderItems() {
  const db = await requireDb();
  return db.select().from(orderItems);
}

/** Ürün bazında reçete maliyet satırları (hammadde miktarı × birim maliyet). */
export async function formulaCostRows() {
  const db = await requireDb();
  return db
    .select({
      productId: formulaItems.productId,
      qty: formulaItems.qty,
      unitCost: materials.unitCost,
    })
    .from(formulaItems)
    .leftJoin(materials, eq(formulaItems.materialId, materials.id));
}

/** Siparişin kalemlerini komple değiştirir (sil + yeniden ekle). */
export async function replaceOrderItems(
  orderId: number,
  items: Omit<InsertOrderItem, "orderId">[]
) {
  const db = await requireDb();
  // Sil + yeniden ekle tek transaction'da: insert başarısız olursa eski
  // kalemler geri gelir (sipariş kalemsiz/tutarsız kalmaz).
  await db.transaction(async tx => {
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.length > 0) {
      await tx.insert(orderItems).values(items.map(item => ({ ...item, orderId })));
    }
  });
}

export async function countOrdersToday() {
  const db = await requireDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` })
    .from(orders)
    .where(gte(orders.createdAt, start));
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
  return db.select().from(devTrialItems).where(eq(devTrialItems.trialId, chosen.id));
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
    orders: allOrders,
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
  // Fatura başlığı + hammadde güncelleme/oluşturma + stok hareketi + kalemler
  // tek transaction'da: yarıda kesilirse fatura ile stok/maliyet tutarsız kalmaz.
  return db.transaction(async tx => {
    const [res] = await tx.insert(purchases).values({
      supplierName: header.supplierName,
      invoiceNo: header.invoiceNo,
      invoiceDate: header.invoiceDate,
      note: header.note,
      totalAmount: String(total),
    });
    const purchaseId = Number(res.insertId);

    const existing = await tx.select().from(materials);
    const byName = new Map(existing.map(m => [m.name.trim().toLowerCase(), m]));
    let createdCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      const name = item.name.trim();
      const found = byName.get(name.toLowerCase());
      let materialId: number;
      if (!found) {
        const [r] = await tx.insert(materials).values({
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
        await tx
          .update(materials)
          .set({
            stockQty: sql`${materials.stockQty} + ${item.qty}`,
            unitCost: String(item.unitCost),
          })
          .where(eq(materials.id, found.id));
        updatedCount++;
      }
      await tx.insert(stockMovements).values({
        materialId,
        type: "in",
        qty: String(item.qty),
        note: `Fatura girişi${header.invoiceNo ? ` (${header.invoiceNo})` : ""}${header.supplierName ? ` — ${header.supplierName}` : ""}`,
      });
      await tx.insert(purchaseItems).values({
        purchaseId,
        materialId,
        name,
        qty: String(item.qty),
        unit: item.unit || "adet",
        unitCost: String(item.unitCost),
      });
    }
    return { purchaseId, createdCount, updatedCount };
  });
}

export async function listPurchases() {
  const db = await requireDb();
  const rows = await db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100);
  const items = await db.select().from(purchaseItems);
  return rows.map(p => ({ ...p, items: items.filter(i => i.purchaseId === p.id) }));
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
export async function bulkUpdatePrices(percent: number, series: string | null) {
  const db = await requireDb();
  const factor = 1 + percent / 100;
  const setExpr = { salePrice: sql`ROUND(${products.salePrice} * ${factor}, 2)` };
  const [result] = series
    ? await db.update(products).set(setExpr).where(eq(products.series, series))
    : await db.update(products).set(setExpr);
  return { affected: result.affectedRows ?? 0 };
}

/* ------------------------- Ayarlar (Şirket / Fatura) ------------------------- */

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
