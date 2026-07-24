import { ENV } from "./_core/env";
import * as db from "./db";
import { zplToPdf } from "./labelary";
import { classifyMarketplaceStatus, itemsTotal, shouldSyncOrderStatus, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";

/**
 * Hepsiburada OMS (Sipariş Yönetim Sistemi) entegrasyonu.
 * Siparişleri çekip yerel sipariş panosuna aktarır.
 * Belgeler: https://developers.hepsiburada.com (Order/OMS API)
 *
 * Kimlik doğrulama: Basic auth (kullanıcı adı : şifre), User-Agent = merchantId.
 * Gerçek API alanları satıcıya göre küçük farklar gösterebildiği için
 * yanıt ayrıştırma savunmacı yazılmıştır (birden çok alan adı denenir).
 */

// HEPSIBURADA_ENV=sit → tüm uçlar test (SIT) ortamına döner; canlıya geçişte
// değişken silinir/prod yapılır. Açık *_BASE_URL değişkenleri her zaman kazanır.
const HB_SIT = (process.env.HEPSIBURADA_ENV ?? "").toLowerCase() === "sit";
const HB_API_BASE =
  process.env.HEPSIBURADA_API_BASE_URL ??
  (HB_SIT ? "https://oms-external-sit.hepsiburada.com" : "https://oms-external.hepsiburada.com");
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Hepsiburada test (SIT) ortamında mıyız? Test modunda oto-senkron devre dışıdır. */
export function isHbTestEnv(): boolean {
  return HB_SIT;
}

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

/**
 * Hepsiburada durumu → pano sütunu. `null` içe aktarılmaz. Bu liste bilinen
 * kodları kesinleştirir; listede olmayan/yeni bir kod gelirse
 * classifyMarketplaceStatus anahtar kelimeyle sınıflandırır (ör. kargo → hazır).
 */
const STATUS_MAP: Record<string, "new" | "production" | "ready" | "done" | null> = {
  Open: "new",
  New: "new",
  Picking: "new",
  Packaging: "new",
  ReadyToShip: "ready",
  Packaged: "ready",
  Shipped: "ready",
  InTransit: "ready",
  CargoInProgress: "ready",
  Delivered: "done",
  Completed: "done",
  Cancelled: null,
  Canceled: null,
  CancelledByCustomer: null,
  CancelledByMerchant: null,
  CancelledBySap: null,
  Returned: null,
  Claim: null,
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
  paymentStatus: "paid";
  items: OrderItemLike[];
};

/** Bir Hepsiburada siparişini yerel kayda çevirir; içe aktarılmayacaksa null. */
export function mapHbOrder(raw: HbOrderRaw): MappedOrder | null {
  const rawStatus = raw.status ?? "New";
  const status = classifyMarketplaceStatus(rawStatus, STATUS_MAP);
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
    // Pazaryeri ödemeyi tahsil eder; bu siparişler alacak sayılmaz (Trendyol ile aynı kural).
    paymentStatus: "paid",
    items,
  };
}

/**
 * Hepsiburada Basic auth başlığı. HB kuralı (onboarding e-postası):
 *   Username = **Merchantid (GUID)**, Password = **Secretkey**.
 * (Sık yapılan hata: kullanıcı adı alanına developer username yazmak → 401.)
 */
export function hbBasicAuth(secret: string): string {
  return Buffer.from(`${ENV.hepsiburadaMerchantId}:${secret}`).toString("base64");
}

/**
 * User-Agent = **Developer Username** (HEPSIBURADA_USERNAME). HB isteği bu
 * başlıkla eşler; tanımlı değilse geriye dönük uyum için merchantId'e düşer.
 */
export function hbUserAgent(): string {
  return ENV.hepsiburadaUsername || ENV.hepsiburadaMerchantId;
}

// Canlıda satıcıya gelen siparişler **paket** (fulfillment birimi) olarak
// /packages/merchantid ucunda döner; /orders ucu boş gelir. Paket kalemi
// productName/productBarcode/orderNumber gibi zengin alanlar taşır.
type HbPackageItemRaw = {
  productName?: string;
  merchantSku?: string;
  productBarcode?: string;
  hbSku?: string;
  quantity?: number;
  price?: { amount?: number } | number;
  totalPrice?: { amount?: number } | number;
  orderNumber?: string;
};
type HbPackageRaw = {
  packageNumber?: string;
  id?: string;
  status?: string;
  customerName?: string;
  recipientName?: string;
  totalPrice?: { amount?: number } | number;
  items?: HbPackageItemRaw[];
};

