import { describe, expect, it } from "vitest";
import { applyCoupon, findCoupon, parseCoupons, type Coupon } from "../shared/campaigns";
import { normalizeDate, parseBankStatement, reconcile, type LedgerTxn } from "../shared/reconcile";
import { buildInvoicePayload, decideInvoiceType } from "./efatura";
import { encodeBasket } from "./paytr";
import { buildShipmentPayload } from "./kargo";

describe("campaigns — kupon motoru", () => {
  const coupons: Coupon[] = [
    { code: "YUZDE10", type: "percent", value: 10 },
    { code: "KARGO", type: "freeShipping", value: 0 },
    { code: "BUYUK", type: "fixed", value: 50, minSubtotal: 300 },
    { code: "GECMIS", type: "percent", value: 20, expiresAt: "2020-01-01" },
  ];

  it("yüzde kuponu ürün toplamından düşer", () => {
    const r = applyCoupon(200, 30, findCoupon(coupons, "yuzde10"));
    expect(r.ok).toBe(true);
    expect(r.discount).toBe(20);
    expect(r.freeShipping).toBe(false);
  });

  it("freeShipping kuponu kargoyu sıfırlar, ürün indirimi vermez", () => {
    const r = applyCoupon(200, 30, findCoupon(coupons, "KARGO"));
    expect(r.ok).toBe(true);
    expect(r.discount).toBe(0);
    expect(r.freeShipping).toBe(true);
  });

  it("minSubtotal altında geçersiz, üstünde geçerli", () => {
    expect(applyCoupon(250, 0, findCoupon(coupons, "BUYUK")).ok).toBe(false);
    expect(applyCoupon(400, 0, findCoupon(coupons, "BUYUK")).discount).toBe(50);
  });

  it("süresi geçmiş kupon reddedilir", () => {
    expect(applyCoupon(500, 0, findCoupon(coupons, "GECMIS")).ok).toBe(false);
  });

  it("fixed indirim ara toplamı aşamaz", () => {
    expect(applyCoupon(30, 0, { code: "X", type: "fixed", value: 50 }).discount).toBe(30);
  });

  it("parseCoupons bozuk JSON'da boş döner", () => {
    expect(parseCoupons("değil-json")).toEqual([]);
    expect(parseCoupons(JSON.stringify(coupons))).toHaveLength(4);
  });
});

describe("efatura — fatura yükü", () => {
  it("10 haneli VKN kurumsal (e-fatura), diğerleri bireysel (e-arşiv)", () => {
    expect(decideInvoiceType("1234567890")).toBe("e-fatura");
    expect(decideInvoiceType("12345678901")).toBe("e-arsiv");
    expect(decideInvoiceType(null)).toBe("e-arsiv");
  });

  it("KDV dahil kalemleri hariç baza ayrıştırıp toplar", () => {
    const p = buildInvoicePayload({
      company: { name: "Art of Colour", taxNumber: "1234567890", taxOffice: "Kadıköy", address: "..." },
      customer: { name: "Ahmet" },
      lines: [{ name: "Sprey", quantity: 2, unitPrice: 120, vatPercent: 20 }],
    });
    expect(p.lines[0].unitPriceEx).toBeCloseTo(100, 2);
    expect(p.subtotalEx).toBeCloseTo(200, 2);
    expect(p.vatTotal).toBeCloseTo(40, 2);
    expect(p.grandTotal).toBeCloseTo(240, 2);
  });
});

describe("reconcile — banka ekstresi mutabakatı", () => {
  it("tarih biçimlerini YYYY-MM-DD'ye çevirir", () => {
    expect(normalizeDate("12.05.2026")).toBe("2026-05-12");
    expect(normalizeDate("2026-05-12")).toBe("2026-05-12");
    expect(normalizeDate("12/5/2026")).toBe("2026-05-12");
  });

  it("CSV'yi ayrıştırıp tutar+tarihe göre eşleştirir", () => {
    const csv = "Tarih;Açıklama;Tutar\n12.05.2026;ABC tahsilat;1.500,00\n13.05.2026;Gider;-200,00";
    const { lines, errors } = parseBankStatement(csv);
    expect(errors).toHaveLength(0);
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(1500);

    const txns: LedgerTxn[] = [
      { id: 1, date: "2026-05-12", amount: 1500, label: "tahsilat" }, // birebir gün+tutar
      { id: 2, date: "2026-05-14", amount: -200, label: "gider" }, // 13 vs 14 → 1 gün, tolerans içinde
    ];
    const matches = reconcile(lines, txns);
    expect(matches[0].txnId).toBe(1);
    expect(matches[0].confidence).toBe("exact");
    expect(matches[1].txnId).toBe(2);
    expect(matches[1].confidence).toBe("amount");
  });

  it("tolerans dışındaki tutar eşleşmesi 'none' döner", () => {
    const lines = parseBankStatement("Tarih;Tutar\n01.01.2026;100,00").lines;
    const txns: LedgerTxn[] = [{ id: 9, date: "2026-02-01", amount: 100, label: "x" }];
    expect(reconcile(lines, txns, 3)[0].confidence).toBe("none");
  });
});

describe("paytr / kargo — yardımcılar", () => {
  it("encodeBasket base64 JSON üretir", () => {
    const b64 = encodeBasket([{ name: "Sprey", price: 120, quantity: 2 }]);
    const decoded = JSON.parse(Buffer.from(b64, "base64").toString());
    expect(decoded).toEqual([["Sprey", "120.00", 2]]);
  });

  it("buildShipmentPayload telefonu sadeleştirir, desi varsayılanı 1", () => {
    const p = buildShipmentPayload({ orderNo: "AO-1", recipientName: "Ali", phone: "0555 111 22 33", address: "adres" });
    expect(p.recipient.phone).toBe("05551112233");
    expect(p.parcel.desi).toBe(1);
  });
});
