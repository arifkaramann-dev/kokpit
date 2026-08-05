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

/**
 * Trendyol hata anahtarlarının Türkçe karşılığı.
 *
 * Trendyol'un `message` alanı çoğu zaman "Bilinmeyen bir hata oluştu" diyor;
 * asıl bilgi `key` alanında. Ham JSON'u kullanıcıya göstermek ne olduğunu
 * anlatmıyordu.
 */
const TRENDYOL_ERROR_HINTS: Record<string, string> = {
  "batchRequest.recurring.product.create.not.allowed":
    "Bu barkod Trendyol'da zaten kayıtlı — mevcut ürün için yeniden 'oluştur' gönderilemez. " +
    "Ürün Trendyol'da varsa kart açmak yerine stok/fiyat gönderimini kullanın; " +
    "gerçekten yeni ürünse barkodu değiştirin.",
  "barcode.already.exists": "Bu barkod başka bir üründe kayıtlı.",
  "product.barcode.invalid": "Barkod biçimi Trendyol tarafından kabul edilmedi.",
  "category.not.found": "Seçilen Trendyol kategorisi bulunamadı — Kategori Eşlemesi'ni kontrol edin.",
  "brand.not.found": "Marka ID Trendyol'da bulunamadı — Ayarlar'daki marka kimliğini kontrol edin.",
};

/** Trendyol hata gövdesini okunur tek satıra çevirir. */
export function explainTrendyolError(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: { key?: string; message?: string }[];
    };
    const parts = (parsed.errors ?? []).map(e => {
      const hint = e.key ? TRENDYOL_ERROR_HINTS[e.key] : null;
      if (hint) return hint;
      const msg = (e.message ?? "").trim();
      // "Bilinmeyen bir hata" tek başına bilgi taşımıyor; anahtarı da göster.
      return e.key ? `${msg || "hata"} (${e.key})` : msg;
    });
    return parts.filter(Boolean).join(" · ") || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
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
    const body = await res.text();
    throw new Error(`Trendyol ürün kartı açılamadı: ${explainTrendyolError(body)}`);
  }
  const data = (await res.json()) as { batchRequestId?: string };
  return { batchRequestId: data.batchRequestId ?? null, sent: items.length };
}

/**
 * MEVCUT ürün kartlarını günceller (başlık, açıklama, görsel, özellik, kategori).
 *
 * Sistemde yalnız "oluştur" vardı; Trendyol'da zaten kayıtlı bir barkod için
 * create reddedildiğinden ürün ya hata veriyor ya atlanıyordu. Oysa doğru
 * karşılık güncellemektir — kart açılışıyla aynı veriden beslenir, sadece
 * fiil değişir (POST → PUT).
 *
 * Stok/fiyat bunun kapsamında DEĞİL: onun ayrı ve daha hızlı bir ucu var
 * (price-and-inventory). Burası ürün bilgisi içindir.
 */
