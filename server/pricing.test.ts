import { describe, expect, it } from "vitest";
import {
  matchPriceRows,
  parsePriceCsv,
  parsePriceNumber,
  roundPrice,
  suggestPrice,
} from "../shared/pricing";

describe("roundPrice", () => {
  it("iki ondalığa yuvarlar (none)", () => {
    expect(roundPrice(87.456, "none")).toBe(87.46);
  });
  it("tam sayıya yuvarlar (whole)", () => {
    expect(roundPrice(87.5, "whole")).toBe(88);
    expect(roundPrice(87.4, "whole")).toBe(87);
  });
  it("en yakın x,90'a yuvarlar (ninety)", () => {
    expect(roundPrice(87.3, "ninety")).toBe(86.9);
    expect(roundPrice(87.7, "ninety")).toBe(87.9);
    expect(roundPrice(0.5, "ninety")).toBe(0.9);
  });
  it("en yakın x,99'a yuvarlar (ninetynine)", () => {
    expect(roundPrice(88.2, "ninetynine")).toBe(87.99);
    expect(roundPrice(88.7, "ninetynine")).toBe(88.99);
  });
  it("geçersiz/negatif fiyatta 0 döner", () => {
    expect(roundPrice(-5, "none")).toBe(0);
    expect(roundPrice(NaN, "whole")).toBe(0);
  });
});

describe("suggestPrice", () => {
  it("percent: mevcut fiyata zam uygular", () => {
    expect(suggestPrice({ currentPrice: 100, totalCost: 40, mode: "percent", value: 10 })).toBe(110);
  });
  it("percent: indirim uygular", () => {
    expect(suggestPrice({ currentPrice: 100, totalCost: 40, mode: "percent", value: -20 })).toBe(80);
  });
  it("multiplier: maliyet × çarpan", () => {
    expect(suggestPrice({ currentPrice: 100, totalCost: 40, mode: "multiplier", value: 2.5 })).toBe(100);
  });
  it("fixed: sabit tutar ekler", () => {
    expect(suggestPrice({ currentPrice: 100, totalCost: 40, mode: "fixed", value: 15 })).toBe(115);
  });
  it("targetMargin: KDV'siz/komisyonsuz basit marj", () => {
    // fiyat = 40 / (1 - 0.5) = 80 → net 80-40=40, marj %50
    expect(suggestPrice({ currentPrice: 0, totalCost: 40, mode: "targetMargin", value: 50 })).toBe(80);
  });
  it("targetMargin: KDV + komisyon düşüldükten sonra hedef marjı tutturur", () => {
    const price = suggestPrice({
      currentPrice: 0,
      totalCost: 40,
      mode: "targetMargin",
      value: 30,
      commissionPercent: 20,
      vatPercent: 20,
    });
    expect(price).not.toBeNull();
    // Doğrulama: KDV ve komisyon düşülünce kalan − maliyet ≈ fiyat × %30
    const p = price!;
    const vat = p - p / 1.2;
    const commission = p * 0.2;
    const net = p - vat - commission - 40;
    expect(net / p).toBeCloseTo(0.3, 3);
  });
  it("targetMargin: imkânsız kombinasyonda null döner", () => {
    expect(
      suggestPrice({
        currentPrice: 0,
        totalCost: 40,
        mode: "targetMargin",
        value: 70,
        commissionPercent: 25,
        vatPercent: 20,
      }),
    ).toBeNull();
  });
  it("sonuca yuvarlama uygular", () => {
    expect(
      suggestPrice({ currentPrice: 100, totalCost: 40, mode: "percent", value: 10, rounding: "ninety" }),
    ).toBe(109.9);
  });
  it("sıfır/negatif sonuçta null döner", () => {
    expect(suggestPrice({ currentPrice: 10, totalCost: 0, mode: "fixed", value: -10 })).toBeNull();
  });
});

describe("parsePriceNumber", () => {
  it("TR biçimini okur (1.234,56)", () => {
    expect(parsePriceNumber("1.234,56")).toBe(1234.56);
  });
  it("EN biçimini okur (1,234.56)", () => {
    expect(parsePriceNumber("1,234.56")).toBe(1234.56);
  });
  it("virgüllü ondalığı okur (129,90)", () => {
    expect(parsePriceNumber("129,90")).toBe(129.9);
  });
  it("para simgesini yok sayar", () => {
    expect(parsePriceNumber("₺149.90")).toBe(149.9);
  });
});

describe("parsePriceCsv", () => {
  it("noktalı virgül ayraçlı, tırnaklı Excel çıktısını okur", () => {
    const csv = 'Barkod;Ürün Adı;Yeni Fiyat\n"869000001";"Rötuş Boyası; Kırmızı";"129,90"\n869000002;Airbrush Mavi;89.5';
    const { rows, errors } = parsePriceCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { key: "869000001", price: 129.9, line: 2 },
      { key: "869000002", price: 89.5, line: 3 },
    ]);
  });
  it("ID sütunuyla da çalışır ve hatalı satırı raporlayıp geçer", () => {
    const csv = "ID,Fiyat\n12,100\n,50\n13,abc";
    const { rows, errors } = parsePriceCsv(csv);
    expect(rows).toEqual([{ key: "12", price: 100, line: 2 }]);
    expect(errors).toHaveLength(2);
  });
  it("anahtar/fiyat sütunu yoksa açıklayıcı hata döner", () => {
    const { rows, errors } = parsePriceCsv("Ad;Renk\nX;Y");
    expect(rows).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("matchPriceRows", () => {
  const products = [
    { id: 12, name: "Rötuş Kırmızı", barcode: "869000001", salePrice: "100.00" },
    { id: 13, name: "Airbrush Mavi", barcode: null, salePrice: "80.00" },
  ];
  it("önce barkodla, sonra ID ile eşler; eşleşmeyeni raporlar", () => {
    const { matches, unmatched } = matchPriceRows(products, [
      { key: "869000001", price: 129.9, line: 2 },
      { key: "13", price: 99, line: 3 },
      { key: "yok-boyle-barkod", price: 10, line: 4 },
    ]);
    expect(matches).toEqual([
      { productId: 12, productName: "Rötuş Kırmızı", oldPrice: 100, newPrice: 129.9, line: 2 },
      { productId: 13, productName: "Airbrush Mavi", oldPrice: 80, newPrice: 99, line: 3 },
    ]);
    expect(unmatched).toEqual([{ key: "yok-boyle-barkod", price: 10, line: 4 }]);
  });
  it("aynı ürüne ikinci satırı yoksayar (ilk kazanır)", () => {
    const { matches, unmatched } = matchPriceRows(products, [
      { key: "869000001", price: 120, line: 2 },
      { key: "12", price: 130, line: 3 },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].newPrice).toBe(120);
    expect(unmatched).toHaveLength(1);
  });
});
