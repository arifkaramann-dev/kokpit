import { describe, expect, it } from "vitest";
import {
  buildStoreProduct,
  buildStorefront,
  type StoreListing,
  type StoreMaster,
  type StorePublication,
} from "./storefrontCatalog";

const master = (p: Partial<StoreMaster> = {}): StoreMaster => ({
  id: 1,
  seriesId: 5,
  colorId: 12,
  familyId: 3,
  packagingId: 100,
  baseCode: "aoccndred1822",
  internalSku: "aoccndred1822ab100",
  status: "aktif",
  basePrice: 200,
  discountPercent: 0,
  buildableQty: 20,
  stockQty: 0,
  ...p,
});

const listing = (p: Partial<StoreListing> = {}): StoreListing => ({
  id: 10,
  masterId: 1,
  isPrimary: true,
  title: "Candy Red Airbrush Boyası",
  slug: "candy-red",
  shortDescription: "Kısa",
  longDescription: "Uzun",
  applicationText: "Uygulama",
  status: "aktif",
  ...p,
});

const pub = (p: Partial<StorePublication> = {}): StorePublication => ({
  listingId: 10,
  masterId: 1,
  price: 0,
  discountPercent: 0,
  status: "canli",
  ...p,
});

const ctx = {
  colors: new Map([[12, { name: "Candy Red", hex: "#c00" }]]),
  packagings: new Map([
    [100, { name: "100 ML PET", volumeMl: 100 }],
    [500, { name: "500 ML PET", volumeMl: 500 }],
  ]),
  series: new Map([[5, "CANDY"]]),
  imagesOf: new Map([[1, ["a.jpg"]]]),
};

const base = { masters: [master()], listings: [listing()], publications: [pub()], ...ctx };

describe("buildStorefront", () => {
  it("yayınlanmış ürünü karta çevirir", () => {
    const [g] = buildStorefront(base);
    expect(g).toMatchObject({
      id: 1,
      name: "Candy Red Airbrush Boyası",
      series: "CANDY",
      colorName: "Candy Red",
      minPrice: 200,
      inStock: true,
    });
    expect(g.imageUrls).toEqual(["a.jpg"]);
  });

  it("aynı rengin ambalajlarını tek kartta seçenek yapar", () => {
    const [g] = buildStorefront({
      ...ctx,
      masters: [master(), master({ id: 2, packagingId: 500, basePrice: 600 })],
      listings: [listing(), listing({ id: 11, masterId: 2, isPrimary: false })],
      publications: [pub(), pub({ listingId: 11, masterId: 2 })],
    });
    expect(g.options).toHaveLength(2);
    expect(g.options.map(o => o.volumeMl)).toEqual([100, 500]);
    expect(g).toMatchObject({ minPrice: 200, maxPrice: 600 });
  });

  it("farklı renk ayrı kart olur", () => {
    const groups = buildStorefront({
      ...ctx,
      colors: new Map([
        [12, { name: "Candy Red", hex: "#c00" }],
        [13, { name: "Candy Blue", hex: "#00c" }],
      ]),
      masters: [master(), master({ id: 2, colorId: 13 })],
      listings: [listing(), listing({ id: 11, masterId: 2, title: "Candy Blue" })],
      publications: [pub(), pub({ listingId: 11, masterId: 2 })],
    });
    expect(groups).toHaveLength(2);
  });

  it("taslak yayın vitrine çıkmaz", () => {
    expect(buildStorefront({ ...base, publications: [pub({ status: "taslak" })] })).toEqual([]);
  });

  it("durdurulan yayın vitrine çıkmaz", () => {
    expect(buildStorefront({ ...base, publications: [pub({ status: "durduruldu" })] })).toEqual([]);
  });

  it("taslak ürün vitrine çıkmaz — hazırlanan kart müşteriye görünmemeli", () => {
    expect(buildStorefront({ ...base, masters: [master({ status: "taslak" })] })).toEqual([]);
  });

  it("fiyatsız ürün vitrine çıkmaz", () => {
    expect(buildStorefront({ ...base, masters: [master({ basePrice: 0 })] })).toEqual([]);
  });

  it("kanal fiyatı taban fiyatı ezer", () => {
    const [g] = buildStorefront({ ...base, publications: [pub({ price: 250 })] });
    expect(g.minPrice).toBe(250);
  });

  it("indirim net fiyata yansır", () => {
    const [g] = buildStorefront({
      ...base,
      publications: [pub({ price: 250, discountPercent: 20 })],
    });
    expect(g.options[0].netPrice).toBe(200);
  });

  it("stok yok ama üretilebiliyorsa satılabilir — siparişe göre üretim", () => {
    const [g] = buildStorefront({
      ...base,
      masters: [master({ stockQty: 0, buildableQty: 5 })],
    });
    expect(g.inStock).toBe(true);
  });

  it("ne stok ne kapasite varsa tükendi görünür", () => {
    const [g] = buildStorefront({
      ...base,
      masters: [master({ stockQty: 0, buildableQty: 0 })],
    });
    expect(g.inStock).toBe(false);
  });

  it("aynı ambalajın ikinci ilanı seçeneği çoğaltmaz", () => {
    const [g] = buildStorefront({
      ...ctx,
      masters: [master()],
      listings: [listing(), listing({ id: 11, isPrimary: false })],
      publications: [pub(), pub({ listingId: 11 })],
    });
    expect(g.options).toHaveLength(1);
  });

  it("kart içeriği birincil ilandan gelir", () => {
    const [g] = buildStorefront({
      ...ctx,
      masters: [master(), master({ id: 2, packagingId: 500 })],
      listings: [
        listing({ id: 11, masterId: 2, isPrimary: false, title: "İkincil" }),
        listing({ id: 10, masterId: 1, isPrimary: true, title: "Birincil" }),
      ],
      publications: [pub({ listingId: 11, masterId: 2 }), pub()],
    });
    expect(g.name).toBe("Birincil");
  });
});

describe("buildStoreProduct", () => {
  const groups = buildStorefront(base);

  it("ürünün kartını ve tam metnini döner", () => {
    const p = buildStoreProduct({ masterId: 1, groups, listings: [listing()] });
    expect(p).toMatchObject({ name: "Candy Red Airbrush Boyası", description: "Uzun" });
  });

  it("vitrinde olmayan ürün null döner", () => {
    expect(buildStoreProduct({ masterId: 99, groups, listings: [listing()] })).toBeNull();
  });
});
