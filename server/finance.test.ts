import { describe, expect, it } from "vitest";
import {
  accountBalance,
  collectionTotal,
  customerBalancesFrom,
  overdueReceivables,
  paymentStatusFor,
  supplierBalancesFrom,
  vatSummarySince,
} from "./financeUtils";

describe("accountBalance (kasa/banka bakiyesi)", () => {
  it("açılış + giren − çıkan", () => {
    const bal = accountBalance("1000", [
      { direction: "in", amount: "250.50" },
      { direction: "out", amount: "100" },
      { direction: "in", amount: "49.50" },
    ]);
    expect(bal).toBe(1200);
  });

  it("hareketsiz hesapta açılış bakiyesi döner; bozuk sayılar 0 sayılır", () => {
    expect(accountBalance("500", [])).toBe(500);
    expect(accountBalance(null, [{ direction: "in", amount: "abc" }])).toBe(0);
  });
});

describe("customerBalancesFrom (müşteri cari bakiyeleri)", () => {
  const custs = [{ id: 1, name: "Ahmet Yılmaz" }];

  it("sipariş borç yazar, tahsilat düşer; Türkçe küçük harf anahtar", () => {
    const out = customerBalancesFrom(
      [{ name: "AHMET YILMAZ", customerId: 1, total: "1000", status: "done" }],
      [{ name: "Ahmet Yılmaz", customerId: 1, direction: "in", amount: "400", category: "tahsilat" }],
      custs,
    );
    expect(out["ahmet yılmaz"]).toBe(600);
  });

  it("iptal edilen sipariş borç doğurmaz", () => {
    const out = customerBalancesFrom(
      [
        { name: "Ahmet Yılmaz", customerId: 1, total: "1000", status: "cancelled" },
        { name: "Ahmet Yılmaz", customerId: 1, total: "300", status: "new" },
      ],
      [],
      custs,
    );
    expect(out["ahmet yılmaz"]).toBe(300);
  });

  it("ID'li kayıtlar güncel ad altında toplanır (eski adla girilmiş sipariş kopmaz)", () => {
    const out = customerBalancesFrom(
      [{ name: "A. Yılmaz (eski ad)", customerId: 1, total: "500", status: "done" }],
      [{ name: null, customerId: 1, direction: "in", amount: "200", category: "tahsilat" }],
      custs,
    );
    expect(out["ahmet yılmaz"]).toBe(300);
    expect(out["a. yılmaz (eski ad)"]).toBeUndefined();
  });

  it("tahsilat dışı hareketler ve ters yönlü tahsilat (iade) doğru işlenir", () => {
    const out = customerBalancesFrom(
      [{ name: "Veli", customerId: null, total: "100", status: "done" }],
      [
        { name: "Veli", customerId: null, direction: "out", amount: "999", category: "gider" }, // cariyi etkilemez
        { name: "Veli", customerId: null, direction: "out", amount: "50", category: "tahsilat" }, // tahsilat iadesi borcu artırır
      ],
      [],
    );
    expect(out["veli"]).toBe(150);
  });
});

describe("supplierBalancesFrom (tedarikçi cari bakiyeleri)", () => {
  it("alış borç yazar, ödeme düşer; ID kanonik ad altında toplar", () => {
    const out = supplierBalancesFrom(
      [{ name: "Eski Unvan", supplierId: 7, total: "2000" }],
      [{ name: null, supplierId: 7, direction: "out", amount: "500" }],
      [{ id: 7, name: "Kimya A.Ş." }],
    );
    expect(out["kimya a.ş."]).toBe(1500);
  });

  it("tedarikçiden gelen para (iade, in) borcu artırır", () => {
    const out = supplierBalancesFrom(
      [{ name: "X", supplierId: null, total: "100" }],
      [{ name: "X", supplierId: null, direction: "in", amount: "40" }],
      [],
    );
    expect(out["x"]).toBe(140);
  });
});

