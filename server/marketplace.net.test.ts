import { describe, expect, it } from "vitest";
import { marketplaceOrderNet } from "../client/src/lib/marketplace";

describe("marketplaceOrderNet — komisyon bazlı net kâr", () => {
  it("komisyon ve maliyeti brütten düşer", () => {
    const r = marketplaceOrderNet(1000, 15, 300);
    expect(r.commission).toBe(150);
    expect(r.cogs).toBe(300);
    expect(r.net).toBe(550);
    expect(r.margin).toBeCloseTo(55, 5);
  });

  it("komisyon 0 iken sadece maliyet düşülür", () => {
    const r = marketplaceOrderNet(500, 0, 100);
    expect(r.commission).toBe(0);
    expect(r.net).toBe(400);
  });

  it("brüt 0 iken marj 0 döner (bölme hatası yok)", () => {
    const r = marketplaceOrderNet(0, 15, 0);
    expect(r.margin).toBe(0);
    expect(r.net).toBe(0);
  });

  it("komisyon+maliyet brütü aşarsa net negatif olur", () => {
    const r = marketplaceOrderNet(100, 20, 90);
    expect(r.net).toBe(-10);
    expect(r.margin).toBeCloseTo(-10, 5);
  });
});
