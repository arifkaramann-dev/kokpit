import {
  decimal,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  unique,
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
  // Kalem türü (çok seviyeli reçete / BOM): hammadde satın alınır, yarı mamul
  // ÜRETİLİR (kendi formülü vardır ve başka reçetelere girdi olur), ambalaj
  // şişe/kapak/etiket gibi adetli kalemdir, masraf kapasiteye girmez.
  // Mevcut `category` alanı serbest metin olarak kalır (rapor/gruplama).
  type: mysqlEnum("type", ["hammadde", "yari_mamul", "ambalaj", "masraf"])
    .notNull()
    .default("hammadde"),
  stockQty: decimal("stockQty", { precision: 12, scale: 3 }).notNull().default("0"),
  // Açık siparişler için ayrılmış miktar. Satılabilir = stok − rezerve − emniyet.
  // Sipariş geldiğinde artar, üretim yapılınca stoktan düşülüp rezerv kapanır.
  reservedQty: decimal("reservedQty", { precision: 12, scale: 3 }).notNull().default("0"),
  // Hiç dokunulmayan tampon (yavaş tedarik edilen kalemlerde >0 tutulur).
  safetyQty: decimal("safetyQty", { precision: 12, scale: 3 }).notNull().default("0"),
  criticalQty: decimal("criticalQty", { precision: 12, scale: 3 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
  supplierId: int("supplierId"),
  // Ürün motoru v2: hammadde kalite seviyesi (premium / orta / eko) — reçete
  // önerisi ve maliyet katmanlandırması için. Serbest metin yerine sabit set.
  tier: varchar("tier", { length: 20 }),
  // Birim başı fiyat (unitCost'tan daha hassas 4 ondalık) — reçete/varyant maliyeti.
  pricePerUnit: decimal("pricePerUnit", { precision: 10, scale: 4 }),
  // Tedarikçi adı (serbest metin; supplierId ilişkiye bağlı kalırken bu hızlı gösterim).
  supplier: varchar("supplier", { length: 100 }),
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
  /**
   * Serinin satış adındaki karşılığı — "CANDY" değil "CANDY PAINT".
   * Satış adı buradan kurulur; boşsa serinin kendi adı kullanılır.
   */
  nameEn: varchar("nameEn", { length: 128 }),
  profitMargin: decimal("profitMargin", { precision: 5, scale: 2 }).notNull().default("35"),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }).notNull().default("20"),
  category: varchar("category", { length: 64 }),
  shortDescription: mediumtext("shortDescription"),
  longDescription: mediumtext("longDescription"),
  applicationText: mediumtext("applicationText"),
  // Seri bazlı SSS / blog metni (web sitesinde ürünün altında kullanılır).
  // Ürün bazlı değil seri bazlıdır; varyantlarda sadece renk/gramaj değişir.
  faqContent: mediumtext("faqContent"),
  // Ürün motoru v2: otomatik renk/ürün kodu ön eki. Örn. CANDY → "CND",
  // AIRBRUSH → "ARB". Kod = prefix + 4 haneli sıra no (CND0042).
  prefix: varchar("prefix", { length: 10 }),
  // Ambalaj seçenekleri: [{label:"50ml", value:"50ml"}, ...] — geliştirme
  // projesinde bu listeden hangi boyutlarda üretileceği seçilir.
  packagingOptions: json("packagingOptions"),
  // Uygulanabilir yüzeyler: ["Araç","3D Baskı","Rapala","Ahşap"...] — hedef
  // yüzey seçimi bu şablondan gelir (serbest metin yerine).
  applicationSurfaces: json("applicationSurfaces"),
  // Renk seçenekleri: [{label:"Mavi", value:"MAVI", hex:"#1a2b5c"}, ...] —
  // geliştirme projesinde bu listeden hangi renklerin üretileceği seçilir.
  // Varyantlar Renk × Ambalaj matrisi olarak üretilir.
  colorOptions: json("colorOptions"),
  // Kullanım kılavuzu şablonu. Değişkenler: {{renk}}, {{seri}}, {{ambalaj}}.
  guideTemplate: text("guideTemplate"),
  // Etiket içerik şablonu (aynı değişkenler desteklenir).
  labelTemplate: text("labelTemplate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductSeries = typeof productSeries.$inferSelect;
export type InsertProductSeries = typeof productSeries.$inferInsert;



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
    /**
     * Pazaryerinden gelen satıcı kodu / barkod.
     *
     * Bu değer siparişle birlikte geliyordu ama saklanmıyordu; yalnız eski
     * `products` eşleşmesinde kullanılıp atılıyordu. Sonuç: kendi ürettiğimiz
     * `channelListings.channelBarcode` ile geri gelen barkod hiç
     * karşılaştırılamıyor, sipariş↔ürün bağı her okumada başlık benzerliğiyle
     * TAHMİN ediliyordu. Saklamak o tahmini kesin eşleşmeye çevirir.
     */
    channelRef: varchar("channelRef", { length: 64 }),
    /**
     * v3 master bağı — bir kez çözülür ve yazılır.
     *
     * Kalıcı olması şart: ilan başlığı pazaryerinde düzenlenince (SEO için sık
     * yapılır) geçmiş siparişlerin bağı kopmasın. Ayrıca master başına ciro/kâr
     * raporu ancak bu kolonla yazılabilir.
     */
    masterId: int("masterId"),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("orderItems_orderId_idx").on(t.orderId),
    index("orderItems_productId_idx").on(t.productId),
    index("orderItems_master_idx").on(t.masterId),
    index("orderItems_channelRef_idx").on(t.channelRef),
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
    // Fatura/muhasebe bilgileri — cari kartında tutulur, faturaya taşınır.
    taxOffice: varchar("taxOffice", { length: 128 }), // vergi dairesi
    taxNumber: varchar("taxNumber", { length: 32 }), // VKN (10 hane) veya TCKN (11 hane)
    eInvoice: mysqlEnum("eInvoice", ["bilinmiyor", "efatura", "earsiv"]).notNull().default("bilinmiyor"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("customers_name_idx").on(t.name)],
);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

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
  // Ürün motoru v2: seri prefix + sıra no ile otomatik üretilen ürün kodu (örn. CND0042).
  autoCode: varchar("autoCode", { length: 50 }),
  // Bu proje için seçilen hedef yüzeyler (serinin applicationSurfaces alt kümesi).
  targetSurfaces: json("targetSurfaces"),
  // Bu proje için seçilen ambalaj boyutları (serinin packagingOptions alt kümesi).
  packagingSelection: json("packagingSelection"),
  // Bu proje için seçilen renkler (serinin colorOptions alt kümesi).
  // [{label:"Mavi", value:"MAVI", hex:"#1a2b5c"}, ...] biçiminde tutulur.
  colorSelection: json("colorSelection"),
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
 * Ürün motoru v2 — Ürünleştirme (Adım 5) onay akışının çıktıları.
 * Her seçili ambalaj için bir varyant kaydı açılır; AI ile üretilen pazaryeri
 * başlık/açıklamaları, etiket metni, kullanım kılavuzu ve uygulama notları burada
 * tutulur. Kullanıcı düzenleyip kaydedebilir, ardından Excel/pazaryeri aktarımı yapılır.
 */
export const productGenerations = mysqlTable(
  "productGenerations",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    projectId: int("projectId").notNull(),
    // Varyant kodu: proje autoCode + renk + ambalaj (örn. CND0042-MAVI-100ml).
    variantCode: varchar("variantCode", { length: 120 }).notNull(),
    packaging: varchar("packaging", { length: 64 }).notNull(),
    // Varyantın rengi (etiket/değeri) ve hex kodu. Renksiz varyantlarda boş.
    color: varchar("color", { length: 64 }),
    colorHex: varchar("colorHex", { length: 16 }),
    // AI üretilmiş görseller (isteğe bağlı, Ürün Çıktıları ekranından üretilir).
    beforeAfterImageUrl: text("beforeAfterImageUrl"),
    packagingImageUrl: text("packagingImageUrl"),
    marketingImageUrl: text("marketingImageUrl"),
    // Ürünlere aktarıldığında oluşturulan türev (varyant) ürünün ID'si. Boşsa henüz aktarılmamış.
    productId: int("productId"),
    status: mysqlEnum("status", ["generating", "ready", "listed", "error"]).notNull().default("ready"),
    trendyolTitle: varchar("trendyolTitle", { length: 255 }),
    trendyolDescription: mediumtext("trendyolDescription"),
    hepsiburadaTitle: varchar("hepsiburadaTitle", { length: 255 }),
    hepsiburadaDescription: mediumtext("hepsiburadaDescription"),
    labelContent: text("labelContent"),
    guideContent: text("guideContent"),
    applicationNotes: text("applicationNotes"),
    suggestedPrice: decimal("suggestedPrice", { precision: 12, scale: 2 }).notNull().default("0"),
    costPrice: decimal("costPrice", { precision: 12, scale: 2 }).notNull().default("0"),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("productGenerations_projectId_idx").on(t.projectId)],
);

