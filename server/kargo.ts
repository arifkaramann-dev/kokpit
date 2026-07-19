import { ENV } from "./_core/env";

/**
 * Kargo toplayıcı soyutlaması (Navlungo / Basit Kargo / Kolay Gelsin vb.).
 * Kendi mağaza siparişleri için gönderi oluşturup takip no + etiket üretir.
 * Anahtarlar yalnızca Render'da; yoksa "manuel kargo" akışı (bu modül çağrılmaz).
 */

export function isKargoConfigured(): boolean {
  return Boolean(ENV.kargoProvider && ENV.kargoApiKey && ENV.kargoApiUrl);
}

export type ShipmentInput = {
  orderNo: string;
  recipientName: string;
  phone: string;
  address: string;
  city?: string;
  district?: string;
  desi?: number;
  note?: string | null;
};

/** Sağlayıcıdan bağımsız gönderi yükü (saf/testli). Adaptör bunu kendi biçimine çevirir. */
export function buildShipmentPayload(input: ShipmentInput) {
  return {
    reference: input.orderNo,
    recipient: {
      name: input.recipientName.trim(),
      phone: input.phone.replace(/\D/g, ""),
      address: input.address.trim(),
      city: input.city?.trim() || null,
      district: input.district?.trim() || null,
    },
    parcel: { desi: input.desi && input.desi > 0 ? input.desi : 1 },
    note: input.note ?? null,
  };
}

export type ShipmentResult = {
  created: boolean;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  reason?: string;
};

/**
 * Gönderi oluşturur. Yapılandırma yoksa created:false döner (akış bozulmaz);
 * anahtar gelince aynı çağrı gerçek gönderiye döner.
 */
export async function createShipment(input: ShipmentInput): Promise<ShipmentResult> {
  if (!isKargoConfigured()) {
    return { created: false, provider: null, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: "Kargo entegrasyonu yapılandırılmamış (manuel gönderim)" };
  }
  // Canlı sağlayıcı adaptörü buraya (Navlungo/Basit Kargo REST). Güvenli varsayılan:
  // yanlış canlı çağrı yapma; payload hazır, adaptör gelince bağlanır.
  buildShipmentPayload(input);
  return { created: false, provider: ENV.kargoProvider, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: `Sağlayıcı adaptörü (${ENV.kargoProvider}) henüz canlı bağlanmadı — payload hazır` };
}
