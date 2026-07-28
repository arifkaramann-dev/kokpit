import { describe, expect, it } from "vitest";
import {
  buildSaleTitle,
  deriveCombos,
  planGenerationSync,
  splitExistingCombos,
} from "./productUtils";

describe("splitExistingCombos — mükerrer türev koruması", () => {
  it("ana üründe zaten var olan kombinasyonu ayırır", () => {
    const combos = deriveCombos([], ["400 ml Sprey", "1 L Teneke"], ["Siyah"]);
    const existing = [buildSaleTitle("Astar", null, "400 ml Sprey", "Siyah")];
    const { fresh, duplicates } = splitExistingCombos("Astar", combos, existing);
    expect(duplicates).toHaveLength(1);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].packaging).toBe("1 L Teneke");
  });

  it("boşluk ve büyük/küçük harf farkını mükerrer sayar", () => {
    const combos = deriveCombos([], ["400 ml Sprey"], []);
    const { duplicates } = splitExistingCombos("Astar", combos, [
      "artofcolour  ASTAR   400 ml Sprey",
    ]);
    expect(duplicates).toHaveLength(1);
  });

  it("aynı çağrıdaki tekrar eden kombinasyonu da eler", () => {
    const combos = [
      { use: null, packaging: "400 ml Sprey", color: null, set: null },
      { use: null, packaging: "400 ml Sprey", color: null, set: null },
    ];
    const { fresh, duplicates } = splitExistingCombos("Astar", combos, []);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it("mevcut türev yoksa hepsi yeni sayılır", () => {
    const combos = deriveCombos(["Jant"], ["400 ml"], ["Gri", "Siyah"]);
    const { fresh, duplicates } = splitExistingCombos("Astar", combos, []);
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

describe("planGenerationSync — varyant yeniden üretimi", () => {
  const existing = [
    { id: 1, variantCode: "CND0042-MAVI-100ml", productId: 501 },
    { id: 2, variantCode: "CND0042-MAVI-400ml", productId: null },
    { id: 3, variantCode: "CND0042-KIRMIZI-100ml", productId: 502 },
  ];

  it("aynı kodlu kayıtları korur (productId bağı kopmaz)", () => {
    const { reuse, staleIds } = planGenerationSync(existing, [
      "CND0042-MAVI-100ml",
      "CND0042-MAVI-400ml",
      "CND0042-KIRMIZI-100ml",
    ]);
    expect(staleIds).toHaveLength(0);
    expect(reuse.get("CND0042-MAVI-100ml")?.productId).toBe(501);
    expect(reuse.size).toBe(3);
  });

  it("matriste artık olmayan varyantı bayat sayar", () => {
    const { reuse, staleIds } = planGenerationSync(existing, ["CND0042-MAVI-100ml"]);
    expect(reuse.size).toBe(1);
    expect(staleIds.sort()).toEqual([2, 3]);
  });

  it("yeni kod için eşleşme dönmez (yeni kayıt açılır)", () => {
    const { reuse } = planGenerationSync(existing, ["CND0042-YESIL-100ml"]);
    expect(reuse.has("CND0042-YESIL-100ml")).toBe(false);
  });

  it("eski mükerrer kayıtları temizler, ilkini korur", () => {
    const dupes = [
      { id: 7, variantCode: "CND0042-MAVI-100ml", productId: 501 },
      { id: 8, variantCode: "CND0042-MAVI-100ml", productId: null },
    ];
    const { reuse, staleIds } = planGenerationSync(dupes, ["CND0042-MAVI-100ml"]);
    expect(reuse.get("CND0042-MAVI-100ml")?.id).toBe(7);
    expect(staleIds).toEqual([8]);
  });
});
