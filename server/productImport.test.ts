import { describe, expect, it } from "vitest";
import { attributeValueFor, findInTitle, planProductImport } from "./productImport";

const colors = [
  { id: 1, name: "Fuşya" },
  { id: 2, name: "Mavi" },
  { id: 3, name: "Açık Mavi" },
];
const packagings = [
  { id: 10, name: "10 ml" },
  { id: 11, name: "100 ml" },
];
const families = [
  { id: 20, name: "Airbrush" },
  { id: 21, name: "Sprey" },
];

const cand = (title: string) => ({
  barcode: "2990000000019",
  title,
  stockCode: "tren000001",
  salePrice: 500,
});

/**
 * Yanlış koordinat, ürünün küpte yanlış yerde doğması demek: kapasite ve
 * reçete bağları tutmaz, sonradan elle temizlenir. Testler eşleşmeyi olduğu
 * kadar YANLIŞ eşleşmemeyi de korur.
 */
describe("findInTitle", () => {
  it("başlıktaki değeri bulur", () => {
    expect(findInTitle("Artofcolour Fuşya Airbrush Boyası 100 ml", colors)?.id).toBe(1);
  });

  it("en uzun eşleşmeyi seçer — '100 ml' varken '10 ml' seçilmez", () => {
    expect(findInTitle("Artofcolour Fuşya Airbrush Boyası 100 ml", packagings)?.id).toBe(11);
  });

  it("en uzun renk kazanır — 'Açık Mavi' varken 'Mavi' seçilmez", () => {
    expect(findInTitle("Artofcolour Açık Mavi Sprey Boyası", colors)?.id).toBe(3);
  });

  it("kelime ortasındaki benzerliğe kanmaz", () => {
    expect(findInTitle("Mavimsi ton boya", colors)).toBeNull();
  });

  it("büyük/küçük harf farkını yutar", () => {
    expect(findInTitle("ARTOFCOLOUR FUŞYA AIRBRUSH", colors)?.id).toBe(1);
  });

  it("tanımlı olmayan değeri uydurmaz", () => {
    expect(findInTitle("Artofcolour Turkuaz Airbrush Boyası", colors)).toBeNull();
  });
});

