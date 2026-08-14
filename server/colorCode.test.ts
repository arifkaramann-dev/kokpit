import { describe, expect, it } from "vitest";
import {
  FIRST_COLOR_CODE_SEQUENCE,
  buildColorCode,
  colorCodePrefix,
  nextColorCodeSequence,
} from "./catalogCodes";

/**
 * Katalog kodu ("CND1324") müşteriye giden numaradır: ilanda, etikette ve
 * kargo çıkışında bu kod okunur. İki rengin aynı kodu taşıması yanlış ürünün
 * gönderilmesi demek — bu yüzden sıra numarası SAYARAK değil EN BÜYÜĞÜ
 * bularak üretiliyor.
 */
describe("renk katalog kodu", () => {
  it("ön eki temizler ve büyütür", () => {
    expect(colorCodePrefix("cnd")).toBe("CND");
    expect(colorCodePrefix(" mt-r ")).toBe("MTR");
    expect(colorCodePrefix(null)).toBe("AOC");
    expect(colorCodePrefix("")).toBe("AOC");
  });

  it("kodu ön ek + 4 hane olarak kurar", () => {
    expect(buildColorCode("cnd", 1324)).toBe("CND1324");
    expect(buildColorCode("MTR", 7)).toBe("MTR0007");
    // Dört haneyi aşan sıra kırpılmaz: kod uzar ama tekilliği korur.
    expect(buildColorCode("cnd", 12345)).toBe("CND12345");
  });

  it("boş katalogda okunur bir sayıdan başlar", () => {
    expect(nextColorCodeSequence("cnd", [])).toBe(FIRST_COLOR_CODE_SEQUENCE);
    expect(buildColorCode("cnd", nextColorCodeSequence("cnd", []))).toBe("CND1001");
  });

  it("en büyük koddan devam eder — sayarak değil", () => {
    // Aradaki renk silinmiş olsa bile 1325 tekrar üretilmemeli.
    expect(nextColorCodeSequence("CND", ["CND1324", "CND1325"])).toBe(1326);
    expect(nextColorCodeSequence("CND", ["CND1325", "CND1324"])).toBe(1326);
  });

  it("başka serinin ve elle yazılmış kodları saymaz", () => {
    expect(
      nextColorCodeSequence("CND", ["MTR9999", "CND-OZEL", "cnd1010", null, undefined, ""]),
    ).toBe(1011);
  });
});
