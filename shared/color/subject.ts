/**
 * Fon ayıklama ve obje maskesi — yeniden renklendirmenin nereye uygulanacağı.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * `recolorRegion` bir maske ister: hangi pikseller boya, hangileri değil.
 * Numune master'ı beyaz fonlu bir ürün çekimidir, yani maske "fon olmayan her
 * şey"dir. Fonu bulmak da onu ayıklamakla aynı iş olduğu için ikisi tek
 * geçişte yapılır.
 *
 * ── Neden köşeden taşma dolgusu ───────────────────────────────────────────
 * "Beyaza yakın olanı fon say" kuralı iki yerde bozulur: stüdyo fonu çoğu
 * zaman hafif gradyanlıdır (koyu ucu obje sanılır) ve objenin kendi parlama
 * lekesi beyaza yakındır (fon sanılıp delinir).
 *
 * Bunun yerine köşelerden başlayıp KOMŞULUK ZİNCİRİ boyunca ilerliyoruz:
 * tohum rengine yakın komşular fona katılır. Gradyan boyunca zincir kopmaz,
 * objenin içindeki parlama ise fona bitişik olmadığı için hiç ziyaret
 * edilmez. Objeye geçişte renk farkı eşiği aşar ve dolgu kendiliğinden durur.
 *
 * Köşe koyuysa orada fon değil obje vardır — o köşeden dolgu başlatılmaz,
 * yoksa objenin yarısı silinirdi.
 *
 * Saf modül: veritabanı, tarih, rastgelelik, tarayıcı API'si yok. Canvas'a
 * bağlı olmadığı için sunucuda ve testte de koşar.
 */

import type { Raster } from "./recolor";

export type SubjectMask = {
  /** 1 = obje (boyanacak), 0 = fon. `width * height` uzunluğunda. */
  mask: Uint8Array;
  /** Fon sayılan piksel adedi. */
  background: number;
  /** Obje sayılan piksel adedi. */
  subject: number;
  /**
   * Hiçbir köşeden dolgu başlatılamadı — görselin fonu ya koyu ya da dört
   * köşesi de objeyle dolu. Maske "her şey obje" olur; çağıran tarafın bunu
   * kullanıcıya bildirmesi gerekir, çünkü sonuç muhtemelen istenen değildir.
   */
  noBackgroundFound: boolean;
};

/** Köşenin fon tohumu olabilmesi için gereken asgari parlaklık. */
const MIN_CORNER_LUMA = 170;

/**
 * Fonu bulur ve obje maskesini üretir. Girdi DEĞİŞTİRİLMEZ.
 *
 * @param src        RGBA raster
 * @param tolerance  tohum rengine kanal başına ortalama sapma toleransı
 */
export function extractSubjectMask(src: Raster, tolerance = 26): SubjectMask {
  const { data, width: w, height: h } = src;
  const count = w * h;
  const isBackground = new Uint8Array(count);
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);

  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  let background = 0;
  let seeded = false;

  for (const [cx, cy] of corners) {
    const start = cy * w + cx;
    if (visited[start]) continue;

    const s = start * 4;
    const sr = data[s];
    const sg = data[s + 1];
    const sb = data[s + 2];
    const sa = data[s + 3];

    // Saydam köşe zaten fondur; opak ve koyu köşede obje vardır.
    const luma = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
    if (sa > 8 && luma < MIN_CORNER_LUMA) continue;
    seeded = true;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const p = idx * 4;

      const transparent = data[p + 3] < 8;
      const diff =
        Math.abs(data[p] - sr) + Math.abs(data[p + 1] - sg) + Math.abs(data[p + 2] - sb);
      if (!transparent && diff > tolerance * 3) continue;

      isBackground[idx] = 1;
      background += 1;

      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (y > 0 && !visited[idx - w]) { visited[idx - w] = 1; queue[tail++] = idx - w; }
      if (y < h - 1 && !visited[idx + w]) { visited[idx + w] = 1; queue[tail++] = idx + w; }
    }
  }

  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) mask[i] = isBackground[i] ? 0 : 1;

  return {
    mask,
    background,
    subject: count - background,
    noBackgroundFound: !seeded,
  };
}

/**
 * Fon piksellerini saf beyaza çeker. Girdi YERİNDE değiştirilir.
 *
 * Kart fonu beyaz olduğu için gri-beyaz bir numune fonu kartın üstünde kutu
 * gibi durur. Maskeyi zaten çıkardığımıza göre boyamak bedava.
 */
export function whitenBackground(src: Raster, mask: Uint8Array): void {
  const { data } = src;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) continue;
    const p = i * 4;
    data[p] = 255;
    data[p + 1] = 255;
    data[p + 2] = 255;
    data[p + 3] = 255;
  }
}
