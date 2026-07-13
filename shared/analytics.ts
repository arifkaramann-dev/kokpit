/**
 * İş zekâsı motoru — saf (framework'süz) hesaplama fonksiyonları.
 *
 * Buradaki hiçbir fonksiyon DB'ye ya da React'e bağlı değildir; girdi olarak
 * düz nesneler alır, çıktı olarak düz nesneler döner. Böylece hem istemcide
 * (Analiz ekranı) hem sunucuda (asistan özeti) aynı mantık kullanılır ve
 * vitest ile birim test edilebilir.
 *
 * Para alanları Drizzle'dan string (decimal) gelir; `num()` her ikisini de
 * güvenle sayıya çevirir.
 */

export function num(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Ürün adlarını eşleştirmek için normalleştirir (kırp + küçült + çoklu boşluk sadeleştir). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const DAY_MS = 86_400_000;

/* ------------------------- Ürün maliyet haritası ------------------------- */

export type ProductLite = {
  id: number;
  name: string;
  salePrice: string | number;
  discountPercent?: string | number | null;
  packagingCost?: string | number | null;
  shippingCost?: string | number | null;
};

export type FormulaCostRow = {
  productId: number;
  qty: string | number;
  unitCost: string | number | null;
};

export type ProductCost = {
  id: number;
  name: string;
  materialCost: number;
  packagingCost: number;
  shippingCost: number;
  totalUnitCost: number;
  netPrice: number;
  unitProfit: number;
  unitMargin: number;
};

export type CostMap = {
  byId: Map<number, ProductCost>;
  /** normalleştirilmiş ürün adı → ürün id (ilk kayıt kazanır). */
  nameToId: Map<string, number>;
};

/**
 * Her ürün için birim maliyeti (reçete hammadde maliyeti + ambalaj + kargo) ve
 * indirimli satış fiyatından birim kârı hesaplar.
 */
export function buildProductCostMap(
  products: ProductLite[],
  formulas: FormulaCostRow[],
): CostMap {
  const materialCostById = new Map<number, number>();
  for (const f of formulas) {
    const cost = num(f.qty) * num(f.unitCost);
    materialCostById.set(f.productId, (materialCostById.get(f.productId) ?? 0) + cost);
  }

  const byId = new Map<number, ProductCost>();
  const nameToId = new Map<string, number>();
  for (const p of products) {
    const materialCost = materialCostById.get(p.id) ?? 0;
    const packagingCost = num(p.packagingCost);
    const shippingCost = num(p.shippingCost);
    const totalUnitCost = materialCost + packagingCost + shippingCost;
    const netPrice = num(p.salePrice) * (1 - num(p.discountPercent) / 100);
    const unitProfit = netPrice - totalUnitCost;
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      materialCost,
      packagingCost,
      shippingCost,
      totalUnitCost,
      netPrice,
      unitProfit,
      unitMargin: netPrice > 0 ? (unitProfit / netPrice) * 100 : 0,
    });
    const key = normalizeName(p.name);
    if (!nameToId.has(key)) nameToId.set(key, p.id);
  }
  return { byId, nameToId };
}

/* ------------------------- Ürün kârlılığı ------------------------- */

export type OrderLite = {
  id: number;
  customerName: string;
  channel?: string | null;
  totalAmount: string | number;
  paidAmount?: string | number | null;
  paymentStatus?: string | null;
  status?: string | null;
  createdAt: string | number | Date;
};

export type OrderItemLite = {
  orderId: number;
  productName: string;
  quantity: string | number;
  unitPrice: string | number;
};

export type ProfitRow = {
  name: string;
  qty: number;
  revenue: number;
  /** Maliyet reçeteden çözülemediyse null (ad eşleşmedi). */
  cost: number | null;
  profit: number | null;
  margin: number | null;
  matched: boolean;
};

export type ProfitSummary = {
  totalRevenue: number;
  matchedRevenue: number;
  unmatchedRevenue: number;
  /** Maliyeti bilinen kalemlerin toplam kârı. */
  totalProfit: number;
  /** Cironun ne kadarının maliyeti biliniyor (0–1). */
  coverage: number;
  matchedCount: number;
  productCount: number;
};

