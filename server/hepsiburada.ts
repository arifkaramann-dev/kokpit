import { ENV } from "./_core/env";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * Hepsiburada OMS (Sipariş Yönetim Sistemi) entegrasyonu.
 * Siparişleri çekip yerel sipariş panosuna aktarır.
 * Belgeler: https://developers.hepsiburada.com (Order/OMS API)
 *
 * Kimlik doğrulama: Basic auth (kullanıcı adı : şifre), User-Agent = merchantId.
 * Gerçek API alanları satıcıya göre küçük farklar gösterebildiği için
 * yanıt ayrıştırma savunmacı yazılmıştır (birden çok alan adı denenir).
 */

const HB_API_BASE = process.env.HEPSIBURADA_API_BASE_URL ?? "https://oms-external.hepsiburada.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type HbLineRaw = {
  productName?: string;
  name?: string;
  sku?: string;
  merchantSku?: string;
  quantity?: number;
  price?: { amount?: number } | number;
  totalPrice?: { amount?: number } | number;
  unitPrice?: { amount?: number } | number;
};

type HbOrderRaw = {
  orderNumber?: string;
  id?: string;
  orderId?: string;
  status?: string;
  customerName?: string;
  customer?: { name?: string; firstName?: string; lastName?: string };
  totalPrice?: { amount?: number } | number;
  items?: HbLineRaw[];
  details?: HbLineRaw[];
};

type HbOrdersResponse = {
  items?: HbOrderRaw[];
  orders?: HbOrderRaw[];
  content?: HbOrderRaw[];
  totalPages?: number;
  totalCount?: number;
};

/** Hepsiburada durumu → pano sütunu. `null` içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  Open: "new",
  New: "new",
  Picking: "new",
  ReadyToShip: "ready",
  Packaged: "ready",
  Shipped: "ready",
  InTransit: "ready",
  Delivered: "done",
  Completed: "done",
  Cancelled: null,
  Canceled: null,
  Returned: null,
  UnPacked: "new",
};

/** İç içe {amount} ya da düz sayı olabilen fiyat alanını sayıya çevirir. */
function money(v: { amount?: number } | number | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return v.amount ?? 0;
}

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "hepsiburada";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  items: OrderItemLike[];
};

/** Bir Hepsiburada siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapHbOrder(raw: HbOrderRaw): MappedOrder | null {
  const rawStatus = raw.status ?? "New";
  const status = rawStatus in STATUS_MAP ? STATUS_MAP[rawStatus] : "new";
  if (status === null) return null;

  const orderNumber = raw.orderNumber ?? raw.orderId ?? raw.id;
  if (!orderNumber) return null;

  const lines = raw.items ?? raw.details ?? [];
  const items: OrderItemLike[] = lines.map(l => {
    const qty = l.quantity ?? 1;
    // Birim fiyatı: unitPrice > (totalPrice/qty) > price sırasıyla dener.
    const unit =
      money(l.unitPrice) ||
      (money(l.totalPrice) ? money(l.totalPrice) / Math.max(qty, 1) : 0) ||
      money(l.price);
    return {
      productName: l.productName ?? l.name ?? l.sku ?? "Ürün",
      quantity: qty,
      unitPrice: unit,
      // HB'de merchantSku = barkod varsayımı (stok/fiyat push ile tutarlı).
      barcode: l.merchantSku ?? l.sku ?? null,
    };
  });

  const customerName =
    raw.customerName ||
    raw.customer?.name ||
    [raw.customer?.firstName, raw.customer?.lastName].filter(Boolean).join(" ").trim() ||
    "Hepsiburada Müşterisi";

  return {
    orderNo: `HB-${orderNumber}`,
    customerName,
    channel: "hepsiburada",
    status,
    totalAmount: String(money(raw.totalPrice) || itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    items,
  };
}

async function fetchOrdersPage(offset: number): Promise<HbOrdersResponse> {
  const url = new URL(`${HB_API_BASE}/orders/merchantid/${ENV.hepsiburadaMerchantId}`);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_SIZE));

  const auth = Buffer.from(`${ENV.hepsiburadaUsername}:${ENV.hepsiburadaPassword}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": ENV.hepsiburadaMerchantId,
      Accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Hepsiburada API bilgileri reddedildi (yetki hatası). Merchant ID, kullanıcı adı ve şifreyi kontrol edin."
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Hepsiburada API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as HbOrdersResponse;
}

export function isHepsiburadaConfigured(): boolean {
  return Boolean(ENV.hepsiburadaMerchantId && ENV.hepsiburadaUsername && ENV.hepsiburadaPassword);
}

/**
 * Bağlantı testi: gerçek bir istek atıp Hepsiburada'nın döndürdüğü HTTP
 * durumunu ve yanıt gövdesinin başını döner. 401 hatasının gerçek sebebini
 * (kullanıcı adı/şifre/endpoint) görmek için — canlıda çalıştırılır.
 */
