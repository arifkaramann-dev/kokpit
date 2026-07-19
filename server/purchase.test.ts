import { describe, expect, it } from "vitest";
import {
  applyPurchaseToMaterial,
  normalizeUnit,
  purchaseTotals,
  unitConversionFactor,
} from "./purchaseUtils";

describe("purchaseTotals (net matrah / indirilecek KDV / brüt)", () => {
  it("tek oran: net, KDV ve brüt tutarlı", () => {
    expect(purchaseTotals([{ name: "Boya", qty: 10, unit: "kg", unitCost: 5, vatRate: 20 }])).toEqual({
      netTotal: 50,
      vatTotal: 10,
      grossTotal: 60,
    });
  });

  it("KDV oranı verilmezse %20 varsayılır", () => {
    expect(purchaseTotals([{ name: "X", qty: 1, unit: "adet", unitCost: 100 }])).toEqual({
      netTotal: 100,
      vatTotal: 20,
      grossTotal: 120,
    });
  });

  it("karışık oranlar (%20 + %10 + %1) satır bazlı toplanır", () => {
    const r = purchaseTotals([
      { name: "A", qty: 2, unit: "adet", unitCost: 100, vatRate: 20 }, // net 200, kdv 40
      { name: "B", qty: 1, unit: "adet", unitCost: 100, vatRate: 10 }, // net 100, kdv 10
      { name: "C", qty: 5, unit: "kg", unitCost: 20, vatRate: 1 }, // net 100, kdv 1
    ]);
    expect(r.netTotal).toBe(400);
    expect(r.vatTotal).toBe(51);
    expect(r.grossTotal).toBe(451);
  });
});

describe("normalizeUnit + unitConversionFactor", () => {
  it("eş anlamlıları tek forma indirger", () => {
    expect(normalizeUnit("Kilogram")).toBe("kg");
    expect(normalizeUnit(" GR ")).toBe("gr");
    expect(normalizeUnit("Litre")).toBe("lt");
    expect(normalizeUnit("Adet")).toBe("adet");
  });
  it("aynı boyutta dönüşüm faktörü verir", () => {
    expect(unitConversionFactor("kg", "gr")).toBe(1000);
    expect(unitConversionFactor("gr", "kg")).toBe(0.001);
    expect(unitConversionFactor("lt", "ml")).toBe(1000);
    expect(unitConversionFactor("kg", "kg")).toBe(1);
  });
  it("farklı boyut/uyumsuz birim null döner", () => {
    expect(unitConversionFactor("kg", "adet")).toBeNull();
    expect(unitConversionFactor("lt", "gr")).toBeNull();
  });
});

describe("applyPurchaseToMaterial (ağırlıklı ortalama maliyet + birim güvenliği)", () => {
  it("aynı birim: ağırlıklı ortalama ((eski×eski + yeni×yeni)/toplam)", () => {
    const r = applyPurchaseToMaterial(
      { stockQty: "100", unitCost: "10", unit: "gr" },
      { name: "Pigment", qty: 100, unit: "gr", unitCost: 20 },
    );
    expect(r.newStockQty).toBe(200);
    expect(r.newUnitCost).toBeCloseTo(15, 6); // (1000+2000)/200
    expect(r.compatible).toBe(true);
    expect(r.converted).toBe(false);
  });

  it("son fiyatla EZMEZ: pahalı küçük alım ortalamayı az oynatır", () => {
    const r = applyPurchaseToMaterial(
      { stockQty: "900", unitCost: "10", unit: "gr" },
      { name: "Pigment", qty: 100, unit: "gr", unitCost: 30 },
    );
    // Ağırlıklı: (9000+3000)/1000 = 12 — "son fiyat 30" ile ezseydi yanlış olurdu.
    expect(r.newUnitCost).toBeCloseTo(12, 6);
  });

  it("birim dönüşümü: 5 kg @ 100 TL/kg, stok gr cinsinden → 5000 gr @ 0,10 TL/gr", () => {
    const r = applyPurchaseToMaterial(
      { stockQty: "0", unitCost: "0", unit: "gr" },
      { name: "Reçine", qty: 5, unit: "kg", unitCost: 100 },
    );
    expect(r.addedQty).toBe(5000);
    expect(r.newStockQty).toBe(5000);
    expect(r.newUnitCost).toBeCloseTo(0.1, 6);
    expect(r.converted).toBe(true);
    expect(r.compatible).toBe(true);
  });

  it("dönüşüm + mevcut stok: gr bazında ağırlıklı ortalama", () => {
    const r = applyPurchaseToMaterial(
      { stockQty: "1000", unitCost: "0.2", unit: "gr" },
      { name: "Reçine", qty: 5, unit: "kg", unitCost: 100 },
    );
    // (1000×0,2 + 5000×0,1) / 6000 = 700/6000
    expect(r.newStockQty).toBe(6000);
    expect(r.newUnitCost).toBeCloseTo(700 / 6000, 6);
  });

  it("uyumsuz birim (adet↔kg): dönüştürmez, HAM ekler ve compatible=false ile uyarır", () => {
    const r = applyPurchaseToMaterial(
      { stockQty: "10", unitCost: "5", unit: "kg" },
      { name: "Kova", qty: 5, unit: "adet", unitCost: 8 },
    );
    expect(r.compatible).toBe(false);
    expect(r.addedQty).toBe(5); // ham
    expect(r.newStockQty).toBe(15);
    expect(r.newUnitCost).toBeCloseTo((10 * 5 + 5 * 8) / 15, 6);
  });
});
