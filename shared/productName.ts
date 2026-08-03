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
