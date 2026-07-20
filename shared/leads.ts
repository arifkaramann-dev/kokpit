/**
 * CRM satış boru hattı — saf yardımcılar (client + server + testler ortak).
 * Aşama sırası/etiketleri ve boru hattı özeti (aşama başına adet + değer,
 * açık fırsat toplamı, kazanma oranı) tek yerde tanımlanır.
 */

export type LeadStage = "yeni" | "iletisim" | "teklif" | "kazanildi" | "kaybedildi";

/** Aşama sırası + görünen etiket (boru hattı soldan sağa akar). */
export const LEAD_STAGES: { key: LeadStage; label: string }[] = [
  { key: "yeni", label: "Yeni" },
  { key: "iletisim", label: "İletişim" },
  { key: "teklif", label: "Teklif" },
  { key: "kazanildi", label: "Kazanıldı" },
  { key: "kaybedildi", label: "Kaybedildi" },
];

/** Hâlâ üzerinde çalışılan (kapanmamış) aşamalar. */
export const OPEN_STAGES: LeadStage[] = ["yeni", "iletisim", "teklif"];

export const LEAD_SOURCES = ["instagram", "whatsapp", "pazaryeri", "referans", "web", "diğer"];

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

export type LeadLike = { stage: LeadStage | string; estimatedValue: unknown };

export type PipelineSummary = {
  /** Aşama anahtarı → { adet, tahmini değer toplamı }. */
  byStage: Record<string, { count: number; value: number }>;
  /** Açık (yeni+iletişim+teklif) fırsat adedi ve tahmini değeri. */
  openCount: number;
  openValue: number;
  /** Kazanılan fırsatların tahmini değeri. */
  wonValue: number;
  /** Kazanma oranı %: kazanıldı / (kazanıldı + kaybedildi); kapanmış yoksa 0. */
  winRate: number;
};

/** Boru hattı özeti: aşama kırılımı + açık/kazanılan toplam + kazanma oranı. */
export function pipelineSummary(leads: LeadLike[]): PipelineSummary {
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const { key } of LEAD_STAGES) byStage[key] = { count: 0, value: 0 };
  let openCount = 0;
  let openValue = 0;
  let wonValue = 0;
  let won = 0;
  let lost = 0;
  for (const l of leads) {
    const stage = String(l.stage);
    const value = toNum(l.estimatedValue);
    const bucket = byStage[stage] ?? (byStage[stage] = { count: 0, value: 0 });
    bucket.count += 1;
    bucket.value += value;
    if ((OPEN_STAGES as string[]).includes(stage)) {
      openCount += 1;
      openValue += value;
    }
    if (stage === "kazanildi") {
      wonValue += value;
      won += 1;
    } else if (stage === "kaybedildi") {
      lost += 1;
    }
  }
  const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
  return { byStage, openCount, openValue, wonValue, winRate };
}
