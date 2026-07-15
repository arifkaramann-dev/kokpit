import { describe, expect, it } from "vitest";
import { resolveProductIdForItem, type ProductRef } from "./orderUtils";

const catalog: ProductRef[] = [
  { id: 1, name: "Meteor Bukalemun 30ml", barcode: "AOC-MET-30" },
  { id: 2, name: "Meteor Bukalemun 30ml", barcode: null }, // mükerrer ad, daha yeni kayıt
  { id: 3, name: "Vivid Sedef 60ml", barcode: "AOC-VIV-60" },
  { id: 4, name: "Gloss Vernik 100ml", barcode: "  AOC-GLS-100  " },
];

describe("resolveProductIdForItem", () => {
  it("barkod eşleşmesi ad eşleşmesinden önce gelir", () => {
    expect(
      resolveProductIdForItem({ productName: "Vivid Sedef 60ml", barcode: "AOC-MET-30" }, catalog),
    ).toBe(1);
  });

  it("barkod yoksa ada göre eşleşir (Türkçe küçük harf + trim)", () => {
    expect(resolveProductIdForItem({ productName: "  VİVİD SEDEF 60ML " }, catalog)).toBe(3);
  });

  it("aynı adda birden fazla ürün varsa en eski (en küçük id) kazanır", () => {
    expect(resolveProductIdForItem({ productName: "meteor bukalemun 30ml" }, catalog)).toBe(1);
  });

  it("katalog barkodundaki boşluklar eşleşmeyi bozmaz", () => {
    expect(
      resolveProductIdForItem({ productName: "Bilinmeyen", barcode: "AOC-GLS-100" }, catalog),
    ).toBe(4);
  });

  it("eşleşme yoksa null döner (serbest kalem)", () => {
    expect(resolveProductIdForItem({ productName: "Kargo Ücreti" }, catalog)).toBeNull();
  });

  it("bilinmeyen barkod ada düşer, ad da yoksa null", () => {
    expect(
      resolveProductIdForItem({ productName: "Vivid Sedef 60ml", barcode: "YOK-123" }, catalog),
    ).toBe(3);
    expect(
      resolveProductIdForItem({ productName: "Hiç Yok", barcode: "YOK-123" }, catalog),
    ).toBeNull();
  });
});
