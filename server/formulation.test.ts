import { describe, expect, it } from "vitest";
import { buildFormulation } from "./productionPlan";
import type { CapacityFormula, CapacityMaterial } from "./capacity";

const PIGMENT = 1;
const BAGLAYICI = 2;
const SISE = 3;
const ETIKET = 4;

const mat = (
  id: number,
  name: string,
  type: CapacityMaterial["type"],
  unit: string,
): CapacityMaterial => ({ id, name, type, stockQty: 0, unit });

/** 1 litre bazlı mamul reçetesi — şirket standardı. */
const formula: CapacityFormula = {
  id: 101,
  outputType: "mamul",
  outputMaterialId: null,
  baseQty: 1000,
  baseUnit: "ml",
  inputs: [
    { inputMaterialId: PIGMENT, qtyPerBase: 100, unit: "gr" },
    { inputMaterialId: BAGLAYICI, qtyPerBase: 900, unit: "ml" },
  ],
};

const packaging = { id: 1, materialId: SISE, inputs: [{ materialId: ETIKET, qtyPerUnit: 1 }] };

const materials = [
  mat(PIGMENT, "Kırmızı pigment", "hammadde", "gr"),
  mat(BAGLAYICI, "Bağlayıcı", "hammadde", "ml"),
  mat(SISE, "100 ML PET", "ambalaj", "adet"),
  mat(ETIKET, "Etiket", "ambalaj", "adet"),
];

const build = (scale: number, qty: number, over: Partial<CapacityFormula> = {}) =>
  buildFormulation({
    demand: [{ masterId: 1, qty }],
    masters: [{ id: 1, formulaId: 101, formulaScale: scale, packagingId: 1 }],
    formulas: [{ ...formula, ...over }],
    packagings: [packaging],
    materials,
  })[0];

describe("buildFormulation", () => {
  it("1 lt reçeteyi 100 ml ürüne ölçekler — patronun beklediği oran", () => {
    const f = build(0.1, 12);
    const pigment = f.lines.find(l => l.materialId === PIGMENT)!;
    expect(pigment.perBase).toBe(100);
    expect(pigment.perUnit).toBe(10); // 100 gr × 0,1
    expect(pigment.total).toBe(120); // 12 adet
  });

  it("250 ml üründe ölçek 0,25 olur (500 ml bazdaki 0,5 değil)", () => {
    const f = build(0.25, 4);
    expect(f.lines.find(l => l.materialId === BAGLAYICI)!.perUnit).toBe(225);
    expect(f.lines.find(l => l.materialId === BAGLAYICI)!.total).toBe(900);
  });

  it("fire, adet başı miktarı artırır — aynı çıktı için daha çok girdi", () => {
    const f = build(0.1, 10, { wastePercent: 10 });
    // 100 × 0,1 / 0,9 = 11,1111
    expect(f.lines.find(l => l.materialId === PIGMENT)!.perUnit).toBeCloseTo(11.1111, 3);
    expect(f.wastePercent).toBe(10);
  });

  it("ambalaj hacimle ÖLÇEKLENMEZ — adet başına sabit kalır", () => {
    const f = build(0.1, 12);
    const sise = f.packagingLines.find(l => l.materialId === SISE)!;
    expect(sise.perUnit).toBe(1);
    expect(sise.total).toBe(12);
    // Ambalaj, reçete satırlarına karışmamalı: tezgâhta ayrı okunur.
    expect(f.lines.some(l => l.materialId === SISE)).toBe(false);
  });

  it("satır birimi yoksa kalemin kendi birimi kullanılır (eski kayıtlar)", () => {
    const f = buildFormulation({
      demand: [{ masterId: 1, qty: 1 }],
      masters: [{ id: 1, formulaId: 101, formulaScale: 1, packagingId: null }],
      formulas: [
        { ...formula, inputs: [{ inputMaterialId: PIGMENT, qtyPerBase: 50, unit: null }] },
      ],
      packagings: [],
      materials,
    })[0];
    expect(f.lines[0].unit).toBe("gr");
  });

  it("reçetesi olmayan üründe boş satır listesi döner, patlamaz", () => {
    const f = buildFormulation({
      demand: [{ masterId: 9, qty: 5 }],
      masters: [{ id: 9, formulaId: null, formulaScale: 1, packagingId: null }],
      formulas: [formula],
      packagings: [packaging],
      materials,
    })[0];
    expect(f.lines).toHaveLength(0);
    expect(f.formulaId).toBeNull();
    expect(f.qty).toBe(5);
  });

  it("reçete adını taşır — tezgâhtaki kişi hangi reçeteyi uyguladığını bilsin", () => {
    const f = buildFormulation({
      demand: [{ masterId: 1, qty: 2 }],
      masters: [{ id: 1, formulaId: 101, formulaScale: 0.1, packagingId: null }],
      formulas: [formula],
      packagings: [],
      materials,
      formulaNames: new Map([[101, "CANDY kırmızı"]]),
    })[0];
    expect(f.formulaName).toBe("CANDY kırmızı");
  });
});
