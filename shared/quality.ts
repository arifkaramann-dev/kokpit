/**
 * Boya kalite kontrol motoru — saf mantık (client + server + testler ortak).
 * Üretim partisinin ölçümlerini (pH, viskozite, örtücülük, ΔE renk sapması,
 * parlaklık, kuruma) kabul spesifikasyonuyla karşılaştırır → geçti/kaldı.
 * Spesifikasyonlar şirkete özeldir; DEFAULT_QC_SPECS yalnızca başlangıç şablonudur.
 *
 * Bu, #6 "lot/parti + kalite kontrol" maddesinin saf beynidir. Parti kaydı
 * (şema) ve giriş ekranı (UI) DB-doğrulamalı ayrı sprintte bağlanır.
 */

export type QcParamKey = "ph" | "viskozite" | "ortuculuk" | "deltaE" | "parlaklik" | "kuruma";

export type QcSpec = {
  key: QcParamKey;
  label: string;
  /** Alt sınır (dahil). null/undefined = alt sınır yok. */
  min?: number | null;
  /** Üst sınır (dahil). null/undefined = üst sınır yok. */
  max?: number | null;
  unit?: string;
};

export type QcMeasurement = { key: QcParamKey; value: number };

export type QcReason = "olcum-yok" | "dusuk" | "yuksek";

export type QcParamResult = {
  key: QcParamKey;
  label: string;
  value: number | null;
  min: number | null;
  max: number | null;
  unit?: string;
  pass: boolean;
  reason?: QcReason;
};

export type QcResult = {
  pass: boolean;
  results: QcParamResult[];
  failed: QcParamResult[];
};

/** Boya sektörü için makul başlangıç şablonu — şirket kendi değerlerini girer. */
export const DEFAULT_QC_SPECS: QcSpec[] = [
  { key: "ph", label: "pH", min: 7, max: 9 },
  { key: "viskozite", label: "Viskozite", min: 80, max: 120, unit: "KU" },
  { key: "ortuculuk", label: "Örtücülük", min: 95, max: null, unit: "%" },
  { key: "deltaE", label: "Renk sapması (ΔE)", min: null, max: 1.5 },
  { key: "parlaklik", label: "Parlaklık", min: 80, max: 100, unit: "GU" },
  { key: "kuruma", label: "Kuruma süresi", min: null, max: 30, unit: "dk" },
];

const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Ölçümleri spesifikasyonla karşılaştırır. Ölçümü olmayan parametre "kaldı"
 * (olcum-yok) sayılır — eksik test geçmiş sayılmasın. Genel sonuç: hepsi geçerse geçti.
 */
export function evaluateQc(specs: QcSpec[], measurements: QcMeasurement[]): QcResult {
  const byKey = new Map(measurements.map(m => [m.key, m.value]));
  const results: QcParamResult[] = specs.map(s => {
    const min = has(s.min) ? s.min : null;
    const max = has(s.max) ? s.max : null;
    const raw = byKey.has(s.key) ? Number(byKey.get(s.key)) : null;
    const value = raw != null && Number.isFinite(raw) ? raw : null;
    const base = { key: s.key, label: s.label, value, min, max, unit: s.unit };
    if (value == null) return { ...base, pass: false, reason: "olcum-yok" as const };
    if (min != null && value < min) return { ...base, pass: false, reason: "dusuk" as const };
    if (max != null && value > max) return { ...base, pass: false, reason: "yuksek" as const };
    return { ...base, pass: true };
  });
  const failed = results.filter(r => !r.pass);
  return { pass: failed.length === 0, results, failed };
}

/** İnsan-okur özet: "Geçti ✓" veya "Kaldı: Örtücülük düşük, ΔE yüksek". */
export function summarizeQc(result: QcResult): string {
  if (result.pass) return "Geçti ✓";
  const labels: Record<QcReason, string> = { "olcum-yok": "ölçüm yok", dusuk: "düşük", yuksek: "yüksek" };
  return "Kaldı: " + result.failed.map(f => `${f.label} ${labels[f.reason!]}`).join(", ");
}
