/**
 * Parti (lot) izlenebilirlik + SKT + kalite kontrol saf mantığı.
 *
 * Bu modül veritabanına DOKUNMAZ — yalnız hesaplar. Router/db yalnız veriyi
 * besler, kararı burası verir (testlenebilirlik). Boya dikeyinin farklılaştırıcı
 * çekirdeği: FIFO-SKT tüketim seçimi, yaklaşan/geçmiş SKT sınıflaması ve QC
 * sonuç kuralı.
 *
 * ÖNEMLİ mimari kısıt: stok otoritesi materials/products.stockQty'dedir. Buradaki
 * FIFO-SKT seçimi yalnız "hangi partiden düşülecek" izlenebilirliğini üretir;
 * tek-havuz stok toplamını değiştirmez.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Boya sektöründe yaygın renk toleransı: ΔE ≤ 2 gözle fark edilmez sayılır. */
export const DEFAULT_DELTAE_MAX = 2;

const toNum = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

const toTime = (d: string | Date | null | undefined): number | null => {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};

/* ------------------------- FIFO-SKT tüketim seçimi ------------------------- */

export type LotLike = {
  id: number;
  remainingQty: string | number;
  expiryDate?: string | Date | null;
  receivedDate?: string | Date | null;
  createdAt?: string | Date | null;
};

/**
 * FIFO-SKT sıralaması: önce SKT'si en yakın olan (bozulmadan tüketilsin), SKT'si
 * olmayanlar en sona; eşitlikte giriş tarihi eski olan önce (klasik FIFO); yine
 * eşitse id küçük olan (kararlı sıralama).
 */
export function sortLotsFifoExpiry<T extends LotLike>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const ea = toTime(a.expiryDate);
    const eb = toTime(b.expiryDate);
    // SKT olan, SKT olmayandan önce tüketilir.
    if (ea !== eb) {
      if (ea === null) return 1;
      if (eb === null) return -1;
      return ea - eb;
    }
    const ra = toTime(a.receivedDate ?? a.createdAt);
    const rb = toTime(b.receivedDate ?? b.createdAt);
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    if (ra === null && rb !== null) return 1;
    if (rb === null && ra !== null) return -1;
    return a.id - b.id;
  });
}

export type LotPick = { lotId: number; qty: number };

export type LotSelection = {
  /** Hangi partiden ne kadar düşülecek (FIFO-SKT sırasıyla). */
  picks: LotPick[];
  /** Toplam düşülebilen miktar. */
  consumed: number;
  /** Partiler yetmezse açık kalan miktar (stockQty otoriter olduğundan bu bir
   *  hata değil, yalnız "izlenebilirlik eksik" işaretidir). */
  shortage: number;
};

/**
 * İhtiyaç kadar miktarı açık partilerden (remainingQty > 0) FIFO-SKT sırasıyla
 * seçer. Partiler yetmezse eldekini seçer, kalanı `shortage` olarak döner —
 * asla eksiye düşmez.
 */
export function selectLotsFifo(lots: LotLike[], needed: number): LotSelection {
  const picks: LotPick[] = [];
  let remaining = needed > 0 ? needed : 0;
  let consumed = 0;
  if (remaining <= 0) return { picks, consumed: 0, shortage: 0 };
  for (const lot of sortLotsFifoExpiry(lots)) {
    if (remaining <= 1e-9) break;
    const avail = toNum(lot.remainingQty);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    picks.push({ lotId: lot.id, qty: round3(take) });
    consumed += take;
    remaining -= take;
  }
  return { picks, consumed: round3(consumed), shortage: round3(Math.max(0, remaining)) };
}

/* ------------------------- SKT sınıflaması ------------------------- */

export type ExpiryState = "expired" | "soon" | "ok" | "none";

/** Bir SKT'yi bugüne göre sınıflar. `null` SKT → "none" (takip yok). */
export function classifyExpiry(
  expiryDate: string | Date | null | undefined,
  now: Date = new Date(),
  soonDays = 30,
): ExpiryState {
  const t = toTime(expiryDate);
  if (t === null) return "none";
  const n = now.getTime();
  if (t < n) return "expired";
  if (t <= n + soonDays * DAY_MS) return "soon";
  return "ok";
}

