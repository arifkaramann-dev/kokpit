// Doku istatistikleri — parıltı (sparkle) ve alacalılık (graininess).
//
// Bunlar efekt boyayı efekt boya yapan şeyler ve bir swatch'ta hiç yok.
// Renk değil doku oldukları için aydınlatmadan büyük ölçüde bağımsızlar:
// ışık kaysa da pulcukların uzamsal varyansı korunur. Yani kalibre olmayan
// fotoğraflardan güvenle çıkarılabilecek nadir sinyallerden.
//
// Ölçek uyarısı: bu istatistikler çözünürlüğe duyarlı. Küçük bir thumbnail'de
// pulcuklar görünmez. Bu yüzden bölge, karşılaştırılabilir olsun diye önce
// sabit bir örnekleme ölçeğine normalize ediliyor.

const SAMPLE_EDGE = 128; // normalize edilmiş bölgenin kenar uzunluğu

/** Maskelenmiş bölgeyi sabit boyutlu bir luminans matrisine indirger. */
function normalizeRegion(data, mask) {
  const box = maskBounds(mask, data.width, data.height);
  if (!box) return null;

  const { x0, y0, x1, y1 } = box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 8 || h < 8) return null;

  const out = new Float32Array(SAMPLE_EDGE * SAMPLE_EDGE);
  const valid = new Uint8Array(SAMPLE_EDGE * SAMPLE_EDGE);

  for (let j = 0; j < SAMPLE_EDGE; j += 1) {
    for (let i = 0; i < SAMPLE_EDGE; i += 1) {
      const sx = x0 + Math.floor((i / SAMPLE_EDGE) * w);
      const sy = y0 + Math.floor((j / SAMPLE_EDGE) * h);
      const idx = sy * data.width + sx;
      if (!mask[idx]) continue;
      const p = idx * 4;
      // Rec.709 luminans — pulcuk parıltısı esas olarak parlaklık olayı
      out[j * SAMPLE_EDGE + i] =
        0.2126 * data.data[p] + 0.7152 * data.data[p + 1] + 0.0722 * data.data[p + 2];
      valid[j * SAMPLE_EDGE + i] = 1;
    }
  }
  return { lum: out, valid, edge: SAMPLE_EDGE, sourceW: w, sourceH: h };
}

function maskBounds(mask, width, height) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Kutu bulanıklaştırma — geçerli piksel maskesine saygı duyar. */
function blur(lum, valid, edge, radius) {
  const out = new Float32Array(edge * edge);
  for (let y = 0; y < edge; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= edge || py >= edge) continue;
          const k = py * edge + px;
          if (!valid[k]) continue;
          sum += lum[k];
          n += 1;
        }
      }
      out[y * edge + x] = n ? sum / n : 0;
    }
  }
  return out;
}

function stdOf(values, valid) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!valid[i]) continue;
    sum += values[i];
    n += 1;
  }
  if (n < 2) return 0;
  const mean = sum / n;
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!valid[i]) continue;
    acc += (values[i] - mean) ** 2;
  }
  return Math.sqrt(acc / (n - 1));
}

/**
 * Boya bölgesinin doku imzasını çıkarır.
 *
 * @param {ImageData} data
 * @param {Uint8Array} mask  data.width*data.height uzunluğunda, 1 = boya
 * @returns {{sparkle:number, graininess:number, meanLuminance:number,
 *            resolutionOk:boolean, sourcePixels:number} | null}
 */
export function extractTexture(data, mask) {
  const norm = normalizeRegion(data, mask);
  if (!norm) return null;

  const { lum, valid, edge, sourceW, sourceH } = norm;

  const fine = blur(lum, valid, edge, 1);
  const coarse = blur(lum, valid, edge, 5);

  // Yüksek frekans: piksel - ince bulanık → tek tek pulcuk çakmaları
  const high = new Float32Array(edge * edge);
  // Orta frekans: ince - kaba → alacalı doku
  const mid = new Float32Array(edge * edge);
  for (let i = 0; i < lum.length; i += 1) {
    if (!valid[i]) continue;
    high[i] = lum[i] - fine[i];
    mid[i] = fine[i] - coarse[i];
  }

  let sum = 0;
  let n = 0;
  for (let i = 0; i < lum.length; i += 1) {
    if (!valid[i]) continue;
    sum += lum[i];
    n += 1;
  }
  const meanLum = n ? sum / n : 1;
  const denom = Math.max(meanLum, 1);

  const sourcePixels = sourceW * sourceH;

  return {
    // Ortalama parlaklığa göre normalize — koyu boyada da anlamlı kalsın
    sparkle: Number((stdOf(high, valid) / denom).toFixed(4)),
    graininess: Number((stdOf(mid, valid) / denom).toFixed(4)),
    meanLuminance: Number(meanLum.toFixed(2)),
    // Kaynak bölge normalize boyuttan küçükse doku büyütmeden geliyor demektir,
    // parıltı ölçümü gerçek değil — interpolasyon artığı.
    resolutionOk: sourceW >= SAMPLE_EDGE && sourceH >= SAMPLE_EDGE,
    sourcePixels,
  };
}
