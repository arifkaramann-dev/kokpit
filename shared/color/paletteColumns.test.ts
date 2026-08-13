import { describe, expect, it } from "vitest";
import { paletteColumns } from "./layout";

/**
 * Otomatik kolon sayısı.
 *
 * Şart: kaç renk gelirse gelsin hepsi TEK karede görünecek (satır sayısı
 * serbest, hücre küçülür) ve hücreler kareye yakın kalacak.
 */
describe("paletteColumns", () => {
  it("kare bir alanda kök civarı kolon verir", () => {
    expect(paletteColumns(16, 1, 1)).toBe(4);
    expect(paletteColumns(25, 1, 1)).toBe(5);
  });

  it("geniş alanda daha çok kolon verir", () => {
    expect(paletteColumns(12, 4, 1)).toBeGreaterThan(paletteColumns(12, 1, 1));
  });

  it("dar/uzun alanda daha az kolon verir", () => {
    expect(paletteColumns(12, 1, 4)).toBeLessThan(paletteColumns(12, 1, 1));
  });

  it("kolon sayısı renk sayısını aşmaz", () => {
    expect(paletteColumns(3, 10, 1)).toBeLessThanOrEqual(3);
  });

  it("her zaman en az 1 kolon — sıfıra bölme yok", () => {
    expect(paletteColumns(0, 1, 1)).toBe(1);
    expect(paletteColumns(1, 1, 1)).toBe(1);
    expect(paletteColumns(9, 1, 0)).toBeGreaterThanOrEqual(1);
  });
});
