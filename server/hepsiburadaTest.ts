import { ENV } from "./_core/env";
import { HB_USER_AGENT, hbBasicAuth, isHbTestEnv, pushHepsiburadaStockPrice } from "./hepsiburada";

/**
 * Hepsiburada CANLIYA GEÇİŞ test akışı (SIT ortamı).
 *
 * HB canlı bilgileri vermeden önce test ortamında 3 kanıt ister:
 *  1) Katalog: ürün gönderimi → oluşan **trackingId** onlara iletilir.
 *  2) Listing: stok/fiyat gönderimi → dönen **upload id (inventoryUploadId)** iletilir.
 *  3) Sipariş: test siparişi oluştur → API'den listele → **paketle**.
 *
 * Bu modül Ayarlar'daki test panelinden çağrılır ve PANOYA/VERİTABANINA VERİ
 * YAZMAZ — ham API yanıtlarını aynen gösterir ki HB'nin istediği kimlikler
 * kopyalanıp ticket'a yapıştırılabilsin. SIT uç adresleri: canlı adreslerin
 * "-sit" ekli halleridir (developers.hepsiburada.com).
 */

function omsBase(): string {
  return (
    process.env.HEPSIBURADA_API_BASE_URL ??
    (isHbTestEnv() ? "https://oms-external-sit.hepsiburada.com" : "https://oms-external.hepsiburada.com")
  );
}

/** Test siparişi oluşturma stub'ı yalnızca SIT ortamında vardır. */
function omsStubBase(): string {
  return process.env.HEPSIBURADA_OMS_STUB_BASE_URL ?? "https://oms-stub-external-sit.hepsiburada.com";
}

function listingBase(): string {
  return (
    process.env.HEPSIBURADA_LISTING_API_BASE_URL ??
    (isHbTestEnv() ? "https://listing-external-sit.hepsiburada.com" : "https://listing-external.hepsiburada.com")
  );
}

function mpopBase(): string {
  return ENV.hepsiburadaMpopBaseUrl || (isHbTestEnv() ? "https://mpop-sit.hepsiburada.com" : "https://mpop.hepsiburada.com");
}

function basicAuth(secret?: string): string {
  // HB kuralı: Basic auth kullanıcı adı = Merchantid (GUID). hbBasicAuth ile ortak.
  return hbBasicAuth(secret ?? ENV.hepsiburadaPassword);
}

export type HbRawResult = { ok: boolean; status: number; body: string; json: unknown };

/** Ham HTTP sonucu — panelde aynen gösterilir (teşhis + HB'ye kanıt). */
async function hbFetch(url: string, init?: RequestInit): Promise<HbRawResult> {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* JSON değilse ham metin yeter */
  }
  return { ok: res.ok, status: res.status, body: text.slice(0, 3000), json };
}

function requireHbConfig() {
  if (!ENV.hepsiburadaMerchantId || !ENV.hepsiburadaUsername || !ENV.hepsiburadaPassword) {
    throw new Error(
      "Hepsiburada bilgileri eksik: HEPSIBURADA_MERCHANT_ID, HEPSIBURADA_USERNAME, HEPSIBURADA_PASSWORD (test bilgileri e-postayla gelince Render'a girilmeli).",
    );
  }
}

/** Panel üst bilgisi: hangi ortam, hangi uçlar, yapılandırma tam mı. */
export function hbTestInfo() {
  return {
    testEnv: isHbTestEnv(),
    configured: Boolean(ENV.hepsiburadaMerchantId && ENV.hepsiburadaUsername && ENV.hepsiburadaPassword),
    merchantId: ENV.hepsiburadaMerchantId ? `${ENV.hepsiburadaMerchantId.slice(0, 8)}…` : "(boş)",
    bases: { oms: omsBase(), stub: omsStubBase(), listing: listingBase(), mpop: mpopBase() },
  };
}

/* ------------------------- 1) Katalog (MPOP) ------------------------- */

/**
 * MPOP (katalog) çağrıları da **Basic auth** kullanır: kullanıcı adı = Merchantid
 * (GUID), şifre = Secretkey, ve User-Agent = Developer Username. HB'nin eski
 * `authenticate`/JWT (Bearer) akışı bu hesapta geçerli DEĞİL — gateway
 * "login.errors.authentication" döner; doğrudan Basic auth ile istek atılır.
 * (Doğrulama: GET /product/api/categories/get-all-categories → 200.)
 */
function mpopHeaders(extra?: Record<string, string>): Record<string, string> {
  requireHbConfig();
  return {
    Authorization: `Basic ${basicAuth()}`,
    "User-Agent": HB_USER_AGENT,
    Accept: "application/json",
    ...extra,
  };
}

export type HbTestProductInput = {
  categoryId: number;
  merchantSku: string;
  name: string;
  brand: string;
  price: number;
  stock?: number;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  guaranteeMonths?: number;
  kg?: string;
  vatRate?: string;
};

