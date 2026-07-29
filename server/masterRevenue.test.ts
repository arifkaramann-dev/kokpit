import { describe, expect, it } from "vitest";
import {
  computeMasterRevenue,
  findDeadMasters,
  rollupRevenueBySeries,
  windowStart,
  type RevenueLine,
} from "./masterRevenue";

const NOW = new Date("2026-07-28T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const line = (p: Partial<RevenueLine> = {}): RevenueLine => ({
  masterId: 1,
  orderId: 100,
  quantity: 2,
  unitPrice: 250,
  soldAt: daysAgo(5),
  cancelled: false,
  ...p,
});

const costs = new Map([
  [1, 80],
  [2, 40],
]);

describe("computeMasterRevenue", () => {
  it("adet, ciro, maliyet ve kârı toplar", () => {
    const [r] = computeMasterRevenue({ lines: [line()], unitCosts: costs });
    expect(r).toMatchObject({
      masterId: 1,
      qty: 2,
      revenue: 500,
      cost: 160,
      profit: 340,
      marginPercent: 68,
    });
  });

  it("aynı master'ın iki satırını birleştirir", () => {
    const [r] = computeMasterRevenue({
      lines: [line(), line({ orderId: 101, quantity: 1 })],
      unitCosts: costs,
    });
    expect(r.qty).toBe(3);
    expect(r.revenue).toBe(750);
    expect(r.orderCount).toBe(2);
  });

  it("aynı siparişin iki satırı tek sipariş sayılır", () => {
    const [r] = computeMasterRevenue({
      lines: [line(), line({ quantity: 1 })],
      unitCosts: costs,
    });
    expect(r.orderCount).toBe(1);
    expect(r.qty).toBe(3);
  });

  it("iptal satırı ciroya girmez", () => {
    const rows = computeMasterRevenue({ lines: [line({ cancelled: true })], unitCosts: costs });
    expect(rows).toEqual([]);
  });

  it("bağı olmayan satır sayılmaz — yanlış master'a yazmaktansa dışarıda kalır", () => {
    const rows = computeMasterRevenue({ lines: [line({ masterId: null })], unitCosts: costs });
    expect(rows).toEqual([]);
  });

  it("pencere dışındaki satış elenir", () => {
    const rows = computeMasterRevenue({
      lines: [line({ soldAt: daysAgo(200) })],
      unitCosts: costs,
      since: windowStart(90, NOW),
    });
    expect(rows).toEqual([]);
  });

  it("maliyeti bilinmeyen üründe kâr ciroya eşittir", () => {
    const [r] = computeMasterRevenue({ lines: [line({ masterId: 9 })], unitCosts: costs });
    expect(r.cost).toBe(0);
    expect(r.profit).toBe(500);
  });

  it("ciroya göre büyükten küçüğe sıralar", () => {
    const rows = computeMasterRevenue({
      lines: [line({ masterId: 2, quantity: 1, unitPrice: 100 }), line()],
      unitCosts: costs,
    });
    expect(rows.map(r => r.masterId)).toEqual([1, 2]);
  });

  it("son satış tarihini tutar", () => {
    const [r] = computeMasterRevenue({
      lines: [line({ soldAt: daysAgo(30) }), line({ orderId: 101, soldAt: daysAgo(2) })],
      unitCosts: costs,
    });
    expect(r.lastSoldAt).toEqual(daysAgo(2));
  });
});

describe("windowStart", () => {
  it("gün sayısını geriye alır", () => {
    expect(windowStart(30, NOW)).toEqual(daysAgo(30));
  });
  it("0 veya negatif tüm zamanlar demektir", () => {
    expect(windowStart(0, NOW)).toBeNull();
    expect(windowStart(-5, NOW)).toBeNull();
  });
});

describe("rollupRevenueBySeries", () => {
  it("seri bazında toplar", () => {
    const revenue = computeMasterRevenue({
      lines: [line(), line({ masterId: 2, orderId: 101, quantity: 1, unitPrice: 100 })],
      unitCosts: costs,
    });
    const rows = rollupRevenueBySeries(revenue, new Map([[1, 7], [2, 7]]));
    expect(rows[0]).toMatchObject({ seriesId: 7, revenue: 600, masterCount: 2 });
  });

  it("serisi bilinmeyen master atlanır", () => {
    const revenue = computeMasterRevenue({ lines: [line()], unitCosts: costs });
    expect(rollupRevenueBySeries(revenue, new Map())).toEqual([]);
  });
});

describe("findDeadMasters", () => {
  it("hiç satmamış aktif ürünü işaretler", () => {
    const revenue = computeMasterRevenue({ lines: [line()], unitCosts: costs });
    const dead = findDeadMasters({ activeMasterIds: [1, 2, 3], revenue, now: NOW });
    expect(dead.map(d => d.masterId)).toEqual([2, 3]);
    expect(dead[0].lastSoldAt).toBeNull();
    expect(dead[0].daysSinceSale).toBeNull();
  });

  it("satan ürün ölü sayılmaz", () => {
    const revenue = computeMasterRevenue({ lines: [line()], unitCosts: costs });
    const dead = findDeadMasters({ activeMasterIds: [1], revenue, now: NOW });
    expect(dead).toEqual([]);
  });
});
