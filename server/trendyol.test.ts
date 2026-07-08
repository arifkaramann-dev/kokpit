import { describe, expect, it } from "vitest";
import { mapPackageToOrder, type TrendyolPackage } from "./trendyol";

function samplePackage(overrides: Partial<TrendyolPackage> = {}): TrendyolPackage {
  return {
    id: 11650604,
    orderNumber: "80249163",
    orderDate: 1720000000000,
    customerFirstName: "Ayşe",
    customerLastName: "Yılmaz",
    status: "Created",
    totalPrice: 1020,
    lines: [
      { productName: "Kırmızı Metalik 1L", quantity: 2, price: 450 },
      { productName: "Sprey Vernik", quantity: 1, price: 120 },
    ],
    ...overrides,
  };
}

describe("Trendyol paket → sipariş eşlemesi", () => {
  it("temel alanları doğru eşler", () => {
    const order = mapPackageToOrder(samplePackage());
    expect(order).not.toBeNull();
    expect(order!.orderNo).toBe("TY-80249163");
    expect(order!.customerName).toBe("Ayşe Yılmaz");
    expect(order!.channel).toBe("trendyol");
    expect(order!.status).toBe("new");
    expect(order!.totalAmount).toBe("1020");
    expect(order!.itemsSummary).toBe("2× Kırmızı Metalik 1L, 1× Sprey Vernik");
    expect(order!.items).toHaveLength(2);
    expect(order!.items[0]).toEqual({
      productName: "Kırmızı Metalik 1L",
      quantity: 2,
      unitPrice: 450,
    });
  });

  it("kargodaki paketleri 'Kargoya Hazır' sütununa alır", () => {
    expect(mapPackageToOrder(samplePackage({ status: "Shipped" }))!.status).toBe("ready");
  });

  it("teslim edilenleri 'Tamamlandı' sütununa alır", () => {
    expect(mapPackageToOrder(samplePackage({ status: "Delivered" }))!.status).toBe("done");
  });

  it("iptal ve iadeleri içe aktarmaz", () => {
    expect(mapPackageToOrder(samplePackage({ status: "Cancelled" }))).toBeNull();
    expect(mapPackageToOrder(samplePackage({ status: "Returned" }))).toBeNull();
  });

  it("bilinmeyen durumları görünür olsun diye 'Yeni' sütununa alır", () => {
    expect(mapPackageToOrder(samplePackage({ status: "SomethingNew" }))!.status).toBe("new");
  });

  it("müşteri adı yoksa yer tutucu kullanır", () => {
    const order = mapPackageToOrder(
      samplePackage({ customerFirstName: null, customerLastName: null })
    );
    expect(order!.customerName).toBe("Trendyol Müşterisi");
  });

  it("totalPrice yoksa toplamı kalemlerden hesaplar", () => {
    const order = mapPackageToOrder(samplePackage({ totalPrice: undefined }));
    expect(order!.totalAmount).toBe("1020");
  });
});
