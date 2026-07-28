import { describe, expect, it } from "vitest";
import {
  bottleneckReport,
  computeCapacity,
  listingQty,
  materialAtp,
  type CapacityFormula,
  type CapacityMaterial,
} from "./capacity";

/* Kimlikler: 1-9 hammadde/ambalaj, 20+ yarı mamul, 100+ reçete */
const PIGMENT = 1;
const BAGLAYICI = 2;
const SOLVENT = 3;
const TINER = 4;
const SISE100 = 5;
const KAPAK = 6;
const ETIKET = 7;
const HARC = 20;
const R2U = 21;

const mat = (
  id: number,
  name: string,
  type: CapacityMaterial["type"],
  stockQty: number,
  extra: Partial<CapacityMaterial> = {},
): CapacityMaterial => ({ id, name, type, stockQty, ...extra });

/** Candy Red harcı: 1000 ml harç = 50 gr pigment + 800 ml bağlayıcı + 150 ml solvent */
const harcFormula: CapacityFormula = {
  id: 100,
  outputType: "yari_mamul",
  outputMaterialId: HARC,
  baseQty: 1000,
  inputs: [
    { inputMaterialId: PIGMENT, qtyPerBase: 50 },
    { inputMaterialId: BAGLAYICI, qtyPerBase: 800 },
    { inputMaterialId: SOLVENT, qtyPerBase: 150 },
  ],
};

/** r2u: 1000 ml kullanıma hazır = 600 ml harç + 400 ml tiner */
const r2uFormula: CapacityFormula = {
  id: 101,
  outputType: "yari_mamul",
  outputMaterialId: R2U,
  baseQty: 1000,
  inputs: [
    { inputMaterialId: HARC, qtyPerBase: 600 },
    { inputMaterialId: TINER, qtyPerBase: 400 },
  ],
};

/** Mamul: 1000 ml referans hacim için r2u harcı */
const mamulFormula: CapacityFormula = {
  id: 102,
  outputType: "mamul",
  outputMaterialId: null,
  baseQty: 1000,
  inputs: [{ inputMaterialId: R2U, qtyPerBase: 1000 }],
};

const pack100 = {
  id: 1,
  materialId: SISE100,
  inputs: [
    { materialId: KAPAK, qtyPerUnit: 1 },
    { materialId: ETIKET, qtyPerUnit: 1 },
  ],
};

describe("materialAtp — satılabilir hammadde", () => {
  it("rezerve ve emniyet payını düşer", () => {
    expect(materialAtp(mat(1, "x", "hammadde", 500, { reservedQty: 120, safetyQty: 30 }))).toBe(350);
  });
  it("eksiye düşmez", () => {
    expect(materialAtp(mat(1, "x", "hammadde", 10, { reservedQty: 99 }))).toBe(0);
  });
});

