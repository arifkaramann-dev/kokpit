// Parmak izi kayıtlarının tek tamamlama noktası.
//
// Kayıtlar üç farklı yoldan geliyor — sabit katalog, tarama ekranı, üretim
// ekranı — ve her biri farklı alan kümesi yazıyor. Görüntüleme kodu bu
// alanlarda doğrudan .toFixed() çağırdığı için biri eksik olduğunda sayfa
// çöküyordu. Eksikleri okuyan tarafta değil, burada tamamlıyoruz.
//
// store.js dışında bir dosyada durmasının sebebi: store.js katalog JSON'ını
// Vite alias'ıyla import ediyor, bu modül ise testlerden doğrudan
// çağrılabilsin diye bağımsız kalıyor.

import { hexToRgb, rgbToXyz } from './color.js';
import { getSeries } from './series.js';

function num(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

export function normalizePaint(raw) {
  if (!raw) return null;

  const hex = (raw.hex || '#808080').toLowerCase();
  const series = raw.series || 'Solid';
  const lab = raw.lab || { l: 50, a: 0, b: 0 };
  const srgb = raw.srgb || hexToRgb(hex);

  return {
    ...raw,
    hex,
    series,
    lab,
    srgb,
    xyz: raw.xyz || rgbToXyz(srgb),

    // Malzeme alanları: eksikse seri varsayılanına düş.
    metallic: num(raw.metallic, getSeries(series).pbr.metalness),
    pearl: num(raw.pearl, 0),
    flake: num(raw.flake, 0.2),
    gloss: num(raw.gloss, 70),
    transparency: num(raw.transparency, 0),

    basecoat: raw.basecoat ?? null,
    clearcoat: raw.clearcoat ?? 'High-Gloss',
    multi_angle:
      Array.isArray(raw.multi_angle) && raw.multi_angle.length
        ? raw.multi_angle
        : [{ angle: 45, lab }],

    code: raw.code || '—',
    name: raw.name || 'İsimsiz',
  };
}
