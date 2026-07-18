import { describe, expect, it } from "vitest";
import { jsonListHasItems, productHealth, type ProductHealthInput } from "@shared/productHealth";

const fullCard: ProductHealthInput = {
  barcode: "aoc123",
  sku: "AOC-123",
  salePrice: "216.00",
  category: "Boya",
  desi: "1",
  shortDescription: "Kısa açıklama",
  longDescription: "Uzun açıklama",
  applicationText: "Adım adım uygulama",
  packaging: "400 ml Sprey",
  labelText: "Etiket metni",
  usageGuide: "Kılavuz",
  hasImage: true,
};

describe("productHealth", () => {
  it("tam kart %100 ve eksiksiz", () => {
    const h = productHealth(fullCard);
    expect(h.score).toBe(100);
    expect(h.missing).toEqual([]);
    expect(h.missingRequired).toEqual([]);
  });

  it("boş kart düşük skor, tüm zorunlular eksik listesinde", () => {
    const h = productHealth({
      barcode: null,
      sku: null,
      salePrice: "0",
      category: null,
      desi: null,
      shortDescription: null,
      longDescription: null,
      applicationText: null,
      packaging: null,
      labelText: null,
      usageGuide: null,
      hasImage: false,
    });
    expect(h.score).toBe(0);
    expect(h.missingRequired).toContain("Barkod");
    expect(h.missingRequired).toContain("Görsel");
    expect(h.missingRequired).toContain("Satış fiyatı");
  });

  it("fiyat '0,00' ve '0.00' boş sayılır", () => {
    expect(productHealth({ ...fullCard, salePrice: "0,00" }).missingRequired).toContain("Satış fiyatı");
    expect(productHealth({ ...fullCard, salePrice: "0.00" }).missingRequired).toContain("Satış fiyatı");
  });

  it("zorunlu olmayan eksik alan missing'de ama missingRequired'da değil", () => {
    const h = productHealth({ ...fullCard, usageGuide: null });
    expect(h.missing).toContain("Kullanım kılavuzu");
    expect(h.missingRequired).not.toContain("Kullanım kılavuzu");
    expect(h.score).toBeLessThan(100);
    expect(h.score).toBeGreaterThanOrEqual(90);
  });
});

describe("jsonListHasItems", () => {
  it("dolu JSON dizisi true", () => {
    expect(jsonListHasItems('["https://a.jpg"]')).toBe(true);
  });
  it("boş dizi, null ve bozuk JSON false", () => {
    expect(jsonListHasItems("[]")).toBe(false);
    expect(jsonListHasItems(null)).toBe(false);
    expect(jsonListHasItems("hello")).toBe(false);
  });
});
