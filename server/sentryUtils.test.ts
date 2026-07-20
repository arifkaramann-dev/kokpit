import { describe, expect, it } from "vitest";
import {
  dailySalesComparison,
  findLossProducts,
  staleQuestions,
  upcomingCheques,
  type ChequeLike,
  type ProductCostLike,
  type QuestionLike,
} from "./sentryUtils";

describe("upcomingCheques (çek/senet vade nöbetçisi)", () => {
  // Yerel bileşenli tarihler → koşucu timezone'undan bağımsız determinizm.
  const now = new Date(2026, 6, 20, 9, 0); // 20 Temmuz 2026, yerel
  const chq = (p: Partial<ChequeLike> & { id: number; dueDate: ChequeLike["dueDate"] }): ChequeLike => ({
    type: "cek",
    direction: "alinan",
    partyName: "X",
    amount: "1000",
    status: "portfoyde",
    ...p,
  });

  it("vadesi geçmiş ve yaklaşanı ayırır, uzağı/vadesizi eler", () => {
    const cheques: ChequeLike[] = [
      chq({ id: 1, dueDate: new Date(2026, 6, 18) }), // 2 gün geçmiş
      chq({ id: 2, dueDate: new Date(2026, 6, 23) }), // 3 gün sonra (yaklaşan)
      chq({ id: 3, dueDate: new Date(2026, 7, 30) }), // çok ileri
      chq({ id: 4, dueDate: new Date(2026, 6, 19), status: "tahsil" }), // portföyde değil
      chq({ id: 5, dueDate: null }), // vadesiz
    ];
    const { overdue, soon } = upcomingCheques(cheques, 7, now);
    expect(overdue.map(c => c.id)).toEqual([1]);
    expect(soon.map(c => c.id)).toEqual([2]);
    expect(overdue[0].days).toBe(-2);
    expect(soon[0].days).toBe(3);
  });

  it("bugün vadesi dolan yaklaşan sayılır (days=0)", () => {
    const { soon } = upcomingCheques([chq({ id: 9, dueDate: new Date(2026, 6, 20) })], 7, now);
    expect(soon.map(c => c.id)).toEqual([9]);
    expect(soon[0].days).toBe(0);
  });

  it("en acil önce sıralanır", () => {
    const cheques = [
      chq({ id: 1, dueDate: new Date(2026, 6, 25) }),
      chq({ id: 2, dueDate: new Date(2026, 6, 21) }),
    ];
    expect(upcomingCheques(cheques, 10, now).soon.map(c => c.id)).toEqual([2, 1]);
  });
});

describe("findLossProducts (zararına satış / marj nöbetçisi)", () => {
  const p = (o: Partial<ProductCostLike> & { id: number }): ProductCostLike => ({
    name: `P${o.id}`,
    salePrice: "100",
    vatRate: "20",
    status: "satista",
    materialCost: 0,
    ...o,
  });

  it("KDV hariç satış maliyetin altındaysa işaretler, üstündeyse atlar", () => {
    const rows = [
      p({ id: 1, salePrice: "100", materialCost: 90 }), // saleEx≈83.3 < 90 → zarar
      p({ id: 2, salePrice: "200", materialCost: 50 }), // saleEx≈166.7 > 50 → kârlı
    ];
    expect(findLossProducts(rows).map(l => l.id)).toEqual([1]);
  });

  it("satışta olmayan, maliyeti bilinmeyen ve fiyatsız ürünler sinyal vermez", () => {
    const rows = [
      p({ id: 1, status: "taslak", salePrice: "100", materialCost: 90 }),
      p({ id: 2, materialCost: 0, salePrice: "100" }), // maliyet 0 → bilinmiyor
      p({ id: 3, salePrice: "0", materialCost: 90 }), // fiyat yok
    ];
    expect(findLossProducts(rows)).toHaveLength(0);
  });

  it("ambalaj + kargo maliyeti de hesaba katılır", () => {
    const rows = [p({ id: 1, salePrice: "120", vatRate: "20", materialCost: 80, packagingCost: 15, shippingCost: 20 })];
    // saleEx=100, costEx=115 → zarar
    expect(findLossProducts(rows).map(l => l.id)).toEqual([1]);
  });

  it("minMarginPercent eşiği altındaki ince marjı da yakalar", () => {
    const rows = [p({ id: 1, salePrice: "120", vatRate: "20", materialCost: 80 })]; // saleEx=100, marj %20
    expect(findLossProducts(rows, 0)).toHaveLength(0); // %20 > 0 → zarar değil
    expect(findLossProducts(rows, 30).map(l => l.id)).toEqual([1]); // eşik %30 → yakalar
  });

  it("en düşük marj önce sıralanır", () => {
    const rows = [
      p({ id: 1, salePrice: "100", vatRate: "0", materialCost: 95 }), // marj %5
      p({ id: 2, salePrice: "100", vatRate: "0", materialCost: 110 }), // marj %-10
    ];
    expect(findLossProducts(rows, 10).map(l => l.id)).toEqual([2, 1]);
  });
});