export type ProductGeneration = typeof productGenerations.$inferSelect;
export type InsertProductGeneration = typeof productGenerations.$inferInsert;

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
    unitCost: decimal("unitCost", { precision: 12, scale: 4 }).notNull().default("0"),
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
 * Sipariş olay defteri (denetim izi): siparişin yaşam döngüsündeki her adım
 * zaman damgasıyla kaydedilir — oluşturuldu, pazaryerinden senkronlandı, durum
 * değişti, ödeme alındı, kargoya verildi, not eklendi. "Ne zaman ne oldu"
 * sorusunun kanıtı; sipariş detayındaki zaman çizgisini besler.
 */
export const orderEvents = mysqlTable(
  "orderEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    orderId: int("orderId").notNull(),
    // created | synced | status | payment | cargo | note
    type: varchar("type", { length: 32 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    // Opsiyonel yapısal ayrıntı (JSON): örn. {"from":"new","to":"ready"}.
    meta: text("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("orderEvents_orderId_idx").on(t.orderId)],
);

export type OrderEvent = typeof orderEvents.$inferSelect;
export type InsertOrderEvent = typeof orderEvents.$inferInsert;


/**
 * Üretim emirleri — hangi master, ne kadar üretildi.
 *
 * Eski `productId` kolonu kaldırıldı: emekli düz ürün modeli sökülürken
 * geçmiş kayıtlar da düştü, v3 üretimi zaten yalnız `masterId` kullanıyordu.
 */
export const productionRuns = mysqlTable(
  "productionRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    masterId: int("masterId"),
    qty: int("qty").notNull(),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("productionRuns_master_idx").on(t.masterId)],
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
    /** v3 ürün bağı — teklif siparişe dönüşürken bağ korunsun diye taşınır. */
    masterId: int("masterId"),
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
 * WhatsApp bağlı-cihaz köprüsünün oturum (giriş) durumu. Baileys'in dosya tabanlı
 * auth state'i yerine buraya yazılır ki Render'ın geçici diski sıfırlansa bile
 * QR bir kez okutulsun — restart/uyku sonrası oturum DB'den geri yüklenir.
 * name: "creds" veya "<tür>-<id>" (pre-key, session, app-state-sync-key vb.).
 * data: BufferJSON ile serileştirilmiş JSON.
 */
export const whatsappAuth = mysqlTable("whatsappAuth", {
  name: varchar("name", { length: 191 }).primaryKey(),
  data: text("data").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappAuthRow = typeof whatsappAuth.$inferSelect;

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
    /** v3 ürün bağı — cevap taslağı ilan içeriğinden beslenir. */
    masterId: int("masterId"),
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
 * CRM satış boru hattı (Sprint 3 / Odoo uyarlama 🟠): teklif ÖNCESİ fırsat takibi.
 * Aşama akışı: yeni → görüşme → teklif → kazanıldı | kaybedildi. Teklife/siparişe
 * dönüşünce bağ kurulur; kazanılan/kaybedilen fırsatlar panoda ayrı görünür.
 */
export const crmOpportunities = mysqlTable(
  "crmOpportunities",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    title: varchar("title", { length: 255 }).notNull(),
    customerId: int("customerId"),
    customerName: varchar("customerName", { length: 255 }),
    customerPhone: varchar("customerPhone", { length: 64 }),
    expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }).default("0"),
    stage: mysqlEnum("stage", ["yeni", "gorusme", "teklif", "kazanildi", "kaybedildi"]).notNull().default("yeni"),
    // Sıradaki adım ("numune gönder", "fiyat revize et") + tarihi — takip kaçmasın.
    nextStep: varchar("nextStep", { length: 255 }),
    nextStepDate: timestamp("nextStepDate"),
    note: text("note"),
    quoteId: int("quoteId"),
    orderId: int("orderId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("crmOpp_stage_idx").on(t.stage), index("crmOpp_customer_idx").on(t.customerId)],
);

export type CrmOpportunity = typeof crmOpportunities.$inferSelect;
export type InsertCrmOpportunity = typeof crmOpportunities.$inferInsert;

/* ==========================================================================
 * ÜRÜN MİMARİSİ v3 — Master Product / Listing / Channel Listing
 *
 * Eski model (products.parentId ile ana ürün → türev ağacı) fiziksel ürünle
 * satış ilanını tek kayıtta birleştiriyordu. Bu yüzden aynı şişeyi farklı
 * isimlerle satmak ürünü çoğaltıyor, stok ve reçete bölünüyordu.
 *
 * Yeni model üç katman:
 *   masterProducts  → fiziksel gerçeklik (stok, kapasite, reçete, barkod)
 *   listings        → içerik (başlık, açıklama, SEO, kullanım alanı)
 *   channelListings → yayın (pazaryeri SKU/barkod, kategori, fiyat, senkron)
 *
 * Master kimliği bir AĞAÇ değil, bir KÜP KOORDİNATIDIR:
 *   seri × renk × form × ambalaj × hazırlık(r2u)
 * Bu beşlinin UNIQUE olması mükerrer ürünü veritabanı seviyesinde imkânsız kılar.
 * ========================================================================== */

/**
 * Renkler. `seriesId` dolu ise renk o seriye özeldir (RAL COLOUR'ın RAL kodları,
 * CANDY'nin candy tonları); boşsa tüm serilerde kullanılabilir.
 *
 * NOT: Renksiz kalemler (tiner vb.) için NULL kullanılmaz — "NOTR" kodlu bir
 * satır tohumlanır ve masterProducts.colorId NOT NULL kalır. Sebebi MySQL'de
 * UNIQUE indeksin NULL'ları birbirinden farklı sayması: colorId nullable olsaydı
 * küp koordinatı tekilliği renksiz ürünlerde sessizce delinirdi.
 */
export const colors = mysqlTable(
  "colors",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /**
     * VARSAYILAN RENK NUMARASI — katalog kodunun sayı kısmı. 1008 → "CND1008".
     *
     * Serinin kendi numarası varsa (`seriesColorNumbers`) O kazanır; burası
     * "hiçbir seri kendi numarasını söylemediyse" durumudur.
     *
     * ── Neden `code` yetmiyor ────────────────────────────────────────────
     * `code` bir SLUG'dır ("fusya", "kirmizi") ve internal SKU'nun içine
     * gömülüdür (`aoccndfusyaab301`). Değiştirilirse üretilmiş bütün ürün
     * kodları anlamını yitirir — yani `code` teknik bir kimlik, satış kodu
     * değil. Kartta `{code}` basılınca "KIRMIZI" çıkıyordu: rengin adının
     * tekrarı, kod değil.
     *
     * ── Neden kodun TAMAMI değil, yalnız numarası ────────────────────────
     * Renk tek bir seriye ait değil: aynı yeşil hem CANDY hem METEOR altında
     * satılabiliyor ve `seriesId` çoğu renkte boş ("tüm seriler"). Koda
     * "CND1008" diye yazılsaydı o yeşil METEOR ürününde de CANDY ön ekiyle
     * görünürdü. Numara renge ait, ön ek ÜRÜNÜN SERİSİNDEN geliyor
     * (bkz. `shared/colorCode.ts`) — internal SKU'daki ayrımın aynısı.
     *
     * NULL olabilir (henüz numara verilmemiş renk); tekillik şirket bazında
     * korunur — MySQL NULL'ları birbirinden farklı saydığı için numarasız
     * renkler bu indekse takılmaz.
     */
    colorNo: int("colorNo"),
    /**
     * Rengin İngilizce/uluslararası adı — satış adında kullanılır.
     * "MAGENTA (FUŞYA)" gibi. Boşsa yalnız Türkçe ad yazılır.
     */
    nameEn: varchar("nameEn", { length: 128 }),
    hex: varchar("hex", { length: 16 }),
    // Renk ailesi (kırmızı/mavi/nötr) — filtreleme ve vitrin gruplaması.
    family: varchar("family", { length: 64 }),
    finish: mysqlEnum("finish", ["duz", "metalik", "sedef", "candy", "neon", "seffaf"])
      .notNull()
      .default("duz"),
    seriesId: int("seriesId"),
    sortOrder: int("sortOrder").notNull().default(0),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("colors_company_code_uq").on(t.companyId, t.code),
    // Renk numarası mükerrer olamaz: iki renge aynı numarayı vermek ilanda ve
    // depoda yanlış ürünün gönderilmesi demek.
    unique("colors_company_colorNo_uq").on(t.companyId, t.colorNo),
    index("colors_series_idx").on(t.seriesId),
  ],
);

export type Color = typeof colors.$inferSelect;
export type InsertColor = typeof colors.$inferInsert;

/**
 * Ürün formu (fiziksel): airbrush · paint · sprey · rötuş.
 * "r2u" bir form DEĞİL, masterProducts.readiness alanındaki bayraktır —
 * aynı formun kullanıma hazır (inceltilmiş) hali.
 */
export const productFamilies = mysqlTable(
  "productFamilies",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    // Internal SKU'da kullanılan kısa ek (airbrush → "ab").
    skuSegment: varchar("skuSegment", { length: 8 }),
    sortOrder: int("sortOrder").notNull().default(0),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [unique("productFamilies_company_code_uq").on(t.companyId, t.code)],
);

export type ProductFamily = typeof productFamilies.$inferSelect;
export type InsertProductFamily = typeof productFamilies.$inferInsert;

/**
 * Ambalajlar. `volumeMl` formül ölçeklemesinin paydası: bir master'ın birim
 * ihtiyacı = reçete miktarı × (ambalaj hacmi / reçete baz hacmi).
 *
 * `materialId` bu ambalajın stok kalemi (500 ML PET şişe). Kapasite hesabında
 * boya kadar şişe de kısıttır — boya var ama şişe yoksa üretim yapılamaz.
 */
export const packagings = mysqlTable(
  "packagings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    volumeMl: decimal("volumeMl", { precision: 10, scale: 2 }).notNull().default("0"),
    container: varchar("container", { length: 64 }),
    materialId: int("materialId"),
    skuSegment: varchar("skuSegment", { length: 8 }),
    weightG: decimal("weightG", { precision: 10, scale: 2 }),
    desi: decimal("desi", { precision: 10, scale: 2 }),
    sortOrder: int("sortOrder").notNull().default(0),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [unique("packagings_company_code_uq").on(t.companyId, t.code)],
);

export type Packaging = typeof packagings.$inferSelect;
export type InsertPackaging = typeof packagings.$inferInsert;

/**
 * Ambalajın kendi malzeme listesi: kapak, etiket, koli — şişe dışındaki,
 * hacimle ölçeklenmeyen (adet başına sabit) kalemler.
 */
export const packagingInputs = mysqlTable(
  "packagingInputs",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    packagingId: int("packagingId").notNull(),
    materialId: int("materialId").notNull(),
    qtyPerUnit: decimal("qtyPerUnit", { precision: 12, scale: 4 }).notNull().default("1"),
    /** Miktarın birimi — NULL = kalemin kendi birimi. Bkz. formulaInputs.unit. */
    unit: varchar("unit", { length: 16 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("packagingInputs_pack_mat_uq").on(t.packagingId, t.materialId),
    index("packagingInputs_material_idx").on(t.materialId),
  ],
);

export type PackagingInput = typeof packagingInputs.$inferSelect;
export type InsertPackagingInput = typeof packagingInputs.$inferInsert;

/**
 * Ambalajın ÜRÜN ÇEKİMİ — pazarlama görsellerinde basılan gerçek kutu.
 *
 * ── Neden ayrı tablo, `packagings.image` değil ─────────────────────────────
 * Aynı ambalaj her seride aynı görünmüyor: 400 ml sprey kutusu VIVID'de bir,
 * METEOR'da başka etiketle basılıyor. Tek sütun olsaydı ya yanlış hattın
 * kutusu çizilirdi ya da her etiket için ayrı bir ambalaj tanımı açmak
 * gerekirdi — ikisi de sözlüğü bozar.
 *
 * `seriesId` NULL = TÜM SERİLER için varsayılan çekim. Çözümleme sırası:
 * önce (ambalaj × seri) tam eşleşme, yoksa varsayılan. "Herhangi bir seri"ye
 * düşülmez; Vivid bir rengin yanında Meteor kutusu durmasın.
 *
 * Görsel neden veritabanında: `masterImages` ile aynı gerekçe — Render'da
 * kalıcı disk yok. Satır sayısı ambalaj × seri kadar, yani onlarla ölçülür.
 */
export const packagingImages = mysqlTable(
  "packagingImages",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    packagingId: int("packagingId").notNull(),
    /** NULL = tüm seriler (varsayılan çekim). */
    seriesId: int("seriesId"),
    /** Görselin kendisi (data URL / base64). `/api/img/packaging/{id}` servis eder. */
    data: mediumtext("data").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("packagingImages_pack_idx").on(t.packagingId),
    index("packagingImages_series_idx").on(t.seriesId),
  ],
);

export type PackagingImage = typeof packagingImages.$inferSelect;
export type InsertPackagingImage = typeof packagingImages.$inferInsert;

/**
 * Kullanım alanı — LISTING ekseni, master ekseni DEĞİL.
 * 3D baskı · Rapala · Otomotiv · Bisiklet · Maket · Jant…
 * Aynı fiziksel şişe, farklı alıcı niyetine göre farklı ilanla satılır.
 *
 * "GENEL" kodlu bir satır tohumlanır: kullanım alanı belirtilmeyen jenerik
 * ilan onu kullanır. Böylece listings.useCaseId NOT NULL kalır ve
 * UNIQUE(masterId, useCaseId) NULL yüzünden delinmez.
 */
export const useCases = mysqlTable(
  "useCases",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    // İlan başlığı şablonu. Değişkenler: {{renk}} {{seri}} {{ambalaj}} {{kullanim}}
    titlePattern: varchar("titlePattern", { length: 255 }),
    sortOrder: int("sortOrder").notNull().default(0),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [unique("useCases_company_code_uq").on(t.companyId, t.code)],
);

export type UseCase = typeof useCases.$inferSelect;
export type InsertUseCase = typeof useCases.$inferInsert;

/* ---- Seyrek küp: her koordinat geçerli değil ---------------------------- */

/**
 * Küp doludur sanılırsa 9 seri × 30 renk × 5 form × 9 ambalaj × 2 hazırlık =
 * 24.300 master üretilir; bunun büyük kısmı anlamsızdır (RÖTUŞ KUTUSU yalnız
 * rötuşta, SPREY 400ML yalnız spreyde kullanılır). Master üretimi kartezyen
 * çarpımdan değil, bu uyumluluk tablolarının kesişiminden gelir.
 */
export const seriesPackagings = mysqlTable(
  "seriesPackagings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    seriesId: int("seriesId").notNull(),
    packagingId: int("packagingId").notNull(),
  },
  t => [unique("seriesPackagings_uq").on(t.seriesId, t.packagingId)],
);

export const seriesFamilies = mysqlTable(
  "seriesFamilies",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    seriesId: int("seriesId").notNull(),
    familyId: int("familyId").notNull(),
  },
  t => [unique("seriesFamilies_uq").on(t.seriesId, t.familyId)],
);

/**
 * Seri × renk uyumluluğu.
 *
 * `colors.seriesId` tek bir seriye işaret eden nullable bir alandı: bir renk ya
 * TEK seriye ait olabiliyor ya da (NULL ise) HEPSİNE. Tohumlamada hiçbir renge
 * seri atanmadığı için pratikte bütün renkler bütün serilere düşüyordu —
 * CANDY için master üretince RAL kodları da dahil 31 rengin hepsi çarpıma
 * giriyor ve 744 master çıkıyordu.
 *
 * Ambalaj ve formda olduğu gibi çoka-çok bağ doğru şekildir: "Candy Red" hem
 * CANDY hem VİVİD'de olabilir, "Renksiz" her seride olmalıdır.
 */
export const seriesColors = mysqlTable(
  "seriesColors",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    seriesId: int("seriesId").notNull(),
    colorId: int("colorId").notNull(),
  },
  t => [unique("seriesColors_uq").on(t.seriesId, t.colorId), index("seriesColors_color_idx").on(t.colorId)],
);

