import { describe, expect, it } from "vitest";
import { shouldSyncOrderStatus } from "./orderUtils";
import { mapHbOrder, mapHbPackage } from "./hepsiburada";

describe("shouldSyncOrderStatus (pazaryeri senkronu durum akışı)", () => {
  it("durum yalnızca ileri akar", () => {
    expect(shouldSyncOrderStatus("new", "ready")).toBe(true);
    expect(shouldSyncOrderStatus("new", "done")).toBe(true);
    expect(shouldSyncOrderStatus("production", "ready")).toBe(true);
    expect(shouldSyncOrderStatus("ready", "done")).toBe(true);
  });

  it("geriye taşımaz — elle 'Üretimde'ye alınan sipariş 'Yeni'ye basılmaz", () => {
    expect(shouldSyncOrderStatus("production", "new")).toBe(false);
    expect(shouldSyncOrderStatus("ready", "new")).toBe(false);
    expect(shouldSyncOrderStatus("done", "ready")).toBe(false);
    expect(shouldSyncOrderStatus("done", "new")).toBe(false);
  });

  it("aynı durum için güncelleme gerekmez", () => {
    expect(shouldSyncOrderStatus("ready", "ready")).toBe(false);
    expect(shouldSyncOrderStatus("new", "new")).toBe(false);
  });

  it("iptal edilmiş sipariş pazaryerinde aktifse geri açılır", () => {
    expect(shouldSyncOrderStatus("cancelled", "new")).toBe(true);
    expect(shouldSyncOrderStatus("cancelled", "ready")).toBe(true);
  });
});

describe("mapHbOrder (Hepsiburada sipariş eşlemesi)", () => {
  const sample = {
    orderNumber: "123456789",
    status: "Open",
    customerName: "Ayşe Yılmaz",
    totalPrice: { amount: 540 },
    items: [{ productName: "Sprey Vernik", quantity: 2, unitPrice: { amount: 270 }, merchantSku: "AOC-001" }],
  };

  it("pazaryeri siparişi 'ödendi' sayılır — alacaklara girmez (Trendyol ile aynı kural)", () => {
    const order = mapHbOrder(sample);
    expect(order).not.toBeNull();
    expect(order!.paymentStatus).toBe("paid");
  });

  it("temel alanları doğru eşler", () => {
    const order = mapHbOrder(sample)!;
    expect(order.orderNo).toBe("HB-123456789");
    expect(order.channel).toBe("hepsiburada");
    expect(order.status).toBe("new");
    expect(order.totalAmount).toBe("540");
    expect(order.items[0]).toEqual({
      productName: "Sprey Vernik",
      quantity: 2,
      unitPrice: 270,
      barcode: "AOC-001",
    });
  });

  it("iptal ve iadeleri içe aktarmaz", () => {
    expect(mapHbOrder({ ...sample, status: "Cancelled" })).toBeNull();
    expect(mapHbOrder({ ...sample, status: "Returned" })).toBeNull();
  });
});

describe("mapHbPackage (Hepsiburada paket → sipariş; canlıda /packages ucu)", () => {
  // Canlı /packages yanıtından sadeleştirilmiş gerçek paket.
  const pkg = {
    packageNumber: "5498289635",
    status: "Open",
    recipientName: "Çağatay Turan",
    totalPrice: { amount: 350 },
    items: [
      {
        productName: "Art Of Colour Opel 40R Olimpik Beyaz Rötuş Kalemi 2li Set",
        merchantSku: "RTŞ207",
        productBarcode: "00000aocrt203",
        hbSku: "HBCV000049Q7IY",
        quantity: 1,
        price: { amount: 350 },
        totalPrice: { amount: 350 },
        orderNumber: "4713035922",
      },
    ],
  };

  it("paket kalemlerini panoya doğru eşler (ad, adet, fiyat, barkod)", () => {
    const order = mapHbPackage(pkg)!;
    expect(order).not.toBeNull();
    expect(order.orderNo).toBe("HB-5498289635");
    expect(order.channel).toBe("hepsiburada");
    expect(order.status).toBe("new"); // Open → new
    expect(order.customerName).toBe("Çağatay Turan");
    expect(order.totalAmount).toBe("350");
    expect(order.items[0]).toEqual({
      productName: "Art Of Colour Opel 40R Olimpik Beyaz Rötuş Kalemi 2li Set",
      quantity: 1,
      unitPrice: 350,
      barcode: "00000aocrt203", // productBarcode katalog eşlemesi için
    });
  });

  it("iptal paketini içe aktarmaz", () => {
    expect(mapHbPackage({ ...pkg, status: "Cancelled" })).toBeNull();
  });
});
