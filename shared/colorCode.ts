/**
 * Renk numarası ve katalog kodu.
 *
 * ── Kodun sahibi ÜRÜNDÜR, renk değil ──────────────────────────────────────
 * Katalog kodu tek bir alanda durmaz; iki parçadan ÜRÜN ANINDA kurulur:
 *
 *     kod = ürünün serisinin ÖN EKİ + o seride rengin NUMARASI
 *
 * Bir renk tek bir seriye ait değil: aynı yeşil hem CANDY hem METEOR altında
 * satılabiliyor. Kodu doğrudan renge "CND1008" diye yazmak, o yeşilin METEOR
 * ürününde de CANDY ön ekiyle görünmesi demekti — yanlış seri, yanlış ürün.
 *
 * ── Numara neden seri bazında olabiliyor ──────────────────────────────────
 * Önce numara TEK ve global tutuldu (1008 = o yeşil, her seride 1008). Bu,
 * kodu üreten tarafta doğru ama KATALOĞUN GERÇEĞİ değil: her serinin kendi
 * numara düzeni var (CANDY 1001'den sayar, RAL COLOUR'da numara RAL kodudur,
 * METEOR'un 1004'ü CANDY'nin 1004'ü ile aynı renk olmak zorunda değil).
 * Global tek numarayla bu kataloglar sisteme GİRİLEMİYORDU: iki seri aynı
 * numarayı kullanamıyor, RAL 3020 diye bir numara diziye hiç oturmuyordu.
 *
 * Bu yüzden numaranın iki katmanı var:
 *   1) `colors.colorNo` — rengin VARSAYILAN numarası (seri kendi numarasını
 *      söylemediğinde kullanılır),
 *   2) `seriesColorNumbers` — "bu seride bu rengin numarası şudur" (üstün gelir).
 *
 * Karar sırası tek yerde: `makeColorCodeIndex`. Kartta basılan kod ile
 * künyedeki, ilandaki ve aramadaki kod ayrışmasın diye hem sunucu hem istemci
 * aynı indeksi kullanır.
 *
 * Saf modül: veritabanı yok, tarayıcı yok.
 */

/**
 * Renksiz kalemlerin (tiner, vernik) bağlandığı sabit rengin kodu.
 *
 * Bu satır bir RENK değil, `masterProducts.colorId` NOT NULL kalabilsin diye
 * duran bir yer tutucudur; katalog kodu almaz. Toplu numara üretimi bunu
 * atlamazsa "Renksiz / Nötr" bir katalog kodu kazanıyor ve tinerin etiketine
 * renk kodu basılıyordu.
 */
export const NEUTRAL_COLOR_CODE = "notr";

/** Bu renk gerçek bir renk mi, yoksa renksiz yer tutucu mu? */
export function isNeutralColor(code: string | null | undefined): boolean {
  return String(code ?? "").trim().toLowerCase() === NEUTRAL_COLOR_CODE;
}

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
 * Hangi kümeye bakılacağı çağırana ait: varsayılan numaralar için TÜM
 * renklerin numaraları, bir serinin kendi dizisi için yalnız o serinin
 * numaraları verilir. Aynı seri içinde numara tekildir; farklı serilerin aynı
 * numarayı kullanması sorun değil — ön ek onları ayırır (CND1004 ≠ MTR1004).
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

/* ==========================================================================
 * Seri × renk numarası — kodun ürüne ait olduğu yer
 * ========================================================================== */

/** "Bu seride bu rengin numarası şudur." `seriesColorNumbers` tablosunun satırı. */
export type SeriesColorNo = { seriesId: number; colorId: number; colorNo: number };

/** Seri×renk çiftinin harita anahtarı — iki uçta da aynı biçim. */
export function seriesColorKey(seriesId: number, colorId: number): string {
  return `${seriesId}:${colorId}`;
}

export type ColorCodeIndex = {
  /** Serinin katalog ön eki ("cnd" → "CND"); seri bilinmiyorsa null. */
  prefixOf(seriesId: number | null | undefined): string | null;
  /** Yalnız serinin KENDİ numarası (varsayılana düşmez) — düzenleme ekranı için. */
  overrideOf(seriesId: number | null | undefined, colorId: number | null | undefined): number | null;
  /** Bu üründe geçerli numara: serinin kendi numarası, yoksa rengin varsayılanı. */
  colorNoOf(
    seriesId: number | null | undefined,
    colorId: number | null | undefined,
    defaultColorNo?: number | null,
  ): number | null;
  /** Bu üründe basılacak katalog kodu ("CND1008"); numara ya da seri yoksa null. */
  codeOf(
    seriesId: number | null | undefined,
    colorId: number | null | undefined,
    defaultColorNo?: number | null,
  ): string | null;
};

/**
 * Katalog kodu indeksi — kodu kimin belirlediğinin TEK cevabı.
 *
 * Ön ek ürünün serisinden, numara önce o serinin kendi kaydından, o yoksa
 * rengin varsayılan numarasından gelir. Her ekran bu indeksi kullandığı için
 * kartta, künyede, palette ve aramada aynı kod görünür; eskiden her çağrı yeri
 * `formatColorCode(prefix, color.colorNo)` diye kendi kodunu kuruyordu ve
 * serinin kendi numarasını hiçbiri bilmiyordu.
 *
 * Renk bazlı varsayılan numara `defaultColorNo` ile çağrı anında verilir:
 * indeks renk tablosunu taşımaz, çağıran zaten elinde tutar.
 */
export function makeColorCodeIndex(input: {
  series: Array<{ id: number; prefix?: string | null }>;
  overrides?: Array<SeriesColorNo> | null;
}): ColorCodeIndex {
  const prefixes = new Map<number, string | null>(
    input.series.map(s => [s.id, s.prefix ?? null]),
  );
  const overrides = new Map<string, number>();
  for (const o of input.overrides ?? []) {
    if (o?.colorNo == null || !Number.isFinite(o.colorNo)) continue;
    overrides.set(seriesColorKey(o.seriesId, o.colorId), Math.floor(o.colorNo));
  }

  const overrideOf = (seriesId: number | null | undefined, colorId: number | null | undefined) =>
    seriesId == null || colorId == null
      ? null
      : (overrides.get(seriesColorKey(seriesId, colorId)) ?? null);

  const colorNoOf = (
    seriesId: number | null | undefined,
    colorId: number | null | undefined,
    defaultColorNo?: number | null,
  ) => overrideOf(seriesId, colorId) ?? (defaultColorNo ?? null);

  return {
    prefixOf: seriesId => (seriesId == null ? null : (prefixes.get(seriesId) ?? null)),
    overrideOf,
    colorNoOf,
    codeOf: (seriesId, colorId, defaultColorNo) =>
      formatColorCode(
        seriesId == null ? null : (prefixes.get(seriesId) ?? null),
        colorNoOf(seriesId, colorId, defaultColorNo),
      ),
  };
}
