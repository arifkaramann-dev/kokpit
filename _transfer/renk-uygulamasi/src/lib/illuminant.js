// Aydınlatma kestirimi ve kromatik adaptasyon.
//
// Problem: her fotoğraf farklı ışıkta çekilmiş. Aynı boya güneşte başka,
// kapalı havada başka, showroom'da bambaşka piksel değeri veriyor. Bu
// farkı gidermeden fotoğrafları karşılaştırmak anlamsız.
//
// Yaklaşım: sahnedeki nötr yüzeyleri (asfalt, beton, gri zemin) bul, onların
// nötr olması gerektiğini varsayarak ışığın rengini kestir, sonra Bradford
// kromatik adaptasyonuyla her şeyi D65'e taşı.

import { rgbToLab, rgbToXyz, xyzToRgb, deltaE2000 } from './color.js';

const D65_XYZ = { x: 95.047, y: 100.0, z: 108.883 };

// Bradford koni tepki matrisi (XYZ → LMS) ve tersi
const BRADFORD = [
  [0.8951, -0.7502, 0.0389],
  [0.2664, 1.7135, -0.0685],
  [-0.1614, 0.0367, 1.0296],
];
const BRADFORD_INV = [
  [0.9869929, 0.4323053, -0.0085287],
  [-0.1470543, 0.5183603, 0.0400428],
  [0.1599627, 0.0492912, 0.9684867],
];

function apply(m, [x, y, z]) {
  return [
    m[0][0] * x + m[1][0] * y + m[2][0] * z,
    m[0][1] * x + m[1][1] * y + m[2][1] * z,
    m[0][2] * x + m[1][2] * y + m[2][2] * z,
  ];
}

/**
 * Sahnedeki nötr adayı piksellerden ışık rengini kestirir.
 *
 * Nötr aday = düşük kroma + orta parlaklık. Asfalt, beton, gri zemin, beyaz
 * duvar bu tanıma girer. Gökyüzü bilerek dışarıda: mavi ve nötr değil.
 *
 * @param {ImageData} data
 * @param {{maxChroma?:number, minL?:number, maxL?:number, exclude?:Function}} opts
 * @returns {{white:{r,g,b}, sampleCount:number, coverage:number, reliable:boolean}}
 */
export function estimateIlluminant(data, opts = {}) {
  const {
    maxChroma = 12,
    minL = 25,
    maxL = 88,
    exclude = null,
    iterations = 3,
    subjectLab = null,
  } = opts;

  // Özne dışlama ölçütü ΔE DEĞİL, kroma + hue.
  // Kuvvetli renkli ışık altında nötr zemin de özneye doğru kayar; ΔE ile
  // dışlarsak tam da ihtiyaç duyduğumuz nötrleri atarız (soğuk ışıkta
  // düzeltme tamamen sıfırlanıyordu). Ayırt edici olan şu: ışıkla boyanmış
  // nötr DÜŞÜK kromalı kalır, öznenin gövdesi YÜKSEK kromalıdır.
  const subject = subjectLab
    ? {
        chroma: Math.hypot(subjectLab.a, subjectLab.b),
        hue: Math.atan2(subjectLab.b, subjectLab.a),
      }
    : null;

  const isSubject = (lab) => {
    if (!subject || subject.chroma < 12) return false; // özne zaten nötrse dışlama
    const chroma = Math.hypot(lab.a, lab.b);
    if (chroma < subject.chroma * 0.45) return false; // düşük kroma = nötr aday, tut
    let dh = Math.abs(Math.atan2(lab.b, lab.a) - subject.hue);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    return dh < Math.PI / 6; // 30° içinde ve yüksek kromalı → öznenin gövdesi
  };

  // Sahneyi bir kez tara, aday pikselleri belleğe al — yineleme ucuz olsun.
  const step = Math.max(1, Math.floor(Math.sqrt((data.width * data.height) / 30000)));
  const candidates = [];
  let subjectRejected = 0;

  for (let y = 0; y < data.height; y += step) {
    for (let x = 0; x < data.width; x += step) {
      const i = (y * data.width + x) * 4;
      if (data.data[i + 3] < 128) continue;
      if (exclude && exclude(x, y)) continue;

      const rgb = { r: data.data[i], g: data.data[i + 1], b: data.data[i + 2] };

      // Maske çoğu zaman öznenin tamamını kapsamaz: kullanıcı tek panele
      // tıklar, arabanın geri kalanı "arka plan" sayılır. O gövde ışık
      // kestirimine karışırsa boyanın kendi rengi ışık sanılır ve adaptasyon
      // tam o rengi söker (mavi araba → kroma 77'den 40'a düşer).
      if (subject && isSubject(rgbToLab(rgb))) {
        subjectRejected += 1;
        continue;
      }

      candidates.push(rgb);
    }
  }
  if (!candidates.length) {
    return {
      white: { r: 128, g: 128, b: 128 },
      sampleCount: 0,
      coverage: 0,
      reliable: false,
      subjectRejected,
    };
  }

  // Tavuk-yumurta problemi: kuvvetli renkli ışık altında gerçek nötr yüzeyler
  // de kromatik görünür, bu yüzden düşük-kroma filtresi tam da ihtiyaç duyduğu
  // pikselleri eler. Çözüm: kaba bir kestirimle başla (gri dünya), ona göre
  // düzeltilmiş uzayda nötrleri yeniden ara, kestirimi rafine et.
  // Başlangıç kestirimi düz gri dünya DEĞİL: kromatik pikseller ortalamayı
  // kendi renklerine çeker. Önce en az kromatik yarıyı seçip onların
  // ortalamasını alıyoruz — nötr yüzeylere çok daha yakın bir başlangıç.
  let white = chromaTrimmedGrayWorld(candidates);
  let sampleCount = 0;

  for (let pass = 0; pass < iterations; pass += 1) {
    const adapt = adaptToD65(white);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;

    for (const rgb of candidates) {
      const lab = rgbToLab(adapt(rgb)); // düzeltilmiş uzayda değerlendir
      if (lab.l < minL || lab.l > maxL) continue;
      if (Math.hypot(lab.a, lab.b) > maxChroma) continue;
      r += rgb.r;
      g += rgb.g;
      b += rgb.b;
      n += 1;
    }

    if (n < 20) break; // yeterli nötr yok, eldeki kestirimle kal
    const next = { r: r / n, g: g / n, b: b / n };
    const moved = Math.hypot(next.r - white.r, next.g - white.g, next.b - white.b);
    white = next;
    sampleCount = n;
    if (moved < 0.5) break; // yakınsadı
  }

  const coverage = sampleCount / candidates.length;
  return {
    white,
    sampleCount,
    coverage,
    subjectRejected,
    // Sahnenin en az %2'si nötr aday değilse kestirim zayıf.
    reliable: coverage >= 0.02 && sampleCount >= 50,
  };
}

