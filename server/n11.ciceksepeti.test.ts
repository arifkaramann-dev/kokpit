import { describe, expect, it } from "vitest";
import { mapCsOrder } from "./ciceksepeti";
import { mapN11Order } from "./n11";

describe("N11 sipariş → yerel kayıt eşlemesi", () => {
  it("temel alanları doğru eşler", () => {
    const o = mapN11Order({
      orderNumber: "5551234",
      status: "New",
      buyerName: "Mehmet Demir",
      totalAmount: 940,
      lines: [
        { productName: "Airbrush Mavi 100ml", quantity: 2, unitPrice: 320 },
        { productName: "Vernik", quantity: 1, unitPrice: 300 },
      ],
    });
    expect(o).not.toBeNull();
    expect(o!.orderNo).toBe("N11-5551234");
    expect(o!.customerName).toBe("Mehmet Demir");
    expect(o!.channel).toBe("n11");
    expect(o!.status).toBe("new");
    expect(o!.totalAmount).toBe("940");
    expect(o!.items).toHaveLength(2);
    expect(o!.items[0]).toEqual({ productName: "Airbrush Mavi 100ml", quantity: 2, unitPrice: 320 });
  });

  it("iptal/iade siparişi içe aktarmaz (null döner)", () => {
    expect(mapN11Order({ orderNumber: "1", status: "Cancelled" })).toBeNull();
    expect(mapN11Order({ orderNumber: "2", status: "Returned" })).toBeNull();
  });

  it("sipariş numarası yoksa null döner", () => {
    expect(mapN11Order({ status: "New" })).toBeNull();
  });

  it("totalAmount yoksa kalemlerden toplar", () => {
    const o = mapN11Order({
      orderNumber: "9",
      status: "New",
      lines: [{ productName: "X", quantity: 3, unitPrice: 100 }],
    });
    expect(o!.totalAmount).toBe("300");
  });
});

describe("Çiçeksepeti sipariş → yerel kayıt eşlemesi", () => {
  it("temel alanları doğru eşler", () => {
    const o = mapCsOrder({
      orderNumber: "CS-778899",
      orderStatus: "New",
      receiverName: "Zeynep Kaya",
      totalPrice: 500,
      products: [{ productName: "Hobi Boya Seti", quantity: 1, unitPrice: 500 }],
    });
    expect(o).not.toBeNull();
    expect(o!.orderNo).toBe("CS-CS-778899");
    expect(o!.customerName).toBe("Zeynep Kaya");
    expect(o!.channel).toBe("ciceksepeti");
    expect(o!.status).toBe("new");
    expect(o!.totalAmount).toBe("500");
  });

  it("teslim edilen sipariş 'done' olur", () => {
    const o = mapCsOrder({
      orderNumber: "1",
      orderStatus: "Delivered",
      products: [{ productName: "X", quantity: 1, unitPrice: 10 }],
    });
    expect(o!.status).toBe("done");
  });

  it("iptal siparişi null döner", () => {
    expect(mapCsOrder({ orderNumber: "1", orderStatus: "Cancelled" })).toBeNull();
  });
});
