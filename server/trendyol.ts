import { ENV } from "./_core/env";
import * as db from "./db";
import { itemsTotal, resolveProductIdForItem, summarizeItems, toItemRows, type OrderItemLike } from "./orderUtils";
import { mergeQuestion, type MappedQuestion, type RemoteQuestionStatus } from "./questionUtils";

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
  /** Ürün barkodu — yerel katalogla kalem eşleşmesi için. */
  barcode?: string | null;
};

export type TrendyolPackage = {
  id: number;
  orderNumber: string;
  orderDate?: number;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  status: string;
  totalPrice?: number;
  /** Kargo takip numarası (paket kargoya verilince dolar) — resmi etiket için gerekir. */
  cargoTrackingNumber?: number | string | null;
  cargoProviderName?: string | null;
  cargoTrackingLink?: string | null;
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
  paymentStatus: "paid";
  cargoTrackingNumber: string | null;
  cargoProviderName: string | null;
  cargoTrackingLink: string | null;
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
    barcode: line.barcode ?? null,
  }));

  const customerName =
    [pkg.customerFirstName, pkg.customerLastName].filter(Boolean).join(" ").trim() ||
    "Trendyol Müşterisi";

  const cargoTrackingNumber =
    pkg.cargoTrackingNumber != null && pkg.cargoTrackingNumber !== ""
      ? String(pkg.cargoTrackingNumber)
      : null;

  return {
    orderNo: `TY-${pkg.orderNumber}`,
    customerName,
    channel: "trendyol",
    status,
    totalAmount: String(pkg.totalPrice ?? itemsTotal(items)),
    itemsSummary: summarizeItems(items),
    notes: null,
    // Pazaryeri ödemeyi tahsil eder; bu siparişler alacak sayılmaz.
    paymentStatus: "paid",
    cargoTrackingNumber,
    cargoProviderName: pkg.cargoProviderName ?? null,
    cargoTrackingLink: pkg.cargoTrackingLink ?? null,
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

// ZPL etiketini PDF'e çeviren servis (Labelary). 8dpmm ≈ 203dpi, 10×15 cm ≈ 4×6 inç.
const LABELARY_URL =
  process.env.LABELARY_URL ?? "https://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/";

const trendyolHeaders = () => ({
  Authorization: `Basic ${Buffer.from(`${ENV.trendyolApiKey}:${ENV.trendyolApiSecret}`).toString("base64")}`,
  "User-Agent": `${ENV.trendyolSellerId} - SelfIntegration`,
});

/**
 * Trendyol "ortak etiket" (common label) barkodunu üretip ZPL'i alır,
 * ardından Labelary ile PDF'e çevirip döner.
 *
 * Akış: POST create-common-label (ZPL üret) → GET get-common-label (ZPL oku)
 * → Labelary (ZPL→PDF). Yalnızca ortak etiket anlaşmalı kargolarda ve
 * kargoya verilmiş (takip no'lu) paketlerde çalışır. Belgeler:
 * developers.trendyol.com → Delivery Integration → Common Label.
 */
export async function getTrendyolCommonLabelPdf(cargoTrackingNumber: string): Promise<Buffer> {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış (Satıcı ID, API Key, API Secret gerekli).");
  }
  if (!cargoTrackingNumber) {
    throw new Error("Kargo takip numarası yok — sipariş henüz kargoya verilmemiş olabilir.");
  }

  const base = `${TRENDYOL_API_BASE}/integration/sellers/${ENV.trendyolSellerId}/common-label/${encodeURIComponent(cargoTrackingNumber)}`;

  // 1) Etiketi oluştur (varsa Trendyol yeni oluşturmaz; hata dışı durumları geç).
  const createRes = await fetch(base, {
    method: "POST",
    headers: { ...trendyolHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ format: "ZPL" }),
  });
  if (createRes.status === 401 || createRes.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası).");
  }
  // 409/400 "zaten var" olabilir; okuma adımı asıl doğrulamayı yapar.

  // 2) Oluşan ZPL etiketini oku.
  const getRes = await fetch(base, { headers: { ...trendyolHeaders(), Accept: "application/json" } });
  if (!getRes.ok) {
    const body = (await getRes.text()).slice(0, 300);
    throw new Error(`Trendyol etiketi alınamadı (${getRes.status}): ${body}`);
  }
  const raw = await getRes.text();
  const zpl = extractZpl(raw);
  if (!zpl) {
    throw new Error("Trendyol etiket içeriği (ZPL) boş döndü. Kargo sağlayıcısı ortak etiketi desteklemiyor olabilir.");
  }

  // 3) ZPL → PDF (Labelary).
  const pdfRes = await fetch(LABELARY_URL, {
    method: "POST",
    headers: { Accept: "application/pdf", "Content-Type": "application/x-www-form-urlencoded" },
    body: zpl,
  });
  if (!pdfRes.ok) {
    const body = (await pdfRes.text()).slice(0, 200);
    throw new Error(`Etiket PDF'e çevrilemedi (${pdfRes.status}): ${body}`);
  }
  return Buffer.from(await pdfRes.arrayBuffer());
}

