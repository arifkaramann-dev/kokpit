/**
 * Master ve seri başına getiri — "hangi renk para kazandırıyor?"
 *
 * Sağlık karnesi (`masterHealth`) EKSİKLERİ söylüyordu: reçetesi yok, görseli
 * yok, yayında değil. Ama "bu ürün 3 ayda kaç sattı, ne kazandırdı" sorusunun
 * cevabı hiçbir yerde yoktu; üretim önceliği ve renk emekliliği kararı hisle
 * veriliyordu.
 *
 * Hesap `orderItems.masterId` bağına dayanır (bkz. `orderBinding.ts`). Bağ
 * kurulmadan bu rapor yazılamazdı — Faz 1'in Faz 2'yi açmasının sebebi budur.
 *
 * Saf modül: tarih penceresi ve satır listesi dışarıdan gelir.
 */

export type RevenueLine = {
  masterId: number | null;
  orderId: number;
  quantity: number;
  unitPrice: number;
  /** Sipariş tarihi — pencereye düşüp düşmediği buradan. */
  soldAt: Date;
  /** İptal/iade satırı ciroya girmez. */
  cancelled: boolean;
};

export type MasterRevenue = {
  masterId: number;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  /** Kâr / ciro. Ciro 0 ise 0 — bölme yok. */
  marginPercent: number;
  orderCount: number;
  lastSoldAt: Date | null;
};

/** Pencere: son N gün. 0/negatif verilirse tüm zamanlar. */
export function windowStart(days: number, now = new Date()): Date | null {
  if (days <= 0) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Master başına satış toplar.
 *
 * `unitCost` master'ın birim maliyeti (costing.ts). Maliyet BUGÜNKÜ maliyettir,
 * satış anındaki değil: hammadde fiyatı geçmişe dönük saklanmıyor. Kâr bu
 * yüzden "bugünkü maliyetle bu satışlar ne bırakırdı" sorusunun cevabıdır —
 * eğilim için doğru, muhasebe için değil. Karıştırılmasın diye burada yazılı.
 */
export function computeMasterRevenue(input: {
  lines: RevenueLine[];
  unitCosts: Map<number, number>;
  since?: Date | null;
}): MasterRevenue[] {
  const acc = new Map<
    number,
    { qty: number; revenue: number; orders: Set<number>; last: Date | null }
  >();

  for (const line of input.lines) {
    if (line.masterId == null) continue;
    if (line.cancelled) continue;
    if (input.since && line.soldAt < input.since) continue;

    const entry = acc.get(line.masterId) ?? {
      qty: 0,
      revenue: 0,
      orders: new Set<number>(),
      last: null,
    };
    entry.qty += line.quantity;
    entry.revenue += line.quantity * line.unitPrice;
    entry.orders.add(line.orderId);
    if (!entry.last || line.soldAt > entry.last) entry.last = line.soldAt;
    acc.set(line.masterId, entry);
  }

  return Array.from(acc, ([masterId, e]) => {
    const cost = (input.unitCosts.get(masterId) ?? 0) * e.qty;
    const profit = e.revenue - cost;
    return {
      masterId,
      qty: Math.round(e.qty * 100) / 100,
      revenue: Math.round(e.revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPercent: e.revenue > 0 ? Math.round((profit / e.revenue) * 1000) / 10 : 0,
      orderCount: e.orders.size,
      lastSoldAt: e.last,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export type SeriesRevenue = {
  seriesId: number;
  qty: number;
  revenue: number;
  profit: number;
  marginPercent: number;
  masterCount: number;
};

/** Seri bazında toplama — hangi seri taşıyor, hangisi yük. */
export function rollupRevenueBySeries(
  rows: MasterRevenue[],
  seriesOf: Map<number, number>,
): SeriesRevenue[] {
  const acc = new Map<number, { qty: number; revenue: number; profit: number; masters: Set<number> }>();
  for (const r of rows) {
    const seriesId = seriesOf.get(r.masterId);
    if (seriesId == null) continue;
    const e = acc.get(seriesId) ?? { qty: 0, revenue: 0, profit: 0, masters: new Set<number>() };
    e.qty += r.qty;
    e.revenue += r.revenue;
    e.profit += r.profit;
    e.masters.add(r.masterId);
    acc.set(seriesId, e);
  }
  return Array.from(acc, ([seriesId, e]) => ({
    seriesId,
    qty: Math.round(e.qty * 100) / 100,
    revenue: Math.round(e.revenue * 100) / 100,
    profit: Math.round(e.profit * 100) / 100,
    marginPercent: e.revenue > 0 ? Math.round((e.profit / e.revenue) * 1000) / 10 : 0,
    masterCount: e.masters.size,
  })).sort((a, b) => b.revenue - a.revenue);
}

export type DeadMaster = {
  masterId: number;
  /** Hiç satmadıysa null. */
  lastSoldAt: Date | null;
  daysSinceSale: number | null;
};

/**
 * Ölü renkler: pencerede hiç satmamış AKTİF ürünler.
 *
 * Taslak ve arşiv sayılmaz — biri henüz satışa çıkmamıştır, diğeri zaten
 * emekli edilmiştir. Sadece "yayında ama satmıyor" olan sermaye bağlar.
 */
export function findDeadMasters(input: {
  activeMasterIds: number[];
  revenue: MasterRevenue[];
  now?: Date;
}): DeadMaster[] {
  const now = input.now ?? new Date();
  const byMaster = new Map(input.revenue.map(r => [r.masterId, r]));
  const day = 24 * 60 * 60 * 1000;

  return input.activeMasterIds
    .filter(id => (byMaster.get(id)?.qty ?? 0) <= 0)
    .map(id => {
      const last = byMaster.get(id)?.lastSoldAt ?? null;
      return {
        masterId: id,
        lastSoldAt: last,
        daysSinceSale: last ? Math.floor((now.getTime() - last.getTime()) / day) : null,
      };
    });
}
