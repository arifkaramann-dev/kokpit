import { describe, expect, it } from "vitest";
import { findOpenOrderForCollection } from "./orderUtils";

const order = (
  id: number,
  orderNo: string,
  customerName: string,
  totalAmount: string,
  paidAmount: string,
  createdAt: string
) => ({ id, orderNo, customerName, totalAmount, paidAmount, createdAt });

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
});
