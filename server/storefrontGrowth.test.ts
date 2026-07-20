import { describe, expect, it } from "vitest";
import { calcShipping, parseShippingConfig, DEFAULT_SHIPPING } from "../shared/shipping";
import { activeCampaignPercent, resolveStorePrice, MAX_STORE_DISCOUNT_PERCENT, type StoreCampaign } from "../shared/storePricing";
import { buildRobotsTxt, buildSitemapXml, buildProductJsonLd, buildProductHeadTags, injectHead, escapeXml } from "../shared/seo";

describe("shipping — kargo ücreti modeli", () => {
  it("kapalıysa her zaman 0", () => {
    expect(calcShipping(1000, { enabled: false, fee: 50, freeOver: null })).toBe(0);
  });
  it("açık + eşik yok → sabit ücret", () => {
    expect(calcShipping(100, { enabled: true, fee: 49.9, freeOver: null })).toBe(49.9);
  });
  it("eşik üstünde kargo bedava", () => {
    expect(calcShipping(500, { enabled: true, fee: 50, freeOver: 400 })).toBe(0);
    expect(calcShipping(399, { enabled: true, fee: 50, freeOver: 400 })).toBe(50);
    expect(calcShipping(400, { enabled: true, fee: 50, freeOver: 400 })).toBe(0); // eşiğe eşit = bedava
  });
  it("boş sepet → 0", () => {
    expect(calcShipping(0, { enabled: true, fee: 50, freeOver: null })).toBe(0);
  });
  it("parseShippingConfig toleranslı", () => {
    expect(parseShippingConfig("")).toEqual(DEFAULT_SHIPPING);
    expect(parseShippingConfig("bozuk")).toEqual(DEFAULT_SHIPPING);
    expect(parseShippingConfig(JSON.stringify({ enabled: true, fee: 30, freeOver: 500 }))).toEqual({
      enabled: true,
      fee: 30,
      freeOver: 500,
    });
    // negatif/sıfır freeOver → null; negatif fee → 0
    expect(parseShippingConfig(JSON.stringify({ enabled: true, fee: -5, freeOver: 0 }))).toEqual({
      enabled: true,
      fee: 0,
      freeOver: null,
    });
  });
});

describe("storePricing — kampanya + indirim + maliyet-taban", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  const campaigns: StoreCampaign[] = [
    { productGroup: "Meteor", discountPercent: 20, startDate: "2026-07-01", endDate: "2026-07-31", status: "active" },
    { productGroup: null, discountPercent: 5, startDate: "2026-07-01", endDate: "2026-07-31", status: "planned" }, // tümüne
    { productGroup: "Candy", discountPercent: 30, startDate: "2026-01-01", endDate: "2026-02-01", status: "done" }, // bitmiş
  ];

  it("grup eşleşen kampanya + en yüksek kazanır (genel %5 ile Meteor %20)", () => {
    expect(activeCampaignPercent(campaigns, "Meteor", now)).toBe(20);
  });
  it("grup boş kampanya tüm ürünlere uygulanır", () => {
    expect(activeCampaignPercent(campaigns, "Vivid", now)).toBe(5);
  });
  it("bitmiş (done) kampanya uygulanmaz", () => {
    expect(activeCampaignPercent(campaigns, "Candy", now)).toBe(5); // done atlandı, genel %5 kaldı
  });
  it("tarih dışında uygulanmaz", () => {
    expect(activeCampaignPercent(campaigns, "Meteor", new Date("2026-09-01"))).toBe(0);
  });

  it("indirim uygulanır ve efektif yüzde döner", () => {
    const r = resolveStorePrice({ listPrice: 100, productDiscountPercent: 0, campaignPercent: 20, netCost: 40 });
    expect(r.price).toBe(80);
    expect(r.discounted).toBe(true);
    expect(r.effectiveDiscountPercent).toBe(20);
    expect(r.listPrice).toBe(100);
  });

  it("MALİYET-TABAN: fiyat net maliyetin altına düşmez", () => {
    // %60 indirim 100→40 olurdu ama maliyet 55 → fiyat 55'e sabitlenir
    const r = resolveStorePrice({ listPrice: 100, productDiscountPercent: 30, campaignPercent: 30, netCost: 55 });
    expect(r.price).toBe(55);
    expect(r.effectiveDiscountPercent).toBe(45);
  });

  it("toplam indirim tavanı MAX_STORE_DISCOUNT_PERCENT ile sınırlı", () => {
    // 50 + 50 = 100 ama tavan 60 → 100*(1-0.6)=40, maliyet 0 (bilinmiyor) → 40
    const r = resolveStorePrice({ listPrice: 100, productDiscountPercent: 50, campaignPercent: 50, netCost: 0 });
    expect(r.price).toBe(+(100 * (1 - MAX_STORE_DISCOUNT_PERCENT / 100)).toFixed(2));
  });

  it("indirim yoksa liste = fiyat, discounted false", () => {
    const r = resolveStorePrice({ listPrice: 120, productDiscountPercent: 0, campaignPercent: 0, netCost: 40 });
    expect(r.price).toBe(120);
    expect(r.discounted).toBe(false);
    expect(r.effectiveDiscountPercent).toBe(0);
  });
});

