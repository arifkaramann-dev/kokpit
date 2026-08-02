import { describe, expect, it } from "vitest";
import { auditRecipes, volumeFromName, type AuditMaterial } from "./recipeAudit";

const materials: AuditMaterial[] = [
  { id: 1, name: "Kırmızı pigment", type: "hammadde", unit: "gr", unitCost: 2 },
  { id: 2, name: "100 ml PET şişe", type: "ambalaj", unit: "adet", unitCost: 4 },
  { id: 3, name: "Tiner", type: "hammadde", unit: "lt", unitCost: 120 },
];

const base = {
  formulas: [
    {
      id: 10,
      name: "CANDY kırmızı",
      outputType: "mamul" as const,
      baseQty: 1000,
      baseUnit: "ml",
      inputs: [{ inputMaterialId: 1, qtyPerBase: 250, unit: "gr" }],
    },
  ],
  materials,
  packagings: [{ id: 20, name: "100 ML PET", volumeMl: 100, isActive: true, unitCost: 4 }],
  masters: [
    { id: 30, internalSku: "AOC-CND-100", formulaId: 10, formulaScale: 0.1, packagingId: 20 },
  ],
};

describe("volumeFromName", () => {
  it("ambalaj adından hacmi çıkarır", () => {
    expect(volumeFromName("100 ML PET")).toBe(100);
    expect(volumeFromName("SPREY 400ML")).toBe(400);
    expect(volumeFromName("5 LT BİDON")).toBe(5000);
  });

  it("hacim yoksa null döner", () => {
    expect(volumeFromName("RÖTUŞ KUTUSU")).toBeNull();
  });
});

describe("auditRecipes", () => {
  it("sağlıklı katalogda hata bulmaz", () => {
    expect(auditRecipes(base).issues).toHaveLength(0);
  });

  it("reçetedeki ambalaj kalemini yakalar — hacimle ölçekleniyor", () => {
    const r = auditRecipes({
      ...base,
      formulas: [
        {
          ...base.formulas[0],
          inputs: [
            { inputMaterialId: 1, qtyPerBase: 250, unit: "gr" },
            { inputMaterialId: 2, qtyPerBase: 1, unit: "adet" },
          ],
        },
      ],
    });
    const hit = r.issues.find(i => i.kind === "ambalaj_recetede");
    expect(hit).toBeDefined();
    expect(hit?.materialId).toBe(2);
    expect(hit?.affectedMasters).toBe(1);
  });

  it("1 litre olmayan bazı yakalar (patronun 0,5 / 0,2 şikâyeti)", () => {
    const r = auditRecipes({
      ...base,
      formulas: [{ ...base.formulas[0], baseQty: 500 }],
      // 500 ml baz + 100 ml ambalaj → doğru ölçek 0,2; master'da 0,1 yazıyor.
      masters: [{ ...base.masters[0], formulaScale: 0.2 }],
    });
    expect(r.counts.baz_litre_degil).toBe(1);
  });

  it("reçete düzenlenip ürünler bağlanmayınca eskimiş ölçeği yakalar", () => {
    const r = auditRecipes({
      ...base,
      masters: [{ ...base.masters[0], formulaScale: 0.5 }],
    });
    const hit = r.issues.find(i => i.kind === "olcek_eskimis");
    expect(hit).toBeDefined();
    expect(hit?.message).toContain("0.1");
  });

  it("hacmi girilmemiş ambalajı adından tahminle bildirir", () => {
    const r = auditRecipes({
      ...base,
      packagings: [{ id: 20, name: "100 ML PET", volumeMl: 0, isActive: true, unitCost: 4 }],
      masters: [{ ...base.masters[0], formulaScale: 1 }],
    });
    expect(r.counts.ambalaj_hacimsiz).toBe(1);
  });

  it("maliyeti sıfır ambalajı bildirir", () => {
    const r = auditRecipes({
      ...base,
      packagings: [{ id: 20, name: "100 ML PET", volumeMl: 100, isActive: true, unitCost: 0 }],
    });
    expect(r.counts.ambalaj_maliyetsiz).toBe(1);
  });

  it("çevrilemeyen birimi yakalar — gr ↔ lt", () => {
    const r = auditRecipes({
      ...base,
      formulas: [
        { ...base.formulas[0], inputs: [{ inputMaterialId: 3, qtyPerBase: 250, unit: "gr" }] },
      ],
    });
    expect(r.counts.birim_uyusmuyor).toBe(1);
  });

  it("kullanılmayan ambalaj için uyarı üretmez — gürültü yapmaz", () => {
    const r = auditRecipes({
      ...base,
      packagings: [
        ...base.packagings,
        { id: 21, name: "30 ML CAM", volumeMl: 0, isActive: true, unitCost: 0 },
      ],
    });
    expect(r.issues.filter(i => i.packagingId === 21)).toHaveLength(0);
  });

  it("arşiv master'ları hatayı büyütmez", () => {
    const r = auditRecipes({
      ...base,
      masters: [{ ...base.masters[0], formulaScale: 0.5, status: "arsiv" }],
    });
    expect(r.counts.olcek_eskimis).toBe(0);
  });
});
