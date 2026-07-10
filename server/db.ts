import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  campaigns,
  devProjects,
  devTrialItems,
  devTrials,
  formulaItems,
  InsertDevProject,
  InsertMaterial,
  InsertOrder,
  InsertOrderItem,
  InsertProduct,
  InsertUser,
  marketingTexts,
  materials,
  orderItems,
  orders,
  products,
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

export async function getOrderByOrderNo(orderNo: string) {
  const db = await requireDb();
  const result = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
  return result[0];
}

export async function listOrderItems(orderId: number) {
  const db = await requireDb();
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
}

/** Siparişin kalemlerini komple değiştirir (sil + yeniden ekle). */
export async function replaceOrderItems(
  orderId: number,
  items: Omit<InsertOrderItem, "orderId">[]
) {
  const db = await requireDb();
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length > 0) {
    await db.insert(orderItems).values(items.map(item => ({ ...item, orderId })));
  }
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
