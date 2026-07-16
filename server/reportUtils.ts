/**
 * Kanal Kârlılığı raporu — saf toplama çekirdeği (DB'siz, test edilebilir).
 *
 * Model (finans onaylı v2 ile aynı çekirdek — shared/pricing.calcChannelProfit):
 *  - Ciro sipariş toplamından (KDV dahil) okunur; hasılat = KDV hariç satış.
 *  - Komisyon / ödeme bedeli sipariş toplamının yüzdesi; işlem bedeli ve kargo
 *    SİPARİŞ BAŞINA bir kez düşülür (pazaryeri faturalama pratiği).
 *  - Ürün maliyeti kalemlerden gelir: KDV hariç (hammadde + ambalaj).
 *  - Maliyeti bilinmeyen kalem (katalog eşleşmesi yok veya formülü yok):
 *    TEMKİNLİ sunum — o kalemin KDV hariç cirosu net kârdan DÜŞÜLÜR (katkısı
 *    sıfır varsayılır), ayrıca adet ve ciro payı raporlanır. Gerekçe: maliyeti
 *    bilinmeyen satışı %100 kârlı saymak net kârı şişirir ve fiyat kararlarını
 *    yanıltır; eksik veri kârı olduğundan az göstersin, asla fazla göstermesin.
 *  - Profili olmayan kanal: kesintisiz + KDV %20 varsayılan profille hesaplanır
 *    ve `hasProfile: false` ile işaretlenir (arayüz uyarı gösterir — kesintiler
 *    hesaba katılmadığı için net kâr iyimser olabilir).
 *  - cancelled siparişler tamamen hariç (ciro/KDV tanımlarıyla tutarlı).
 *  - Yuvarlama tek yerde: tüm parasal alanlar en sonda kuruşa yuvarlanır.
 */

import {
  calcChannelProfit,
  DEFAULT_CHANNEL_PROFILES,
  normalizeChannelProfile,
  type ChannelProfile,
} from "../shared/pricing";

/* ------------------------- Girdi tipleri ------------------------- */

export type ReportOrder = {
  id: number;
  channel: string | null;
  status: string;
  totalAmount: string | number;
};

export type ReportOrderItem = {
  orderId: number;
  productId: number | null;
  quantity: string | number;
  unitPrice: string | number;
};

/** productCost: KDV hariç (hammadde + ambalaj). shippingCost: KDV dahil, ürün bazlı. */
export type ProductCostInfo = { productCost: number; shippingCost: number };

/* ------------------------- Çıktı tipleri ------------------------- */

export type ChannelProfitSummary = {
  /** Sipariş kaydındaki kanal adı (görünen ad). */
  channel: string;
  /** Eşleşen kanal profili adı; null = profil bulunamadı. */
  profileName: string | null;
  /** false ise kesintiler hesaba katılmadı — arayüz uyarı göstermeli. */
  hasProfile: boolean;
  orderCount: number;
  /** KDV dahil ciro. */
  revenue: number;
  /** KDV hariç ciro (gerçek hasılat). */
  revenueEx: number;
  /** Kesinti kırılımı — hepsi KDV'si indirilmiş net maliyet (v2). */
  commission: number;
  paymentFee: number;
  transactionFee: number;
  stopaj: number;
  shipping: number;
  totalFees: number;
  /** Maliyeti BİLİNEN kalemlerin toplam ürün maliyeti (KDV hariç). */
  productCost: number;
  /** Maliyeti bilinmeyen kalem sayısı (kalemsiz sipariş 1 kalem sayılır). */
  unknownCostItemCount: number;
  /** Maliyeti bilinmeyen kalemlerin cirosu (KDV dahil). */
  unknownCostRevenue: number;
  /** Bilinmeyen cironun kanal cirosuna oranı (%). */
  unknownCostShare: number;
  /** Temkinli net kâr: bilinmeyen kalemlerin katkısı sıfır varsayılır. */
  net: number;
  /** Net kâr marjı: net / KDV hariç ciro (v2 tanımı). */
  margin: number;
};

export type ChannelProfitReport = {
  channels: ChannelProfitSummary[];
  totals: Omit<ChannelProfitSummary, "channel" | "profileName" | "hasProfile">;
};

/* ------------------------- Yardımcılar ------------------------- */

const toNum = (v: string | number | null | undefined): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Kuruş yuvarlaması — TEK yer. Ara toplamlar tam hassasiyetle taşınır. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

function normName(s: string): string {
  return s.trim().toLocaleLowerCase("tr-TR");
}

