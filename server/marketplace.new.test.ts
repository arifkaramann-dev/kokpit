import { describe, expect, it } from "vitest";
import { mapN11Order } from "./n11";
import { mapCsOrder } from "./ciceksepeti";

describe("mapN11Order", () => {
  it("geçerli siparişi yerel kayda çevirir, barkod/SKU eşleşmesi", () => {
    const m = mapN11Order({
      orderNumber: 12345,
      status: "Approved",
      buyerName: "Ali Veli",
      totalAmount: 216,
      lines: [{ productName: "Sprey Astar", quantity: 2, price: 108, gtin: "aoc1" }],
    });
    expect(m).not.toBeNull();
    expect(m!.orderNo).toBe("N11-12345");
    expect(m!.channel).toBe("n11");
    expect(m!.status).toBe("new");
    expect(m!.paymentStatus).toBe("paid");
    expect(m!.items[0].barcode).toBe("aoc1");
    expect(m!.items[0].unitPrice).toBe(108);
  });

  it("iptal/iade durumu null döner (içe aktarılmaz)", () => {
    expect(mapN11Order({ orderNumber: 1, status: "Cancelled", lines: [] })).toBeNull();
    expect(mapN11Order({ orderNumber: 2, status: "Returned", lines: [] })).toBeNull();
  });

  it("sipariş no yoksa null", () => {
    expect(mapN11Order({ status: "New", lines: [] })).toBeNull();
  });

  it("birim fiyat yoksa sellerInvoiceAmount/adet'ten türetir", () => {
    const m = mapN11Order({
      orderNumber: 9,
      status: "New",
      lines: [{ productName: "X", quantity: 4, sellerInvoiceAmount: 400 }],
    });
    expect(m!.items[0].unitPrice).toBe(100);
  });

  it("Shipped → ready, Delivered → done", () => {
    expect(mapN11Order({ orderNumber: 1, status: "Shipped", lines: [] })!.status).toBe("ready");
    expect(mapN11Order({ orderNumber: 2, status: "Delivered", lines: [] })!.status).toBe("done");
  });
});

describe("mapCsOrder (Çiçeksepeti)", () => {
  it("geçerli siparişi çevirir, alternatif alan adları", () => {
    const m = mapCsOrder({
      orderId: "CS-777",
      orderStatus: "Onaylandı",
      receiverName: "Ayşe Yılmaz",
      totalPrice: 150,
      orderItems: [{ name: "Rötuş Kalemi", quantity: 1, unitPrice: 150, barcode: "cs1" }],
    });
    expect(m).not.toBeNull();
    expect(m!.orderNo).toBe("CS-CS-777");
    expect(m!.channel).toBe("ciceksepeti");
    expect(m!.status).toBe("new");
    expect(m!.items[0].barcode).toBe("cs1");
  });

  it("Türkçe iptal durumu null", () => {
    expect(mapCsOrder({ orderNumber: 5, status: "İptal", items: [] })).toBeNull();
  });

  it("Kargolandı → ready, TeslimEdildi → done", () => {
    expect(mapCsOrder({ orderNumber: 1, status: "Kargolandı", items: [] })!.status).toBe("ready");
    expect(mapCsOrder({ orderNumber: 2, status: "TeslimEdildi", items: [] })!.status).toBe("done");
  });

  it("totalPrice yoksa kalemlerden toplar", () => {
    const m = mapCsOrder({
      orderNumber: 3,
      status: "New",
      items: [{ name: "A", quantity: 2, unitPrice: 50 }],
    });
    expect(m!.totalAmount).toBe("100");
  });
});
