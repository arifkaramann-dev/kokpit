import { ENV } from "./_core/env";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * Çiçeksepeti "Dükkan" (Seller) API entegrasyonu.
 * Siparişleri çekip yerel sipariş panosuna aktarır; stok/fiyat gönderir.
 * Belgeler: https://sellerapi-docs.ciceksepeti.com (Order, Product).
 *
 * Kimlik doğrulama: `x-api-key` HTTP başlığı (tek API anahtarı).
 * Yanıt ayrıştırma savunmacı yazılmıştır (birden çok alan adı denenir).
 *
 * NOT: Bu ortam Çiçeksepeti'ne çıkamadığından entegrasyon CANLIDA (Render)
 * API anahtarı girildikten sonra "Bağlantıyı Test Et" ile doğrulanmalıdır.
 */

const CS_API_BASE = process.env.CICEKSEPETI_API_BASE_URL ?? "https://apis.ciceksepeti.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type CsLineRaw = {
  productName?: string;
  name?: string;
  productCode?: string;
  barcode?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  totalPrice?: number;
};

type CsOrderRaw = {
  orderNumber?: string;
  orderId?: string | number;
  id?: string | number;
  status?: string;
  orderStatus?: string;
  receiverName?: string;
  customerName?: string;
  totalPrice?: number;
  totalAmount?: number;
  products?: CsLineRaw[];
  orderItems?: CsLineRaw[];
  items?: CsLineRaw[];
};

type CsOrdersResponse = {
  supplierOrderList?: CsOrderRaw[];
  orders?: CsOrderRaw[];
  data?: CsOrderRaw[];
  totalPageCount?: number;
  totalCount?: number;
};

/** Çiçeksepeti durumu → pano sütunu. `null` içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  New: "new",
  Confirmed: "new",
  Preparing: "production",
  ReadyToShip: "ready",
  Shipped: "ready",
  InDelivery: "ready",
  Delivered: "done",
  Completed: "done",
  Cancelled: null,
  Canceled: null,
  Returned: null,
};

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "ciceksepeti";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  items: OrderItemLike[];
};

/** Bir Çiçeksepeti siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapCsOrder(raw: CsOrderRaw): MappedOrder | null {
  const rawStatus = raw.orderStatus ?? raw.status ?? "New";
  const status = rawStatus in STATUS_MAP ? STATUS_MAP[rawStatus] : "new";
  if (status === null) return null;

  const orderNumber = raw.orderNumber ?? raw.orderId ?? raw.id;
  if (!orderNumber) return null;

  const lines = raw.products ?? raw.orderItems ?? raw.items ?? [];
  const items: OrderItemLike[] = lines.map(l => {
    const qty = l.quantity ?? 1;
    const unit = l.unitPrice ?? l.price ?? (l.totalPrice ? l.totalPrice / Math.max(qty, 1) : 0);
    return {
      productName: l.productName ?? l.name ?? l.productCode ?? "Ürün",
      quantity: qty,
      unitPrice: unit,
    };
  });

  const customerName = raw.receiverName || raw.customerName || "Çiçeksepeti Müşterisi";

  return {
    orderNo: `CS-${orderNumber}`,
    customerName,
    channel: "ciceksepeti",
    status,
    totalAmount: String(raw.totalPrice ?? raw.totalAmount ?? itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    items,
  };
}

function csHeaders() {
  return {
    "x-api-key": ENV.ciceksepetiApiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchOrdersPage(page: number): Promise<CsOrdersResponse> {
  const url = `${CS_API_BASE}/api/v1/Order/GetOrders`;
  const res = await fetch(url, {
    method: "POST",
    headers: csHeaders(),
    body: JSON.stringify({ pageNumber: page, pageSize: PAGE_SIZE }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Çiçeksepeti API anahtarı reddedildi (yetki hatası). x-api-key'i kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Çiçeksepeti API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as CsOrdersResponse;
}

export function isCiceksepetiConfigured(): boolean {
  return Boolean(ENV.ciceksepetiApiKey);
}

export type StockPriceItem = {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
};

/** Çiçeksepeti'ne stok ve fiyat gönderir (ürün kodu/barkod ile eşleşen ilanları günceller). */
export async function pushCiceksepetiStockPrice(items: StockPriceItem[]) {
  if (!isCiceksepetiConfigured()) {
    throw new Error("Çiçeksepeti entegrasyonu yapılandırılmamış (API anahtarı gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (barkodlu ürün gerekli).");

  const url = `${CS_API_BASE}/api/v1/Product/UpdateProductStockAndPrice`;
  const res = await fetch(url, {
    method: "POST",
    headers: csHeaders(),
    body: JSON.stringify({
      items: items.map(i => ({
        stockCode: i.barcode,
        quantity: i.quantity,
        salesPrice: i.salePrice,
        listPrice: i.listPrice,
      })),
    }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Çiçeksepeti API anahtarı reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Çiçeksepeti stok/fiyat gönderimi başarısız (${res.status}): ${body}`);
  }
  return { sent: items.length };
}

/** Bağlantı testi: gerçek istek atıp Çiçeksepeti'nin döndürdüğü HTTP durumunu döner. */
export async function testCiceksepetiConnection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isCiceksepetiConfigured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (API anahtarı)." };
  }
  const url = `${CS_API_BASE}/api/v1/Order/GetOrders`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: csHeaders(),
      body: JSON.stringify({ pageNumber: 0, pageSize: 1 }),
    });
    const body = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

/** Çiçeksepeti siparişlerini çekip yeni olanları panoya ekler. */
export async function syncCiceksepetiOrders() {
  if (!isCiceksepetiConfigured()) {
    throw new Error("Çiçeksepeti entegrasyonu yapılandırılmamış: CICEKSEPETI_API_KEY ortam değişkenini ayarlayın.");
  }

  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchOrdersPage(page);
    const orders = data.supplierOrderList ?? data.orders ?? data.data ?? [];
    if (orders.length === 0) break;

    for (const raw of orders) {
      const mapped = mapCsOrder(raw);
      if (!mapped) continue;

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

    if (page >= (data.totalPageCount ?? 1) - 1) break;
  }

  return { imported, skipped };
}
