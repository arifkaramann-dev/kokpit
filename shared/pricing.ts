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

export type ChannelKind = "pazaryeri" | "website" | "elden";

export type ChannelProfile = {
  name: string;
  /** pazaryeri: komisyon+stopaj'lı; website: sanal POS'lu; elden: kesintisiz. */
  kind: ChannelKind;
  /** KDV dahil satış fiyatı üzerinden %. Komisyon KDV'si indirildiği için net maliyet = oran × satış. */
  commissionPercent: number;
  /** Ödeme bedeli / sanal POS oranı: KDV dahil satış üzerinden %, KDV DAHİL tutar üretir. */
  paymentFeePercent: number;
  /** true: ödeme kuruluşu/pazaryeri (%20 KDV'si indirilir); false: banka POS'u (BSMV, indirilemez). */
  paymentFeeVatDeductible: boolean;
  /** İşlem bedeli, KDV dahil TL. */
  fixedFee: number;
  /** Aracı stopajı: KDV HARİÇ satış üzerinden % (pazaryerlerinde %1, kendi sitede 0). */
  stopajPercent: number;
  vatPercent: number;
  /** Kanal kargo bedeli, KDV dahil TL. 0 ise ürünün kendi kargo maliyeti kullanılır. */
  shippingCost: number;
};

/** Ayarlar tablosundaki `channelProfiles` anahtarı boşsa kullanılan varsayılanlar. */
export const DEFAULT_CHANNEL_PROFILES: ChannelProfile[] = [
  // Elden satış Maliyet & Kar sayfasıyla aynı hesabı versin diye KDV 0 başlar.
  { name: "Elden", kind: "elden", commissionPercent: 0, paymentFeePercent: 0, paymentFeeVatDeductible: true, fixedFee: 0, stopajPercent: 0, vatPercent: 0, shippingCost: 0 },
  { name: "Web Sitesi", kind: "website", commissionPercent: 0, paymentFeePercent: 2.5, paymentFeeVatDeductible: true, fixedFee: 0, stopajPercent: 0, vatPercent: 20, shippingCost: 0 },
  { name: "Trendyol", kind: "pazaryeri", commissionPercent: 20, paymentFeePercent: 0.96, paymentFeeVatDeductible: true, fixedFee: 12.6, stopajPercent: 1, vatPercent: 20, shippingCost: 0 },
  { name: "Hepsiburada", kind: "pazaryeri", commissionPercent: 15, paymentFeePercent: 0, paymentFeeVatDeductible: true, fixedFee: 10, stopajPercent: 1, vatPercent: 20, shippingCost: 0 },
];

/**
 * Ayarlarda kayıtlı eski biçimli (kind/ödeme bedeli/stopaj alanları olmayan)
 * profilleri yeni biçime taşır. Stopaj yasal zorunluluk olduğu için pazaryeri
 * sayılan eski profillere %1 ile eklenir.
 */
export function normalizeChannelProfile(p: Partial<ChannelProfile> & { name?: string }): ChannelProfile {
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const kind: ChannelKind =
    p.kind === "pazaryeri" || p.kind === "website" || p.kind === "elden"
      ? p.kind
      : num(p.commissionPercent) > 0
        ? "pazaryeri"
        : "elden";
  return {
    name: p.name ?? "Kanal",
    kind,
    commissionPercent: num(p.commissionPercent),
    paymentFeePercent: num(p.paymentFeePercent, kind === "pazaryeri" ? 0.96 : 0),
    paymentFeeVatDeductible: p.paymentFeeVatDeductible ?? true,
    fixedFee: num(p.fixedFee),
    stopajPercent: num(p.stopajPercent, kind === "pazaryeri" ? 1 : 0),
    vatPercent: num(p.vatPercent),
    shippingCost: num(p.shippingCost),
  };
}

/* ------------------------- Kanal bazlı satış fiyatı ------------------------- */

