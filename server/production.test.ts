import { describe, expect, it } from "vitest";
import { planProduction, type ProductionFormulaLine, type ProductionMaterial } from "./productUtils";

const materials: ProductionMaterial[] = [
  { id: 1, name: "Beyaz Pigment", stockQty: "1000" },
  { id: 2, name: "Tiner", stockQty: "50" },
  { id: 3, name: "Şişe 100ml", stockQty: "5" },
];

const formula: ProductionFormulaLine[] = [
  { materialId: 1, materialName: "Beyaz Pigment", qty: "100" }, // 10× => 1000, tam yeter
  { materialId: 2, materialName: "Tiner", qty: "10" }, // 10× => 100, stok 50 => yetmez
  { materialId: 3, materialName: "Şişe 100ml", qty: "1" }, // 10× => 10, stok 5 => yetmez
];

describe("planProduction", () => {
  it("yeterli stokta tüm hammadde için düşüm planı üretir, eksik boş olur", () => {
    const plan = planProduction(formula, materials, 5); // 5×
    // 5×: pigment 500, tiner 50, şişe 5 — hepsi tam/yeter
    expect(plan.missing).toEqual([]);
    expect(plan.deductions).toEqual([
      { materialId: 1, qty: 500 },
      { materialId: 2, qty: 50 },
      { materialId: 3, qty: 5 },
    ]);
  });

  it("stoğu yetmeyen hammaddeleri açıklamayla işaretler", () => {
    const plan = planProduction(formula, materials, 10); // 10×
    expect(plan.missing.length).toBe(2);
    expect(plan.missing[0]).toContain("Tiner");
    expect(plan.missing[1]).toContain("Şişe 100ml");
    // Plan yine de tüm gereken düşümleri içerir (force ile uygulanabilir).
    expect(plan.deductions).toEqual([
      { materialId: 1, qty: 1000 },
      { materialId: 2, qty: 100 },
      { materialId: 3, qty: 10 },
    ]);
  });

  it("reçetede olmayan (silinmiş) hammadde 'bulunamadı' sayılır", () => {
    const plan = planProduction([{ materialId: 99, materialName: "Yok Olan", qty: "5" }], materials, 1);
    expect(plan.missing[0]).toContain("Yok Olan");
    expect(plan.deductions).toEqual([{ materialId: 99, qty: 5 }]);
  });

  it("miktarı 0 olan kalem düşüm listesine girmez", () => {
    const plan = planProduction([{ materialId: 1, materialName: "Beyaz Pigment", qty: "0" }], materials, 3);
    expect(plan.deductions).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it("string ve sayı miktarları aynı şekilde işler", () => {
    const plan = planProduction([{ materialId: 1, materialName: "Beyaz Pigment", qty: 2 }], materials, 4);
    expect(plan.deductions).toEqual([{ materialId: 1, qty: 8 }]);
  });
});
