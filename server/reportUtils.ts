import {
  calcChannelProfit,
  ChannelProfile,
  DEFAULT_CHANNEL_PROFILES,
} from "../shared/pricing";

/**
 * Kanal bazlı toplu net kâr raporu — saf mantık. Sipariş başına, finans onaylı
 * calcChannelProfit modeliyle hesaplar (kâr modeli v2, 15.07.2026):
 *  - yüzdesel kesintiler (komisyon/ödeme/stopaj) sipariş toplamı üzerinden,
 *  - işlem bedeli ve kargo sipariş başına BİR KEZ (tek ürün hesabından farkı),
 *  - ürün maliyeti = hammadde + ambalaj (KDV dahil girilir; kanal KDV'siyle
 *    arındırılıp indirilecek KDV düşülür), kalem adediyle çarpılır.
 * Maliyeti bilinmeyen kalemler (katalog eşleşmesi yok) maliyet 0 sayılır ve
 * missingCostItems ile raporlanır — marj o kanalda iyimser olabilir.
 */

const trKey = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

export type ReportOrder = {
  id: number;
  channel: string | null;
  status: string;
  createdAt: Date | string;
  totalAmount: unknown;
};

export type ReportItem = {
  orderId: number;
  productId: number | null;
  quantity: unknown;
};

export type ProductCostInfo = {
  /** KDV hariç hammadde maliyeti (formülden). */
  materialCost: number;
  packagingCost: number;
  shippingCost: number;
};

export type ChannelProfitRow = {
  channel: string;
  profileName: string;
  orders: number;
  /** KDV dahil ciro. */
  revenue: number;
  /** KDV hariç satış (gerçek hasılat). */
  saleEx: number;
  productCost: number;
  commission: number;
  paymentFee: number;
  transactionFee: number;
  shipping: number;
  stopaj: number;
  net: number;
  /** net / KDV hariç satış (%). */
  margin: number;
  /** Maliyeti bilinmeyen (katalogla eşleşmeyen) kalem sayısı. */
  missingCostItems: number;
};

/** Sipariş kanalını profile eşler: tam ad → kısmi ad → elden (kesintisiz). */
export function matchChannelProfile(channel: string | null, profiles: ChannelProfile[]): ChannelProfile {
  const c = trKey(channel ?? "");
  if (c) {
    const exact = profiles.find(p => trKey(p.name) === c);
    if (exact) return exact;
    const partial = profiles.find(p => trKey(p.name).includes(c) || c.includes(trKey(p.name)));
    if (partial) return partial;
  }
  return profiles.find(p => p.kind === "elden") ?? DEFAULT_CHANNEL_PROFILES[0];
}

export function channelProfitReport(
  orders: ReportOrder[],
  items: ReportItem[],
  costs: Map<number, ProductCostInfo>,
  profiles: ChannelProfile[],
  since: Date,
  /** Adet başı işçilik + genel gider (KDV hariç); kalem adediyle çarpılıp düşülür. */
  laborOverheadPerUnit = 0,
): { rows: ChannelProfitRow[]; totals: Omit<ChannelProfitRow, "channel" | "profileName"> } {
  const itemsByOrder = new Map<number, ReportItem[]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }

  const byChannel = new Map<string, ChannelProfitRow>();
  for (const o of orders) {
    if (o.status === "cancelled") continue; // iptal/iade rapora girmez
    if (new Date(o.createdAt).getTime() < since.getTime()) continue;
    const revenue = toNum(o.totalAmount);
    const profile = matchChannelProfile(o.channel, profiles);
    const orderItems = itemsByOrder.get(o.id) ?? [];

    let productCost = 0;
    let shippingOverride = 0;
    let missing = 0;
    let qtyTotal = 0;
    for (const it of orderItems) {
      const info = it.productId != null ? costs.get(it.productId) : undefined;
      if (!info) {
        missing++;
        continue;
      }
      productCost += (info.materialCost + info.packagingCost) * toNum(it.quantity);
      qtyTotal += toNum(it.quantity);
      shippingOverride = Math.max(shippingOverride, info.shippingCost);
    }
    if (orderItems.length === 0) missing++; // kalemsiz sipariş: maliyeti bilinmiyor

    // Maliyet KDV dahil (formül birim maliyetleri brüt); kanalın KDV'siyle
    // indirilecek KDV düşülür (fiyat/maliyet sayfalarıyla aynı model). İşçilik +
    // genel gider adet başı, KDV hariç doğrudan düşülür.
    const p = calcChannelProfit({
      salePrice: revenue,
      productCost,
      productCostVatPercent: profile.vatPercent,
      extraCostEx: laborOverheadPerUnit * qtyTotal,
      profile,
      shippingOverride,
    });

    const key = trKey(o.channel ?? "") || "diğer";
    const row =
      byChannel.get(key) ??
      ({
        channel: o.channel ?? "diğer",
        profileName: profile.name,
        orders: 0,
        revenue: 0,
        saleEx: 0,
        productCost: 0,
        commission: 0,
        paymentFee: 0,
        transactionFee: 0,
        shipping: 0,
        stopaj: 0,
        net: 0,
        margin: 0,
        missingCostItems: 0,
      } satisfies ChannelProfitRow);
    row.orders += 1;
    row.revenue += revenue;
    row.saleEx += p.saleEx;
    row.productCost += productCost;
    row.commission += p.commission;
    row.paymentFee += p.paymentFee;
    row.transactionFee += p.transactionFee;
    row.shipping += p.shipping;
    row.stopaj += p.stopaj;
    row.net += p.net;
    row.missingCostItems += missing;
    byChannel.set(key, row);
  }

  const rows = Array.from(byChannel.values())
    .map(r => ({ ...r, margin: r.saleEx > 0 ? (r.net / r.saleEx) * 100 : 0 }))
    .sort((a, b) => b.net - a.net);

  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      revenue: t.revenue + r.revenue,
      saleEx: t.saleEx + r.saleEx,
      productCost: t.productCost + r.productCost,
      commission: t.commission + r.commission,
      paymentFee: t.paymentFee + r.paymentFee,
      transactionFee: t.transactionFee + r.transactionFee,
      shipping: t.shipping + r.shipping,
      stopaj: t.stopaj + r.stopaj,
      net: t.net + r.net,
      margin: 0,
      missingCostItems: t.missingCostItems + r.missingCostItems,
    }),
    { orders: 0, revenue: 0, saleEx: 0, productCost: 0, commission: 0, paymentFee: 0, transactionFee: 0, shipping: 0, stopaj: 0, net: 0, margin: 0, missingCostItems: 0 },
  );
  totals.margin = totals.saleEx > 0 ? (totals.net / totals.saleEx) * 100 : 0;

  return { rows, totals };
}
