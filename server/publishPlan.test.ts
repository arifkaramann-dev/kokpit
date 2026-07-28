import { describe, expect, it } from "vitest";
import {
  planPublications,
  summarizeSkips,
  type PublishListing,
  type PublishMaster,
} from "./publishPlan";

const master = (p: Partial<PublishMaster> = {}): PublishMaster => ({
  id: 1,
  status: "aktif",
  basePrice: 120,
  buildableQty: 10,
  ...p,
});

const listing = (p: Partial<PublishListing> = {}): PublishListing => ({
  id: 1,
  masterId: 1,
  useCaseId: 10,
  status: "aktif",
  hasContent: true,
  ...p,
});

const categoryOf = new Map([
  [10, "kat-3d"],
  [11, "kat-balik"],
  [12, "kat-3d"], // PLA ve PETG aynı kategoriye düşerse mükerrer olur
]);

const base = { masters: [master()], existing: [], channelId: 1, categoryOf };

describe("planPublications", () => {
  it("uygun ilanı yayına alır", () => {
    const plan = planPublications({ ...base, listings: [listing()] });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ channelCategoryId: "kat-3d", price: 120 });
  });

  it("aynı kanalda ikinci kez açmaz", () => {
    const plan = planPublications({
      ...base,
      listings: [listing()],
      existing: [{ listingId: 1, masterId: 1, channelId: 1, channelCategoryId: "kat-3d" }],
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.skip[0].reason).toBe("zaten_yayinda");
  });

  it("başka kanaldaki yayın engel değil", () => {
    const plan = planPublications({
      ...base,
      listings: [listing()],
      existing: [{ listingId: 1, masterId: 1, channelId: 2, channelCategoryId: "kat-3d" }],
    });
    expect(plan.create).toHaveLength(1);
  });

  it("aynı master aynı kategoride ikinci ilan açamaz — mükerrer ilan kilidi", () => {
    // 10 ve 12 aynı kategoriye düşüyor
    const plan = planPublications({
      ...base,
      listings: [listing({ id: 1, useCaseId: 10 }), listing({ id: 2, useCaseId: 12 })],
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.skip.find(s => s.listingId === 2)?.reason).toBe("kategori_dolu");
  });

  it("farklı kategori meşru — yan yana durabilir", () => {
    const plan = planPublications({
      ...base,
      listings: [listing({ id: 1, useCaseId: 10 }), listing({ id: 2, useCaseId: 11 })],
    });
    expect(plan.create).toHaveLength(2);
  });

  it("var olan kategori doluluğunu da sayar", () => {
    const plan = planPublications({
      ...base,
      listings: [listing({ id: 2, useCaseId: 12 })],
      existing: [{ listingId: 99, masterId: 1, channelId: 1, channelCategoryId: "kat-3d" }],
    });
    expect(plan.skip[0].reason).toBe("kategori_dolu");
  });

  it("içeriksiz ilan gönderilmez", () => {
    const plan = planPublications({ ...base, listings: [listing({ hasContent: false })] });
    expect(plan.skip[0].reason).toBe("icerik_yok");
  });

  it("fiyatsız ürün gönderilmez", () => {
    const plan = planPublications({
      ...base,
      masters: [master({ basePrice: 0 })],
      listings: [listing()],
    });
    expect(plan.skip[0].reason).toBe("fiyat_yok");
  });

  it("üretilemeyen ürün varsayılan olarak atlanır", () => {
    const plan = planPublications({
      ...base,
      masters: [master({ buildableQty: 0 })],
      listings: [listing()],
    });
    expect(plan.skip[0].reason).toBe("master_pasif");
  });

  it("includeUnbuildable ile üretilemeyen de yayınlanabilir", () => {
    const plan = planPublications({
      ...base,
      masters: [master({ buildableQty: 0 })],
      listings: [listing()],
      includeUnbuildable: true,
    });
    expect(plan.create).toHaveLength(1);
  });

  it("kategori eşlemesi yoksa atlar — kategorisiz ilan açılamaz", () => {
    const plan = planPublications({ ...base, listings: [listing({ useCaseId: 999 })] });
    expect(plan.skip[0].reason).toBe("kategori_eslesmesi_yok");
  });

  it("arşiv ilan ve arşiv master atlanır", () => {
    expect(
      planPublications({ ...base, listings: [listing({ status: "arsiv" })] }).skip[0].reason,
    ).toBe("ilan_arsiv");
    expect(
      planPublications({ ...base, masters: [master({ status: "arsiv" })], listings: [listing()] })
        .skip[0].reason,
    ).toBe("master_pasif");
  });

  it("aynı planda iki kez çalıştırmak mükerrer üretmez", () => {
    const first = planPublications({ ...base, listings: [listing()] });
    const second = planPublications({
      ...base,
      listings: [listing()],
      existing: first.create.map(c => ({
        listingId: c.listingId,
        masterId: c.masterId,
        channelId: c.channelId,
        channelCategoryId: c.channelCategoryId,
      })),
    });
    expect(second.create).toHaveLength(0);
  });
});

describe("summarizeSkips", () => {
  it("sebepleri sayar ve çoktan aza sıralar", () => {
    const rows = summarizeSkips([
      { listingId: 1, reason: "fiyat_yok" },
      { listingId: 2, reason: "fiyat_yok" },
      { listingId: 3, reason: "icerik_yok" },
    ]);
    expect(rows[0]).toEqual({ reason: "Fiyat girilmemiş", count: 2 });
    expect(rows[1].count).toBe(1);
  });
});
