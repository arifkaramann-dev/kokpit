import { describe, expect, it } from "vitest";
import {
  mapToTrendyolCards,
  type CardChannelListing,
  type CardListing,
  type CardMaster,
} from "./cardMapping";

const master = (p: Partial<CardMaster> = {}): CardMaster => ({
  id: 1,
  baseCode: "aoccndred1822",
  internalSku: "aoccndred1822ab100",
  status: "aktif",
  basePrice: 200,
  discountPercent: 0,
  buildableQty: 25,
  virtualStockCap: 10,
  desi: 1,
  vatRate: 20,
  seriesId: 1,
  colorId: 12,
  familyId: 3,
  packagingId: 7,
  volumeMl: 100,
  ...p,
});

const listing = (p: Partial<CardListing> = {}): CardListing => ({
  id: 10,
  masterId: 1,
  useCaseId: 2,
  title: "Artofcolour Candy Red 3D Baskı Boyası 100 ML PET",
  shortDescription: "Kısa açıklama",
  longDescription: "<p>Uzun açıklama</p>",
  imageUrls: ["https://cdn/1.jpg"],
  ...p,
});

const cl = (p: Partial<CardChannelListing> = {}): CardChannelListing => ({
  id: 100,
  listingId: 10,
  masterId: 1,
  channelSku: "tren000042",
  channelBarcode: "2990000000426",
  channelCategoryId: "1234",
  groupKey: null,
  price: 0,
  discountPercent: 0,
  ...p,
});

const settings = {
  brandId: 777,
  cargoCompanyId: 10,
  attributeDefaults: { "1234": [{ attributeId: 5, attributeValueId: 9 }] },
};

const base = { listings: [listing()], masters: [master()], settings };

describe("mapToTrendyolCards", () => {
  it("geçerli yayını kart kalemine çevirir", () => {
    const { items, problems } = mapToTrendyolCards({ ...base, channelListings: [cl()] });
    expect(problems).toEqual([]);
    expect(items[0]).toMatchObject({
      barcode: "2990000000426",
      stockCode: "tren000042",
      categoryId: 1234,
      brandId: 777,
      quantity: 10,
      listPrice: 200,
      currencyType: "TRY",
    });
  });

  it("miktarı sanal tavana kısar", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      masters: [master({ buildableQty: 400 })],
      channelListings: [cl()],
    });
    expect(items[0].quantity).toBe(10);
  });

  it("aynı grup anahtarını paylaşanlar tek ilanda toplanır", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      listings: [listing({ id: 10 }), listing({ id: 11, masterId: 2 })],
      masters: [master(), master({ id: 2, internalSku: "aoccndred1822ab500" })],
      channelListings: [
        cl({ id: 100, listingId: 10, masterId: 1 }),
        cl({ id: 101, listingId: 11, masterId: 2, channelBarcode: "2990000000433", channelSku: "tren000043" }),
      ],
    });
    // İkisi de aynı temel koddan → aynı productMainId
    expect(items).toHaveLength(2);
    expect(items[0].productMainId).toBe(items[1].productMainId);
  });

  it("groupKey temel kodu ezer", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      channelListings: [cl({ groupKey: "OZEL-GRUP" })],
    });
    expect(items[0].productMainId).toBe("OZEL-GRUP");
  });

  it("indirim satış fiyatına yansır", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      channelListings: [cl({ price: 250, discountPercent: 20 })],
    });
    expect(items[0]).toMatchObject({ listPrice: 250, salePrice: 200 });
  });

  it("uzun açıklama yoksa kısaya düşer", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      listings: [listing({ longDescription: null })],
      channelListings: [cl()],
    });
    expect(items[0].description).toBe("Kısa açıklama");
  });

  it("başlığı 100 karaktere kısar", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      listings: [listing({ title: "x".repeat(150) })],
      channelListings: [cl()],
    });
    expect(items[0].title).toHaveLength(100);
  });
});