export async function updateTrendyolProductCards(items: TrendyolProductItem[]) {
  if (!isTrendyolConfigured()) {
    throw new Error("Trendyol entegrasyonu yapılandırılmamış (Satıcı ID, API Key, API Secret gerekli).");
  }
  if (items.length === 0) throw new Error("Güncellenecek geçerli ürün kalemi yok.");

  const url = `${TRENDYOL_API_BASE}/integration/product/sellers/${ENV.trendyolSellerId}/products`;
  const res = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify({ items }) });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Trendyol API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trendyol ürün güncellemesi başarısız: ${explainTrendyolError(body)}`);
  }
  const data = (await res.json()) as { batchRequestId?: string };
  return { batchRequestId: data.batchRequestId ?? null, sent: items.length };
}

/**
 * Satıcının Trendyol'da HÂLEN KAYITLI barkodları.
 *
 * "Bu barkod Trendyol'da zaten kayıtlı" hatasının sebebi: kart bir kez açılmış
 * (ya da önceki denemede açılmış), sistem yine "oluştur" gönderiyor. Trendyol
 * mevcut ürün için create kabul etmiyor ve TÜM parti düşüyor — içinde gerçekten
 * yeni olan kalemler varsa onlar da gitmiyor.
 *
 * Gönderimden önce bu küme çekilip parti ikiye ayrılır: yeni olanlar açılır,
 * var olanlar bildirilir. Böylece kullanıcı kilitlenmiş bir hatada kalmaz.
 *
 * Arşivlenmiş/onay bekleyen ürünler de barkodu tuttuğu için filtre konmaz —
 * amaç "bu barkod Trendyol'da var mı?" sorusuna tam cevap vermek.
 */
export async function fetchTrendyolExistingBarcodes(): Promise<Set<string>> {
  const rows = await fetchTrendyolProducts();
  return new Set(rows.map(r => r.barcode));
}

/** Trendyol'daki bir ürün kaydının bizi ilgilendiren alanları. */
export type TrendyolRemoteProduct = {
  barcode: string;
  title: string;
  stockCode: string;
  productMainId: string;
  categoryId: number | null;
  categoryName: string | null;
  brandId: number | null;
  quantity: number;
  listPrice: number;
  salePrice: number;
  /** Trendyol içi ürün kimliği — eşleştirmede saklanır. */
  productCode: string | null;
  approved: boolean;
  onSale: boolean;
  images: string[];
  /**
   * Ürünün pazaryerindeki KENDİ özellikleri (Renk: Fuşya, Hacim: 100 ml…).
   *
   * Koordinatı başlıktan ayrıştırmak kırılgan: başlık yazımı serbest, sıra
   * değişebilir, kelime eksik olabilir. Bu liste değerin kendisini veriyor —
   * önce buna bakmak doğru, başlık yedek kalır.
   */
  attributes: { name: string; value: string }[];
};

/**
 * Satıcının Trendyol'daki ürünleri (tam kayıt).
 *
 * Barkod kümesi bu listenin özetidir; ayrı bir uç değil. Eşleştirme ekranı
 * başlık, stok kodu ve durum gibi alanları da gösterdiği için ham kayıt burada
 * döner — aynı veriyi iki kez çekmemek için barkod kümesi de bunu kullanır.
 */
export async function fetchTrendyolProducts(): Promise<TrendyolRemoteProduct[]> {
  if (!isTrendyolConfigured()) return [];

  const out: TrendyolRemoteProduct[] = [];
  const size = 1000;
  // Üst sınır: katalog beklenmedik büyüklükteyse sonsuz döngüye girilmesin.
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = (await trendyolGet(
      `/integration/product/sellers/${ENV.trendyolSellerId}/products?page=${page}&size=${size}`,
    )) as { content?: Record<string, unknown>[]; totalPages?: number };

    const rows = Array.isArray(data?.content) ? data.content : [];
    for (const r of rows) {
      const barcode = String(r?.barcode ?? "").trim();
      if (!barcode) continue;
      const category = (r.category ?? {}) as Record<string, unknown>;
      const images = Array.isArray(r.images)
        ? (r.images as Record<string, unknown>[])
            .map(i => String(i?.url ?? "").trim())
            .filter(Boolean)
        : [];
      // Trendyol özellik satırı: {attributeName, attributeValue} ya da
      // {attribute:{name}, attributeValue:{name}} — ikisi de karşılanır.
      const attributes = Array.isArray(r.attributes)
        ? (r.attributes as Record<string, unknown>[])
            .map(a => {
              const attr = (a.attribute ?? {}) as Record<string, unknown>;
              const val = (a.attributeValue ?? {}) as Record<string, unknown>;
              return {
                name: String(a.attributeName ?? attr.name ?? "").trim(),
                value: String(
                  typeof a.attributeValue === "string" ? a.attributeValue : (val.name ?? ""),
                ).trim(),
              };
            })
            .filter(a => a.name && a.value)
        : [];
      out.push({
        barcode,
        title: String(r.title ?? ""),
        stockCode: String(r.stockCode ?? ""),
        productMainId: String(r.productMainId ?? ""),
        categoryId: Number(r.pimCategoryId ?? category.id ?? 0) || null,
        categoryName: String(category.name ?? "") || null,
        brandId: Number(r.brandId ?? 0) || null,
        quantity: Number(r.quantity ?? 0),
        listPrice: Number(r.listPrice ?? 0),
        salePrice: Number(r.salePrice ?? 0),
        productCode: r.productCode != null ? String(r.productCode) : null,
        approved: Boolean(r.approved),
        onSale: Boolean(r.onSale),
        images,
        attributes,
      });
    }

    const totalPages = Number(data?.totalPages ?? 0);
    if (rows.length === 0 || page + 1 >= totalPages) break;
  }
  return out;
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

/**
 * Batch status sonucu ve hata çıkarım.
 *
 * Trendyol batch response'ı kalem-bazlı sonuçlar içerir:
 * ```
 * {
 *   "batchRequestId": "abc123",
 *   "items": [
 *     {
 *       "barcode": "...",
 *       "productId": 123,
 *       "status": "SUCCESS|FAILED",
 *       "errors": [{ "key": "...", "message": "..." }]
 *     }
 *   ]
 * }
 * ```
 *
 * Batch tamamlandı mı? Başarı/başarısızlık durumunu belirle.
 * Eğer bir kalem başarısız, batch başarısız kabul edilir.
 */
export function extractTrendyolBatchStatus(
  batchData: unknown,
): {
  finalStatus: "pending" | "success" | "failed";
  errorMessage: string | null;
} {
  try {
    const batch = batchData as {
      batchRequestId?: string;
      items?: Array<{
        barcode?: string;
        status?: string;
        errors?: Array<{ key?: string; message?: string }>;
      }>;
    };

    const items = batch.items ?? [];
    if (items.length === 0) {
      return { finalStatus: "pending", errorMessage: null };
    }

    const failedItems = items.filter(i => i.status === "FAILED");
    if (failedItems.length === 0) {
      return { finalStatus: "success", errorMessage: null };
    }

    const errorParts = failedItems.map(item => {
      const errors = item.errors ?? [];
      const errorMessages = errors.map(e => {
        const hint = e.key ? TRENDYOL_ERROR_HINTS[e.key] : null;
        return hint || e.message || "Bilinmeyen hata";
      });
      return `${item.barcode || "?"}: ${errorMessages.join(" · ")}`;
    });

    return {
      finalStatus: "failed",
      errorMessage: errorParts.join(" | "),
    };
  } catch {
    /*
     * Gövde okunamadı. Bu partinin BAŞARISIZ olduğu anlamına GELMEZ — yanıt
     * biçimi değişmiş ya da bozuk gelmiş olabilir. "failed" demek kullanıcıya
     * "ürün açılmadı" dedirtir ve aynı barkodu tekrar göndermeye iter; parti
     * pending kalsın, sonraki turda yeniden sorulur.
     */
    return { finalStatus: "pending", errorMessage: null };
  }
}