/** HB paketini mevcut (test edilmiş) mapHbOrder şekline çevirir. */
function packageToOrderRaw(pkg: HbPackageRaw): HbOrderRaw {
  return {
    orderNumber: pkg.packageNumber ?? pkg.id ?? pkg.items?.[0]?.orderNumber,
    status: pkg.status,
    customerName: pkg.customerName ?? pkg.recipientName,
    totalPrice: pkg.totalPrice,
    items: (pkg.items ?? []).map(i => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.price,
      totalPrice: i.totalPrice,
      // Katalog eşlemesi için barkod: productBarcode > merchantSku.
      merchantSku: i.productBarcode ?? i.merchantSku,
    })),
  };
}

/** HB paketini panoya uygun MappedOrder'a çevirir (iptal/iade ise null). */
export function mapHbPackage(pkg: HbPackageRaw): MappedOrder | null {
  return mapHbOrder(packageToOrderRaw(pkg));
}

/**
 * HB paketlerini sayfalı çeker (gerçek sipariş birimi). Yanıt düz dizi olabilir.
 * `kind`:
 *  - "open"    → /packages ucu: kargoya verilmemiş (işlem bekleyen) paketler.
 *  - "shipped" → /packages/.../shipped ucu: kargoya VERİLEN paketler. Kargolanan
 *    paket "open" listesinden DÜŞTÜĞÜ için, /shipped çekilmezse kargolanan sipariş
 *    panoda "Yeni"de takılıp kalır (bilinen HB davranışı).
 */
async function fetchPackagesPage(offset: number, kind: "open" | "shipped" = "open"): Promise<HbPackageRaw[]> {
  const suffix = kind === "shipped" ? "/shipped" : "";
  const url = new URL(`${HB_API_BASE}/packages/merchantid/${ENV.hepsiburadaMerchantId}${suffix}`);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_SIZE));

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${hbBasicAuth(ENV.hepsiburadaPassword)}`,
      "User-Agent": hbUserAgent(),
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
  const data = (await res.json()) as HbPackageRaw[] | { items?: HbPackageRaw[] };
  return Array.isArray(data) ? data : (data.items ?? []);
}

export function isHepsiburadaConfigured(): boolean {
  return Boolean(ENV.hepsiburadaMerchantId && ENV.hepsiburadaUsername && ENV.hepsiburadaPassword);
}

/** Verilen OMS tabanına gerçek istek atıp ham HTTP sonucunu döner. */
async function probeHbOms(base: string): Promise<{ ok: boolean; status: number; body: string }> {
  const url = new URL(`${base}/orders/merchantid/${ENV.hepsiburadaMerchantId}`);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${hbBasicAuth(ENV.hepsiburadaPassword)}`,
      "User-Agent": hbUserAgent(),
      Accept: "application/json",
    },
  });
  const body = (await res.text()).slice(0, 300);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Bağlantı testi: gerçek bir istek atıp Hepsiburada'nın döndürdüğü HTTP
 * durumunu döner. 401/403 alınırsa aynı kimlik bilgileri DİĞER ortama (test↔canlı)
 * karşı da denenir — bilgiler orada geçerliyse "yanlış ortam" olduğu net söylenir
 * (en sık 401 sebebi: test/SIT hesabıyla canlı uca bağlanmak). Canlıda çalıştırılır.
 */
export async function testHepsiburadaConnection(): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isHepsiburadaConfigured()) {
    return { ok: false, status: 0, body: "Ayarlar eksik (Merchant ID, kullanıcı adı, şifre)." };
  }
  // Açık *_BASE_URL verilmişse ortam otomatik seçilmediği için çapraz deneme yapılmaz.
  const explicitBase = Boolean(process.env.HEPSIBURADA_API_BASE_URL);
  try {
    const primary = await probeHbOms(HB_API_BASE);
    if (primary.ok || explicitBase || (primary.status !== 401 && primary.status !== 403)) {
      return primary;
    }
    // 401/403: kimlik bilgileri belki diğer ortama ait — çapraz kontrol.
    const otherBase = HB_SIT
      ? "https://oms-external.hepsiburada.com"
      : "https://oms-external-sit.hepsiburada.com";
    let cross: { ok: boolean; status: number; body: string } | null = null;
    try {
      cross = await probeHbOms(otherBase);
    } catch {
      cross = null;
    }
    if (cross?.ok) {
      const fix = HB_SIT
        ? "Bu bilgiler CANLI ortamda geçerli — Render'da HEPSIBURADA_ENV değişkenini SİLİN (şu an 'sit' = test ortamına bağlısınız)."
        : "Bu bilgiler TEST (SIT) ortamında geçerli — Render → Environment'a HEPSIBURADA_ENV=sit ekleyin (test hesabı canlı uca bağlanamaz, 401 verir).";
      return { ok: false, status: primary.status, body: `${HB_SIT ? "SIT" : "Canlı"} ortamı reddetti (${primary.status}). ${fix}` };
    }
    // Her iki ortam da reddetti → gerçekten kimlik bilgisi hatası.
    return {
      ok: false,
      status: primary.status,
      body: `${primary.status} — Merchant ID / kullanıcı adı (Merchantid) / şifre (Secretkey) HB'nin verdiği Basic auth bilgileriyle birebir aynı olmalı. Username = Merchantid, Password = Secretkey.`,
    };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : "Bağlantı hatası" };
  }
}

