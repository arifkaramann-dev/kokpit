import { describe, expect, it } from "vitest";
import type { CapacityFormula } from "./capacity";
import { computeMasterCosts, marginOf, resolveUnitCosts, type CostMaterial } from "./costing";
import { masterHealth, rollupBySeries, type HealthListing } from "./masterHealth";

const PIGMENT = 1;
const BAGLAYICI = 2;
const SISE = 3;
const ETIKET = 4;
const HARC = 20;

const mat = (
  id: number,
  name: string,
  type: CostMaterial["type"],
  unitCost: number,
): CostMaterial => ({ id, name, type, unitCost });

/** 1000 ml harç = 50 gr pigment (2 ₺/gr) + 900 ml bağlayıcı (0,1 ₺/ml) */
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

const mamul: CapacityFormula = {
  id: 101,
  outputType: "mamul",
  outputMaterialId: null,
  baseQty: 1000,
  inputs: [{ inputMaterialId: HARC, qtyPerBase: 1000 }],
};

const materials = [
  mat(PIGMENT, "Pigment", "hammadde", 2),
  mat(BAGLAYICI, "Bağlayıcı", "hammadde", 0.1),
  mat(HARC, "Candy Red harcı", "yari_mamul", 0),
  mat(SISE, "100 ML PET", "ambalaj", 3.5),
  mat(ETIKET, "Etiket", "ambalaj", 0.4),
];

describe("resolveUnitCosts — yarı mamul maliyeti reçeteden türer", () => {
  it("zinciri çözer", () => {
    // 50×2 + 900×0,1 = 190 ₺ / 1000 ml → 0,19 ₺/ml
    const unit = resolveUnitCosts(materials, [harc, mamul]);
    expect(unit.get(HARC)).toBeCloseTo(0.19);
  });

  it("fire maliyeti yükseltir — aynı çıktı için daha çok girdi harcanır", () => {
    const unit = resolveUnitCosts(materials, [{ ...harc, wastePercent: 20 }]);
    expect(unit.get(HARC)).toBeCloseTo(0.19 / 0.8);
  });

  it("hammadde fiyatı olduğu gibi kalır", () => {
    const unit = resolveUnitCosts(materials, [harc]);
    expect(unit.get(PIGMENT)).toBe(2);
  });

  it("döngüde sonsuza gitmez", () => {
    const a: CapacityFormula = {
      id: 1, outputType: "yari_mamul", outputMaterialId: 20, baseQty: 1000,
      inputs: [{ inputMaterialId: 21, qtyPerBase: 1 }],
    };
    const b: CapacityFormula = {
      id: 2, outputType: "yari_mamul", outputMaterialId: 21, baseQty: 1000,
      inputs: [{ inputMaterialId: 20, qtyPerBase: 1 }],
    };
    const unit = resolveUnitCosts(
      [mat(20, "A", "yari_mamul", 0), mat(21, "B", "yari_mamul", 0)],
      [a, b],
    );
    expect(unit.get(20)).toBe(0);
  });
});

describe("computeMasterCosts", () => {
  const pack = { id: 1, materialId: SISE, inputs: [{ materialId: ETIKET, qtyPerUnit: 1 }] };
  const master = { id: 1, formulaId: 101, formulaScale: 0.1, packagingId: 1 };

  it("boya hacimle ölçeklenir, ambalaj adet başına sabittir", () => {
    const [c] = computeMasterCosts({
      masters: [master],
      materials,
      formulas: [harc, mamul],
      packagings: [pack],
    });
    // 100 ml × 0,19 = 19 ₺ boya · 3,5 + 0,4 = 3,9 ₺ ambalaj
    expect(c.materialCost).toBeCloseTo(19);
    expect(c.packagingCost).toBeCloseTo(3.9);
    expect(c.totalCost).toBeCloseTo(22.9);
  });

  it("büyük ambalaj boya maliyetini orantılı artırır", () => {
    const [c] = computeMasterCosts({
      masters: [{ ...master, formulaScale: 0.5 }],
      materials,
      formulas: [harc, mamul],
      packagings: [pack],
    });
    expect(c.materialCost).toBeCloseTo(95);
  });

  it("fiyatı bilinmeyen kalemi bildirir — maliyet sessizce eksik çıkmaz", () => {
    const [c] = computeMasterCosts({
      masters: [master],
      materials: [...materials.filter(m => m.id !== SISE), mat(SISE, "100 ML PET", "ambalaj", 0)],
      formulas: [harc, mamul],
      packagings: [pack],
    });
    expect(c.unknownInputs).toContain("100 ML PET");
  });

  it("masraf kalemleri birim maliyete girmez", () => {
    const [c] = computeMasterCosts({
      masters: [master],
      materials: [...materials, mat(9, "MASRAF 1", "masraf", 999)],
      formulas: [harc, { ...mamul, inputs: [...mamul.inputs, { inputMaterialId: 9, qtyPerBase: 1 }] }],
      packagings: [pack],
    });
    expect(c.materialCost).toBeCloseTo(19);
  });

  it("reçetesiz master sıfır maliyet döner", () => {
    const [c] = computeMasterCosts({
      masters: [{ id: 5, formulaId: null, formulaScale: 1, packagingId: null }],
      materials,
      formulas: [],
      packagings: [],
    });
    expect(c.totalCost).toBe(0);
  });
});