export type Profitability = {
  rows: ProfitRow[];
  /** Zarar eden ya da marjı eşiğin altındaki (maliyeti bilinen) ürünler. */
  lowMargin: ProfitRow[];
  summary: ProfitSummary;
};

export type ProfitabilityOptions = {
  sinceDays?: number;
  now?: number;
  /** Bu marjın (%) altındaki ürünler "düşük marj" sayılır. Varsayılan 15. */
  lowMarginThreshold?: number;
};

/**
 * Sipariş kalemlerini ürün maliyetiyle birleştirip ürün bazında ciro/kâr/marj
 * üretir. Ciro fiili satış fiyatından (kalem birim fiyatı), maliyet ürünün
 * reçete+ambalaj+kargo birim maliyetinden gelir. Ad eşleşmeyen kalemler
 * (elden yazılmış serbest metinler) "maliyeti bilinmiyor" olarak işaretlenir
 * ki toplamlar sessizce yanlış çıkmasın.
 */
export function productProfitability(
  input: {
    products: ProductLite[];
    formulas: FormulaCostRow[];
    orders: OrderLite[];
    orderItems: OrderItemLite[];
  },
  options: ProfitabilityOptions = {},
): Profitability {
  const now = options.now ?? Date.now();
  const sinceDays = options.sinceDays ?? 90;
  const lowMarginThreshold = options.lowMarginThreshold ?? 15;
  const cutoff = now - sinceDays * DAY_MS;

  const cost = buildProductCostMap(input.products, input.formulas);
  const orderTime = new Map(input.orders.map(o => [o.id, new Date(o.createdAt).getTime()]));

  // Aynı normalleştirilmiş ada göre ciro/adet topla.
  const agg = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const it of input.orderItems) {
    const t = orderTime.get(it.orderId);
    if (t === undefined || t < cutoff) continue;
    const key = normalizeName(it.productName);
    const cur = agg.get(key) ?? { name: it.productName, qty: 0, revenue: 0 };
    cur.qty += num(it.quantity);
    cur.revenue += num(it.quantity) * num(it.unitPrice);
    agg.set(key, cur);
  }

  const rows: ProfitRow[] = [];
  let totalRevenue = 0;
  let matchedRevenue = 0;
  let totalProfit = 0;
  let matchedCount = 0;

  for (const [key, v] of Array.from(agg.entries())) {
    totalRevenue += v.revenue;
    const pid = cost.nameToId.get(key);
    const detail = pid !== undefined ? cost.byId.get(pid) : undefined;
    if (detail) {
      const costTotal = detail.totalUnitCost * v.qty;
      const profit = v.revenue - costTotal;
      matchedRevenue += v.revenue;
      totalProfit += profit;
      matchedCount += 1;
      rows.push({
        name: v.name,
        qty: v.qty,
        revenue: v.revenue,
        cost: costTotal,
        profit,
        margin: v.revenue > 0 ? (profit / v.revenue) * 100 : 0,
        matched: true,
      });
    } else {
      rows.push({ name: v.name, qty: v.qty, revenue: v.revenue, cost: null, profit: null, margin: null, matched: false });
    }
  }

  rows.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));

  const lowMargin = rows
    .filter(r => r.matched && r.margin !== null && r.margin < lowMarginThreshold)
    .sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0));

  return {
    rows,
    lowMargin,
    summary: {
      totalRevenue,
      matchedRevenue,
      unmatchedRevenue: totalRevenue - matchedRevenue,
      totalProfit,
      coverage: totalRevenue > 0 ? matchedRevenue / totalRevenue : 0,
      matchedCount,
      productCount: rows.length,
    },
  };
}

/* ------------------------- Müşteri zekâsı ------------------------- */

export type CustomerStat = {
  name: string;
  orderCount: number;
  totalSpent: number;
  outstanding: number;
  lastOrderTime: number;
  firstOrderTime: number;
  daysSinceLast: number;
  channels: string[];
};