describe("staleQuestions (cevapsız soru SLA nöbetçisi)", () => {
  const now = new Date("2026-07-20T12:00:00Z");
  const q = (o: Partial<QuestionLike> & { id: number; createdAt: QuestionLike["createdAt"] }): QuestionLike => ({
    status: "new",
    source: "trendyol",
    customerName: null,
    productName: null,
    questionText: "soru",
    ...o,
  });

  it("eşik saatten eski cevapsızları döner, yenileri/cevaplananları eler", () => {
    const questions = [
      q({ id: 1, createdAt: new Date("2026-07-19T16:00:00Z") }), // 20 saat
      q({ id: 2, createdAt: new Date("2026-07-20T10:00:00Z") }), // 2 saat
      q({ id: 3, status: "answered", createdAt: new Date("2026-07-18T00:00:00Z") }),
    ];
    const stale = staleQuestions(questions, 12, now);
    expect(stale.map(s => s.id)).toEqual([1]);
    expect(stale[0].hours).toBe(20);
  });

  it("en çok bekleyen önce sıralanır", () => {
    const questions = [
      q({ id: 1, createdAt: new Date("2026-07-19T00:00:00Z") }), // 36 saat
      q({ id: 2, createdAt: new Date("2026-07-19T20:00:00Z") }), // 16 saat
    ];
    expect(staleQuestions(questions, 12, now).map(s => s.id)).toEqual([1, 2]);
  });
});

describe("dailySalesComparison (dün vs bugün — İstanbul günü)", () => {
  const tz = "Europe/Istanbul";
  const now = new Date("2026-07-20T06:00:00Z"); // İstanbul 09:00, 20 Temmuz

  it("bugün ve dün cirosunu İstanbul gününe göre kovalar, iptali eler", () => {
    const orders = [
      { createdAt: "2026-07-20T05:00:00Z", totalAmount: "100", status: "new" }, // İst 08:00 bugün
      { createdAt: "2026-07-19T20:00:00Z", totalAmount: "200", status: "done" }, // İst 23:00 dün
      { createdAt: "2026-07-20T04:00:00Z", totalAmount: "999", status: "cancelled" }, // iptal → hariç
      { createdAt: "2026-07-10T10:00:00Z", totalAmount: "50", status: "new" }, // eski
    ];
    const r = dailySalesComparison(orders, now, tz);
    expect(r.today).toEqual({ count: 1, total: 100 });
    expect(r.yesterday).toEqual({ count: 1, total: 200 });
  });

  it("gece yarısı sınırını İstanbul saatiyle çözer", () => {
    // 2026-07-19T21:30Z = İstanbul 20 Temmuz 00:30 → 'bugün' sayılmalı.
    const orders = [{ createdAt: "2026-07-19T21:30:00Z", totalAmount: "70", status: "new" }];
    const r = dailySalesComparison(orders, now, tz);
    expect(r.today.total).toBe(70);
    expect(r.yesterday.total).toBe(0);
  });
});
