/**
 * Ölçü birimi dönüşümü — maliyetin doğru çıkmasının ön koşulu.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * Reçete satırı bugüne kadar BİRİMSİZ bir sayıydı: `qtyPerBase = 250`. Hangi
 * birim olduğu hiçbir yerde yazmıyordu, kod da onu sessizce "kalemin kendi
 * birimi" sayıp doğrudan `unitCost` ile çarpıyordu.
 *
 * Boyacı gram düşünür, satın alma kilo alır. Pigment stoğa `kg` olarak ₺500
 * girildiğinde ve reçeteye (gram kastedilerek) 250 yazıldığında hesap
 * 250 × 500 = ₺125.000 çıkıyordu; doğrusu 0,25 kg × 500 = ₺125. Tam 1000 kat.
 * Katalogdaki "100 ml boya ₺124.500" rakamının kaynağı buydu.
 *
 * Çözüm miktarı birimiyle birlikte saklamak: "250 gr", kalem kg cinsinden
 * fiyatlansa bile doğru çevrilir.
 *
 * ── Sözleşme ──────────────────────────────────────────────────────────────
 * Aynı aileden olmayan birimler ÇEVRİLMEZ (gr → ml gibi); yoğunluk bilgisi
 * gerektirir ve onu uydurmak sessiz bir maliyet hatası üretir. Böyle bir
 * durumda `null` döner, çağıran taraf bunu kullanıcıya "birim uyuşmuyor"
 * diye bildirir — sayıyı sessizce yanlış hesaplamaktansa görünür bırakır.
 *
 * Saf modül: veritabanı, tarih, rastgelelik yok.
 */

export type UnitFamily = "kutle" | "hacim" | "adet";

type UnitDef = {
  /** Kanonik kod — UI ve veritabanı bu kodu yazar. */
  code: string;
  family: UnitFamily;
  /** Ailenin taban birimine çarpan (kütle: gr, hacim: ml, adet: adet). */
  factor: number;
  label: string;
};

/**
 * Desteklenen birimler. Taban birimler kasten `gr` ve `ml`: şirketin reçete
 * defteri bu ikisiyle yazılıyor, tabanı oraya koymak yuvarlama hatasını
 * en sık kullanılan yolda sıfırlar.
 */
const UNIT_DEFS: UnitDef[] = [
  { code: "mg", family: "kutle", factor: 0.001, label: "miligram" },
  { code: "gr", family: "kutle", factor: 1, label: "gram" },
  { code: "kg", family: "kutle", factor: 1000, label: "kilogram" },
  { code: "ml", family: "hacim", factor: 1, label: "mililitre" },
  { code: "cl", family: "hacim", factor: 10, label: "santilitre" },
  { code: "lt", family: "hacim", factor: 1000, label: "litre" },
  { code: "adet", family: "adet", factor: 1, label: "adet" },
];

/**
 * Yazım varyantları → kanonik kod. Kullanıcı "KG", "Kilogram", "L" yazabilir;
 * hepsi aynı kaleme gitmeli yoksa dönüşüm sessizce başarısız olur.
 */
const ALIASES: Record<string, string> = {
  mg: "mg",
  miligram: "mg",
  g: "gr",
  gr: "gr",
  gram: "gr",
  grm: "gr",
  kg: "kg",
  kilo: "kg",
  kilogram: "kg",
  ml: "ml",
  mililitre: "ml",
  cc: "ml",
  cl: "cl",
  santilitre: "cl",
  l: "lt",
  lt: "lt",
  litre: "lt",
  liter: "lt",
  adet: "adet",
  ad: "adet",
  tane: "adet",
  pcs: "adet",
  parca: "adet",
};

const BY_CODE = new Map(UNIT_DEFS.map(u => [u.code, u]));

/**
 * Serbest metni kanonik birim koduna indirger; tanınmazsa boş dize döner.
 *
 * Türkçe yerel küçültme BİLEREK kullanılmıyor: `"I".toLocaleLowerCase("tr")`
 * noktasız `ı` üretir ve "LT" gibi kodları bozabilir. Birim kodları ASCII.
 */
export function normalizeUnit(raw: unknown): string {
  if (raw == null) return "";
  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[.\s]/g, "");
  if (!key) return "";
  return ALIASES[key] ?? (BY_CODE.has(key) ? key : "");
}

/** Birimin ailesi — tanınmayan birimde `null`. */
export function unitFamily(raw: unknown): UnitFamily | null {
  const code = normalizeUnit(raw);
  return code ? (BY_CODE.get(code)?.family ?? null) : null;
}

/**
 * `from` cinsinden bir miktarı `to` cinsine çevirmek için çarpan.
 *
 * - Birimler aynıysa 1 (tanınmayan ama birebir eşit birimler de buradan geçer;
 *   kullanıcının kendi uydurduğu bir birimi cezalandırmanın anlamı yok).
 * - Aileler farklıysa ya da biri tanınmıyorsa `null`.
 */
export function conversionFactor(from: unknown, to: unknown): number | null {
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);

  if (!a || !b) {
    // İkisi de tanınmıyor ama metin olarak aynıysa dönüşüm gerekmiyor.
    const rawA = String(from ?? "").trim().toLowerCase();
    const rawB = String(to ?? "").trim().toLowerCase();
    return rawA !== "" && rawA === rawB ? 1 : null;
  }
  if (a === b) return 1;

  const defA = BY_CODE.get(a)!;
  const defB = BY_CODE.get(b)!;
  if (defA.family !== defB.family) return null;

  return defA.factor / defB.factor;
}

/** Miktarı çevirir; çevrilemiyorsa `null`. */
export function convertQty(qty: number, from: unknown, to: unknown): number | null {
  const factor = conversionFactor(from, to);
  if (factor == null) return null;
  return qty * factor;
}

/**
 * Reçete/ambalaj satırının miktarını kalemin kendi birimine indirger.
 *
 * Geriye dönük uyum: satırda birim yoksa (eski kayıtlar) miktar zaten kalemin
 * biriminde kabul edilir — eski davranış birebir korunur.
 *
 * Çevrilemeyen durumda sayı DEĞİŞTİRİLMEZ, yalnız `mismatch` işaretlenir.
 * Böylece ekran "bu satırın birimi uyuşmuyor" diyebilir; sessizce sıfırlamak
 * ya da uydurma bir katsayı uygulamak maliyeti daha da yanlış yapardı.
 */
export function qtyInMaterialUnit(
  qty: number,
  lineUnit: unknown,
  materialUnit: unknown,
): { qty: number; mismatch: boolean } {
  const line = normalizeUnit(lineUnit);
  if (!line) return { qty, mismatch: false };

  const factor = conversionFactor(line, materialUnit);
  if (factor == null) return { qty, mismatch: true };
  return { qty: qty * factor, mismatch: false };
}

/** UI için birim listesi (kanonik kodlar). */
export const UNIT_CODES = UNIT_DEFS.map(u => u.code);

/** Bir kalemin birimiyle aynı ailedeki birimler — satır seçicisini besler. */
export function compatibleUnits(materialUnit: unknown): string[] {
  const family = unitFamily(materialUnit);
  if (!family) {
    const code = normalizeUnit(materialUnit);
    return code ? [code] : [];
  }
  return UNIT_DEFS.filter(u => u.family === family).map(u => u.code);
}
