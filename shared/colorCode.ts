/**
 * Renk numarası ve katalog kodu.
 *
 * ── Neden numara renge, ön ek seriye ait ──────────────────────────────────
 * Bir renk tek bir seriye ait DEĞİL: aynı yeşil hem CANDY hem METEOR altında
 * satılabiliyor (`colors.seriesId` çoğu renkte boş, "tüm seriler"). Kodu
 * doğrudan renge "CND1008" diye yazmak, o yeşilin METEOR ürününde de CANDY
 * ön ekiyle görünmesi demekti — yanlış seri, yanlış ürün.
 *
 * Bu yüzden renk yalnız bir NUMARA taşıyor (1008 = o yeşil, sonsuza kadar) ve
 * ön ek ürünün serisinden geliyor: CANDY'de CND1008, METEOR'da MTR1008. Aynı
 * ayrım internal SKU'da zaten var (`aoc` + `cnd` + renk) — kod da onu izliyor.
 *
 * Saf modül: veritabanı yok, tarayıcı yok. Hem sunucu hem istemci aynı
 * fonksiyonu çağırıyor ki kartta basılan kod ile künyedeki kod ayrışmasın.
 */

/** Katalog kodunun ön eki: harf+rakam, büyük harf. Serisiz renkte "AOC". */
export function colorCodePrefix(prefix: string | null | undefined): string {
  return (
    String(prefix ?? "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "AOC"
  );
}

/**
 * İLK renk numarası.
 *
 * 1'den değil 1001'den başlıyor: dört haneli, başında sıfır olmayan kodlar
 * ("CND1324") hem sözlü hem yazılı iletişimde okunur; "CND0001" bir sıra
 * numarası gibi durur ve müşteriye "kaçıncı ürünümüz" bilgisini sızdırır.
 */
export const FIRST_COLOR_NO = 1001;

/**
 * Katalog kodu = seri ön eki + renk numarası. "cnd" + 1008 → "CND1008"
 *
 * Numara yoksa null: kodu olmayan renk için uydurma bir kod basmak, kartta
 * hiç kod olmamasından kötü.
 */
export function formatColorCode(
  prefix: string | null | undefined,
  colorNo: number | null | undefined,
): string | null {
  if (colorNo == null || !Number.isFinite(colorNo) || colorNo <= 0) return null;
  return `${colorCodePrefix(prefix)}${String(Math.floor(colorNo)).padStart(4, "0")}`;
}

/**
 * Sıradaki renk numarası — SAYARAK DEĞİL, en büyükten devam ederek.
 *
 * Sayarak üretilseydi silinen bir renk diziyi geri alır ve daha önce
 * kullanılmış bir numara ikinci kez üretilirdi: iki farklı boya aynı kodu
 * taşır, depoda yanlış şişe kutulanır.
 *
 * Numara SERİDEN BAĞIMSIZ tek bir dizidir. Seri başına ayrı dizi tutulsaydı
 * aynı numara iki renge düşerdi (CND1008 yeşil, MTR1008 mavi) ve "1008"
 * tek başına bir şey ifade etmezdi.
 */
export function nextColorNo(existing: Array<number | null | undefined>): number {
  let max = 0;
  for (const n of existing) {
    if (n == null || !Number.isFinite(n)) continue;
    max = Math.max(max, Math.floor(n));
  }
  return max > 0 ? max + 1 : FIRST_COLOR_NO;
}

/** Kullanıcının yazdığı değerden numara: "CND1008" da "1008" de kabul. */
export function parseColorNo(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}
