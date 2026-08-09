/**
 * CIELAB renk bilimi — D65 / 2° gözlemci.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * Kokpit bugüne kadar rengi tek bir hex dizesi olarak biliyordu: `#C2185B`.
 * Hex bir renk ADI, ölçü değil — iki hex'in "ne kadar farklı" olduğu sorusuna
 * cevap veremez. RGB uzayında iki nokta arasındaki mesafe insan gözünün
 * gördüğü farkla örtüşmez: koyu tonlarda küçük RGB farkı gözle belirgin,
 * açık tonlarda büyük fark neredeyse görünmezdir.
 *
 * CIELAB algısal olarak düzgün bir uzaydır; CIEDE2000 (ΔE2000) ise o uzayda
 * "insan bu iki rengi ne kadar farklı görür" sorusunun endüstri standardı
 * cevabıdır. Boya işinde bu soru merkezi: müşterinin gördüğü renkle eline
 * geçen arasındaki fark, iade sebebidir.
 *
 * ── Sözleşme ──────────────────────────────────────────────────────────────
 * Tüm hesaplar D65 / 2° altında yapılır — başka bir aydınlatmaya göre ölçülen
 * değer buraya girmeden önce D65'e uyarlanmalıdır, yoksa karşılaştırma sessizce
 * yanlış çıkar.
 *
 * ΔE2000 eşikleri (`deltaELabel`) grafik sanatlar kabulüdür: ΔE < 1 gözle
 * ayırt edilemez, ΔE < 2 çok yakın. Boya kabul kriteri sektöre göre değişir;
 * bu fonksiyon karar vermez, yalnız insan diline çevirir.
 *
 * Saf modül: veritabanı, tarih, rastgelelik, tarayıcı API'si yok. Hem sunucu
 * hem istemci aynı sonucu üretir — renk eşleştirmesi nerede koşarsa koşsun
 * aynı cevabı vermek zorundadır.
 *
 * Doğruluk: `deltaE2000`, Sharma, Wu & Dalal (2005) referans veri kümesindeki
 * 34 test vakasının tamamını 1e-4 toleransla geçer (bkz. color.test.ts).
 */

/** sRGB bileşenleri, 0..255. */
export type Rgb = { r: number; g: number; b: number };

/** CIE XYZ, D65 beyaz noktasına göre 0..100 ölçeğinde. */
export type Xyz = { x: number; y: number; z: number };

/** CIELAB: l 0..100, a/b yaklaşık -128..127. */
export type Lab = { l: number; a: number; b: number };

/** Tek bir gözlem açısındaki renk — metalik boyanın açıyla değişimi. */
export type AngleSample = { angle: number; lab: Lab };

/** ΔE2000'in insan diline çevrilmiş hali; `tone` arayüz rengi içindir. */
export type DeltaELabel = {
  text: string;
  tone: 'emerald' | 'lime' | 'amber' | 'orange' | 'rose';
};

/** D65 / 2° beyaz noktası. */
const D65: Xyz = { x: 95.047, y: 100.0, z: 108.883 };

export function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v;
}

export function hexToRgb(hex: string): Rgb {
  const h = String(hex).replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** sRGB gama sökümü (IEC 61966-2-1). 0..255 girer, 0..1 lineer çıkar. */
export function linearize(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 0..1 lineer girer, 0..255 sRGB çıkar. */
export function delinearize(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(c, 0, 1) * 255;
}

/** {r,g,b} 0..255 sRGB → [r,g,b] 0..1 lineer */
export function rgbToLinear({ r, g, b }: Rgb): [number, number, number] {
  return [linearize(r), linearize(g), linearize(b)];
}

/** [r,g,b] 0..1 lineer → {r,g,b} 0..255 sRGB */
export function linearToRgb([r, g, b]: readonly [number, number, number]): Rgb {
  return { r: delinearize(r), g: delinearize(g), b: delinearize(b) };
}

export function rgbToXyz({ r, g, b }: Rgb): Xyz {
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return {
    x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
    y: (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100,
    z: (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100,
  };
}

export function xyzToRgb({ x, y, z }: Xyz): Rgb {
  const X = x / 100;
  const Y = y / 100;
  const Z = z / 100;
  return {
    r: delinearize(X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314),
    g: delinearize(X * -0.969266 + Y * 1.8760108 + Z * 0.041556),
    b: delinearize(X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252),
  };
}

function fLab(t: number): number {
  const e = 216 / 24389;
  const k = 24389 / 27;
  return t > e ? Math.cbrt(t) : (k * t + 16) / 116;
}

function fLabInv(t: number): number {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const t3 = t * t * t;
  return t3 > e ? t3 : (116 * t - 16) / k;
}

export function xyzToLab({ x, y, z }: Xyz): Lab {
  const fx = fLab(x / D65.x);
  const fy = fLab(y / D65.y);
  const fz = fLab(z / D65.z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToXyz({ l, a, b }: Lab): Xyz {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    x: fLabInv(fx) * D65.x,
    y: fLabInv(fy) * D65.y,
    z: fLabInv(fz) * D65.z,
  };
}

export function rgbToLab(rgb: Rgb): Lab {
  return xyzToLab(rgbToXyz(rgb));
}

export function labToRgb(lab: Lab): Rgb {
  return xyzToRgb(labToXyz(lab));
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab));
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const deg = (Math.atan2(b, ap) * 180) / Math.PI;
  return deg >= 0 ? deg : deg + 360;
}

/**
 * CIEDE2000 renk farkı. Sharma/Wu/Dalal referans uygulaması.
 * kL, kC, kH ağırlıkları grafik sanatlar için 1:1:1 bırakıldı.
 */
export function deltaE2000(lab1: Lab, lab2: Lab, kL = 1, kC = 1, kH = 1): number {
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

  let hbarp: number;
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
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );
}

/** ΔE2000 değerini insan diline çevirir. */
export function deltaELabel(dE: number): DeltaELabel {
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
 *
 * DİKKAT: bu bir ÖLÇÜM değil, ölçüm yokken makul bir tahmindir. Gerçek çok
 * açılı veri (spektrofotometre ya da fotoğraf ölçümü) varsa o kullanılmalı.
 */
export function synthesizeMultiAngle(
  lab: Lab,
  { metallic = 0, pearl = 0, flake = 0 }: { metallic?: number; pearl?: number; flake?: number } = {},
): AngleSample[] {
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
export function faceAndFlop(multiAngle: readonly AngleSample[] = []): {
  face: AngleSample | null;
  flop: AngleSample | null;
} {
  if (!multiAngle.length) return { face: null, flop: null };
  const sorted = [...multiAngle].sort((x, y) => y.lab.l - x.lab.l);
  return { face: sorted[0], flop: sorted[sorted.length - 1] };
}

/** Sayıyı sabit basamakla yazar; sayı değilse tire döner (tablo hizası için). */
export const fmt = (n: number, d = 2): string => (Number.isFinite(n) ? n.toFixed(d) : '—');