describe("computeCapacity — tek seviyeli", () => {
  const base = {
    formulas: [
      {
        id: 100,
        outputType: "mamul" as const,
        outputMaterialId: null,
        baseQty: 1000,
        inputs: [
          { inputMaterialId: PIGMENT, qtyPerBase: 50 },
          { inputMaterialId: BAGLAYICI, qtyPerBase: 800 },
        ],
      },
    ],
    packagings: [],
    masters: [{ id: 1, formulaId: 100, formulaScale: 0.1, packagingId: null }],
  };

  it("en kıt girdiyi darboğaz olarak bulur — bol olanı değil", () => {
    // 100 ml için: 5 gr pigment, 80 ml bağlayıcı
    // pigment 500/5 = 100 · bağlayıcı 2000/80 = 25  → darboğaz bağlayıcı
    const r = computeCapacity({
      ...base,
      materials: [
        mat(PIGMENT, "Candy Red pigment", "hammadde", 500),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 2000),
      ],
    });
    expect(r.masters[0].buildable).toBe(25);
    expect(r.masters[0].bottleneck?.materialId).toBe(BAGLAYICI);
    expect(r.masters[0].reason).toBe("ok");
  });

  it("açık sipariş rezervi kapasiteyi düşürür", () => {
    // 15 adet sipariş = 1200 ml bağlayıcı rezerve → ATP 800 → 800/80 = 10
    const r = computeCapacity({
      ...base,
      materials: [
        mat(PIGMENT, "Candy Red pigment", "hammadde", 500),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 2000, { reservedQty: 1200 }),
      ],
    });
    expect(r.masters[0].buildable).toBe(10);
  });

  it("hammadde bitince sıfır döner", () => {
    const r = computeCapacity({
      ...base,
      materials: [
        mat(PIGMENT, "Candy Red pigment", "hammadde", 0),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 2000),
      ],
    });
    expect(r.masters[0].buildable).toBe(0);
    expect(r.masters[0].bottleneck?.materialId).toBe(PIGMENT);
  });

  it("fire payı kapasiteyi düşürür (iyimser hesap engellenir)", () => {
    const withWaste = {
      ...base,
      formulas: [{ ...base.formulas[0], wastePercent: 20 }],
      materials: [
        mat(PIGMENT, "pigment", "hammadde", 500),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 2000),
      ],
    };
    // 80 ml yerine 80/0.8 = 100 ml gerekir → 2000/100 = 20
    expect(computeCapacity(withWaste).masters[0].buildable).toBe(20);
  });

  it("masraf kalemleri kapasiteyi kısıtlamaz", () => {
    const r = computeCapacity({
      ...base,
      formulas: [
        {
          ...base.formulas[0],
          inputs: [...base.formulas[0].inputs, { inputMaterialId: 9, qtyPerBase: 1 }],
        },
      ],
      materials: [
        mat(PIGMENT, "pigment", "hammadde", 500),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", 2000),
        mat(9, "MASRAF 1", "masraf", 0),
      ],
    });
    expect(r.masters[0].buildable).toBe(25);
  });

  it("reçetesi olmayan master sıfır ve sebebi bildirilir", () => {
    const r = computeCapacity({
      ...base,
      materials: [],
      masters: [{ id: 1, formulaId: null, formulaScale: 1, packagingId: null }],
    });
    expect(r.masters[0]).toMatchObject({ buildable: 0, reason: "recete_yok" });
  });
});

describe("computeCapacity — çok seviyeli BOM (hammadde → harç → r2u → mamul)", () => {
  const setup = (stok: Partial<Record<number, number>>) =>
    computeCapacity({
      materials: [
        mat(PIGMENT, "Candy Red pigment", "hammadde", stok[PIGMENT] ?? 0),
        mat(BAGLAYICI, "Bağlayıcı", "hammadde", stok[BAGLAYICI] ?? 0),
        mat(SOLVENT, "Solvent", "hammadde", stok[SOLVENT] ?? 0),
        mat(TINER, "Tiner", "hammadde", stok[TINER] ?? 0),
        mat(HARC, "Candy Red harcı", "yari_mamul", stok[HARC] ?? 0),
        mat(R2U, "Candy Red r2u", "yari_mamul", stok[R2U] ?? 0),
        mat(SISE100, "100 ML PET", "ambalaj", stok[SISE100] ?? 9999),
        mat(KAPAK, "Kapak", "ambalaj", stok[KAPAK] ?? 9999),
        mat(ETIKET, "Etiket", "ambalaj", stok[ETIKET] ?? 9999),
      ],
      formulas: [harcFormula, r2uFormula, mamulFormula],
      packagings: [pack100],
      masters: [{ id: 1, formulaId: 102, formulaScale: 0.1, packagingId: 1 }],
    });

  it("zinciri sonuna kadar çözer — hammaddeden mamule", () => {
    // pigment 1000/0,05 = 20.000 · bağlayıcı 16000/0,8 = 20.000 · solvent bol
    // → 20.000 ml harç. r2u: harç 20000/0,6 = 33.333 · tiner 20000/0,4 = 50.000
    // → 33.333 ml r2u. Mamul 100 ml/adet → 333 adet.
    const r = setup({ [PIGMENT]: 1000, [BAGLAYICI]: 16000, [SOLVENT]: 9999, [TINER]: 20000 });
    expect(r.masters[0].buildable).toBe(333);
    expect(r.masters[0].reason).toBe("ok");
  });

  it("elde duran yarı mamul kapasiteye eklenir (stok + üretilebilir)", () => {
    // Hammadde yok ama 5000 ml hazır r2u var → 5000/100 = 50 adet
    const r = setup({ [R2U]: 5000 });
    expect(r.masters[0].buildable).toBe(50);
  });

  it("ara seviyedeki hammadde bitince tüm zincir sıfırlanır", () => {
    const r = setup({ [PIGMENT]: 0, [BAGLAYICI]: 16000, [TINER]: 20000 });
    expect(r.masters[0].buildable).toBe(0);
  });

  it("boya bol olsa da şişe yoksa üretilemez", () => {
    const r = setup({
      [PIGMENT]: 1000,
      [BAGLAYICI]: 16000,
      [SOLVENT]: 9999,
      [TINER]: 20000,
      [SISE100]: 3,
    });
    expect(r.masters[0].buildable).toBe(3);
    expect(r.masters[0].bottleneck?.materialId).toBe(SISE100);
  });

  it("etiket gibi ikincil ambalaj kalemi de darboğaz olabilir", () => {
    const r = setup({
      [PIGMENT]: 1000,
      [BAGLAYICI]: 16000,
      [SOLVENT]: 9999,
      [TINER]: 20000,
      [ETIKET]: 7,
    });
    expect(r.masters[0].buildable).toBe(7);
    expect(r.masters[0].bottleneck?.materialId).toBe(ETIKET);
  });
});

