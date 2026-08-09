// Digital Paint Fingerprint v2 — çok kaynaklı üretim ve uzlaşı.
//
// Girdi: aynı boyanın N referans görseli (farklı ışık, farklı açı).
// Çıktı: tek bir parmak izi + her alanın ne kadar güvenilir olduğu.
//
// Tasarım ilkesi: ortalama almak yetmez. Aydınlatma hatası sistematiktir,
// ortalaması alınınca kaybolmaz. Bu yüzden önce her görsel kendi içinde
// D65'e taşınır, sonra aykırı gözlemler atılır, sonra kalanların medyanı
// alınır. Ve dağılım saklanır — çünkü ne kadar emin olduğumuz, ne bulduğumuz
// kadar önemli.

import { rgbToLab, rgbToXyz, labToHex, labToRgb, hexToRgb, deltaE2000, rgbToHex } from './color.js';
import { estimateIlluminant, adaptToD65, illuminantCast } from './illuminant.js';
import { extractTexture } from './texture.js';

/** Aykırı sayılma eşiği — medyandan bu kadar uzak gözlem elenir. */
export const OUTLIER_DELTA_E = 10;

/**
 * Tek bir görselden gözlem çıkarır.
 *
 * @param {ImageData} data     tüm sahne
 * @param {Uint8Array} mask    boya bölgesi (1 = boya), data boyutunda
 * @param {{name?:string}} meta
 */
export function analyzeImage(data, mask, meta = {}) {
  // Boya bölgesindeki pikselleri topla
  const pixels = [];
  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const idx = y * data.width + x;
      if (!mask[idx]) continue;
      const p = idx * 4;
      if (data.data[p + 3] < 128) continue;
      pixels.push({ r: data.data[p], g: data.data[p + 1], b: data.data[p + 2] });
    }
  }
  if (pixels.length < 100) {
    return { name: meta.name, rejected: true, reason: 'boya bölgesi çok küçük', pixels: pixels.length };
  }

  const labs = pixels.map((rgb) => rgbToLab(rgb));
  labs.sort((a, b) => a.l - b.l);

  // Bir araba fotoğrafında boya bölgesi parlak kaputtan simsiyah eteğe kadar
  // uzanır. Bu aralığın ORTALAMASI gölge ağırlıklı çıkar — renk kartında
  // göreceğin renk değil. Renk kartındaki renk "face": iyi aydınlanmış,
  // kameraya bakan, specular olmayan yüzeyin rengi.
  //
  // Bu yüzden ortalama değil, bant seçiyoruz:
  //   üst %4      → specular parlama, atılıyor (boyanın değil ışığın rengi)
  //   %70-%95     → face bandı, aradığımız renk
  //   %10-%30     → gölge bandı, aralık raporu için
  //
  // Sabit bir yüzdelik dilim de işe yaramıyor: gövdenin ne kadarının parlak,
  // ne kadarının gölgede olduğu her fotoğrafta farklı. Onun yerine dağılımın
  // TEPESİNİ (mode) buluyoruz — en geniş tutarlı aydınlanmış yüzey. Bir
  // arabada bu, kapı/yan panel gibi ana gövde yüzeyidir; insana "rengi
  // hangisi" diye sorsan göstereceği yer de orasıdır.
  //
  // Maske zaten kullanıcının tıkladığı noktadan renk benzerliğiyle büyüdüğü
  // için bölge baştan tutarlı; tepe bulma onu keskinleştiriyor.
  const band = (loPct, hiPct) => {
    const lo = Math.floor(labs.length * loPct);
    const hi = Math.max(lo + 1, Math.floor(labs.length * hiPct));
    return labs.slice(lo, hi);
  };

  // Specular parlama boyanın değil ışığın rengi — ağırlıklandırmadan önce at.
  const nonSpecular = labs.slice(0, Math.max(1, Math.floor(labs.length * 0.96)));
  const shadowBand = band(0.1, 0.3);

  const rawLab = densityWeightedLab(nonSpecular);

  // Işık kestirimi boya rengi BİLİNDİKTEN SONRA yapılıyor.
  // Sebebi: maske genelde öznenin tamamını kapsamaz — kullanıcı tek panele
  // tıklar, arabanın geri kalanı arka plan sayılır. O gövde kestirime
  // karışırsa boyanın kendi rengi "ışık" sanılır ve adaptasyon tam o rengi
  // söker (mavi araba → kroma 77'den 40'a düşer). Ham rengi önce çıkarıp
  // ona benzeyen her pikseli kestirimden dışlıyoruz.
  const illum = estimateIlluminant(data, {
    exclude: (x, y) => mask[y * data.width + x] === 1,
    subjectLab: rawLab,
  });

  // Kısmi adaptasyon: kestirime güvenmiyorsak rengi tam düzeltmiyoruz.
  // Yanlış bir düzeltme, hiç düzeltmemekten daha zararlı.
  const cast = illuminantCast(illum.white);
  const strength = adaptationStrength(illum, cast);

  const adapt = adaptToD65(illum.white, strength);
  const correctedRgb = adapt(labToRgb(rawLab));
  const correctedLab = rgbToLab(correctedRgb);

  // Bölge içi parlaklık aralığı.
  // DİKKAT: bu bir flop ölçüsü DEĞİL. Fotoğrafta parlaklık değişiminin çoğu
  // yüzey normalinin ve gölgenin eseri, pulcuk yöneliminin değil. Sadece
  // gözlem olarak kaydediliyor; malzeme parametresi buradan TÜRETİLMİYOR.
  const faceL = rawLab.l;
  const shadowL = meanLab(shadowBand.length ? shadowBand : labs).l;
  const lightnessRange = faceL > 1 ? Number(((faceL - shadowL) / faceL).toFixed(4)) : 0;

  const texture = extractTexture(data, mask);

  return {
    name: meta.name,
    rejected: false,
    pixels: pixels.length,
    raw: { lab: rawLab, hex: labToHex(rawLab) },
    corrected: { lab: correctedLab, hex: rgbToHex(correctedRgb) },
    illuminant: {
      white: illum.white,
      cast: Number(cast.toFixed(2)),
      reliable: illum.reliable,
      coverage: Number(illum.coverage.toFixed(4)),
      neutralSamples: illum.sampleCount,
      // Uygulanan düzeltme oranı — 1.0 tam, 0 hiç dokunulmadı
      strength: Number(strength.toFixed(2)),
    },
    lightnessRange,
    texture,
    // Gözleme ne kadar güveniyoruz. Nötr çapa yoksa ve ışık çok renkliyse düşer.
    weight: observationWeight({ illum, cast, pixels: pixels.length, texture }),
  };
}