describe("collectionTotal + paymentStatusFor (tahsilat → sipariş ödeme senkronu)", () => {
  it("yalnızca tahsilat kategorisini toplar; iade (out) düşer", () => {
    const collected = collectionTotal([
      { direction: "in", category: "tahsilat", amount: "300" },
      { direction: "in", category: "gelir", amount: "999" },
      { direction: "out", category: "tahsilat", amount: "100" },
    ]);
    expect(collected).toBe(200);
  });

  it("ödeme durumu eşikleri: 0 → unpaid, kısmi → partial, tam (kuruş toleransıyla) → paid", () => {
    expect(paymentStatusFor(0, 100)).toBe("unpaid");
    expect(paymentStatusFor(-10, 100)).toBe("unpaid");
    expect(paymentStatusFor(50, 100)).toBe("partial");
    expect(paymentStatusFor(100, 100)).toBe("paid");
    expect(paymentStatusFor(99.9995, 100)).toBe("paid"); // kuruş yuvarlama toleransı
    expect(paymentStatusFor(150, 100)).toBe("paid");
  });
});

describe("vatSummarySince (KDV raporu)", () => {
  const now = Date.now();
  const d = (daysAgo: number) => new Date(now - daysAgo * 86400000);

  it("satış KDV'si − alış KDV'si = ödenecek (KDV dahil brütten ayrıştırma)", () => {
    const r = vatSummarySince(
      [{ total: "120", date: d(1), status: "done" }],
      [{ total: "60", date: d(2), created: d(2) }],
      20,
      now - 10 * 86400000,
    );
    expect(r.salesGross).toBe(120);
    expect(r.salesVat).toBeCloseTo(20, 6);
    expect(r.buyVat).toBeCloseTo(10, 6);
    expect(r.payable).toBeCloseTo(10, 6);
  });

  it("iptal edilen sipariş matraha girmez; tarih penceresi dışı kayıtlar sayılmaz", () => {
    const r = vatSummarySince(
      [
        { total: "120", date: d(1), status: "cancelled" },
        { total: "240", date: d(30), status: "done" }, // pencere dışı
        { total: "120", date: d(1), status: "new" },
      ],
      [],
      20,
      now - 10 * 86400000,
    );
    expect(r.salesGross).toBe(120);
  });

  it("alışta fatura tarihi yoksa kayıt tarihi kullanılır", () => {
    const r = vatSummarySince(
      [],
      [{ total: "100", date: null, created: d(3) }],
      20,
      now - 10 * 86400000,
    );
    expect(r.buyGross).toBe(100);
  });
});

describe("overdueReceivables (Tahsilat Takipçisi)", () => {
  const now = new Date("2026-07-16T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  const order = (over: Partial<Parameters<typeof overdueReceivables>[0][number]>) => ({
    id: 1,
    orderNo: "AOC-1",
    customerName: "Ahmet",
    totalAmount: "1000",
    paidAmount: "0",
    paymentStatus: "unpaid",
    status: "done",
    createdAt: daysAgo(45),
    ...over,
  });

  it("30+ gün ödenmemişleri müşteri bazında gruplar, en yüksek alacak önce", () => {
    const out = overdueReceivables(
      [
        order({ id: 1, orderNo: "AOC-1", customerName: "Ahmet", totalAmount: "1000", createdAt: daysAgo(45) }),
        order({ id: 2, orderNo: "AOC-2", customerName: "AHMET", totalAmount: "500", createdAt: daysAgo(60) }),
        order({ id: 3, orderNo: "AOC-3", customerName: "Zeynep", totalAmount: "5000", createdAt: daysAgo(31) }),
      ],
      30,
      now,
    );
    expect(out).toHaveLength(2);
    expect(out[0].customerName).toBe("Zeynep");
    expect(out[0].totalDue).toBe(5000);
    expect(out[1].totalDue).toBe(1500); // Ahmet + AHMET aynı cari
    expect(out[1].oldestDays).toBe(60);
    expect(out[1].orders).toHaveLength(2);
  });

  it("eşiğin altındaki yaş, ödenmiş, iptal ve kısmi ödemede kalanı 0 olanlar hariç", () => {
    const out = overdueReceivables(
      [
        order({ id: 1, createdAt: daysAgo(29) }), // çok taze
        order({ id: 2, paymentStatus: "paid" }),
        order({ id: 3, status: "cancelled" }),
        order({ id: 4, paymentStatus: "partial", totalAmount: "100", paidAmount: "100" }),
      ],
      30,
      now,
    );
    expect(out).toHaveLength(0);
  });

  it("kısmi ödemede yalnızca kalan tutar alacak sayılır", () => {
    const out = overdueReceivables(
      [order({ paymentStatus: "partial", totalAmount: "1000", paidAmount: "750" })],
      30,
      now,
    );
    expect(out[0].totalDue).toBe(250);
  });
});
