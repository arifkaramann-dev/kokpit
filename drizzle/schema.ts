import {
  decimal,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Hammaddeler: pigment, solvent, şişe, etiket vb.
 * Kategori serbest genişletilebilir olsun diye enum yerine varchar tutuyoruz,
 * ama UI'da hazır kategoriler öneriyoruz.
 */
export const materials = mysqlTable("materials", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("diğer"),
  unit: varchar("unit", { length: 32 }).notNull().default("gr"),
  stockQty: decimal("stockQty", { precision: 12, scale: 3 }).notNull().default("0"),
  criticalQty: decimal("criticalQty", { precision: 12, scale: 3 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
  supplierId: int("supplierId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

/**
 * Stok hareketleri (giriş/çıkış) — izlenebilirlik için.
 */
export const stockMovements = mysqlTable("stockMovements", {
  id: int("id").autoincrement().primaryKey(),
  materialId: int("materialId").notNull(),
  type: mysqlEnum("type", ["in", "out"]).notNull(),
  qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StockMovement = typeof stockMovements.$inferSelect;

/**
 * Ürünler: ana ürün ve türev ürün aynı tabloda, self-referencing.
 * parentId NULL => ana ürün; parentId dolu => o ana ürünün türevi.
 * Türev tipi (surfaceType) serbest metin — tamamen esnek.
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  parentId: int("parentId"),
  name: varchar("name", { length: 255 }).notNull(),
  series: varchar("series", { length: 128 }),
  colorCode: varchar("colorCode", { length: 64 }),
  colorHex: varchar("colorHex", { length: 16 }),
  surfaceType: varchar("surfaceType", { length: 255 }),
  additives: text("additives"),
  description: text("description"),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }).notNull().default("0"),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).notNull().default("0"),
  packagingCost: decimal("packagingCost", { precision: 12, scale: 2 }).notNull().default("0"),
  shippingCost: decimal("shippingCost", { precision: 12, scale: 2 }).notNull().default("0"),
  packaging: varchar("packaging", { length: 128 }),
  labelSize: varchar("labelSize", { length: 64 }),
  labelText: text("labelText"),
  usageGuide: text("usageGuide"),
  safetyNotes: text("safetyNotes"),
  extraInfo: text("extraInfo"),
  isActive: int("isActive").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Formül kalemleri: her ürün (ana veya türev) bağımsız formül taşır.
 */
export const formulaItems = mysqlTable("formulaItems", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  materialId: int("materialId").notNull(),
  qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FormulaItem = typeof formulaItems.$inferSelect;

/**
 * Siparişler — kanban panosu için status alanı.
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNo: varchar("orderNo", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  channel: varchar("channel", { length: 64 }).default("web"),
  status: mysqlEnum("status", ["new", "production", "ready", "done"]).notNull().default("new"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  itemsSummary: text("itemsSummary"),
  notes: text("notes"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Sipariş kalemleri: her siparişte ürün + miktar + birim fiyat satırları.
 * Toplam tutar ve kart özeti bu satırlardan türetilir.
 */
export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * Ürün geliştirme projeleri — fikirden bitmiş ürüne 5 adımlı rehberli akış.
 * currentStep: 1 Tanım, 2 Reçete Denemeleri, 3 Test, 4 Maliyet/Fiyat, 5 Ürünleştirme.
 */
export const devProjects = mysqlTable("devProjects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  targetUse: text("targetUse"),
  series: varchar("series", { length: 128 }),
  colorCode: varchar("colorCode", { length: 64 }),
  colorHex: varchar("colorHex", { length: 16 }),
  status: mysqlEnum("status", ["active", "done", "archived"]).notNull().default("active"),
  currentStep: int("currentStep").notNull().default(1),
  applicationNotes: text("applicationNotes"),
  dryingTime: varchar("dryingTime", { length: 128 }),
  coats: varchar("coats", { length: 64 }),
  testNotes: text("testNotes"),
  description: text("description"),
  packaging: varchar("packaging", { length: 128 }),
  labelSize: varchar("labelSize", { length: 64 }),
  labelText: text("labelText"),
  usageGuide: text("usageGuide"),
  safetyNotes: text("safetyNotes"),
  packagingCost: decimal("packagingCost", { precision: 12, scale: 2 }).notNull().default("0"),
  shippingCost: decimal("shippingCost", { precision: 12, scale: 2 }).notNull().default("0"),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }).notNull().default("0"),
  productId: int("productId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DevProject = typeof devProjects.$inferSelect;
export type InsertDevProject = typeof devProjects.$inferInsert;

/** Reçete denemeleri: her deneme hammadde satırları taşır, biri "seçili" olur. */
export const devTrials = mysqlTable("devTrials", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  trialNo: int("trialNo").notNull(),
  result: mysqlEnum("result", ["pending", "success", "partial", "fail"])
    .notNull()
    .default("pending"),
  isChosen: int("isChosen").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DevTrial = typeof devTrials.$inferSelect;
export type InsertDevTrial = typeof devTrials.$inferInsert;

export const devTrialItems = mysqlTable("devTrialItems", {
  id: int("id").autoincrement().primaryKey(),
  trialId: int("trialId").notNull(),
  materialId: int("materialId").notNull(),
  qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DevTrialItem = typeof devTrialItems.$inferSelect;
export type InsertDevTrialItem = typeof devTrialItems.$inferInsert;

/**
 * Tedarikçiler.
 */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  suppliesText: text("suppliesText"),
  lastOrderDate: timestamp("lastOrderDate"),
  priceNotes: text("priceNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;

/**
 * Kampanyalar — takvim görünümü için tarih aralığı.
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  productGroup: varchar("productGroup", { length: 255 }),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  note: text("note"),
  status: mysqlEnum("status", ["planned", "active", "done"]).notNull().default("planned"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;

/**
 * AI üretilen pazarlama metinleri geçmişi.
 */
export const marketingTexts = mysqlTable("marketingTexts", {
  id: int("id").autoincrement().primaryKey(),
  contentType: varchar("contentType", { length: 64 }).notNull(),
  productName: varchar("productName", { length: 255 }),
  prompt: text("prompt"),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketingText = typeof marketingTexts.$inferSelect;

/**
 * Alış faturaları: hammadde girişlerinin kaynağı.
 * Kalemler hammaddelerle eşleşir; stok ve birim maliyet otomatik güncellenir.
 */
export const purchases = mysqlTable("purchases", {
  id: int("id").autoincrement().primaryKey(),
  supplierName: varchar("supplierName", { length: 255 }),
  invoiceNo: varchar("invoiceNo", { length: 64 }),
  invoiceDate: timestamp("invoiceDate"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Purchase = typeof purchases.$inferSelect;

export const purchaseItems = mysqlTable("purchaseItems", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  materialId: int("materialId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("adet"),
  unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PurchaseItem = typeof purchaseItems.$inferSelect;

/**
 * Şablon kütüphanesi: etiket yazısı, kılavuz, etiket boyutu, ambalaj, renk,
 * güvenlik metni gibi tekrar kullanılan içerikler tek yerde tanımlanır,
 * ürünlere seçilerek eklenir (pazaryeri/web sitesi aktarımına hazırlık).
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", [
    "etiket_boyutu",
    "etiket_yazisi",
    "kilavuz",
    "guvenlik",
    "ambalaj",
    "renk",
    "set_paket",
    "hammadde_kategori",
    "uygulama_yontemi",
    "kuruma_suresi",
    "kat_sayisi",
    "test_sonucu",
  ]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Template = typeof templates.$inferSelect;

/** Ürün görselleri: ana/pazarlama, ambalaj, kullanım örnekleri (base64). */
export const productImages = mysqlTable("productImages", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  kind: mysqlEnum("kind", ["main", "packaging", "usage"]).notNull(),
  // Base64 görseller 64KB'lık TEXT sınırına sığmaz; MEDIUMTEXT (16MB) kullanılır.
  data: mediumtext("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductImage = typeof productImages.$inferSelect;