/* ------------------------- Stok & fiyat gönderme (Listing API) ------------------------- */

const HB_LISTING_API_BASE =
  process.env.HEPSIBURADA_LISTING_API_BASE_URL ??
  (HB_SIT ? "https://listing-external-sit.hepsiburada.com" : "https://listing-external.hepsiburada.com");

export type HbStockPriceItem = {
  /** Satıcı SKU'su — bizde ürün barkodu bu alana yazılır (listelemedeki merchantSku ile aynı olmalı). */
  merchantSku: string;
  price: number;
  availableStock: number;
};

function hbListingAuth(): string {
  // Listing API'si "Servis Anahtarı" ile çalışır; tanımlı değilse OMS şifresi denenir.
  // Kullanıcı adı yine Merchantid (GUID) — hbBasicAuth ile aynı kural.
  const secret = ENV.hepsiburadaServiceKey || ENV.hepsiburadaPassword;
  return hbBasicAuth(secret);
}

async function hbListingPost(path: string, payload: unknown): Promise<string | null> {
  const res = await fetch(`${HB_LISTING_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${hbListingAuth()}`,
      "User-Agent": hbUserAgent(),
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
  // Aynı sipariş sayfalar arasında (ve iki uç arasında) tekrar gelebilir; bir kez işle.
  const seen = new Set<string>();

  /**
   * Bir paketi panoya işler: yeni ise ekler, varsa durumu YALNIZ ileri akıtır.
   * `shipped=true` → paket /shipped ucundan geldi (kesin kargolandı): HB paket
   * statüsü eksik/geç gelse bile durum en az "Kargoya Hazır" sayılır, sipariş
   * "Yeni"de takılmaz.
   */
  async function processPackage(pkg: HbPackageRaw, shipped: boolean) {
    const mapped = mapHbPackage(pkg);
    if (!mapped) {
      // İptal/iade: içe alınmış sipariş varsa iptal et (stok iadesi otomatik).
      const rawNo = pkg.packageNumber ?? pkg.id ?? pkg.items?.[0]?.orderNumber;
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
      return;
    }

    // Kargoya verilen paket en az "Kargoya Hazır"dır (Delivered ise done kalır).
    if (shipped && (mapped.status === "new" || mapped.status === "production")) {
      mapped.status = "ready";
    }

    if (seen.has(mapped.orderNo)) {
      skipped++;
      return;
    }
    seen.add(mapped.orderNo);

    const existing = await db.getOrderByOrderNo(mapped.orderNo);
    if (existing) {
      // Hepsiburada siparişin kaynağıdır: durum (Shipped→Hazır, Delivered→
      // Tamamlandı) senkronda otomatik akıtılır; ama yalnızca İLERİ —
      // elle "Üretimde"ye alınan sipariş geri "Yeni"ye basılmaz.
      if (shouldSyncOrderStatus(existing.status, mapped.status)) {
        await db.updateOrder(existing.id, { status: mapped.status } as never);
        updated++;
      } else {
        skipped++;
      }
      return;
    }

    const { items, ...order } = mapped;
    const insertId = await db.createOrder(order as never);
    if (items.length > 0) {
      await db.replaceOrderItems(Number(insertId), toItemRows(items));
    }
    imported++;
  }

  // 1) İşlem bekleyen paketler (fulfillment kuyruğu).
  for (let page = 0; page < MAX_PAGES; page++) {
    const packages = await fetchPackagesPage(page * PAGE_SIZE, "open");
    if (packages.length === 0) break;
    for (const pkg of packages) await processPackage(pkg, false);
    if (packages.length < PAGE_SIZE) break;
  }

  // 2) Kargoya verilen paketler → sipariş "Kargoya Hazır"a taşınır. Bu uç
  //    çekilmezse kargolanan sipariş "open" listesinden düştüğü için panoda
  //    "Yeni"de kalırdı. /shipped bazı hesaplarda kapalıysa ana senkronu bozmaz.
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const packages = await fetchPackagesPage(page * PAGE_SIZE, "shipped");
      if (packages.length === 0) break;
      for (const pkg of packages) await processPackage(pkg, true);
      if (packages.length < PAGE_SIZE) break;
    }
  } catch (err) {
    console.warn("Hepsiburada /shipped senkronu atlandı:", err instanceof Error ? err.message : err);
  }

  return { imported, updated, skipped };
}

