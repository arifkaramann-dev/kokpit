import { describe, expect, it } from "vitest";
import {
  FIRST_COLOR_NO,
  colorCodePrefix,
  formatColorCode,
  isNeutralColor,
  makeColorCodeIndex,
  nextColorNo,
  parseColorNo,
} from "./colorCode";
import { colorsForSeries, seriesForColor } from "./colorScope";

/**
 * Katalog kodu müşteriye giden numaradır: ilanda, etikette ve kargo çıkışında
 * bu okunur. İki kritik kural var — (1) numara renge ait, ön ek ürünün
 * serisinden gelir; aynı yeşil CANDY'de CND, METEOR'da MTR ön eki alır.
 * (2) Numara asla ikinci kez üretilmez.
 */
describe("renk numarası ve katalog kodu", () => {
  it("ön eki temizler ve büyütür", () => {
    expect(colorCodePrefix("cnd")).toBe("CND");
    expect(colorCodePrefix(" mt-r ")).toBe("MTR");
    expect(colorCodePrefix(null)).toBe("AOC");
    expect(colorCodePrefix("")).toBe("AOC");
  });

  it("aynı rengi her seride kendi ön ekiyle yazar", () => {
    expect(formatColorCode("cnd", 1008)).toBe("CND1008");
    expect(formatColorCode("mtr", 1008)).toBe("MTR1008");
    expect(formatColorCode(null, 1008)).toBe("AOC1008");
  });

  it("numarası olmayan renge kod uydurmaz", () => {
    expect(formatColorCode("cnd", null)).toBeNull();
    expect(formatColorCode("cnd", 0)).toBeNull();
    expect(formatColorCode("cnd", Number.NaN)).toBeNull();
  });

  it("dört haneden kısa numarayı sıfırla doldurur, uzunu kırpmaz", () => {
    expect(formatColorCode("cnd", 7)).toBe("CND0007");
    expect(formatColorCode("cnd", 12345)).toBe("CND12345");
  });

  it("boş katalogda okunur bir sayıdan başlar", () => {
    expect(nextColorNo([])).toBe(FIRST_COLOR_NO);
    expect(formatColorCode("cnd", nextColorNo([]))).toBe("CND1001");
  });

  it("en büyük numaradan devam eder — sayarak değil", () => {
    // Aradaki renk silinse bile 1325 ikinci kez üretilmemeli.
    expect(nextColorNo([1324, 1325])).toBe(1326);
    expect(nextColorNo([1325, 1324, null, undefined])).toBe(1326);
  });

  it("elle yazılmış kodu numaraya indirger", () => {
    expect(parseColorNo("CND1008")).toBe(1008);
    expect(parseColorNo("1008")).toBe(1008);
    expect(parseColorNo(1008)).toBe(1008);
    expect(parseColorNo("")).toBeNull();
    expect(parseColorNo("CND")).toBeNull();
    expect(parseColorNo(null)).toBeNull();
  });

  it("renksiz yer tutucuyu tanır — ona katalog kodu basılmaz", () => {
    expect(isNeutralColor("notr")).toBe(true);
    expect(isNeutralColor(" NOTR ")).toBe(true);
    expect(isNeutralColor("fusya")).toBe(false);
    expect(isNeutralColor(null)).toBe(false);
  });
});

/**
 * Kodun sahibi ÜRÜNDÜR: her seri aynı renge kendi numarasını verebilir.
 * Tanımlar ekranı tek bir numara gösterip başına listedeki ilk serinin ön ekini
 * ekliyordu — "tüm seriler"de kullanılan bir renk CND1026 diye görünüyor, oysa
 * METEOR ürününde MTR ile basılıyordu.
 */
