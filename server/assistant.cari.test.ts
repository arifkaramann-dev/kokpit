import { describe, expect, it } from "vitest";
import { normalizeTaxNumber } from "./assistant";

describe("normalizeTaxNumber (cari VKN/TCKN doğrulama)", () => {
  it("boş/eksik değer için undefined döner (opsiyonel alan)", () => {
    expect(normalizeTaxNumber(undefined)).toBeUndefined();
    expect(normalizeTaxNumber(null)).toBeUndefined();
    expect(normalizeTaxNumber("")).toBeUndefined();
    expect(normalizeTaxNumber("   ")).toBeUndefined();
  });

  it("10 haneli VKN'yi kabul eder", () => {
    expect(normalizeTaxNumber("1234567890")).toBe("1234567890");
  });

  it("11 haneli TCKN'yi kabul eder", () => {
    expect(normalizeTaxNumber("18001855390")).toBe("18001855390");
  });

  it("rakam dışı karakterleri temizler (boşluk/tire)", () => {
    expect(normalizeTaxNumber("180 018 553 90")).toBe("18001855390");
    expect(normalizeTaxNumber("12-345-678-90")).toBe("1234567890");
  });

  it("9 haneli gibi geçersiz uzunlukta hata fırlatır", () => {
    expect(() => normalizeTaxNumber("123456789")).toThrow(/10.*11.*haneli/);
  });

  it("12 haneli gibi çok uzun değerde hata fırlatır", () => {
    expect(() => normalizeTaxNumber("123456789012")).toThrow();
  });
});
