/**
 * Beyaz fondan temiz kesim — "hâle" sorununun çözümü.
 *
 * ── Sorun ─────────────────────────────────────────────────────────────────
 * Fonu silmek için maskeyi doğrudan alfaya yazmak yetmiyor. Objenin kenarı
 * yumuşaktır: o piksellerin rengi objenin değil, objeyle BEYAZ FONUN
 * karışımıdır. Maske ikili (0/1) olduğu için bu karışık pikseller ya tamamen
 * atılıyor (tırtıklı kenar) ya tamamen kalıyor — ikincisi olduğunda koyu
 * zeminde objenin çevresinde soluk beyaz bir kontur, yani HÂLE görünüyor.
 *
 * ── Çözüm: üç adım ────────────────────────────────────────────────────────
 * 1) AŞINDIR (erode) — kenardaki karışık şeridi maskeden çıkar. Hâleyi
 *    oluşturan pikseller tam olarak bunlar.
 * 2) YUMUŞAT (feather) — alfayı birkaç piksel boyunca 0'a indir. Sert kesim
 *    büyütülünce tırtıklı, "kesilmiş kağıt" gibi durur.
 * 3) BEYAZI SÖK (unmatte) — yarı saydam kalan piksellerde fonun katkısını
 *    matematikle geri al. Gözlenen renk C = α·F + (1−α)·B ise gerçek renk
 *    F = (C − (1−α)·B) / α. Bu adım olmadan yumuşak kenar hâlâ beyaza çalar;
 *    yalnız aşındırmak kenarı inceltir ama rengini düzeltmez.
 *
 * ── Neden ayrı modül ──────────────────────────────────────────────────────
 * Saf: canvas yok, tarayıcı yok. Küçük rasterlerle test edilebiliyor —
 * "hâle kalmıyor mu" sorusunun cevabı gözle değil testle veriliyor.
 */

import type { Raster } from "./recolor";

export type MatteOptions = {
  /** Kenardan atılacak karışık şerit (piksel). */
  erode?: number;
  /** Alfanın 0'a inerken yayılacağı mesafe (piksel). */
  feather?: number;
  /** Fonun rengi — beyaz fon için 255. */
  background?: number;
};

/** Ölçüden makul aşındırma/yumuşatma yarıçapı: küçük karede 1px, büyükte daha çok. */
export function matteRadius(width: number, height: number): { erode: number; feather: number } {
  const base = Math.min(width, height);
  return {
    erode: Math.max(1, Math.round(base * 0.004)),
    feather: Math.max(1, Math.round(base * 0.003)),
  };
}

/** Ayrılabilir en-küçük süzgeç (aşındırma) — yatay sonra dikey. */
function erodeAlpha(alpha: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return alpha;
  const tmp = new Float32Array(alpha.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let min = 1;
      for (let d = -r; d <= r; d += 1) {
        const xx = Math.min(w - 1, Math.max(0, x + d));
        const v = alpha[y * w + xx];
        if (v < min) min = v;
        if (min === 0) break;
      }
      tmp[y * w + x] = min;
    }
  }
  const out = new Float32Array(alpha.length);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let min = 1;
      for (let d = -r; d <= r; d += 1) {
        const yy = Math.min(h - 1, Math.max(0, y + d));
        const v = tmp[yy * w + x];
        if (v < min) min = v;
        if (min === 0) break;
      }
      out[y * w + x] = min;
    }
  }
  return out;
}

/** Ayrılabilir kutu bulanıklığı (yumuşatma). */
function blurAlpha(alpha: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return alpha;
  const win = r * 2 + 1;
  const tmp = new Float32Array(alpha.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let d = -r; d <= r; d += 1) {
        sum += alpha[y * w + Math.min(w - 1, Math.max(0, x + d))];
      }
      tmp[y * w + x] = sum / win;
    }
  }
  const out = new Float32Array(alpha.length);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      for (let d = -r; d <= r; d += 1) {
        sum += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      }
      out[y * w + x] = sum / win;
    }
  }
  return out;
}

/**
 * Maskeyi temiz bir alfa kanalına çevirir ve fonun rengini pikselden söker.
 *
 * `raster` YERİNDE değiştirilir (RGBA). Maske `1` = obje.
 */
export function knockoutBackgroundRaster(
  raster: Raster,
  mask: Uint8Array,
  opts: MatteOptions = {},
): void {
  const { width: w, height: h, data } = raster;
  const auto = matteRadius(w, h);
  const erode = opts.erode ?? auto.erode;
  const feather = opts.feather ?? auto.feather;
  const bg = opts.background ?? 255;

  const solid = new Float32Array(w * h);
  for (let i = 0; i < solid.length; i += 1) solid[i] = mask[i] ? 1 : 0;
  const alpha = blurAlpha(erodeAlpha(solid, w, h, erode), w, h, feather);

  for (let i = 0; i < alpha.length; i += 1) {
    const a = alpha[i];
    const p = i * 4;
    if (a <= 0.004) {
      data[p + 3] = 0;
      continue;
    }
    if (a < 0.999) {
      // Fonun katkısını geri al — yoksa yumuşak kenar beyaza çalar ve hâle
      // inceldiği hâlde kaybolmaz.
      for (let c = 0; c < 3; c += 1) {
        const v = (data[p + c] - (1 - a) * bg) / a;
        data[p + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
    data[p + 3] = Math.round(a * 255);
  }
}
