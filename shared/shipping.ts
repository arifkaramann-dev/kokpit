/**
 * Kargo ücreti modeli — saf/testli (client + server + testler ortak).
 * Ayarlar tablosunda JSON olarak tutulur (şema gerektirmez):
 *   settings.storeShipping = JSON.stringify(ShippingConfig)
 *
 * Amaç: web mağaza sepetinde kargo ücretini SUNUCUDA hesaplamak. Bugüne kadar
 * shipping:0 sabitti; bu yüzden "kargo bedava" kuponu hiçbir şey yapmıyordu.
 */

export type ShippingConfig = {
  /** Kapalıysa kargo her zaman 0 (ücretsiz/manuel). */
  enabled: boolean;
  /** Sabit kargo ücreti (TL, KDV dahil). */
  fee: number;
  /** Bu ara toplamın (TL) üstünde kargo bedava; null = eşik yok. */
  freeOver: number | null;
};

export const DEFAULT_SHIPPING: ShippingConfig = { enabled: false, fee: 0, freeOver: null };

/** Ayarlardaki JSON'u toleranslı ayrıştırır; bozuksa güvenli varsayılan döner. */
export function parseShippingConfig(raw: unknown): ShippingConfig {
  if (typeof raw !== "string" || !raw.trim()) return { ...DEFAULT_SHIPPING };
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return { ...DEFAULT_SHIPPING };
    const fee = Number((o as Record<string, unknown>).fee);
    const freeOverRaw = (o as Record<string, unknown>).freeOver;
    const freeOver = freeOverRaw == null || freeOverRaw === "" ? null : Number(freeOverRaw);
    return {
      enabled: Boolean((o as Record<string, unknown>).enabled),
      fee: Number.isFinite(fee) && fee > 0 ? +fee.toFixed(2) : 0,
      freeOver: freeOver != null && Number.isFinite(freeOver) && freeOver > 0 ? +freeOver.toFixed(2) : null,
    };
  } catch {
    return { ...DEFAULT_SHIPPING };
  }
}

/**
 * Ara toplama göre kargo ücretini hesaplar. Kapalıysa, sepet boşsa veya
 * eşik aşıldıysa 0; aksi halde sabit ücret. Sonuç asla negatif değildir.
 */
export function calcShipping(subtotal: number, cfg: ShippingConfig): number {
  if (!cfg.enabled) return 0;
  if (!(subtotal > 0)) return 0;
  if (cfg.freeOver != null && subtotal >= cfg.freeOver) return 0;
  return cfg.fee > 0 ? +cfg.fee.toFixed(2) : 0;
}
