import { describe, expect, it } from "vitest";
import {
  buildAttributes,
  formatVolume,
  guessSource,
  resolveImages,
  resolveLogistics,
  type ChannelAttributeDef,
  type ChannelAttributeValueMap,
} from "./masterFields";

const master = { seriesId: 1, colorId: 12, familyId: 3, packagingId: 7, volumeMl: 100 };

const def = (p: Partial<ChannelAttributeDef> = {}): ChannelAttributeDef => ({
  attributeId: 47,
  attributeName: "Renk",
  source: "renk",
  constantValueId: null,
  constantText: null,
  isRequired: true,
  ...p,
});

const val = (p: Partial<ChannelAttributeValueMap> = {}): ChannelAttributeValueMap => ({
  attributeId: 47,
  dimensionKind: "renk",
  dimensionId: 12,
  attributeValueId: 4521,
  attributeText: null,
  ...p,
});

describe("buildAttributes — küp koordinatından özellik", () => {
  it("rengi master'ın renk kimliğinden çözer", () => {
    const { attributes, missing } = buildAttributes({
      definitions: [def()],
      values: [val()],
      master,
    });
    expect(missing).toEqual([]);
    expect(attributes).toEqual([{ attributeId: 47, attributeValueId: 4521 }]);
  });

  it("iki farklı renk iki farklı değer alır — sabit liste sorunu biter", () => {
    const definitions = [def()];
    const values = [val(), val({ dimensionId: 13, attributeValueId: 4600 })];
    const kirmizi = buildAttributes({ definitions, values, master });
    const mavi = buildAttributes({ definitions, values, master: { ...master, colorId: 13 } });
    expect(kirmizi.attributes[0]).toMatchObject({ attributeValueId: 4521 });
    expect(mavi.attributes[0]).toMatchObject({ attributeValueId: 4600 });
  });

  it("ambalaj ekseni ambalaj kimliğinden okunur", () => {
    const { attributes } = buildAttributes({
      definitions: [def({ attributeId: 60, attributeName: "Ambalaj", source: "ambalaj" })],
      values: [val({ attributeId: 60, dimensionKind: "ambalaj", dimensionId: 7, attributeValueId: 88 })],
      master,
    });
    expect(attributes).toEqual([{ attributeId: 60, attributeValueId: 88 }]);
  });

  it("form ekseni ürün tipine bağlanır", () => {
    const { attributes } = buildAttributes({
      definitions: [def({ attributeId: 61, attributeName: "Ürün Tipi", source: "form" })],
      values: [val({ attributeId: 61, dimensionKind: "form", dimensionId: 3, attributeValueId: 99 })],
      master,
    });
    expect(attributes).toEqual([{ attributeId: 61, attributeValueId: 99 }]);
  });

  it("hacim eşleme gerektirmez, ambalaj hacminden yazılır", () => {
    const { attributes, missing } = buildAttributes({
      definitions: [def({ attributeId: 70, attributeName: "Net Miktar", source: "hacim" })],
      values: [],
      master,
    });
    expect(missing).toEqual([]);
    expect(attributes).toEqual([{ attributeId: 70, customAttributeValue: "100 ml" }]);
  });

  it("serbest metin eşlemesi customAttributeValue olur", () => {
    const { attributes } = buildAttributes({
      definitions: [def()],
      values: [val({ attributeValueId: null, attributeText: "Candy Red" })],
      master,
    });
    expect(attributes).toEqual([{ attributeId: 47, customAttributeValue: "Candy Red" }]);
  });

  it("sabit özellik tüm ürünlerde aynı değeri gönderir", () => {
    const { attributes } = buildAttributes({
      definitions: [def({ attributeId: 80, attributeName: "Menşei", source: "sabit", constantValueId: 5 })],
      values: [],
      master,
    });
    expect(attributes).toEqual([{ attributeId: 80, attributeValueId: 5 }]);
  });
});

