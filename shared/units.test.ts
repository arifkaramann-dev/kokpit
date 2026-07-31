import { describe, expect, it } from "vitest";
import {
  compatibleUnits,
  conversionFactor,
  convertQty,
  normalizeUnit,
  qtyInMaterialUnit,
  unitFamily,
} from "@shared/units";

describe("normalizeUnit", () => {
  it("yazım varyantlarını tek koda indirger", () => {
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit(" Kilogram ")).toBe("kg");
    expect(normalizeUnit("kilo")).toBe("kg");
    expect(normalizeUnit("G")).toBe("gr");
    expect(normalizeUnit("gram")).toBe("gr");
    expect(normalizeUnit("L")).toBe("lt");
    expect(normalizeUnit("Litre")).toBe("lt");
    expect(normalizeUnit("cc")).toBe("ml");
    expect(normalizeUnit("Adet")).toBe("adet");
  });

  it("nokta ve boşluğu yok sayar", () => {
    expect(normalizeUnit("m.l.")).toBe("ml");
    expect(normalizeUnit("k g")).toBe("kg");
  });

  it("tanınmayan birimde boş döner", () => {
    expect(normalizeUnit("kova")).toBe("");
    expect(normalizeUnit("")).toBe("");
    expect(normalizeUnit(null)).toBe("");
    expect(normalizeUnit(undefined)).toBe("");
  });
});

describe("unitFamily", () => {
  it("aileyi doğru verir", () => {
    expect(unitFamily("kg")).toBe("kutle");
    expect(unitFamily("gr")).toBe("kutle");
    expect(unitFamily("lt")).toBe("hacim");
    expect(unitFamily("ml")).toBe("hacim");
    expect(unitFamily("adet")).toBe("adet");
    expect(unitFamily("kova")).toBeNull();
  });
});

describe("conversionFactor", () => {
  it("kütle içinde çevirir", () => {
    expect(conversionFactor("kg", "gr")).toBe(1000);
    expect(conversionFactor("gr", "kg")).toBe(0.001);
    expect(conversionFactor("mg", "gr")).toBe(0.001);
  });

  it("hacim içinde çevirir", () => {
    expect(conversionFactor("lt", "ml")).toBe(1000);
    expect(conversionFactor("ml", "lt")).toBe(0.001);
    expect(conversionFactor("cl", "ml")).toBe(10);
  });

  it("aynı birimde 1 döner", () => {
    expect(conversionFactor("gr", "gr")).toBe(1);
    expect(conversionFactor("GR", "gram")).toBe(1);
  });

  it("aileler arasında çevirmez — yoğunluk uydurulmaz", () => {
    expect(conversionFactor("gr", "ml")).toBeNull();
    expect(conversionFactor("lt", "kg")).toBeNull();
    expect(conversionFactor("adet", "gr")).toBeNull();
  });

  it("tanınmayan ama birebir aynı birimi kabul eder", () => {
    expect(conversionFactor("kova", "kova")).toBe(1);
    expect(conversionFactor("kova", "cuval")).toBeNull();
  });
});

describe("convertQty", () => {
  it("miktarı çevirir", () => {
    expect(convertQty(2, "kg", "gr")).toBe(2000);
    expect(convertQty(250, "gr", "kg")).toBe(0.25);
    expect(convertQty(1.5, "lt", "ml")).toBe(1500);
  });

  it("çevrilemeyende null döner", () => {
    expect(convertQty(5, "gr", "ml")).toBeNull();
  });
});

describe("qtyInMaterialUnit", () => {
  it("birimi olmayan eski satırı olduğu gibi bırakır", () => {
    // Geriye dönük uyum: birimsiz kayıtlar zaten kalemin biriminde yazılmıştı.
    expect(qtyInMaterialUnit(250, null, "kg")).toEqual({ qty: 250, mismatch: false });
    expect(qtyInMaterialUnit(250, "", "kg")).toEqual({ qty: 250, mismatch: false });
  });

  it("gram yazılmış miktarı kilo fiyatlı kaleme çevirir", () => {
    // Katalogdaki 1000× hatasının tam senaryosu.
    expect(qtyInMaterialUnit(250, "gr", "kg")).toEqual({ qty: 0.25, mismatch: false });
  });

  it("kilo yazılmış miktarı gram fiyatlı kaleme çevirir", () => {
    expect(qtyInMaterialUnit(2, "kg", "gr")).toEqual({ qty: 2000, mismatch: false });
  });

  it("uyuşmayan aileyi işaretler ama sayıyı bozmaz", () => {
    const r = qtyInMaterialUnit(100, "gr", "ml");
    expect(r.mismatch).toBe(true);
    expect(r.qty).toBe(100);
  });
});

describe("compatibleUnits", () => {
  it("aynı ailedeki birimleri verir", () => {
    expect(compatibleUnits("kg")).toEqual(["mg", "gr", "kg"]);
    expect(compatibleUnits("ml")).toEqual(["ml", "cl", "lt"]);
    expect(compatibleUnits("adet")).toEqual(["adet"]);
  });

  it("tanınmayan birimde yalnız kendisini verir", () => {
    expect(compatibleUnits("kova")).toEqual([]);
  });
});
