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

import { rgbToLab, type Lab } from "./color";
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

/** Uyarlanabilir toleransın inebileceği en düşük değer. */
const MIN_TOLERANCE = 6;

/**
 * Fonun kendi düzgünlüğünden tolerans türetir.
 *
 * ── Neden gerekli ─────────────────────────────────────────────────────────
 * Sabit tolerans iki durumu aynı anda karşılayamıyor:
 *   - gradyanlı stüdyo fonu  → GENİŞ tolerans ister, yoksa zincir kopar
 *   - parlak gümüş numune    → DAR tolerans ister, yoksa dolgu objeye sızar
 *
 * İkincisi sessiz ve pahalı bir hata: gümüş bazın parlak üst kenarı beyaz
 * fona yeterince yakın olduğunda dolgu objenin içine giriyor, o bölge "fon"
 * sayılıyor ve hiç boyanmıyor. Sonuç, numunenin ortasında kocaman beyaz bir
 * leke — üstelik hiçbir yerde hata görünmüyor.
 *
 * Çözüm toleransı fondan ölçmek: kenar şeridi ne kadar tekdüzeyse tolerans o
 * kadar dar olur. Düz beyaz fonlu bir çekimde dolgu objeye giremez; gradyanlı
 * fonda ise ölçülen yayılma kadar genişler ve zincir yine kopmaz.
 */
function borderTolerance(src: Raster, cap: number): number {
  const { data, width: w, height: h } = src;
  let lo = 255;
  let hi = 0;
  const seen = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    if (data[p + 3] < 8) return;
    for (let c = 0; c < 3; c += 1) {
      const v = data[p + c];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) {
    seen(x, 0);
    seen(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    seen(0, y);
    seen(w - 1, y);
  }
  if (hi < lo) return cap;
  // Ölçülen yayılmanın TAMAMI + küçük bir pay.
  //
  // Yarısını almak yetmiyor: gradyanlı bir fonda zincir, tohum köşesinden
  // uzaklaştıkça yayılmanın tamamı kadar sapar ve yarı tolerans zinciri
  // ortada kopar. Üst sınır yine istenen değer.
  return Math.max(MIN_TOLERANCE, Math.min(cap, hi - lo + MIN_TOLERANCE));
}

/**
 * Fonu bulur ve obje maskesini üretir. Girdi DEĞİŞTİRİLMEZ.
 *
 * @param src        RGBA raster
 * @param tolerance  tohum rengine kanal başına ortalama sapma toleransı
 */
export function extractSubjectMask(src: Raster, tolerance = 26): SubjectMask {
  const { data, width: w, height: h } = src;
  // İstenen tolerans bir ÜST SINIR; gerçek değer fonun düzgünlüğünden gelir.
  const tol = borderTolerance(src, tolerance);
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
      if (!transparent && diff > tol * 3) continue;

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

/**
 * Obje bölgesinin baskın rengini ölçer.
 *
 * ── Neden ortalama değil ──────────────────────────────────────────────────
 * Bir boya fotoğrafında obje bölgesi parlak tepe noktasından koyu gölgeye
 * kadar uzanır. Bu aralığın DÜZ ORTALAMASI gölge ağırlıklı çıkar ve renk
 * kartında göreceğin renk olmaz. Üstelik specular parlama boyanın değil
 * ışığın rengidir; ortalamaya karışınca rengi beyaza doğru soldurur.
 *
 * Onun yerine:
 *   üst %4      → specular, atılır
 *   L* kovaları → her piksel kendi kovasının yoğunluğuyla ağırlıklanır
 *
 * Davranış kendiliğinden doğru tarafa gider: geniş düz bir yüzey varsa o
 * kovanın ağırlığı baskın olur ve plato rengi kazanır; dağılım düzse tüm
 * ağırlıklar eşitlenir ve sonuç ortalamaya iner.
 *
 * ── Nerede kullanılıyor ───────────────────────────────────────────────────
 * Katalogdaki her rengin hex kodu tanımlı değil. Boyanın fotoğrafı varken
 * "hedef renk yok" demek yerine ölçüyoruz; böylece üretilen görselin rengi
 * fotoğraftaki boyaya oturtulabiliyor.
 *
 * @returns bölge çok küçükse `null` — uydurma bir renk döndürmek, renk
 *          düzeltmesini sessizce yanlış hedefe çalıştırmak olurdu.
 */
export function measureSubjectLab(
  src: Raster,
  mask: Uint8Array,
  { binSize = 1.5, sharpness = 2 }: { binSize?: number; sharpness?: number } = {},
): Lab | null {
  const { data } = src;
  const labs: Lab[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    if (data[p + 3] < 128) continue;
    labs.push(rgbToLab({ r: data[p], g: data[p + 1], b: data[p + 2] }));
  }
  if (labs.length < 100) return null;

  labs.sort((a, b) => a.l - b.l);
  // Specular parlama boyanın değil ışığın rengi — ağırlıklandırmadan önce at.
  const pool = labs.slice(0, Math.max(1, Math.floor(labs.length * 0.96)));

  const lo = pool[0].l;
  const hi = pool[pool.length - 1].l;
  const span = hi - lo;
  if (span < binSize) return meanLab(pool);

  const binCount = Math.ceil(span / binSize) + 1;
  const bins = new Int32Array(binCount);
  const binOf = (v: Lab) => Math.min(binCount - 1, Math.floor((v.l - lo) / binSize));
  for (const v of pool) bins[binOf(v)] += 1;

  let maxCount = 1;
  for (let i = 0; i < bins.length; i += 1) if (bins[i] > maxCount) maxCount = bins[i];

  let wl = 0;
  let wa = 0;
  let wb = 0;
  let wsum = 0;
  for (const v of pool) {
    const w = Math.pow(bins[binOf(v)] / maxCount, sharpness);
    wl += v.l * w;
    wa += v.a * w;
    wb += v.b * w;
    wsum += w;
  }
  if (wsum <= 0) return meanLab(pool);
  return { l: wl / wsum, a: wa / wsum, b: wb / wsum };
}

function meanLab(labs: readonly Lab[]): Lab {
  const n = labs.length;
  return {
    l: labs.reduce((a, x) => a + x.l, 0) / n,
    a: labs.reduce((a, x) => a + x.a, 0) / n,
    b: labs.reduce((a, x) => a + x.b, 0) / n,
  };
}
