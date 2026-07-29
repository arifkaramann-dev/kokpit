import { describe, expect, it } from "vitest";
import {
  buildBaseCode,
  buildChannelBarcode,
  buildChannelSku,
  buildInternalSku,
  buildListingTitle,
  buildSlug,
  ean13CheckDigit,
  isValidEan13,
  parseVolumeMl,
  uniqueSkuSegments,
} from "./catalogCodes";
import { cubeKey, planListings, planMasters, type PlanSeries } from "./catalogPlan";

describe("buildBaseCode / buildInternalSku", () => {
  it("kullanıcının kod düzenini birebir üretir", () => {
    // aoc + cnd + red1822 → aoccndred1822
    expect(buildBaseCode({ brand: "AOC", seriesPrefix: "CND", colorCode: "RED1822" })).toBe(
      "aoccndred1822",
    );
  });

  it("temel kod bir RENGİ tanımlar; master kimliği form+ambalaj ile tamamlanır", () => {
    const baseCode = "aoccndred1822";
    expect(buildInternalSku({ baseCode, familySegment: "ab", packagingSegment: "100" })).toBe(
      "aoccndred1822ab100",
    );
    expect(
      buildInternalSku({ baseCode, familySegment: "ab", packagingSegment: "100", readiness: "r2u" }),
    ).toBe("aoccndred1822ab100r2u");
  });

  it("aynı renkten farklı master'lar farklı SKU alır", () => {
    const baseCode = "aoccndred1822";
    const skus = new Set([
      buildInternalSku({ baseCode, familySegment: "ab", packagingSegment: "100" }),
      buildInternalSku({ baseCode, familySegment: "ab", packagingSegment: "500" }),
      buildInternalSku({ baseCode, familySegment: "sp", packagingSegment: "400" }),
      buildInternalSku({ baseCode, familySegment: "ab", packagingSegment: "100", readiness: "r2u" }),
    ]);
    expect(skus.size).toBe(4);
  });

  it("Türkçe karakterleri indirger", () => {
    expect(buildBaseCode({ brand: "aoc", seriesPrefix: "RÖT", colorCode: "Şeffaf" })).toBe(
      "aocrotseffaf",
    );
  });
});

describe("pazaryeri kodları", () => {
  it("satıcı kodu opak — internal SKU'yu sızdırmaz", () => {
    const sku = buildChannelSku("trendyol", 42);
    expect(sku).toBe("tren000042");
    expect(sku).not.toContain("aoccnd");
  });

  it("barkod geçerli EAN-13 üretir", () => {
    const code = buildChannelBarcode(1);
    expect(code).toHaveLength(13);
    expect(isValidEan13(code)).toBe(true);
  });

  it("mağaza içi ön ekle başlar — gerçek GTIN'lere çakışma riski düşer", () => {
    expect(buildChannelBarcode(7).startsWith("299")).toBe(true);
  });

  it("ardışık numaralar farklı barkod verir", () => {
    const codes = new Set([1, 2, 3, 4, 5].map(n => buildChannelBarcode(n)));
    expect(codes.size).toBe(5);
  });

  it("kontrol hanesi bilinen örnekle doğrulanır", () => {
    // 590123412345 7 — GS1 referans örneği
    expect(ean13CheckDigit("590123412345")).toBe(7);
  });

  it("bozuk barkodu reddeder", () => {
    expect(isValidEan13("2990000000011")).toBe(false);
    expect(isValidEan13("299")).toBe(false);
  });
});

describe("parseVolumeMl — formül ölçeklemesinin paydası", () => {
  it("ml ve litreyi çözer", () => {
    expect(parseVolumeMl("100 ML PET")).toBe(100);
    expect(parseVolumeMl("500 ML PET")).toBe(500);
    expect(parseVolumeMl("SPREY 400ML")).toBe(400);
    expect(parseVolumeMl("1 LT(900 GR)")).toBe(1000);
    expect(parseVolumeMl("20 ML (Airbrush)")).toBe(20);
  });
  it("hacim yoksa sıfır döner", () => {
    expect(parseVolumeMl("RÖTUŞ KUTUSU")).toBe(0);
    expect(parseVolumeMl(null)).toBe(0);
  });
});

