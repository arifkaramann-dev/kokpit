import { describe, expect, it } from "vitest";
import type { CapacityFormula, CapacityMaterial } from "./capacity";
import { planProduction, resolveOrderLines, type OrderLine } from "./productionPlan";

/* ---------------------------- Satır çözümleme ----------------------------- */

const listings = [
  {
    masterId: 1,
    listingId: 10,
    title: "Artofcolour Candy Red 3D Baskı Boyası 100 ML PET",
    channelRefs: ["tren000042", "2990000000426"],
  },
  {
    masterId: 2,
    listingId: 11,
    title: "Artofcolour Candy Blue Rapala Boyası 30 ML",
    channelRefs: ["tren000043"],
  },
];

const line = (p: Partial<OrderLine> = {}): OrderLine => ({
  id: 1,
  orderId: 100,
  productName: "Artofcolour Candy Red 3D Baskı Boyası 100 ML PET",
  quantity: 1,
  ...p,
});

describe("resolveOrderLines — sipariş satırını master'a bağlama", () => {
  it("pazaryeri kodu en güvenilir yol", () => {
    const r = resolveOrderLines([line({ productName: "alakasız", channelRef: "tren000042" })], listings);
    expect(r[0]).toMatchObject({ masterId: 1, via: "kanal_kodu" });
  });

  it("barkodla da eşleşir", () => {
    const r = resolveOrderLines([line({ productName: "x", channelRef: "2990000000426" })], listings);
    expect(r[0].masterId).toBe(1);
  });

  it("başlık birebir eşleşir", () => {
    expect(resolveOrderLines([line()], listings)[0]).toMatchObject({ masterId: 1, via: "baslik" });
  });

  it("Türkçe harf ve noktalama farkını yok sayar", () => {
    const r = resolveOrderLines(
      [line({ productName: "ARTOFCOLOUR CANDY RED 3D BASKI BOYASI - 100 ML PET" })],
      listings,
    );
    expect(r[0].masterId).toBe(1);
  });

  it("pazaryerinde düzenlenmiş başlığı yaklaşık eşleştirir", () => {
    const r = resolveOrderLines(
      [line({ productName: "Candy Red 3D Baskı Boyası 100 ML PET Hızlı Kargo" })],
      listings,
    );
    expect(r[0]).toMatchObject({ masterId: 1, via: "yaklasik" });
  });

  it("alakasız başlığı eşleştirmez — yanlış eşleşme eşleşmemekten kötüdür", () => {
    const r = resolveOrderLines([line({ productName: "Zımpara Kağıdı 240 Kum" })], listings);
    expect(r[0]).toMatchObject({ masterId: null, via: "eslesmedi" });
  });

  it("iki farklı ürünü karıştırmaz", () => {
    const r = resolveOrderLines(
      [line({ productName: "Artofcolour Candy Blue Rapala Boyası 30 ML" })],
      listings,
    );
    expect(r[0].masterId).toBe(2);
  });
});

/* ---------------------------- Üretim planı -------------------------------- */

const PIGMENT = 1;
const BAGLAYICI = 2;
const TINER = 3;
const SISE = 4;
const ETIKET = 5;
const HARC = 20;

const mat = (
  id: number,
  name: string,
  type: CapacityMaterial["type"],
  stockQty: number,
  extra: Partial<CapacityMaterial> = {},
): CapacityMaterial => ({ id, name, type, stockQty, ...extra });

/** 1000 ml harç = 50 gr pigment + 900 ml bağlayıcı */
const harc: CapacityFormula = {
  id: 100,
  outputType: "yari_mamul",
  outputMaterialId: HARC,
  baseQty: 1000,
  inputs: [
    { inputMaterialId: PIGMENT, qtyPerBase: 50 },
    { inputMaterialId: BAGLAYICI, qtyPerBase: 900 },
  ],
};

/** Mamul: 1000 ml referans = 1000 ml harç */
const mamul: CapacityFormula = {
  id: 101,
  outputType: "mamul",
  outputMaterialId: null,
  baseQty: 1000,
  inputs: [{ inputMaterialId: HARC, qtyPerBase: 1000 }],
};

const pack = { id: 1, materialId: SISE, inputs: [{ materialId: ETIKET, qtyPerUnit: 1 }] };
const master = { id: 1, formulaId: 101, formulaScale: 0.1, packagingId: 1 };

const setup = (stok: Record<number, number>, demand = [{ masterId: 1, qty: 40 }]) =>
  planProduction({
    demand,
    masters: [master],
    formulas: [harc, mamul],
    packagings: [pack],
    materials: [
      mat(PIGMENT, "Pigment", "hammadde", stok[PIGMENT] ?? 0),
      mat(BAGLAYICI, "Bağlayıcı", "hammadde", stok[BAGLAYICI] ?? 0),
      mat(TINER, "Tiner", "hammadde", stok[TINER] ?? 0),
      mat(HARC, "Candy Red harcı", "yari_mamul", stok[HARC] ?? 0),
      mat(SISE, "100 ML PET", "ambalaj", stok[SISE] ?? 9999),
      mat(ETIKET, "Etiket", "ambalaj", stok[ETIKET] ?? 9999),
    ],
  });

