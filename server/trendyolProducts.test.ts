import { describe, expect, it } from "vitest";
import {
  mapProductsToTrendyolItems,
  parseCardSettings,
  type TrendyolCardSettings,
} from "./trendyolProducts";
import type { Product } from "../drizzle/schema";

const cfg: TrendyolCardSettings = {
  brandId: 999,
  cargoCompanyId: 17,
  categoryMap: { Boya: 1234 },
  publicBaseUrl: "https://kokpit.example.com",
  attributeDefaults: { "1234": [{ attributeId: 338, attributeValueId: 6980 }] },
};

let nextId = 1;
function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: nextId++,
    companyId: 1,
    parentId: null,
    name: "Test Ürün",
    series: "PRIMER",
    colorCode: null,
    colorHex: "#111111",
    surfaceType: null,
    additives: null,
    description: "Açıklama",
    salePrice: "216.00",
    discountPercent: "0",
    packagingCost: "0",
    shippingCost: "0",
    packaging: "400 ml Sprey",
    barcode: null,
    stockQty: 10,
    criticalQty: 0,
    labelSize: null,
    labelText: null,
    usageGuide: null,
    safetyNotes: null,
    extraInfo: null,
    sku: null,
    category: "Boya",
    profitMargin: null,
    vatRate: "20",
    desi: "1",
    paintType: null,
    features: null,
    shortDescription: null,
    longDescription: "Uzun açıklama",
    applicationText: null,
    imageUrls: null,
    videoUrl: null,
    mockupUrl: null,
    labelWarnings: null,
    isActive: 1,
    status: "satista",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

describe("mapProductsToTrendyolItems", () => {
  it("türevler ana ürünün productMainId'sini paylaşır (tek ilan + varyant)", () => {
    const parent = makeProduct({ sku: "AOC-ANA", barcode: "anaBarkod" });
    const v1 = makeProduct({ parentId: parent.id, name: "Türev 1", barcode: "b1", sku: "s1" });
    const v2 = makeProduct({ parentId: parent.id, name: "Türev 2", barcode: "b2", sku: "s2" });
    const images = new Map([[parent.id, ["main"]]]);
    const { items, problems } = mapProductsToTrendyolItems(parent, [v1, v2], images, cfg);
    expect(problems).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0].productMainId).toBe("AOC-ANA");
    expect(items[1].productMainId).toBe("AOC-ANA");
    // Türevin görseli yoksa ana ürünün görseli kullanılır.
    expect(items[0].images[0].url).toBe(`https://kokpit.example.com/api/img/${parent.id}/main`);
    expect(items[0].attributes).toEqual([{ attributeId: 338, attributeValueId: 6980 }]);
  });

  it("barkodsuz ve taslak türev atlanır, nedeni problems'a yazılır", () => {
    const parent = makeProduct({ sku: "AOC-X", barcode: "pb" });
    const noBarcode = makeProduct({ parentId: parent.id, name: "Barkodsuz" });
    const draft = makeProduct({ parentId: parent.id, name: "Taslak", barcode: "tb", status: "taslak" });
    const ok = makeProduct({ parentId: parent.id, name: "Tamam", barcode: "ok1" });
    const images = new Map([[parent.id, ["main"]]]);
    const { items, problems } = mapProductsToTrendyolItems(parent, [noBarcode, draft, ok], images, cfg);
    expect(items).toHaveLength(1);
    expect(items[0].barcode).toBe("ok1");
    expect(problems.some(p => p.includes("Barkodsuz") && p.includes("barkod"))).toBe(true);
    expect(problems.some(p => p.includes("Taslak") && p.includes("taslak"))).toBe(true);
  });

  it("indirim satış fiyatına yansır, liste fiyatı korunur", () => {
    const parent = makeProduct({ barcode: "d1", sku: "sd1", discountPercent: "10", salePrice: "100.00" });
    const images = new Map([[parent.id, ["main"]]]);
    const { items } = mapProductsToTrendyolItems(parent, [], images, cfg);
    expect(items[0].listPrice).toBe(100);
    expect(items[0].salePrice).toBe(90);
  });

  it("kategori eşlemesi olmayan ürün gönderilmez", () => {
    const parent = makeProduct({ barcode: "c1", category: "Bilinmeyen" });
    const images = new Map([[parent.id, ["main"]]]);
    const { items, problems } = mapProductsToTrendyolItems(parent, [], images, cfg);
    expect(items).toHaveLength(0);
    expect(problems[0]).toContain("kategori eşlemesi yok");
  });

  it("görselsiz ürün gönderilmez; harici imageUrls listesi görsel sayılır", () => {
    const noImage = makeProduct({ barcode: "g1" });
    const withExternal = makeProduct({ barcode: "g2", imageUrls: '["https://cdn.example.com/a.jpg"]' });
    expect(mapProductsToTrendyolItems(noImage, [], new Map(), cfg).items).toHaveLength(0);
    const { items } = mapProductsToTrendyolItems(withExternal, [], new Map(), cfg);
    expect(items).toHaveLength(1);
    expect(items[0].images[0].url).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("parseCardSettings", () => {
  it("eksik ayarları alan adıyla raporlar", () => {
    const r = parseCardSettings({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.join(" ")).toContain("trendyolBrandId");
      expect(r.missing.join(" ")).toContain("trendyolCategoryMap");
    }
  });

  it("geçerli ayarları çözümler, site adresindeki bitiş eğik çizgisini atar", () => {
    const r = parseCardSettings({
      trendyolBrandId: "999",
      trendyolCargoCompanyId: "17",
      trendyolCategoryMap: '{"Boya": 1234}',
      publicBaseUrl: "https://kokpit.example.com/",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.brandId).toBe(999);
      expect(r.value.categoryMap.Boya).toBe(1234);
      expect(r.value.publicBaseUrl).toBe("https://kokpit.example.com");
    }
  });

  it("bozuk kategori JSON'u hata olarak raporlanır", () => {
    const r = parseCardSettings({
      trendyolBrandId: "999",
      trendyolCargoCompanyId: "17",
      trendyolCategoryMap: "{bozuk",
      publicBaseUrl: "https://x.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.join(" ")).toContain("geçersiz JSON");
  });
});
