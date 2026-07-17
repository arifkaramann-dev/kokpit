import { describe, expect, it } from "vitest";
import { computePrice, extractJson, slugifyCode, suggestSku } from "./autofill";

describe("slugifyCode", () => {
  it("Türkçe karakterleri sadeleştirir ve boşlukları atar", () => {
    expect(slugifyCode("AİR-X 30 ML BOYA")).toBe("airx30mlboya");
    expect(slugifyCode("ÇĞİÖŞÜ çğıöşü")).toBe("cgiosucgiosu");
  });
});

describe("suggestSku", () => {
  it("marka kelimelerini atıp aoc önekiyle kod üretir (Excel paritesi)", () => {
    expect(suggestSku("ARTOFCOLOUR AİR-X 30 ML BOYA", "30 ML")).toBe("aocairx30mlboya");
  });

  it("ambalaj adı üründe geçmiyorsa sona ekler", () => {
    expect(suggestSku("ARTOFCOLOUR PRİMEX ASTAR", "SPREY 400ML")).toBe("aocprimexastarsprey400ml");
  });

  it("ambalaj adı üründe zaten geçiyorsa tekrar eklemez", () => {
    expect(suggestSku("ARTOFCOLOUR SPREY 400ML ASTAR", "SPREY 400ML")).toBe("aocsprey400mlastar");
  });
});

describe("computePrice", () => {
  it("Excel mantığı: maliyet × (1 + kâr%) = KDV hariç satış", () => {
    // AİR-X örneği: maliyet 56₺, %35 kâr → 75,60₺; %20 KDV → 90,72₺.
    const r = computePrice({ materialCost: 56, profitMargin: 35, vatRate: 20 });
    expect(r.cost).toBe(56);
    expect(r.salePrice).toBe(75.6);
    expect(r.vatAmount).toBe(15.12);
    expect(r.priceWithVat).toBe(90.72);
  });

  it("ambalaj ve kargo maliyetini toplama katar", () => {
    const r = computePrice({
      materialCost: 100,
      packagingCost: 20,
      shippingCost: 30,
      profitMargin: 50,
      vatRate: 10,
    });
    expect(r.cost).toBe(150);
    expect(r.salePrice).toBe(225);
    expect(r.priceWithVat).toBe(247.5);
  });

  it("sıfır maliyette sıfır döner (bölme/NaN hatası yok)", () => {
    const r = computePrice({ materialCost: 0, profitMargin: 35, vatRate: 20 });
    expect(r.salePrice).toBe(0);
    expect(r.priceWithVat).toBe(0);
  });

  it("kuruş yuvarlaması 2 haneye yapılır", () => {
    const r = computePrice({ materialCost: 137.5, profitMargin: 35, vatRate: 20 });
    expect(r.salePrice).toBe(185.63);
  });
});

describe("extractJson", () => {
  it("düz JSON'u ayıklar", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("kod bloğu içindeki JSON'u ayıklar", () => {
    expect(extractJson('İşte içerik:\n```json\n{"a":"b"}\n```')).toEqual({ a: "b" });
  });

  it("başında/sonunda metin olsa da ayıklar", () => {
    expect(extractJson('Tabii! {"x": [1,2]} — bu kadar.')).toEqual({ x: [1, 2] });
  });

  it("geçersiz girdide null döner", () => {
    expect(extractJson("JSON yok burada")).toBeNull();
  });
});
