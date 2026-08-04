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

  /*
   * Kategori eşlemesi ARTIK ZORUNLU DEĞİL.
   *
   * Küp katalogda kategori, kanal ilanının kendi `channelCategoryId` alanından
   * gelir ve Toplu Yayın → "Kategori Eşlemesi" sekmesinde ağaçtan seçilir.
   * Buradaki JSON yalnız emekli düz ürün modelinin eşleyicisine (kategori ADI
   * → id) hizmet ediyor.
   *
   * Zorunlu tutulduğu sürece kullanıcı, yeni modelin hiç kullanmadığı bir
   * ayarı Ayarlar sayfasında elle JSON yazarak doldurmadan ürün kartı
   * açamıyordu — sahte bir engeldi. Bozuk JSON hâlâ bildirilir.
   */
  let categoryMap: Record<string, number> = {};
  try {
    categoryMap = raw.trendyolCategoryMap ? JSON.parse(raw.trendyolCategoryMap) : {};
  } catch {
    missing.push('trendyolCategoryMap (geçersiz JSON — örn. {"Boya": 1234})');
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

const num = (v: string | number | null | undefined, fallback = 0) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};


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
