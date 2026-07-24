import { ENV } from "./_core/env";

/**
 * Kargo entegrasyonu — kendi mağaza/elden siparişleri için gönderi + etiket.
 *
 * Birincil sağlayıcı: **Geliver** (geliver.io — patron zaten kullanıyor).
 * API: https://docs.geliver.io · Temel: https://api.geliver.io/api/v1
 * Kimlik: `Authorization: Bearer <GELIVER_API_TOKEN>` (app.geliver.io/apitokens).
 * Akış (iki adım): POST /shipments (gönderi + teklifler) → teklifler KULLANICIYA
 * gösterilir, kullanıcı kargo firmasını SEÇER → seçilen teklif POST /transactions
 * ile satın alınır → yanıtta takip no + etiket URL'si döner. (Otomatik "en ucuz"
 * DEĞİL; tercih kullanıcıda.) Satın alma başarısızsa gönderi yine oluşur.
 *
 * GELIVER_TEST_MODE=1 iken gönderiler test modunda açılır (ücret yansımaz) —
 * ilk kurulum doğrulaması bu modda yapılır. Kurulum rehberi: KARGO.md.
 *
 * Geliver dışı jenerik sağlayıcı (KARGO_PROVIDER/API_KEY/API_URL) eskisi gibi
 * iskelet olarak durur; anahtarı gelirse adaptörü yazılır.
 */

const GELIVER_BASE = process.env.GELIVER_API_BASE_URL ?? "https://api.geliver.io/api/v1";

export function isGeliverConfigured(): boolean {
  return Boolean(ENV.geliverToken);
}

