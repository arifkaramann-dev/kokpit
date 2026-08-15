/**
 * Seri × renk KAPSAMI — "bu renk hangi serilerde üretilir".
 *
 * Kural üç kaynaktan geliyordu ve her ekran kendi yorumunu yazıyordu:
 *   1) `seriesColors` — açık bağ ("CANDY'de şu 12 renk üretilir"),
 *   2) `colors.seriesId` — eski, tek seriye kilitli renk (RAL kodları),
 *   3) hiçbiri yoksa "tüm renkler".
 *
 * Sonuç: Tanımlar ekranı `colors.seriesId` boş diye her renge "tüm seriler"
 * yazıyordu, oysa üretim planlayıcısı `seriesColors` bağına bakıp o rengi o
 * seride hiç üretmiyordu. Ekran ile üretim aynı soruya iki farklı cevap
 * veriyordu. Kural artık tek yerde ve iki uç da buradan soruyor.
 *
 * Saf modül: veritabanı yok, tarayıcı yok.
 */

export type ScopeColor = { id: number; seriesId?: number | null };
export type ScopeLink = { seriesId: number; colorId: number };

/**
 * Bir serinin renkleri.
 *
 * Açık bağ varsa YALNIZ o renkler üretilir. Bağ yoksa eski kural işler: seriye
 * özel renkler + hiçbir seriye kilitli olmayanlar (pratikte "hepsi").
 */
export function colorsForSeries<T extends ScopeColor>(input: {
  seriesId: number;
  colors: T[];
  /** `seriesColors` bağları — yalnız bu seriye ait olanlar da verilebilir. */
  links: ScopeLink[];
}): T[] {
  const explicit = new Set(
    input.links.filter(l => l.seriesId === input.seriesId).map(l => l.colorId),
  );
  if (explicit.size > 0) return input.colors.filter(c => explicit.has(c.id));
  return input.colors.filter(c => c.seriesId == null || c.seriesId === input.seriesId);
}

/**
 * Bir rengin serileri — `colorsForSeries`'in tersi, aynı kuralla.
 *
 * Katalog kodu seriye göre değiştiği için bu liste "bu rengin kaç kodu var"
 * sorusunun da cevabı: her seri o renge kendi numarasını verebilir.
 */
export function seriesForColor<S extends { id: number }>(input: {
  color: ScopeColor;
  series: S[];
  links: ScopeLink[];
}): S[] {
  return input.series.filter(s =>
    colorsForSeries({ seriesId: s.id, colors: [input.color], links: input.links }).length > 0,
  );
}
