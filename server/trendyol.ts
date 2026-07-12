import { ENV } from "./_core/env";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * Trendyol Satıcı API entegrasyonu.
 * Sipariş paketlerini çekip yerel sipariş panosuna aktarır.
 * Belgeler: https://developers.trendyol.com (Sipariş Paketlerini Çekme)
 */

// Test ortamında sahte sunucuya yönlendirilebilir.
const TRENDYOL_API_BASE = process.env.TRENDYOL_API_BASE_URL ?? "https://apigw.trendyol.com";
const PAGE_SIZE = 200;
const MAX_PAGES = 10; // güvenlik sınırı

export type TrendyolLine = {
  productName: string;
  quantity: number;
  /** Birim satış fiyatı (indirimler düşülmüş). */
  price: number;
};

export type TrendyolPackage = {
  id: number;
  orderNumber: string;
  orderDate?: number;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  status: string;
  totalPrice?: number;
  lines: TrendyolLine[];
};

type TrendyolOrdersResponse = {
  page: number;
  size: number;
  totalPages?: number;
  totalElements?: number;
  content?: TrendyolPackage[];
};

/** Trendyol paket durumu → pano sütunu. `null` olanlar içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  Created: "new",
  Picking: "new",
  Invoiced: "new",
  Repack: "new",
  Shipped: "ready",
  AtCollectionPoint: "ready",
  Delivered: "done",
  Cancelled: null,
  UnSupplied: null,
  UnDelivered: null,
  Returned: null,
};

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "trendyol";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  items: OrderItemLike[];
};

/** Bir Trendyol paketini yerel sipariş kaydına çevirir; içe aktarılmayacaksa null döner. */
export function mapPackageToOrder(pkg: TrendyolPackage): MappedOrder | null {
  const status = pkg.status in STATUS_MAP ? STATUS_MAP[pkg.status] : "new";
  if (status === null) return null;

  const items: OrderItemLike[] = (pkg.lines ?? []).map(line => ({
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.price,
  }));

  const customerName =
    [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ").trim() ||
    "Trendyol Müşterisi";

  return {
    orderNo: `TY-${pkg.orderNumber}`,
    customerName,
    channel: "trendyol",
    status,
    totalAmount: String(pkg.totalPrice ?? itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    items,
  };
}

async function fetchPackagesPage(page: number, startDate: number, endDate: number) {
  const url = new URL(
    `${TRENDYOL_API_BASE}/integration/order/sellers/${ENV.trendyolSellerId}/orders`
  );
  url.searchParams.set("startDate", String(startDate));
  url.searchParams.set("endDate", String(endDate));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("orderByField", "PackageLastModifiedDate");
  url.searchParams.set("orderByDirection", "DESC");

  const auth = Buffer.from(`${ENV.trendyolApiKey}:${ENV.trendyolApiSecret}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      // Trendyol, kendi entegrasyonunu yapan satıcılardan bu User-Agent biçimini ister.
      "User-Agent": `${ENV.trendyolSellerId} - SelfIntegration`,
      Accept: "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Trendyol API bilgileri reddedildi (yetki hatası). API Key/Secret ve Satıcı ID'yi kontrol edin."
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Trendyol API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as TrendyolOrdersResponse;
}

export function isTrendyolConfigured(): boolean {
  return Boolean(ENV.trendyolSellerId && ENV.trendyolApiKey && ENV.trendyolApiSecret);
}

export type StockPriceItem = {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
};

/**
 * Trendyol'a stok ve fiyat gönderir (mevcut listelemeleri günceller).
 * Barkodla eşleşen ürünlerin adet ve fiyatı güncellenir.
 * Belgeler: fiyat ve stok güncelleme (price-and-inventory).
 */
export async function pushTrendyolStockPrice(items: StockPriceItem[]) {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış (Satıcı ID, API Key, API Secret gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (barkodlu ürün gerekli).");

  const url = `${TRENDYOL_API_BASE}/integration/inventory/sellers/${ENV.trendyolSellerId}/products/price-and-inventory`;
  const auth = Buffer.from(`${ENV.trendyolApiKey}:${ENV.trendyolApiSecret}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": `${ENV.trendyolSellerId} - SelfIntegration`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası). API Key/Secret ve Satıcı ID'yi kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Trendyol stok/fiyat gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { batchRequestId?: string };
  return { batchRequestId: data.batchRequestId ?? null, sent: items.length };
}

/** Bağlantı testi: gerçek istek atıp Trendyol'un döndürdüğü HTTP durumunu döner. */
export async function testTrendyolConnection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isTrendyolConfigured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (Satıcı ID, API Key, API Secret)." };
  }
  const url = new URL(`${TRENDYOL_API_BASE}/integration/order/sellers/${ENV.trendyolSellerId}/orders`);
  url.searchParams.set("size", "1");
  const auth = Buffer.from(`${ENV.trendyolApiKey}:${ENV.trendyolApiSecret}`).toString("base64");
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": `${ENV.trendyolSellerId} - SelfIntegration`,
        Accept: "application/json",
      },
    });
    const body = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

/**
 * Son `daysBack` günün Trendyol siparişlerini çekip yeni olanları panoya ekler.
 * Aynı sipariş (TY-orderNumber) ikinci kez eklenmez.
 */
export async function syncTrendyolOrders(daysBack = 14) {
  if (!ENV.trendyolSellerId || !ENV.trendyolApiKey || !ENV.trendyolApiSecret) {
    throw new Error(
      "Trendyol entegrasyonu yapılandırılmamış: TRENDYOL_SELLER_ID, TRENDYOL_API_KEY ve TRENDYOL_API_SECRET ortam değişkenlerini ayarlayın."
    );
  }

  const endDate = Date.now();
  const startDate = endDate - daysBack * 24 * 60 * 60 * 1000;

  let imported = 0;
  let skipped = 0;
  // Aynı sipariş sayfalar arasında tekrar gelebilir; tek çekimde bir kez ekle.
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPackagesPage(page, startDate, endDate);
    const packages = data.content ?? [];

    for (const pkg of packages) {
      const mapped = mapPackageToOrder(pkg);
      if (!mapped) continue; // iptal/iade — panoya alınmaz

      if (seen.has(mapped.orderNo)) {
        skipped++;
        continue;
      }
      seen.add(mapped.orderNo);

      const existing = await db.getOrderByOrderNo(mapped.orderNo);
      if (existing) {
        skipped++;
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

  return { imported, skipped };
}
