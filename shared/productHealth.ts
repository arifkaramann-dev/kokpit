/**
 * Ürün sağlık skoru (Faz A5): kartın pazaryerine/satışa hazırlık yüzdesi.
 * Saf fonksiyon — hem istemcide rozet, hem sunucuda gönderim ön-kontrolü kullanır.
 */

export type ProductHealthInput = {
  barcode: string | null;
  sku: string | null;
  salePrice: string | number;
  category: string | null;
  desi: string | number | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  packaging: string | null;
  labelText: string | null;
  usageGuide: string | null;
  /** DB'de yüklü görsel VAR mı (productImages) veya harici link listesi dolu mu. */
  hasImage: boolean;
};

export type ProductHealth = {
  /** 0-100 tamamlanma yüzdesi. */
  score: number;
  /** Eksik alanların Türkçe adları (rozet başlığında gösterilir). */
  missing: string[];
  /** Pazaryerine ürün kartı açmak için zorunlu eksikler (Faz C ön şartı). */
  missingRequired: string[];
};

const filled = (v: string | number | null | undefined): boolean => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== "" && s !== "0" && s !== "0.00" && s !== "0,00";
};

/** Kontrol listesi: [etiket, dolu mu, pazaryeri için zorunlu mu]. */
function checks(p: ProductHealthInput): Array<[string, boolean, boolean]> {
  return [
    ["Barkod", filled(p.barcode), true],
    ["SKU", filled(p.sku), true],
    ["Satış fiyatı", filled(p.salePrice), true],
    ["Görsel", p.hasImage, true],
    ["Kategori", filled(p.category), true],
    ["Desi", filled(p.desi), true],
    ["Kısa açıklama", filled(p.shortDescription), true],
    ["Uzun açıklama", filled(p.longDescription), true],
    ["Ambalaj", filled(p.packaging), false],
    ["Uygulama metni", filled(p.applicationText), false],
    ["Etiket yazısı", filled(p.labelText), false],
    ["Kullanım kılavuzu", filled(p.usageGuide), false],
  ];
}

export function productHealth(p: ProductHealthInput): ProductHealth {
  const list = checks(p);
  const done = list.filter(([, ok]) => ok).length;
  const missing = list.filter(([, ok]) => !ok).map(([label]) => label);
  const missingRequired = list.filter(([, ok, req]) => !ok && req).map(([label]) => label);
  return {
    score: Math.round((done / list.length) * 100),
    missing,
    missingRequired,
  };
}

/** JSON dizi string'i ("[\"url\"]") en az bir eleman içeriyor mu? */
export function jsonListHasItems(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}
