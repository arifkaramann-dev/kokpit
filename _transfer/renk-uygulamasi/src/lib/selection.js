// Boya bölgesi seçimi.
//
// Kullanıcı boyanın üstüne tıklar, oradan renk benzerliğiyle bölge büyür.
// Bağlantılı büyüme (flood fill) tercih edildi: mavi bir arabanın mavi gökyüzü
// altındaki fotoğrafında global benzerlik gökyüzünü de yakalardı.
// Birden çok tohum eklenebilir — kaput, kapı, çamurluk ayrı ayrı işaretlenir.

import { rgbToLab, deltaE2000 } from './color.js';

/**
 * @param {ImageData} data
 * @param {Array<{x:number,y:number}>} seeds normalize (0..1) koordinatlar
 * @param {number} tolerance ΔE2000 eşiği
 * @returns {{mask:Uint8Array, count:number}}
 */
export function buildMask(data, seeds, tolerance = 12) {
  const { width, height } = data;
  const mask = new Uint8Array(width * height);
  if (!seeds.length) return { mask, count: 0 };

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let count = 0;

  // Lab önbelleği — deltaE2000 pahalı, her piksel için bir kez hesapla
  const labCache = new Float32Array(width * height * 3);
  const labAt = (idx) => {
    const o = idx * 3;
    if (labCache[o] === 0 && labCache[o + 1] === 0 && labCache[o + 2] === 0) {
      const p = idx * 4;
      const lab = rgbToLab({ r: data.data[p], g: data.data[p + 1], b: data.data[p + 2] });
      // 0,0,0 gerçek bir değer olabilir; L'yi asla tam 0 yapmayarak ayırt et
      labCache[o] = lab.l === 0 ? 1e-6 : lab.l;
      labCache[o + 1] = lab.a;
      labCache[o + 2] = lab.b;
    }
    return { l: labCache[o], a: labCache[o + 1], b: labCache[o + 2] };
  };

  for (const seed of seeds) {
    const sx = Math.round(seed.x * (width - 1));
    const sy = Math.round(seed.y * (height - 1));
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;

    const seedIdx = sy * width + sx;
    const seedLab = labAt(seedIdx);

    let head = 0;
    let tail = 0;
    queue[tail++] = seedIdx;
    visited[seedIdx] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const lab = labAt(idx);
      if (deltaE2000(seedLab, lab) > tolerance) continue;

      if (!mask[idx]) {
        mask[idx] = 1;
        count += 1;
      }

      const x = idx % width;
      const y = (idx / width) | 0;
      // 4-komşuluk
      if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (x < width - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (y > 0 && !visited[idx - width]) { visited[idx - width] = 1; queue[tail++] = idx - width; }
      if (y < height - 1 && !visited[idx + width]) { visited[idx + width] = 1; queue[tail++] = idx + width; }
    }

    // Sonraki tohum için ziyaret izlerini temizle, maske korunur
    visited.fill(0);
  }

  return { mask, count };
}

/** Maskeyi görsel geri bildirim için yarı saydam bir katmana çevirir. */
export function maskToOverlay(mask, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    if (mask[i]) {
      out[p] = 56;
      out[p + 1] = 189;
      out[p + 2] = 248;
      out[p + 3] = 110;
    }
  }
  return new ImageData(out, width, height);
}
