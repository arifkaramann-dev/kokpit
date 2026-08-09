// CIELAB renk bilimi — D65 / 2° gözlemci.
// sRGB <-> XYZ <-> Lab dönüşümleri ve CIEDE2000 (ΔE2000) fark metriği.

const D65 = { x: 95.047, y: 100.0, z: 108.883 };

export function clamp(v, min = 0, max = 1) {
  return v < min ? min : v > max ? max : v;
}

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const to = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// sRGB gama sökümü (IEC 61966-2-1). 0..255 girer, 0..1 lineer çıkar.
export function linearize(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// 0..1 lineer girer, 0..255 sRGB çıkar.
export function delinearize(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(c, 0, 1) * 255;
}

/** {r,g,b} 0..255 sRGB → [r,g,b] 0..1 lineer */
export function rgbToLinear({ r, g, b }) {
  return [linearize(r), linearize(g), linearize(b)];
}

/** [r,g,b] 0..1 lineer → {r,g,b} 0..255 sRGB */
export function linearToRgb([r, g, b]) {
  return { r: delinearize(r), g: delinearize(g), b: delinearize(b) };
}

export function rgbToXyz({ r, g, b }) {
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return {
    x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
    y: (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100,
    z: (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100,
  };
}

export function xyzToRgb({ x, y, z }) {
  const X = x / 100;
  const Y = y / 100;
  const Z = z / 100;
  return {
    r: delinearize(X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314),
    g: delinearize(X * -0.969266 + Y * 1.8760108 + Z * 0.041556),
    b: delinearize(X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252),
  };
}

function fLab(t) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  return t > e ? Math.cbrt(t) : (k * t + 16) / 116;
}

function fLabInv(t) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const t3 = t * t * t;
  return t3 > e ? t3 : (116 * t - 16) / k;
}

export function xyzToLab({ x, y, z }) {
  const fx = fLab(x / D65.x);
  const fy = fLab(y / D65.y);
  const fz = fLab(z / D65.z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToXyz({ l, a, b }) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    x: fLabInv(fx) * D65.x,
    y: fLabInv(fy) * D65.y,
    z: fLabInv(fz) * D65.z,
  };
}

export function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
}

export function labToRgb(lab) {
  return xyzToRgb(labToXyz(lab));
}

export function hexToLab(hex) {
  return rgbToLab(hexToRgb(hex));
}

export function labToHex(lab) {
  return rgbToHex(labToRgb(lab));
}

/**
 * CIEDE2000 renk farkı. Sharma/Wu/Dalal referans uygulaması.
 * kL, kC, kH ağırlıkları grafik sanatlar için 1:1:1 bırakıldı.
 */
export function deltaE2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const { l: L1, a: a1, b: b1 } = lab1;
  const { l: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else {
    const diff = Math.abs(h1p - h2p);
    const sum = h1p + h2p;
    if (diff <= 180) hbarp = sum / 2;
    else if (sum < 360) hbarp = (sum + 360) / 2;
    else hbarp = (sum - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );
}

function rad(deg) {
  return (deg * Math.PI) / 180;
}

function hueAngle(b, ap) {
  if (b === 0 && ap === 0) return 0;
  const deg = (Math.atan2(b, ap) * 180) / Math.PI;
  return deg >= 0 ? deg : deg + 360;
}

/** ΔE2000 değerini insan diline çevirir. */
export function deltaELabel(dE) {
  if (dE < 1) return { text: 'Gözle ayırt edilemez', tone: 'emerald' };
  if (dE < 2) return { text: 'Çok yakın eşleşme', tone: 'emerald' };
  if (dE < 3.5) return { text: 'Yakın eşleşme', tone: 'lime' };
  if (dE < 5) return { text: 'Fark edilir', tone: 'amber' };
  if (dE < 10) return { text: 'Belirgin fark', tone: 'orange' };
  return { text: 'Farklı renk', tone: 'rose' };
}

/**
 * Bir Lab değerini n açılı sentetik "face → flop" profiline açar.
 * Metalik/pearl oranı arttıkça açıyla birlikte L düşer, kroma azalır —
 * fiziksel pulcuk yöneliminin basitleştirilmiş modeli.
 */
export function synthesizeMultiAngle(lab, { metallic = 0, pearl = 0, flake = 0 } = {}) {
  const angles = [15, 30, 45, 60, 75];
  const travel = 0.35 * metallic + 0.28 * pearl + 0.2 * flake;
  return angles.map((angle, i) => {
    const t = i / (angles.length - 1);
    const drop = lab.l * travel * t;
    const chromaScale = 1 - 0.25 * travel * t;
    return {
      angle,
      lab: {
        l: Math.max(0, lab.l - drop),
        a: lab.a * chromaScale,
        b: lab.b * chromaScale,
      },
    };
  });
}

/** Çok açılı profilden face (en parlak) ve flop (en koyu) Lab'ı seçer. */
export function faceAndFlop(multiAngle = []) {
  if (!multiAngle.length) return { face: null, flop: null };
  const sorted = [...multiAngle].sort((x, y) => y.lab.l - x.lab.l);
  return { face: sorted[0], flop: sorted[sorted.length - 1] };
}

export const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
