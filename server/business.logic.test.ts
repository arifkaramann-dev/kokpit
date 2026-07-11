import { describe, expect, it } from "vitest";
import { calcProfit } from "../client/src/pages/Costs";
import { ORDER_STATUSES, num } from "../client/src/lib/format";

describe("calcProfit — maliyet ve kar marjı hesabı", () => {
  it("indirimli fiyat, toplam maliyet, kar ve marjı doğru hesaplar", () => {
    const r = calcProfit({
      salePrice: 1000,
      discountPercent: 10,
      materialCost: 300,
      packagingCost: 50,
      shippingCost: 100,
    });
    expect(r.netPrice).toBe(900);
    expect(r.totalCost).toBe(450);
    expect(r.profit).toBe(450);
    expect(r.margin).toBeCloseTo(50, 5);
  });

  it("satış fiyatı 0 iken marj 0 döner (bölme hatası yok)", () => {
    const r = calcProfit({
      salePrice: 0,
      discountPercent: 0,
      materialCost: 100,
      packagingCost: 0,
      shippingCost: 0,
    });
    expect(r.margin).toBe(0);
    expect(r.profit).toBe(-100);
  });

  it("zarar durumunda negatif kar döner", () => {
    const r = calcProfit({
      salePrice: 100,
      discountPercent: 50,
      materialCost: 80,
      packagingCost: 10,
      shippingCost: 20,
    });
    expect(r.netPrice).toBe(50);
    expect(r.profit).toBe(-60);
    expect(r.margin).toBeLessThan(0);
  });
});

describe("kritik stok uyarı mantığı", () => {
  const isCritical = (stockQty: string, criticalQty: string) => num(stockQty) <= num(criticalQty);

  it("stok eşiğin altındaysa kritik sayılır", () => {
    expect(isCritical("5", "10")).toBe(true);
  });
  it("stok eşiğe eşitse kritik sayılır", () => {
    expect(isCritical("10", "10")).toBe(true);
  });
  it("stok eşiğin üstündeyse kritik sayılmaz", () => {
    expect(isCritical("15.5", "10")).toBe(false);
  });
  it("geçersiz değerler 0 kabul edilir", () => {
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
  });
});

describe("sipariş durum akışı", () => {
  it("dört durum tanımlı: new, production, ready, done", () => {
    expect(ORDER_STATUSES.map(s => s.value)).toEqual(["new", "production", "ready", "done"]);
  });
  it("her durumun Türkçe etiketi ve rengi var", () => {
    for (const s of ORDER_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.color).toMatch(/^bg-/);
    }
  });
});

import { calcMarketplace } from "../client/src/pages/Costs";

describe("calcMarketplace — pazaryeri ve KDV analizi", () => {
  it("KDV, komisyon ve kesintileri doğru ayrıştırır", () => {
    const r = calcMarketplace({
      salePrice: 1200,
      vatPercent: 20,
      commissionPercent: 20,
      fixedFee: 10,
      shippingCost: 90,
      productCost: 300,
    });
    expect(r.vat).toBeCloseTo(200, 2);
    expect(r.commission).toBeCloseTo(240, 2);
    expect(r.net).toBeCloseTo(1200 - 200 - 240 - 10 - 90 - 300, 2);
  });

  it("satış fiyatı 0 iken marj 0 döner", () => {
    const r = calcMarketplace({ salePrice: 0, vatPercent: 20, commissionPercent: 20, fixedFee: 0, shippingCost: 0, productCost: 0 });
    expect(r.margin).toBe(0);
  });
});

import { buildSaleTitle, deriveCombos, parseSetCount } from "../server/productUtils";

describe("buildSaleTitle — satış başlığı üretimi", () => {
  it("örnek başlığı doğru kurar", () => {
    expect(buildSaleTitle("Astar", "3D Baskı", "400 ml Sprey", "Açık Gri")).toBe(
      "Artofcolour 3D Baskı Astar 400 ml Sprey Açık Gri"
    );
  });
  it("boş boyutları atlar", () => {
    expect(buildSaleTitle("Jant Astarı", null, "400 ml Sprey", null)).toBe(
      "Artofcolour Jant Astarı 400 ml Sprey"
    );
  });
});

describe("deriveCombos — kombinasyon üretimi", () => {
  it("2 kullanım × 2 ambalaj × 1 renk = 4 kombinasyon", () => {
    expect(deriveCombos(["Jant", "3D Baskı"], ["400 ml", "1 L"], ["Gri"])).toHaveLength(4);
  });
  it("tek boyut seçiliyse diğerleri null kalır", () => {
    const combos = deriveCombos(["Ahşap"], [], []);
    expect(combos).toEqual([{ use: "Ahşap", packaging: null, color: null, set: null }]);
  });
  it("set boyutu kombinasyonu çarpar", () => {
    expect(deriveCombos([], ["400 ml"], ["Gri"], ["2'li Set", "3'lü Set"])).toHaveLength(2);
  });
});

describe("parseSetCount — set adedi çıkarımı", () => {
  it("Türkçe set adlarından adet çıkarır", () => {
    expect(parseSetCount("2'li Set")).toBe(2);
    expect(parseSetCount("5'li Paket")).toBe(5);
    expect(parseSetCount("12 adet koli")).toBe(12);
  });
  it("sayı yoksa veya boşsa 1 döner", () => {
    expect(parseSetCount("Mega Paket")).toBe(1);
    expect(parseSetCount(null)).toBe(1);
  });
  it("set adı başlığın sonuna eklenir", () => {
    expect(buildSaleTitle("Jant Astarı", null, "400 ml Sprey", "Antrasit Gri", "2'li Set")).toBe(
      "Artofcolour Jant Astarı 400 ml Sprey Antrasit Gri 2'li Set"
    );
  });
});
