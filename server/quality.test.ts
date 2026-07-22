import { describe, expect, it } from "vitest";
import { DEFAULT_QC_SPECS, evaluateQc, summarizeQc, type QcMeasurement } from "@shared/quality";

const full: QcMeasurement[] = [
  { key: "ph", value: 8 },
  { key: "viskozite", value: 100 },
  { key: "ortuculuk", value: 98 },
  { key: "deltaE", value: 0.9 },
  { key: "parlaklik", value: 90 },
  { key: "kuruma", value: 20 },
];

describe("evaluateQc", () => {
  it("spec içindeki tüm ölçümler geçer", () => {
    const r = evaluateQc(DEFAULT_QC_SPECS, full);
    expect(r.pass).toBe(true);
    expect(r.failed).toHaveLength(0);
  });

  it("alt sınırın altı = düşük", () => {
    const r = evaluateQc(DEFAULT_QC_SPECS, [...full.filter(m => m.key !== "ph"), { key: "ph", value: 5 }]);
    expect(r.pass).toBe(false);
    expect(r.failed.find(f => f.key === "ph")?.reason).toBe("dusuk");
  });

  it("üst sınırın üstü = yüksek (ΔE tek taraflı)", () => {
    const r = evaluateQc(DEFAULT_QC_SPECS, [...full.filter(m => m.key !== "deltaE"), { key: "deltaE", value: 3 }]);
    expect(r.failed.find(f => f.key === "deltaE")?.reason).toBe("yuksek");
  });

  it("örtücülük yalnız alt sınırlı: yüksek değer geçer", () => {
    const r = evaluateQc([{ key: "ortuculuk", label: "Örtücülük", min: 95, max: null }], [{ key: "ortuculuk", value: 100 }]);
    expect(r.pass).toBe(true);
  });

  it("ölçümü olmayan parametre kaldı sayılır (eksik test geçmez)", () => {
    const r = evaluateQc(DEFAULT_QC_SPECS, [{ key: "ph", value: 8 }]);
    expect(r.pass).toBe(false);
    expect(r.failed.find(f => f.key === "viskozite")?.reason).toBe("olcum-yok");
  });

  it("sınır değerleri (min/max dahil) geçer", () => {
    const r = evaluateQc([{ key: "ph", label: "pH", min: 7, max: 9 }], [{ key: "ph", value: 9 }]);
    expect(r.pass).toBe(true);
  });
});

describe("summarizeQc", () => {
  it("geçince kısa onay", () => {
    expect(summarizeQc(evaluateQc(DEFAULT_QC_SPECS, full))).toBe("Geçti ✓");
  });
  it("kalınca sebepleri listeler", () => {
    const r = evaluateQc(
      [
        { key: "ortuculuk", label: "Örtücülük", min: 95, max: null },
        { key: "deltaE", label: "ΔE", min: null, max: 1.5 },
      ],
      [
        { key: "ortuculuk", value: 90 },
        { key: "deltaE", value: 3 },
      ],
    );
    expect(summarizeQc(r)).toBe("Kaldı: Örtücülük düşük, ΔE yüksek");
  });
});