describe("computeCapacity — döngü koruması", () => {
  it("birbirini besleyen reçeteleri yakalar ve sayı uydurmaz", () => {
    const r = computeCapacity({
      materials: [
        mat(HARC, "A harcı", "yari_mamul", 0),
        mat(R2U, "B harcı", "yari_mamul", 0),
      ],
      formulas: [
        { id: 100, outputType: "yari_mamul", outputMaterialId: HARC, baseQty: 1000, inputs: [{ inputMaterialId: R2U, qtyPerBase: 500 }] },
        { id: 101, outputType: "yari_mamul", outputMaterialId: R2U, baseQty: 1000, inputs: [{ inputMaterialId: HARC, qtyPerBase: 500 }] },
        { id: 102, outputType: "mamul", outputMaterialId: null, baseQty: 1000, inputs: [{ inputMaterialId: HARC, qtyPerBase: 1000 }] },
      ],
      packagings: [],
      masters: [{ id: 1, formulaId: 102, formulaScale: 1, packagingId: null }],
    });
    expect(r.cycles.length).toBe(1);
    expect(r.cycles[0].sort()).toEqual([HARC, R2U]);
    expect(r.masters[0]).toMatchObject({ buildable: 0, reason: "dongu" });
  });
});

describe("bottleneckReport — alım önceliği", () => {
  it("en çok ürünü sıfırlayan kalemi başa koyar", () => {
    const materials = [
      mat(PIGMENT, "Pigment", "hammadde", 1000),
      mat(BAGLAYICI, "Bağlayıcı", "hammadde", 0),
    ];
    const f = (id: number, m: number): CapacityFormula => ({
      id,
      outputType: "mamul",
      outputMaterialId: null,
      baseQty: 1000,
      inputs: [{ inputMaterialId: m, qtyPerBase: 100 }],
    });
    const r = computeCapacity({
      materials,
      formulas: [f(100, BAGLAYICI), f(101, BAGLAYICI), f(102, PIGMENT)],
      packagings: [],
      masters: [
        { id: 1, formulaId: 100, formulaScale: 1, packagingId: null },
        { id: 2, formulaId: 101, formulaScale: 1, packagingId: null },
        { id: 3, formulaId: 102, formulaScale: 1, packagingId: null },
      ],
    });
    const rows = bottleneckReport(r);
    expect(rows[0].materialId).toBe(BAGLAYICI);
    expect(rows[0].zeroedMasters).toBe(2);
  });
});

describe("listingQty — ilana yazılacak miktar", () => {
  it("tavanı aşmaz", () => {
    expect(listingQty(600, 10)).toBe(10);
    expect(listingQty(40, 10)).toBe(10);
  });
  it("kritik bölgede gerçek sayıyı gösterir", () => {
    expect(listingQty(3, 10)).toBe(3);
  });
  it("kapasite yoksa ilan kapanır", () => {
    expect(listingQty(0, 10)).toBe(0);
    expect(listingQty(-5, 10)).toBe(0);
  });
});
