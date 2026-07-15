/**
 * Fiyatlandırma motoru — saf fonksiyonlar (client + server + testler ortak kullanır).
 *
 * Toplu fiyat güncelleme modları:
 *  - percent:      mevcut fiyata % zam/indirim
 *  - targetMargin: toplam maliyetten hedef net kâr marjına göre fiyat üretir
 *                  (KDV ve kanal komisyonu düşüldükten SONRA kalan marj hedeflenir)
 *  - multiplier:   toplam maliyet × çarpan
 *  - fixed:        mevcut fiyata sabit TL ekle/çıkar
 */

export type PriceMode = "percent" | "targetMargin" | "multiplier" | "fixed";

export type Rounding = "none" | "whole" | "ninety" | "ninetynine";

export type ChannelProfile = {
  name: string;
  commissionPercent: number;
  fixedFee: number;
  vatPercent: number;
  shippingCost: number;
};

/** Ayarlar tablosundaki `channelProfiles` anahtarı boşsa kullanılan varsayılanlar. */
export const DEFAULT_CHANNEL_PROFILES: ChannelProfile[] = [
  // Elden satış Maliyet & Kar sayfasıyla aynı hesabı versin diye KDV 0 başlar.
  { name: "Elden / Web", commissionPercent: 0, fixedFee: 0, vatPercent: 0, shippingCost: 0 },
  { name: "Trendyol", commissionPercent: 20, fixedFee: 10, vatPercent: 20, shippingCost: 0 },
  { name: "Hepsiburada", commissionPercent: 15, fixedFee: 10, vatPercent: 20, shippingCost: 0 },
];

/** Psikolojik yuvarlama: en yakın x,90 / x,99 / tam sayı. */
export function roundPrice(price: number, rounding: Rounding): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  switch (rounding) {
    case "whole":
      return Math.max(1, Math.round(price));
    case "ninety": {
      const v = Math.round(price - 0.9) + 0.9;
      return +(v < 0.9 ? 0.9 : v).toFixed(2);
    }
    case "ninetynine": {
      const v = Math.round(price - 0.99) + 0.99;
      return +(v < 0.99 ? 0.99 : v).toFixed(2);
    }
    default:
      return +price.toFixed(2);
  }
}

export type SuggestInput = {
  currentPrice: number;
  totalCost: number;
  mode: PriceMode;
  value: number;
  /** targetMargin modunda satıştan düşülecek kanal komisyonu %'si (yoksa 0). */
  commissionPercent?: number;
  /** targetMargin modunda KDV dahil fiyattan ayrılacak KDV %'si (yoksa 0). */
  vatPercent?: number;
  rounding?: Rounding;
};

/**
 * Yeni fiyat önerisi. Geçersiz kombinasyon (örn. marj+komisyon+KDV toplamı
 * %100'ü aşarsa) null döner — arayüz satırı "hesaplanamadı" olarak işaretler.
 */
export function suggestPrice(input: SuggestInput): number | null {
  const rounding = input.rounding ?? "none";
  let raw: number;
  switch (input.mode) {
    case "percent":
      raw = input.currentPrice * (1 + input.value / 100);
      break;
    case "multiplier":
      raw = input.totalCost * input.value;
      break;
    case "fixed":
      raw = input.currentPrice + input.value;
      break;
    case "targetMargin": {
      // KDV dahil fiyat P için: P·vatShare KDV'ye, P·kom/100 komisyona gider;
      // kalan − maliyet = P·marj/100 olacak şekilde P çözülür.
      const vat = input.vatPercent ?? 0;
      const vatShare = vat > 0 ? 1 - 1 / (1 + vat / 100) : 0;
      const denom = 1 - vatShare - (input.commissionPercent ?? 0) / 100 - input.value / 100;
      if (denom <= 0.0001 || input.totalCost <= 0) return null;
      raw = input.totalCost / denom;
      break;
    }
  }
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return roundPrice(raw, rounding);
}

/* ------------------------- CSV ile fiyat güncelleme ------------------------- */

export type CsvPriceRow = { key: string; price: number; line: number };