describe("mapToTrendyolCards — özellikler master'dan", () => {
  const defs = {
    "1234": [
      {
        attributeId: 47,
        attributeName: "Renk",
        source: "renk" as const,
        constantValueId: null,
        constantText: null,
        isRequired: true,
      },
      {
        attributeId: 70,
        attributeName: "Hacim",
        source: "hacim" as const,
        constantValueId: null,
        constantText: null,
        isRequired: true,
      },
    ],
  };
  const values = [
    {
      attributeId: 47,
      dimensionKind: "renk" as const,
      dimensionId: 12,
      attributeValueId: 4521,
      attributeText: null,
    },
    {
      attributeId: 47,
      dimensionKind: "renk" as const,
      dimensionId: 13,
      attributeValueId: 4600,
      attributeText: null,
    },
  ];

  it("küp eşlemesi varsa sabit listeyi ezer", () => {
    const { items, problems } = mapToTrendyolCards({
      ...base,
      channelListings: [cl()],
      attributeDefs: defs,
      attributeValues: values,
    });
    expect(problems).toEqual([]);
    expect(items[0].attributes).toEqual([
      { attributeId: 47, attributeValueId: 4521 },
      { attributeId: 70, customAttributeValue: "100 ml" },
    ]);
  });

  it("farklı renkteki master farklı özellik değeri alır", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      masters: [master({ colorId: 13 })],
      channelListings: [cl()],
      attributeDefs: defs,
      attributeValues: values,
    });
    expect(items[0].attributes).toContainEqual({ attributeId: 47, attributeValueId: 4600 });
  });

  it("eşleme tanımlı değilse eski sabit liste kullanılır", () => {
    const { items, problems } = mapToTrendyolCards({ ...base, channelListings: [cl()] });
    expect(problems).toEqual([]);
    expect(items[0].attributes).toEqual([{ attributeId: 5, attributeValueId: 9 }]);
  });
});

describe("mapToTrendyolCards — eksikler adıyla bildirilir", () => {
  const cases: [string, Parameters<typeof mapToTrendyolCards>[0], string][] = [
    [
      "açıklama boş",
      { ...base, listings: [listing({ longDescription: null, shortDescription: null })], channelListings: [cl()] },
      "açıklama boş",
    ],
    [
      "görsel yok",
      { ...base, listings: [listing({ imageUrls: [] })], channelListings: [cl()] },
      "görsel yok",
    ],
    [
      "barkod yok",
      { ...base, channelListings: [cl({ channelBarcode: "" })] },
      "barkodu yok",
    ],
    [
      "kategori yok",
      { ...base, channelListings: [cl({ channelCategoryId: null })] },
      "kategori eşlemesi yok",
    ],
    [
      "fiyat yok",
      { ...base, masters: [master({ basePrice: 0 })], channelListings: [cl()] },
      "fiyat girilmemiş",
    ],
    [
      "üretilemiyor",
      { ...base, masters: [master({ buildableQty: 0 })], channelListings: [cl()] },
      "üretilemiyor",
    ],
    [
      "arşiv",
      { ...base, masters: [master({ status: "arsiv" })], channelListings: [cl()] },
      "arşivde",
    ],
    [
      "kategori özelliği tanımsız",
      {
        ...base,
        settings: { ...settings, attributeDefaults: {} },
        channelListings: [cl()],
      },
      "zorunlu özellikler tanımlanmamış",
    ],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      const { items, problems } = mapToTrendyolCards(input);
      expect(items).toHaveLength(0);
      expect(problems[0]).toContain(expected);
    });
  }

  it("küp eşlemesi eksikse kalem adıyla bildirilir — yanlış renk gitmez", () => {
    const { items, problems } = mapToTrendyolCards({
      ...base,
      channelListings: [cl()],
      attributeDefs: {
        "1234": [
          {
            attributeId: 47,
            attributeName: "Renk",
            source: "renk",
            constantValueId: null,
            constantText: null,
            isRequired: true,
          },
        ],
      },
      attributeValues: [],
    });
    expect(items).toHaveLength(0);
    expect(problems[0]).toContain("Renk");
  });

  it("includeUnbuildable ile üretilemeyen de gönderilir", () => {
    const { items } = mapToTrendyolCards({
      ...base,
      masters: [master({ buildableQty: 0 })],
      channelListings: [cl()],
      includeUnbuildable: true,
    });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(0);
  });
});