/**
 * Ne kadar düzeltme uygulanacağı.
 *
 * Gerçek aydınlatmalar sınırlı bir bantta: gün ışığı, kapalı hava, akkor,
 * floresan. Bunların nötr eksenden sapması kabaca 20'yi aşmaz. Daha büyük bir
 * "sapma" görüyorsak muhtemelen ışığı değil özneyi ölçüyoruzdur — o durumda
 * düzeltmeyi kısıyoruz, çünkü yanlış düzeltme hiç düzeltmemekten kötüdür.
 */
function adaptationStrength(illum, cast) {
  let s = illum.reliable ? 1 : 0.45;
  if (cast > 20) s *= Math.max(0.15, 20 / cast);
  return Math.max(0, Math.min(1, s));
}

function observationWeight({ illum, cast, pixels, texture }) {
  let w = 1;
  if (!illum.reliable) w *= 0.4; // nötr çapa yok, gri dünyaya düştük
  w *= 1 / (1 + cast / 15); // ışık ne kadar renkliyse o kadar güvensiz
  if (pixels < 2000) w *= 0.6; // bölge küçük
  if (texture && !texture.resolutionOk) w *= 0.85; // doku ölçümü zayıf
  return Number(Math.max(0.05, Math.min(1, w)).toFixed(3));
}

/**
 * Yoğunluk ağırlıklı ortalama — baskın aydınlanmış yüzeyin rengi.
 *
 * Keskin bir tepe (mod) seçmek kırılgan: boya bölgesinde belirgin bir plato
 * yoksa (düz gradyan) tepe keyfi bir yere düşer. Onun yerine her pikseli
 * kendi L* kovasının yoğunluğuyla ağırlıklandırıyoruz.
 *
 * Davranış kendiliğinden doğru tarafa gidiyor:
 *   - Geniş düz panel varsa (gerçek araba) o kova baskın → plato rengi kazanır
 *   - Dağılım düzse (saf gradyan) tüm ağırlıklar eşitlenir → ortalamaya iner
 *
 * @param {Array<{l:number,a:number,b:number}>} sorted L*'a göre artan sıralı
 */
function densityWeightedLab(sorted, binSize = 1.5, sharpness = 2) {
  if (sorted.length < 20) return meanLab(sorted);

  const lo = sorted[0].l;
  const hi = sorted[sorted.length - 1].l;
  const span = hi - lo;
  if (span < binSize) return meanLab(sorted);

  const binCount = Math.ceil(span / binSize) + 1;
  const bins = new Int32Array(binCount);
  const binOf = (p) => Math.min(binCount - 1, Math.floor((p.l - lo) / binSize));
  for (const p of sorted) bins[binOf(p)] += 1;

  const maxCount = Math.max(...bins) || 1;

  let wl = 0;
  let wa = 0;
  let wb = 0;
  let wsum = 0;
  for (const p of sorted) {
    const w = Math.pow(bins[binOf(p)] / maxCount, sharpness);
    wl += p.l * w;
    wa += p.a * w;
    wb += p.b * w;
    wsum += w;
  }
  if (wsum <= 0) return meanLab(sorted);
  return { l: wl / wsum, a: wa / wsum, b: wb / wsum };
}

function meanLab(labs) {
  const n = labs.length;
  return {
    l: labs.reduce((a, x) => a + x.l, 0) / n,
    a: labs.reduce((a, x) => a + x.a, 0) / n,
    b: labs.reduce((a, x) => a + x.b, 0) / n,
  };
}

