/**
 * Proaktif nöbetçi SAF fonksiyonları: DB satırları üzerinde çalışan, yan etkisiz
 * filtreler. scheduler.ts bunları kullanır; birim testleri doğrudan bunları test
 * eder (nöbetçi kuralları burada kilitlenir).
 */

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const dayMs = 24 * 60 * 60 * 1000;

/** Gün başlangıcına (yerel) yuvarlar — vade "gün" farkını saat kaymasından arındırır. */
function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/* ------------------- Çek/senet vade nöbetçisi ------------------- */

export type ChequeLike = {
  id: number;
  type: "cek" | "senet";
  direction: "alinan" | "verilen";
  partyName: string | null;
  amount: unknown;
  dueDate: Date | string | null;
  status: string;
};

export type ChequeDue = ChequeLike & { days: number };

/**
 * Portföydeki (henüz tahsil/ödeme olmamış) çek-senetleri vade durumuna göre
 * ayırır: vadesi geçmiş (days < 0) ve yaklaşan (0 ≤ days ≤ soonDays). Tahsil/
 * ödenmiş/karşılıksız/iade olanlar ve vadesiz olanlar hariç. En acil önce.
 */
export function upcomingCheques(
  cheques: ChequeLike[],
  soonDays = 7,
  now: Date = new Date(),
): { overdue: ChequeDue[]; soon: ChequeDue[] } {
  const today = startOfDay(now);
  const overdue: ChequeDue[] = [];
  const soon: ChequeDue[] = [];
  for (const c of cheques) {
    if (c.status !== "portfoyde") continue;
    if (!c.dueDate) continue;
    const days = Math.round((startOfDay(new Date(c.dueDate)) - today) / dayMs);
    if (days < 0) overdue.push({ ...c, days });
    else if (days <= soonDays) soon.push({ ...c, days });
  }
  overdue.sort((a, b) => a.days - b.days);
  soon.sort((a, b) => a.days - b.days);
  return { overdue, soon };
}

/* ------------------- Zararına satış / marj nöbetçisi ------------------- */

export type ProductCostLike = {
  id: number;
  name: string;
  salePrice: unknown;
  vatRate: unknown;
  status?: string;
  /** Reçeteden gelen hammadde maliyeti (KDV hariç, net — Tema 0 konvansiyonu). */
  materialCost: number;
  packagingCost?: unknown;
  shippingCost?: unknown;
};

export type LossProduct = { id: number; name: string; saleEx: number; costEx: number; margin: number };

/**
 * Maliyetin altında ya da marjı eşiğin altında satılan (satışta olan) ürünler.
 * Satış fiyatı KDV'den arındırılıp (saleEx) net ürün maliyetiyle (hammadde +
 * ambalaj + kargo) karşılaştırılır. Kanal komisyonu KATILMAZ — bu bir "kesin
 * zarar/ince marj" erken uyarısıdır (yanlış alarmı önlemek için tutucu); tam
 * kâr hesabı /fiyat'taki calcChannelProfit'te. Maliyeti bilinmeyen (costEx≤0)
 * ürün sinyal vermez.
 */
export function findLossProducts(rows: ProductCostLike[], minMarginPercent = 0): LossProduct[] {
  const out: LossProduct[] = [];
  for (const r of rows) {
    if (r.status && r.status !== "satista") continue; // sadece satıştaki ürünler
    const sale = toNum(r.salePrice);
    if (sale <= 0) continue;
    const vat = toNum(r.vatRate);
    const saleEx = vat > 0 ? sale / (1 + vat / 100) : sale;
    const costEx = r.materialCost + toNum(r.packagingCost) + toNum(r.shippingCost);
    if (costEx <= 0) continue; // maliyet bilinmiyor → sinyal verme
    const margin = saleEx > 0 ? ((saleEx - costEx) / saleEx) * 100 : 0;
    if (margin < minMarginPercent) out.push({ id: r.id, name: r.name, saleEx, costEx, margin });
  }
  out.sort((a, b) => a.margin - b.margin);
  return out;
}

/* ------------------- Cevapsız pazaryeri soru SLA nöbetçisi ------------------- */

export type QuestionLike = {
  id: number;
  status: string;
  source: string;
  customerName: string | null;
  productName: string | null;
  questionText: string;
  createdAt: Date | string;
};

export type StaleQuestion = QuestionLike & { hours: number };

/**
 * maxHours saatten uzun süredir cevaplanmamış ("new") pazaryeri soruları.
 * En eski (en çok bekleyen) önce. Pazaryeri puanı ve müşteri memnuniyeti için.
 */
export function staleQuestions(
  questions: QuestionLike[],
  maxHours = 12,
  now: Date = new Date(),
): StaleQuestion[] {
  const hourMs = 60 * 60 * 1000;
  const out: StaleQuestion[] = [];
  for (const q of questions) {
    if (q.status !== "new") continue;
    const hours = Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / hourMs);
    if (hours >= maxHours) out.push({ ...q, hours });
  }
  out.sort((a, b) => b.hours - a.hours);
  return out;
}

/* ------------------- Sabah brifingi: dün vs bugün satış ------------------- */

export type DailySalesRow = { createdAt: Date | string; totalAmount: unknown; status: string };
export type DaySales = { count: number; total: number };

/**
 * Siparişleri İstanbul gününe göre kovalar: bugün ve dün toplam ciro + adet
 * (iptal/iade hariç). Tarih eşlemesi timezone'a göre yapılır (sunucu UTC olsa da
 * "gün" İstanbul günüdür).
 */
export function dailySalesComparison(
  orders: DailySalesRow[],
  now: Date = new Date(),
  tz = "Europe/Istanbul",
): { today: DaySales; yesterday: DaySales } {
  const dayStr = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
  const todayStr = dayStr(now);
  const yestStr = dayStr(new Date(now.getTime() - dayMs));
  const acc = { today: { count: 0, total: 0 }, yesterday: { count: 0, total: 0 } };
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const ds = dayStr(o.createdAt);
    const amt = toNum(o.totalAmount);
    if (ds === todayStr) {
      acc.today.count++;
      acc.today.total += amt;
    } else if (ds === yestStr) {
      acc.yesterday.count++;
      acc.yesterday.total += amt;
    }
  }
  return acc;
}