describe("planProduction — malzeme ihtiyacı patlatma", () => {
  it("mamulden hammaddeye kadar zinciri patlatır", () => {
    // 40 adet × 100 ml = 4.000 ml harç → 200 gr pigment + 3.600 ml bağlayıcı
    const plan = setup({ [PIGMENT]: 500, [BAGLAYICI]: 9000 });
    const byId = new Map(plan.needs.map(n => [n.materialId, n]));
    expect(byId.get(HARC)?.needed).toBe(4000);
    expect(byId.get(PIGMENT)?.needed).toBe(200);
    expect(byId.get(BAGLAYICI)?.needed).toBe(3600);
    expect(plan.canProduce).toBe(true);
  });

  it("elde duran yarı mamul düşülür — gereksiz alım önerilmez", () => {
    // 4.000 ml gerekiyor, 1.200 ml var → yalnız 2.800 ml üretilir
    const plan = setup({ [HARC]: 1200, [PIGMENT]: 500, [BAGLAYICI]: 9000 });
    expect(plan.steps.find(s => s.materialId === HARC)?.produceQty).toBe(2800);
    const byId = new Map(plan.needs.map(n => [n.materialId, n]));
    expect(byId.get(PIGMENT)?.needed).toBe(140); // 2800/1000 × 50
  });

  it("yeterli yarı mamul varsa üretim adımı çıkmaz", () => {
    const plan = setup({ [HARC]: 5000 });
    expect(plan.steps).toHaveLength(0);
    expect(plan.canProduce).toBe(true);
  });

  it("eksik hammaddeyi miktarıyla bildirir", () => {
    const plan = setup({ [PIGMENT]: 50, [BAGLAYICI]: 9000 });
    const eksik = plan.shortages.find(s => s.materialId === PIGMENT);
    expect(eksik).toMatchObject({ needed: 200, available: 50, missing: 150 });
    expect(plan.canProduce).toBe(false);
  });

  it("ambalaj da eksik olabilir — boya varken şişe biter", () => {
    const plan = setup({ [PIGMENT]: 500, [BAGLAYICI]: 9000, [SISE]: 12 });
    expect(plan.shortages.find(s => s.materialId === SISE)).toMatchObject({
      needed: 40,
      missing: 28,
    });
  });

  it("etiket gibi ikincil ambalaj kalemi de sayılır", () => {
    const plan = setup({ [PIGMENT]: 500, [BAGLAYICI]: 9000, [ETIKET]: 5 });
    expect(plan.shortages.find(s => s.materialId === ETIKET)?.missing).toBe(35);
  });

  it("üretilebilen yarı mamul eksik sayılmaz — satın alınacak kalem değil", () => {
    const plan = setup({ [PIGMENT]: 500, [BAGLAYICI]: 9000 });
    expect(plan.shortages.some(s => s.materialId === HARC)).toBe(false);
  });

  it("açık sipariş rezervi satılabilir stoğu düşürür", () => {
    const plan = planProduction({
      demand: [{ masterId: 1, qty: 40 }],
      masters: [master],
      formulas: [harc, mamul],
      packagings: [pack],
      materials: [
        mat(PIGMENT, "Pigment", "hammadde", 500, { reservedQty: 400 }),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 9000),
        mat(HARC, "harç", "yari_mamul", 0),
        mat(SISE, "şişe", "ambalaj", 9999),
        mat(ETIKET, "etiket", "ambalaj", 9999),
      ],
    });
    expect(plan.shortages.find(s => s.materialId === PIGMENT)?.missing).toBe(100);
  });

  it("masraf kalemleri planı bozmaz", () => {
    const plan = planProduction({
      demand: [{ masterId: 1, qty: 1 }],
      masters: [master],
      formulas: [harc, { ...mamul, inputs: [...mamul.inputs, { inputMaterialId: 9, qtyPerBase: 1 }] }],
      packagings: [],
      materials: [
        mat(PIGMENT, "Pigment", "hammadde", 9999),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 9999),
        mat(HARC, "harç", "yari_mamul", 0),
        mat(9, "MASRAF 1", "masraf", 0),
      ],
    });
    expect(plan.needs.some(n => n.materialId === 9)).toBe(false);
    expect(plan.canProduce).toBe(true);
  });

  it("reçetesiz master sessizce geçilmez", () => {
    const plan = planProduction({
      demand: [{ masterId: 7, qty: 5 }],
      masters: [{ id: 7, formulaId: null, formulaScale: 1, packagingId: null }],
      formulas: [],
      packagings: [],
      materials: [],
    });
    expect(plan.missingFormula).toEqual([7]);
    expect(plan.canProduce).toBe(false);
  });

  it("birden çok sipariş satırı aynı kalemde toplanır", () => {
    const plan = setup({ [PIGMENT]: 9999, [BAGLAYICI]: 99999 }, [
      { masterId: 1, qty: 10 },
      { masterId: 1, qty: 30 },
    ]);
    expect(plan.needs.find(n => n.materialId === HARC)?.needed).toBe(4000);
  });
});