/** Ayrı fiyat kaydı tutulan pazaryeri kanalları (products.channelPrices anahtarları). */
export const MARKETPLACE_CHANNELS = ["trendyol", "hepsiburada", "n11", "ciceksepeti"] as const;
export type MarketplaceChannel = (typeof MARKETPLACE_CHANNELS)[number];

/** Bir ürünün kanal bazlı fiyat kaydı: kanal anahtarı → fiyat/indirim. */
export type ChannelPriceMap = Record<string, { salePrice: number; discountPercent?: number }>;

/** products.channelPrices JSON metnini güvenle nesneye çevirir (bozuksa boş). */
export function parseChannelPrices(json: string | null | undefined): ChannelPriceMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return {};
    const out: ChannelPriceMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const o = v as { salePrice?: unknown; discountPercent?: unknown };
      const sp = Number(o?.salePrice);
      if (!Number.isFinite(sp)) continue;
      const dp = Number(o?.discountPercent);
      out[k] = { salePrice: sp, ...(Number.isFinite(dp) ? { discountPercent: dp } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Fiyat tablosundaki seçili kanal profilini, ayrı fiyat tutulan bir pazaryeri
 * anahtarına eşler. Web sitesi / elden / bilinmeyen kanal → null (taban fiyat
 * kullanılır). Eşleme profil adına göredir (varsayılan adlar birebir tutar).
 */
export function channelSlugForProfile(p: { name?: string; kind?: ChannelKind }): MarketplaceChannel | null {
  const n = (p.name ?? "").toLocaleLowerCase("tr-TR");
  if (n.includes("trendyol")) return "trendyol";
  if (n.includes("hepsi")) return "hepsiburada";
  if (n.includes("n11")) return "n11";
  if (n.includes("çiçek") || n.includes("cicek")) return "ciceksepeti";
  return null;
}

/**
 * Bir kanal için geçerli satış fiyatı: kanalın kendi kaydı varsa o, yoksa
 * ürünün taban fiyatı (web sitesi fiyatı). `channel` null ise her zaman taban.
 */
export function effectiveChannelPrice(
  base: { salePrice: number; discountPercent: number },
  channelPrices: ChannelPriceMap,
  channel: MarketplaceChannel | null,
): { salePrice: number; discountPercent: number; overridden: boolean } {
  if (channel && channelPrices[channel]) {
    const o = channelPrices[channel];
    return {
      salePrice: o.salePrice,
      discountPercent: o.discountPercent ?? base.discountPercent,
      overridden: true,
    };
  }
  return { salePrice: base.salePrice, discountPercent: base.discountPercent, overridden: false };
}

/* ------------------------- Kanal net kâr hesabı ------------------------- */

export type ChannelProfitInput = {
  /** KDV dahil, indirim sonrası nihai satış fiyatı. */
  salePrice: number;
  /**
   * Ürün maliyeti (hammadde + ambalaj). `productCostVatPercent` verilmezse KDV
   * HARİÇ kabul edilir (geriye dönük uyumluluk). Verilirse KDV DAHİL kabul edilip
   * o oranla arındırılır — maliyet faturalarındaki indirilecek KDV düşülür.
   */
  productCost: number;
  /** Verilirse `productCost` KDV DAHİL sayılır ve bu oranla (örn. 20) arındırılır. */
  productCostVatPercent?: number;
  /** Adet başı işçilik + genel gider (KDV hariç; doğrudan düşülür, KDV arındırması yok). */
  extraCostEx?: number;
  profile: ChannelProfile;
  /** Profil kargosu 0 ise kullanılacak ürün bazlı kargo (KDV dahil). */
  shippingOverride?: number;
};

export type ChannelProfit = {
  /** KDV hariç satış (gerçek hasılat). */
  saleEx: number;
  /** KDV'si indirilmiş net kesinti maliyetleri. */
  commission: number;
  paymentFee: number;
  transactionFee: number;
  shipping: number;
  stopaj: number;
  totalFees: number;
  /** Hesapta kullanılan KDV hariç ürün maliyeti (girdi zaten hariçse aynısı). */
  productCostEx: number;
  /** Ürün maliyetinden düşülen indirilecek KDV (girdi KDV hariçse 0). */
  inputVat: number;
  /** Adet başı işçilik + genel gider (KDV hariç), hesaba katılan. */
  extraCostEx: number;
  net: number;
  /** Net kâr marjı: net / KDV hariç satış (muhasebe doğrusu — KDV hasılat değildir). */
  margin: number;
  /** Yatırım geri dönüşü: net / KDV hariç toplam maliyet. */
  roi: number;
};

/**
 * Kanal bazlı gerçek net kâr. KDV mantığı: satış KDV'sinin tamamı gider değildir;
 * komisyon/işlem bedeli/kargo faturalarındaki KDV indirilir. Bu yüzden hesap tüm
 * kalemler KDV-hariç baza indirgenerek yapılır (Trendyol resmi hesaplayıcısıyla
 * kuruş kuruş aynı sonucu verir; finans onayı 15.07.2026).
 */
export function calcChannelProfit(input: ChannelProfitInput): ChannelProfit {
  const p = input.profile;
  const sale = input.salePrice;
  const v = 1 + p.vatPercent / 100;
  const saleEx = sale / v;
  const commission = (sale * p.commissionPercent) / 100;
  const paymentRaw = (sale * p.paymentFeePercent) / 100;
  const paymentFee = p.paymentFeeVatDeductible ? paymentRaw / v : paymentRaw;
  const transactionFee = p.fixedFee / v;
  const shippingGross = p.shippingCost > 0 ? p.shippingCost : (input.shippingOverride ?? 0);
  const shipping = shippingGross / v;
  const stopaj = (saleEx * p.stopajPercent) / 100;
  const totalFees = commission + paymentFee + transactionFee + shipping + stopaj;
  // Maliyet KDV dahil verildiyse (productCostVatPercent) indirilecek KDV'yi düş.
  const cv = 1 + (input.productCostVatPercent ?? 0) / 100;
  const productCostEx = input.productCost / cv;
  const inputVat = input.productCost - productCostEx;
  const extraCostEx = input.extraCostEx ?? 0;
  const net = saleEx - totalFees - productCostEx - extraCostEx;
  const totalCostEx = productCostEx + extraCostEx + totalFees;
  return {
    saleEx,
    commission,
    paymentFee,
    transactionFee,
    shipping,
    stopaj,
    totalFees,
    productCostEx,
    inputVat,
    extraCostEx,
    net,
    margin: saleEx > 0 ? (net / saleEx) * 100 : 0,
    roi: totalCostEx > 0 ? (net / totalCostEx) * 100 : 0,
  };
}

/* ------------------------- İşçilik + genel gider payı ------------------------- */

/**
 * Patron rakamları (21.07.2026): işçilik 150 ₺/saat, aylık genel gider 15.000 ₺,
 * aylık ortalama üretim 150 adet. Ayarlarda alan boşsa bu varsayılanlar geçerlidir;
 * ekrandan değiştirilebilir (gerçek rakamlar değiştikçe güncellenir).
 */
export const DEFAULT_COST_SETTINGS = {
  laborHourlyRate: 150,
  monthlyOverhead: 15000,
  monthlyAvgProduction: 150,
  laborMinutesPerUnit: 0,
} as const;

export type CostSettingsLike = {
  /** Elle girilen adet başı işçilik+genel gider; doluysa otomatik hesabı EZER. */
  unitLaborOverhead?: string | null;
  laborHourlyRate?: string | null;
  monthlyOverhead?: string | null;
  monthlyAvgProduction?: string | null;
  /** Bir adedin ortalama işçilik süresi (dakika); 0 = işçilik payı katılmaz. */
  laborMinutesPerUnit?: string | null;
};

export type UnitLaborOverhead = {
  /** Hesaba katılacak adet başı işçilik + genel gider (₺, KDV hariç). */
  value: number;
  source: "manual" | "auto";
  /** Otomatik hesabın dökümü (genel gider payı + işçilik payı). */
  overheadShare: number;
  laborShare: number;
};

/**
 * Adet başı işçilik+genel gider payı: elle değer girildiyse o; yoksa
 * (aylık genel gider ÷ aylık ortalama adet) + (saat ücreti × dakika ÷ 60).
 * Varsayılanlarla: 15000 ÷ 150 = 100 ₺/adet.
 */
export function deriveUnitLaborOverhead(cfg: CostSettingsLike): UnitLaborOverhead {
  const num = (v: string | null | undefined, d: number) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : d;
  };
  const manual = num(cfg.unitLaborOverhead, 0);
  const overhead = num(cfg.monthlyOverhead, DEFAULT_COST_SETTINGS.monthlyOverhead);
  const avgUnits = num(cfg.monthlyAvgProduction, DEFAULT_COST_SETTINGS.monthlyAvgProduction);
  const rate = num(cfg.laborHourlyRate, DEFAULT_COST_SETTINGS.laborHourlyRate);
  const minutes = num(cfg.laborMinutesPerUnit, DEFAULT_COST_SETTINGS.laborMinutesPerUnit);
  const overheadShare = avgUnits > 0 ? overhead / avgUnits : 0;
  const laborShare = (rate * Math.max(minutes, 0)) / 60;
  if (manual > 0) {
    return { value: +manual.toFixed(2), source: "manual", overheadShare: +overheadShare.toFixed(2), laborShare: +laborShare.toFixed(2) };
  }
  return {
    value: +(overheadShare + laborShare).toFixed(2),
    source: "auto",
    overheadShare: +overheadShare.toFixed(2),
    laborShare: +laborShare.toFixed(2),
  };
}

/* ------------------------- Ürün geliştirme sihirbazı kâr hesabı ------------------------- */

export type DevProfitInput = {
  /** KDV dahil satış fiyatı. */
  salePrice: number;
  /** KDV dahil hammadde maliyeti (seçili reçete). */
  materialCost: number;
  /** KDV dahil ambalaj maliyeti. */
  packagingCost: number;
  /** KDV dahil kargo maliyeti. */
  shippingCost: number;
  /** Komisyon/ödeme oranı (örn. PAYTR %3,9). KDV dahil satış üzerinden, tam düşülür. */
  commissionPercent: number;
  /** KDV oranı (örn. 20). */
  vatPercent: number;
  /** Adet başı işçilik + genel gider (KDV hariç; kendi emeğinde indirilecek KDV yok). */
  laborOverheadCost?: number;
};

export type DevProfit = {
  /** KDV dahil toplam maliyet (hammadde + ambalaj + kargo). */
  totalCostGross: number;
  /** KDV hariç satış (gerçek hasılat). */
  saleEx: number;
  /** KDV hariç toplam maliyet. */
  costEx: number;
  /** Satıştan tahsil edilen KDV (hesaplanan KDV). */
  outputVat: number;
  /** Alış/maliyet faturalarındaki indirilebilir KDV. */
  inputVat: number;
  /** Devlete ödenecek KDV = hesaplanan − indirilecek (vergi matrahı). */
  vatPayable: number;
  /** Komisyon/ödeme bedeli, TL. */
  commission: number;
  /** Adet başı işçilik + genel gider (KDV hariç), hesaba katılan. */
  laborOverheadCost: number;
  /** Net kâr. */
  net: number;
  /** Net kâr marjı: net / KDV hariç satış (muhasebe doğrusu). */
  margin: number;
  /** Net kâr / KDV dahil satış (kullanıcının gördüğü ciroya oran). */
  marginOnSale: number;
};

/**
 * Ürün geliştirme sihirbazının "Maliyet & Fiyat" adımı için gerçek net kâr.
 * Excel'deki hesapla birebir aynı: maliyet ve satış KDV'den arındırılır, komisyon
 * (KDV dahil satış üzerinden) düşülür. Böylece basit "satış − maliyet" yerine
 * KDV ve komisyon dahil edilmiş doğru kâr çıkar (finans modeli, calcChannelProfit
 * ile aynı mantık ailesinden).
 */
export function calcDevProfit(input: DevProfitInput): DevProfit {
  const v = 1 + input.vatPercent / 100;
  const totalCostGross = input.materialCost + input.packagingCost + input.shippingCost;
  const saleEx = input.salePrice / v;
  const costEx = totalCostGross / v;
  const outputVat = input.salePrice - saleEx;
  const inputVat = totalCostGross - costEx;
  const vatPayable = outputVat - inputVat;
  const commission = (input.salePrice * input.commissionPercent) / 100;
  const laborOverheadCost = input.laborOverheadCost ?? 0;
  const net = saleEx - costEx - commission - laborOverheadCost;
  return {
    totalCostGross,
    saleEx,
    costEx,
    outputVat,
    inputVat,
    vatPayable,
    commission,
    laborOverheadCost,
    net,
    margin: saleEx > 0 ? (net / saleEx) * 100 : 0,
    marginOnSale: input.salePrice > 0 ? (net / input.salePrice) * 100 : 0,
  };
}

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
  /** multiplier modunda çarpılan toplam maliyet. */
  totalCost: number;
  mode: PriceMode;
  value: number;
  /** targetMargin modunda kesintileri belirleyen kanal profili (zorunlu). */
  profile?: ChannelProfile;
  /** targetMargin: ürün maliyeti (hammadde + ambalaj, kargo HARİÇ). Varsayılan KDV hariç. */
  productCost?: number;
  /** Verilirse `productCost` KDV DAHİL sayılır ve bu oranla arındırılır. */
  productCostVatPercent?: number;
  /** targetMargin: adet başı işçilik + genel gider (KDV hariç), sabit maliyete eklenir. */
  extraCostEx?: number;
  /** targetMargin: profil kargosu 0 ise ürün bazlı kargo (KDV dahil). */
  shippingOverride?: number;
  rounding?: Rounding;
};

