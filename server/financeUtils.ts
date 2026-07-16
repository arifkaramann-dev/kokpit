/**
 * Finans çekirdeği — db.ts içindeki para hesaplarının saf (DB'siz) halleri.
 *
 * Buradaki fonksiyonlar hiçbir I/O yapmaz: db.ts ilgili satırları veritabanından
 * çeker, hesabı buraya devreder. Davranış db.ts'teki eski gömülü mantıkla
 * BİREBİR aynıdır; değişiklik yaparken finans-muhasebe-uzmani ile hizalan ve
 * server/finance.test.ts'i güncel tut.
 */

/** Decimal (string) kolon değerini sayıya çevirir; boş/bozuk değer 0 sayılır. */
export const toNum = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;

/** Cari anahtarı: Türkçe küçük harf + trim (aynı adın yazım varyantları birleşsin). */
const trKey = (n: string) => n.trim().toLocaleLowerCase("tr-TR");

export type PartyRef = { id: number; name: string };

/**
 * ID-kanonikleştirme: kayıt bir cari ID'sine bağlıysa carinin GÜNCEL adı
 * kullanılır (ad değişse de bakiye bölünmez); ID'siz (CRM dışı/eski) kayıtlar
 * kayıtlı isimle yaşar.
 */
function canonicalName(nameById: Map<number, string>, partyId: number | null, name: string | null): string {
  return (partyId != null ? nameById.get(partyId) : undefined) ?? name ?? "";
}

/* ------------------------------ Müşteri cari ------------------------------ */

export type CustomerOrderRow = {
  name: string | null;
  customerId: number | null;
  total: string | null;
  status: string | null;
};

export type CustomerTxnRow = {
  name: string | null;
  customerId: number | null;
  direction: string;
  amount: string | null;
  category: string | null;
};

/**
 * Tüm müşterilerin cari bakiyesi (küçük harf ada göre): sipariş toplamı (borç)
 * − tahsilat (alacak). Pozitif = müşteri bize borçlu. İptal sipariş borç
 * doğurmaz; tahsilat dışı hareketler cariyi etkilemez.
 */
