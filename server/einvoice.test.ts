import { describe, expect, it } from "vitest";
import { computeInvoiceLines } from "./einvoice";

describe("computeInvoiceLines — KDV dökümü (fiyatlar KDV dahil)", () => {
  it("%20 KDV'yi matrah ve KDV olarak ayrıştırır", () => {
    const [l] = computeInvoiceLines([{ productName: "Boya", quantity: 1, unitPrice: 120 }], 20);
    expect(l.lineTotal).toBe(100);
    expect(l.vatAmount).toBe(20);
    expect(l.vatRate).toBe(20);
  });

  it("miktar ve adet fiyatını çarpar", () => {
    const [l] = computeInvoiceLines([{ productName: "X", quantity: 3, unitPrice: 240 }], 20);
    expect(l.lineTotal).toBe(600); // 720 dahil → 600 matrah
    expect(l.vatAmount).toBe(120);
  });

  it("string miktar/fiyatları da işler", () => {
    const [l] = computeInvoiceLines([{ productName: "Y", quantity: "2", unitPrice: "118" }], 18);
    expect(l.lineTotal).toBeCloseTo(200, 2);
    expect(l.vatAmount).toBeCloseTo(36, 2);
  });

  it("boş liste boş dizi döner", () => {
    expect(computeInvoiceLines([], 20)).toEqual([]);
  });
});
