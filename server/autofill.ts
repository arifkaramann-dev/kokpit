/**
 * Ürün kartı otomatik doldurma yardımcıları (ÜRÜN KAYIT Excel paritesi).
 * Mantık: reçete maliyeti + ambalaj/kargo → seri kâr oranıyla satış fiyatı,
 * KDV hesabı, SKU/barkod önerisi. Saf fonksiyonlar — DB'ye dokunmaz.
 */

/** Türkçe karakterleri sadeleştirip küçük harfli, boşluksuz kod üretir. */
export function slugifyCode(text: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  return text
    .split("")
    .map(ch => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Satıcı stok kodu önerisi: aoc + ürün adı (marka kelimeleri atılır) + ambalaj.
 * Örn: "ARTOFCOLOUR AİR-X 30 ML BOYA" + "30 ML" → "aocairx30mlboya".
 */
export function suggestSku(name: string, packaging?: string | null): string {
  const brandWords = /\b(art\s*of\s*colour|artofcolour|art0fcolour|aoc)\b/gi;
  const base = slugifyCode(name.replace(brandWords, " "));
  const pack = packaging ? slugifyCode(packaging) : "";
  // Ambalaj adı ürün adında zaten geçiyorsa tekrar ekleme.
  const suffix = pack && !base.includes(pack) ? pack : "";
  return ("aoc" + base + suffix).slice(0, 40);
}

export type PriceInput = {
  materialCost: number;
  packagingCost?: number;
  shippingCost?: number;
  /** Yüzde: 35 => %35 kâr. */
  profitMargin: number;
  /** Yüzde: 20 => %20 KDV. */
  vatRate: number;
};

export type PriceSuggestion = {
  cost: number;
  salePrice: number;
  vatAmount: number;
  priceWithVat: number;
};

/** Excel mantığı: satış (KDV hariç) = toplam maliyet × (1 + kâr%). */
export function computePrice(input: PriceInput): PriceSuggestion {
  const cost = round2(
    (input.materialCost || 0) + (input.packagingCost || 0) + (input.shippingCost || 0),
  );
  const salePrice = round2(cost * (1 + input.profitMargin / 100));
  const vatAmount = round2(salePrice * (input.vatRate / 100));
  return { cost, salePrice, vatAmount, priceWithVat: round2(salePrice + vatAmount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** LLM yanıtından JSON gövdesini ayıklar (kod bloğu/başındaki metin toleranslı). */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