export function computeCustomerBalances(input: {
  orders: CustomerOrderRow[];
  transactions: CustomerTxnRow[];
  customers: PartyRef[];
}): Record<string, number> {
  const nameById = new Map(input.customers.map(c => [c.id, c.name]));
  const out: Record<string, number> = {};
  for (const o of input.orders) {
    if (o.status === "cancelled") continue; // iptal/iade borç doğurmaz
    const k = trKey(canonicalName(nameById, o.customerId, o.name));
    if (k) out[k] = (out[k] ?? 0) + toNum(o.total);
  }
  for (const t of input.transactions) {
    if (t.category !== "tahsilat") continue;
    const k = trKey(canonicalName(nameById, t.customerId, t.name));
    if (!k) continue;
    out[k] = (out[k] ?? 0) - (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/* ----------------------------- Tedarikçi cari ----------------------------- */

export type SupplierPurchaseRow = {
  name: string | null;
  supplierId: number | null;
  total: string | null;
};

export type SupplierTxnRow = {
  name: string | null;
  supplierId: number | null;
  direction: string;
  amount: string | null;
};

/**
 * Tedarikçi cari bakiyeleri (küçük harf ada göre): alış faturaları (borç)
 * − tedarikçiye ödemeler. Pozitif = biz tedarikçiye borçluyuz.
 */
export function computeSupplierBalances(input: {
  purchases: SupplierPurchaseRow[];
  transactions: SupplierTxnRow[];
  suppliers: PartyRef[];
}): Record<string, number> {
  const nameById = new Map(input.suppliers.map(s => [s.id, s.name]));
  const out: Record<string, number> = {};
  for (const p of input.purchases) {
    const k = trKey(canonicalName(nameById, p.supplierId, p.name));
    if (k) out[k] = (out[k] ?? 0) + toNum(p.total);
  }
  for (const t of input.transactions) {
    const k = trKey(canonicalName(nameById, t.supplierId, t.name));
    if (!k) continue;
    // Tedarikçiye ödeme (out) borcumuzu azaltır.
    out[k] = (out[k] ?? 0) - (t.direction === "out" ? toNum(t.amount) : -toNum(t.amount));
  }
  return out;
}

/* -------------------------------- KDV raporu ------------------------------- */

export type VatOrderRow = { total: string | null; date: Date | string; status: string | null };
export type VatPurchaseRow = { total: string | null; date: Date | string | null; created: Date | string };

export type VatPeriod = {
  salesGross: number;
  salesVat: number;
  buyGross: number;
  buyVat: number;
  payable: number;
};

/**
 * KDV raporu: satış KDV'si (siparişler, KDV dahil kabul) − alış KDV'si
 * (alış faturaları) = ödenecek KDV. Bu ay ve bu yıl için ayrı hesaplar.
 * İptal siparişler matraha girmez; alış tarihi yoksa kayıt tarihi kullanılır.
 */
export function computeVatReport(input: {
  /** settings.vatRate ham değeri; boş/bozuksa %20 varsayılır. */
  rateValue: string | null | undefined;
  orders: VatOrderRow[];
  purchases: VatPurchaseRow[];
  /** Dönem sınırları bu ana göre kurulur (test edilebilirlik için enjekte). */
  now?: Date;
}): { rate: number; month: VatPeriod; year: VatPeriod } {
  const rate = parseFloat(input.rateValue ?? "") || 20;
  const now = input.now ?? new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const vatOf = (gross: number) => gross - gross / (1 + rate / 100);

  const calc = (since: number): VatPeriod => {
    let salesGross = 0;
    for (const o of input.orders) {
      if (o.status === "cancelled") continue; // iptal/iade KDV matrahına girmez
      if (new Date(o.date).getTime() >= since) salesGross += toNum(o.total);
    }
    let buyGross = 0;
    for (const p of input.purchases) {
      const t = new Date((p.date ?? p.created) as never).getTime();
      if (t >= since) buyGross += toNum(p.total);
    }
    const salesVat = vatOf(salesGross);
    const buyVat = vatOf(buyGross);
    return { salesGross, salesVat, buyGross, buyVat, payable: salesVat - buyVat };
  };

  return { rate, month: calc(monthStart), year: calc(yearStart) };
}

/* -------------------- Tahsilat → sipariş ödeme durumu senkronu -------------------- */

export type CollectionTxnRow = { amount: string | null; direction: string; category: string | null };

/**
 * Bir siparişe bağlı hareketlerden net tahsilat toplamı: yalnız "tahsilat"
 * kategorisi sayılır; giren (+), çıkan/iade (−).
 */
export function collectionTotal(txns: CollectionTxnRow[]): number {
  return txns
    .filter(t => t.category === "tahsilat")
    .reduce((s, t) => s + (t.direction === "in" ? toNum(t.amount) : -toNum(t.amount)), 0);
}

export type PaymentState = { paidAmount: number; status: "unpaid" | "partial" | "paid" };

/**
 * Sipariş toplamı + net tahsilata göre ödeme durumu:
 * ≤ 0 → unpaid, toplamı (kuruş toleransıyla) karşılıyorsa → paid, arası → partial.
 * paidAmount hiçbir zaman negatif yazılmaz; fazla ödeme olduğu gibi korunur.
 */
export function paymentStateFor(total: number, collected: number): PaymentState {
  const status = collected <= 0 ? "unpaid" : collected + 0.001 >= total ? "paid" : "partial";
  return { paidAmount: Math.max(0, collected), status };
}

/* ----------------------------- Kasa hesap bakiyesi ----------------------------- */

export type AccountTxnRow = { accountId: number | null; direction: string; amount: string | null };

/** Hesap bakiyesi: açılış + gelen − giden (transfer hareketleri de in/out olarak dahildir). */
export function computeAccountBalance(
  account: { id: number; openingBalance: string | null },
  txns: AccountTxnRow[],
): number {
  let bal = toNum(account.openingBalance);
  for (const t of txns) {
    if (t.accountId !== account.id) continue;
    bal += t.direction === "in" ? toNum(t.amount) : -toNum(t.amount);
  }
  return bal;
}

/* ----------------------------- Tek-uçuş kilidi ----------------------------- */

/**
 * Tek-uçuş (single-flight) kilidi: sarılan asenkron iş sürerken gelen çağrılar
 * yeni bir çalıştırma başlatmaz, süren işin sonucunu paylaşır. İş bitince
 * (başarı ya da hata) kilit açılır; sonraki çağrı yeni çalıştırma başlatır.
 * Pazaryeri senkronunda yarış durumunu (aynı siparişin iki kez eklenmesi) önler.
 */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