function medianLab(labs) {
  const pick = (key) => {
    const s = labs.map((x) => x[key]).sort((p, q) => p - q);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return { l: pick('l'), a: pick('a'), b: pick('b') };
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * N gözlemden tek bir parmak izi üretir.
 *
 * @param {Array} observations analyzeImage çıktıları
 * @param {{code:string, name:string, series:string}} meta
 */
export function buildFingerprint(observations, meta) {
  const usable = observations.filter((o) => !o.rejected);
  if (!usable.length) {
    throw new Error('kullanılabilir gözlem yok');
  }

  // 1. Kaba medyan — aykırı avlamak için referans
  const seed = medianLab(usable.map((o) => o.corrected.lab));

  // 2. Aykırıları ele
  const scored = usable.map((o) => ({
    ...o,
    deltaFromMedian: Number(deltaE2000(o.corrected.lab, seed).toFixed(2)),
  }));
  const kept = scored.filter((o) => o.deltaFromMedian <= OUTLIER_DELTA_E);
  const dropped = scored.filter((o) => o.deltaFromMedian > OUTLIER_DELTA_E);

  const pool = kept.length >= 2 ? kept : scored; // hepsi saçılmışsa kimseyi atma

  // 3. Ağırlıklı ortalama
  const wsum = pool.reduce((a, o) => a + o.weight, 0);
  const lab = {
    l: pool.reduce((a, o) => a + o.corrected.lab.l * o.weight, 0) / wsum,
    a: pool.reduce((a, o) => a + o.corrected.lab.a * o.weight, 0) / wsum,
    b: pool.reduce((a, o) => a + o.corrected.lab.b * o.weight, 0) / wsum,
  };

  // 4. Dağılım = güven
  const spread = pool.map((o) => deltaE2000(o.corrected.lab, lab));
  const maxSpread = Math.max(...spread);
  const meanSpread = spread.reduce((a, b) => a + b, 0) / spread.length;

  const textures = pool.map((o) => o.texture).filter(Boolean);
  const goodTextures = textures.filter((t) => t.resolutionOk);
  const textureSource = goodTextures.length ? goodTextures : textures;

  const hex = labToHex(lab);
  const rgb = hexToRgb(hex);

  return {
    id: `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    code: meta.code,
    name: meta.name,
    series: meta.series,

    hex,
    srgb: rgb,
    lab,
    xyz: rgbToXyz(rgb),

    effect: {
      // Gerçek malzeme sinyali: yüksek frekanslı uzamsal varyans pulcuk
      // çakmasından gelir, gölgeden değil. Aydınlatmadan büyük ölçüde bağımsız.
      sparkle: textureSource.length
        ? Number(median(textureSource.map((t) => t.sparkle)).toFixed(4))
        : null,
      graininess: textureSource.length
        ? Number(median(textureSource.map((t) => t.graininess)).toFixed(4))
        : null,
      // Sadece gözlem — malzeme parametresi buradan türetilmiyor (bkz. analyzeImage)
      lightnessRange: Number(median(pool.map((o) => o.lightnessRange)).toFixed(4)),
    },

    provenance: {
      createdAt: new Date().toISOString(),
      sourceCount: observations.length,
      usedCount: pool.length,
      droppedCount: dropped.length,
      dropped: dropped.map((o) => ({ name: o.name, deltaFromMedian: o.deltaFromMedian })),
      sources: pool.map((o) => ({
        name: o.name,
        hex: o.corrected.hex,
        rawHex: o.raw.hex,
        weight: o.weight,
        deltaFromMedian: o.deltaFromMedian,
        illuminantCast: o.illuminant.cast,
        illuminantReliable: o.illuminant.reliable,
      })),
    },

    confidence: {
      // Kaynaklar ne kadar uyuşuyor
      maxSpread: Number(maxSpread.toFixed(2)),
      meanSpread: Number(meanSpread.toFixed(2)),
      level: confidenceLevel(meanSpread, pool.length, dropped.length),
      // Doku ölçümü gerçekten yapılabildi mi
      textureMeasured: goodTextures.length > 0,
      note: buildNote(meanSpread, pool, dropped),
    },
  };
}

function confidenceLevel(meanSpread, used, droppedCount) {
  if (used < 3) return 'düşük';
  if (meanSpread > 6) return 'düşük';
  if (meanSpread > 3) return 'orta';
  if (droppedCount > used) return 'orta';
  return 'yüksek';
}

function buildNote(meanSpread, pool, dropped) {
  const parts = [];
  parts.push(`${pool.length} kaynak, ortalama sapma ΔE ${meanSpread.toFixed(2)}`);
  if (dropped.length) {
    parts.push(`${dropped.length} kaynak aykırı olduğu için elendi`);
  }
  const weak = pool.filter((o) => !o.illuminant.reliable);
  if (weak.length) {
    parts.push(`${weak.length} kaynakta nötr çapa bulunamadı, ışık kestirimi zayıf`);
  }
  return parts.join(' · ');
}
