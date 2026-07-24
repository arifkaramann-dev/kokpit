import { describe, expect, it } from "vitest";
import { desiToEdgeCm, extractCityFromAddress, parseGeliverOffers } from "./kargo";

describe("kargo — Geliver teklif ayrıştırma", () => {
  it("teklifleri en ucuzdan pahalıya sıralar ve firma adını çıkarır", () => {
    const offers = parseGeliverOffers([
      { id: "b", providerServiceName: "Yurtiçi Standart", totalAmount: "120.50", currency: "TRY" },
      { id: "a", providerName: "Aras", amount: 89.9 },
      { id: "c", providerServiceCode: "MNG", price: "150" },
    ]);
    expect(offers.map(o => o.id)).toEqual(["a", "b", "c"]);
    expect(offers[0]).toMatchObject({ id: "a", carrier: "Aras", amount: 89.9 });
    expect(offers[1].carrier).toBe("Yurtiçi Standart");
    expect(offers[2].carrier).toBe("MNG");
  });

  it("ID veya geçerli fiyatı olmayan teklifleri eler", () => {
    const offers = parseGeliverOffers([
      { id: "", amount: 100 }, // id yok
      { id: "x", amount: "abc" }, // fiyat geçersiz
      { id: "y", totalAmount: 50 }, // geçerli
    ]);
    expect(offers.map(o => o.id)).toEqual(["y"]);
  });

  it("tahmini teslim ve para birimini alır, varsayılan TRY", () => {
    const [o] = parseGeliverOffers([{ id: "z", amount: 10, estimatedDeliveryDate: "2 gün" }]);
    expect(o.currency).toBe("TRY");
    expect(o.estDays).toBe("2 gün");
  });

  it("dizi değilse boş döner", () => {
    expect(parseGeliverOffers(null)).toEqual([]);
    expect(parseGeliverOffers(undefined)).toEqual([]);
    expect(parseGeliverOffers({})).toEqual([]);
  });

  it("desiToEdgeCm: desi×3000'ün küp kökü, en az 1", () => {
    expect(Number(desiToEdgeCm(1))).toBeCloseTo(14.4, 1);
    expect(Number(desiToEdgeCm(0))).toBeGreaterThanOrEqual(1);
  });
});

describe("extractCityFromAddress — adres metninden il çıkarma", () => {
  it("adresin sonundaki ili bulur (Türkçe harf duyarsız)", () => {
    expect(extractCityFromAddress("Atatürk Mah. 123 Sok. No:5 Kadıköy / İstanbul")).toBe("İstanbul");
    expect(extractCityFromAddress("Cumhuriyet Cad. 10, Nilüfer, Bursa")).toBe("Bursa");
    expect(extractCityFromAddress("... Çankaya ANKARA")).toBe("Ankara");
  });

  it("birden çok il geçerse sondakini seçer (il genelde en sonda)", () => {
    // "Ankara Caddesi" sokak adı; gerçek il sonda İzmir.
    expect(extractCityFromAddress("Ankara Caddesi No:3, Konak, İzmir")).toBe("İzmir");
  });

  it("il adı tam kelime aranır — alt dizeye takılmaz", () => {
    // "Divan" içinde "van" var ama tek kelime olmadığı için Van seçilmez.
    expect(extractCityFromAddress("Divan Otel karşısı, Şişli, İstanbul")).toBe("İstanbul");
  });

  it("kısaltma/eski adları çözer (Urfa, Afyon, Maraş, İçel)", () => {
    expect(extractCityFromAddress("Merkez, Urfa")).toBe("Şanlıurfa");
    expect(extractCityFromAddress("Sanayi Mah., Afyon")).toBe("Afyonkarahisar");
  });

  it("il bulunamazsa boş döner", () => {
    expect(extractCityFromAddress("Sadece sokak ve numara")).toBe("");
    expect(extractCityFromAddress("")).toBe("");
    expect(extractCityFromAddress(null)).toBe("");
  });
});