/* ------------------------- Resmi kargo etiketi ------------------------- */

/**
 * Hepsiburada resmi kargo etiketinin **ZPL**'ini çeker. HB etiketi
 * `GET /packages/merchantid/{id}/packagenumber/{no}/labels` ucundan
 * `{format:"base64zpl", data:[<base64 ZPL>]}` olarak gelir; base64 çözülüp
 * ZPL birleştirilir. (Toplu etikette bu ZPL'ler birleştirilip tek PDF olur.)
 */
export async function getHepsiburadaLabelZpl(packageNumber: string): Promise<string> {
  if (!isHepsiburadaConfigured()) {
    throw new Error("Hepsiburada entegrasyonu yapılandırılmamış.");
  }
  if (!packageNumber) throw new Error("Paket numarası yok — sipariş kargoya verildikten sonra tekrar deneyin.");

  const res = await fetch(
    `${HB_API_BASE}/packages/merchantid/${ENV.hepsiburadaMerchantId}/packagenumber/${encodeURIComponent(packageNumber)}/labels`,
    {
      headers: {
        Authorization: `Basic ${hbBasicAuth(ENV.hepsiburadaPassword)}`,
        "User-Agent": hbUserAgent(),
        Accept: "application/json",
      },
    },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error("Hepsiburada API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Hepsiburada etiketi alınamadı (${res.status}): ${body}`);
  }
  const payload = (await res.json()) as { format?: string; data?: string[] };
  const entries = payload.data ?? [];
  if (entries.length === 0) {
    throw new Error("Hepsiburada etiket içeriği boş döndü (paket henüz kargoya hazır olmayabilir).");
  }
  // format "base64zpl" → her parça base64 çözülüp ZPL olarak birleştirilir.
  const isB64 = (payload.format ?? "").toLowerCase().includes("base64");
  return entries.map(e => (isB64 ? Buffer.from(e, "base64").toString("utf8") : e)).join("");
}

/** Hepsiburada resmi kargo etiketini PDF olarak döner (ZPL → Labelary). */
export async function getHepsiburadaLabelPdf(packageNumber: string): Promise<Buffer> {
  return zplToPdf(await getHepsiburadaLabelZpl(packageNumber));
}

/* ------------------------- Satıcıya Sor (Soru-Cevap) ------------------------- */

// "Satıcıya Sor" (Ask-to-Seller) API tabanı. Canlıda "-sit" düşer.
const HB_ASKTOSELLER_BASE =
  process.env.HEPSIBURADA_ASKTOSELLER_BASE_URL ??
  (HB_SIT
    ? "https://api-asktoseller-merchant-sit.hepsiburada.com"
    : "https://api-asktoseller-merchant.hepsiburada.com");

/**
 * Soru-Cevap API başlıkları. Auth yine Basic (Merchantid:Secretkey) + User-Agent,
 * ANCAK bu servis merchantId'yi URL'de değil **MerchantId başlığında** ister
 * (başlık yoksa 401 döner).
 */
function hbAskHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Basic ${hbBasicAuth(ENV.hepsiburadaPassword)}`,
    "User-Agent": hbUserAgent(),
    MerchantId: ENV.hepsiburadaMerchantId,
    Accept: "application/json",
    ...extra,
  };
}

/** marketplaceQuestions'ın beklediği ortak soru şekli (source = hepsiburada). */
export type MappedHbQuestion = {
  source: "hepsiburada";
  externalId: string;
  customerName: string | null;
  questionText: string;
  productName: string | null;
};

type HbIssueRaw = {
  issueNumber?: number | string;
  lastContent?: string;
  customerId?: string;
  status?: string;
  product?: { name?: string; sku?: string; stockCode?: string };
};

type HbIssueListResponse = { data?: HbIssueRaw[]; totalPageCount?: number; currentPage?: number };

/**
 * Cevap bekleyen (status=1 / WaitingForAnswer) Hepsiburada müşteri sorularını çeker.
 * Sayfa 1'den başlar; `lastContent` cevaplanmamış soruda müşterinin sorusudur.
 */
export async function fetchHepsiburadaQuestions(): Promise<MappedHbQuestion[]> {
  if (!isHepsiburadaConfigured()) {
    throw new Error("Hepsiburada entegrasyonu yapılandırılmamış (Merchant ID, kullanıcı adı, Secretkey gerekli).");
  }
  const out: MappedHbQuestion[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${HB_ASKTOSELLER_BASE}/api/v1.0/issues`);
    url.searchParams.set("status", "1"); // WaitingForAnswer
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));
    url.searchParams.set("sortBy", "0"); // sorulma tarihi
    url.searchParams.set("desc", "false");

    const res = await fetch(url, { headers: hbAskHeaders() });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Hepsiburada Soru-Cevap API yetki hatası (Merchant ID / Secretkey ve MerchantId başlığını kontrol edin)."
      );
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`Hepsiburada soru listesi hatası (${res.status}): ${body}`);
    }
    const data = (await res.json()) as HbIssueListResponse;
    const items = data.data ?? [];
    if (items.length === 0) break;
    for (const q of items) {
      const externalId = q.issueNumber != null ? String(q.issueNumber) : null;
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      out.push({
        source: "hepsiburada",
        externalId,
        customerName: null, // API yalnız customerId (guid) verir, isim yok
        questionText: (q.lastContent ?? "").trim(),
        productName: q.product?.name ?? null,
      });
    }
    if (page >= (data.totalPageCount ?? 1)) break;
  }
  return out;
}

