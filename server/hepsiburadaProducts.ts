import { ENV } from "./_core/env";

/**
 * Hepsiburada'da ürün kartı açma (asenkron batch).
 *
 * Trendyol gibi Hepsiburada da ürün oluşturmayı asenkron batch olarak yapar.
 * API batchRequestId döner, sistem polling'le status kontrol eder.
 *
 * Belgeler: https://developers.hepsiburada.com → Product Integration
 */

const HB_API_BASE = process.env.HEPSIBURADA_API_BASE_URL ?? "https://api.hepsiburada.com";

const headers = () => ({
  Authorization: `Basic ${Buffer.from(`${ENV.hepsiburadaUsername}:${ENV.hepsiburadaPassword}`).toString("base64")}`,
  "User-Agent": ENV.hepsiburadaMerchantId ?? "SelfIntegration",
  "Content-Type": "application/json",
  Accept: "application/json",
});

async function hepsiburadaGet(path: string) {
  const res = await fetch(`${HB_API_BASE}${path}`, { headers: headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Hepsiburada API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Hepsiburada isteği başarısız (${res.status}): ${body}`);
  }
  return res.json();
}

export type HepsiburadaProductItem = {
  barcode: string;
  title: string;
  categoryId: number;
  quantity: number;
  price: number;
  stock: number;
  description: string;
  images: Array<{ url: string }>;
  // Hepsiburada'ya özel alanlar eklenebilir
};

export function isHepsiburadaConfigured(): boolean {
  return Boolean(ENV.hepsiburadaUsername && ENV.hepsiburadaPassword && ENV.hepsiburadaMerchantId);
}

/**
 * Hepsiburada hata mesajlarının Türkçe karşılığı.
 */
const HEPSIBURADA_ERROR_HINTS: Record<string, string> = {
  "barcode.duplicate": "Bu barkod Hepsiburada'da zaten kayıtlı.",
  "category.invalid": "Kategori ID Hepsiburada'da geçerli değil.",
  "product.title.invalid": "Ürün başlığı Hepsiburada kurallarını ihlal ediyor.",
  "product.description.invalid": "Ürün açıklaması Hepsiburada kurallarını ihlal ediyor.",
};

/** Hepsiburada hata gövdesini okunur tek satıra çevirir. */
export function explainHepsiburadaError(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ code?: string; message?: string }>;
      message?: string;
    };
    if (parsed.errors && parsed.errors.length > 0) {
      const parts = parsed.errors.map(e => {
        const hint = e.code ? HEPSIBURADA_ERROR_HINTS[e.code] : null;
        return hint || e.message || "Bilinmeyen hata";
      });
      return parts.join(" · ");
    }
    return parsed.message || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/** Ürün kartlarını gönderir; asenkron sonuç için batchRequestId döner. */
export async function pushHepsiburadaProductCards(items: HepsiburadaProductItem[]) {
  if (!isHepsiburadaConfigured()) {
    throw new Error("Hepsiburada entegrasyonu yapılandırılmamış.");
  }
  if (items.length === 0) throw new Error("Gönderilecek geçerli ürün kalemi yok.");

  const url = `${HB_API_BASE}/products/batch`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ products: items }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Hepsiburada API bilgileri reddedildi (yetki hatası).");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Hepsiburada ürün kartı açılamadı: ${explainHepsiburadaError(body)}`);
  }

  const data = (await res.json()) as { batchId?: string; id?: string };
  return { batchRequestId: data.batchId ?? data.id ?? null, sent: items.length };
}

/** Batch sonucu: her kalemin durumu + hata mesajları. */
export async function getHepsiburadaProductBatchStatus(batchRequestId: string) {
  if (!isHepsiburadaConfigured()) {
    throw new Error("Hepsiburada entegrasyonu yapılandırılmamış.");
  }
  return hepsiburadaGet(`/products/batch/${encodeURIComponent(batchRequestId)}`);
}

/**
 * Batch status sonucu ve hata çıkarım.
 *
 * Hepsiburada batch response'ı kalem-bazlı sonuçlar içerir:
 * ```
 * {
 *   "batchId": "abc123",
 *   "items": [
 *     {
 *       "barcode": "...",
 *       "status": "SUCCESS|FAILED",
 *       "errors": [{ "code": "...", "message": "..." }]
 *     }
 *   ]
 * }
 * ```
 */
export function extractHepsiburadaBatchStatus(
  batchData: unknown,
): {
  finalStatus: "pending" | "success" | "failed";
  errorMessage: string | null;
} {
  try {
    const batch = batchData as {
      batchId?: string;
      items?: Array<{
        barcode?: string;
        status?: string;
        errors?: Array<{ code?: string; message?: string }>;
      }>;
    };

    const items = batch.items ?? [];
    if (items.length === 0) {
      return { finalStatus: "pending", errorMessage: null };
    }

    const failedItems = items.filter(i => i.status === "FAILED" || i.status === "ERROR");
    if (failedItems.length === 0) {
      return { finalStatus: "success", errorMessage: null };
    }

    const errorParts = failedItems.map(item => {
      const errors = item.errors ?? [];
      const errorMessages = errors.map(e => {
        const hint = e.code ? HEPSIBURADA_ERROR_HINTS[e.code] : null;
        return hint || e.message || "Bilinmeyen hata";
      });
      return `${item.barcode || "?"}: ${errorMessages.join(" · ")}`;
    });

    return {
      finalStatus: "failed",
      errorMessage: errorParts.join(" | "),
    };
  } catch (e) {
    return {
      finalStatus: "failed",
      errorMessage: `Batch sonucu işlenemedi: ${String(e).slice(0, 200)}`,
    };
  }
}