export function isKargoConfigured(): boolean {
  return isGeliverConfigured() || Boolean(ENV.kargoProvider && ENV.kargoApiKey && ENV.kargoApiUrl);
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

/** Desiden küp kenarı (cm): desi = en×boy×yükseklik / 3000. Saf/testli. */
export function desiToEdgeCm(desi: number): string {
  const d = desi > 0 ? desi : 1;
  return Math.max(1, Math.cbrt(d * 3000)).toFixed(1);
}

export type ShipmentResult = {
  created: boolean;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  /** Sağlayıcıdaki gönderi kimliği (panelden bulmak için). */
  shipmentId?: string | null;
  reason?: string;
};

type GeliverOffer = {
  id?: string;
  ID?: string;
  totalAmount?: string | number;
  amount?: string | number;
  price?: string | number;
  currency?: string;
  currencyCode?: string;
  provider?: string;
  providerCode?: string;
  providerName?: string;
  providerServiceName?: string;
  serviceName?: string;
  providerServiceCode?: string;
  estimatedDeliveryDate?: string;
  estimatedDeliveryTime?: string;
  deliveryTime?: string;
};

/** Kullanıcının seçebilmesi için sadeleştirilmiş teklif (kargo firması + fiyat). */
export type ShipmentOffer = {
  id: string;
  carrier: string; // firma/servis adı (görünen)
  amount: number;
  currency: string;
  estDays: string | null;
};

export type ShipmentQuote = {
  created: boolean;
  provider: string | null;
  shipmentId: string | null;
  offers: ShipmentOffer[];
  reason?: string;
};

/** Yanıt sarmalayıcısını açar ({data: ...} ya da düz nesne). */
function unwrap(json: unknown): Record<string, unknown> {
  const j = json as Record<string, unknown> | null;
  return ((j?.data ?? j) ?? {}) as Record<string, unknown>;
}

/** Ham Geliver tekliflerini görünür tekliflere çevirir (en ucuzdan pahalıya sıralı). */
export function parseGeliverOffers(raw: unknown): ShipmentOffer[] {
  const list = Array.isArray(raw) ? (raw as GeliverOffer[]) : [];
  return list
    .map(o => {
      const carrier =
        (o.providerServiceName || o.serviceName || o.providerName || o.provider || o.providerCode || o.providerServiceCode || "Kargo")
          .toString()
          .trim();
      return {
        id: String(o.id ?? o.ID ?? ""),
        carrier,
        amount: parseFloat(String(o.totalAmount ?? o.amount ?? o.price ?? "")),
        currency: (o.currency ?? o.currencyCode ?? "TRY").toString(),
        estDays: (o.estimatedDeliveryDate ?? o.estimatedDeliveryTime ?? o.deliveryTime ?? null) as string | null,
      };
    })
    .filter(o => o.id && Number.isFinite(o.amount))
    .sort((a, b) => a.amount - b.amount);
}

async function geliverFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`${GELIVER_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ENV.geliverToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* metin kalsın */
  }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 500) };
}

/**
 * Geliver'de gönderi oluşturur ve teklifleri (kargo firması + fiyat) döndürür —
 * SATIN ALMAZ. Kullanıcı hangi firmayı istediğini seçer, sonra buyShipmentOffer
 * çağrılır. Böylece "her zaman en ucuz" yerine tercih kullanıcıda kalır.
 */
async function createGeliverShipment(input: ShipmentInput): Promise<ShipmentQuote> {
  const edge = desiToEdgeCm(input.desi ?? 1);
  const body: Record<string, unknown> = {
    // Test modunda gerçek etiket satın alınmaz; kurulum doğrulaması içindir.
    test: ENV.geliverTestMode === "1",
    recipientAddress: {
      name: input.recipientName.trim().slice(0, 100) || "Alıcı",
      phone: input.phone.replace(/\D/g, ""),
      address1: input.address.trim().slice(0, 250),
      cityName: input.city?.trim() || "",
      districtName: input.district?.trim() || "",
      countryCode: "TR",
    },
    length: edge,
    width: edge,
    height: edge,
    distanceUnit: "cm",
    weight: String(input.desi && input.desi > 0 ? input.desi : 1),
    massUnit: "kg",
    order: { orderNumber: input.orderNo, sourceIdentifier: "kokpit" },
  };
  if (ENV.geliverSenderAddressId) body.senderAddressID = ENV.geliverSenderAddressId;

  const created = await geliverFetch("/shipments", { method: "POST", body: JSON.stringify(body) });
  if (!created.ok) {
    return {
      created: false,
      provider: "geliver",
      shipmentId: null,
      offers: [],
      reason: `Geliver gönderi oluşturulamadı (${created.status}): ${created.text}`,
    };
  }
  const ship = unwrap(created.json);
  const shipmentId = String(ship.id ?? ship.ID ?? "") || null;
  const offers = parseGeliverOffers(ship.offers ?? ship.priceOffers ?? ship.rates ?? []);

  if (offers.length === 0) {
    return {
      created: true,
      provider: "geliver",
      shipmentId,
      offers: [],
      reason: "Gönderi oluştu ama fiyat teklifi dönmedi (gönderici adresi/desi kontrol edilebilir). Etiket Geliver panelinden alınabilir.",
    };
  }
  return { created: true, provider: "geliver", shipmentId, offers };
}

/** Seçilen teklifi satın alır → takip no + etiket URL döner. */
async function buyGeliverOffer(offerId: string): Promise<ShipmentResult> {
  const buy = await geliverFetch("/transactions", { method: "POST", body: JSON.stringify({ offerID: offerId }) });
  if (!buy.ok) {
    return {
      created: false,
      provider: "geliver",
      trackingNumber: null,
      trackingUrl: null,
      labelUrl: null,
      reason: `Teklif satın alınamadı (${buy.status}): ${buy.text} — etiketi Geliver panelinden alabilirsin (app.geliver.io).`,
    };
  }
  const tx = unwrap(buy.json);
  const shipment = unwrap(tx.shipment ?? tx);
  const trackingNumber = String(shipment.trackingNumber ?? shipment.barcode ?? tx.trackingNumber ?? "") || null;
  const labelUrl = String(shipment.labelURL ?? shipment.labelUrl ?? tx.labelURL ?? "") || null;
  const trackingUrl = String(shipment.trackingUrl ?? shipment.trackingURL ?? "") || null;
  return { created: true, provider: "geliver", trackingNumber, trackingUrl, labelUrl };
}

/**
 * Gönderi açıp TEKLİFLERİ döndürür (satın almaz). Yapılandırma yoksa created:false
 * döner (akış bozulmaz). Kullanıcı teklif seçince buyShipmentOffer çağrılır.
 */
export async function openShipment(input: ShipmentInput): Promise<ShipmentQuote> {
  if (isGeliverConfigured()) {
    return createGeliverShipment(input);
  }
  if (!isKargoConfigured()) {
    return { created: false, provider: null, shipmentId: null, offers: [], reason: "Kargo entegrasyonu yapılandırılmamış (manuel gönderim). Kurulum: KARGO.md (Geliver)." };
  }
  // Jenerik sağlayıcı adaptörü henüz bağlanmadı; payload hazır.
  buildShipmentPayload(input);
  return { created: false, provider: ENV.kargoProvider, shipmentId: null, offers: [], reason: `Sağlayıcı adaptörü (${ENV.kargoProvider}) henüz canlı bağlanmadı — payload hazır` };
}

/** Kullanıcının seçtiği teklifi satın alır. */
export async function buyShipmentOffer(offerId: string): Promise<ShipmentResult> {
  if (!isGeliverConfigured()) {
    return { created: false, provider: null, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: "Kargo entegrasyonu yapılandırılmamış." };
  }
  return buyGeliverOffer(offerId);
}