describe("buildListingTitle / buildSlug", () => {
  it("şablonsuz makul başlık kurar", () => {
    expect(
      buildListingTitle(null, {
        marka: "Artofcolour",
        renk: "Candy Red",
        kullanim: "3D Baskı",
        ambalaj: "100 ML PET",
      }),
    ).toBe("Artofcolour Candy Red 3D Baskı Boyası 100 ML PET");
  });

  it("şablon değişkenlerini doldurur", () => {
    expect(
      buildListingTitle("{{renk}} {{kullanim}} Boyası {{ambalaj}}", {
        renk: "Candy Red",
        kullanim: "Rapala",
        ambalaj: "30 ML",
      }),
    ).toBe("Candy Red Rapala Boyası 30 ML");
  });

  it("slug Türkçe karakteri indirger", () => {
    expect(buildSlug("Artofcolour Candy Red Rötuş Boyası 30 ML")).toBe(
      "artofcolour-candy-red-rotus-boyasi-30-ml",
    );
  });
});

/* ------------------------------ Planlayıcı -------------------------------- */

const families = [
  { id: 1, code: "airbrush", name: "Airbrush", skuSegment: "ab" },
  { id: 2, code: "sprey", name: "Sprey", skuSegment: "sp" },
];
const packagings = [
  { id: 1, code: "pet100", name: "100 ML PET", skuSegment: "100", volumeMl: 100 },
  { id: 2, code: "pet500", name: "500 ML PET", skuSegment: "500", volumeMl: 500 },
  { id: 3, code: "sprey400", name: "SPREY 400ML", skuSegment: "400", volumeMl: 400 },
];
const colors = [
  { id: 1, code: "red1822", name: "Candy Red", seriesId: 10 },
  { id: 2, code: "blue2100", name: "Candy Blue", seriesId: 10 },
  { id: 3, code: "notr", name: "Renksiz", seriesId: null },
];

const candy: PlanSeries = {
  id: 10,
  name: "CANDY",
  prefix: "cnd",
  packagingIds: [1, 2],
  familyIds: [1],
  readiness: ["konsantre", "r2u"],
};

describe("planMasters — seyrek küp", () => {
  it("yalnız uyumluluk kesişimini üretir, kartezyen çarpımı değil", () => {
    // 3 renk × 1 form × 2 ambalaj × 2 hazırlık = 12
    // Sprey formu ve sprey ambalajı CANDY'de tanımlı değil → üretilmez.
    const plan = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.create).toHaveLength(12);
    expect(plan.create.every(m => m.familyId === 1)).toBe(true);
    expect(plan.create.some(m => m.packagingId === 3)).toBe(false);
  });

  it("seriye ait olmayan renkleri dışlar, genel rengi dahil eder", () => {
    const other: PlanSeries = { ...candy, id: 20, prefix: "mtr" };
    const plan = planMasters({
      series: [other],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    // CANDY'ye özel iki renk dışlanır, yalnız seriesId=null olan "notr" kalır.
    expect(plan.create.every(m => m.colorId === 3)).toBe(true);
  });

  it("formulaScale ambalaj hacminden türetilir", () => {
    const plan = planMasters({
      series: [candy],
      colors: [colors[0]],
      families,
      packagings,
      existingKeys: new Set(),
      formulaBaseQty: 1000,
    });
    const p100 = plan.create.find(m => m.packagingId === 1)!;
    const p500 = plan.create.find(m => m.packagingId === 2)!;
    expect(p100.formulaScale).toBeCloseTo(0.1);
    expect(p500.formulaScale).toBeCloseTo(0.5);
  });

  it("ikinci çalıştırma yeni kayıt açmaz — idempotent", () => {
    const first = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    const keys = new Set(first.create.map(cubeKey));
    const second = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: keys,
    });
    expect(second.create).toHaveLength(0);
    expect(second.existing).toHaveLength(first.create.length);
  });

  it("her koordinat benzersiz internalSku alır", () => {
    const plan = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(new Set(plan.create.map(m => m.internalSku)).size).toBe(plan.create.length);
    expect(plan.conflicts).toHaveLength(0);
  });

  it("iki koordinat aynı kodu üretirse çakışma bildirilir", () => {
    // İki form da aynı SKU ekini taşıyor → kaçınılmaz çakışma
    const plan = planMasters({
      series: [{ ...candy, familyIds: [1, 2], readiness: ["konsantre"] }],
      colors: [colors[0]],
      families: [
        { id: 1, code: "a", name: "A", skuSegment: "x" },
        { id: 2, code: "b", name: "B", skuSegment: "x" },
      ],
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.conflicts.length).toBeGreaterThan(0);
  });

  it("onlySeriesIds ile üretim daraltılır", () => {
    const plan = planMasters({
      series: [candy, { ...candy, id: 20, prefix: "mtr" }],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
      onlySeriesIds: [10],
    });
    expect(plan.create.every(m => m.seriesId === 10)).toBe(true);
  });
});

