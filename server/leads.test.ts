import { describe, expect, it } from "vitest";
import { pipelineSummary, LEAD_STAGES, OPEN_STAGES } from "@shared/leads";

describe("pipelineSummary (CRM boru hattı özeti)", () => {
  it("aşama kırılımı + açık/kazanılan toplam + kazanma oranı", () => {
    const s = pipelineSummary([
      { stage: "yeni", estimatedValue: "100" },
      { stage: "iletisim", estimatedValue: "200" },
      { stage: "teklif", estimatedValue: "300" },
      { stage: "kazanildi", estimatedValue: "400" },
      { stage: "kaybedildi", estimatedValue: "50" },
    ]);
    expect(s.byStage.yeni).toEqual({ count: 1, value: 100 });
    expect(s.openCount).toBe(3); // yeni + iletisim + teklif
    expect(s.openValue).toBe(600);
    expect(s.wonValue).toBe(400);
    expect(s.winRate).toBe(50); // 1 kazanıldı / (1 kazanıldı + 1 kaybedildi)
  });

  it("boş liste güvenli sıfırlar döner; tüm aşamalar hazır bucket", () => {
    const s = pipelineSummary([]);
    expect(s.openCount).toBe(0);
    expect(s.winRate).toBe(0);
    for (const { key } of LEAD_STAGES) expect(s.byStage[key]).toEqual({ count: 0, value: 0 });
  });

  it("kapanmış fırsat yoksa kazanma oranı 0 (bölme hatası yok)", () => {
    const s = pipelineSummary([{ stage: "yeni", estimatedValue: "10" }]);
    expect(s.winRate).toBe(0);
  });

  it("bozuk/eksik değer 0 sayılır; açık aşama listesi tutarlı", () => {
    const s = pipelineSummary([{ stage: "teklif", estimatedValue: null }]);
    expect(s.byStage.teklif).toEqual({ count: 1, value: 0 });
    expect(OPEN_STAGES).toContain("teklif");
  });
});