/**
 * Test ürünü gönderir (JSON dosyası, multipart) ve **trackingId** döner.
 * HB testte onay süreci işletmez; "teknik olarak hatasız gönderim" yeterli —
 * hata varsa durum sorgusu (aşağıda) satır satır gösterir, girdiyi düzeltip
 * yeniden gönderilir.
 */
export async function hbCatalogSendTestProduct(input: HbTestProductInput) {
  const attributes: Record<string, unknown> = {
    merchant_sku: input.merchantSku,
    VaryantGroupID: input.merchantSku,
    Barcode: input.barcode || input.merchantSku,
    UrunAdi: input.name,
    UrunAciklamasi: input.description || input.name,
    Marka: input.brand,
    GarantiSuresi: input.guaranteeMonths ?? 24,
    kg: input.kg ?? "1",
    tax_vat_rate: input.vatRate ?? "20",
    price: String(input.price),
    stock: String(input.stock ?? 10),
  };
  if (input.imageUrl) attributes.Image1 = input.imageUrl;
  const payload = [{ categoryId: input.categoryId, merchant: ENV.hepsiburadaMerchantId, attributes }];

  const fd = new FormData();
  fd.append("file", new Blob([JSON.stringify(payload)], { type: "application/json" }), "products.json");
  // Multipart: Content-Type'ı (boundary) FormData ayarlar; elle verme.
  const r = await hbFetch(`${mpopBase()}/product/api/products/import`, {
    method: "POST",
    headers: mpopHeaders(),
    body: fd,
  });
  const j = r.json as { data?: { trackingId?: string }; trackingId?: string } | null;
  const trackingId = j?.data?.trackingId ?? j?.trackingId ?? null;
  return { trackingId, sentPayload: payload, ...r };
}

/** Katalog gönderiminin durumunu trackingId ile sorgular (hata satırlarını gösterir). */
export async function hbCatalogStatus(trackingId: string) {
  const headers = mpopHeaders();
  // Import akışının durumu genelde product/api/products/status ucundadır; bazı
  // kurulumlarda ticket-api yolu kullanılır. Önce ticket-api denenir; bulunamazsa
  // (HTTP 404 YA DA success:false / "not found" — ör. code 4007) ürün-status'a düşülür.
  let r = await hbFetch(`${mpopBase()}/ticket-api/api/integrator/status/${encodeURIComponent(trackingId)}`, { headers });
  const notFound = r.status === 404 || (r.json != null && (r.json as { success?: boolean }).success === false);
  if (notFound) {
    r = await hbFetch(`${mpopBase()}/product/api/products/status/${encodeURIComponent(trackingId)}`, { headers });
  }
  return r;
}

/* ------------------------- 2) Listing (stok/fiyat) ------------------------- */

type HbListingRow = { merchantSku: string; hbSku: string | null; price: number | null; stock: number | null };

/**
 * HB'nin SIT hesabına önceden yüklediği envanteri listeler — HB, stok/fiyat
 * testinin BU ürünlerle yapılmasını ister ("envanter kısmındaki ürünler").
 */
export async function hbListListings(limit = 50) {
  requireHbConfig();
  const url = `${listingBase()}/listings/merchantid/${ENV.hepsiburadaMerchantId}?offset=0&limit=${limit}`;
  const r = await hbFetch(url, {
    headers: {
      Authorization: `Basic ${basicAuth(ENV.hepsiburadaServiceKey || undefined)}`,
      "User-Agent": HB_USER_AGENT,
      Accept: "application/json",
    },
  });
  // Yanıt biçimi hesaba göre değişebiliyor; dizi nerede ise onu bul (savunmacı).
  const j = r.json as Record<string, unknown> | unknown[] | null;
  const arr: unknown[] = Array.isArray(j)
    ? j
    : ((j?.["listings"] ?? j?.["data"] ?? j?.["items"] ?? []) as unknown[]);
  const items: HbListingRow[] = (Array.isArray(arr) ? arr : []).map(raw => {
    const it = raw as Record<string, unknown>;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      merchantSku: String(it.merchantSku ?? it.merchantsku ?? it.sku ?? ""),
      hbSku: (it.hepsiburadaSku ?? it.hbSku ?? it.hbsku ?? null) as string | null,
      price: num(it.price),
      stock: num(it.availableStock ?? it.stock),
    };
  });
  return { items, ...r };
}

/**
 * Seçilen envanter ürününe stok+fiyat gönderir; dönen **upload id**'ler
 * (price/stock) HB'ye iletilecek kanıttır.
 */
export async function hbListingTestPush(input: { merchantSku: string; price: number; stock: number }) {
  const res = await pushHepsiburadaStockPrice([
    { merchantSku: input.merchantSku, price: input.price, availableStock: input.stock },
  ]);
  return {
    priceUploadId: res.priceUploadId,
    stockUploadId: res.stockUploadId,
    note: "Bu iki kimliği (inventoryUploadId) HB ticket'ına yapıştır.",
  };
}

/* ------------------------- 3) Sipariş & paketleme ------------------------- */