/**
 * Seri × renk NUMARASI — katalog kodunun sayı kısmının gerçek sahibi.
 *
 * ── Neden `colors.colorNo` yetmiyor ───────────────────────────────────────
 * Numara önce renge ait tek bir global sayı olarak tutuldu: 1008 o yeşildi ve
 * her seride 1008 kalıyordu (CND1008 / MTR1008). Kod üretimi açısından tutarlı
 * ama kataloğun gerçeği bu değil — her serinin kendi numara düzeni var:
 * CANDY 1001'den sayar, METEOR'un 1004'ü başka bir renktir, RAL COLOUR'da
 * numara zaten RAL kodudur (3020). Global tek dizi bunları GİRİLEMEZ yapıyordu:
 * `colors_company_colorNo_uq` iki serinin aynı numarayı kullanmasını
 * reddediyor, "Tanımlar → Renkler" ekranı ise tek bir numara alanı gösterip
 * hepsinin başına aynı ön eki basıyordu.
 *
 * Bu tablo o boşluğu kapatır: "CANDY'de bu renk 1004'tür" ayrı bir kayıttır.
 * Kayıt yoksa rengin varsayılan numarası (`colors.colorNo`) kullanılır — çoğu
 * renk için tek numara hâlâ yeterli ve hiçbir şey değişmez.
 *
 * ── Neden `seriesColors`'a sütun eklenmedi ────────────────────────────────
 * `seriesColors` ÜRETİM KAPSAMIDIR: bir satır "bu seride bu renk üretilir"
 * demek ve kapsam boşken seri tüm renklere açıktır. Numarayı oraya koymak,
 * kod yazmak için satır açmayı gerektirir ve bu sessizce üretim kapsamını
 * daraltırdı. Kod ile kapsam ayrı sorular, ayrı tablolar.
 */