export type CustomerInsights = {
  /** Toplam harcamaya göre azalan sıralı tüm müşteriler. */
  top: CustomerStat[];
  /** Belirtilen günden fazla süredir sipariş vermeyen (değerli → önce) müşteriler. */
  sleeping: CustomerStat[];
  /** Bu ay ilk siparişini veren yeni müşteriler. */
  newThisMonth: CustomerStat[];
  totalCustomers: number;
  activeCustomers: number;
};

export type CustomerInsightsOptions = {
  now?: number;
  /** Bu kadar günden fazla sessiz kalan müşteri "uykuda" sayılır. Varsayılan 60. */
  sleepingDays?: number;
};

/**
 * Sipariş geçmişinden müşteri bazında değer (toplam harcama), sıklık ve son
 * temas tarihini çıkarır; en değerli müşterileri, kaybedilme riski taşıyan
 * "uykuda" müşterileri ve bu ayın yeni müşterilerini ayırır.
 */
export function customerInsights(
  orders: OrderLite[],
  options: CustomerInsightsOptions = {},
): CustomerInsights {
  const now = options.now ?? Date.now();
  const sleepingDays = options.sleepingDays ?? 60;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const map = new Map<
    string,
    {
      name: string;
      orderCount: number;
      totalSpent: number;
      outstanding: number;
      lastOrderTime: number;
      firstOrderTime: number;
      channels: Set<string>;
    }
  >();

  for (const o of orders) {
    const rawName = (o.customerName ?? "").trim();
    if (!rawName) continue;
    const key = normalizeName(rawName);
    const t = new Date(o.createdAt).getTime();
    const total = num(o.totalAmount);
    const due = o.paymentStatus === "paid" ? 0 : Math.max(0, total - num(o.paidAmount));
    const cur =
      map.get(key) ??
      {
        name: rawName,
        orderCount: 0,
        totalSpent: 0,
        outstanding: 0,
        lastOrderTime: 0,
        firstOrderTime: Number.POSITIVE_INFINITY,
        channels: new Set<string>(),
      };
    cur.orderCount += 1;
    cur.totalSpent += total;
    cur.outstanding += due;
    if (t > cur.lastOrderTime) {
      cur.lastOrderTime = t;
      cur.name = rawName; // en güncel yazımı koru
    }
    if (t < cur.firstOrderTime) cur.firstOrderTime = t;
    if (o.channel) cur.channels.add(o.channel);
    map.set(key, cur);
  }

  const all: CustomerStat[] = Array.from(map.values()).map(c => ({
    name: c.name,
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
    outstanding: c.outstanding,
    lastOrderTime: c.lastOrderTime,
    firstOrderTime: Number.isFinite(c.firstOrderTime) ? c.firstOrderTime : c.lastOrderTime,
    daysSinceLast: Math.floor((now - c.lastOrderTime) / DAY_MS),
    channels: Array.from(c.channels),
  }));

  const top = [...all].sort((a, b) => b.totalSpent - a.totalSpent);
  const sleeping = all
    .filter(c => c.totalSpent > 0 && c.daysSinceLast >= sleepingDays)
    .sort((a, b) => b.totalSpent - a.totalSpent);
  const newThisMonth = all
    .filter(c => c.firstOrderTime >= monthStart.getTime())
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return {
    top,
    sleeping,
    newThisMonth,
    totalCustomers: all.length,
    activeCustomers: all.length - sleeping.length,
  };
}

/* ------------------------- Dinamik stok / satın alma tahmini ------------------------- */

export type MaterialLite = {
  id: number;
  name: string;
  unit: string;
  category?: string | null;
  stockQty: string | number;
  criticalQty: string | number;
};

export type StockMovementLite = {
  materialId: number;
  type: "in" | "out";
  qty: string | number;
  createdAt: string | number | Date;
};

export type StockStatus = "out" | "critical" | "low" | "ok";

export type StockForecastRow = {
  id: number;
  name: string;
  unit: string;
  category: string | null;
  stock: number;
  criticalQty: number;
  /** Pencere içindeki günlük ortalama tüketim (birim/gün). */
  dailyUsage: number;
  /** Mevcut stok kaç gün yeter; tüketim yoksa null (süresiz). */
  daysOfCover: number | null;
  status: StockStatus;
  /** Hedef gün sayısını karşılamak için önerilen sipariş miktarı (birim). */
  suggestedOrder: number;
};

