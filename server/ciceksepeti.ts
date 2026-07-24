import { ENV } from "./_core/env";
import * as db from "./db";
import { classifyMarketplaceStatus, itemsTotal, shouldSyncOrderStatus, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * Çiçeksepeti REST API entegrasyonu (sipariş çekme + stok/fiyat gönderme).
 * Kimlik: `x-api-key` başlığı. Belgeler: apis.ciceksepeti.com.
 *
 * Trendyol/HB/N11 ile aynı desen: savunmacı yanıt ayrıştırma, ileri-yönlü durum
 * senkronu, iptal→pano iptali. Yalnızca CANLIDA (Render) doğrulanır.
 */

const CS_API_BASE = process.env.CICEKSEPETI_API_BASE_URL ?? "https://apis.ciceksepeti.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type CsLineRaw = {
  productName?: string;
  name?: string;
  stockCode?: string;
  barcode?: string;
  quantity?: number;
  price?: number;
  totalPrice?: number;
  unitPrice?: number;
};

type CsOrderRaw = {
  orderNumber?: string | number;
  orderId?: string | number;
  id?: string | number;
  status?: string;
  orderStatus?: string;
  receiverName?: string;
  customerName?: string;
  totalPrice?: number;
  totalAmount?: number;
  items?: CsLineRaw[];
  orderItems?: CsLineRaw[];
  products?: CsLineRaw[];
};

type CsOrdersResponse = {
  orderList?: CsOrderRaw[];
  orders?: CsOrderRaw[];
  content?: CsOrderRaw[];
  data?: { orders?: CsOrderRaw[]; totalPageCount?: number };
  totalPageCount?: number;
  totalPages?: number;
};

/** Çiçeksepeti durumu → pano sütunu. `null` içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  New: "new",
  Onaylandı: "new",
  Approved: "new",
  Preparing: "new",
  Hazırlanıyor: "new",
  Shipped: "ready",
  Kargolandı: "ready",
  InDelivery: "ready",
  Delivered: "done",
  TeslimEdildi: "done",
  Completed: "done",
  Cancelled: null,
  Canceled: null,
  İptal: null,
  Returned: null,
  İade: null,
};

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "ciceksepeti";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  paymentStatus: "paid";
  items: OrderItemLike[];
};

/** Bir Çiçeksepeti siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapCsOrder(raw: CsOrderRaw): MappedOrder | null {
  const rawStatus = raw.status ?? raw.orderStatus ?? "New";
  const status = classifyMarketplaceStatus(rawStatus, STATUS_MAP);
  if (status === null) return null;

  const orderNumber = raw.orderNumber ?? raw.orderId ?? raw.id;
  if (orderNumber === undefined || orderNumber === null || orderNumber === "") return null;

  const lines = raw.items ?? raw.orderItems ?? raw.products ?? [];
  const items: OrderItemLike[] = lines.map(l => {
    const qty = l.quantity ?? 1;
    const unit =
      l.unitPrice ?? l.price ?? (l.totalPrice ? l.totalPrice / Math.max(qty, 1) : 0);
    return {
      productName: l.productName ?? l.name ?? l.stockCode ?? "Ürün",
      quantity: qty,
      unitPrice: unit,
      barcode: l.barcode ?? l.stockCode ?? null,
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
    paymentStatus: "paid",
    items,
  };
}

export function isCiceksepetiConfigured(): boolean {
  return Boolean(ENV.ciceksepetiApiKey);
}

function csHeaders(): Record<string, string> {
  return {
    "x-api-key": ENV.ciceksepetiApiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchOrdersPage(page: number): Promise<CsOrdersResponse> {
  const res = await fetch(`${CS_API_BASE}/api/v1/Order/GetOrders`, {
    method: "POST",
    headers: csHeaders(),
    body: JSON.stringify({ pageSize: PAGE_SIZE, page }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Çiçeksepeti API bilgileri reddedildi (yetki hatası). x-api-key'i kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Çiçeksepeti API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as CsOrdersResponse;
}

/** Bağlantı testi: gerçek istek atıp Çiçeksepeti'nin döndürdüğü HTTP durumunu döner. */
export async function testCiceksepetiConnection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isCiceksepetiConfigured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (x-api-key)." };
  }
  try {
    const res = await fetch(`${CS_API_BASE}/api/v1/Order/GetOrders`, {
      method: "POST",
      headers: csHeaders(),
      body: JSON.stringify({ pageSize: 1, page: 0 }),
    });
    const body = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

export type StockPriceItem = {
  /** Çiçeksepeti stok kodu — bizde ürün SKU'su/barkodu. */
  stockCode: string;
  quantity: number;
  price: number;
};

/**
 * Çiçeksepeti'ne stok ve fiyat gönderir (mevcut ilanları günceller).
 * Belgeler: apis.ciceksepeti.com → Product → UpdateProductStockAndPrice.
 */
export async function pushCiceksepetiStockPrice(items: StockPriceItem[]) {
  if (!isCiceksepetiConfigured()) {
    throw new Error("Çiçeksepeti entegrasyonu yapılandırılmamış (x-api-key gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (SKU/barkodlu ürün gerekli).");
  const res = await fetch(`${CS_API_BASE}/api/v1/Product/UpdateProductStockAndPrice`, {
    method: "POST",
    headers: csHeaders(),
    body: JSON.stringify({
      products: items.map(i => ({
        stockCode: i.stockCode,
        stockQuantity: i.quantity,
        salesPrice: i.price,
      })),
    }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Çiçeksepeti API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Çiçeksepeti stok/fiyat gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { batchId?: string };
  return { batchId: data.batchId ?? null, sent: items.length };
}

/** Çiçeksepeti siparişlerini çekip yeni olanları panoya ekler. */
export async function syncCiceksepetiOrders() {
  if (!isCiceksepetiConfigured()) {
    throw new Error("Çiçeksepeti entegrasyonu yapılandırılmamış: CICEKSEPETI_API_KEY ayarlanmalı.");
  }
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchOrdersPage(page);
    const orders = data.orderList ?? data.orders ?? data.content ?? data.data?.orders ?? [];
    if (orders.length === 0) break;

    for (const raw of orders) {
      const mapped = mapCsOrder(raw);
      if (!mapped) {
        const rawNo = raw.orderNumber ?? raw.orderId ?? raw.id;
        if (rawNo !== undefined && rawNo !== null && rawNo !== "") {
          const cancelledNo = `CS-${rawNo}`;
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
        if (shouldSyncOrderStatus(existing.status, mapped.status)) {
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

    const totalPages = data.totalPageCount ?? data.totalPages ?? data.data?.totalPageCount ?? 1;
    if (page >= totalPages - 1) break;
  }

  return { imported, updated, skipped };
}
