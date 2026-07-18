import type { Product } from "../drizzle/schema";
import { ENV } from "./_core/env";

/**
 * Trendyol'da SIFIRDAN ürün kartı açma (Faz C).
 *
 * Aynı ana ürünün türevleri ortak productMainId ile gönderilir; Trendyol bunları
 * TEK ilan + varyant seçici (renk/ambalaj) olarak birleştirir. Gönderim asenkron
 * çalışır: yanıt bir batchRequestId döner, sonuç batch sorgusuyla takip edilir.
 *
 * Geliştirme ortamı pazaryerine çıkamaz — bu modül yalnızca CANLIDA (Render)
 * doğrulanır. Belgeler: developers.trendyol.com → Product Integration.
 */

const TRENDYOL_API_BASE = process.env.TRENDYOL_API_BASE_URL ?? "https://apigw.trendyol.com";

const headers = () => ({
  Authorization: `Basic ${Buffer.from(`${ENV.trendyolApiKey}:${ENV.trendyolApiSecret}`).toString("base64")}`,
  "User-Agent": `${ENV.trendyolSellerId} - SelfIntegration`,
  "Content-Type": "application/json",
  Accept: "application/json",
});

async function trendyolGet(path: string) {
  const res = await fetch(`${TRENDYOL_API_BASE}${path}`, { headers: headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Trendyol isteği başarısız (${res.status}): ${body}`);
  }
  return res.json();
}

/* ------------------------- Ayarlar ------------------------- */

export type TrendyolCardSettings = {
  brandId: number;
  cargoCompanyId: number;
  /** Üründeki kategori adı → Trendyol categoryId eşlemesi. */
  categoryMap: Record<string, number>;
  /** Görsel linklerinin mutlak tabanı (örn. https://artofcolour-kokpit.onrender.com). */
  publicBaseUrl: string;
  /** categoryId → zorunlu özellik varsayılanları. */
  attributeDefaults: Record<
    string,
    Array<{ attributeId: number; attributeValueId?: number; customAttributeValue?: string }>
  >;
};

/**
 * settings anahtar-değer deposundan ürün açma ayarlarını okur.
 * Eksikler kullanıcıya alan adıyla raporlanır (Ayarlar → Trendyol Ürün Açma).
 */
export function parseCardSettings(
  raw: Record<string, string>,
): { ok: true; value: TrendyolCardSettings } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const brandId = parseInt(raw.trendyolBrandId ?? "", 10);
  if (!brandId) missing.push("trendyolBrandId (Trendyol marka ID)");
  const cargoCompanyId = parseInt(raw.trendyolCargoCompanyId ?? "", 10);
  if (!cargoCompanyId) missing.push("trendyolCargoCompanyId (anlaşmalı kargo ID)");

  let categoryMap: Record<string, number> = {};
  try {
    categoryMap = raw.trendyolCategoryMap ? JSON.parse(raw.trendyolCategoryMap) : {};
  } catch {
    missing.push('trendyolCategoryMap (geçersiz JSON — örn. {"Boya": 1234})');
  }
  if (Object.keys(categoryMap).length === 0 && !missing.some(m => m.startsWith("trendyolCategoryMap"))) {
    missing.push('trendyolCategoryMap (kategori eşlemesi boş — örn. {"Boya": 1234})');
  }

  const publicBaseUrl = (raw.publicBaseUrl || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  if (!publicBaseUrl) missing.push("publicBaseUrl (görsel linkleri için site adresi)");

  let attributeDefaults: TrendyolCardSettings["attributeDefaults"] = {};
  if (raw.trendyolAttributeDefaults) {
    try {
      attributeDefaults = JSON.parse(raw.trendyolAttributeDefaults);
    } catch {
      missing.push("trendyolAttributeDefaults (geçersiz JSON)");
    }
  }

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, value: { brandId, cargoCompanyId, categoryMap, publicBaseUrl, attributeDefaults } };
}

/* ------------------------- Eşleme (saf, testli) ------------------------- */

export type TrendyolProductItem = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: "TRY";
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;
  images: Array<{ url: string }>;
  attributes: Array<{ attributeId: number; attributeValueId?: number; customAttributeValue?: string }>;
};

export type CardMappingResult = {
  items: TrendyolProductItem[];
  /** Gönderilemeyen ürünler ve nedenleri (kullanıcıya gösterilir). */
  problems: string[];
};

type ProductLike = Product & { status?: string };

const num = (v: string | number | null | undefined, fallback = 0) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Ana ürün + türevlerini Trendyol ürün kartı kalemlerine çevirir.
 * Tüm kalemler ana ürünün productMainId'sini paylaşır → tek ilan, varyant seçici.
 * imageKinds: productId → yüklü görsel türleri (main/packaging/usage).
 */
export function mapProductsToTrendyolItems(
  parent: ProductLike,
  variants: ProductLike[],
  imageKinds: Map<number, string[]>,
  cfg: TrendyolCardSettings,
): CardMappingResult {
  const problems: string[] = [];
  const items: TrendyolProductItem[] = [];
  const productMainId = (parent.sku ?? parent.barcode ?? `AOC-${parent.id}`).trim();

  // Türevi olan ana üründe ilan varyantlardan oluşur; türevsüz ana ürün tek başına gider.
  const candidates = variants.length > 0 ? variants : [parent];

  for (const p of candidates) {
    if (p.status && p.status !== "satista") {
      problems.push(`${p.name}: durumu "${p.status}" — yalnız Satışta ürünler gönderilir`);
      continue;
    }
    const barcode = p.barcode?.trim();
    if (!barcode) {
      problems.push(`${p.name}: barkod yok (zorunlu)`);
      continue;
    }
    const categoryName = (p.category ?? parent.category ?? "").trim();
    const categoryId = cfg.categoryMap[categoryName];
    if (!categoryId) {
      problems.push(
        `${p.name}: "${categoryName || "(kategori boş)"}" için Trendyol kategori eşlemesi yok (trendyolCategoryMap)`,
      );
      continue;
    }

    const urls: string[] = [];
    try {
      const external = JSON.parse(p.imageUrls ?? "[]");
      if (Array.isArray(external)) urls.push(...external.filter(u => typeof u === "string"));
    } catch {
      // bozuk JSON — harici link yok say
    }
    for (const kind of imageKinds.get(p.id) ?? []) {
      urls.push(`${cfg.publicBaseUrl}/api/img/${p.id}/${kind}`);
    }
    if (urls.length === 0) {
      // Türevin görseli yoksa ana ürünün görselleri kullanılır.
      for (const kind of imageKinds.get(parent.id) ?? []) {
        urls.push(`${cfg.publicBaseUrl}/api/img/${parent.id}/${kind}`);
      }
    }
    if (urls.length === 0) {
      problems.push(`${p.name}: görsel yok (zorunlu — ürüne veya ana ürüne görsel ekleyin)`);
      continue;
    }

    const listPrice = num(p.salePrice);
    if (listPrice <= 0) {
      problems.push(`${p.name}: satış fiyatı 0 (zorunlu)`);
      continue;
    }
    const salePrice = +(listPrice * (1 - num(p.discountPercent) / 100)).toFixed(2);
    const description =
      p.longDescription?.trim() || p.description?.trim() || p.shortDescription?.trim() || p.name;

    items.push({
      barcode,
      title: p.name.slice(0, 100),
      productMainId,
      brandId: cfg.brandId,
      categoryId,
      quantity: Math.max(0, p.stockQty ?? 0),
      stockCode: (p.sku ?? barcode).trim(),
      dimensionalWeight: num(p.desi, 1),
      description,
      currencyType: "TRY",
      listPrice,
      salePrice,
      vatRate: num(p.vatRate ?? parent.vatRate, 20),
      cargoCompanyId: cfg.cargoCompanyId,
      images: urls.slice(0, 8).map(url => ({ url })),
      attributes: cfg.attributeDefaults[String(categoryId)] ?? [],
    });
  }

  return { items, problems };
}

/* ------------------------- API çağrıları (canlıda test) ------------------------- */

export function isTrendyolConfigured(): boolean {
  return Boolean(ENV.trendyolSellerId && ENV.trendyolApiKey && ENV.trendyolApiSecret);
}

/** Ürün kartlarını gönderir; asenkron sonuç için batchRequestId döner. */
export async function pushTrendyolProductCards(items: TrendyolProductItem[]) {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış (Satıcı ID, API Key, API Secret gerekli).");
  }
  if (items.length === 0) throw new Error("Gönderilecek geçerli ürün kalemi yok.");
  const url = `${TRENDYOL_API_BASE}/integration/product/sellers/${ENV.trendyolSellerId}/products`;
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({ items }) });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`Trendyol ürün kartı gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { batchRequestId?: string };
  return { batchRequestId: data.batchRequestId ?? null, sent: items.length };
}

/** Batch sonucu: her kalemin durumu + hata mesajları. */
export async function getTrendyolProductBatchStatus(batchRequestId: string) {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış.");
  }
  return trendyolGet(
    `/integration/product/sellers/${ENV.trendyolSellerId}/products/batch-requests/${encodeURIComponent(batchRequestId)}`,
  );
}

/** Kategori ağacı — eşleme kurarken keşif için (Ayarlar sayfasından çağrılır). */
export async function fetchTrendyolCategories() {
  return trendyolGet(`/integration/product/product-categories`);
}

/** Bir kategorinin zorunlu/opsiyonel özellik listesi. */
export async function fetchTrendyolCategoryAttributes(categoryId: number) {
  return trendyolGet(`/integration/product/product-categories/${categoryId}/attributes`);
}

/** Marka arama — brandId bulmak için. */
export async function searchTrendyolBrands(name: string) {
  return trendyolGet(`/integration/product/brands/by-name?name=${encodeURIComponent(name)}`);
}
