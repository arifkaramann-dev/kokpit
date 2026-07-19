import { describe, expect, it } from "vitest";
import { buildInvoicePayload, decideInvoiceType, type CompanyInfo } from "./efatura";

const company: CompanyInfo = {
  name: "Art of Colour",
  taxNumber: "1234567890",
  taxOffice: "Kadıköy",
  address: "İstanbul",
};

describe("decideInvoiceType (VKN 10 hane → e-fatura, TCKN 11 hane → e-arşiv)", () => {
  it("10 haneli VKN → e-fatura (kurumsal)", () => {
    expect(decideInvoiceType("1234567890")).toBe("e-fatura");
  });
  it("11 haneli TCKN → e-arşiv (bireysel)", () => {
    expect(decideInvoiceType("12345678901")).toBe("e-arsiv");
  });
  it("boşluk/tire temizlenir, sonra hane sayısına bakılır", () => {
    expect(decideInvoiceType("123 456 7890")).toBe("e-fatura");
    expect(decideInvoiceType("123-456-789-01")).toBe("e-arsiv");
  });
  it("boş/null/eksik hane → e-arşiv (güvenli varsayılan)", () => {
    expect(decideInvoiceType(null)).toBe("e-arsiv");
    expect(decideInvoiceType(undefined)).toBe("e-arsiv");
    expect(decideInvoiceType("")).toBe("e-arsiv");
    expect(decideInvoiceType("12345")).toBe("e-arsiv");
    expect(decideInvoiceType("123456789012")).toBe("e-arsiv");
  });
});

describe("buildInvoicePayload (KDV dahil birimden matrah/KDV/genel toplam)", () => {
  it("tek kalem: unitPrice KDV dahil, matrah ve KDV doğru ayrışır", () => {
    const p = buildInvoicePayload({
      company,
      customer: { name: "Ahmet", taxNumber: "12345678901" },
      lines: [{ name: "Mat Siyah Sprey", quantity: 2, unitPrice: 120, vatPercent: 20 }],
    });
    expect(p.lines[0].unitPriceEx).toBeCloseTo(100, 4);
    expect(p.lines[0].lineTotalEx).toBeCloseTo(200, 2);
    expect(p.lines[0].vatAmount).toBeCloseTo(40, 2);
    expect(p.subtotalEx).toBeCloseTo(200, 2);
    expect(p.vatTotal).toBeCloseTo(40, 2);
    expect(p.grandTotal).toBeCloseTo(240, 2);
    expect(p.invoiceType).toBe("e-arsiv"); // 11 hane
  });

  it("çok kalem + karışık KDV oranları (%20 ve %10) toplamları toplar", () => {
    const p = buildInvoicePayload({
      company,
      customer: { name: "Kurumsal A.Ş.", taxNumber: "1234567890" },
      lines: [
        { name: "Sprey", quantity: 2, unitPrice: 120, vatPercent: 20 },
        { name: "Rötuş", quantity: 1, unitPrice: 110, vatPercent: 10 },
      ],
    });
    expect(p.subtotalEx).toBeCloseTo(300, 2); // 200 + 100
    expect(p.vatTotal).toBeCloseTo(50, 2); // 40 + 10
    expect(p.grandTotal).toBeCloseTo(350, 2);
    expect(p.invoiceType).toBe("e-fatura"); // 10 hane
  });

  it("genel toplam daima matrah + KDV'ye eşittir (kuruş tutarlılığı)", () => {
    const p = buildInvoicePayload({
      company,
      customer: { name: "Test", taxNumber: null },
      lines: [
        { name: "A", quantity: 3, unitPrice: 99.99, vatPercent: 20 },
        { name: "B", quantity: 7, unitPrice: 12.34, vatPercent: 10 },
      ],
    });
    expect(p.grandTotal).toBeCloseTo(p.subtotalEx + p.vatTotal, 2);
    expect(p.invoiceType).toBe("e-arsiv");
  });

  it("müşteri ve şirket bilgisi ile notu payload'a taşır", () => {
    const p = buildInvoicePayload({
      company,
      customer: { name: "Ahmet", taxNumber: "12345678901" },
      lines: [{ name: "X", quantity: 1, unitPrice: 100, vatPercent: 20 }],
      note: "AOC-123 siparişi",
    });
    expect(p.company.name).toBe("Art of Colour");
    expect(p.customer.name).toBe("Ahmet");
    expect(p.note).toBe("AOC-123 siparişi");
  });
});
