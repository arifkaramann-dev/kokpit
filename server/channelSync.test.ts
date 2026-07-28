import { describe, expect, it } from "vitest";
import {
  chunkItems,
  planChannelSync,
  toChannelPayload,
  type SyncChannelListing,
  type SyncMaster,
} from "./channelSync";

const master = (p: Partial<SyncMaster> = {}): SyncMaster => ({
  id: 1,
  status: "aktif",
  basePrice: 200,
  discountPercent: 0,
  buildableQty: 40,
  virtualStockCap: 10,
  ...p,
});

const listing = (p: Partial<SyncChannelListing> = {}): SyncChannelListing => ({
  id: 1,
  masterId: 1,
  channelId: 1,
  channelSku: "tren000042",
  channelBarcode: "2990000000426",
  price: 0,
  discountPercent: 0,
  pushedQty: 0,
  status: "taslak",
  ...p,
});

const base = { masters: [master()], channelId: 1 };

describe("planChannelSync — miktar", () => {
  it("kapasiteyi tavana kısar — pazaryerinde gereksiz stok gösterilmez", () => {
    const { items } = planChannelSync({ ...base, listings: [listing()] });
    expect(items[0].quantity).toBe(10);
  });

  it("kritik bölgede gerçek kapasiteyi gönderir", () => {
    const { items } = planChannelSync({
      ...base,
      masters: [master({ buildableQty: 3 })],
      listings: [listing()],
    });
    expect(items[0].quantity).toBe(3);
  });

  it("üretilemeyen ürün 0 gönderilir — ilan kapanır", () => {
    const { items } = planChannelSync({
      ...base,
      masters: [master({ buildableQty: 0 })],
      listings: [listing()],
    });
    expect(items[0].quantity).toBe(0);
  });

  it("arşiv ürün stoğu sıfırlanır ama ilan silinmez", () => {
    const { items } = planChannelSync({
      ...base,
      masters: [master({ status: "arsiv" })],
      listings: [listing()],
    });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(0);
  });
});

describe("planChannelSync — fiyat", () => {
  it("kanal fiyatı yoksa taban fiyat kullanılır", () => {
    const { items } = planChannelSync({ ...base, listings: [listing()] });
    expect(items[0].listPrice).toBe(200);
  });

  it("kanala özel fiyat tabanı ezer", () => {
    const { items } = planChannelSync({ ...base, listings: [listing({ price: 250 })] });
    expect(items[0].listPrice).toBe(250);
  });

  it("indirim satış fiyatına yansır", () => {
    const { items } = planChannelSync({
      ...base,
      listings: [listing({ price: 250, discountPercent: 20 })],
    });
    expect(items[0].salePrice).toBe(200);
  });

  it("kanal fiyatı yoksa master indirimi uygulanır", () => {
    const { items } = planChannelSync({
      ...base,
      masters: [master({ discountPercent: 10 })],
      listings: [listing()],
    });
    expect(items[0].salePrice).toBe(180);
  });

  it("fiyatsız yayın gönderilmez ve sebebi bildirilir", () => {
    const { items, skipped } = planChannelSync({
      ...base,
      masters: [master({ basePrice: 0 })],
      listings: [listing()],
    });
    expect(items).toHaveLength(0);
    expect(skipped[0].reason).toBe("Fiyat girilmemiş");
  });
});

describe("planChannelSync — atlama sebepleri", () => {
  it("durdurulan yayın gönderilmez", () => {
    const { skipped } = planChannelSync({ ...base, listings: [listing({ status: "durduruldu" })] });
    expect(skipped[0].reason).toBe("Yayın durdurulmuş");
  });

  it("barkodsuz yayın gönderilmez", () => {
    const { skipped } = planChannelSync({ ...base, listings: [listing({ channelBarcode: "" })] });
    expect(skipped[0].reason).toBe("Pazaryeri barkodu yok");
  });

  it("başka kanalın yayını dahil edilmez", () => {
    const { items, skipped } = planChannelSync({
      ...base,
      listings: [listing({ channelId: 2 })],
    });
    expect(items).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });
});

describe("toChannelPayload — her pazaryeri farklı alan bekler", () => {
  const item = {
    channelListingId: 1,
    channelSku: "tren000042",
    barcode: "2990000000426",
    quantity: 10,
    listPrice: 250,
    salePrice: 200,
  };

  it("Trendyol barkodla eşleşir", () => {
    expect(toChannelPayload("trendyol", item)).toEqual({
      barcode: "2990000000426",
      quantity: 10,
      listPrice: 250,
      salePrice: 200,
    });
  });

  it("Hepsiburada merchantSku ile eşleşir", () => {
    expect(toChannelPayload("hepsiburada", item)).toEqual({
      merchantSku: "tren000042",
      price: 200,
      availableStock: 10,
    });
  });

  it("N11 ve Çiçeksepeti satıcı kodu kullanır", () => {
    expect(toChannelPayload("n11", item)).toMatchObject({ sellerStockCode: "tren000042" });
    expect(toChannelPayload("ciceksepeti", item)).toMatchObject({ stockCode: "tren000042" });
  });

  it("bilinmeyen kanal null döner", () => {
    expect(toChannelPayload("bilinmeyen", item)).toBeNull();
  });
});

describe("chunkItems", () => {
  it("büyük partiyi böler — tek hata hepsini düşürmesin", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("küçük liste tek parça kalır", () => {
    expect(chunkItems([1, 2], 10)).toEqual([[1, 2]]);
  });
  it("boş liste boş döner", () => {
    expect(chunkItems([], 10)).toEqual([]);
  });
});
