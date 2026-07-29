import { describe, expect, it } from "vitest";
import {
  buildChannelRefIndex,
  planOrderBinding,
  resolveMasterByRef,
  type BindableItem,
  type ChannelRefRow,
} from "./orderBinding";

const row = (p: Partial<ChannelRefRow> = {}): ChannelRefRow => ({
  masterId: 1,
  listingId: 10,
  channelSku: "tren000042",
  channelBarcode: "2990000000426",
  ...p,
});

const item = (p: Partial<BindableItem> = {}): BindableItem => ({
  id: 100,
  orderId: 5,
  productName: "Candy Red 100 ML",
  channelRef: "2990000000426",
  masterId: null,
  ...p,
});

describe("buildChannelRefIndex", () => {
  it("hem SKU hem barkodu dizine alır", () => {
    const { index } = buildChannelRefIndex([row()]);
    expect(index.get("tren000042")).toEqual({ masterId: 1, listingId: 10 });
    expect(index.get("2990000000426")).toEqual({ masterId: 1, listingId: 10 });
  });

  it("boş kodları atlar", () => {
    const { index } = buildChannelRefIndex([row({ channelSku: "", channelBarcode: null })]);
    expect(index.size).toBe(0);
  });

  it("aynı kod farklı master'a düşerse ilk kayıt kazanır ve çakışma bildirilir", () => {
    const { index, conflicts } = buildChannelRefIndex([
      row(),
      row({ masterId: 2, listingId: 11, channelSku: "TREN000042", channelBarcode: null }),
    ]);
    expect(index.get("tren000042")).toMatchObject({ masterId: 1 });
    expect(conflicts).toContain("tren000042");
  });

  it("aynı master'ın ikinci ilanı çakışma sayılmaz", () => {
    const { conflicts } = buildChannelRefIndex([
      row(),
      row({ listingId: 11, channelBarcode: null }),
    ]);
    expect(conflicts).toEqual([]);
  });
});

describe("resolveMasterByRef", () => {
  const { index } = buildChannelRefIndex([row()]);

  it("kodu büyük/küçük harf ve boşluktan bağımsız bulur", () => {
    expect(resolveMasterByRef("  TREN000042 ", index)).toMatchObject({ masterId: 1 });
  });

  it("kod yoksa null", () => {
    expect(resolveMasterByRef(null, index)).toBeNull();
    expect(resolveMasterByRef("   ", index)).toBeNull();
  });

  it("tanınmayan kod null — yanlış master'a bağlanmaz", () => {
    expect(resolveMasterByRef("baska-kod", index)).toBeNull();
  });
});

describe("planOrderBinding", () => {
  const { index } = buildChannelRefIndex([row()]);

  it("kanal koduyla bağı yazar", () => {
    const plan = planOrderBinding({ items: [item()], index });
    expect(plan.updates).toEqual([{ itemId: 100, masterId: 1, listingId: 10 }]);
  });

  it("bağlı kalemi yeniden yazmaz — elle düzeltme korunur", () => {
    const plan = planOrderBinding({ items: [item({ masterId: 7 })], index });
    expect(plan.updates).toEqual([]);
    expect(plan.alreadyBound).toBe(1);
  });

  it("tanınmayan kodu ayrı raporlar", () => {
    const plan = planOrderBinding({ items: [item({ channelRef: "yok-123" })], index });
    expect(plan.updates).toEqual([]);
    expect(plan.unknownRefs[0]).toMatchObject({ itemId: 100, channelRef: "yok-123" });
  });

  it("kodsuz kalem elle bağlanacaklara düşer", () => {
    const plan = planOrderBinding({ items: [item({ channelRef: null })], index });
    expect(plan.noRef[0]).toMatchObject({ itemId: 100, productName: "Candy Red 100 ML" });
  });

  it("karışık partiyi doğru ayırır", () => {
    const plan = planOrderBinding({
      items: [
        item({ id: 1 }),
        item({ id: 2, masterId: 9 }),
        item({ id: 3, channelRef: "yok" }),
        item({ id: 4, channelRef: "" }),
      ],
      index,
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.alreadyBound).toBe(1);
    expect(plan.unknownRefs).toHaveLength(1);
    expect(plan.noRef).toHaveLength(1);
  });
});