export const seriesColorNumbers = mysqlTable(
  "seriesColorNumbers",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    seriesId: int("seriesId").notNull(),
    colorId: int("colorId").notNull(),
    /** Bu seride rengin numarası. Silinmek istendiğinde satır silinir. */
    colorNo: int("colorNo").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("seriesColorNumbers_uq").on(t.seriesId, t.colorId),
    // Numara SERİ İÇİNDE tekildir: aynı seride iki renk aynı kodu taşırsa
    // depoda yanlış şişe kutulanır. Farklı serilerde aynı numara serbesttir —
    // ön ek onları ayırır (CND1004 ≠ MTR1004).
    unique("seriesColorNumbers_no_uq").on(t.companyId, t.seriesId, t.colorNo),
    index("seriesColorNumbers_color_idx").on(t.colorId),
  ],
);

export type SeriesColorNumber = typeof seriesColorNumbers.$inferSelect;

/**
 * Form × ambalaj uyumluluğu.
 *
 * Küp seri×ambalaj ve seri×form eksenlerinde seyrekti ama form ile ambalaj
 * ARASINDA kısıt yoktu: seride hem "Airbrush" formu hem "SPREY 400ML" ambalajı
 * varsa "Airbrush · SPREY 400ML" master'ı üretiliyordu. Sprey kutusu yalnız
 * sprey formunda, rötuş kutusu yalnız rötuşta anlamlıdır.
 *
 * Form için satır yoksa o form serinin tüm ambalajlarıyla eşleşir — geçiş
 * dönemi bozulmasın diye.
 */
export const familyPackagings = mysqlTable(
  "familyPackagings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    familyId: int("familyId").notNull(),
    packagingId: int("packagingId").notNull(),
  },
  t => [unique("familyPackagings_uq").on(t.familyId, t.packagingId)],
);

export type SeriesPackaging = typeof seriesPackagings.$inferSelect;
export type SeriesFamily = typeof seriesFamilies.$inferSelect;
export type SeriesColor = typeof seriesColors.$inferSelect;
export type FamilyPackaging = typeof familyPackagings.$inferSelect;

/* ---- Formüller: çok seviyeli, özyinelemeli BOM -------------------------- */

/**
 * Reçete. Eski `formulaItems` doğrudan bir ürüne bağlıydı; bu yüzden aynı
 * rengin 30/100/250/500 ml'si için dört kopya tutuluyor ve zamanla birbirinden
 * kayıyordu. Yeni formül BAZ HACİM için yazılır (örn. 1000 ml) ve master'ın
 * ambalaj hacmine göre ölçeklenir — tek reçete tüm boyutları besler.
 *
 * `outputType = "yari_mamul"` ise reçetenin çıktısı bir materials kalemidir
 * (Candy Red harcı gibi) ve o kalem başka reçetelere girdi olabilir. BOM'u
 * özyinelemeli yapan budur: hammadde → yarı mamul → r2u → mamul.
 */