describe("marginOf", () => {
  it("kâr ve marj hesaplar", () => {
    expect(marginOf(100, 22.9)).toEqual({ profit: 77.1, marginPercent: 77.1 });
  });
  it("zarar negatif çıkar", () => {
    expect(marginOf(20, 30).profit).toBe(-10);
  });
  it("fiyat yoksa marj sıfır", () => {
    expect(marginOf(0, 30).marginPercent).toBe(0);
  });
});

/* ------------------------------ Ürün takibi ------------------------------- */

const listing = (p: Partial<HealthListing> = {}): HealthListing => ({
  id: 1,
  masterId: 1,
  useCaseId: 1,
  title: "Artofcolour Candy Red Boyası",
  shortDescription: "kısa",
  longDescription: null,
  status: "aktif",
  imageCount: 2,
  ...p,
});

const fullMaster = {
  master: {
    id: 1,
    formulaId: 101,
    buildableQty: 40,
    stockQty: 0,
    gtin: "8691960000015",
    status: "aktif" as const,
  },
  listings: [listing()],
  channelListings: [{ listingId: 1, masterId: 1, channelId: 1, status: "canli" as const }],
  allUseCaseIds: [1, 2, 3],
  allChannelIds: [1, 2],
  costKnown: true,
  hasPrice: true,
};

describe("masterHealth — eksikler ve açılmamış pazar", () => {
  it("tam kart %100", () => {
    expect(masterHealth(fullMaster).score).toBe(100);
    expect(masterHealth(fullMaster).missing).toEqual([]);
  });

  it("eksikleri kullanıcı diliyle sayar", () => {
    const h = masterHealth({
      ...fullMaster,
      master: { ...fullMaster.master, formulaId: null, buildableQty: 0, stockQty: 0 },
      costKnown: false,
    });
    expect(h.missing).toContain("Reçete bağlı değil");
    expect(h.missing).toContain("Stok yok");
    expect(h.missing).toContain("Maliyet bilinmiyor");
    expect(h.score).toBeLessThan(100);
  });

  /*
   * Hammadde defteri tamamlanmadan katalog kullanılabilir olmalı: raftaki
   * mamul elle girilince ürün satılabilirdir, kapasite hesabı 0 olsa bile.
   * Kontrol yalnız buildableQty'ye bakarken elle stoklanan her ürün kırmızı
   * kalıyordu.
   */
  it("elle girilen raf stoğu kapasite yerine geçer", () => {
    const h = masterHealth({
      ...fullMaster,
      master: { ...fullMaster.master, buildableQty: 0, stockQty: 12 },
    });
    expect(h.missing).not.toContain("Stok yok");
  });

  it("ne stok ne kapasite varsa stok eksiği yazar", () => {
    const h = masterHealth({
      ...fullMaster,
      master: { ...fullMaster.master, buildableQty: 0, stockQty: 0 },
    });
    expect(h.missing).toContain("Stok yok");
  });

  it("barkodsuz ürünü yakalar", () => {
    const h = masterHealth({ ...fullMaster, master: { ...fullMaster.master, gtin: "  " } });
    expect(h.missing).toContain("Barkod yok");
  });

  it("açılmamış kullanım alanlarını fırsat olarak listeler", () => {
    // 3 kullanım alanı var, yalnız 1'i kullanılmış
    expect(masterHealth(fullMaster).openUseCaseIds).toEqual([2, 3]);
  });

  it("yayına alınmamış kanalları listeler", () => {
    expect(masterHealth(fullMaster).openChannelIds).toEqual([2]);
  });

  it("ilanı olan ama metni boş kartı yakalar", () => {
    const h = masterHealth({
      ...fullMaster,
      listings: [listing({ shortDescription: null, longDescription: null })],
    });
    expect(h.missing).toContain("İlan metni boş");
  });

  it("görselsiz ilanı yakalar", () => {
    const h = masterHealth({ ...fullMaster, listings: [listing({ imageCount: 0 })] });
    expect(h.missing).toContain("Görsel yok");
  });

  it("taslak yayın canlı sayılmaz", () => {
    const h = masterHealth({
      ...fullMaster,
      channelListings: [{ listingId: 1, masterId: 1, channelId: 1, status: "taslak" }],
    });
    expect(h.liveCount).toBe(0);
    expect(h.missing).toContain("Hiçbir kanalda yayında değil");
  });
});

