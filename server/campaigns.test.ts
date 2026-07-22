import { describe, expect, it } from "vitest";
import { applyCoupon, findCoupon, parseCoupons, type Coupon } from "@shared/campaigns";

const coupons: Coupon[] = [
  { code: "YAZ10", type: "percent", value: 10 },
  { code: "INDIRIM50", type: "fixed", value: 50, minSubtotal: 300 },
  { code: "KARGOBEDAVA", type: "freeShipping", value: 0 },
];

describe("findCoupon", () => {
  it("büyük/küçük harf duyarsız bulur", () => {
    expect(findCoupon(coupons, "yaz10")?.code).toBe("YAZ10");
  });
  it("boş/yok = null", () => {
    expect(findCoupon(coupons, "")).toBeNull();
    expect(findCoupon(coupons, "YOK")).toBeNull();
  });
});

describe("applyCoupon", () => {
  it("yüzde indirimi hesaplar", () => {
    const r = applyCoupon(200, 30, coupons[0]);
    expect(r).toMatchObject({ ok: true, discount: 20, freeShipping: false });
  });

  it("sabit indirim ara toplamı aşamaz", () => {
    const r = applyCoupon(30, 0, { code: "X", type: "fixed", value: 50 });
    expect(r.discount).toBe(30);
  });

  it("minSubtotal altında reddedilir", () => {
    const r = applyCoupon(200, 0, coupons[1]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("300");
  });

  it("minSubtotal karşılanınca uygulanır", () => {
    expect(applyCoupon(300, 0, coupons[1])).toMatchObject({ ok: true, discount: 50 });
  });

  it("freeShipping kargo varken bedava yapar, ürün indirimi vermez", () => {
    expect(applyCoupon(200, 30, coupons[2])).toMatchObject({ ok: true, discount: 0, freeShipping: true });
    expect(applyCoupon(200, 0, coupons[2]).freeShipping).toBe(false);
  });

  it("süresi dolmuş kupon geçersiz", () => {
    const c: Coupon = { code: "ESKI", type: "percent", value: 20, expiresAt: "2020-01-01" };
    expect(applyCoupon(200, 0, c).ok).toBe(false);
  });

  it("pasif kupon geçersiz", () => {
    const c: Coupon = { code: "P", type: "percent", value: 20, active: false };
    expect(applyCoupon(200, 0, c).ok).toBe(false);
  });

  it("null kupon geçersiz", () => {
    expect(applyCoupon(200, 0, null).ok).toBe(false);
  });
});

describe("parseCoupons", () => {
  it("geçerli JSON dizisini ayrıştırır", () => {
    const raw = JSON.stringify([{ code: "A", type: "percent", value: 5 }]);
    expect(parseCoupons(raw)).toHaveLength(1);
  });
  it("bozuk JSON / dizi olmayan / boş = []", () => {
    expect(parseCoupons("{bozuk")).toEqual([]);
    expect(parseCoupons(JSON.stringify({ code: "A" }))).toEqual([]);
    expect(parseCoupons("")).toEqual([]);
    expect(parseCoupons(null)).toEqual([]);
  });
  it("eksik alanlı kayıtları eler", () => {
    const raw = JSON.stringify([{ code: "A", type: "percent", value: 5 }, { code: "B" }, { value: 10 }]);
    expect(parseCoupons(raw)).toHaveLength(1);
  });
});