export const formulas = mysqlTable(
  "formulas",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    name: varchar("name", { length: 160 }).notNull(),
    outputType: mysqlEnum("outputType", ["yari_mamul", "mamul"]).notNull().default("mamul"),
    // Yarı mamul üretiyorsa hangi materials kalemi (aksi halde boş).
    outputMaterialId: int("outputMaterialId"),
    // Mamul reçetesi ise hangi koordinata ait (renk bazlı reçete ayrımı).
    seriesId: int("seriesId"),
    colorId: int("colorId"),
    familyId: int("familyId"),
    readiness: mysqlEnum("readiness", ["konsantre", "r2u"]),
    // Reçete kaç birim çıktı için yazıldı (ölçeklemenin paydası).
    baseQty: decimal("baseQty", { precision: 12, scale: 3 }).notNull().default("1000"),
    baseUnit: varchar("baseUnit", { length: 32 }).notNull().default("ml"),
    // Fire payı (%). Kapasite bunu düşerek hesaplanır; yoksa hep iyimser çıkar.
    wastePercent: decimal("wastePercent", { precision: 5, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("formulas_output_material_idx").on(t.outputMaterialId),
    index("formulas_coord_idx").on(t.seriesId, t.colorId, t.familyId),
  ],
);

export type Formula = typeof formulas.$inferSelect;
export type InsertFormula = typeof formulas.$inferInsert;

/**
 * Reçete girdileri. `inputMaterialId` hammadde, ambalaj VEYA yarı mamul
 * olabilir — yarı mamulü gösterebilmesi BOM'u çok seviyeli yapar.
 * `materialId` indeksi ters aramayı verir: "bu hammaddeyi hangi reçeteler
 * kullanıyor" → darboğaz analizi ve stok değişiminde etkilenen master'lar.
 */
/**
 * Reçete kapsamı — çoklu seçim.
 *
 * `formulas.seriesId/colorId/familyId/readiness` eksen başına TEK değer
 * tutuyordu: "bu reçete CANDY'nin kırmızısına uygulanır" yazılabiliyor ama
 * "kırmızı VE bordo VE vişne" yazılamıyordu. Aynı reçeteyi üç kez kopyalamak
 * gerekiyordu ve kopyalar zamanla birbirinden kayıyordu — v3'ün en baştan
 * çözmeye çalıştığı sorunun ta kendisi.
 *
 * Bir eksende satır yoksa o eksen "hepsi" demektir (eski davranış). Satır
 * varsa reçete yalnız o değerlere uygulanır. Tek değerli eski kayıtlar
 * `formulas` kolonlarında durmaya devam eder; eşleştirici ikisini de okur.
 */
export const formulaScopes = mysqlTable(
  "formulaScopes",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    formulaId: int("formulaId").notNull(),
    kind: mysqlEnum("kind", ["seri", "renk", "form", "hazirlik"]).notNull(),
    /** Boyut kimliği. `hazirlik` için 0=konsantre, 1=r2u. */
    valueId: int("valueId").notNull(),
  },
  t => [
    unique("formulaScopes_uq").on(t.formulaId, t.kind, t.valueId),
    index("formulaScopes_formula_idx").on(t.formulaId),
  ],
);

export type FormulaScope = typeof formulaScopes.$inferSelect;

export const formulaInputs = mysqlTable(
  "formulaInputs",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    formulaId: int("formulaId").notNull(),
    inputMaterialId: int("inputMaterialId").notNull(),
    qtyPerBase: decimal("qtyPerBase", { precision: 12, scale: 4 }).notNull(),
    /**
     * Miktarın birimi (gr, kg, ml, lt, adet). NULL = kalemin kendi birimi.
     *
     * Boyacı gram yazar, satın alma kilo alır. Birim yazılmadığı sürece kod
     * miktarı kalemin biriminde sayıyordu; kg fiyatlı bir pigmente gram
     * miktarı girildiğinde maliyet 1000 kat şişiyordu. NULL bırakılan eski
     * satırlar eski davranışı korur, yeni satırlar birimini kendi taşır.
     */
    unit: varchar("unit", { length: 16 }),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("formulaInputs_formula_material_uq").on(t.formulaId, t.inputMaterialId),
    index("formulaInputs_material_idx").on(t.inputMaterialId),
  ],
);

export type FormulaInput = typeof formulaInputs.$inferSelect;
export type InsertFormulaInput = typeof formulaInputs.$inferInsert;

/* ---- Master Product: fiziksel gerçeklik --------------------------------- */

export const masterProducts = mysqlTable(
  "masterProducts",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),

    // Küp koordinatı — hepsi NOT NULL (bkz. colors tablosundaki NULL notu).
    seriesId: int("seriesId").notNull(),
    colorId: int("colorId").notNull(),
    familyId: int("familyId").notNull(),
    packagingId: int("packagingId").notNull(),
    readiness: mysqlEnum("readiness", ["konsantre", "r2u"]).notNull().default("konsantre"),

    /**
     * Ürünün satış adı — etiketteki, faturadaki, insanın söylediği isim.
     *
     * Bu alan yoktu: bir master'ın tek "adı" `internalSku` koordinatıydı
     * (aoccndred1822ab100r2u), gerçek isim ise yalnız İLAN kaydında
     * (`listings.title`) yaşıyordu. İlanı açılmamış ürünün hiçbir yerde adı
     * olmuyordu — katalog ekranı bu yüzden kod listesi gibi görünüyordu.
     *
     * Boş bırakılabilir: `displayNameOf` koordinattan okunur bir ad türetir,
     * böylece isim vermeden de ürün insanca görünür.
     */
    name: varchar("name", { length: 255 }),

    // Kullanıcının verdiği renk/temel kod: marka+seri+renk+renk kodu.
    // Örn. aoccndred1822 — bu kod bir MASTER'ı değil bir RENGİ tanımlar
    // (form/ambalaj/hazırlık içermez), o yüzden kimlik değil ön ektir.
    baseCode: varchar("baseCode", { length: 64 }),
    // Master kimliği: baseCode + form + ambalaj + hazırlık ekleri.
    // Örn. aoccndred1822ab100r2u. Asla pazaryerine gönderilmez.
    internalSku: varchar("internalSku", { length: 96 }).notNull(),
    // Gerçek GS1 barkodu (varsa). Fatura/irsaliye/depo bunu kullanır.
    // Pazaryerine giden barkod ilan başına ayrıdır (channelListings).
    gtin: varchar("gtin", { length: 20 }),

    formulaId: int("formulaId"),
    // Ambalaj hacmi / formül baz hacmi. Saklanır ki doğrusal olmayan
    // durumlarda elle ezilebilsin.
    formulaScale: decimal("formulaScale", { precision: 10, scale: 4 }).notNull().default("1"),

    // Kapasite (hammaddeden üretilebilir adet) — capacity.ts hesaplar.
    buildableQty: int("buildableQty").notNull().default(0),
    buildableComputedAt: timestamp("buildableComputedAt"),
    // İlana yazılacak üst sınır: push = min(buildableQty, virtualStockCap).
    virtualStockCap: int("virtualStockCap").notNull().default(10),

    /**
     * Ürünün nasıl satıldığı — ilan miktarını bu belirler.
     *
     * `siparis_uzerine` (varsayılan): eldeki hammaddeden üretilebilir adet.
     * `stoktan`: raftaki mamul adedi; hammadde kapasitesine bakılmaz.
     * `tedarikli`: hammadde yokken bile satışta, termin süresiyle satılır.
     *
     * Tek kural bütün katalogda çalışmıyordu: miktar yalnız kapasiteden
     * türeyince reçetesi bağlanmamış ya da hammaddesi biten her ürün ilanda
     * 0 yazıp kapanıyordu — "önce üret sonra sat" demek.
     */
    salesMode: mysqlEnum("salesMode", ["siparis_uzerine", "stoktan", "tedarikli"])
      .notNull()
      .default("siparis_uzerine"),
    /** `tedarikli` modda müşteriye vaat edilen termin (gün). */
    leadTimeDays: int("leadTimeDays").notNull().default(0),

    // Mamul stok — `stoktan` modunda ilan miktarının kaynağıdır.
    stockQty: int("stockQty").notNull().default(0),
    reservedQty: int("reservedQty").notNull().default(0),
    criticalQty: int("criticalQty").notNull().default(0),

    weightG: decimal("weightG", { precision: 10, scale: 2 }),
    desi: decimal("desi", { precision: 10, scale: 2 }),
    avgCost: decimal("avgCost", { precision: 12, scale: 4 }).notNull().default("0"),
    // Taban (web) satış fiyatı. Kanal yayınında fiyat girilmezse bu kullanılır;
    // böylece her kanala ayrı fiyat girmek zorunda kalınmaz.
    basePrice: decimal("basePrice", { precision: 12, scale: 2 }).notNull().default("0"),
    discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).notNull().default("0"),

    status: mysqlEnum("status", ["taslak", "aktif", "arsiv"]).notNull().default("taslak"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    // Küp tekilliği: aynı koordinatta ikinci bir master açılamaz.
    unique("masterProducts_cube_uq").on(
      t.companyId,
      t.seriesId,
      t.colorId,
      t.familyId,
      t.packagingId,
      t.readiness,
    ),
    unique("masterProducts_sku_uq").on(t.companyId, t.internalSku),
    index("masterProducts_baseCode_idx").on(t.baseCode),
    index("masterProducts_formula_idx").on(t.formulaId),
    index("masterProducts_status_idx").on(t.status),
  ],
);