/** Ayarlardaki channelProfiles JSON'unu Pricing.tsx ile aynı kurallarla okur. */
export function parseChannelProfiles(raw: string | null | undefined): ChannelProfile[] {
  try {
    const parsed = JSON.parse(raw ?? "");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeChannelProfile);
  } catch {
    /* ayar yoksa varsayılanlar */
  }
  return DEFAULT_CHANNEL_PROFILES;
}

/**
 * Ürün maliyet haritası: yalnızca formülü olan ürünler girer — formülsüz ürünün
 * hammadde maliyeti BİLİNMİYOR demektir; 0 varsaymak kârı şişirir, o yüzden
 * haritaya alınmaz ve kalemi "maliyeti bilinmeyen" sınıfına düşer.
 * productCost = formül maliyeti + ambalaj (Pricing.tsx ile aynı tanım).
 */
export function buildProductCostMap(
  materialRows: { productId: number; materialCost: string | number }[],
  productRows: { id: number; packagingCost: string | number; shippingCost: string | number }[],
): Map<number, ProductCostInfo> {
  const byId = new Map(productRows.map(p => [p.id, p]));
  const out = new Map<number, ProductCostInfo>();
  for (const r of materialRows) {
    const p = byId.get(r.productId);
    if (!p) continue;
    out.set(r.productId, {
      productCost: toNum(r.materialCost) + toNum(p.packagingCost),
      shippingCost: toNum(p.shippingCost),
    });
  }
  return out;
}

/** Profili olmayan kanal için varsayılan: kesintisiz, KDV %20 (yasal varsayılan). */
export function fallbackProfile(channel: string): ChannelProfile {
  return {
    name: channel,
    kind: "elden",
    commissionPercent: 0,
    paymentFeePercent: 0,
    paymentFeeVatDeductible: true,
    fixedFee: 0,
    stopajPercent: 0,
    vatPercent: 20,
    shippingCost: 0,
  };
}

/**
 * Kanal adını profile eşler: önce birebir ad, sonra önek eşleşmesi
 * ("web" → "Web Sitesi"). Eşleşme yoksa null (çağıran fallbackProfile kullanır).
 */
export function matchChannelProfile(channel: string, profiles: ChannelProfile[]): ChannelProfile | null {
  const c = normName(channel);
  if (!c) return null;
  const exact = profiles.find(p => normName(p.name) === c);
  if (exact) return exact;
  if (c.length >= 3) {
    const prefix = profiles.find(p => {
      const n = normName(p.name);
      return n.startsWith(c) || c.startsWith(n);
    });
    if (prefix) return prefix;
  }
  return null;
}

/** Dönem başlangıcı — mevcut rapor tanımlarıyla aynı (cashflow: ay/yıl, analiz: 30 gün). */
export type ReportPeriod = "month" | "30d" | "year";

export function periodStart(period: ReportPeriod, now: Date = new Date()): Date {
  switch (period) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "30d":
      return new Date(now.getTime() - 30 * 86400000);
  }
}

/* ------------------------- Toplama ------------------------- */

type Bucket = {
  channel: string;
  profile: ChannelProfile | null;
  orderCount: number;
  revenue: number;
  revenueEx: number;
  commission: number;
  paymentFee: number;
  transactionFee: number;
  stopaj: number;
  shipping: number;
  productCost: number;
  unknownCostItemCount: number;
  unknownCostRevenue: number;
  net: number;
};