describe("buildAttributes — eksik eşleme yanlış değer göndermez", () => {
  it("zorunlu özellik eşlenmemişse bildirilir", () => {
    const { attributes, missing } = buildAttributes({
      definitions: [def()],
      values: [val({ dimensionId: 99 })],
      master,
    });
    expect(attributes).toEqual([]);
    expect(missing[0]).toContain("Renk");
    expect(missing[0]).toContain("renk eşlemesi yok");
  });

  it("zorunlu olmayan özellik sessizce atlanır", () => {
    const { attributes, missing } = buildAttributes({
      definitions: [def({ isRequired: false })],
      values: [],
      master,
    });
    expect(attributes).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("sabit özelliğin değeri girilmemişse zorunluysa bildirilir", () => {
    const { missing } = buildAttributes({
      definitions: [def({ attributeName: "Materyal", source: "sabit" })],
      values: [],
      master,
    });
    expect(missing[0]).toContain("sabit değer girilmemiş");
  });

  it("hacim yoksa zorunlu özellik bildirilir", () => {
    const { missing } = buildAttributes({
      definitions: [def({ attributeName: "Hacim", source: "hacim" })],
      values: [],
      master: { ...master, volumeMl: null },
    });
    expect(missing[0]).toContain("ambalaj hacmi tanımsız");
  });

  it("adı olmayan özellik kimliğiyle bildirilir", () => {
    const { missing } = buildAttributes({
      definitions: [def({ attributeName: null })],
      values: [],
      master,
    });
    expect(missing[0]).toContain("#47");
  });
});

describe("formatVolume", () => {
  it("mililitreyi olduğu gibi yazar", () => expect(formatVolume(250)).toBe("250 ml"));
  it("tam litreyi litre yazar", () => expect(formatVolume(1000)).toBe("1 lt"));
  it("küsuratlı hacmi yuvarlar", () => expect(formatVolume(33.333)).toBe("33.33 ml"));
});

describe("resolveLogistics", () => {
  const packaging = { volumeMl: 100, weightG: 180, desi: 1.5 };

  it("master değeri her şeyi ezer", () => {
    const r = resolveLogistics({
      master: { desi: 3, weightG: 500 },
      packaging,
      series: { vatRate: 20 },
    });
    expect(r).toMatchObject({ desi: 3, weightG: 500, desiSource: "master", weightSource: "master" });
  });

  it("master boşsa ambalajdan gelir", () => {
    const r = resolveLogistics({ master: { desi: null, weightG: null }, packaging, series: null });
    expect(r).toMatchObject({ desi: 1.5, weightG: 180, desiSource: "ambalaj", weightSource: "ambalaj" });
  });

  it("ambalaj da boşsa hacimden tahmin edilir", () => {
    const r = resolveLogistics({
      master: { desi: null, weightG: null },
      packaging: { volumeMl: 500, weightG: null, desi: null },
      series: null,
    });
    expect(r.weightG).toBe(525);
    expect(r.desiSource).toBe("hacimden");
  });

  it("desi 1'in altına inmez — kargo tarifesi öyle", () => {
    const r = resolveLogistics({
      master: { desi: null, weightG: null },
      packaging: { volumeMl: 30, weightG: null, desi: null },
      series: null,
    });
    expect(r.desi).toBe(1);
  });

  it("KDV seriden gelir", () => {
    const r = resolveLogistics({
      master: { desi: null, weightG: null },
      packaging,
      series: { vatRate: 10 },
    });
    expect(r).toMatchObject({ vatRate: 10, vatSource: "seri" });
  });

  it("seri KDV'si yoksa 20'ye düşer", () => {
    const r = resolveLogistics({ master: { desi: null, weightG: null }, packaging, series: null });
    expect(r).toMatchObject({ vatRate: 20, vatSource: "varsayilan" });
  });
});

describe("resolveImages", () => {
  it("ilanın kendi görseli varsa onu kullanır", () => {
    expect(
      resolveImages({
        listingImages: [{ url: "a.jpg", sortOrder: 0 }],
        masterImages: [{ url: "m.jpg", sortOrder: 0 }],
      }),
    ).toEqual(["a.jpg"]);
  });

  it("ilan görselsizse master'dan devralır", () => {
    expect(
      resolveImages({ listingImages: [], masterImages: [{ url: "m.jpg", sortOrder: 0 }] }),
    ).toEqual(["m.jpg"]);
  });

  it("sıraya göre dizer", () => {
    expect(
      resolveImages({
        listingImages: [],
        masterImages: [
          { url: "b.jpg", sortOrder: 2 },
          { url: "a.jpg", sortOrder: 1 },
        ],
      }),
    ).toEqual(["a.jpg", "b.jpg"]);
  });

  it("tekrarlı görseli teke indirir", () => {
    expect(
      resolveImages({
        listingImages: [],
        masterImages: [
          { url: "a.jpg", sortOrder: 0 },
          { url: "a.jpg", sortOrder: 1 },
        ],
      }),
    ).toEqual(["a.jpg"]);
  });

  it("sınırı uygular", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: `${i}.jpg`, sortOrder: i }));
    expect(resolveImages({ listingImages: many, masterImages: [], limit: 8 })).toHaveLength(8);
  });

  it("ikisi de boşsa boş döner", () => {
    expect(resolveImages({ listingImages: [], masterImages: [] })).toEqual([]);
  });
});

describe("guessSource", () => {
  const cases: [string, string][] = [
    ["Renk", "renk"],
    ["Renk Kodu", "renk"],
    ["Hacim", "hacim"],
    ["Net Miktar", "hacim"],
    ["Ambalaj Tipi", "ambalaj"],
    ["Ürün Tipi", "form"],
    ["Ürün Grubu", "seri"],
    ["Materyal", "sabit"],
    ["", "sabit"],
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" → ${expected}`, () => expect(guessSource(name)).toBe(expected));
  }
});