export async function testHepsiburadaConnection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isHepsiburadaConfigured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (Merchant ID, kullanıcı adı, şifre)." };
  }
  const url = new URL(`${HB_API_BASE}/orders/merchantid/${ENV.hepsiburadaMerchantId}`);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "1");
  const auth = Buffer.from(`${ENV.hepsiburadaUsername}:${ENV.hepsiburadaPassword}`).toString("base64");
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": ENV.hepsiburadaMerchantId,
        Accept: "application/json",
      },
    });
    const body = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

/* ------------------------- Stok & fiyat gönderme (Listing API) ------------------------- */

const HB_LISTING_API_BASE =
  process.env.HEPSIBURADA_LISTING_API_BASE_URL ?? "https://listing-external.hepsiburada.com";

export type HbStockPriceItem = {
  /** Satıcı SKU'su — bizde ürün barkodu bu alana yazılır (listelemedeki merchantSku ile aynı olmalı). */
  merchantSku: string;
  price: number;
  availableStock: number;
};

function hbListingAuth(): string {
  // Listing API'si "Servis Anahtarı" ile çalışır; tanımlı değilse OMS şifresi denenir.
  const secret = ENV.hepsiburadaServiceKey || ENV.hepsiburadaPassword;
  return Buffer.from(`${ENV.hepsiburadaUsername}:${secret}`).toString("base64");
}

async function hbListingPost(path: string, payload: unknown): Promise<string | null> {
  const res = await fetch(`${HB_LISTING_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${hbListingAuth()}`,
      "User-Agent": ENV.hepsiburadaMerchantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Hepsiburada Listing API yetki hatası: HEPSIBURADA_SERVICE_KEY (Servis Anahtarı) Render'a girilmeli — panelden 'API Entegrasyon İşlemleri' altında üretilir."
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Hepsiburada gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; trackingId?: string };
  return data.id ?? data.trackingId ?? null;
}

/**
 * Hepsiburada'ya stok ve fiyat gönderir (mevcut listelemeleri günceller).
 * Listing API'sinde fiyat ve stok ayrı uçlardır; ikisi de tek çağrıda gönderilir.
 * Belgeler: developers.hepsiburada.com → Listing → price-uploads / stock-uploads.
 */
export async function pushHepsiburadaStockPrice(items: HbStockPriceItem[]) {
  if (!isHepsiburadaConfigured()) {
    throw new Error(
      "Hepsiburada entegrasyonu yapılandırılmamış (Merchant ID, kullanıcı adı ve Servis Anahtarı/şifre gerekli)."
    );
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (barkodlu ürün gerekli).");

  const priceUploadId = await hbListingPost(
    `/listings/merchantid/${ENV.hepsiburadaMerchantId}/price-uploads`,
    items.map(i => ({ merchantSku: i.merchantSku, price: i.price })),
  );
  const stockUploadId = await hbListingPost(
    `/listings/merchantid/${ENV.hepsiburadaMerchantId}/stock-uploads`,
    items.map(i => ({ merchantSku: i.merchantSku, availableStock: i.availableStock })),
  );
  return { priceUploadId, stockUploadId, sent: items.length };
}

/** Hepsiburada siparişlerini çekip yeni olanları panoya ekler. */
export async function syncHepsiburadaOrders() {
  if (!isHepsiburadaConfigured()) {
    throw new Error(
      "Hepsiburada entegrasyonu yapılandırılmamış: HEPSIBURADA_MERCHANT_ID, HEPSIBURADA_USERNAME ve HEPSIBURADA_PASSWORD ortam değişkenlerini ayarlayın."
    );
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  // Aynı sipariş sayfalar arasında tekrar gelebilir; tek çekimde bir kez ekle.
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchOrdersPage(page * PAGE_SIZE);
    const orders = data.items ?? data.orders ?? data.content ?? [];
    if (orders.length === 0) break;

    for (const raw of orders) {
      const mapped = mapHbOrder(raw);
      if (!mapped) {
        // İptal/iade: içe alınmış sipariş varsa iptal et (stok iadesi otomatik).
        const rawNo = raw.orderNumber ?? raw.orderId ?? raw.id;
        if (rawNo) {
          const cancelledNo = `HB-${rawNo}`;
          if (!seen.has(cancelledNo)) {
            seen.add(cancelledNo);
            const existing = await db.getOrderByOrderNo(cancelledNo);
            if (existing && existing.status !== "cancelled") {
              await db.updateOrder(existing.id, { status: "cancelled" });
              updated++;
            }
          }
        }
        continue;
      }

      if (seen.has(mapped.orderNo)) {
        skipped++;
        continue;
      }
      seen.add(mapped.orderNo);

      const existing = await db.getOrderByOrderNo(mapped.orderNo);
      if (existing) {
        // Hepsiburada siparişin kaynağıdır: durum (Shipped→Hazır, Delivered→
        // Tamamlandı) senkronda otomatik akıtılır; kullanıcı elle taşımaz.
        if (mapped.status !== existing.status) {
          await db.updateOrder(existing.id, { status: mapped.status } as never);
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      const { items, ...order } = mapped;
      const insertId = await db.createOrder(order as never);
      if (items.length > 0) {
        await db.replaceOrderItems(Number(insertId), toItemRows(items));
      }
      imported++;
    }

    if (page >= (data.totalPages ?? 1) - 1) break;
  }

  return { imported, updated, skipped };
}
