import { ENV } from "./_core/env";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * N11 entegrasyonu (yeni REST API — api.n11.com).
 * Siparişleri çekip yerel sipariş panosuna aktarır; stok/fiyat gönderir.
 * Belgeler: https://apidocs.n11.com (Order Service, ProductStock Service).
 *
 * Kimlik doğrulama: `appkey` ve `appsecret` HTTP başlıkları.
 * Gerçek alan adları satıcıya/uca göre küçük farklar gösterebildiği için
 * yanıt ayrıştırma savunmacı yazılmıştır (birden çok alan adı denenir).
 *
 * NOT: Bu ortam N11'e çıkamadığından (güvenlik duvarı) entegrasyon CANLIDA
 * (Render) API anahtarı girildikten sonra "Bağlantıyı Test Et" ile doğrulanmalıdır.
 */

const N11_API_BASE = process.env.N11_API_BASE_URL ?? "https://api.n11.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type N11LineRaw = {
  productName?: string;
  productSellerCode?: string;
  sku?: string;
  gtin?: string;
  barcode?: string;
  quantity?: number;
  price?: number;
  sellerInvoiceAmount?: number;
  unitPrice?: number;
};

type N11OrderRaw = {
  orderNumber?: string;
  id?: string | number;
  orderId?: string | number;
  status?: string;
  shipmentPackageStatus?: string;
  buyerName?: string;
  customerName?: string;
  buyer?: { fullName?: string; firstName?: string; lastName?: string };
  totalAmount?: number;
  grandTotal?: number;
  lines?: N11LineRaw[];
  orderItemList?: N11LineRaw[];
  items?: N11LineRaw[];
};

type N11OrdersResponse = {
  content?: N11OrderRaw[];
  orders?: N11OrderRaw[];
  data?: N11OrderRaw[];
  totalPages?: number;
  totalCount?: number;
};

/** N11 durumu → pano sütunu. `null` içe aktarılmaz. */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  New: "new",
  Created: "new",
  Approved: "new",
  Picking: "production",
  ReadyToShip: "ready",
  Shipped: "ready",
  InTransit: "ready",
  Delivered: "done",
  Completed: "done",
  Cancelled: null,
  Rejected: null,
  Returned: null,
};

export type MappedOrder = {
  orderNo: string;
  customerName: string;
  channel: "n11";
  status: "new" | "production" | "ready" | "done";
  totalAmount: string;
  itemsSummary: string;
  notes: string | null;
  items: OrderItemLike[];
};

/** Bir N11 siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapN11Order(raw: N11OrderRaw): MappedOrder | null {
  const rawStatus = raw.shipmentPackageStatus ?? raw.status ?? "New";
  const status = rawStatus in STATUS_MAP ? STATUS_MAP[rawStatus] : "new";
  if (status === null) return null;

  const orderNumber = raw.orderNumber ?? raw.orderId ?? raw.id;
  if (!orderNumber) return null;

  const lines = raw.lines ?? raw.orderItemList ?? raw.items ?? [];
  const items: OrderItemLike[] = lines.map(l => {
    const qty = l.quantity ?? 1;
    const unit = l.unitPrice ?? l.price ?? (l.sellerInvoiceAmount ? l.sellerInvoiceAmount / Math.max(qty, 1) : 0);
    return {
      productName: l.productName ?? l.productSellerCode ?? l.sku ?? "Ürün",
      quantity: qty,
      unitPrice: unit,
    };
  });

  const customerName =
    raw.buyerName ||
    raw.customerName ||
    raw.buyer?.fullName ||
    [raw.buyer?.firstName, raw.buyer?.lastName].filter(Boolean).join(" ").trim() ||
    "N11 Müşterisi";

  return {
    orderNo: `N11-${orderNumber}`,
    customerName,
    channel: "n11",
    status,
    totalAmount: String(raw.totalAmount ?? raw.grandTotal ?? itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    items,
  };
}

function n11Headers() {
  return {
    appkey: ENV.n11AppKey,
    appsecret: ENV.n11AppSecret,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchOrdersPage(page: number): Promise<N11OrdersResponse> {
  const url = new URL(`${N11_API_BASE}/ms/order/orders`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));

  const res = await fetch(url, { headers: n11Headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error("N11 API bilgileri reddedildi (yetki hatası). App Key ve App Secret'ı kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`N11 API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as N11OrdersResponse;
}

export function isN11Configured(): boolean {
  return Boolean(ENV.n11AppKey && ENV.n11AppSecret);
}

export type StockPriceItem = {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
};

/** N11'e stok ve fiyat gönderir (barkod/stok kodu ile eşleşen ilanları günceller). */
export async function pushN11StockPrice(items: StockPriceItem[]) {
  if (!isN11Configured()) {
    throw new Error("N11 entegrasyonu yapılandırılmamış (App Key ve App Secret gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek ürün yok (barkodlu ürün gerekli).");

  const url = `${N11_API_BASE}/ms/product/stock-price/update`;
  const res = await fetch(url, {
    method: "POST",
    headers: n11Headers(),
    body: JSON.stringify({
      items: items.map(i => ({
        stockCode: i.barcode,
        quantity: i.quantity,
        salePrice: i.salePrice,
        listPrice: i.listPrice,
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
  return { sent: items.length };
}

/** Bağlantı testi: gerçek istek atıp N11'in döndürdüğü HTTP durumunu döner. */
export async function testN11Connection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isN11Configured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (App Key, App Secret)." };
  }
  const url = new URL(`${N11_API_BASE}/ms/order/orders`);
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

/** N11 siparişlerini çekip yeni olanları panoya ekler. */
export async function syncN11Orders() {
  if (!isN11Configured()) {
    throw new Error("N11 entegrasyonu yapılandırılmamış: N11_APP_KEY ve N11_APP_SECRET ortam değişkenlerini ayarlayın.");
  }

  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchOrdersPage(page);
    const orders = data.content ?? data.orders ?? data.data ?? [];
    if (orders.length === 0) break;

    for (const raw of orders) {
      const mapped = mapN11Order(raw);
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

    if (page >= (data.totalPages ?? 1) - 1) break;
  }

  return { imported, skipped };
}
