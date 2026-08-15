/**
 * Ürünün insan tarafından okunan adı (saf modül).
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * `masterProducts`ın uzun süre adı yoktu: tek kimliği `internalSku`
 * koordinatıydı (aoccndred1822ab100r2u) ve gerçek isim yalnız İLAN kaydında
 * yaşıyordu. İlanı açılmamış ürün hiçbir yerde adsız kalıyor, katalog ekranı
 * da ürün listesi değil kod listesi gibi görünüyordu.
 *
 * ── Sözleşme ──────────────────────────────────────────────────────────────
 * Ad üç kademeli düşer: elle girilmiş ad → küp koordinatından türetilen ad →
 * SKU. Türetme burada TEK yerde durur; kart, Excel, etiket ve pazaryeri
 * eşlemesi aynı fonksiyonu çağırır ki aynı ürün iki ekranda iki isimle
 * görünmesin.
 */

export type NameableProduct = {
  /** Elle girilmiş satış adı; boşsa koordinattan türetilir. */
  name?: string | null;
  series?: string | null;
  colorName?: string | null;
  family?: string | null;
  packaging?: string | null;
  readiness?: string | null;
  internalSku?: string | null;
};

/**
 * Koordinattan ad türetir: "CANDY Kırmızı — 1K Şeffaf · 100 ml".
 *
 * Eksik eksen atlanır; hiçbiri yoksa boş döner ve çağıran SKU'ya düşer.
 * Hazırlık yalnız `r2u` iken yazılır — konsantre varsayılan olduğu için her
 * ada "Konsantre" eklemek bilgi değil gürültü olurdu.
 */
export function derivedNameOf(p: NameableProduct): string {
  const head = [p.series, p.colorName].map(v => v?.trim()).filter(Boolean).join(" ");
  const tail = [p.family, p.packaging].map(v => v?.trim()).filter(Boolean).join(" · ");
  const base = [head, tail].filter(Boolean).join(" — ");
  if (!base) return "";
  return p.readiness === "r2u" ? `${base} (R2U)` : base;
}

/** Gösterilecek ad: elle girilen → türetilen → SKU. */
export function displayNameOf(p: NameableProduct): string {
  const manual = p.name?.trim();
  if (manual) return manual;
  return derivedNameOf(p) || (p.internalSku?.trim() ?? "");
}

/* --------------------------- Satış adı üretimi --------------------------- */

export const DEFAULT_BRAND = "ARTOFCOLOUR";

/**
 * Çift dilli renk adı: "FUŞYA / MAGENTA".
 *
 * ── Neden iki dil ─────────────────────────────────────────────────────────
 * Aynı boya iki müşteriye satılıyor: Türkçe arayan yerli alıcı ("fuşya boya")
 * ve İngilizce arayan/ihracat alıcısı ("magenta paint"). Tek dil yazmak
 * diğerini aramada görünmez yapıyordu.
 *
 * ── Neden eğik çizgi ──────────────────────────────────────────────────────
 * Parantezli biçim ("MAGENTA (FUŞYA)") ikinci adı DİPNOT gibi gösteriyor;
 * eğik çizgi ikisini eşit ağırlıkta tutuyor. Türkçe önde: markanın ana pazarı
 * Türkiye ve ilan başlığında ilk kelimeler aramada daha ağır basıyor.
 *
 * Tek ad varsa yalnız o yazılır — "FUŞYA / " gibi sarkan ayraç kalmaz. İki ad
 * aynıysa (Türkçesi zaten İngilizce olan "Neon", "Amber") tek kez yazılır.
 */
export function colorLabelOf(
  color: { name?: string | null; nameEn?: string | null } | null | undefined,
  opts: { upper?: boolean } = {},
): string {
  const norm = (s: string) => (opts.upper ? s.trim().toLocaleUpperCase("tr-TR") : s.trim());
  const tr = color?.name?.trim() ? norm(color.name) : "";
  const en = color?.nameEn?.trim() ? norm(color.nameEn) : "";
  if (!tr) return en;
  if (!en) return tr;
  return tr.toLocaleUpperCase("tr-TR") === en.toLocaleUpperCase("tr-TR") ? tr : `${tr} / ${en}`;
}

export type SalesNameInput = {
  brand?: string | null;
  /** Serinin satış karşılığı — "CANDY PAINT". Boşsa serinin kendi adı. */
  seriesNameEn?: string | null;
  seriesName?: string | null;
  /** Rengin uluslararası adı — "MAGENTA". Boşsa yalnız Türkçe yazılır. */
  colorNameEn?: string | null;
  colorName?: string | null;
  family?: string | null;
  packaging?: string | null;
  readiness?: string | null;
};

/**
 * Pazaryeri/etiket satış adını kurar.
 *
 *   ARTOFCOLOUR CANDY PAINT FUŞYA / MAGENTA - AİRBRUSH 100 ML
 *   └ marka    └ seri        └ renk TR / EN   └ form   └ ambalaj
 *
 * Türkçe büyük harf kuralı uygulanır ("Airbrush" → "AİRBRUSH"), çünkü ad
 * etikete ve pazaryeri kartına gidiyor; "AIRBRUSH" yazmak Türkçe bir markada
 * yanlış görünür.
 *
 * R2U eki bilinçli: hazırlık ekseni koordinatın parçası, yani aynı renk ve
 * ambalajın konsantre ve kullanıma-hazır hâli AYRI ürün. Ek olmasaydı ikisi
 * aynı adı alır ve pazaryerinde birbirine karışırdı.
 *
 * Eksik parça atlanır — hiçbir alan zorunlu değil, ad yine de kurulur.
 */
export function salesNameOf(p: SalesNameInput): string {
  const up = (s: string) => s.trim().toLocaleUpperCase("tr-TR");
  const part = (v: string | null | undefined) => (v?.trim() ? up(v) : "");

  // Çift dilli ad kuralı tek yerde: kart, etiket ve palet de aynı biçimi
  // basıyor (bkz. `colorLabelOf`).
  const color = colorLabelOf({ name: p.colorName, nameEn: p.colorNameEn }, { upper: true });

  const head = [
    part(p.brand?.trim() || DEFAULT_BRAND),
    part(p.seriesNameEn?.trim() || p.seriesName),
    color,
  ]
    .filter(Boolean)
    .join(" ");

  const tail = [part(p.family), part(p.packaging), p.readiness === "r2u" ? "R2U" : ""]
    .filter(Boolean)
    .join(" ");

  if (!head) return tail;
  return tail ? `${head} - ${tail}` : head;
}
