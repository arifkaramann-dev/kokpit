/**
 * Finans saf fonksiyonları: DB satırları üzerinde çalışan, yan etkisiz hesap
 * mantığı. db.ts bu fonksiyonları kullanır; birim testleri doğrudan bunları
 * test eder (finans onaylı davranış burada kilitlenir).
 */

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const trKey = (n: string) => n.trim().toLocaleLowerCase("tr-TR");

/* ------------------- Kasa/banka bakiyesi ------------------- */

/** Hesap bakiyesi: açılış + giren − çıkan. */
export function accountBalance(
  openingBalance: unknown,
  txns: { direction: "in" | "out"; amount: unknown }[],
): number {
  let bal = toNum(openingBalance);
  for (const t of txns) bal += t.direction === "in" ? toNum(t.amount) : -toNum(t.amount);
  return bal;
}

/* ------------------- Müşteri cari bakiyeleri ------------------- */

export type BalanceOrderRow = {
  name: string | null;
  customerId: number | null;
  total: unknown;
  status: string;
};

export type BalanceTxnRow = {
  name: string | null;
  customerId: number | null;
  direction: "in" | "out";
  amount: unknown;
  category: string;
};

/**
 * Tüm müşterilerin cari bakiyesi (Türkçe küçük harf ada göre):
 * sipariş toplamı (borç) − tahsilat (alacak). Pozitif = müşteri borçlu.
 * ID'li kayıtlar müşterinin güncel adı altında toplanır; iptaller hariç.
 */
export function customerBalancesFrom(
  ords: BalanceOrderRow[],
  txns: BalanceTxnRow[],
  custs: { id: number; name: string }[],
): Record<string, number> {
  const nameById = new Map(custs.map(c => [c.id, c.name]));
  const canonical = (customerId: number | null, name: string | null) =>
    (customerId != null ? nameById.get(customerId) : undefined) ?? name ?? "";
  const out: Record<string, number> = {};
  for (const o of ords) {
    if (o.status === "cancelled") continue; // iptal/iade borç doğurmaz
    const k = trKey(canonical(o.customerId, o.name));
    if (k) out[k] = (out[k] ?? 0) + toNum(o.total);
  }
  for (const t of txns) {
    if (t.category !== "tahsilat") continue;
    const k = trKey(canonical(t.customerId, t.name));
    if (!k) continue;
    out[k] = (out[k] ?? 0) - (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/* ------------------- Tedarikçi cari bakiyeleri ------------------- */

export type SupplierPurchaseRow = { name: string | null; supplierId: number | null; total: unknown };
export type SupplierTxnRow = {
  name: string | null;
  supplierId: number | null;
  direction: "in" | "out";
  amount: unknown;
};

/**
 * Tedarikçi cari bakiyeleri: alış faturaları (borç) − ödemeler.
 * Pozitif = biz tedarikçiye borçluyuz.
 */
export function supplierBalancesFrom(
  purs: SupplierPurchaseRow[],
  txns: SupplierTxnRow[],
  sups: { id: number; name: string }[],
): Record<string, number> {
  const nameById = new Map(sups.map(s => [s.id, s.name]));
  const canonical = (supplierId: number | null, name: string | null) =>
    (supplierId != null ? nameById.get(supplierId) : undefined) ?? name ?? "";
  const out: Record<string, number> = {};
  for (const p of purs) {
    const k = trKey(canonical(p.supplierId, p.name));
    if (k) out[k] = (out[k] ?? 0) + toNum(p.total);
  }
  for (const t of txns) {
    const k = trKey(canonical(t.supplierId, t.name));
    if (!k) continue;
    // Tedarikçiye ödeme (out) borcumuzu azaltır.
    out[k] = (out[k] ?? 0) - (t.direction === "out" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/* ------------------- Tahsilat → sipariş ödeme senkronu ------------------- */

/** Bir siparişe bağlı tahsilat hareketlerinin net toplamı (giren − çıkan). */
export function collectionTotal(
  txns: { direction: "in" | "out"; category: string; amount: unknown }[],
): number {
  return txns
    .filter(t => t.category === "tahsilat")
    .reduce((s, t) => s + (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount)), 0);
}

/** Toplanan tutara göre sipariş ödeme durumu (kuruş toleransı 0.001). */
export function paymentStatusFor(collected: number, total: number): "unpaid" | "partial" | "paid" {
  return collected <= 0 ? "unpaid" : collected + 0.001 >= total ? "paid" : "partial";
}

/* ------------------- KDV özeti ------------------- */

export type VatOrderRow = { total: unknown; date: Date | string; status: string };
export type VatPurchaseRow = { total: unknown; date: Date | string | null; created: Date | string };

/**
 * Belirli bir tarihten bugüne KDV özeti: satış KDV'si (iptal hariç, KDV dahil
 * kabul) − alış KDV'si = ödenecek KDV.
 */
export function vatSummarySince(
  ords: VatOrderRow[],
  purs: VatPurchaseRow[],
  rate: number,
  since: number,
) {
  const vatOf = (gross: number) => gross - gross / (1 + rate / 100);
  let salesGross = 0;
  for (const o of ords) {
    if (o.status === "cancelled") continue; // iptal/iade KDV matrahına girmez
    if (new Date(o.date).getTime() >= since) salesGross += toNum(o.total);
  }
  let buyGross = 0;
  for (const p of purs) {
    const t = new Date((p.date ?? p.created) as never).getTime();
    if (t >= since) buyGross += toNum(p.total);
  }
  const salesVat = vatOf(salesGross);
  const buyVat = vatOf(buyGross);
  return { salesGross, salesVat, buyGross, buyVat, payable: salesVat - buyVat };
}

/* ------------------- Vadesi geçen alacaklar (Tahsilat Takipçisi) ------------------- */

export type ReceivableOrderLike = {
  id: number;
  orderNo: string;
  customerName: string;
  totalAmount: unknown;
  paidAmount: unknown;
  paymentStatus: string;
  status: string;
  createdAt: Date | string;
};

export type OverdueCustomer = {
  customerName: string;
  totalDue: number;
  /** En eski açık siparişin yaşı (gün). */
  oldestDays: number;
  orders: { orderNo: string; due: number; days: number }[];
};

/**
 * minDays gündür ödenmemiş (kalan > 0) siparişleri müşteri bazında gruplar.
 * İptal/iade edilenler ve tamamı ödenenler hariç; en yüksek alacak önce.
 */
export function overdueReceivables(
  orders: ReceivableOrderLike[],
  minDays = 30,
  now: Date = new Date(),
): OverdueCustomer[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const byCustomer = new Map<string, OverdueCustomer>();
  for (const o of orders) {
    if (o.status === "cancelled" || o.paymentStatus === "paid") continue;
    const due = toNum(o.totalAmount) - toNum(o.paidAmount);
    if (due <= 0.001) continue;
    const days = Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / dayMs);
    if (days < minDays) continue;
    const key = trKey(o.customerName);
    const entry = byCustomer.get(key) ?? { customerName: o.customerName, totalDue: 0, oldestDays: 0, orders: [] };
    entry.totalDue += due;
    entry.oldestDays = Math.max(entry.oldestDays, days);
    entry.orders.push({ orderNo: o.orderNo, due, days });
    byCustomer.set(key, entry);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.totalDue - a.totalDue);
}
