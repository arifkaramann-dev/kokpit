import { describe, expect, it } from "vitest";
import { computeReorderSuggestions, summarizeReorder, type ReorderMaterial } from "./reorder";

const mat = (o: Partial<ReorderMaterial> & { id: number }): ReorderMaterial => ({
  name: `M${o.id}`,
  unit: "gr",
  stockQty: "0",
  criticalQty: "0",
  unitCost: "0",
  supplierId: null,
  ...o,
});

describe("computeReorderSuggestions", () => {
  it("stok kritik eşiğin altındaysa öneri üretir, hedef = kritik×2", () => {
    const s = computeReorderSuggestions(
      [mat({ id: 1, stockQty: "10", criticalQty: "50", unitCost: "2" })],
      [],
    );
    expect(s).toHaveLength(1);
    // hedef 100, stok 10 → önerilen 90
    expect(s[0].suggestedQty).toBe(90);
    expect(s[0].estimatedCost).toBe(180);
  });

  it("stok yeterliyse öneri yok", () => {
    expect(
      computeReorderSuggestions([mat({ id: 1, stockQty: "80", criticalQty: "50" })], []),
    ).toHaveLength(0);
  });

  it("kritik eşik 0 (takip yok) atlanır", () => {
    expect(
      computeReorderSuggestions([mat({ id: 1, stockQty: "0", criticalQty: "0" })], []),
    ).toHaveLength(0);
  });

  it("tedarikçi adı çözülür, yoksa null", () => {
    const s = computeReorderSuggestions(
      [
        mat({ id: 1, stockQty: "0", criticalQty: "10", supplierId: 7 }),
        mat({ id: 2, stockQty: "0", criticalQty: "10", supplierId: null }),
      ],
      [{ id: 7, name: "ABC Kimya" }],
    );
    expect(s.find(x => x.materialId === 1)!.supplierName).toBe("ABC Kimya");
    expect(s.find(x => x.materialId === 2)!.supplierName).toBeNull();
  });

  it("en acil (stok-eşik farkı en negatif) önce sıralanır", () => {
    const s = computeReorderSuggestions(
      [
        mat({ id: 1, stockQty: "9", criticalQty: "10" }), // fark -1
        mat({ id: 2, stockQty: "0", criticalQty: "10" }), // fark -10 (daha acil)
      ],
      [],
    );
    expect(s[0].materialId).toBe(2);
  });

  it("negatif stokta en az kritik-stok kadar önerir", () => {
    const s = computeReorderSuggestions(
      [mat({ id: 1, stockQty: "-5", criticalQty: "10", unitCost: "1" })],
      [],
    );
    // hedef 20, stok -5 → 25
    expect(s[0].suggestedQty).toBe(25);
  });
});

describe("summarizeReorder", () => {
  it("kalem sayısı, toplam maliyet, tedarikçisiz sayısı", () => {
    const s = computeReorderSuggestions(
      [
        mat({ id: 1, stockQty: "0", criticalQty: "10", unitCost: "2", supplierId: 1 }),
        mat({ id: 2, stockQty: "0", criticalQty: "5", unitCost: "1", supplierId: null }),
      ],
      [{ id: 1, name: "X" }],
    );
    const sum = summarizeReorder(s);
    expect(sum.count).toBe(2);
    expect(sum.withoutSupplier).toBe(1);
    expect(sum.totalCost).toBe(50); // mat1: 20×2=40 + mat2: 10×1=10
  });
});