describe("planMasters — seri × renk bağı", () => {
  // Gerçek hata: tohumlama hiçbir renge seri atamadığı için her renk her
  // seriye düşüyor, CANDY için 31 rengin tamamı çarpıma girip 744 master
  // çıkıyordu.
  it("açık renk bağı verilirse yalnız o renkler üretilir", () => {
    const plan = planMasters({
      series: [{ ...candy, colorIds: [1] }],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.create.every(m => m.colorId === 1)).toBe(true);
    // 1 renk × 1 form × 2 ambalaj × 2 hazırlık
    expect(plan.create).toHaveLength(4);
  });

  it("bağ yoksa eski kural işler — geçiş dönemi bozulmaz", () => {
    const plan = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.create).toHaveLength(12);
  });

  it("boş renk listesi bağ sayılmaz", () => {
    const plan = planMasters({
      series: [{ ...candy, colorIds: [] }],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.create).toHaveLength(12);
  });

  it("kırılım sayının nereden geldiğini söyler", () => {
    const plan = planMasters({
      series: [candy],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.breakdown[0]).toMatchObject({
      seriesName: "CANDY",
      colors: 3,
      families: 1,
      packagings: 2,
      readiness: 2,
      total: 12,
      colorsExplicit: false,
    });
  });

  it("açık bağ kırılımda işaretlenir", () => {
    const plan = planMasters({
      series: [{ ...candy, colorIds: [1, 2] }],
      colors,
      families,
      packagings,
      existingKeys: new Set(),
    });
    expect(plan.breakdown[0]).toMatchObject({ colors: 2, colorsExplicit: true, total: 8 });
  });
});

describe("planMasters — SKU çakışması üretimi durdurmaz", () => {
  // Gerçek hata: "30 ML PET" ve "30 ML CAM" ikisi de hacimden "30" eki alıyor.
  // Aynı seri+renk+form altında internal SKU birebir aynı çıkıyor ve master
  // üretimi "Kod çakışması" ile duruyordu.
  const collidingPackagings = [
    { id: 1, code: "pet30", name: "30 ML PET", skuSegment: "30", volumeMl: 30 },
    { id: 2, code: "cam30", name: "30 ML CAM", skuSegment: "30", volumeMl: 30 },
  ];
  const series: PlanSeries = {
    id: 10,
    name: "CANDY",
    prefix: "cnd",
    packagingIds: [1, 2],
    familyIds: [1],
    readiness: ["konsantre"],
  };

  it("çakışan kodları ayrıştırır ve iki master da üretilir", () => {
    const plan = planMasters({
      series: [series],
      colors: [colors[0]],
      families,
      packagings: collidingPackagings,
      existingKeys: new Set(),
    });
    expect(plan.create).toHaveLength(2);
    const skus = plan.create.map(m => m.internalSku);
    expect(new Set(skus).size).toBe(2);
  });

  it("çakışmayı yine de bildirir — ekler iyileştirilebilsin", () => {
    const plan = planMasters({
      series: [series],
      colors: [colors[0]],
      families,
      packagings: collidingPackagings,
      existingKeys: new Set(),
    });
    expect(plan.conflicts).toHaveLength(1);
  });

  it("ayrıştırma deterministik — aynı girdi aynı kodu verir", () => {
    const run = () =>
      planMasters({
        series: [series],
        colors: [colors[0]],
        families,
        packagings: collidingPackagings,
        existingKeys: new Set(),
      }).create.map(m => m.internalSku);
    expect(run()).toEqual(run());
  });

  it("katalogda kullanılan kodla çakışmaz", () => {
    const first = planMasters({
      series: [series],
      colors: [colors[0]],
      families,
      packagings: collidingPackagings,
      existingKeys: new Set(),
    });
    const taken = new Set(first.create.map(m => m.internalSku));
    const second = planMasters({
      series: [{ ...series, id: 11, prefix: "cnd" }],
      colors: [colors[2]],
      families,
      packagings: collidingPackagings,
      existingKeys: new Set(),
      existingSkus: taken,
    });
    for (const m of second.create) expect(taken.has(m.internalSku)).toBe(false);
  });
});

describe("uniqueSkuSegments — çakışan ekleri tekilleştirir", () => {
  it("aynı hacimli iki ambalajı adından ayırır", () => {
    const out = uniqueSkuSegments([
      { id: 1, name: "30 ML PET", base: "30" },
      { id: 2, name: "30 ML CAM", base: "30" },
    ]);
    expect(out.get(1)).toBe("30pet");
    expect(out.get(2)).toBe("30cam");
  });

  it("tekil eke dokunmaz", () => {
    const out = uniqueSkuSegments([
      { id: 1, name: "100 ML PET", base: "100" },
      { id: 2, name: "500 ML PET", base: "500" },
    ]);
    expect(out.get(1)).toBe("100");
    expect(out.get(2)).toBe("500");
  });

  it("ayırt edici kelime yoksa sıra ekler", () => {
    const out = uniqueSkuSegments([
      { id: 1, name: "30 ML", base: "30" },
      { id: 2, name: "30 ML", base: "30" },
    ]);
    expect(new Set([out.get(1), out.get(2)]).size).toBe(2);
  });

  it("sonuç satır sırasından bağımsız", () => {
    const rows = [
      { id: 1, name: "30 ML PET", base: "30" },
      { id: 2, name: "30 ML CAM", base: "30" },
    ];
    const a = uniqueSkuSegments(rows);
    const b = uniqueSkuSegments([...rows].reverse());
    expect(a.get(1)).toBe(b.get(1));
    expect(a.get(2)).toBe(b.get(2));
  });
});

describe("planListings — idempotent ilan üretimi", () => {
  const masters = [
    {
      masterId: 1,
      seriesName: "CANDY",
      colorName: "Candy Red",
      familyName: "Airbrush",
      packagingName: "100 ML PET",
    },
  ];
  const useCases = [
    { id: 1, code: "genel", name: "Genel", titlePattern: null },
    { id: 2, code: "3d_baski", name: "3D Baskı", titlePattern: null },
    { id: 3, code: "rapala", name: "Rapala", titlePattern: null },
  ];

  it("her master için jenerik + kullanım alanı ilanları üretir", () => {
    const plan = planListings({ masters, useCases, genericUseCaseId: 1, existingKeys: new Set() });
    expect(plan.create).toHaveLength(3);
    expect(plan.create.filter(l => l.isPrimary)).toHaveLength(1);
  });

  it("jenerik ilan birincil olur — düşük kapasitede stok orada toplanır", () => {
    const plan = planListings({ masters, useCases, genericUseCaseId: 1, existingKeys: new Set() });
    const primary = plan.create.find(l => l.isPrimary)!;
    expect(primary.useCaseId).toBe(1);
    expect(primary.title).toContain("Airbrush");
  });

  it("kullanım alanı başlığa girer — farklı alıcı niyetine ayrı ilan", () => {
    const plan = planListings({ masters, useCases, genericUseCaseId: 1, existingKeys: new Set() });
    expect(plan.create.find(l => l.useCaseId === 2)!.title).toContain("3D Baskı");
    expect(plan.create.find(l => l.useCaseId === 3)!.title).toContain("Rapala");
  });

  it("yeniden üretim mükerrer açmaz, var olanı günceller", () => {
    const first = planListings({ masters, useCases, genericUseCaseId: 1, existingKeys: new Set() });
    const keys = new Set(first.create.map(l => `${l.masterId}:${l.useCaseId}`));
    const second = planListings({ masters, useCases, genericUseCaseId: 1, existingKeys: keys });
    expect(second.create).toHaveLength(0);
    expect(second.update).toHaveLength(3);
  });
});
