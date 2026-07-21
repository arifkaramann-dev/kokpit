import { ENV } from "./_core/env";

/**
 * Kargo entegrasyonu — kendi mağaza/elden siparişleri için gönderi + etiket.
 *
 * Birincil sağlayıcı: **Geliver** (geliver.io — patron zaten kullanıyor).
 * API: https://docs.geliver.io · Temel: https://api.geliver.io/api/v1
 * Kimlik: `Authorization: Bearer <GELIVER_API_TOKEN>` (app.geliver.io/apitokens).
 * Akış: POST /shipments (gönderi + teklifler) → en ucuz teklif POST /transactions
 * ile satın alınır → yanıtta takip no + etiket URL'si döner. Teklif satın alma
 * başarısız olursa gönderi yine oluşur; etiket Geliver panelinden alınabilir.
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

type GeliverOffer = { id?: string; ID?: string; totalAmount?: string | number; amount?: string | number; providerServiceCode?: string };

/** Yanıt sarmalayıcısını açar ({data: ...} ya da düz nesne). */
function unwrap(json: unknown): Record<string, unknown> {
  const j = json as Record<string, unknown> | null;
  return ((j?.data ?? j) ?? {}) as Record<string, unknown>;
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

/** Geliver'de gönderi oluşturur, en ucuz teklifi satın almayı dener. */
async function createGeliverShipment(input: ShipmentInput): Promise<ShipmentResult> {
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
      trackingNumber: null,
      trackingUrl: null,
      labelUrl: null,
      reason: `Geliver gönderi oluşturulamadı (${created.status}): ${created.text}`,
    };
  }
  const ship = unwrap(created.json);
  const shipmentId = String(ship.id ?? ship.ID ?? "") || null;
  const offers = (ship.offers ?? ship.priceOffers ?? []) as GeliverOffer[];

  // En ucuz teklifi seç ve satın al; olmazsa gönderi panelde hazır bekler.
  const priced = (Array.isArray(offers) ? offers : [])
    .map(o => ({ id: String(o.id ?? o.ID ?? ""), amount: parseFloat(String(o.totalAmount ?? o.amount ?? "")) }))
    .filter(o => o.id && Number.isFinite(o.amount))
    .sort((a, b) => a.amount - b.amount);

  if (priced.length > 0) {
    const buy = await geliverFetch("/transactions", {
      method: "POST",
      body: JSON.stringify({ offerID: priced[0].id }),
    });
    if (buy.ok) {
      const tx = unwrap(buy.json);
      const shipment = unwrap(tx.shipment ?? tx);
      const trackingNumber =
        String(shipment.trackingNumber ?? shipment.barcode ?? tx.trackingNumber ?? "") || null;
      const labelUrl = String(shipment.labelURL ?? shipment.labelUrl ?? tx.labelURL ?? "") || null;
      const trackingUrl = String(shipment.trackingUrl ?? shipment.trackingURL ?? "") || null;
      return { created: true, provider: "geliver", trackingNumber, trackingUrl, labelUrl, shipmentId };
    }
    return {
      created: true,
      provider: "geliver",
      trackingNumber: null,
      trackingUrl: null,
      labelUrl: null,
      shipmentId,
      reason: `Gönderi oluştu ama teklif satın alınamadı (${buy.status}): ${buy.text} — etiketi Geliver panelinden alabilirsin (app.geliver.io).`,
    };
  }

  return {
    created: true,
    provider: "geliver",
    trackingNumber: null,
    trackingUrl: null,
    labelUrl: null,
    shipmentId,
    reason: "Gönderi oluştu; fiyat teklifi dönmedi (gönderici adresi/desi kontrol edilebilir). Etiket Geliver panelinden alınabilir.",
  };
}

/**
 * Gönderi oluşturur. Yapılandırma yoksa created:false döner (akış bozulmaz);
 * anahtar gelince aynı çağrı gerçek gönderiye döner.
 */
export async function createShipment(input: ShipmentInput): Promise<ShipmentResult> {
  if (isGeliverConfigured()) {
    return createGeliverShipment(input);
  }
  if (!isKargoConfigured()) {
    return { created: false, provider: null, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: "Kargo entegrasyonu yapılandırılmamış (manuel gönderim). Kurulum: KARGO.md (Geliver)." };
  }
  // Jenerik sağlayıcı adaptörü henüz bağlanmadı; payload hazır.
  buildShipmentPayload(input);
  return { created: false, provider: ENV.kargoProvider, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: `Sağlayıcı adaptörü (${ENV.kargoProvider}) henüz canlı bağlanmadı — payload hazır` };
}