/** SKT'ye kalan gün (negatif = geçmiş). SKT yoksa null. */
export function daysUntilExpiry(
  expiryDate: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  const t = toTime(expiryDate);
  if (t === null) return null;
  return Math.floor((t - now.getTime()) / DAY_MS);
}

export type ExpiringItem = LotLike & { expiryDate?: string | Date | null };

export type ExpiryBuckets<T> = {
  /** SKT'si geçmiş, eldeki (remainingQty > 0) partiler — en eski önce. */
  expired: T[];
  /** SKT'si `soonDays` içinde dolacak partiler — en yakın önce. */
  soon: T[];
};

/**
 * Eldeki (remainingQty > 0) ve SKT'si tanımlı partileri "geçmiş" ve "yaklaşan"
 * kovalarına ayırır. SKT nöbetçisinin ve UI rozetlerinin ortak kaynağı.
 */
export function filterExpiringLots<T extends ExpiringItem>(
  lots: T[],
  soonDays = 30,
  now: Date = new Date(),
): ExpiryBuckets<T> {
  const withStock = lots.filter(l => toNum(l.remainingQty) > 0 && toTime(l.expiryDate) !== null);
  const sorted = sortLotsFifoExpiry(withStock);
  const expired: T[] = [];
  const soon: T[] = [];
  for (const l of sorted) {
    const state = classifyExpiry(l.expiryDate, now, soonDays);
    if (state === "expired") expired.push(l);
    else if (state === "soon") soon.push(l);
  }
  return { expired, soon };
}

/* ------------------------- Kalite kontrol sonuç kuralı ------------------------- */

export type QcMeasurements = {
  ph?: number | string | null;
  viscosity?: number | string | null;
  opacity?: number | string | null;
  deltaE?: number | string | null;
};

export type QcSpec = {
  /** [min, max] kabul aralığı. */
  ph?: [number, number];
  viscosity?: [number, number];
  opacity?: [number, number];
  /** ΔE üst sınırı (renk sapması bunu aşarsa kalır). */
  deltaEMax?: number;
};

export type QcEvaluation = {
  result: "gecti" | "kaldi" | "beklemede";
  /** Sınırı aşan ölçümlerin insan-okur açıklamaları. */
  failures: string[];
  /** Spec'e göre gerçekten değerlendirilebilen ölçüm sayısı. */
  checked: number;
};

const has = (v: number | string | null | undefined): v is number | string =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(toNum(v));

/**
 * Ölçümleri spec (kabul aralıkları) ile karşılaştırıp geçti/kaldı/beklemede
 * verir. Hiçbir ölçüm spec ile eşleşmiyorsa "beklemede" (karar için erken).
 * Ölçülen bir metrik sınırı aşarsa "kaldi"; tüm ölçülenler sınırda ise "gecti".
 */
export function evaluateQc(measurements: QcMeasurements, spec: QcSpec = {}): QcEvaluation {
  const failures: string[] = [];
  let checked = 0;

  const range = (
    key: "ph" | "viscosity" | "opacity",
    label: string,
  ) => {
    const bound = spec[key];
    const value = measurements[key];
    if (!bound || !has(value)) return;
    checked++;
    const v = toNum(value);
    const [min, max] = bound;
    if (v < min || v > max) failures.push(`${label} ${v} (kabul ${min}–${max})`);
  };

  range("ph", "pH");
  range("viscosity", "Viskozite");
  range("opacity", "Örtücülük");

  if (spec.deltaEMax != null && has(measurements.deltaE)) {
    checked++;
    const v = toNum(measurements.deltaE);
    if (v > spec.deltaEMax) failures.push(`ΔE ${v} (üst sınır ${spec.deltaEMax})`);
  }

  if (checked === 0) return { result: "beklemede", failures, checked };
  return { result: failures.length > 0 ? "kaldi" : "gecti", failures, checked };
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
