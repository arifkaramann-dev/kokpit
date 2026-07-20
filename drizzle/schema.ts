import {
  decimal,
  index,
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
  companyId: int("companyId").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("diğer"),
  unit: varchar("unit", { length: 32 }).notNull().default("gr"),
  stockQty: decimal("stockQty", { precision: 12, scale: 3 }).notNull().default("0"),
  criticalQty: decimal("criticalQty", { precision: 12, scale: 3 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
  // Raf ömrü (gün): parti (lot) oluşurken SKT bundan otomatik hesaplanır
  // (SKT = giriş tarihi + shelfLifeDays). NULL = sınırsız ömür (SKT takibi yok).
  shelfLifeDays: int("shelfLifeDays"),
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
export const stockMovements = mysqlTable(
  "stockMovements",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    materialId: int("materialId").notNull(),
    type: mysqlEnum("type", ["in", "out"]).notNull(),
    qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("stockMovements_materialId_idx").on(t.materialId)],
);

export type StockMovement = typeof stockMovements.$inferSelect;

/**
 * Ürün serileri (CANDY, METEOR, GLOSS...): seri bazlı kâr oranı, KDV ve
 * hazır pazarlama metinleri. Ürün oluştururken "otomatik doldur" bu tablodan
 * beslenir; fiyat önerisi = maliyet × (1 + kâr oranı).
 */
export const productSeries = mysqlTable("productSeries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  name: varchar("name", { length: 128 }).notNull(),
  profitMargin: decimal("profitMargin", { precision: 5, scale: 2 }).notNull().default("35"),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }).notNull().default("20"),
  category: varchar("category", { length: 64 }),
  shortDescription: mediumtext("shortDescription"),
  longDescription: mediumtext("longDescription"),
  applicationText: mediumtext("applicationText"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductSeries = typeof productSeries.$inferSelect;
export type InsertProductSeries = typeof productSeries.$inferInsert;

/**
 * Ürünler: ana ürün ve türev ürün aynı tabloda, self-referencing.
 * parentId NULL => ana ürün; parentId dolu => o ana ürünün türevi.
 * Türev tipi (surfaceType) serbest metin — tamamen esnek.
 */
export const products = mysqlTable(
  "products",
  {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
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
  // Pazaryeri eşleştirmesi için barkod (Trendyol/Hepsiburada bununla eşler).
  barcode: varchar("barcode", { length: 64 }),
  stockQty: int("stockQty").notNull().default(0),
  // Mamul kritik stok eşiği: 0 = takip yok; stok bu eşiğin altına inince
  // düşük stok uyarısı verilir (Stok Nöbetçisi + Ürünler sayfası filtresi).
  criticalQty: int("criticalQty").notNull().default(0),
  labelSize: varchar("labelSize", { length: 64 }),
  labelText: text("labelText"),
  usageGuide: text("usageGuide"),
  safetyNotes: text("safetyNotes"),
  extraInfo: text("extraInfo"),
  // Pazaryeri ürün kartı alanları (ÜRÜN KAYIT Excel paritesi).
  // sku = satıcı stok kodu; barkodla aynı olabilir ama ayrı tutulur.
  sku: varchar("sku", { length: 64 }),
  category: varchar("category", { length: 64 }),
  // NULL = seriden/varsayılandan gelir; dolu = ürüne özel değer.
  profitMargin: decimal("profitMargin", { precision: 5, scale: 2 }),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }),
  desi: decimal("desi", { precision: 8, scale: 2 }),
  paintType: varchar("paintType", { length: 64 }),
  // JSON dizi: ["Hızlı Kuruma","Parlak",...] — en fazla 5 özellik.
  features: text("features"),
  shortDescription: mediumtext("shortDescription"),
  longDescription: mediumtext("longDescription"),
  applicationText: mediumtext("applicationText"),
  // JSON dizi: harici görsel linkleri (gorsel1..4 paritesi).
  imageUrls: text("imageUrls"),
  videoUrl: varchar("videoUrl", { length: 512 }),
  mockupUrl: varchar("mockupUrl", { length: 512 }),
  labelWarnings: text("labelWarnings"),
  // Mamul raf ömrü (gün): üretim partisi oluşurken SKT bundan hesaplanır
  // (SKT = üretim tarihi + shelfLifeDays). NULL = SKT takibi yok.
  shelfLifeDays: int("shelfLifeDays"),
  isActive: int("isActive").notNull().default(1),
  // Yaşam döngüsü: taslak = kart eksik/yayına hazır değil; satista = aktif satış;
  // arsiv = satıştan kalktı (isActive=0 ile eş anlamlı, geriye uyum için ikisi de yazılır).
  // Pazaryeri push yalnızca "satista" ürünleri gönderir.
  status: mysqlEnum("status", ["taslak", "satista", "arsiv"]).notNull().default("satista"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("products_parentId_idx").on(t.parentId), index("products_barcode_idx").on(t.barcode)],
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Formül kalemleri: her ürün (ana veya türev) bağımsız formül taşır.
 */
export const formulaItems = mysqlTable(
  "formulaItems",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    productId: int("productId").notNull(),
    materialId: int("materialId").notNull(),
    qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("formulaItems_productId_idx").on(t.productId),
    index("formulaItems_materialId_idx").on(t.materialId),
  ],
);

export type FormulaItem = typeof formulaItems.$inferSelect;

/**
 * Siparişler — kanban panosu için status alanı.
 */
export const orders = mysqlTable(
  "orders",
  {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  orderNo: varchar("orderNo", { length: 32 }).notNull(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  // Cari bağ: müşteri kaydına ID ile bağlanır (isim yalnızca görüntü/yedek).
  // NULL = CRM'de kaydı olmayan müşteri (ör. pazaryeri müşterisi).
  customerId: int("customerId"),
  channel: varchar("channel", { length: 64 }).default("web"),
  // cancelled = iptal/iade: ciro-cari-KDV hesaplarına girmez, mamul stoğu iade edilir.
  status: mysqlEnum("status", ["new", "production", "ready", "done", "cancelled"]).notNull().default("new"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  itemsSummary: text("itemsSummary"),
  notes: text("notes"),
  // Müşteri iletişim/teslimat bilgisi (kargo etiketi ve fatura için).
  customerPhone: varchar("customerPhone", { length: 64 }),
  customerAddress: varchar("customerAddress", { length: 512 }),
  // Ödeme & tahsilat: bekleyen alacakları takip etmek için.
  paymentStatus: mysqlEnum("paymentStatus", ["unpaid", "partial", "paid"]).notNull().default("unpaid"),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  // Pazaryeri kargo bilgileri (Trendyol vb.): resmi etiket çekmek ve takip için.
  cargoTrackingNumber: varchar("cargoTrackingNumber", { length: 64 }),
  cargoProviderName: varchar("cargoProviderName", { length: 128 }),
  cargoTrackingLink: varchar("cargoTrackingLink", { length: 512 }),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("orders_orderNo_idx").on(t.orderNo),
    index("orders_customerId_idx").on(t.customerId),
    index("orders_createdAt_idx").on(t.createdAt),
  ],
);

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Sipariş kalemleri: her siparişte ürün + miktar + birim fiyat satırları.
 * Toplam tutar ve kart özeti bu satırlardan türetilir.
 */
export const orderItems = mysqlTable(
  "orderItems",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    orderId: int("orderId").notNull(),
    productName: varchar("productName", { length: 255 }).notNull(),
    // Ürün bağ: ürün bazlı satış/kâr raporu ve stok düşümü için ID.
    // NULL = katalogda eşleşmeyen serbest kalem.
    productId: int("productId"),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("orderItems_orderId_idx").on(t.orderId),
    index("orderItems_productId_idx").on(t.productId),
  ],
);

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * Müşteriler (CRM): elden/web satışlarda tekrar kullanılan ad, telefon, adres.
 * Sipariş formunda seçilince iletişim/teslimat bilgisi siparişe kopyalanır.
 */
export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),
    address: varchar("address", { length: 512 }),
    city: varchar("city", { length: 128 }),
    // e-Fatura/e-Arşiv için: 10 hane VKN (kurumsal → e-fatura) / 11 hane TCKN
    // (bireysel → e-arşiv). Boşsa e-arşiv varsayılır.
    taxNumber: varchar("taxNumber", { length: 32 }),
    taxOffice: varchar("taxOffice", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("customers_name_idx").on(t.name)],
);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * CRM satış boru hattı (lead → fırsat): potansiyel müşteri, kaynak ve aşama.
 * Kazanılınca müşteri kaydına (customerId) ve/veya teklife bağlanır. Teklif/
 * sipariş modülü zaten var; buradaki tek eksik "lead" öncesi aşama.
 */