/** En az kromatik yarının ortalaması. Renkli özneler kestirimi kaçıramasın. */
function chromaTrimmedGrayWorld(pixels) {
  const scored = pixels.map((p) => {
    const lab = rgbToLab(p);
    return { p, chroma: Math.hypot(lab.a, lab.b) };
  });
  scored.sort((a, b) => a.chroma - b.chroma);
  const keep = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.5)));
  const n = keep.length;
  return {
    r: keep.reduce((a, s) => a + s.p.r, 0) / n,
    g: keep.reduce((a, s) => a + s.p.g, 0) / n,
    b: keep.reduce((a, s) => a + s.p.b, 0) / n,
  };
}

/** Gri dünya varsayımı: sahnenin ortalaması nötr olmalı. Kaba ama her zaman çalışır. */
function grayWorld(data, exclude = null) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((data.width * data.height) / 30000)));
  for (let y = 0; y < data.height; y += step) {
    for (let x = 0; x < data.width; x += step) {
      const i = (y * data.width + x) * 4;
      if (data.data[i + 3] < 128) continue;
      if (exclude && exclude(x, y)) continue;
      r += data.data[i];
      g += data.data[i + 1];
      b += data.data[i + 2];
      n += 1;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 128, g: 128, b: 128 };
}

/**
 * Kestirilen beyaz noktasından D65'e Bradford kromatik adaptasyonu.
 * @returns {(rgb:{r,g,b}) => {r,g,b}} bir renk dönüştürücü
 */
export function adaptToD65(sourceWhite, strength = 1) {
  const srcXyz = rgbToXyz(sourceWhite);
  // Beyaz noktayı Y=100'e normalize et — parlaklık değil, sadece renk düzeltiyoruz.
  const scale = srcXyz.y > 1e-6 ? 100 / srcXyz.y : 1;
  const src = [srcXyz.x * scale, srcXyz.y * scale, srcXyz.z * scale];
  const dst = [D65_XYZ.x, D65_XYZ.y, D65_XYZ.z];

  const srcLms = apply(BRADFORD, src);
  const dstLms = apply(BRADFORD, dst);
  // Kısmi adaptasyon (CIECAM02'deki D katsayısı gibi): kestirime ne kadar
  // güveniyorsak o kadar düzeltiyoruz. strength=0 hiç dokunma, 1 tam düzelt.
  const d = Math.max(0, Math.min(1, strength));
  const partial = (num, den) => (den !== 0 ? 1 + d * (num / den - 1) : 1);
  const gain = [
    partial(dstLms[0], srcLms[0]),
    partial(dstLms[1], srcLms[1]),
    partial(dstLms[2], srcLms[2]),
  ];

  return (rgb) => {
    const xyz = rgbToXyz(rgb);
    const lms = apply(BRADFORD, [xyz.x, xyz.y, xyz.z]);
    const adapted = apply(BRADFORD_INV, [lms[0] * gain[0], lms[1] * gain[1], lms[2] * gain[2]]);
    return xyzToRgb({ x: adapted[0], y: adapted[1], z: adapted[2] });
  };
}

/**
 * Kestirilen ışığın D65'ten ne kadar saptığı — fotoğrafın ne kadar "kirli"
 * olduğunun ölçüsü. Yüksekse o fotoğrafa daha az güveniriz.
 * @returns {number} nötr eksenden kroma sapması
 */
export function illuminantCast(white) {
  const lab = rgbToLab(white);
  return Math.hypot(lab.a, lab.b);
}
