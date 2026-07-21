import { describe, expect, it } from "vitest";
import { buildBizimhesapInvoice, buildInvoicePayload } from "./efatura";

/**
 * Bizimhesap addinvoice gövde eşlemesi — para içerdiği için birim testli.
 * Kural: unitPrice/gross/net KDV HARİÇ, tax ayrı satır, total = net + tax;
 * amounts toplamları payload'daki KDV özetiyle birebir aynı olmalı.
 */
describe("buildBizimhesapInvoice", () => {
  const payload = buildInvoicePayload({
    company: { name: "Art of Colour", taxNumber: "1234567890", taxOffice: "Test VD", address: "Adres" },
    customer: { name: "Mehmet Yılmaz", taxNumber: "12345678901", address: "İstanbul", phone: "0555" },
    lines: [
      // KDV dahil 120 ₺ × 2 = 240; %20 KDV → hariç 100 × 2 = 200, KDV 40.
      { name: "Sprey Vernik", quantity: 2, unitPrice: 120, vatPercent: 20 },
    ],
    note: "sipariş AOC-1",
  });

  it("kalemleri KDV hariç fiyat + ayrı KDV olarak eşler", () => {
    const inv = buildBizimhesapInvoice(payload, "FIRM-1", "2026-00042");
    expect(inv.firmId).toBe("FIRM-1");
    expect(inv.invoiceNo).toBe("2026-00042");
    expect(inv.invoiceType).toBe(3);
    expect(inv.details).toHaveLength(1);
    const d = inv.details[0];
    expect(d.productName).toBe("Sprey Vernik");
    expect(d.quantity).toBe(2);
    expect(d.unitPrice).toBe("100.00");
    expect(d.grossPrice).toBe("200.00");
    expect(d.net).toBe("200.00");
    expect(d.tax).toBe("40.00");
    expect(d.total).toBe("240.00");
    expect(d.taxRate).toBe("20");
  });

  it("fatura toplamları KDV özetiyle birebir aynı", () => {
    const inv = buildBizimhesapInvoice(payload, "FIRM-1");
    expect(inv.amounts.gross).toBe("200.00");
    expect(inv.amounts.net).toBe("200.00");
    expect(inv.amounts.tax).toBe("40.00");
    expect(inv.amounts.total).toBe("240.00");
    expect(inv.amounts.currency).toBe("TL");
  });

  it("müşteri vergi numarasını sadece rakam olarak taşır", () => {
    const inv = buildBizimhesapInvoice(payload, "FIRM-1");
    expect(inv.customer.taxNo).toBe("12345678901");
    expect(inv.customer.title).toBe("Mehmet Yılmaz");
  });

  it("fatura no verilmezse boş bırakır (Bizimhesap kendisi numaralandırır)", () => {
    const inv = buildBizimhesapInvoice(payload, "FIRM-1");
    expect(inv.invoiceNo).toBe("");
  });
});
