import { describe, expect, it } from "vitest";
import { desiToEdgeCm, parseGeliverOffers } from "./kargo";

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
