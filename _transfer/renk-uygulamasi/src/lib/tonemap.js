// Ton eşleme operatörleri — three.js'in fragment shader'ıyla birebir aynı.
// Kaynak: three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js
//
// Neden burada: render motorunun son adımı rengi değiştiriyor. Bu değişimi
// CPU tarafında birebir kopyalayabilirsek, tersini alıp "ekranda çıkan renk
// hedeflenen renk olsun" diye malzemeye verilecek albedo'yu hesaplayabiliriz.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sat3 = ([r, g, b]) => [clamp01(r), clamp01(g), clamp01(b)];

function mul3x3(m, v) {
  // m sütun-major (GLSL mat3 kuralı), shader'daki diziliş korundu
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

// --- Linear (exposure only) ---
export function linearToneMapping(color, exposure = 1) {
  return sat3(color.map((c) => c * exposure));
}

// --- ACESFilmic (three.js varyantı, 1/0.6 ölçekli) ---
const ACES_IN = [
  [0.59719, 0.076, 0.0284],
  [0.35458, 0.90834, 0.13383],
  [0.04823, 0.01566, 0.83777],
];
const ACES_OUT = [
  [1.60475, -0.10208, -0.00327],
  [-0.53108, 1.10813, -0.07276],
  [-0.07367, -0.00605, 1.07602],
];

function rrtAndOdtFit(v) {
  return v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return a / b;
  });
}

export function acesFilmicToneMapping(color, exposure = 1) {
  let c = color.map((x) => (x * exposure) / 0.6);
  c = mul3x3(ACES_IN, c);
  c = rrtAndOdtFit(c);
  c = mul3x3(ACES_OUT, c);
  return sat3(c);
}

// --- AgX ---
const SRGB_TO_REC2020 = [
  [0.6274, 0.0691, 0.0164],
  [0.3293, 0.9195, 0.088],
  [0.0433, 0.0113, 0.8956],
];
const REC2020_TO_SRGB = [
  [1.6605, -0.1246, -0.0182],
  [-0.5876, 1.1329, -0.1006],
  [-0.0728, -0.0083, 1.1187],
];
const AGX_INSET = [
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
];
const AGX_OUTSET = [
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
];
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

function agxContrast(x) {
  const x2 = x * x;
  const x4 = x2 * x2;
  return (
    15.5 * x4 * x2 -
    40.14 * x4 * x +
    31.96 * x4 -
    6.868 * x2 * x +
    0.4298 * x2 +
    0.1191 * x -
    0.00232
  );
}

export function agxToneMapping(color, exposure = 1) {
  let c = color.map((x) => x * exposure);
  c = mul3x3(SRGB_TO_REC2020, c);
  c = mul3x3(AGX_INSET, c);
  c = c.map((x) => Math.log2(Math.max(x, 1e-10)));
  c = c.map((x) => (x - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV));
  c = c.map(clamp01);
  c = c.map(agxContrast);
  c = mul3x3(AGX_OUTSET, c);
  c = c.map((x) => Math.pow(Math.max(0, x), 2.2));
  c = mul3x3(REC2020_TO_SRGB, c);
  return sat3(c);
}

// --- Khronos PBR Neutral ---
// Ürün görselleştirme için tasarlandı: amacı rengi korumak.
export function neutralToneMapping(color, exposure = 1) {
  const StartCompression = 0.8 - 0.04;
  const Desaturation = 0.15;

  let c = color.map((x) => x * exposure);

  const x = Math.min(c[0], Math.min(c[1], c[2]));
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c = c.map((v) => v - offset);

  const peak = Math.max(c[0], Math.max(c[1], c[2]));
  if (peak < StartCompression) return c;

  const d = 1 - StartCompression;
  const newPeak = 1 - (d * d) / (peak + d - StartCompression);
  c = c.map((v) => (v * newPeak) / peak);

  const g = 1 - 1 / (Desaturation * (peak - newPeak) + 1);
  return c.map((v) => v * (1 - g) + newPeak * g);
}

export const TONE_MAPPERS = {
  none: (c) => sat3(c),
  linear: linearToneMapping,
  aces: acesFilmicToneMapping,
  agx: agxToneMapping,
  neutral: neutralToneMapping,
};

/**
 * Ton eşlemenin tersi.
 * "Ekranda şu lineer renk çıksın" hedefinden, malzemeye verilecek albedo'yu bulur.
 * Operatörler kanalları birbirine bağladığı (min-offset, tepe sıkıştırma) için
 * analitik ters yerine korumalı sabit nokta iterasyonu kullanılıyor.
 *
 * @returns {{albedo:number[], iterations:number, residual:number, converged:boolean}}
 */
export function invertToneMapping(targetLinear, mapper = 'neutral', exposure = 1, opts = {}) {
  const { tolerance = 1e-7, maxIterations = 100 } = opts;
  const fn = TONE_MAPPERS[mapper];
  if (!fn) throw new Error(`bilinmeyen ton eşleyici: ${mapper}`);

  let albedo = [...targetLinear];
  let residual = Infinity;
  let i = 0;

  for (; i < maxIterations; i += 1) {
    const got = fn(albedo, exposure);
    const err = [got[0] - targetLinear[0], got[1] - targetLinear[1], got[2] - targetLinear[2]];
    residual = Math.max(Math.abs(err[0]), Math.abs(err[1]), Math.abs(err[2]));
    if (residual < tolerance) break;
    // Sönümlü düzeltme: operatör bazı bölgelerde dik, tam adım salınım yapar.
    albedo = albedo.map((v, k) => Math.max(0, v - err[k] * 0.75));
  }

  return { albedo, iterations: i, residual, converged: residual < tolerance };
}