describe("seri × renk numarası", () => {
  const series = [
    { id: 1, prefix: "cnd" },
    { id: 2, prefix: "mtr" },
    { id: 3, prefix: null },
  ];

  it("serinin kendi numarası rengin varsayılanını ezer", () => {
    const index = makeColorCodeIndex({
      series,
      overrides: [{ seriesId: 2, colorId: 9, colorNo: 1004 }],
    });
    expect(index.codeOf(1, 9, 1008)).toBe("CND1008");
    expect(index.codeOf(2, 9, 1008)).toBe("MTR1004");
  });

  it("serinin numarası yoksa rengin varsayılanına düşer", () => {
    const index = makeColorCodeIndex({ series, overrides: [] });
    expect(index.codeOf(1, 9, 1008)).toBe("CND1008");
    expect(index.overrideOf(1, 9)).toBeNull();
  });

  it("varsayılanı olmayan renk yalnız kendi numarası olan seride kodlanır", () => {
    // RAL COLOUR'ın kodları dizinin dışında: renge global numara vermeden de
    // o seride kod basılabilmeli.
    const index = makeColorCodeIndex({
      series,
      overrides: [{ seriesId: 1, colorId: 9, colorNo: 3020 }],
    });
    expect(index.codeOf(1, 9, null)).toBe("CND3020");
    expect(index.codeOf(2, 9, null)).toBeNull();
  });

  it("ön eki olmayan seride kodu uydurmadan markaya düşer", () => {
    const index = makeColorCodeIndex({ series, overrides: [] });
    expect(index.codeOf(3, 9, 1008)).toBe("AOC1008");
    expect(index.prefixOf(3)).toBeNull();
  });

  it("aynı numara iki seride serbesttir — ön ek onları ayırır", () => {
    const index = makeColorCodeIndex({
      series,
      overrides: [
        { seriesId: 1, colorId: 9, colorNo: 1004 },
        { seriesId: 2, colorId: 7, colorNo: 1004 },
      ],
    });
    expect(index.codeOf(1, 9, null)).toBe("CND1004");
    expect(index.codeOf(2, 7, null)).toBe("MTR1004");
  });

  it("seri dizisi kendi içinde ilerler — CANDY'nin sırası METEOR'u kaydırmaz", () => {
    const rows = [
      { seriesId: 1, colorId: 9, colorNo: 1001 },
      { seriesId: 1, colorId: 8, colorNo: 1002 },
      { seriesId: 2, colorId: 9, colorNo: 1001 },
    ];
    expect(nextColorNo(rows.filter(r => r.seriesId === 1).map(r => r.colorNo))).toBe(1003);
    expect(nextColorNo(rows.filter(r => r.seriesId === 2).map(r => r.colorNo))).toBe(1002);
  });
});

/**
 * Ekran ile üretim aynı soruya aynı cevabı vermeli: Tanımlar "tüm seriler"
 * derken planlayıcı o rengi o seride hiç üretmiyordu.
 */
describe("seri × renk kapsamı", () => {
  const colors = [
    { id: 1, seriesId: null },
    { id: 2, seriesId: 5 }, // yalnız RAL serisine kilitli
    { id: 3, seriesId: null },
  ];
  const series = [{ id: 4 }, { id: 5 }];

  it("açık bağ varsa yalnız bağlı renkler üretilir", () => {
    const links = [{ seriesId: 4, colorId: 3 }];
    expect(colorsForSeries({ seriesId: 4, colors, links }).map(c => c.id)).toEqual([3]);
  });

  it("bağ yoksa seriye kilitli olmayanlar + o seriye ait olanlar girer", () => {
    expect(colorsForSeries({ seriesId: 4, colors, links: [] }).map(c => c.id)).toEqual([1, 3]);
    expect(colorsForSeries({ seriesId: 5, colors, links: [] }).map(c => c.id)).toEqual([1, 2, 3]);
  });

  it("rengin serilerini aynı kuralla verir", () => {
    const links = [{ seriesId: 4, colorId: 3 }];
    // 4 numaralı serinin açık bağı var ve 1 numaralı renk o bağda yok.
    expect(seriesForColor({ color: colors[0], series, links }).map(s => s.id)).toEqual([5]);
    expect(seriesForColor({ color: colors[2], series, links }).map(s => s.id)).toEqual([4, 5]);
    // Kilitli renk kilitli olduğu seri dışında hiçbir yerde üretilmez.
    expect(seriesForColor({ color: colors[1], series, links }).map(s => s.id)).toEqual([5]);
  });
});
