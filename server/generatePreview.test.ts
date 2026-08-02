import { describe, expect, it } from "vitest";
import { previewPairs, suggestFamilyPackagings } from "./generatePreview";

const families = [
  { id: 1, name: "Airbrush" },
  { id: 2, name: "Boya" },
  { id: 3, name: "Sprey" },
];

const packagings = [
  { id: 10, name: "30 ML", volumeMl: 30 },
  { id: 11, name: "100 ml", volumeMl: 100 },
  { id: 12, name: "250 ml", volumeMl: 250 },
  { id: 13, name: "SPREY 400ML", volumeMl: 400 },
];

describe("previewPairs", () => {
  it("kural yoksa form tüm ambalajlarla eşleşir ve bu bildirilir", () => {
    const r = previewPairs({ families, packagings });
    expect(r.pairs).toHaveLength(12); // 3 form × 4 ambalaj
    expect(r.unconstrainedFamilies).toHaveLength(3);
    expect(r.unconstrainedFamilies[0].packagingCount).toBe(4);
  });

  it("sprey formunun sprey olmayan ambalajlarını şüpheli işaretler", () => {
    // Kullanıcının şikayeti: "sprey de 30 100 250 ml almış, oysa sprey sadece 400 ml"
    const r = previewPairs({ families, packagings });
    const spreyKurbanlari = r.suspects.filter(s => s.familyName === "Sprey");
    expect(spreyKurbanlari.map(s => s.packagingName).sort()).toEqual([
      "100 ml",
      "250 ml",
      "30 ML",
    ]);
  });

  it("sprey ambalajını sprey olmayan formlarda da şüpheli işaretler", () => {
    const r = previewPairs({ families, packagings });
    const spreyKutusu = r.suspects.filter(s => s.packagingName === "SPREY 400ML");
    expect(spreyKutusu.map(s => s.familyName).sort()).toEqual(["Airbrush", "Boya"]);
  });

  it("kural tanımlıysa yalnız izinli ambalajlar üretilir, şüpheli kalmaz", () => {
    const rules = new Map([
      [1, new Set([10, 11, 12])],
      [2, new Set([10, 11, 12])],
      [3, new Set([13])],
    ]);
    const r = previewPairs({ families, packagings, familyPackagings: rules });
    expect(r.pairs).toHaveLength(7);
    expect(r.suspects).toHaveLength(0);
    expect(r.unconstrainedFamilies).toHaveLength(0);
  });

  it("hacimden sprey tespiti: adı sprey demese de 400 ml aerosol sayılır", () => {
    const r = previewPairs({
      families: [{ id: 3, name: "Sprey" }],
      packagings: [{ id: 20, name: "400 ML KUTU", volumeMl: 400 }],
    });
    expect(r.suspects).toHaveLength(0);
  });
});

describe("suggestFamilyPackagings", () => {
  it("sprey formuna yalnız sprey ambalajı önerir", () => {
    const s = suggestFamilyPackagings({ families, packagings });
    expect(s.find(x => x.familyName === "Sprey")?.packagingIds).toEqual([13]);
  });

  it("sprey olmayan forma sprey dışı ambalajları önerir", () => {
    const s = suggestFamilyPackagings({ families, packagings });
    expect(s.find(x => x.familyName === "Airbrush")?.packagingIds).toEqual([10, 11, 12]);
  });
});

/*
 * planMasters ile aynı boş-küme yorumu.
 *
 * `masterAudit.allowed()` ve `previewPairs` boş kümeyi "kısıt yok" sayıyordu;
 * `planMasters` ise `allowed ?` yazdığı için boş kümeyi "hiçbir ambalaj"
 * sayıyor ve aynı seri üç yerde üç farklı sonuç veriyordu.
 */
describe("boş kural kümesi", () => {
  it("planMasters ile aynı: boş küme o formu üretim dışı bırakır", () => {
    const r = previewPairs({
      families: [{ id: 1, name: "Airbrush" }],
      packagings: [{ id: 10, name: "30 ML", volumeMl: 30 }],
      familyPackagings: new Map([[1, new Set<number>()]]),
    });
    expect(r.pairs).toHaveLength(0);
    expect(r.unconstrainedFamilies).toHaveLength(0);
  });

  it("kuralı hiç olmayan form tüm ambalajlarla eşleşir", () => {
    const r = previewPairs({
      families: [{ id: 1, name: "Airbrush" }],
      packagings: [{ id: 10, name: "30 ML", volumeMl: 30 }],
      familyPackagings: new Map(),
    });
    expect(r.pairs).toHaveLength(1);
    expect(r.unconstrainedFamilies).toHaveLength(1);
  });
});

/*
 * Mükerrer ambalaj: "30 ml (ReadyToUse)" ile "30 ML" aynı fiziksel şişedir.
 * R2U ürün tipi olduğu için ambalaj adına gömülmemeli; üretime girerse
 * kopya SKU doğurur. Sihirbaz önizlemesi bunu "uygun" gösteriyordu.
 */
describe("mükerrer ReadyToUse ambalajı", () => {
  const fams = [{ id: 1, name: "Boya" }];
  const packs = [
    { id: 10, name: "30 ML", volumeMl: 30 },
    { id: 11, name: "30 ml (ReadyToUse)", volumeMl: 30 },
  ];

  it("şüpheli olarak işaretlenir", () => {
    const r = previewPairs({ families: fams, packagings: packs });
    expect(r.suspects).toHaveLength(1);
    expect(r.suspects[0].packagingName).toBe("30 ml (ReadyToUse)");
    expect(r.suspects[0].reason).toContain("mükerrer");
  });

  it("düz ambalaj şüpheli sayılmaz", () => {
    const r = previewPairs({ families: fams, packagings: packs });
    expect(r.suspects.map(s => s.packagingName)).not.toContain("30 ML");
  });

  it("otomatik kural önerisi mükerrer ambalajı yazmaz", () => {
    const s = suggestFamilyPackagings({ families: fams, packagings: packs });
    expect(s[0].packagingIds).toEqual([10]);
  });
});
