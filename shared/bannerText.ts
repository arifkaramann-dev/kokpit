/**
 * Banner metninin temizliği.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * İlan metinleri BİLEREK değişkenli yazılıyor ({{renk}}, {{ambalaj}}): tek
 * metin o serideki bütün renk ve ambalaj varyantlarını dolduruyor. Banner ise
 * TEK bir serinin karesi — değişkene ihtiyacı yok ve doldurulacağı bir yer de
 * yok. İki istem birbirine karışınca banner'a ham "{{seri}} ile derinlik ve
 * canlılık" basıldı; müşterinin gördüğü karede yarım kalmış bir şablon.
 *
 * Bu yüzden temizlik İKİ yerde çalışıyor: üretim anında (kaydedilen metin
 * temiz olsun) ve çizim anında (daha önce kaydedilmiş bozuk metinler de
 * düzelsin, kullanıcı hepsini yeniden üretmek zorunda kalmasın).
 *
 * Bilinen değişken gerçek değeriyle DOLDURULUYOR, bilinmeyen atılıyor —
 * metni tümden çöpe atmaktansa kurtarmak doğru.
 *
 * Saf modül: veritabanı yok, tarayıcı yok, ağ yok.
 */

export function fillBannerVars(
  text: string | null | undefined,
  seriesName: string | null | undefined,
): string {
  return String(text ?? "")
    .replace(/\{\{\s*seri\s*\}\}/gi, String(seriesName ?? "").trim())
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
