/**
 * Kampanya / kupon motoru — saf fonksiyonlar (client + server + testler ortak).
 * Kuponlar ayarlar tablosunda JSON olarak tutulur (şema gerektirmez):
 *   settings.storeCoupons = JSON.stringify(Coupon[])
 */

export type CouponType = "percent" | "fixed" | "freeShipping";

export type Coupon = {
  code: string;
  type: CouponType;
  /** percent: %; fixed: TL; freeShipping: kullanılmaz. */
  value: number;
  /** Bu tutarın altındaki sepette geçersiz (KDV dahil ara toplam). */
  minSubtotal?: number;
  /** ISO tarih; geçmişse geçersiz. */
  expiresAt?: string | null;
  active?: boolean;
};

export type CouponResult = {
  ok: boolean;
  /** Uygulanan indirim tutarı (TL, ürün toplamından düşülür). */
  discount: number;
  /** Kargo bedava mı (freeShipping kuponu). */
  freeShipping: boolean;
  reason?: string;
};

const trUpper = (s: string) => s.trim().toLocaleUpperCase("tr-TR");

/** Kupon kodunu listede bulur (kod büyük/küçük harf duyarsız). */
export function findCoupon(coupons: Coupon[], code: string): Coupon | null {
  const c = trUpper(code);
  if (!c) return null;
  return coupons.find(x => trUpper(x.code) === c) ?? null;
}

/**
 * Kuponu sepete uygular. Geçersizse ok:false + sebep döner. İndirim ürün ara
 * toplamını (subtotal) aşamaz; freeShipping ürün indirimi vermez, kargoyu sıfırlar.
 */
export function applyCoupon(subtotal: number, shipping: number, coupon: Coupon | null, now: Date = new Date()): CouponResult {
  if (!coupon) return { ok: false, discount: 0, freeShipping: false, reason: "Kupon bulunamadı" };
  if (coupon.active === false) return { ok: false, discount: 0, freeShipping: false, reason: "Kupon pasif" };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) {
    return { ok: false, discount: 0, freeShipping: false, reason: "Kuponun süresi dolmuş" };
  }
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return { ok: false, discount: 0, freeShipping: false, reason: `Bu kupon için en az ${coupon.minSubtotal} ₺ sepet gerekir` };
  }
  switch (coupon.type) {
    case "percent": {
      const discount = Math.min(subtotal, +(subtotal * (coupon.value / 100)).toFixed(2));
      return { ok: true, discount, freeShipping: false };
    }
    case "fixed": {
      const discount = Math.min(subtotal, +coupon.value.toFixed(2));
      return { ok: true, discount, freeShipping: false };
    }
    case "freeShipping":
      return { ok: true, discount: 0, freeShipping: shipping > 0 };
  }
}

/** Ayarlardaki JSON'dan kupon listesini toleranslı ayrıştırır. */
export function parseCoupons(raw: unknown): Coupon[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c): c is Coupon => c && typeof c.code === "string" && typeof c.value === "number");
  } catch {
    return [];
  }
}