export const leads = mysqlTable(
  "leads",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),
    // Kaynak: instagram / whatsapp / pazaryeri / referans / web / diğer (serbest).
    source: varchar("source", { length: 64 }).notNull().default("diğer"),
    // Boru hattı aşaması: yeni → iletişim → teklif → kazanıldı / kaybedildi.
    stage: mysqlEnum("stage", ["yeni", "iletisim", "teklif", "kazanildi", "kaybedildi"]).notNull().default("yeni"),
    // Tahmini fırsat değeri (KDV dahil, TL) — boru hattı toplamı için.
    estimatedValue: decimal("estimatedValue", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note"),
    // Kazanılınca bağlanan müşteri/teklif (izlenebilirlik).
    customerId: int("customerId"),
    quoteId: int("quoteId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("leads_stage_idx").on(t.stage)],
);

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * Giderler: hammadde/alış dışındaki işletme masrafları (kira, kargo, reklam,
 * komisyon vb.). Kâr/zarar raporu bunları cirodan düşer.
 */
export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  expenseDate: timestamp("expenseDate").defaultNow().notNull(),
  category: varchar("category", { length: 64 }).notNull().default("diğer"),
  description: varchar("description", { length: 255 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

/**
 * Kasa & Banka hesapları (ön muhasebe). Her para hareketi bir hesaba işlenir;
 * bakiye = açılış + gelen − giden.
 */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  name: varchar("name", { length: 128 }).notNull(),
  kind: mysqlEnum("kind", ["kasa", "banka"]).notNull().default("kasa"),
  openingBalance: decimal("openingBalance", { precision: 14, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/**
 * Birleşik para/cari hareketi: tahsilat, ödeme, gider, gelir, transfer.
 * direction in=giren (tahsilat/gelir), out=çıkan (ödeme/gider).
 * customerName ile cari (müşteri) ekstresine, orderId ile siparişe bağlanır.
 */
export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    txnDate: timestamp("txnDate").defaultNow().notNull(),
    accountId: int("accountId"),
    direction: mysqlEnum("direction", ["in", "out"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    category: varchar("category", { length: 48 }).notNull().default("diğer"),
    customerName: varchar("customerName", { length: 255 }),
    // Cari bağ (V2 göçü): hareket müşteri/tedarikçi kaydına ID ile bağlanır;
    // isim alanları görüntü ve geçmiş uyumluluğu için kalır.
    customerId: int("customerId"),
    supplierName: varchar("supplierName", { length: 255 }),
    supplierId: int("supplierId"),
    orderId: int("orderId"),
    orderNo: varchar("orderNo", { length: 32 }),
    description: varchar("description", { length: 255 }),
    method: varchar("method", { length: 64 }),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("transactions_customerId_idx").on(t.customerId),
    index("transactions_supplierId_idx").on(t.supplierId),
    index("transactions_accountId_idx").on(t.accountId),
    index("transactions_orderId_idx").on(t.orderId),
    index("transactions_txnDate_idx").on(t.txnDate),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Çek & Senet portföyü. direction alinan=müşteriden aldığımız (tahsil edilecek),
 * verilen=tedarikçiye verdiğimiz (ödeyeceğimiz). status ile durum izlenir.
 */
export const cheques = mysqlTable("cheques", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  type: mysqlEnum("type", ["cek", "senet"]).notNull().default("cek"),
  direction: mysqlEnum("direction", ["alinan", "verilen"]).notNull().default("alinan"),
  partyName: varchar("partyName", { length: 255 }),
  bank: varchar("bank", { length: 128 }),
  serialNo: varchar("serialNo", { length: 64 }),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("dueDate"),
  status: mysqlEnum("status", ["portfoyde", "tahsil", "odendi", "karsiliksiz", "iade"]).notNull().default("portfoyde"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Cheque = typeof cheques.$inferSelect;
export type InsertCheque = typeof cheques.$inferInsert;

/**
 * Ürün geliştirme projeleri — fikirden bitmiş ürüne 5 adımlı rehberli akış.
 * currentStep: 1 Tanım, 2 Reçete Denemeleri, 3 Test, 4 Maliyet/Fiyat, 5 Ürünleştirme.
 */
export const devProjects = mysqlTable("devProjects", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
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
  companyId: int("companyId").notNull().default(1),
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
  companyId: int("companyId").notNull().default(1),
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
export const suppliers = mysqlTable(
  "suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    name: varchar("name", { length: 255 }).notNull(),
    contactPerson: varchar("contactPerson", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),
    suppliesText: text("suppliesText"),
    lastOrderDate: timestamp("lastOrderDate"),
    priceNotes: text("priceNotes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("suppliers_name_idx").on(t.name)],
);

export type Supplier = typeof suppliers.$inferSelect;

/**
 * Kampanyalar — takvim görünümü için tarih aralığı.
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
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
  companyId: int("companyId").notNull().default(1),
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
export const purchases = mysqlTable(
  "purchases",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    supplierName: varchar("supplierName", { length: 255 }),
    // Cari bağ: tedarikçi kaydına ID ile (isim görüntü/yedek).
    supplierId: int("supplierId"),
    invoiceNo: varchar("invoiceNo", { length: 64 }),
    invoiceDate: timestamp("invoiceDate"),
    // KDV matrahı (net, Σ qty×unitCost). Kâr/maliyet tabanı bu net tutardır.
    netTotal: decimal("netTotal", { precision: 12, scale: 2 }).notNull().default("0"),
    // İndirilecek KDV toplamı (satır bazlı gerçek oranlardan). KDV raporu bunu kullanır.
    vatTotal: decimal("vatTotal", { precision: 12, scale: 2 }).notNull().default("0"),
    // BRÜT toplam = net + KDV. Tedarikçiye fiilen ödenen; tedarikçi carisi bunu görür.
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("purchases_supplierId_idx").on(t.supplierId)],
);

export type Purchase = typeof purchases.$inferSelect;

export const purchaseItems = mysqlTable(
  "purchaseItems",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    purchaseId: int("purchaseId").notNull(),
    materialId: int("materialId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull().default("adet"),
    // Birim maliyet KDV HARİÇ (net) saklanır — kâr/maliyet tabanı.
    unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
    // Satır KDV oranı (%). Fatura okumadan gelir; yoksa 20 varsayılır. İndirilecek KDV bundan.
    vatRate: decimal("vatRate", { precision: 5, scale: 2 }).notNull().default("20"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("purchaseItems_purchaseId_idx").on(t.purchaseId),
    index("purchaseItems_materialId_idx").on(t.materialId),
  ],
);

export type PurchaseItem = typeof purchaseItems.$inferSelect;

/**
 * Şablon kütüphanesi: etiket yazısı, kılavuz, etiket boyutu, ambalaj, renk,
 * güvenlik metni gibi tekrar kullanılan içerikler tek yerde tanımlanır,
 * ürünlere seçilerek eklenir (pazaryeri/web sitesi aktarımına hazırlık).
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
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
    "ozellik",
    "urun_turu",
    "zemin",
    "kategori",
  ]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Template = typeof templates.$inferSelect;

/** Ürün görselleri: ana/pazarlama, ambalaj, kullanım örnekleri (base64). */
export const productImages = mysqlTable(
  "productImages",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    productId: int("productId").notNull(),
    kind: mysqlEnum("kind", ["main", "packaging", "usage"]).notNull(),
    // Base64 görseller 64KB'lık TEXT sınırına sığmaz; MEDIUMTEXT (16MB) kullanılır.
    data: mediumtext("data").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("productImages_productId_kind_idx").on(t.productId, t.kind)],
);

export type ProductImage = typeof productImages.$inferSelect;

/**
 * Görevler ve eksik (alınacaklar) listesi: uygulamadan elle veya
 * WhatsApp/sesli asistanla ("eksik listesine ekle...") yönetilir.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  kind: mysqlEnum("kind", ["eksik", "gorev"]).notNull().default("gorev"),
  title: varchar("title", { length: 500 }).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["open", "done"]).notNull().default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  doneAt: timestamp("doneAt"),
});

export type Task = typeof tasks.$inferSelect;

/**
 * Mamul (bitmiş ürün) stok hareketleri: üretim girişi, satış çıkışı,
 * iptal/iade girişi, elle düzeltme. products.stockQty bu hareketlerle yürür;
 * eksi bakiye "üretilmesi gereken" sinyalidir.
 */
export const productMovements = mysqlTable(
  "productMovements",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    productId: int("productId").notNull(),
    type: mysqlEnum("type", ["in", "out"]).notNull(),
    qty: decimal("qty", { precision: 12, scale: 2 }).notNull(),
    note: text("note"),
    orderId: int("orderId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("productMovements_productId_idx").on(t.productId),
    index("productMovements_orderId_idx").on(t.orderId),
  ],
);

export type ProductMovement = typeof productMovements.$inferSelect;

/**
 * Üretim emri kayıtları: ne zaman, hangi üründen kaç adet üretildi.
 * Hammadde düşümü stockMovements'a, mamul girişi productMovements'a işlenir.
 */
export const productionRuns = mysqlTable(
  "productionRuns",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    productId: int("productId").notNull(),
    qty: int("qty").notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("productionRuns_productId_idx").on(t.productId)],
);

export type ProductionRun = typeof productionRuns.$inferSelect;

/**
 * Bildirim merkezi: zamanlayıcı/nöbetçi ajanların ve sistem olaylarının
 * kullanıcıya düşen kayıtları. WhatsApp'a da kopyalanabilir (notifyOwner).
 */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
    kind: varchar("kind", { length: 48 }).notNull().default("genel"),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    link: varchar("link", { length: 255 }),
    status: mysqlEnum("status", ["unread", "read"]).notNull().default("unread"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("notifications_status_idx").on(t.status), index("notifications_createdAt_idx").on(t.createdAt)],
);

export type Notification = typeof notifications.$inferSelect;

/**
 * Teklifler: siparişe dönüşmeden önceki fiyat teklifi aşaması (Bizimhesap
 * paritesi). Kabul edilen teklif tek tıkla siparişe dönüştürülür; orderId
 * dönüşen siparişi işaret eder. Teklif stok/ciro/cari hesaplarına GİRMEZ —
 * bu hesaplar ancak dönüşen sipariş üzerinden çalışır.
 */
export const quotes = mysqlTable(
  "quotes",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    quoteNo: varchar("quoteNo", { length: 32 }).notNull(),
    customerName: varchar("customerName", { length: 255 }).notNull(),
    customerId: int("customerId"),
    customerPhone: varchar("customerPhone", { length: 64 }),
    customerAddress: varchar("customerAddress", { length: 512 }),
    status: mysqlEnum("status", ["draft", "sent", "accepted", "rejected", "expired", "converted"])
      .notNull()
      .default("draft"),
    validUntil: timestamp("validUntil"),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
    itemsSummary: text("itemsSummary"),
    notes: text("notes"),
    orderId: int("orderId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("quotes_quoteNo_idx").on(t.quoteNo),
    index("quotes_customerId_idx").on(t.customerId),
    index("quotes_createdAt_idx").on(t.createdAt),
  ],
);

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

export const quoteItems = mysqlTable(
  "quoteItems",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    quoteId: int("quoteId").notNull(),
    productName: varchar("productName", { length: 255 }).notNull(),
    productId: int("productId"),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("quoteItems_quoteId_idx").on(t.quoteId)],
);

export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;

/**
 * Genel ayarlar (anahtar-değer): şirket/fatura bilgileri, fatura sayaç no vb.
 * Esnek olsun diye tek satırlık bir tablo yerine anahtar-değer tercih edildi.
 */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

/**
 * Pazaryeri/müşteri soru-cevap kuyruğu (Helpdesk). Trendyol/HB/N11/Çiçeksepeti
 * soruları + WhatsApp/e-posta soruları tek kuyrukta toplanır; AI cevap taslağı
 * üretilir, onaylanınca yanıtlanmış işaretlenir. Soru çekme canlıda pazaryeri
 * API'siyle beslenir; bu tablo kuyruğu + cevap akışını tutar.
 */
export const marketplaceQuestions = mysqlTable(
  "marketplaceQuestions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    source: mysqlEnum("source", ["trendyol", "hepsiburada", "n11", "ciceksepeti", "whatsapp", "email", "elle"]).notNull().default("elle"),
    // Pazaryerindeki soru kimliği (çift kayıt önleme); elle eklenende boş.
    externalId: varchar("externalId", { length: 128 }),
    customerName: varchar("customerName", { length: 255 }),
    questionText: text("questionText").notNull(),
    // İlgili ürün (varsa) — cevap taslağı ürün kılavuzundan beslenir.
    productId: int("productId"),
    productName: varchar("productName", { length: 255 }),
    status: mysqlEnum("status", ["new", "answered", "dismissed"]).notNull().default("new"),
    answerDraft: text("answerDraft"),
    answerText: text("answerText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    answeredAt: timestamp("answeredAt"),
  },
  t => [
    index("mpQuestions_status_idx").on(t.status),
    index("mpQuestions_source_ext_idx").on(t.source, t.externalId),
  ],
);

export type MarketplaceQuestion = typeof marketplaceQuestions.$inferSelect;
export type InsertMarketplaceQuestion = typeof marketplaceQuestions.$inferInsert;

/**
 * Hammadde partileri (lot) — boya dikeyinin izlenebilirlik katmanı.
 * Her alış (createPurchase) ya da elle stok girişi bir parti oluşturur; SKT
 * (raf ömrü) ve parti maliyeti burada tutulur. ÖNEMLİ: materials.stockQty
 * OTORİTER kalır (pazaryeri stok gönderiminin tek kaynağı); bu tablo yalnızca
 * izlenebilirlik/SKT amaçlıdır. Üretim tüketimi remainingQty'den FIFO-SKT ile
 * düşer ama tek-havuz toplamı bozulmaz.
 */
export const materialLots = mysqlTable(
  "materialLots",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    materialId: int("materialId").notNull(),
    // Parti numarası: verilmezse LOT-YYMMDD-<materialId>-<n> ile otomatik üretilir.
    lotNo: varchar("lotNo", { length: 64 }).notNull(),
    receivedDate: timestamp("receivedDate").defaultNow().notNull(),
    // SKT — nullable: raf ömrü tanımsız hammaddede boş kalır.
    expiryDate: timestamp("expiryDate"),
    qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
    // Kalan miktar: FIFO-SKT tüketiminde düşer; 0 = parti tükendi.
    remainingQty: decimal("remainingQty", { precision: 12, scale: 3 }).notNull(),
    // Birim maliyet KDV HARİÇ (net) — Tema 0 konvansiyonu.
    unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
    supplierId: int("supplierId"),
    purchaseId: int("purchaseId"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("materialLots_materialId_idx").on(t.materialId),
    index("materialLots_expiryDate_idx").on(t.expiryDate),
    index("materialLots_purchaseId_idx").on(t.purchaseId),
  ],
);

export type MaterialLot = typeof materialLots.$inferSelect;
export type InsertMaterialLot = typeof materialLots.$inferInsert;

/**
 * Mamul üretim partileri — her üretim emri bir parti oluşturur. batchNo + SKT
 * izlenebilirlik ve kalite kontrol hedefidir. products.stockQty OTORİTER kalır;
 * bu tablo ek/izlenebilirlik katmanıdır.
 */
export const productBatches = mysqlTable(
  "productBatches",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    productId: int("productId").notNull(),
    // Parti numarası: verilmezse PARTI-YYMMDD-<productId>-<n> ile otomatik üretilir.
    batchNo: varchar("batchNo", { length: 64 }).notNull(),
    producedDate: timestamp("producedDate").defaultNow().notNull(),
    expiryDate: timestamp("expiryDate"),
    qty: decimal("qty", { precision: 12, scale: 2 }).notNull(),
    productionRunId: int("productionRunId"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("productBatches_productId_idx").on(t.productId),
    index("productBatches_expiryDate_idx").on(t.expiryDate),
    index("productBatches_runId_idx").on(t.productionRunId),
  ],
);

export type ProductBatch = typeof productBatches.$inferSelect;
export type InsertProductBatch = typeof productBatches.$inferInsert;

/**
 * Kalite kontrol testleri — bir mamul partisi / hammadde partisi / üretim emri
 * için ölçümler (pH, viskozite, örtücülük, ΔE) + geçti/kaldı sonucu. Hedef
 * alanlardan tam biri dolu olur (productBatchId ya da materialLotId ya da
 * productionRunId).
 */
export const qcTests = mysqlTable(
  "qcTests",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    productBatchId: int("productBatchId"),
    materialLotId: int("materialLotId"),
    productionRunId: int("productionRunId"),
    ph: decimal("ph", { precision: 5, scale: 2 }),
    viscosity: decimal("viscosity", { precision: 10, scale: 2 }),
    opacity: decimal("opacity", { precision: 6, scale: 2 }),
    deltaE: decimal("deltaE", { precision: 6, scale: 2 }),
    result: mysqlEnum("result", ["gecti", "kaldi", "beklemede"]).notNull().default("beklemede"),
    note: text("note"),
    testedBy: varchar("testedBy", { length: 128 }),
    testedAt: timestamp("testedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("qcTests_productBatchId_idx").on(t.productBatchId),
    index("qcTests_materialLotId_idx").on(t.materialLotId),
    index("qcTests_result_idx").on(t.result),
  ],
);

export type QcTest = typeof qcTests.$inferSelect;
export type InsertQcTest = typeof qcTests.$inferInsert;

/**
 * Asistan onay katmanı — bekleyen (onay bekleyen) yazma komutları. Kritik/onaylı
 * bir komut HEMEN uygulanmaz; ayrıştırılmış komut burada saklanır, kullanıcı
 * "evet" deyince uygulanır. sessionKey oturumu ayırır ("wa:<numara>" WhatsApp,
 * "app:<userId>" uygulama içi) ve TEKİLDİR — oturum başına tek bekleyen eylem
 * (yeni komut eskisini ezer). expiresAt'ten sonra geçersiz sayılır (kısa TTL).
 * In-memory YERİNE kalıcı: Render ücretsiz plan uyku/yeniden başlatmada uçmasın.
 */
export const assistantPendingActions = mysqlTable(
  "assistantPendingActions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    sessionKey: varchar("sessionKey", { length: 128 }).notNull().unique(),
    transcript: text("transcript").notNull(),
    /** Ayrıştırılmış VoiceCommand (JSON serileştirilmiş). */
    payload: text("payload").notNull(),
    intentClass: varchar("intentClass", { length: 16 }).notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  t => [index("assistantPendingActions_expiresAt_idx").on(t.expiresAt)],
);

export type AssistantPendingAction = typeof assistantPendingActions.$inferSelect;
export type InsertAssistantPendingAction = typeof assistantPendingActions.$inferInsert;
