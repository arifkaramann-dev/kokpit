import { describe, expect, it } from "vitest";
import {
  calcChannelProfit,
  calcDevProfit,
  matchPriceRows,
  normalizeChannelProfile,
  parsePriceCsv,
  parsePriceNumber,
  roundPrice,
  suggestPrice,
  type ChannelProfile,
} from "../shared/pricing";

/** Test profili: verilen alanlar dışında kesintisiz. */
function profile(overrides: Partial<ChannelProfile> = {}): ChannelProfile {
  return {
    name: "Test",
    kind: "pazaryeri",
    commissionPercent: 0,
    paymentFeePercent: 0,
    paymentFeeVatDeductible: true,
    fixedFee: 0,
    stopajPercent: 0,
    vatPercent: 0,
    shippingCost: 0,
    ...overrides,
  };
}

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
  it("targetMargin: KDV'siz/kesintisiz basit marj", () => {
    // fiyat = 40 / (1 - 0.5) = 80 → net 80-40=40, marj %50
    expect(
      suggestPrice({ currentPrice: 0, totalCost: 40, mode: "targetMargin", value: 50, profile: profile(), productCost: 40 }),
    ).toBe(80);
  });
  it("targetMargin: tüm kesintiler düşüldükten sonra hedef marjı (KDV hariç bazda) tutturur", () => {
    const prof = profile({ commissionPercent: 20, paymentFeePercent: 0.96, fixedFee: 12.6, stopajPercent: 1, vatPercent: 20, shippingCost: 94.2 });
    const price = suggestPrice({ currentPrice: 0, totalCost: 40, mode: "targetMargin", value: 30, profile: prof, productCost: 40 });
    expect(price).not.toBeNull();
    // Doğrulama: aynı profille kâr hesabı yapılınca marj hedefi tutmalı.
    const r = calcChannelProfit({ salePrice: price!, productCost: 40, profile: prof });
    expect(r.margin).toBeCloseTo(30, 3);
  });
  it("targetMargin: ürün kargosu (shippingOverride) yolunda da calcChannelProfit ile tutarlı", () => {
    // Pricing.tsx kablolaması: profil kargosu 0 → ürünün kendi kargosu kullanılır.
    const prof = profile({ commissionPercent: 14, paymentFeePercent: 0.96, fixedFee: 12.6, stopajPercent: 1, vatPercent: 20, shippingCost: 0 });
    const price = suggestPrice({
      currentPrice: 0,
      totalCost: 40,
      mode: "targetMargin",
      value: 25,
      profile: prof,
      productCost: 88.75,
      shippingOverride: 94.2,
    });
    expect(price).not.toBeNull();
    const r = calcChannelProfit({ salePrice: price!, productCost: 88.75, profile: prof, shippingOverride: 94.2 });
    expect(r.margin).toBeCloseTo(25, 3);
  });
  it("targetMargin: maliyet KDV dahil (productCostVatPercent) verilince calcChannelProfit ile tutarlı", () => {
    const prof = profile({ commissionPercent: 20, paymentFeePercent: 0.96, fixedFee: 12.6, stopajPercent: 1, vatPercent: 20 });
    const price = suggestPrice({
      currentPrice: 0,
      totalCost: 48,
      mode: "targetMargin",
      value: 25,
      profile: prof,
      productCost: 48, // KDV dahil
      productCostVatPercent: 20,
    });
    expect(price).not.toBeNull();
    // Aynı KDV dahil maliyetle kâr hesabı yapılınca hedef marj (KDV hariç bazda) tutmalı.
    const r = calcChannelProfit({ salePrice: price!, productCost: 48, productCostVatPercent: 20, profile: prof });
    // Öneri kuruşa yuvarlandığı için marjda ±0,005 puan sapma normaldir.
    expect(r.margin).toBeCloseTo(25, 2);
  });
  it("targetMargin: banka POS'unda (KDV indirimsiz ödeme bedeli) da marj hedefi tutar", () => {
    const prof = profile({ paymentFeePercent: 2, paymentFeeVatDeductible: false, vatPercent: 20 });
    const price = suggestPrice({ currentPrice: 0, totalCost: 40, mode: "targetMargin", value: 30, profile: prof, productCost: 40 });
    expect(price).not.toBeNull();
    const r = calcChannelProfit({ salePrice: price!, productCost: 40, profile: prof });
    // Öneri kuruşa yuvarlandığı için marjda ±0,005 puan sapma normaldir.
    expect(r.margin).toBeCloseTo(30, 2);
  });
  it("targetMargin: imkânsız kombinasyonda null döner", () => {
    expect(
      suggestPrice({
        currentPrice: 0,
        totalCost: 40,
        mode: "targetMargin",
        value: 70,
        profile: profile({ commissionPercent: 25, vatPercent: 20 }),
        productCost: 40,
      }),
    ).toBeNull();
  });
  it("targetMargin: profil veya maliyet yoksa null döner", () => {
    expect(suggestPrice({ currentPrice: 0, totalCost: 40, mode: "targetMargin", value: 30 })).toBeNull();
    expect(
      suggestPrice({ currentPrice: 0, totalCost: 0, mode: "targetMargin", value: 30, profile: profile(), productCost: 0 }),
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

describe("calcChannelProfit — kanal bazlı net kâr (finans onaylı model)", () => {
  it("Trendyol resmi hesaplayıcı referans vakasıyla kuruş kuruş tutar", () => {
    // Satış 325 (dahil), alış 106,50 dahil = 88,75 hariç, komisyon %14, KDV %20,
    // kargo 94,20, ödeme %0,96, işlem 12,60, stopaj %1 → beklenen kâr 42,28.
    const r = calcChannelProfit({
      salePrice: 325,
      productCost: 106.5 / 1.2,
      profile: profile({
        commissionPercent: 14,
        paymentFeePercent: 0.96,
        fixedFee: 12.6,
        stopajPercent: 1,
        vatPercent: 20,
        shippingCost: 94.2,
      }),
    });
    expect(r.saleEx).toBeCloseTo(270.83, 2);
    expect(r.commission).toBeCloseTo(45.5, 2); // 54,60 KDV dahil faturanın net maliyeti
    expect(r.paymentFee).toBeCloseTo(2.6, 2); // 3,12 dahil → 2,60 net
    expect(r.transactionFee).toBeCloseTo(10.5, 2); // 12,60 dahil → 10,50 net
    expect(r.shipping).toBeCloseTo(78.5, 2); // 94,20 dahil → 78,50 net
    expect(r.stopaj).toBeCloseTo(2.71, 2);
    expect(r.net).toBeCloseTo(42.28, 1);
  });

  it("banka POS'unda ödeme komisyonunun KDV'si indirilmez (BSMV)", () => {
    const base = { salePrice: 120, productCost: 0 };
    const kurulus = calcChannelProfit({ ...base, profile: profile({ paymentFeePercent: 2, vatPercent: 20 }) });
    const banka = calcChannelProfit({
      ...base,
      profile: profile({ paymentFeePercent: 2, vatPercent: 20, paymentFeeVatDeductible: false }),
    });
    expect(kurulus.paymentFee).toBeCloseTo(2.4 / 1.2, 4); // 2,00
    expect(banka.paymentFee).toBeCloseTo(2.4, 4); // KDV bölmesi yok
    expect(banka.net).toBeLessThan(kurulus.net);
  });

  it("elden satışta (KDV 0, kesintisiz) net = satış − maliyet", () => {
    const r = calcChannelProfit({ salePrice: 100, productCost: 40, profile: profile() });
    expect(r.net).toBe(60);
    expect(r.margin).toBe(60);
  });

  it("productCostVatPercent verilince maliyetin indirilecek KDV'si düşülür (Excel modeli)", () => {
    // Satış 275, maliyet 140 (KDV dahil), komisyon %3,9, KDV %20 → net 101,78.
    const r = calcChannelProfit({
      salePrice: 275,
      productCost: 140,
      productCostVatPercent: 20,
      profile: profile({ commissionPercent: 3.9, vatPercent: 20 }),
    });
    expect(r.productCostEx).toBeCloseTo(116.67, 1);
    expect(r.inputVat).toBeCloseTo(23.33, 1);
    expect(r.commission).toBeCloseTo(10.73, 1);
    expect(r.net).toBeCloseTo(101.78, 1);
  });

  it("productCostVatPercent verilmezse maliyet KDV hariç sayılır (geriye dönük uyumlu)", () => {
    const r = calcChannelProfit({ salePrice: 100, productCost: 40, profile: profile({ vatPercent: 20 }) });
    expect(r.productCostEx).toBe(40);
    expect(r.inputVat).toBe(0);
  });

  it("kargo: profil 0 ise ürün kargosu kullanılır, profil doluysa profil kazanır", () => {
    const withOverride = calcChannelProfit({
      salePrice: 120,
      productCost: 0,
      profile: profile({ vatPercent: 20 }),
      shippingOverride: 24,
    });
    expect(withOverride.shipping).toBeCloseTo(20, 4);
    const profileWins = calcChannelProfit({
      salePrice: 120,
      productCost: 0,
      profile: profile({ vatPercent: 20, shippingCost: 12 }),
      shippingOverride: 24,
    });
    expect(profileWins.shipping).toBeCloseTo(10, 4);
  });

  it("satış fiyatı 0 iken marj 0 döner", () => {
    const r = calcChannelProfit({ salePrice: 0, productCost: 0, profile: profile({ vatPercent: 20 }) });
    expect(r.margin).toBe(0);
  });
});

describe("calcDevProfit — ürün geliştirme sihirbazı net kâr (Excel modeli)", () => {
  // Gerçek örnek (ARTOFCOLOUR Mat Siyah Sprey 400ml): satış 275, maliyet 140,
  // komisyon %3,9 (PAYTR), KDV %20 → Excel net kâr 101,8.
  it("Excel örneğiyle birebir uyuşur (naif 135 değil, 101,78)", () => {
    const r = calcDevProfit({
      salePrice: 275,
      materialCost: 140,
      packagingCost: 0,
      shippingCost: 0,
      commissionPercent: 3.9,
      vatPercent: 20,
    });
    expect(r.saleEx).toBeCloseTo(229.17, 1);
    expect(r.costEx).toBeCloseTo(116.67, 1);
    expect(r.outputVat).toBeCloseTo(45.83, 1);
    expect(r.inputVat).toBeCloseTo(23.33, 1);
    expect(r.vatPayable).toBeCloseTo(22.5, 1);
    expect(r.commission).toBeCloseTo(10.73, 1);
    expect(r.net).toBeCloseTo(101.78, 1);
    // Naif hesabın (275 − 140 = 135) verdiği yanlış değeri VERMEMELİ.
    expect(r.net).not.toBeCloseTo(135, 1);
  });

  it("KDV 0 ve komisyon 0 iken net = satış − maliyet (elden satış)", () => {
    const r = calcDevProfit({
      salePrice: 100,
      materialCost: 40,
      packagingCost: 0,
      shippingCost: 0,
      commissionPercent: 0,
      vatPercent: 0,
    });
    expect(r.net).toBe(60);
    expect(r.margin).toBe(60);
  });

  it("ambalaj ve kargo maliyetlerini de toplam maliyete katar", () => {
    const r = calcDevProfit({
      salePrice: 275,
      materialCost: 140,
      packagingCost: 12,
      shippingCost: 24,
      commissionPercent: 3.9,
      vatPercent: 20,
    });
    expect(r.totalCostGross).toBe(176);
    expect(r.costEx).toBeCloseTo(146.67, 1);
  });

  it("satış 0 iken marjlar 0 döner", () => {
    const r = calcDevProfit({ salePrice: 0, materialCost: 0, packagingCost: 0, shippingCost: 0, commissionPercent: 3.9, vatPercent: 20 });
    expect(r.margin).toBe(0);
    expect(r.marginOnSale).toBe(0);
  });
});

describe("normalizeChannelProfile — eski kayıtların taşınması", () => {
  it("eski biçimli pazaryeri profiline stopaj %1 ve ödeme bedeli %0,96 ekler", () => {
    const p = normalizeChannelProfile({ name: "Trendyol", commissionPercent: 20, fixedFee: 10, vatPercent: 20, shippingCost: 0 });
    expect(p.kind).toBe("pazaryeri");
    expect(p.stopajPercent).toBe(1);
    expect(p.paymentFeePercent).toBe(0.96);
    expect(p.paymentFeeVatDeductible).toBe(true);
  });
  it("komisyonsuz eski profil 'elden' sayılır, kesinti eklenmez", () => {
    const p = normalizeChannelProfile({ name: "Elden / Web", commissionPercent: 0, fixedFee: 0, vatPercent: 0, shippingCost: 0 });
    expect(p.kind).toBe("elden");
    expect(p.stopajPercent).toBe(0);
    expect(p.paymentFeePercent).toBe(0);
  });
  it("yeni biçimli profili olduğu gibi korur", () => {
    const original = { name: "Web", kind: "website" as const, commissionPercent: 0, paymentFeePercent: 2.5, paymentFeeVatDeductible: false, fixedFee: 0, stopajPercent: 0, vatPercent: 20, shippingCost: 0 };
    expect(normalizeChannelProfile(original)).toEqual(original);
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