describe("planProductImport", () => {
  it("koordinatın tamamı çözülünce hazır sayar", () => {
    const plan = planProductImport({
      candidates: [cand("Artofcolour Fuşya Airbrush Boyası 100 ml")],
      colors,
      packagings,
      families,
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.blocked).toEqual([]);
    expect(plan.ready[0]).toMatchObject({ colorId: 1, packagingId: 11, familyId: 20 });
  });

  it("eksik eksen varsa oluşturmaz, nedenini söyler", () => {
    const plan = planProductImport({
      candidates: [cand("Artofcolour Turkuaz Airbrush Boyası 100 ml")],
      colors,
      packagings,
      families,
    });
    expect(plan.ready).toEqual([]);
    expect(plan.blocked[0].missing).toEqual(["renk"]);
  });

  it("birden çok eksen eksikse hepsini bildirir", () => {
    const plan = planProductImport({
      candidates: [cand("Artofcolour Bilinmeyen Ürün")],
      colors,
      packagings,
      families,
    });
    expect(plan.blocked[0].missing).toEqual(["renk", "ambalaj", "form"]);
  });

  it("hazır ve engelli adayları ayırır", () => {
    const plan = planProductImport({
      candidates: [
        cand("Artofcolour Fuşya Airbrush Boyası 100 ml"),
        cand("Artofcolour Turkuaz Sprey Boyası 10 ml"),
      ],
      colors,
      packagings,
      families,
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.blocked).toHaveLength(1);
  });

  it("boş liste boş plan üretir", () => {
    const plan = planProductImport({ candidates: [], colors, packagings, families });
    expect(plan).toEqual({ ready: [], blocked: [], missingDefinitions: [] });
  });
});

/**
 * Ürünün pazaryerindeki KENDİ özellikleri.
 *
 * Koordinatı başlıktan ayrıştırmak kırılgan: yazım serbest, sıra değişir,
 * kelime eksik olabilir. Özellik listesi değerin kendisini verir.
 */
describe("attributeValueFor", () => {
  const attrs = [
    { name: "Renk", value: "Fuşya" },
    { name: "Hacim", value: "100 ml" },
    { name: "Menşei", value: "Türkiye" },
  ];

  it("eksenin değerini okur", () => {
    expect(attributeValueFor(attrs, "renk")).toBe("Fuşya");
    expect(attributeValueFor(attrs, "ambalaj")).toBe("100 ml");
  });

  it("pazaryerinin farklı adlandırmasını karşılar", () => {
    expect(attributeValueFor([{ name: "Ürün Rengi", value: "Mavi" }], "renk")).toBe("Mavi");
    expect(attributeValueFor([{ name: "Ürün Tipi", value: "Sprey" }], "form")).toBe("Sprey");
  });

  it("ilgisiz özelliği eksene yazmaz", () => {
    expect(attributeValueFor([{ name: "Menşei", value: "Türkiye" }], "renk")).toBeNull();
  });

  it("özellik yoksa null döner", () => {
    expect(attributeValueFor(undefined, "renk")).toBeNull();
    expect(attributeValueFor([], "renk")).toBeNull();
  });
});

describe("planProductImport — ürün özellikleri ve eksik tanımlar", () => {
  it("başlıkta geçmeyen rengi ürün özelliğinden çözer", () => {
    const plan = planProductImport({
      candidates: [
        {
          ...cand("Artofcolour Airbrush Boyası 100 ml"),
          attributes: [{ name: "Renk", value: "Fuşya" }],
        },
      ],
      colors,
      packagings,
      families,
    });
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0].colorId).toBe(1);
  });

  it("özellik tanımlıyla eşleşmezse ADI önerir — 'eksik' demekle kalmaz", () => {
    const plan = planProductImport({
      candidates: [
        {
          ...cand("Artofcolour Airbrush Boyası 100 ml"),
          attributes: [{ name: "Renk", value: "Turkuaz" }],
        },
      ],
      colors,
      packagings,
      families,
    });
    expect(plan.blocked[0].missing).toEqual(["renk"]);
    expect(plan.blocked[0].suggested).toEqual([{ axis: "renk", name: "Turkuaz" }]);
    expect(plan.missingDefinitions).toEqual([{ axis: "renk", name: "Turkuaz", count: 1 }]);
  });

  it("aynı eksik tanımı tekilleştirip sayar", () => {
    const c = (t: string) => ({
      ...cand(t),
      attributes: [{ name: "Renk", value: "Turkuaz" }],
    });
    const plan = planProductImport({
      candidates: [c("A Airbrush 100 ml"), c("B Airbrush 100 ml")],
      colors,
      packagings,
      families,
    });
    expect(plan.missingDefinitions).toEqual([{ axis: "renk", name: "Turkuaz", count: 2 }]);
  });

  it("özellik yoksa başlık ayrıştırmaya düşer", () => {
    const plan = planProductImport({
      candidates: [cand("Artofcolour Fuşya Airbrush Boyası 100 ml")],
      colors,
      packagings,
      families,
    });
    expect(plan.ready[0].colorId).toBe(1);
  });

  it("özellik tanımlıyla eşleşiyorsa başlığa bakmaz", () => {
    // Başlıkta "Mavi" geçiyor ama ürünün gerçek rengi Fuşya.
    const plan = planProductImport({
      candidates: [
        {
          ...cand("Artofcolour Mavi Kutulu Airbrush Boyası 100 ml"),
          attributes: [{ name: "Renk", value: "Fuşya" }],
        },
      ],
      colors,
      packagings,
      families,
    });
    expect(plan.ready[0].colorId).toBe(1);
  });
});
