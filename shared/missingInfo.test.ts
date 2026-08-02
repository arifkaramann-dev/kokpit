import { describe, expect, it } from "vitest";
import {
  buildRequestMessage,
  findMissingInfo,
  isUsableAddress,
  isUsablePhone,
  isUsableTaxNumber,
  type InfoCustomer,
  type InfoOrder,
} from "./missingInfo";

const order = (over: Partial<InfoOrder> = {}): InfoOrder => ({
  id: 1,
  orderNo: "SIP-001",
  customerName: "Mehmet Yılmaz",
  customerId: 10,
  customerPhone: "05321234567",
  customerAddress: "Fatih Mah. Gül Sok. No 12 D 3 Nilüfer Bursa",
  channel: "elden",
  status: "new",
  totalAmount: 1200,
  ...over,
});

const customer = (over: Partial<InfoCustomer> = {}): InfoCustomer => ({
  id: 10,
  name: "Mehmet Yılmaz",
  phone: "05321234567",
  email: null,
  address: "Fatih Mah. Gül Sok. No 12 D 3 Nilüfer Bursa",
  taxOffice: "Setbaşı V.D.",
  taxNumber: "12345678901",
  ...over,
});

describe("alan doğrulama", () => {
  it("kargoya yetmeyen adresi eksik sayar", () => {
    expect(isUsableAddress("Bursa")).toBe(false);
    expect(isUsableAddress("Nilüfer Bursa")).toBe(false);
    // Rakam yoksa kapı/bina no yok demektir.
    expect(isUsableAddress("Fatih Mahallesi Gül Sokak Nilüfer Bursa")).toBe(false);
    expect(isUsableAddress("Fatih Mah. Gül Sok. No 12 D 3 Nilüfer Bursa")).toBe(true);
  });

  it("kısa telefonu eksik sayar", () => {
    expect(isUsablePhone("532")).toBe(false);
    expect(isUsablePhone("0532 123 45 67")).toBe(true);
    expect(isUsablePhone("+90 532 123 45 67")).toBe(true);
  });

  it("TCKN 11 / VKN 10 hane dışını kabul etmez", () => {
    expect(isUsableTaxNumber("12345678901")).toBe(true); // TCKN
    expect(isUsableTaxNumber("1234567890")).toBe(true); // VKN
    expect(isUsableTaxNumber("123")).toBe(false);
    expect(isUsableTaxNumber("bilinmiyor")).toBe(false);
  });
});

describe("findMissingInfo", () => {
  it("bilgisi tam müşteriyi listeye almaz", () => {
    expect(findMissingInfo([order()], [customer()])).toHaveLength(0);
  });

  it("eksik adresi yakalar ve hazır mesaj üretir", () => {
    const rows = findMissingInfo(
      [order({ customerAddress: "Bursa" })],
      [customer({ address: null })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].missing).toEqual(["adres"]);
    expect(rows[0].message).toContain("SIP-001");
    expect(rows[0].message).toContain("açık adres");
  });

  it("bilgi siparişte YA DA cari kartında varsa eksik saymaz", () => {
    const rows = findMissingInfo(
      [order({ customerAddress: null })],
      [customer()], // adres cari kartında dolu
    );
    expect(rows).toHaveLength(0);
  });

  it("vergi bilgisi yalnız istendiğinde sorulur", () => {
    const noTax = customer({ taxNumber: null, taxOffice: null });
    expect(findMissingInfo([order()], [noTax])).toHaveLength(0);
    const rows = findMissingInfo([order()], [noTax], { requireTax: true });
    expect(rows[0].missing).toEqual(["vergiNo", "vergiDairesi"]);
  });

  it("pazaryeri siparişini varsayılan olarak dışarıda bırakır", () => {
    const rows = findMissingInfo(
      [order({ channel: "trendyol", customerAddress: "Bursa" })],
      [customer({ address: null })],
    );
    expect(rows).toHaveLength(0);
    const withMp = findMissingInfo(
      [order({ channel: "trendyol", customerAddress: "Bursa" })],
      [customer({ address: null })],
      { includeMarketplace: true },
    );
    expect(withMp).toHaveLength(1);
  });

  it("kapanmış ve iptal siparişleri sormaz", () => {
    for (const status of ["done", "cancelled"]) {
      const rows = findMissingInfo(
        [order({ status, customerAddress: "Bursa" })],
        [customer({ address: null })],
      );
      expect(rows).toHaveLength(0);
    }
  });

  it("aynı müşterinin siparişlerini tek mesajda toplar", () => {
    const rows = findMissingInfo(
      [
        order({ id: 1, orderNo: "SIP-001", customerAddress: "Bursa" }),
        order({ id: 2, orderNo: "SIP-002", customerAddress: "Bursa" }),
      ],
      [customer({ address: null })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].orders).toHaveLength(2);
    expect(rows[0].message).toContain("SIP-001, SIP-002");
  });

  it("cari kaydı olmayan müşteriyi de isimle gruplar", () => {
    const rows = findMissingInfo(
      [order({ customerId: null, customerAddress: "Bursa", customerPhone: null })],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
    expect(rows[0].missing).toEqual(["adres", "telefon"]);
  });

  it("telefon varsa tek tık WhatsApp linki üretir", () => {
    const rows = findMissingInfo(
      [order({ customerAddress: "Bursa" })],
      [customer({ address: null })],
    );
    expect(rows[0].waLink).toContain("https://wa.me/905321234567");
  });

  it("telefon eksikse WhatsApp linki üretmez — gönderilecek yer yok", () => {
    const rows = findMissingInfo(
      [order({ customerAddress: "Bursa", customerPhone: null })],
      [customer({ address: null, phone: null })],
    );
    expect(rows[0].waLink).toBeNull();
  });

  it("en çok eksiği olanı başa alır", () => {
    const rows = findMissingInfo(
      [
        order({ id: 1, orderNo: "A", customerId: 10, customerAddress: "Bursa" }),
        order({
          id: 2,
          orderNo: "B",
          customerId: 11,
          customerName: "Ayşe Demir",
          customerAddress: "İzmir",
          customerPhone: null,
        }),
      ],
      [customer({ address: null }), customer({ id: 11, name: "Ayşe Demir", address: null, phone: null })],
    );
    expect(rows[0].customerName).toBe("Ayşe Demir");
  });
});

describe("buildRequestMessage", () => {
  it("firma adını ve istenen bilgileri madde madde yazar", () => {
    const msg = buildRequestMessage({
      customerName: "Mehmet Yılmaz",
      orderNos: ["SIP-001"],
      missing: ["adres", "vergiNo"],
      companyName: "Art of Colour",
    });
    expect(msg).toContain("Merhaba Mehmet Yılmaz");
    expect(msg).toContain("Art of Colour");
    expect(msg).toContain("1. açık adres");
    expect(msg).toContain("2. TC kimlik no");
  });
});
