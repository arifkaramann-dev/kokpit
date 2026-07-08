import { describe, expect, it } from "vitest";
import { itemsTotal, summarizeItems } from "./routers";

describe("sipariş kalemleri — toplam ve özet türetme", () => {
  const items = [
    { productName: "Kırmızı Metalik 1L", quantity: 2, unitPrice: 450 },
    { productName: "Sprey Vernik", quantity: 1, unitPrice: 120 },
  ];

  it("toplam tutarı satırlardan hesaplar", () => {
    expect(itemsTotal(items)).toBe(1020);
  });

  it("boş listede toplam 0 döner", () => {
    expect(itemsTotal([])).toBe(0);
  });

  it("kart özetini 'adet× ürün' biçiminde üretir", () => {
    expect(summarizeItems(items)).toBe("2× Kırmızı Metalik 1L, 1× Sprey Vernik");
  });

  it("ondalık adetleri Türkçe biçimle yazar", () => {
    expect(summarizeItems([{ productName: "Tiner", quantity: 0.5, unitPrice: 80 }])).toBe(
      "0,5× Tiner"
    );
  });

  it("ondalık birim fiyatlarla doğru toplar", () => {
    expect(itemsTotal([{ productName: "Pigment", quantity: 3, unitPrice: 33.33 }])).toBeCloseTo(
      99.99,
      2
    );
  });
});
