import { describe, expect, it } from "vitest";
import { classifyMarketplaceStatus, shouldSyncOrderStatus, type SyncStatus } from "./orderUtils";
import { mapHbOrder, mapHbPackage } from "./hepsiburada";

describe("classifyMarketplaceStatus (dayanıklı durum eşlemesi)", () => {
  const map: Record<string, SyncStatus | null> = {
    Open: "new",
    Shipped: "ready",
    Delivered: "done",
    Cancelled: null,
    ReadyToShip: "ready",
  };

  it("bilinen kodu birebir eşler", () => {
    expect(classifyMarketplaceStatus("Shipped", map)).toBe("ready");
    expect(classifyMarketplaceStatus("Delivered", map)).toBe("done");
    expect(classifyMarketplaceStatus("Cancelled", map)).toBeNull();
  });

  it("büyük/küçük harf ve boşluk/tire/alt çizgi farkını yok sayar", () => {
    expect(classifyMarketplaceStatus("shipped", map)).toBe("ready");
    expect(classifyMarketplaceStatus("SHIPPED", map)).toBe("ready");
    expect(classifyMarketplaceStatus("ready_to_ship", map)).toBe("ready");
    expect(classifyMarketplaceStatus("Ready-To-Ship", map)).toBe("ready");
  });

  it("haritada olmayan kodu anahtar kelimeyle sınıflar (asıl hata buydu)", () => {
    // Pazaryeri beklenmedik bir kod yollasa bile kargolanan sipariş "Yeni"de kalmaz.
    expect(classifyMarketplaceStatus("CargoInProgress", map)).toBe("ready");
    expect(classifyMarketplaceStatus("InTransit", map)).toBe("ready");
    expect(classifyMarketplaceStatus("Kargoya Verildi", map)).toBe("ready");
    expect(classifyMarketplaceStatus("TeslimEdildi", map)).toBe("done");
    expect(classifyMarketplaceStatus("Müşteri İptal", map)).toBeNull();
    expect(classifyMarketplaceStatus("İade Talebi", map)).toBeNull();
  });

  it("gerçekten tanınmayan kodu güvenli tarafta 'new' varsayar", () => {
    expect(classifyMarketplaceStatus("Foobar", map)).toBe("new");
    expect(classifyMarketplaceStatus("Preparing", map)).toBe("new");
  });
});

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

  it("kargolanan sipariş 'Kargoya Hazır'a, teslim edilen 'Tamamlandı'ya gider", () => {
    // Bildirilen hata: kargolanan Hepsiburada siparişi "Yeni"de takılı kalıyordu.
    expect(mapHbOrder({ ...sample, status: "Shipped" })!.status).toBe("ready");
    expect(mapHbOrder({ ...sample, status: "shipped" })!.status).toBe("ready"); // harf duyarsız
    expect(mapHbOrder({ ...sample, status: "CargoInProgress" })!.status).toBe("ready"); // haritada yok → kelime
    expect(mapHbOrder({ ...sample, status: "Delivered" })!.status).toBe("done");
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