describe("seo — sitemap / robots / JSON-LD / meta enjeksiyonu", () => {
  it("sitemap geçerli XML ve URL'leri kaçışlar", () => {
    const xml = buildSitemapXml([
      { loc: "https://x.com/magaza", changefreq: "daily", priority: "0.8" },
      { loc: "https://x.com/magaza/urun/5?a=1&b=2", lastmod: "2026-07-20" },
    ]);
    expect(xml).toContain("<?xml version");
    expect(xml).toContain("<loc>https://x.com/magaza</loc>");
    expect(xml).toContain("&amp;b=2"); // & kaçışlı
    expect(xml).toContain("<lastmod>2026-07-20</lastmod>");
  });
  it("robots sitemap satırı ekler ve API'yi kapatır", () => {
    const r = buildRobotsTxt({ sitemapUrl: "https://x.com/sitemap.xml" });
    expect(r).toContain("Sitemap: https://x.com/sitemap.xml");
    expect(r).toContain("Disallow: /api/");
    expect(r).toContain("Allow: /magaza");
  });
  it("JSON-LD Product fiyat/stok içerir ve gösterilen fiyatla eşleşir", () => {
    const json = buildProductJsonLd({
      id: 5,
      name: "Meteor Kırmızı",
      description: "Renk değiştiren efekt boya",
      url: "https://x.com/magaza/urun/5",
      price: 80,
      availability: "InStock",
    });
    const obj = JSON.parse(json);
    expect(obj["@type"]).toBe("Product");
    expect(obj.offers.price).toBe("80.00");
    expect(obj.offers.priceCurrency).toBe("TRY");
    expect(obj.offers.availability).toBe("https://schema.org/InStock");
  });
  it("head tags title/description enjekte eder, </> kaçışı JSON-LD'de güvenli", () => {
    const tags = buildProductHeadTags({
      id: 1,
      name: "Candy <Mavi>",
      description: 'Şeffaf "boya"',
      url: "https://x.com/magaza/urun/1",
      price: 50,
    });
    expect(tags).toContain("<title>Candy &lt;Mavi&gt; | Art of Colour</title>");
    expect(tags).toContain('content="Şeffaf &quot;boya&quot;"');
    // JSON-LD script içinde ham </script> olmamalı (XSS/parse kırılması)
    expect(tags).not.toContain("</script></script>");
  });
  it("injectHead statik title'ı değiştirir, </head>'den önce ekler", () => {
    const html = "<html><head><title>Eski</title><meta charset=\"utf-8\"></head><body></body></html>";
    const out = injectHead(html, "<title>Yeni</title>");
    expect(out).not.toContain("<title>Eski</title>");
    expect(out).toContain("<title>Yeni</title>");
    expect(out.indexOf("<title>Yeni</title>")).toBeLessThan(out.indexOf("</head>"));
  });
  it("escapeXml temel karakterleri kaçışlar", () => {
    expect(escapeXml("a&b<c>\"d'")).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
  });
});
