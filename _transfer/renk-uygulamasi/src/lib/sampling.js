// Fotoğraftan renk örnekleme.
// "Akıllı örnek" gölge ve parlama (specular) piksellerini eleyerek
// gövde rengine (body colour) yakın bir ortalama üretir.

import { rgbToLab, labToRgb, rgbToHex } from './color.js';

/** Bir <img> öğesini offscreen canvas'a çizip ImageData döndürür. */
export function imageToData(img, maxSide = 900) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Kaynak görselin sRGB gamutunu aşıp aşmadığını ölçer.
 *
 * Telefon fotoğrafları ve birçok web görseli artık Display P3. Onları sRGB
 * olarak okuduğumuzda doygun renkler gamut sınırında KIRPILIR — mavide
 * ~ΔE 1.3, doygun kırmızı/yeşilde ΔE 5'e kadar kroma kaybı demek.
 * Bu fonksiyon aynı görseli iki uzayda okuyup farkı raporluyor, böylece
 * ölçümün ne kadar güvenilir olduğunu biliyoruz.
 *
 * @returns {{supported:boolean, wide:boolean, maxDelta:number, clippedRatio:number}}
 */
export function detectWideGamut(img, sampleSide = 160) {
  const canProbe =
    typeof document !== 'undefined' &&
    (() => {
      try {
        const c = document.createElement('canvas');
        return c.getContext('2d', { colorSpace: 'display-p3' })?.getContextAttributes()
          .colorSpace === 'display-p3';
      } catch {
        return false;
      }
    })();

  if (!canProbe) return { supported: false, wide: false, maxDelta: 0, clippedRatio: 0 };

  const w = Math.min(sampleSide, img.naturalWidth);
  const h = Math.min(sampleSide, img.naturalHeight);

  const read = (colorSpace) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { colorSpace, willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h, { colorSpace }).data;
  };

  const srgb = read('srgb');
  const p3 = read('display-p3');

  let maxDelta = 0;
  let clipped = 0;
  let n = 0;
  for (let i = 0; i < srgb.length; i += 4) {
    n += 1;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(srgb[i + c] - p3[i + c]);
      if (d > maxDelta) maxDelta = d;
    }
    // sRGB okumasında kanal uca dayanmış ama P3'te dayanmamışsa kırpılmıştır
    const atEdge = (v) => v === 0 || v === 255;
    if (
      (atEdge(srgb[i]) && !atEdge(p3[i])) ||
      (atEdge(srgb[i + 1]) && !atEdge(p3[i + 1])) ||
      (atEdge(srgb[i + 2]) && !atEdge(p3[i + 2]))
    ) {
      clipped += 1;
    }
  }

  const clippedRatio = n ? clipped / n : 0;
  return {
    supported: true,
    // Eşik: birkaç birimlik fark yuvarlama, 6+ gerçek gamut farkı
    wide: maxDelta >= 6 || clippedRatio > 0.01,
    maxDelta,
    clippedRatio: Number(clippedRatio.toFixed(4)),
  };
}

/**
 * Belirli bir noktadan yarıçap içindeki pikselleri ortalar (nokta örnek).
 * @param {ImageData} data
 * @param {number} x normalize 0..1
 * @param {number} y normalize 0..1
 */