export type MasterProduct = typeof masterProducts.$inferSelect;
export type InsertMasterProduct = typeof masterProducts.$inferInsert;

/* ---- Listing: içerik katmanı -------------------------------------------- */

export const listings = mysqlTable(
  "listings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    masterId: int("masterId").notNull(),
    useCaseId: int("useCaseId").notNull(),
    // Düşük kapasitede stoğun toplandığı ve içerik mirasına referans olan ilan.
    isPrimary: tinyint("isPrimary").notNull().default(0),

    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }),
    shortDescription: mediumtext("shortDescription"),
    longDescription: mediumtext("longDescription"),
    applicationText: mediumtext("applicationText"),
    seoTitle: varchar("seoTitle", { length: 255 }),
    seoKeywords: text("seoKeywords"),

    status: mysqlEnum("status", ["taslak", "aktif", "arsiv"]).notNull().default("taslak"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    // İlan üretimini idempotent yapan anahtar: "yeniden üret" mükerrer açmaz.
    unique("listings_master_usecase_uq").on(t.masterId, t.useCaseId),
    index("listings_master_idx").on(t.masterId),
    index("listings_status_idx").on(t.status),
  ],
);

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

/** İlan görselleri — URL olarak. Base64 asla veritabanında tutulmaz. */
export const listingImages = mysqlTable(
  "listingImages",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    listingId: int("listingId").notNull(),
    url: varchar("url", { length: 1024 }).notNull(),
    role: varchar("role", { length: 32 }),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("listingImages_listing_idx").on(t.listingId)],
);

export type ListingImage = typeof listingImages.$inferSelect;

/* ---- Channel Listing: yayın katmanı ------------------------------------- */

export const salesChannels = mysqlTable(
  "salesChannels",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [unique("salesChannels_company_code_uq").on(t.companyId, t.code)],
);

export type SalesChannel = typeof salesChannels.$inferSelect;

/**
 * Bir ilanın bir kanaldaki yayını. Pazaryeri SKU'su ve barkodu ilan başına
 * ayrıdır: Trendyol'da barkod ilanın benzersiz anahtarıdır, aynı barkodla iki
 * ilan yan yana duramaz. Bu kodlar BİR KEZ üretilip saklanır ve bir daha
 * hesaplanmaz — türetme kuralı değişirse tüm pazaryeri eşleşmeleri kopar.
 *
 * `masterId` bilerek denormalize: stok/kapasite değişiminde etkilenen
 * yayınları tek indeksle bulmak ve aşağıdaki mükerrer ilan kilidini kurmak için.
 */
export const channelListings = mysqlTable(
  "channelListings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    listingId: int("listingId").notNull(),
    masterId: int("masterId").notNull(),
    channelId: int("channelId").notNull(),

    channelSku: varchar("channelSku", { length: 96 }).notNull(),
    channelBarcode: varchar("channelBarcode", { length: 64 }).notNull(),
    channelCategoryId: varchar("channelCategoryId", { length: 64 }),
    // Trendyol productMainId — aynı değeri paylaşan yayınlar tek ilanda
    // varyant seçici olarak toplanır (örn. aynı rengin farklı ambalajları).
    groupKey: varchar("groupKey", { length: 96 }),

    price: decimal("price", { precision: 12, scale: 2 }).notNull().default("0"),
    discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).notNull().default("0"),

    // Pazaryerinin şu an inandığı miktar (gerçek stok DEĞİL, gönderim önbelleği).
    pushedQty: int("pushedQty").notNull().default(0),
    syncState: mysqlEnum("syncState", ["temiz", "kirli", "gonderiliyor", "hata"])
      .notNull()
      .default("kirli"),
    syncedAt: timestamp("syncedAt"),
    remoteId: varchar("remoteId", { length: 128 }),
    batchId: varchar("batchId", { length: 128 }),
    lastError: text("lastError"),

    status: mysqlEnum("status", ["taslak", "canli", "durduruldu"]).notNull().default("taslak"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("channelListings_channel_sku_uq").on(t.channelId, t.channelSku),
    unique("channelListings_channel_barcode_uq").on(t.channelId, t.channelBarcode),
    unique("channelListings_listing_channel_uq").on(t.listingId, t.channelId),
    // Mükerrer ilan kilidi: bir master, bir kanalda, bir kategoride tek ilan.
    // Pazaryerlerinin mükerrer ilan yaptırımı aynı kategorideki kopyaları
    // hedefler; farklı kategori (3D Baskı vs Balıkçılık) meşrudur.
    unique("channelListings_master_channel_cat_uq").on(t.masterId, t.channelId, t.channelCategoryId),
    index("channelListings_master_idx").on(t.masterId),
    index("channelListings_sync_idx").on(t.channelId, t.syncState),
  ],
);

export type ChannelListing = typeof channelListings.$inferSelect;
export type InsertChannelListing = typeof channelListings.$inferInsert;

/**
 * Hammadde rezervasyon defteri.
 *
 * Sipariş ile üretim arasındaki günlerde hammadde "boşta" görünmemeli; yoksa
 * aynı 500 gramlık pigment arka arkaya on siparişe söz verilir. materials
 * .reservedQty toplam sayacı hızlı okuma içindir — GERÇEK kayıt burasıdır:
 * iptal geldiğinde tam olarak neyin geri açılacağı ancak satır bazında bilinir.
 */
export const materialReservations = mysqlTable(
  "materialReservations",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    orderId: int("orderId").notNull(),
    materialId: int("materialId").notNull(),
    qty: decimal("qty", { precision: 12, scale: 3 }).notNull(),
    // rezerve = stok ayrıldı · tuketildi = üretim yapıldı, stoktan düştü
    // iptal = sipariş iptal/iade, rezerv geri açıldı
    state: mysqlEnum("state", ["rezerve", "tuketildi", "iptal"]).notNull().default("rezerve"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("materialReservations_order_idx").on(t.orderId, t.state),
    index("materialReservations_material_idx").on(t.materialId, t.state),
  ],
);

export type MaterialReservation = typeof materialReservations.$inferSelect;
export type InsertMaterialReservation = typeof materialReservations.$inferInsert;

