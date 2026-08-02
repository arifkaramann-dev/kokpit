import { describe, expect, it } from "vitest";
import {
  normalizeName,
  planRestructure,
  type ExistingMaster,
  type TargetType,
} from "./catalogRestructure";

/*
 * Art of Colour'ın gerçek durumu: CANDY serisi 15 renk, 300 varyant.
 * Hedef 3 ürün tipi × ambalaj = renk başına 9 SKU → 135.
 */

const families = [
  { id: 1, name: "Boya", isActive: true },
  { id: 2, name: "Airbrush", isActive: true },
  { id: 3, name: "Sprey", isActive: true },
  { id: 4, name: "Rötuş", isActive: true },
];

const packagings = [
  { id: 10, name: "30 ML", isActive: true },
  { id: 11, name: "100 ml", isActive: true },
  { id: 12, name: "250 ml", isActive: true },
  { id: 13, name: "500 ML", isActive: true },
  { id: 14, name: "SPREY 400ML", isActive: true },
  { id: 15, name: "30 ml (ReadyToUse)", isActive: true },
];

const target: TargetType[] = [
  { name: "Boya", skuSegment: "by", packagingNames: ["30 ML", "100 ml", "250 ml", "500 ML"] },
  { name: "R2U Boya", skuSegment: "r2u", packagingNames: ["30 ML", "100 ml", "250 ml", "500 ML"] },
  { name: "Sprey Boya", skuSegment: "sp", packagingNames: ["SPREY 400ML"] },
];

const master = (
  id: number,
  familyId: number,
  packagingId: number,
  readiness: "konsantre" | "r2u" = "konsantre",
): ExistingMaster => ({
  id,
  internalSku: `sku${id}`,
  familyId,
  packagingId,
  readiness,
  status: "taslak",
});

const run = (masters: ExistingMaster[] = []) =>
  planRestructure({
    families,
    packagings,
    masters,
    target,
    retirePackagingPatterns: ["readytouse"],
  });

describe("normalizeName", () => {
  it("Türkçe ve boşluk farklarını yok sayar", () => {
    expect(normalizeName("R2U Boya")).toBe(normalizeName("r2u  boya"));
    expect(normalizeName("Rötuş")).toBe("rötuş");
    expect(normalizeName("30 ml (ReadyToUse)")).toBe("30 ml readytouse");
  });
});

describe("planRestructure — ürün tipleri", () => {
  it("eksik ürün tiplerini açar", () => {
    const p = run();
    expect(p.familiesToCreate.map(f => f.name)).toEqual(["R2U Boya", "Sprey Boya"]);
  });

  it("hedefte olmayan tipleri pasife alır", () => {
    // Airbrush artık pazarlama kimliği, Rötuş artık ambalaj — ikisi de tip değil.
    const p = run();
    expect(p.familiesToRetire.map(f => f.name).sort()).toEqual(["Airbrush", "Rötuş", "Sprey"]);
  });

  it("adı zaten doğru olan tipi tekrar açmaz", () => {
    const p = run();
    expect(p.familiesToCreate.map(f => f.name)).not.toContain("Boya");
  });
});

describe("planRestructure — ambalajlar", () => {
  it("mükerrer (ReadyToUse) ambalajını pasife alır", () => {
    const p = run();
    expect(p.packagingsToRetire.map(x => x.name)).toEqual(["30 ml (ReadyToUse)"]);
  });

  it("pasife alınan ambalajı kurala yazmaz", () => {
    const p = run();
    for (const r of p.rules) expect(r.packagingIds).not.toContain(15);
  });

  it("katalogda karşılığı olmayan ambalaj adını bildirir", () => {
    const p = planRestructure({
      families,
      packagings,
      masters: [],
      target: [{ name: "Boya", skuSegment: "by", packagingNames: ["30 ML", "12 ml rötuş"] }],
    });
    expect(p.missingPackagingNames).toEqual(["12 ml rötuş"]);
  });
});

describe("planRestructure — kural ve sayım", () => {
  it("renk başına SKU sayısını hesaplar", () => {
    // Boya 4 + R2U Boya 4 + Sprey Boya 1 = 9
    expect(run().summary.skuPerColor).toBe(9);
  });

  it("henüz açılmamış tip için kuralı familyId'siz döndürür", () => {
    const p = run();
    const r2u = p.rules.find(r => r.familyName === "R2U Boya");
    expect(r2u?.familyId).toBeNull();
    expect(r2u?.packagingIds).toEqual([10, 11, 12, 13]);
  });
});

describe("planRestructure — master arşivleme", () => {
  it("pasife alınan tipin master'ını arşivler", () => {
    const p = run([master(1, 2, 11)]); // Airbrush · 100 ml
    expect(p.mastersToArchive[0].reason).toContain("Ürün tipi artık geçerli değil");
  });

  it("mükerrer ambalajın master'ını arşivler", () => {
    const p = run([master(1, 1, 15)]); // Boya · 30 ml (ReadyToUse)
    expect(p.mastersToArchive[0].reason).toContain("Ambalaj mükerrer");
  });

  it("r2u bayraklı master'ı arşivler — artık ürün tipi", () => {
    const p = run([master(1, 1, 11, "r2u")]);
    expect(p.mastersToArchive[0].reason).toContain("R2U artık ürün tipi");
  });

  it("tipin satılmadığı ambalajı arşivler", () => {
    const p = run([master(1, 1, 14)]); // Boya · SPREY 400ML — Boya sprey satmıyor
    expect(p.mastersToArchive[0].reason).toContain("Bu ürün tipi bu ambalajda satılmıyor");
  });

  it("uyan master'a dokunmaz", () => {
    const p = run([master(1, 1, 11)]); // Boya · 100 ml
    expect(p.mastersToArchive).toHaveLength(0);
    expect(p.summary.mastersKept).toBe(1);
  });

  it("zaten arşivde olanı tekrar saymaz", () => {
    const p = run([{ ...master(1, 2, 11), status: "arsiv" }]);
    expect(p.mastersToArchive).toHaveLength(0);
    expect(p.summary.mastersTotal).toBe(0);
  });

  it("tek master birden çok sebeple arşivlenebilir", () => {
    const p = run([master(1, 2, 15, "r2u")]); // Airbrush · ReadyToUse · r2u
    expect(p.mastersToArchive[0].reason.split(" · ")).toHaveLength(3);
  });

  it("gerçek senaryo: 300'ün çoğu gider, uyanlar kalır", () => {
    const masters: ExistingMaster[] = [];
    let id = 0;
    // Bugünkü üretim: 2 tip (Boya, Airbrush) × 5 ambalaj × 2 readiness
    for (const familyId of [1, 2]) {
      for (const packagingId of [10, 11, 12, 13, 15]) {
        for (const readiness of ["konsantre", "r2u"] as const) {
          masters.push(master(++id, familyId, packagingId, readiness));
        }
      }
    }
    const p = run(masters);
    expect(p.summary.mastersTotal).toBe(20);
    // Sağ kalan: Boya × (30/100/250/500) konsantre = 4
    expect(p.summary.mastersKept).toBe(4);
    expect(p.summary.mastersArchived).toBe(16);
  });
});