export function aggregateChannelProfit(input: {
  orders: ReportOrder[];
  orderItems: ReportOrderItem[];
  costs: Map<number, ProductCostInfo>;
  profiles: ChannelProfile[];
}): ChannelProfitReport {
  const itemsByOrder = new Map<number, ReportOrderItem[]>();
  for (const it of input.orderItems) {
    const list = itemsByOrder.get(it.orderId);
    if (list) list.push(it);
    else itemsByOrder.set(it.orderId, [it]);
  }

  const buckets = new Map<string, Bucket>();

  for (const order of input.orders) {
    // İptal/iade ciroya, KDV'ye ve kâra girmez — mevcut rapor tanımıyla aynı.
    if (order.status === "cancelled") continue;

    const channel = (order.channel ?? "").trim() || "diğer";
    const key = normName(channel);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        channel,
        profile: matchChannelProfile(channel, input.profiles),
        orderCount: 0,
        revenue: 0,
        revenueEx: 0,
        commission: 0,
        paymentFee: 0,
        transactionFee: 0,
        stopaj: 0,
        shipping: 0,
        productCost: 0,
        unknownCostItemCount: 0,
        unknownCostRevenue: 0,
        net: 0,
      };
      buckets.set(key, bucket);
    }
    const profile = bucket.profile ?? fallbackProfile(channel);
    const vat = 1 + profile.vatPercent / 100;

    const total = toNum(order.totalAmount);
    const items = itemsByOrder.get(order.id) ?? [];

    // Kalem ayrımı: maliyeti bilinen (formüllü + eşleşmiş) / bilinmeyen.
    let knownCost = 0;
    let shippingOverride = 0; // Sipariş = tek gönderi: kalemlerin en yükseği (tahmin).
    let unknownRevenue = 0;
    let unknownCount = 0;
    for (const it of items) {
      const info = it.productId != null ? input.costs.get(it.productId) : undefined;
      const lineRevenue = toNum(it.quantity) * toNum(it.unitPrice);
      if (info) {
        knownCost += toNum(it.quantity) * info.productCost;
        if (info.shippingCost > shippingOverride) shippingOverride = info.shippingCost;
      } else {
        unknownRevenue += lineRevenue;
        unknownCount += 1;
      }
    }
    // Kalemsiz sipariş: cironun tamamı maliyeti bilinmeyen tek kalem sayılır.
    if (items.length === 0 && total > 0) {
      unknownRevenue = total;
      unknownCount = 1;
    }

    // Sipariş başına v2 hesabı — tek kalemli siparişte calcChannelProfit ile birebir.
    const r = calcChannelProfit({ salePrice: total, productCost: knownCost, profile, shippingOverride });

    bucket.orderCount += 1;
    bucket.revenue += total;
    bucket.revenueEx += r.saleEx;
    bucket.commission += r.commission;
    bucket.paymentFee += r.paymentFee;
    bucket.transactionFee += r.transactionFee;
    bucket.stopaj += r.stopaj;
    bucket.shipping += r.shipping;
    bucket.productCost += knownCost;
    bucket.unknownCostItemCount += unknownCount;
    bucket.unknownCostRevenue += unknownRevenue;
    // Temkinli net: bilinmeyen kalemin KDV hariç cirosu kârdan düşülür (katkı 0).
    bucket.net += r.net - unknownRevenue / vat;
  }

  const finalize = (b: Bucket): ChannelProfitSummary => {
    const totalFees = b.commission + b.paymentFee + b.transactionFee + b.stopaj + b.shipping;
    return {
      channel: b.channel,
      profileName: b.profile?.name ?? null,
      hasProfile: b.profile !== null,
      orderCount: b.orderCount,
      revenue: round2(b.revenue),
      revenueEx: round2(b.revenueEx),
      commission: round2(b.commission),
      paymentFee: round2(b.paymentFee),
      transactionFee: round2(b.transactionFee),
      stopaj: round2(b.stopaj),
      shipping: round2(b.shipping),
      totalFees: round2(totalFees),
      productCost: round2(b.productCost),
      unknownCostItemCount: b.unknownCostItemCount,
      unknownCostRevenue: round2(b.unknownCostRevenue),
      unknownCostShare: b.revenue > 0 ? round2((b.unknownCostRevenue / b.revenue) * 100) : 0,
      net: round2(b.net),
      margin: b.revenueEx > 0 ? round2((b.net / b.revenueEx) * 100) : 0,
    };
  };

  const channels = Array.from(buckets.values())
    .map(finalize)
    .sort((a, b) => b.revenue - a.revenue);

  // Toplam satırı: kanal toplamlarının (yuvarlanmamış) birleşimi yerine
  // kuruş farkı olmasın diye yuvarlanmış kanal değerleri toplanır.
  const sum = (f: (c: ChannelProfitSummary) => number) => round2(channels.reduce((s, c) => s + f(c), 0));
  const revenue = sum(c => c.revenue);
  const revenueEx = sum(c => c.revenueEx);
  const net = sum(c => c.net);
  const totals = {
    orderCount: channels.reduce((s, c) => s + c.orderCount, 0),
    revenue,
    revenueEx,
    commission: sum(c => c.commission),
    paymentFee: sum(c => c.paymentFee),
    transactionFee: sum(c => c.transactionFee),
    stopaj: sum(c => c.stopaj),
    shipping: sum(c => c.shipping),
    totalFees: sum(c => c.totalFees),
    productCost: sum(c => c.productCost),
    unknownCostItemCount: channels.reduce((s, c) => s + c.unknownCostItemCount, 0),
    unknownCostRevenue: sum(c => c.unknownCostRevenue),
    unknownCostShare: revenue > 0 ? round2((channels.reduce((s, c) => s + c.unknownCostRevenue, 0) / revenue) * 100) : 0,
    net,
    margin: revenueEx > 0 ? round2((net / revenueEx) * 100) : 0,
  };

  return { channels, totals };
}