/**
 * Yeni fiyat önerisi. Geçersiz kombinasyon (örn. marj+kesintiler %100'ü aşarsa)
 * null döner — arayüz satırı "hesaplanamadı" olarak işaretler.
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
      // calcChannelProfit ile aynı model: net(P) = P·a − C.
      // Hedef marj KDV hariç satış bazında: net = (m/100)·P/(1+v) → P = C / (a − (m/100)/(1+v)).
      const p = input.profile;
      // Maliyet KDV dahil verildiyse arındır (calcChannelProfit ile aynı model).
      const cost = (input.productCost ?? 0) / (1 + (input.productCostVatPercent ?? 0) / 100);
      if (!p || cost <= 0) return null;
      const v = 1 + p.vatPercent / 100;
      const paymentShare = (p.paymentFeePercent / 100) * (p.paymentFeeVatDeductible ? 1 / v : 1);
      const a = (1 - p.stopajPercent / 100) / v - p.commissionPercent / 100 - paymentShare;
      const shippingGross = p.shippingCost > 0 ? p.shippingCost : (input.shippingOverride ?? 0);
      const fixedCosts = (p.fixedFee + shippingGross) / v + cost + (input.extraCostEx ?? 0);
      const denom = a - input.value / 100 / v;
      if (denom <= 0.0001) return null;
      raw = fixedCosts / denom;
      break;
    }
  }
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return roundPrice(raw, rounding);
}

/* ------------------------- CSV ile fiyat güncelleme ------------------------- */

export type CsvPriceRow = { key: string; price: number; line: number };

/** Basit CSV satır ayrıştırıcı: tırnaklı alanları ve ; veya , ayracını destekler. */
export function splitCsvLine(line: string, sep: string): string[] {
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
export function norm(s: string): string {
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
