/**
 * Web mağaza fiyat çözümleyici — saf/testli (client görüntüler, SUNUCU doğrular).
 *
 * Nihai birim fiyat = liste fiyatı − (ürün indirimi + aktif kampanya indirimi),
 * ama iki güvenlik korumasıyla:
 *   1) Toplam indirim yüzdesi MAX_STORE_DISCOUNT_PERCENT ile sınırlı (üst üste
 *      binen indirimler negatif marja itmesin).
 *   2) MALİYET-TABAN: nihai fiyat net maliyetin ALTINA düşemez (netCost bilindiğinde).
 *
 * Kupon indirimi AYRI katmandır (sepet ara toplamına uygulanır, ürün bazlı değil);
 * kupon da bu net fiyatların oluşturduğu ara toplam üstünden hesaplanır.
 */

/** Ürün indirimi + kampanya indirimi toplamı için üst sınır (%). */
export const MAX_STORE_DISCOUNT_PERCENT = 60;

export type StoreCampaign = {
  /** Kampanyanın uygulandığı ürün grubu (series ile eşleşir). Boş/null = TÜM ürünler. */
  productGroup: string | null;
  discountPercent: number;
  startDate: Date | string;
  endDate: Date | string;
  status: "planned" | "active" | "done";
};

const trNorm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/**
 * Bir ürün serisi için o an geçerli en yüksek kampanya indirimini bulur.
 * Geçerlilik: now ∈ [startDate, endDate] VE status ≠ "done" VE (grup boş ya da series eşleşir).
 * Birden fazla kampanya çakışırsa en yüksek yüzde kazanır.
 */
export function activeCampaignPercent(campaigns: StoreCampaign[], series: string | null, now: Date = new Date()): number {
  const t = now.getTime();
  const s = series ? trNorm(series) : "";
  let best = 0;
  for (const c of campaigns) {
    if (c.status === "done") continue;
    const start = new Date(c.startDate).getTime();
    const end = new Date(c.endDate).getTime();
    if (!(Number.isFinite(start) && Number.isFinite(end))) continue;
    if (t < start || t > end) continue;
    const group = c.productGroup ? trNorm(c.productGroup) : "";
    if (group && group !== s) continue; // grup dolu ama seri eşleşmiyor
    const pct = Number(c.discountPercent) || 0;
    if (pct > best) best = pct;
  }
  return Math.max(0, Math.min(100, best));
}

export type ResolvedStorePrice = {
  /** Görüntülenecek/tahsil edilecek net birim fiyat (indirimler + maliyet-taban sonrası). */
  price: number;
  /** Liste (üstü çizili) fiyatı = ürünün salePrice'ı. */
  listPrice: number;
  /** price < listPrice ise indirim vardır. */
  discounted: boolean;
  /** Rozette gösterilecek efektif indirim yüzdesi (maliyet-taban sonrası, tam sayı). */
  effectiveDiscountPercent: number;
};

/**
 * Nihai birim fiyatı hesaplar. netCost bilinmiyorsa (0/negatif) maliyet-taban
 * uygulanmaz ama indirim tavanı yine korur. Fiyat 2 ondalığa yuvarlanır.
 */
export function resolveStorePrice(input: {
  listPrice: number;
  productDiscountPercent: number;
  campaignPercent: number;
  netCost: number;
}): ResolvedStorePrice {
  const listPrice = +(Number(input.listPrice) || 0).toFixed(2);
  const rawPct = (Number(input.productDiscountPercent) || 0) + (Number(input.campaignPercent) || 0);
  const pct = Math.max(0, Math.min(MAX_STORE_DISCOUNT_PERCENT, rawPct));
  let price = listPrice * (1 - pct / 100);
  // Maliyet-taban guard: nihai fiyat net maliyetin altına düşemez.
  const netCost = Number(input.netCost) || 0;
  if (netCost > 0 && price < netCost) price = netCost;
  // Fiyat listeyi asla aşmaz (maliyet listeden yüksekse listede kal).
  if (price > listPrice) price = listPrice;
  price = +price.toFixed(2);
  const discounted = price < listPrice - 0.005;
  const effectiveDiscountPercent = listPrice > 0 && discounted ? Math.round((1 - price / listPrice) * 100) : 0;
  return { price, listPrice, discounted, effectiveDiscountPercent };
}