/**
 * SIT stub'ında test siparişi oluşturur (canlıda böyle bir uç yoktur).
 * Gövde HB dokümanındaki modele göredir; HB şema değiştirmişse yanıt panelde
 * aynen görünür ve "ham gövde" alanıyla birebir doküman örneği gönderilebilir.
 */
export async function hbCreateTestOrder(input: {
  hbSku: string;
  merchantSku?: string;
  quantity?: number;
  price?: number;
  rawBody?: string;
}) {
  requireHbConfig();
  // HB kuralı: test sipariş numarası 10 haneli olmalı.
  const orderNumber = String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999));
  const body =
    input.rawBody?.trim() ||
    JSON.stringify({
      OrderNumber: orderNumber,
      LineItems: [
        {
          MerchantId: ENV.hepsiburadaMerchantId,
          HbSku: input.hbSku,
          MerchantSku: input.merchantSku ?? "",
          Quantity: input.quantity ?? 1,
          Price: input.price ?? 100,
        },
      ],
    });
  const r = await hbFetch(`${omsStubBase()}/orders/merchantId/${ENV.hepsiburadaMerchantId}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "User-Agent": HB_USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });
  return { orderNumber: input.rawBody ? null : orderNumber, sentBody: body.slice(0, 1500), ...r };
}

type HbOrderLine = { id: string; sku: string; quantity: number; name: string };
type HbPaidOrder = { orderNumber: string; lineItems: HbOrderLine[] };

/** Ödemesi tamamlanmış siparişleri HAM olarak listeler (panoya yazmaz). */
export async function hbListPaidOrdersRaw(limit = 50) {
  requireHbConfig();
  const url = `${omsBase()}/orders/merchantid/${ENV.hepsiburadaMerchantId}?offset=0&limit=${limit}`;
  const r = await hbFetch(url, {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "User-Agent": HB_USER_AGENT,
      Accept: "application/json",
    },
  });
  const j = r.json as Record<string, unknown> | unknown[] | null;
  const rows: unknown[] = Array.isArray(j)
    ? j
    : ((j?.["items"] ?? j?.["orders"] ?? j?.["content"] ?? []) as unknown[]);

  // İki olası biçim: satır = sipariş (içinde items[]) YA DA satır = tek kalem.
  const byOrder = new Map<string, HbPaidOrder>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = raw as Record<string, unknown>;
    const orderNumber = String(row.orderNumber ?? row.orderId ?? row.id ?? "");
    if (!orderNumber) continue;
    const nested = (row.items ?? row.details ?? row.lineItems) as unknown[] | undefined;
    const lines: HbOrderLine[] = [];
    if (Array.isArray(nested) && nested.length > 0) {
      for (const l of nested) {
        const li = l as Record<string, unknown>;
        lines.push({
          id: String(li.id ?? li.lineItemId ?? ""),
          sku: String(li.merchantSku ?? li.sku ?? li.hbSku ?? ""),
          quantity: Number(li.quantity ?? 1) || 1,
          name: String(li.productName ?? li.name ?? ""),
        });
      }
    } else if (row.lineItemId || row.sku || row.merchantSku) {
      // Düz kalem satırı biçimi (paid orders bazı hesaplarda kalem bazlı döner).
      lines.push({
        id: String(row.lineItemId ?? row.id ?? ""),
        sku: String(row.merchantSku ?? row.sku ?? ""),
        quantity: Number(row.quantity ?? 1) || 1,
        name: String(row.productName ?? row.name ?? ""),
      });
    }
    const existing = byOrder.get(orderNumber);
    if (existing) existing.lineItems.push(...lines);
    else byOrder.set(orderNumber, { orderNumber, lineItems: lines });
  }
  return { orders: Array.from(byOrder.values()), ...r };
}

/**
 * Bir test siparişinin TÜM kalemlerini paketler (HB test adımı 3'ün kanıtı:
 * dönen packageNumber). Kalem kimlikleri "ödemesi tamamlanmış siparişler"
 * listesinden otomatik bulunur.
 */
export async function hbPackageOrder(input: { orderNumber: string }) {
  requireHbConfig();
  const listed = await hbListPaidOrdersRaw(100);
  const target = listed.orders.find(o => o.orderNumber === input.orderNumber);
  if (!target || target.lineItems.length === 0 || target.lineItems.every(l => !l.id)) {
    throw new Error(
      `Sipariş ${input.orderNumber} için paketlenecek kalem bulunamadı — önce "Siparişleri Getir" ile listenin geldiğini doğrula.`,
    );
  }
  const body = {
    lineItemRequests: target.lineItems.filter(l => l.id).map(l => ({ id: l.id, quantity: l.quantity })),
  };
  const r = await hbFetch(`${omsBase()}/packages/merchantid/${ENV.hepsiburadaMerchantId}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "User-Agent": HB_USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = r.json as { packageNumber?: string | number; data?: { packageNumber?: string | number } } | null;
  const packageNumber = j?.packageNumber ?? j?.data?.packageNumber ?? null;
  return { packageNumber: packageNumber != null ? String(packageNumber) : null, sentBody: body, ...r };
}
