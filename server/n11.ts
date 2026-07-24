import { ENV } from "./_core/env";
import * as db from "./db";
import { classifyMarketplaceStatus, itemsTotal, shouldSyncOrderStatus, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * N11 REST API entegrasyonu (sipariş çekme + stok/fiyat gönderme).
 * Kimlik: `appKey` + `appSecret` başlıkları. Belgeler: api.n11.com.
 *
 * Trendyol/Hepsiburada ile aynı desen: savunmacı yanıt ayrıştırma (alan adları
 * satıcıya/sürüme göre değişebilir), ileri-yönlü durum senkronu, iptal→pano iptali.
 * Geliştirme ortamı pazaryerine çıkamaz — yalnızca CANLIDA (Render) doğrulanır.
 */

const N11_API_BASE = process.env.N11_API_BASE_URL ?? "https://api.n11.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type N11LineRaw = {
  productName?: string;
  productSellerCode?: string;
  sellerCode?: string;
  gtin?: string;
  barcode?: string;
  quantity?: number;
  price?: number;
  sellerInvoiceAmount?: number;
};

type N11OrderRaw = {
  orderNumber?: string | number;
  id?: string | number;
  status?: string;
  buyerName?: string;
  fullName?: string;
  totalAmount?: number;
  billingAddress?: { fullName?: string };
  lines?: N11LineRaw[];
  orderItemList?: N11LineRaw[];
  items?: N11LineRaw[];
};

type N11OrdersResponse = {
  content?: N11OrderRaw[];
  orders?: N11OrderRaw[];
  orderList?: N11OrderRaw[];
  totalPages?: number;
  pageCount?: number;
};

/** N11 durumu → pano sütunu. `null` içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  New: "new",
  Approved: "new",
  Created: "new",
  Picking: "new",
  Preparing: "new",
  Shipped: "ready",
  ReadyForShipment: "ready",
  InTransit: "ready",
  Delivered: "done",
  Completed: "done",
  Rejected: null,
  Cancelled: null,
  Canceled: null,
  Returned: null,
  Claim: null,
};

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "n11";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  paymentStatus: "paid";
  items: OrderItemLike[];
};

/** Bir N11 siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapN11Order(raw: N11OrderRaw): MappedOrder | null {
  const rawStatus = raw.status ?? "New";
  const status = classifyMarketplaceStatus(rawStatus, STATUS_MAP);
  if (status === null) return null;

  const orderNumber = raw.orderNumber ?? raw.id;
  if (orderNumber === undefined || orderNumber === null || orderNumber === "") return null;

  const lines = raw.lines ?? raw.orderItemList ?? raw.items ?? [];
  const items: OrderItemLike[] = lines.map(l => {
    const qty = l.quantity ?? 1;
    const unit = l.price ?? (l.sellerInvoiceAmount ? l.sellerInvoiceAmount / Math.max(qty, 1) : 0);
    return {
      productName: l.productName ?? l.sellerCode ?? l.productSellerCode ?? "Ürün",
      quantity: qty,
      unitPrice: unit,
      // Eşleşme: önce GTIN/barkod, yoksa satıcı stok kodu (bizdeki barkod/SKU ile).
      barcode: l.gtin ?? l.barcode ?? l.productSellerCode ?? l.sellerCode ?? null,
    };
  });

  const customerName =
    raw.buyerName || raw.fullName || raw.billingAddress?.fullName || "N11 Müşterisi";

  return {
    orderNo: `N11-${orderNumber}`,
    customerName,
    channel: "n11",
    status,
    totalAmount: String(raw.totalAmount ?? itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    // Pazaryeri ödemeyi tahsil eder; alacak sayılmaz (Trendyol/HB ile aynı).
    paymentStatus: "paid",
    items,
  };
}

export function isN11Configured(): boolean {
  return Boolean(ENV.n11AppKey && ENV.n11AppSecret);
}

function n11Headers(): Record<string, string> {
  return {
    appKey: ENV.n11AppKey,
    appSecret: ENV.n11AppSecret,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchOrdersPage(page: number): Promise<N11OrdersResponse> {
  const url = new URL(`${N11_API_BASE}/ms/order/list`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  const res = await fetch(url, { headers: n11Headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error("N11 API bilgileri reddedildi (yetki hatası). appKey/appSecret'ı kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`N11 API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as N11OrdersResponse;
}

/** Bağlantı testi: gerçek istek atıp N11'in döndürdüğü HTTP durumunu döner. */
export async function testN11Connection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isN11Configured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (appKey, appSecret)." };
  }
  const url = new URL(`${N11_API_BASE}/ms/order/list`);
  url.searchParams.set("page", "0");
  url.searchParams.set("size", "1");
  try {
    const res = await fetch(url, { headers: n11Headers() });
    const body = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

export type StockPriceItem = {
  /** N11 stok kodu (satıcı SKU'su) — bizde ürün SKU'su/barkodu. */
  sellerStockCode: string;
  quantity: number;
  price: number;
};

/**
 * N11'e stok ve fiyat gönderir (mevcut ilanları günceller).
 * Belgeler: api.n11.com → product → price-stock update.
 */
export async function pushN11StockPrice(items: StockPriceItem[]) {
  if (!isN11Configured()) {
    throw new Error("N11 entegrasyonu yapılandırılmamış (appKey, appSecret gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (SKU/barkodlu ürün gerekli).");
  const res = await fetch(`${N11_API_BASE}/ms/product/tasks/price-stock-update`, {
    method: "POST",
    headers: n11Headers(),
    body: JSON.stringify({
      items: items.map(i => ({
        stockCode: i.sellerStockCode,
        quantity: i.quantity,
        price: i.price,
      })),
    }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("N11 API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`N11 stok/fiyat gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { taskId?: string | number };
  return { taskId: data.taskId != null ? String(data.taskId) : null, sent: items.length };
}

/** N11 siparişlerini çekip yeni olanları panoya ekler. */
export async function syncN11Orders() {
  if (!isN11Configured()) {
    throw new Error("N11 entegrasyonu yapılandırılmamış: N11_APP_KEY ve N11_APP_SECRET ayarlanmalı.");
  }
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchOrdersPage(page);
    const orders = data.content ?? data.orders ?? data.orderList ?? [];
    if (orders.length === 0) break;

    for (const raw of orders) {
      const mapped = mapN11Order(raw);
      if (!mapped) {
        const rawNo = raw.orderNumber ?? raw.id;
        if (rawNo !== undefined && rawNo !== null && rawNo !== "") {
          const cancelledNo = `N11-${rawNo}`;
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

    if (page >= (data.totalPages ?? data.pageCount ?? 1) - 1) break;
  }

  return { imported, updated, skipped };
}