/**
 * İlan içerik blokları — seri × kullanım alanı başına BİR KEZ üretilir.
 *
 * İçerik seriye ve kullanım alanına göre değişir; renge göre değişen tek şey
 * metinde geçen renk adıdır. Bu yüzden AI varyant başına değil BLOK başına
 * çağrılır: 9 seri × 7 kullanım alanı = 63 çağrı binlerce ilanı doldurur.
 *
 * Eski akış varyant başına çağırıyordu (85 varyant = 85 çağrı) ve gateway
 * timeout'a giriyordu; "seriden devral" moduna geçilmesinin sebebi buydu.
 * Blok yaklaşımı o dersi kalıcı hale getirir.
 *
 * familyId dolu ise o forma özel blok (airbrush ile spreyin uygulama metni
 * farklıdır); boş ise serinin tüm formlarına uyar. En özel blok kazanır.
 */
export const contentBlocks = mysqlTable(
  "contentBlocks",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    seriesId: int("seriesId").notNull(),
    useCaseId: int("useCaseId").notNull(),
    familyId: int("familyId"),
    // Metinlerde {{renk}} {{ambalaj}} {{seri}} {{form}} {{kullanim}} kullanılır;
    // ilan üretilirken o ilanın koordinatıyla doldurulur.
    shortDescription: mediumtext("shortDescription"),
    longDescription: mediumtext("longDescription"),
    applicationText: mediumtext("applicationText"),
    labelText: text("labelText"),
    features: text("features"),
    titlePattern: varchar("titlePattern", { length: 255 }),
    source: mysqlEnum("source", ["sablon", "ai", "elle"]).notNull().default("sablon"),
    generatedAt: timestamp("generatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("contentBlocks_coord_uq").on(t.companyId, t.seriesId, t.useCaseId, t.familyId),
    index("contentBlocks_series_idx").on(t.seriesId),
  ],
);

export type ContentBlock = typeof contentBlocks.$inferSelect;
export type InsertContentBlock = typeof contentBlocks.$inferInsert;

/**
 * Kullanım alanı × kanal → pazaryeri kategori kimliği.
 *
 * Toplu yayının ön koşulu: kategorisiz ilan pazaryerine açılamaz. Ayrıca
 * mükerrer ilan kilidi kategoriye dayandığı için (bir master, bir kanalda,
 * bir kategoride tek ilan) eşleme olmadan kilit anlamsızlaşır.
 *
 * Aynı kategoriye düşen iki kullanım alanı (örn. PLA ve PETG'nin ikisi de
 * "3D Baskı Malzemeleri") bilinçli olarak mümkündür — bu durumda toplu yayın
 * ikincisini atlar ve sebebini bildirir.
 */
export const useCaseChannelCategories = mysqlTable(
  "useCaseChannelCategories",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    useCaseId: int("useCaseId").notNull(),
    channelId: int("channelId").notNull(),
    categoryId: varchar("categoryId", { length: 64 }).notNull(),
    categoryName: varchar("categoryName", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("useCaseChannelCategories_uq").on(t.useCaseId, t.channelId)],
);

export type UseCaseChannelCategory = typeof useCaseChannelCategories.$inferSelect;

/**
 * Master görselleri — ilanlar devralır.
 *
 * Pazaryeri ürün kartı görselsiz açılamaz. Görseli ilan başına yüklemek
 * gereksiz tekrar olurdu: aynı fiziksel şişenin fotoğrafı "3D Baskı Boyası"
 * ilanında da "Rapala Boyası" ilanında da aynıdır. Master'a bir kez eklenir,
 * ilan kendi görseli yoksa buradan devralır.
 *
 * URL saklanır, base64 DEĞİL — pazaryerine link gönderilir ve veritabanı
 * görsel deposuna dönüşmez.
 */
export const masterImages = mysqlTable(
  "masterImages",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    masterId: int("masterId").notNull(),
    /**
     * Dış adres. Boşsa görsel `data` alanındadır ve `/api/img/master/{id}`
     * üzerinden servis edilir — adres okuma anında türetilir ki alan adı
     * değişince satırlar bozulmasın.
     */
    url: varchar("url", { length: 1024 }),
    /**
     * Yüklenen görsel (data URL / base64).
     *
     * Neden veritabanında: pazaryeri kartı MUTLAK ve herkese açık bir adres
     * ister. Render'da kalıcı disk yok, S3 de yapılandırılmamış olabilir.
     * Eski `productImages` deseni (base64 + `/api/img` servisi) zaten çalışıyor
     * ve dış bağımlılık gerektirmiyor; aynı yol izlenir. S3 yapılandırılınca
     * `url` dolu satırlar aynı kod yolundan geçer — geçiş kırılma yaratmaz.
     */
    data: mediumtext("data"),
    role: varchar("role", { length: 32 }),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("masterImages_master_idx").on(t.masterId)],
);

export type MasterImage = typeof masterImages.$inferSelect;

/**
 * Pazaryeri kategori özelliği tanımı.
 *
 * Trendyol/HB kategori başına zorunlu özellik ister (Renk, Hacim, Ürün Tipi…).
 * Bunlar bugün ayarlarda kategori başına SABİT bir liste olarak duruyordu;
 * yani her ürüne aynı renk gidiyordu.
 *
 * Oysa master'ın küp koordinatı zaten bu bilgidir: renk ekseni = Renk
 * özelliği, ambalaj hacmi = Hacim özelliği, form = Ürün Tipi. `source` hangi
 * eksenden besleneceğini söyler; böylece özellik ürün başına DOĞRU değerle
 * gider ve elle girilmez.
 */
export const channelAttributes = mysqlTable(
  "channelAttributes",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    channelId: int("channelId").notNull(),
    categoryId: varchar("categoryId", { length: 64 }).notNull(),
    attributeId: int("attributeId").notNull(),
    attributeName: varchar("attributeName", { length: 160 }),
    // Hangi eksenden beslenecek. "sabit" tüm ürünlerde aynı değeri gönderir.
    source: mysqlEnum("source", ["renk", "ambalaj", "form", "seri", "hacim", "sabit"])
      .notNull()
      .default("sabit"),
    /** source="sabit" ise gönderilecek değer kimliği. */
    constantValueId: int("constantValueId"),
    /** Değer kimliği yerine serbest metin kabul eden özellikler için. */
    constantText: varchar("constantText", { length: 255 }),
    isRequired: tinyint("isRequired").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("channelAttributes_uq").on(t.channelId, t.categoryId, t.attributeId),
    index("channelAttributes_cat_idx").on(t.channelId, t.categoryId),
  ],
);

export type ChannelAttribute = typeof channelAttributes.$inferSelect;

/**
 * Boyut değeri → pazaryeri özellik değeri eşlemesi.
 *
 * "Candy Red" bizde renk kimliği 12; Trendyol'da Renk özelliğinin "Kırmızı"
 * değeri 4521. Bu tablo o köprüyü kurar. Eşleme yoksa özellik gönderilemez
 * ve kalem adıyla bildirilir — yanlış değer göndermektense atlamak doğru.
 */
export const channelAttributeValues = mysqlTable(
  "channelAttributeValues",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    channelId: int("channelId").notNull(),
    attributeId: int("attributeId").notNull(),
    dimensionKind: mysqlEnum("dimensionKind", ["renk", "ambalaj", "form", "seri"]).notNull(),
    dimensionId: int("dimensionId").notNull(),
    attributeValueId: int("attributeValueId"),
    attributeText: varchar("attributeText", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("channelAttributeValues_uq").on(
      t.channelId,
      t.attributeId,
      t.dimensionKind,
      t.dimensionId,
    ),
  ],
);

export type ChannelAttributeValue = typeof channelAttributeValues.$inferSelect;

