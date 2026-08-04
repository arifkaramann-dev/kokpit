import { describe, expect, it } from "vitest";
import {
  findAttributeArray,
  normalizeHepsiburadaAttributes,
  normalizeTrendyolAttributes,
} from "./modules/katalog";

/**
 * Pazaryeri yanıtlarının ayrıştırılması.
 *
 * Canlıda "rows is not iterable" ile çöktü: sabit alan adına güvenilmişti,
 * gelen şey dizi değil nesneydi. Ayrıştırıcı beklenmedik gövdede ÇÖKMEMELİ —
 * boş dönüp kullanıcıya anlaşılır hata verilmeli.
 */
describe("findAttributeArray", () => {
  it("düz diziyi bulur", () => {
    expect(findAttributeArray([{ id: 1, name: "Renk" }])).toHaveLength(1);
  });

  it("sarmalanmış diziyi bulur", () => {
    expect(findAttributeArray({ data: [{ id: 1, name: "Renk" }] })).toHaveLength(1);
  });

  it("bir seviye daha derindeki diziyi bulur", () => {
    // HB sarmalayıcıyı değiştirdiğinde çöken durum buydu.
    expect(findAttributeArray({ data: { attributes: [{ id: 3, name: "Hacim" }] } })).toHaveLength(1);
  });

  it("alan adı bilinmese de özellik dizisini tanır", () => {
    expect(findAttributeArray({ payload: { list: [{ id: 9, name: "Ürün Tipi" }] } })).toHaveLength(1);
  });

  it("özelliğe benzemeyen diziyi almaz", () => {
    expect(findAttributeArray({ tags: ["a", "b"], items: [{ foo: 1 }] })).toEqual([]);
  });

  it("beklenmedik gövdede çökmez, boş döner", () => {
    expect(findAttributeArray(null)).toEqual([]);
    expect(findAttributeArray("bozuk")).toEqual([]);
    expect(findAttributeArray(42)).toEqual([]);
    expect(findAttributeArray({})).toEqual([]);
  });
});

describe("normalizeTrendyolAttributes", () => {
  it("özelliği ve izin verilen değerleri çıkarır", () => {
    const r = normalizeTrendyolAttributes({
      categoryAttributes: [
        {
          attribute: { id: 47, name: "Renk" },
          required: true,
          attributeValues: [
            { id: 100, name: "Kırmızı" },
            { id: 101, name: "Fuşya" },
          ],
        },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ attributeId: 47, attributeName: "Renk", isRequired: true });
    // Değerler eskiden atılıyordu; eşlemeyi seçilebilir yapan şey bu liste.
    expect(r[0].options).toEqual([
      { valueId: 100, valueName: "Kırmızı" },
      { valueId: 101, valueName: "Fuşya" },
    ]);
  });

  it("değer listesi olmayan özellik boş seçenekle gelir", () => {
    const r = normalizeTrendyolAttributes({
      categoryAttributes: [{ attribute: { id: 5, name: "Menşei" }, required: false }],
    });
    expect(r[0].options).toEqual([]);
  });

  it("kimliksiz satırı atar", () => {
    const r = normalizeTrendyolAttributes({
      categoryAttributes: [{ attribute: { name: "Kimliksiz" } }],
    });
    expect(r).toEqual([]);
  });

  it("beklenmedik gövdede çökmez", () => {
    expect(normalizeTrendyolAttributes(null)).toEqual([]);
    expect(normalizeTrendyolAttributes({})).toEqual([]);
  });
});

describe("normalizeHepsiburadaAttributes", () => {
  it("mandatory alanını zorunluluk olarak okur", () => {
    const r = normalizeHepsiburadaAttributes({
      data: [{ id: 12, name: "Renk", mandatory: true, values: [{ id: 7, name: "Mavi" }] }],
    });
    expect(r[0]).toMatchObject({ attributeId: 12, attributeName: "Renk", isRequired: true });
    expect(r[0].options).toEqual([{ valueId: 7, valueName: "Mavi" }]);
  });

  it("iki seviye derin sarmalayıcıyı okur", () => {
    const r = normalizeHepsiburadaAttributes({
      data: { attributes: [{ id: 4, name: "Hacim", required: false }] },
    });
    expect(r).toHaveLength(1);
    expect(r[0].isRequired).toBe(false);
  });

  it("beklenmedik gövdede çökmez — canlıda burası patlamıştı", () => {
    expect(normalizeHepsiburadaAttributes({ data: { message: "yok" } })).toEqual([]);
    expect(normalizeHepsiburadaAttributes(null)).toEqual([]);
    expect(normalizeHepsiburadaAttributes("bozuk")).toEqual([]);
  });
});