/** Trendyol get-common-label yanıtından ZPL metnini çıkarır (ham ZPL ya da JSON sarmalı). */
export function extractZpl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Önce JSON sarmalını dene (içinde "^XA" geçse bile ham metin değil, alanı çıkar).
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      const candidate = Array.isArray(data) ? data[0] : data;
      const value =
        candidate?.zpl ?? candidate?.label ?? candidate?.content ?? candidate?.barcode ?? null;
      return typeof value === "string" && value.trim() ? value : null;
    } catch {
      return null;
    }
  }
  return trimmed; // ham ZPL (^XA...) ya da bilinmeyen ama boş değil — ZPL varsay
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
  let updated = 0;
  // Aynı sipariş sayfalar arasında tekrar gelebilir; tek çekimde bir kez ekle.
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPackagesPage(page, startDate, endDate);
    const packages = data.content ?? [];

    for (const pkg of packages) {
      const mapped = mapPackageToOrder(pkg);
      if (!mapped) {
        // İptal/iade: yeni içe aktarılmaz; ama daha önce içe alınmış sipariş
        // varsa iptal edilir (mamul stok iadesi updateOrder'da otomatik).
        const cancelledNo = `TY-${pkg.orderNumber}`;
        if (!seen.has(cancelledNo)) {
          seen.add(cancelledNo);
          const existing = await db.getOrderByOrderNo(cancelledNo);
          if (existing && existing.status !== "cancelled") {
            await db.updateOrder(existing.id, { status: "cancelled" });
            updated++;
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
        // Sipariş zaten var; ama Trendyol siparişi kaynağın kendisidir: durumu
        // (Shipped→Hazır, Delivered→Tamamlandı) ve kargoya verilince dolan takip
        // no/kargo bilgisi burada otomatik akıtılır. Kullanıcı elle taşımaz.
        const patch: Record<string, unknown> = {};
        if (mapped.status !== existing.status) patch.status = mapped.status;
        if (mapped.cargoTrackingNumber && mapped.cargoTrackingNumber !== existing.cargoTrackingNumber)
          patch.cargoTrackingNumber = mapped.cargoTrackingNumber;
        if (mapped.cargoProviderName && mapped.cargoProviderName !== existing.cargoProviderName)
          patch.cargoProviderName = mapped.cargoProviderName;
        if (mapped.cargoTrackingLink && mapped.cargoTrackingLink !== existing.cargoTrackingLink)
          patch.cargoTrackingLink = mapped.cargoTrackingLink;
        if (Object.keys(patch).length > 0) {
          await db.updateOrder(existing.id, patch as never);
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

  return { imported, skipped, updated };
}

/* ------------------------- Soru & Cevap (Q&A) ------------------------- */

/**
 * Trendyol müşteri soruları API'si.
 * Belgeler: developers.trendyol.com → Soru & Cevap Entegrasyonu
 * (GET questions/filter, POST questions/{id}/answers).
 */

export type TrendyolQuestion = {
  id: number;
  text: string;
  status: string;
  creationDate?: number;
  /** Soruyu soran müşterinin görünen adı (gizliyse boş gelebilir). */
  userName?: string | null;
  customerName?: string | null;
  productName?: string | null;
  /** Sorunun sorulduğu listelemenin barkodu — katalog eşleşmesi için. */
  barcode?: string | null;
  answer?: { text?: string | null; creationDate?: number } | null;
};

type TrendyolQuestionsResponse = {
  page: number;
  size: number;
  totalPages?: number;
  totalElements?: number;
  content?: TrendyolQuestion[];
};

/** Trendyol soru durumu → yerel durum. Bilinmeyen durumlar açık sayılır (görünür kalsın). */
const QUESTION_STATUS_MAP: Record<string, RemoteQuestionStatus> = {
  WAITING_FOR_ANSWER: "open",
  // Cevap gönderildi, Trendyol onayı bekliyor — kuyruktan düşür.
  WAITING_FOR_APPROVE: "answered",
  ANSWERED: "answered",
  // Soru satıcı tarafından raporlandı ya da cevap Trendyol tarafından reddedildi.
  REPORTED: "rejected",
  REJECTED: "rejected",
};

/** Bir Trendyol sorusunu yerel şemaya çevirir (saf fonksiyon). */
export function mapTrendyolQuestion(q: TrendyolQuestion): MappedQuestion {
  const remoteStatus = QUESTION_STATUS_MAP[q.status] ?? "open";
  const answerText = q.answer?.text?.trim() || null;
  return {
    marketplace: "trendyol",
    questionId: String(q.id),
    questionText: (q.text ?? "").trim(),
    customerName: q.userName?.trim() || q.customerName?.trim() || null,
    productName: q.productName?.trim() || null,
    productBarcode: q.barcode?.trim() || null,
    productId: null, // senkron katalogla eşleştirip doldurur
    askedAt: q.creationDate ? new Date(q.creationDate) : null,
    remoteStatus,
    remoteAnswer: answerText,
    remoteAnsweredAt: q.answer?.creationDate ? new Date(q.answer.creationDate) : null,
  };
}

// Q&A endpoint'i sayfa başına en fazla 50 kayıt kabul eder.
const QUESTION_PAGE_SIZE = 50;

async function fetchQuestionsPage(page: number, startDate: number, endDate: number) {
  const url = new URL(
    `${TRENDYOL_API_BASE}/integration/qna/sellers/${ENV.trendyolSellerId}/questions/filter`
  );
  url.searchParams.set("startDate", String(startDate));
  url.searchParams.set("endDate", String(endDate));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(QUESTION_PAGE_SIZE));
  url.searchParams.set("orderByField", "LastModifiedDate");
  url.searchParams.set("orderByDirection", "DESC");

  const res = await fetch(url, {
    headers: { ...trendyolHeaders(), Accept: "application/json" },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Trendyol API bilgileri reddedildi (yetki hatası). API Key/Secret ve Satıcı ID'yi kontrol edin."
    );
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Trendyol soru API hatası (${res.status}): ${body}`);
  }
  return (await res.json()) as TrendyolQuestionsResponse;
}

/**
 * Son `daysBack` günün Trendyol müşteri sorularını çekip yerel kuyruğa işler.
 * (marketplace, questionId) benzersizdir: aynı soru ikinci senkronda mükerrer
 * YARATMAZ; değişen alanlar güncellenir, pazaryerinde cevaplanmışsa durum
 * answered'a çekilir (birleştirme kuralları: questionUtils.mergeQuestion).
 */
export async function syncTrendyolQuestions(daysBack = 14) {
  if (!isTrendyolConfigured()) {
    throw new Error(
      "Trendyol entegrasyonu yapılandırılmamış: TRENDYOL_SELLER_ID, TRENDYOL_API_KEY ve TRENDYOL_API_SECRET ortam değişkenlerini ayarlayın."
    );
  }

  const endDate = Date.now();
  const startDate = endDate - daysBack * 24 * 60 * 60 * 1000;

  const refs = await db.listProductRefs();
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  // Aynı soru sayfalar arasında tekrar gelebilir; tek çekimde bir kez işle.
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchQuestionsPage(page, startDate, endDate);
    const questions = data.content ?? [];

    for (const raw of questions) {
      const mapped = mapTrendyolQuestion(raw);
      if (!mapped.questionText) {
        skipped++;
        continue;
      }
      if (seen.has(mapped.questionId)) {
        skipped++;
        continue;
      }
      seen.add(mapped.questionId);

      // Barkod → ad sırasıyla katalog eşleşmesi (sipariş kalemleriyle aynı mantık).
      mapped.productId = resolveProductIdForItem(
        { productName: mapped.productName ?? "", barcode: mapped.productBarcode },
        refs,
      );

      const existing = await db.getMarketplaceQuestionByKey("trendyol", mapped.questionId);
      const merge = mergeQuestion(existing ?? null, mapped);
      if (merge.action === "insert") {
        await db.insertMarketplaceQuestion(merge.values);
        imported++;
      } else if (merge.action === "update") {
        await db.updateMarketplaceQuestion(existing!.id, merge.patch);
        updated++;
      } else {
        skipped++;
      }
    }

    if (page >= (data.totalPages ?? 1) - 1) break;
  }

  return { imported, updated, skipped };
}

/**
 * Trendyol sorusuna cevap gönderir (POST answers). Trendyol cevap metnini
 * 10–2000 karakter arası ister; sınır dışıysa istek atılmadan hata verilir.
 */
export async function answerTrendyolQuestion(questionId: string, text: string) {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış (Satıcı ID, API Key, API Secret gerekli).");
  }
  const trimmed = text.trim();
  if (trimmed.length < 10) {
    throw new Error("Trendyol cevabı en az 10 karakter olmalı.");
  }
  if (trimmed.length > 2000) {
    throw new Error("Trendyol cevabı en fazla 2000 karakter olabilir.");
  }

  const url = `${TRENDYOL_API_BASE}/integration/qna/sellers/${ENV.trendyolSellerId}/questions/${encodeURIComponent(questionId)}/answers`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...trendyolHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: trimmed }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası). API Key/Secret ve Satıcı ID'yi kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Trendyol cevap gönderimi başarısız (${res.status}): ${body}`);
  }
  return { ok: true as const, answer: trimmed };
}