/**
 * Pazaryerinin bir özellik için KABUL ETTİĞİ değerler (seçenek kataloğu).
 *
 * "Pazaryerinden çek" yanıtı bu listeyi zaten taşıyordu ama atılıyordu; sonuçta
 * kullanıcı "Fuşya"nın Trendyol karşılığını panelde arayıp kimliği elle
 * yazıyordu — her renk, her özellik, her kanal için ayrı ayrı. Liste burada
 * saklanınca eşleme yazmak değil SEÇMEK olur, üstelik ada göre otomatik
 * eşleştirilebilir.
 *
 * Bu tablo pazaryerinin kataloğudur (bizim seçimimiz değil); her çekmede
 * kategori+özellik için tazelenir. Bizim seçimimiz `channelAttributeValues`.
 */
export const channelAttributeOptions = mysqlTable(
  "channelAttributeOptions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    channelId: int("channelId").notNull(),
    categoryId: varchar("categoryId", { length: 64 }).notNull(),
    attributeId: int("attributeId").notNull(),
    valueId: int("valueId").notNull(),
    valueName: varchar("valueName", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("channelAttributeOptions_uq").on(
      t.channelId,
      t.categoryId,
      t.attributeId,
      t.valueId,
    ),
    index("channelAttributeOptions_attr_idx").on(t.channelId, t.categoryId, t.attributeId),
  ],
);

export type ChannelAttributeOption = typeof channelAttributeOptions.$inferSelect;

/**
 * Pazaryeri ürün kartı batch işleri.
 *
 * Trendyol/Hepsiburada/N11 ürün kartı açma (create) ve güncelleme asenkron
 * batch işleridir. API batchRequestId döner, sistem status'u polling'le kontrol eder
 * (pending → success/failed). Her batch tarafından geçmiş log tutulur.
 *
 * channelListingId: hangi ilan için açılmış batch
 * marketplace: 'trendyol' | 'hepsiburada' | 'n11'
 * batchRequestId: pazaryeri API'sinden dönen batch kimliği
 * status: 'pending' | 'success' | 'failed'
 * errorMessage: başarısız batch'te hata detayı (null = başarılı veya henüz tamamlanmadı)
 * completedAt: batch tamamlanma zamanı (status != 'pending' ise dolu)
 */
export const marketplaceBatchJobs = mysqlTable(
  "marketplaceBatchJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    channelListingId: int("channelListingId").notNull(),
    marketplace: varchar("marketplace", { length: 50 }).notNull(),
    // Tekil DEĞİL: bir batch birden çok ilanı kapsar, her ilan için bir satır
    // yazılır. Tekil kısıt ikinci satırı duplicate key ile düşürürdü.
    batchRequestId: varchar("batchRequestId", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed"])
      .notNull()
      .default("pending"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  t => [
    index("marketplaceBatchJobs_listing_status_idx").on(
      t.channelListingId,
      t.status,
    ),
    index("marketplaceBatchJobs_batchRequestId_idx").on(t.batchRequestId),
    index("marketplaceBatchJobs_created_status_idx").on(t.createdAt, t.status),
    index("marketplaceBatchJobs_listing_created_idx").on(
      t.channelListingId,
      t.createdAt,
    ),
  ],
);

export type MarketplaceBatchJob = typeof marketplaceBatchJobs.$inferSelect;
export type InsertMarketplaceBatchJob = typeof marketplaceBatchJobs.$inferInsert;

/**
 * Numune master görselleri — renk stüdyosunun tohum görselleri.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * Pazaryeri kartındaki iki görsel katmanı farklı kaynaklardan gelir:
 * ambalaj bizim GERÇEK ürün fotoğrafımızdır ve hiç değişmez; boya numunesi
 * ise renge göre değişir ve üretilmesi gerekir.
 *
 * Numuneyi her renk için ayrı ayrı AI'a ürettirmek iki şeyi birden bozuyordu:
 * maliyet (her renk bir çağrı) ve tutarlılık (AI her seferinde farklı şekil
 * çiziyor; yeşil damla ile magenta damla farklı formda çıkınca müşteri
 * kataloğa baktığında rengi değil şekil farkını görüyor).
 *
 * Çözüm: obje tipi başına BİR master üretilir ve burada saklanır. Sonraki
 * renkler AI'a hiç gitmez — master'ın rengi `shared/color/recolor.ts` ile
 * matematiksel olarak değiştirilir. Şekil, ışık ve kompozisyon sabit kalır,
 * renk konstrüksiyon gereği doğrudur.
 *
 * `baseHex` master'ın KENDİ rengidir. Yeniden renklendirme kaynağın renginden
 * bağımsız çalışır (bkz. recolor testleri), ama kayıt teşhis için tutulur:
 * bir master beklenmedik sonuç veriyorsa ilk bakılacak yer orasıdır.
 *
 * Üretilen kart görselleri burada DEĞİL `masterImages` içinde durur — onlar
 * ürüne bağlıdır, bunlar ürüne değil obje tipine bağlıdır.
 */
export const sampleMasters = mysqlTable(
  "sampleMasters",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    /** Obje tipi anahtarı — 'damla', 'kasik', 'panel'. Şirket başına tekil. */
    objectType: varchar("objectType", { length: 64 }).notNull(),
    /**
     * Görselin ne işe yaradığı.
     *
     * `referans` → üretimde şekli sabitleyen numune ya da gümüş baz.
     * `gorsel`   → şablon katmanlarında kullanılan varlık: kendi ambalaj
     *              çekimin, kendi logon, arka plan dokusu.
     *
     * İkisi aynı tabloda çünkü depolama ve servis yolu birebir aynı; ayrı
     * tablo açmak aynı kodu iki kez yazmak olurdu. Ayrım yalnız listelemede.
     */
    kind: mysqlEnum("kind", ["referans", "gorsel"]).notNull().default("referans"),
    /** Arayüzde görünen ad. */
    label: varchar("label", { length: 128 }).notNull(),
    /**
     * Görselin kendisi (data URL / base64).
     *
     * Neden veritabanında: `masterImages` ile aynı gerekçe — Render'da kalıcı
     * disk yok, S3 yapılandırılmamış olabilir. Numune master sayısı düşüktür
     * (obje tipi kadar), bu yüzden satır boyutu sorun olmaz.
     */
    data: mediumtext("data"),
    /** Master'ın kendi rengi — teşhis için. */
    baseHex: varchar("baseHex", { length: 16 }),
    /** Hangi istemle üretildi — yeniden üretilebilirlik için. */
    prompt: text("prompt"),
    isActive: tinyint("isActive").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("sampleMasters_company_object_uq").on(t.companyId, t.objectType)],
);

export type SampleMaster = typeof sampleMasters.$inferSelect;
export type InsertSampleMaster = typeof sampleMasters.$inferInsert;

/**
 * Kullanıcının düzenlediği şablon yerleşimleri.
 *
 * Şablonlar `shared/color/layoutDefaults.ts` içinde fabrika ayarıyla gelir.
 * Kullanıcı bir şablonu düzenlediğinde kendi sürümü buraya yazılır ve
 * fabrika tarifi yalnız "sıfırla" için kalır.
 *
 * Neden JSON: yerleşim bir katman listesi ve şeması evrilecek — yeni katman
 * türü, yeni özellik. Bunları sütuna açmak her eklemede migration demek
 * olurdu ve hiçbiri sorgulanmıyor; şablon her zaman kimliğiyle okunuyor.
 */
export const templateLayouts = mysqlTable(
  "templateLayouts",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull().default(1),
    /** Şablon kimliği — product, coats, marketplace, card, social, story. */
    templateId: varchar("templateId", { length: 64 }).notNull(),
    /** TemplateLayout serisi. */
    layout: json("layout").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("templateLayouts_company_template_uq").on(t.companyId, t.templateId)],
);

export type TemplateLayoutRow = typeof templateLayouts.$inferSelect;