export function samplePoint(data, x, y, radius = 6) {
  const cx = Math.round(x * (data.width - 1));
  const cy = Math.round(y * (data.height - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= data.width || py >= data.height) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      const i = (py * data.width + px) * 4;
      if (data.data[i + 3] < 128) continue;
      r += data.data[i];
      g += data.data[i + 1];
      b += data.data[i + 2];
      n += 1;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0 };
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Akıllı ortalama: L* dağılımının uç %12'sini (gölge ve parlama) atar,
 * kalan piksellerin Lab ortalamasını alır. Doygunluğu çok düşük pikseller
 * (gri arka plan) de ağırlıklandırmadan düşürülür.
 */
export function smartAverage(data, { trim = 0.12 } = {}) {
  const pixels = [];
  const step = Math.max(1, Math.floor(Math.sqrt((data.width * data.height) / 40000)));

  for (let y = 0; y < data.height; y += step) {
    for (let x = 0; x < data.width; x += step) {
      const i = (y * data.width + x) * 4;
      if (data.data[i + 3] < 128) continue;
      const rgb = { r: data.data[i], g: data.data[i + 1], b: data.data[i + 2] };
      const lab = rgbToLab(rgb);
      const chroma = Math.hypot(lab.a, lab.b);
      pixels.push({ lab, chroma });
    }
  }
  if (!pixels.length) return { rgb: { r: 0, g: 0, b: 0 }, lab: { l: 0, a: 0, b: 0 }, count: 0 };

  pixels.sort((p, q) => p.lab.l - q.lab.l);
  const cut = Math.floor(pixels.length * trim);
  const kept = pixels.slice(cut, pixels.length - cut || pixels.length);
  const pool = kept.length ? kept : pixels;

  // Kromatik pikselleri öne çıkar — nötr arka plan sonucu bozmasın.
  const maxChroma = pool.reduce((m, p) => Math.max(m, p.chroma), 0) || 1;
  let wl = 0;
  let wa = 0;
  let wb = 0;
  let wsum = 0;
  for (const p of pool) {
    const w = 0.25 + 0.75 * (p.chroma / maxChroma);
    wl += p.lab.l * w;
    wa += p.lab.a * w;
    wb += p.lab.b * w;
    wsum += w;
  }
  const lab = { l: wl / wsum, a: wa / wsum, b: wb / wsum };
  return { rgb: labToRgb(lab), lab, count: pool.length };
}

/**
 * Gerçek sahneden çok açılı profil çıkarımı: parlaklık yüzdelik dilimlerine
 * göre face → flop geçişini örnekler. Metalik/pearl davranışın ölçüsü budur.
 */
export function extractAngleProfile(data, bands = 5) {
  const pixels = [];
  const step = Math.max(1, Math.floor(Math.sqrt((data.width * data.height) / 40000)));
  for (let y = 0; y < data.height; y += step) {
    for (let x = 0; x < data.width; x += step) {
      const i = (y * data.width + x) * 4;
      if (data.data[i + 3] < 128) continue;
      pixels.push(rgbToLab({ r: data.data[i], g: data.data[i + 1], b: data.data[i + 2] }));
    }
  }
  if (pixels.length < bands) return [];

  pixels.sort((p, q) => q.l - p.l);
  // Uç %5 specular parlamayı at.
  const start = Math.floor(pixels.length * 0.05);
  const end = Math.floor(pixels.length * 0.95);
  const pool = pixels.slice(start, end);
  const size = Math.floor(pool.length / bands) || 1;
  const angles = [15, 30, 45, 60, 75];

  return Array.from({ length: bands }, (_, k) => {
    const chunk = pool.slice(k * size, (k + 1) * size);
    const use = chunk.length ? chunk : [pool[Math.min(k, pool.length - 1)]];
    const lab = use.reduce(
      (acc, p) => ({ l: acc.l + p.l / use.length, a: acc.a + p.a / use.length, b: acc.b + p.b / use.length }),
      { l: 0, a: 0, b: 0 }
    );
    return { angle: angles[k] ?? 15 + k * 15, lab };
  });
}

/** Profilden metalik / pearl / flake tahmini üretir. */
export function estimateFinish(profile) {
  if (profile.length < 2) return { metallic: 0, pearl: 0, flake: 0, gloss: 60 };
  const face = profile[0].lab;
  const flop = profile[profile.length - 1].lab;

  const travel = face.l > 0 ? Math.max(0, (face.l - flop.l) / face.l) : 0;
  const chromaFace = Math.hypot(face.a, face.b);
  const chromaFlop = Math.hypot(flop.a, flop.b);
  const hueShift = Math.abs(chromaFace - chromaFlop) / (chromaFace || 1);

  const metallic = Math.min(1, travel * 1.6);
  const pearl = Math.min(1, hueShift * 1.2);
  const flake = Math.min(1, travel * 0.9);
  const gloss = Math.round(45 + Math.min(50, travel * 90));

  return {
    metallic: Number(metallic.toFixed(2)),
    pearl: Number(pearl.toFixed(2)),
    flake: Number(flake.toFixed(2)),
    gloss,
  };
}

export function rgbLabel(rgb) {
  return `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}`;
}

export function toHex(rgb) {
  return rgbToHex(rgb).toUpperCase();
}
