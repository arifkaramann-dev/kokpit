// Görsel yeniden renklendirme.
//
// Amaç: hazır bir görseldeki (AI üretimi, stüdyo fotoğrafı, render — fark
// etmez) bir bölgenin rengini, o bölgenin AYDINLATMA YAPISINI bozmadan
// hedef boyayla değiştirmek.
//
// Neden blend mode değil: "multiply / overlay" ile renk katmanı bindirmek
// düz boyada idare eder ama metalikte sahte durur, çünkü gölgeyi ve parlamayı
// aynı oranda boyar. Gerçekte parlama noktası boyanın rengi değil IŞIĞIN
// rengidir — orada yüzey beyaza gider.
//
// Yöntem: bölgeyi Lab'a çevir, L* yapısını (gölge, parlama, doku) aynen
// koru, a/b'yi hedeften al. Sonra iki düzeltme:
//   1. L* dağılımını hedef boyanın açıklığına kaydır
//   2. Parlama bölgesinde kromayı söndür — ışık beyazdır, boya değil

import { rgbToLab, labToRgb } from './color.js';

/** 0..1 aralığında yumuşak geçiş. */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {ImageData} data      kaynak görsel (yerinde DEĞİŞTİRİLMEZ)
 * @param {Uint8Array} mask     boyanacak bölge, 1 = boya
 * @param {{l:number,a:number,b:number}} targetLab  hedef boyanın face rengi
 * @param {object} [opts]
 * @param {number} [opts.amount=1]           karışım oranı (0 = dokunma)
 * @param {number} [opts.specularStart=78]   kromanın sönmeye başladığı L*
 * @param {number} [opts.preserveContrast=1] L* varyasyonunun korunma oranı
 * @returns {ImageData} yeni görsel
 */
export function recolorRegion(data, mask, targetLab, opts = {}) {
  const { amount = 1, specularStart = 78, preserveContrast = 1 } = opts;

  const out = new ImageData(
    new Uint8ClampedArray(data.data),
    data.width,
    data.height
  );
  if (!mask) return out;

  // 1) Bölgenin mevcut L* dağılımını çıkar.
  const lightness = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    lightness.push(
      rgbToLab({ r: data.data[p], g: data.data[p + 1], b: data.data[p + 2] }).l
    );
  }
  if (!lightness.length) return out;

  // Referans olarak medyan değil, gölge ve parlamayı dışlayan bir orta bant.
  // Ortalama kullanırsak tek bir parlak leke bütün kaydırmayı bozar.
  lightness.sort((a, b) => a - b);
  const lo = lightness[Math.floor(lightness.length * 0.35)];
  const hi = lightness[Math.floor(lightness.length * 0.75)];
  const bodyL = (lo + hi) / 2;

  // Hedef boyanın açıklığına oturtacak kaydırma
  const shift = targetLab.l - bodyL;

  // 2) Piksel piksel uygula
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    const src = rgbToLab({ r: data.data[p], g: data.data[p + 1], b: data.data[p + 2] });

    // L*: yapıyı koru, hedefin açıklığına kaydır.
    // preserveContrast < 1 ise varyasyon gövde etrafında sıkıştırılır.
    const varied = bodyL + (src.l - bodyL) * preserveContrast;
    let l = varied + shift;
    l = Math.max(0, Math.min(100, l));

    // Kroma: parlama bölgesinde söndür. Specular yansıma ışığın rengidir,
    // boyanın değil — orada gerçek yüzey de beyaza gider.
    const specular = smoothstep(specularStart, 100, src.l);
    const chromaScale = 1 - specular;

    const a = targetLab.a * chromaScale;
    const b = targetLab.b * chromaScale;

    const recolored = labToRgb({ l, a, b });

    // amount ile orijinale karıştır
    out.data[p] = data.data[p] + (recolored.r - data.data[p]) * amount;
    out.data[p + 1] = data.data[p + 1] + (recolored.g - data.data[p + 1]) * amount;
    out.data[p + 2] = data.data[p + 2] + (recolored.b - data.data[p + 2]) * amount;
  }

  return out;
}