/** Basit CSV satır ayrıştırıcı: tırnaklı alanları ve ; veya , ayracını destekler. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const KEY_HEADERS = ["barkod", "barcode", "id", "urun no", "sku", "stok kodu"];
const PRICE_HEADERS = ["yeni fiyat", "satis fiyati", "fiyat", "price", "saleprice"];

/** Başlıkları Türkçe karakterlerden arındırıp küçük harfe indirger ("SATIŞ FİYATI" → "satis fiyati"). */
function norm(s: string): string {
  const map: Record<string, string> = { ş: "s", ı: "i", ğ: "g", ü: "u", ö: "o", ç: "c", İ: "i", I: "i", Ş: "s", Ğ: "g", Ü: "u", Ö: "o", Ç: "c" };
  return s
    .replace(/^﻿/, "")
    .trim()
    .replace(/[şıığüöçİIŞĞÜÖÇ]/g, ch => map[ch] ?? ch)
    .toLowerCase();
}

/** "1.234,56" / "1234.56" / "1234" hepsini sayıya çevirir. */
export function parsePriceNumber(s: string): number {
  let t = s.replace(/[^0-9.,-]/g, "").trim();
  if (!t) return NaN;
  if (t.includes(",") && t.includes(".")) {
    // Son ayırıcı ondalık kabul edilir (1.234,56 → TR; 1,234.56 → EN).
    t = t.lastIndexOf(",") > t.lastIndexOf(".")
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  return parseFloat(t);
}

/**
 * Excel'den kaydedilmiş CSV metnini {barkod/ID, yeni fiyat} satırlarına çevirir.
 * Başlık satırında anahtar (Barkod/ID/SKU) ve fiyat (Yeni Fiyat/Satış Fiyatı/Fiyat)
 * sütunlarını arar; bulunamazsa hata mesajı döner.
 */
export function parsePriceCsv(text: string): { rows: CsvPriceRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["Dosyada başlık + en az bir veri satırı olmalı."] };

  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitCsvLine(lines[0], sep).map(norm);

  const keyIdx = headers.findIndex(h => KEY_HEADERS.includes(h));
  // "İndirim %"" gibi başlıklara takılmamak için tam ad eşleşmesi; önce spesifik adlar denenir.
  let priceIdx = -1;
  for (const cand of PRICE_HEADERS) {
    priceIdx = headers.findIndex(h => h === cand);
    if (priceIdx >= 0) break;
  }

  const errors: string[] = [];
  if (keyIdx < 0) errors.push('Anahtar sütunu bulunamadı — başlıklardan biri "Barkod", "ID" veya "SKU" olmalı.');
  if (priceIdx < 0) errors.push('Fiyat sütunu bulunamadı — başlıklardan biri "Yeni Fiyat", "Satış Fiyatı" veya "Fiyat" olmalı.');
  if (errors.length > 0) return { rows: [], errors };

  const rows: CsvPriceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], sep);
    const key = (cells[keyIdx] ?? "").trim();
    const price = parsePriceNumber(cells[priceIdx] ?? "");
    if (!key) {
      errors.push(`Satır ${i + 1}: anahtar (barkod/ID) boş — atlandı.`);
      continue;
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Satır ${i + 1}: fiyat okunamadı ("${cells[priceIdx] ?? ""}") — atlandı.`);
      continue;
    }
    rows.push({ key, price: +price.toFixed(2), line: i + 1 });
  }
  return { rows, errors };
}

export type MatchableProduct = { id: number; name: string; barcode: string | null; salePrice: string | number };

export type PriceMatch = {
  productId: number;
  productName: string;
  oldPrice: number;
  newPrice: number;
  line: number;
};

/**
 * CSV satırlarını ürünlerle eşler: önce barkod, sonra sayısal ID.
 * Eşleşmeyen satırlar `unmatched` olarak döner (kullanıcıya gösterilir).
 */
export function matchPriceRows(products: MatchableProduct[], rows: CsvPriceRow[]) {
  const byBarcode = new Map<string, MatchableProduct>();
  for (const p of products) {
    const b = (p.barcode ?? "").trim();
    if (b) byBarcode.set(b, p);
  }
  const byId = new Map(products.map(p => [p.id, p]));

  const matches: PriceMatch[] = [];
  const unmatched: CsvPriceRow[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const product = byBarcode.get(row.key) ?? (/^\d+$/.test(row.key) ? byId.get(Number(row.key)) : undefined);
    if (!product || seen.has(product.id)) {
      unmatched.push(row);
      continue;
    }
    seen.add(product.id);
    matches.push({
      productId: product.id,
      productName: product.name,
      oldPrice: parseFloat(String(product.salePrice)) || 0,
      newPrice: row.price,
      line: row.line,
    });
  }
  return { matches, unmatched };
}
