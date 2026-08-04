import { describe, expect, it } from "vitest";
import {
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


describe("parseCardSettings", () => {
  it("eksik ayarları alan adıyla raporlar", () => {
    const r = parseCardSettings({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.join(" ")).toContain("trendyolBrandId");
      expect(r.missing.join(" ")).toContain("trendyolCargoCompanyId");
    }
  });

  /*
   * Küp katalogda kategori kanal ilanından gelir (Toplu Yayın → Kategori
   * Eşlemesi). Bu JSON'u zorunlu tutmak, yeni modelin hiç kullanmadığı bir
   * ayar için kullanıcıyı Ayarlar'da elle JSON yazmaya mecbur bırakıyordu.
   */
  it("kategori eşlemesi JSON'u zorunlu değildir", () => {
    const r = parseCardSettings({
      trendyolBrandId: "999",
      trendyolCargoCompanyId: "17",
      publicBaseUrl: "https://kokpit.example.com",
    });
    expect(r.ok).toBe(true);
  });

  it("bozuk kategori JSON'u yine bildirilir", () => {
    const r = parseCardSettings({
      trendyolBrandId: "999",
      trendyolCargoCompanyId: "17",
      publicBaseUrl: "https://kokpit.example.com",
      trendyolCategoryMap: "{bozuk",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.join(" ")).toContain("trendyolCategoryMap");
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
