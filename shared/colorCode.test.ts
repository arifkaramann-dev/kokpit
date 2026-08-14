import { describe, expect, it } from "vitest";
import {
  FIRST_COLOR_NO,
  colorCodePrefix,
  formatColorCode,
  nextColorNo,
  parseColorNo,
} from "./colorCode";

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
});
