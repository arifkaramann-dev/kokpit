import { describe, expect, it } from "vitest";
import { findOpenOrderForCollection } from "./orderUtils";

const order = (
  id: number,
  orderNo: string,
  customerName: string,
  totalAmount: string,
  paidAmount: string,
  createdAt: string,
  status = "new"
) => ({ id, orderNo, customerName, totalAmount, paidAmount, createdAt, status });

describe("findOpenOrderForCollection (asistan tahsilatı → sipariş eşleştirme)", () => {
  const orders = [
    order(1, "AOC-20260701-AAAA", "Ahmet Yılmaz", "500", "500", "2026-07-01"), // ödenmiş
    order(2, "AOC-20260703-BBBB", "Ahmet Yılmaz", "800", "200", "2026-07-03"), // kalan 600
    order(3, "AOC-20260710-CCCC", "Ahmet Yılmaz", "300", "0", "2026-07-10"), // kalan 300
    order(4, "AOC-20260712-DDDD", "Ayşe Demir", "150", "0", "2026-07-12"),
  ];

  it("sipariş no verilirse (tam eşleşme) onu seçer", () => {
    expect(findOpenOrderForCollection(orders, "Ahmet Yılmaz", "AOC-20260710-CCCC")?.id).toBe(3);
  });

  it("sipariş no kısmi eşleşmeyle de bulunur", () => {
    expect(findOpenOrderForCollection(orders, "Ahmet Yılmaz", "CCCC")?.id).toBe(3);
  });

  it("sipariş no yoksa müşterinin ödenmemiş en eski siparişini seçer", () => {
    expect(findOpenOrderForCollection(orders, "Ahmet Yılmaz")?.id).toBe(2);
  });

  it("'son' referansı sipariş no gibi aranmaz, en eski ödenmemişe düşer", () => {
    expect(findOpenOrderForCollection(orders, "Ahmet Yılmaz", "son")?.id).toBe(2);
  });

  it("tamamen ödenmiş siparişleri atlar", () => {
    const paid = [order(1, "AOC-1", "Ali", "500", "500", "2026-07-01")];
    expect(findOpenOrderForCollection(paid, "Ali")).toBeUndefined();
  });

  it("müşteri adı büyük/küçük harf duyarsız eşleşir", () => {
    expect(findOpenOrderForCollection(orders, "ayşe demir")?.id).toBe(4);
  });

  it("eşleşme yoksa undefined döner (tahsilat siparişsiz cariye işlenir)", () => {
    expect(findOpenOrderForCollection(orders, "Mehmet")).toBeUndefined();
  });

  it("iptal edilmiş sipariş aday olmaz — sipariş no ile bile", () => {
    const withCancelled = [
      order(5, "AOC-20260705-EEEE", "Ali Kaya", "400", "0", "2026-07-05", "cancelled"),
      order(6, "AOC-20260711-FFFF", "Ali Kaya", "250", "0", "2026-07-11"),
    ];
    // Ada göre: iptal atlanır, aktif olan seçilir (daha eski olsa bile iptal seçilmez).
    expect(findOpenOrderForCollection(withCancelled, "Ali Kaya")?.id).toBe(6);
    // Sipariş no ile doğrudan iptal sipariş istense de ona bağlanmaz;
    // müşterinin açık siparişine düşer.
    expect(findOpenOrderForCollection(withCancelled, "Ali Kaya", "EEEE")?.id).toBe(6);
  });
});
