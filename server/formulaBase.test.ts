import { describe, expect, it } from "vitest";
import { BASE_VOLUME_ML, baseInMl, planBaseNormalization, scaleForPackaging } from "./formulaBase";

const f = (over: Partial<Parameters<typeof planBaseNormalization>[0][number]> = {}) => ({
  id: 1,
  name: "CANDY kırmızı",
  outputType: "mamul" as const,
  baseQty: 500,
  baseUnit: "ml",
  inputs: [
    { id: 10, inputMaterialId: 100, qtyPerBase: 250, unit: "gr" },
    { id: 11, inputMaterialId: 101, qtyPerBase: 250, unit: "ml" },
  ],
  ...over,
});

describe("baseInMl", () => {
  it("ml bazı olduğu gibi döner", () => {
    expect(baseInMl(500, "ml")).toBe(500);
  });

  it("litre bazını ml'ye çevirir — 1 lt = 1000 ml", () => {
    expect(baseInMl(1, "lt")).toBe(1000);
    expect(baseInMl(2.5, "litre")).toBe(2500);
  });

  it("birim yazılmamış eski kayıtları ml sayar", () => {
    expect(baseInMl(1000, null)).toBe(1000);
    expect(baseInMl(1000, "")).toBe(1000);
  });

  it("hacimsel olmayan bazda null döner (gr↔ml uydurulmaz)", () => {
    expect(baseInMl(1000, "gr")).toBeNull();
    expect(baseInMl(1, "kg")).toBeNull();
    expect(baseInMl(5, "adet")).toBeNull();
  });

  it("sıfır/negatif bazda null döner", () => {
    expect(baseInMl(0, "ml")).toBeNull();
    expect(baseInMl(-5, "ml")).toBeNull();
  });
});

describe("scaleForPackaging", () => {
  it("1 lt bazda 250 ml ürün 0,25 ölçek alır (patron kuralı)", () => {
    expect(scaleForPackaging(250, 1000, "ml")).toBeCloseTo(0.25);
    expect(scaleForPackaging(100, 1000, "ml")).toBeCloseTo(0.1);
  });

  it("500 ml bazda aynı ürün 0,5 alıyordu — hatanın kaynağı", () => {
    expect(scaleForPackaging(250, 500, "ml")).toBeCloseTo(0.5);
    expect(scaleForPackaging(100, 500, "ml")).toBeCloseTo(0.2);
  });

  it("baz LİTRE yazıldığında 1000 kat şişmez", () => {
    // Eskiden 250 / 1 = 250 çıkıyordu.
    expect(scaleForPackaging(250, 1, "lt")).toBeCloseTo(0.25);
  });

  it("hacimsiz ambalajda (rötuş kutusu, set) ölçek 1 kalır", () => {
    expect(scaleForPackaging(0, 1000, "ml")).toBe(1);
  });

  it("hacimsel olmayan reçetede ölçek 1 kalır — uydurma katsayı yok", () => {
    expect(scaleForPackaging(250, 1000, "gr")).toBe(1);
  });
});

describe("planBaseNormalization", () => {
  it("500 ml bazı 1 litreye çevirir ve girdileri aynı çarpanla ölçekler", () => {
    const plan = planBaseNormalization([f()]);
    expect(plan.changes).toHaveLength(1);
    const change = plan.changes[0];
    expect(change.factor).toBe(2);
    expect(change.toQty).toBe(BASE_VOLUME_ML);
    expect(change.toUnit).toBe("ml");
    expect(change.inputs).toEqual([
      { id: 10, from: 250, to: 500 },
      { id: 11, from: 250, to: 500 },
    ]);
  });

  it("oranı koruduğu için litre başına maliyet değişmez", () => {
    const before = f({ baseQty: 400 });
    const plan = planBaseNormalization([before]);
    const change = plan.changes[0];
    const ratioBefore = 250 / 400;
    const ratioAfter = change.inputs[0].to / change.toQty;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 9);
  });

  it("litre bazlı reçeteyi 1000 ml'ye normalize eder", () => {
    const plan = planBaseNormalization([f({ baseQty: 1, baseUnit: "lt" })]);
    expect(plan.changes[0].factor).toBe(1);
    expect(plan.changes[0].toQty).toBe(1000);
    // Miktarlar değişmez, yalnız baz okunabilir hale gelir.
    expect(plan.changes[0].inputs.map(i => i.to)).toEqual([250, 250]);
  });

  it("zaten 1000 ml bazlı reçeteye dokunmaz", () => {
    const plan = planBaseNormalization([f({ baseQty: 1000, baseUnit: "ml" })]);
    expect(plan.changes).toHaveLength(0);
    expect(plan.alreadyOk).toEqual([1]);
  });

  it("yarı mamul reçetelerini atlar — bazı çıktının stok birimine bağlı", () => {
    const plan = planBaseNormalization([f({ outputType: "yari_mamul", baseQty: 500 })]);
    expect(plan.changes).toHaveLength(0);
    expect(plan.alreadyOk).toHaveLength(0);
  });

  it("hacimsel olmayan bazı çevirmez, gerekçesiyle raporlar", () => {
    const plan = planBaseNormalization([f({ baseQty: 1000, baseUnit: "gr" })]);
    expect(plan.changes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].formulaId).toBe(1);
  });
});