/**
 * Bir Hepsiburada sorusunu cevaplar (issue number ile). Metin + isteğe bağlı
 * dosya (bizde yalnız metin). 1 iş günü içinde cevaplanmayan sorular AutoClosed
 * olur ve HB reddeder — o durumda hata fırlatılır, kuyrukta taslak kalır.
 *
 * Gövde alanı **camelCase `answer`** olmalı: HB'nin diğer JSON uçları (Listing
 * price/stock) de camelCase kullanır. PascalCase `Answer` gönderilince alan
 * bağlanmaz ve "Answer: Bu alan geçersizdir" (422/4220) döner. Bazı hesaplarda
 * uç dosya eki için `multipart/form-data` beklediğinden 400/422'de form-data ile
 * yeniden denenir (kendi kendini onaran iki aşamalı gönderim).
 */
export async function answerHepsiburadaQuestion(issueNumber: string | number, text: string): Promise<void> {
  if (!isHepsiburadaConfigured()) {
    throw new Error("Hepsiburada entegrasyonu yapılandırılmamış.");
  }
  const body = text.trim().slice(0, 2000);
  if (!body) throw new Error("Boş Hepsiburada cevabı gönderilemez.");

  const url = `${HB_ASKTOSELLER_BASE}/api/v1.0/issues/${encodeURIComponent(String(issueNumber))}/answer`;

  // 1) camelCase JSON denemesi (HB'nin standart JSON biçimi).
  const jsonRes = await fetch(url, {
    method: "POST",
    headers: hbAskHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ answer: body }),
  });
  if (jsonRes.ok) return;
  if (jsonRes.status === 401 || jsonRes.status === 403) {
    throw new Error("Hepsiburada Soru-Cevap API yetki hatası.");
  }
  const jsonErr = (await jsonRes.text()).slice(0, 300);

  // 2) 400/422 (doğrulama) → uç muhtemelen multipart/form-data bekliyor; `answer`
  //    form alanı olarak yeniden dene. Content-Type verilmez ki fetch boundary'yi
  //    kendisi eklesin.
  if (jsonRes.status === 400 || jsonRes.status === 422) {
    const form = new FormData();
    form.append("answer", body);
    const formRes = await fetch(url, { method: "POST", headers: hbAskHeaders(), body: form });
    if (formRes.ok) return;
    if (formRes.status === 401 || formRes.status === 403) {
      throw new Error("Hepsiburada Soru-Cevap API yetki hatası.");
    }
    const formErr = (await formRes.text()).slice(0, 300);
    throw new Error(
      `Hepsiburada cevap gönderimi başarısız — JSON (${jsonRes.status}): ${jsonErr} · form-data (${formRes.status}): ${formErr}`,
    );
  }

  throw new Error(`Hepsiburada cevap gönderimi başarısız (${jsonRes.status}): ${jsonErr}`);
}
