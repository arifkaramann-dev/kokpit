import { describe, expect, it } from "vitest";
import { matchAttributeValues } from "./attributeMatch";

/**
 * Yanlış eşleşme canlıda pahalı: ürün yanlış renkle listelenir ya da kart
 * reddedilir. Bu yüzden testler "eşleşti mi?" kadar "yanlış eşleşmedi mi?"ye
 * de bakar.
 */
describe("matchAttributeValues", () => {
  it("birebir adı tam güvenle eşler", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "Fuşya" }],
      [
        { valueId: 90, valueName: "Sarı" },
        { valueId: 91, valueName: "Fuşya" },
      ],
    );
    expect(r.proposals).toEqual([
      { dimensionId: 1, dimensionName: "Fuşya", valueId: 91, valueName: "Fuşya", confidence: "tam" },
    ]);
    expect(r.unmatched).toEqual([]);
  });

  it("büyük/küçük harf ve Türkçe karakter farkını yutar", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "AÇIK MAVİ" }],
      [{ valueId: 5, valueName: "açık mavi" }],
    );
    expect(r.proposals[0]).toMatchObject({ valueId: 5, confidence: "tam" });
  });

  it("kelime sırası farkını tam eşleşme sayar", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "Mavi Açık" }],
      [{ valueId: 7, valueName: "Açık Mavi" }],
    );
    expect(r.proposals[0]).toMatchObject({ valueId: 7, confidence: "tam" });
  });

  it("kapsayan adı yakın güvenle önerir", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "Fuşya" }],
      [{ valueId: 12, valueName: "Fuşya Pembe" }],
    );
    expect(r.proposals[0]).toMatchObject({ valueId: 12, confidence: "yakin" });
  });

  it("kapsamada en az varsayımlı adayı seçer", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "Fuşya" }],
      [
        { valueId: 30, valueName: "Fuşya Pembe Koyu Mat" },
        { valueId: 31, valueName: "Fuşya Pembe" },
      ],
    );
    expect(r.proposals[0].valueId).toBe(31);
  });

  it("tam eşleşme, kapsamaya kapılmaz", () => {
    // "Mavi" boyutu "Açık Mavi"ye gitmemeli: kendi birebir karşılığı var.
    const r = matchAttributeValues(
      [
        { id: 1, name: "Açık Mavi" },
        { id: 2, name: "Mavi" },
      ],
      [
        { valueId: 40, valueName: "Mavi" },
        { valueId: 41, valueName: "Açık Mavi" },
      ],
    );
    const byDim = new Map(r.proposals.map(p => [p.dimensionId, p.valueId]));
    expect(byDim.get(1)).toBe(41);
    expect(byDim.get(2)).toBe(40);
  });

  it("bir pazaryeri değerini iki boyuta birden vermez", () => {
    const r = matchAttributeValues(
      [
        { id: 1, name: "Kırmızı" },
        { id: 2, name: "Kırmızı" },
      ],
      [{ valueId: 50, valueName: "Kırmızı" }],
    );
    expect(r.proposals).toHaveLength(1);
    expect(r.unmatched).toHaveLength(1);
  });

  it("karşılığı olmayanı eşleşmemiş bırakır — uydurmaz", () => {
    const r = matchAttributeValues(
      [{ id: 1, name: "Candy Red" }],
      [{ valueId: 60, valueName: "Sarı" }],
    );
    expect(r.proposals).toEqual([]);
    expect(r.unmatched).toEqual([{ id: 1, name: "Candy Red" }]);
  });

  it("seçenek listesi boşken hepsi eşleşmemiş kalır", () => {
    const r = matchAttributeValues([{ id: 1, name: "Fuşya" }], []);
    expect(r.proposals).toEqual([]);
    expect(r.unmatched).toHaveLength(1);
  });
});