describe("rollupBySeries — seri bazlı takip", () => {
  it("en zayıf seriyi başa koyar", () => {
    const h = (score: number, listingCount: number) => ({
      masterId: 1, score, missing: [], checkCount: 9, openUseCaseIds: [], openChannelIds: [],
      listingCount, liveCount: 0,
    });
    const rows = rollupBySeries([
      { seriesId: 10, health: h(100, 2), buildable: 5, stockQty: 0 },
      { seriesId: 20, health: h(40, 0), buildable: 0, stockQty: 0 },
      { seriesId: 20, health: h(60, 1), buildable: 3, stockQty: 0 },
    ]);
    expect(rows[0].seriesId).toBe(20);
    expect(rows[0].avgScore).toBe(50);
    expect(rows[0].withoutListing).toBe(1);
    expect(rows[0].notBuildable).toBe(1);
  });

  it("raf stoğu olan ürün satılamaz sayılmaz", () => {
    const h = (score: number) => ({
      masterId: 1, score, missing: [], checkCount: 9, openUseCaseIds: [], openChannelIds: [],
      listingCount: 1, liveCount: 0,
    });
    const rows = rollupBySeries([
      { seriesId: 30, health: h(50), buildable: 0, stockQty: 8 },
      { seriesId: 30, health: h(50), buildable: 0, stockQty: 0 },
    ]);
    expect(rows[0].notBuildable).toBe(1);
  });
});

/* ── Birim dönüşümü ───────────────────────────────────────────────────────
 *
 * Katalogda "Airbrush · 100 ml" için ₺124.500 maliyet görünüyordu. Sebep:
 * reçete satırı gram cinsinden yazılmıştı ama kalem kilo başına fiyatlıydı ve
 * kod ikisini birimsiz çarpıyordu. Bu blok o hatayı yerine çiviler.
 */

const PIGMENT_KG = 50;

describe("maliyet — reçete satırı ile kalem birimi farklı olduğunda", () => {
  const kiloFiyatli: CostMaterial[] = [
    // Pigment kilo başına ₺500, stokta kg cinsinden tutuluyor.
    { id: PIGMENT_KG, name: "Pigment (kg)", type: "hammadde", unitCost: 500, unit: "kg" },
  ];

  /** 1000 ml boya = 250 gr pigment. Doğru maliyet: 0,25 kg × 500 = ₺125. */
  const receteGram: CapacityFormula = {
    id: 200,
    outputType: "mamul",
    outputMaterialId: null,
    baseQty: 1000,
    baseUnit: "ml",
    inputs: [{ inputMaterialId: PIGMENT_KG, qtyPerBase: 250, unit: "gr" }],
  };

  it("gram yazılmış satırı kilo fiyatına çevirir — 1000× hatası biter", () => {
    const [cost] = computeMasterCosts({
      masters: [{ id: 1, formulaId: 200, formulaScale: 1, packagingId: null }],
      materials: kiloFiyatli,
      formulas: [receteGram],
      packagings: [],
    });
    expect(cost.materialCost).toBeCloseTo(125);
    expect(cost.unitMismatches).toEqual([]);
  });

  it("ambalaj hacmine göre ölçeklenir ama birim çevrimi bozulmaz", () => {
    // 100 ml şişe = baz hacmin onda biri → ₺12,50
    const [cost] = computeMasterCosts({
      masters: [{ id: 1, formulaId: 200, formulaScale: 0.1, packagingId: null }],
      materials: kiloFiyatli,
      formulas: [receteGram],
      packagings: [],
    });
    expect(cost.materialCost).toBeCloseTo(12.5);
  });

  it("birimsiz eski satır eski davranışı korur", () => {
    const eski: CapacityFormula = {
      ...receteGram,
      inputs: [{ inputMaterialId: PIGMENT_KG, qtyPerBase: 0.25 }],
    };
    const [cost] = computeMasterCosts({
      masters: [{ id: 1, formulaId: 200, formulaScale: 1, packagingId: null }],
      materials: kiloFiyatli,
      formulas: [eski],
      packagings: [],
    });
    expect(cost.materialCost).toBeCloseTo(125);
  });

  it("çevrilemeyen birimi bildirir, sayıyı sessizce bozmaz", () => {
    const uyumsuz: CapacityFormula = {
      ...receteGram,
      inputs: [{ inputMaterialId: PIGMENT_KG, qtyPerBase: 250, unit: "ml" }],
    };
    const [cost] = computeMasterCosts({
      masters: [{ id: 1, formulaId: 200, formulaScale: 1, packagingId: null }],
      materials: kiloFiyatli,
      formulas: [uyumsuz],
      packagings: [],
    });
    expect(cost.unitMismatches).toEqual(["Pigment (kg)"]);
  });

  it("yarı mamul birim maliyeti çıktının kendi biriminde çıkar", () => {
    // Reçete 1000 ml üretiyor ama harç stokta lt cinsinden tutuluyor:
    // 250 gr × ₺500/kg = ₺125 → 1 lt için ₺125, 1 ml için değil.
    const HARC_LT = 51;
    const harcLt: CapacityFormula = {
      id: 201,
      outputType: "yari_mamul",
      outputMaterialId: HARC_LT,
      baseQty: 1000,
      baseUnit: "ml",
      inputs: [{ inputMaterialId: PIGMENT_KG, qtyPerBase: 250, unit: "gr" }],
    };
    const unit = resolveUnitCosts(
      [...kiloFiyatli, { id: HARC_LT, name: "Harç", type: "yari_mamul", unitCost: 0, unit: "lt" }],
      [harcLt],
    );
    expect(unit.get(HARC_LT)).toBeCloseTo(125);
  });
});