export type StockForecast = {
  rows: StockForecastRow[];
  counts: { out: number; critical: number; low: number };
  /** Sipariş önerilecek (out/critical/low) satırlar, aciliyet sırasıyla. */
  toOrder: StockForecastRow[];
};

export type StockForecastOptions = {
  now?: number;
  /** Tüketim hızının hesaplanacağı geçmiş pencere (gün). Varsayılan 90. */
  windowDays?: number;
  /** Tedarik süresi (gün): stok bu süreden az yeterse "kritik". Varsayılan 14. */
  leadDays?: number;
  /** Sipariş önerisinin karşılamayı hedeflediği gün sayısı. Varsayılan 30. */
  targetDays?: number;
};

const STATUS_RANK: Record<StockStatus, number> = { out: 0, critical: 1, low: 2, ok: 3 };

/**
 * Her hammadde için stok hareketlerinden (çıkışlar = tüketim) günlük tüketim
 * hızını çıkarır; mevcut stoğun kaç gün yeteceğini, aciliyet durumunu ve
 * hedef günü karşılayacak önerilen sipariş miktarını hesaplar. Tüketim geçmişi
 * yoksa kullanıcının girdiği sabit kritik eşiğe (criticalQty) düşer.
 * Saf fonksiyon — DB'ye/React'e bağlı değil, birim test edilir.
 */
export function stockForecast(
  materials: MaterialLite[],
  movements: StockMovementLite[],
  options: StockForecastOptions = {},
): StockForecast {
  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? 90;
  const leadDays = options.leadDays ?? 14;
  const targetDays = options.targetDays ?? 30;
  const cutoff = now - windowDays * DAY_MS;

  // Pencere içindeki çıkış (tüketim) miktarını hammadde başına topla.
  const usageById = new Map<number, number>();
  for (const m of movements) {
    if (m.type !== "out") continue;
    if (new Date(m.createdAt).getTime() < cutoff) continue;
    usageById.set(m.materialId, (usageById.get(m.materialId) ?? 0) + num(m.qty));
  }

  const rows: StockForecastRow[] = materials.map(mat => {
    const stock = num(mat.stockQty);
    const criticalQty = num(mat.criticalQty);
    const dailyUsage = (usageById.get(mat.id) ?? 0) / windowDays;
    const daysOfCover = dailyUsage > 0 ? stock / dailyUsage : null;

    let status: StockStatus;
    let suggestedOrder = 0;
    if (stock <= 0) {
      status = "out";
    } else if (dailyUsage > 0) {
      if (daysOfCover! <= leadDays) status = "critical";
      else if (daysOfCover! <= leadDays * 2) status = "low";
      else status = "ok";
    } else {
      // Tüketim geçmişi yok → sabit eşiğe düş.
      status = criticalQty > 0 && stock <= criticalQty ? "low" : "ok";
    }

    if (dailyUsage > 0 && status !== "ok") {
      suggestedOrder = Math.max(0, Math.ceil(dailyUsage * targetDays - stock));
    } else if (dailyUsage === 0 && status !== "ok") {
      suggestedOrder = Math.max(0, Math.ceil(criticalQty * 2 - stock));
    } else if (status === "out") {
      suggestedOrder = Math.max(suggestedOrder, Math.ceil(criticalQty) || 1);
    }

    return {
      id: mat.id,
      name: mat.name,
      unit: mat.unit,
      category: mat.category ?? null,
      stock,
      criticalQty,
      dailyUsage,
      daysOfCover,
      status,
      suggestedOrder,
    };
  });

  const rank = (r: StockForecastRow) => STATUS_RANK[r.status];
  rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const da = a.daysOfCover ?? Number.POSITIVE_INFINITY;
    const db = b.daysOfCover ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  const toOrder = rows.filter(r => r.status !== "ok");
  return {
    rows,
    toOrder,
    counts: {
      out: rows.filter(r => r.status === "out").length,
      critical: rows.filter(r => r.status === "critical").length,
      low: rows.filter(r => r.status === "low").length,
    },
  };
}
