// Kullanıcının kendi ambalaj görselleri.
//
// Yerleşik ambalajlar koddan geliyor (public/packaging/). Buradakiler
// kullanıcının arayüzden yüklediği ek ambalajlar: metadata localStorage'da,
// görsel IndexedDB'de — bir mockup dosyası kolayca 1-2 MB oluyor.
//
// Amaç: yeni bir ambalaj eklemek için kod değişikliği gerekmesin.

import { putAsset, getAsset, deleteAsset } from './assetStore.js';

const KEY = 'aoc.packaging.v1';
const NS = 'pkg'; // IndexedDB anahtar öneki

const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Metadata listesi — görseller ayrı, bu liste hafif kalsın. */
export function listUserPackaging() {
  return read().sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}

export function getUserPackaging(id) {
  return read().find((p) => p.id === id) || null;
}

/**
 * Yeni ambalaj kaydeder.
 * @param {{label:string, line:string, dataUrl:string, id?:string}} input
 */
export async function saveUserPackaging(input) {
  const rows = read();
  const existing = input.id ? rows.find((p) => p.id === input.id) : null;

  const record = {
    id: existing?.id || `pk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: input.label?.trim() || 'İsimsiz ambalaj',
    line: input.line || 'VIVID',
    user: true,
    // alpha bilgisini saklıyoruz: PNG şeffafsa fon temizlemeye gerek yok
    alpha: Boolean(input.alpha),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (input.dataUrl) {
    await putAsset(NS, record.id, input.dataUrl);
  }

  write(existing ? rows.map((p) => (p.id === record.id ? record : p)) : [...rows, record]);
  return record;
}

export async function deleteUserPackaging(id) {
  write(read().filter((p) => p.id !== id));
  await deleteAsset(NS, id);
}

/** Ambalajın görselini döndürür (data URI) — yoksa null. */
export function getUserPackagingImage(id) {
  return getAsset(NS, id);
}

/**
 * Yüklenen PNG'nin gerçekten saydam alanı var mı?
 * Şeffafsa şablonda fon temizleme adımı atlanır; opak bir JPEG'de ise
 * köşelerden beyaza çekmek gerekir.
 */
export function hasTransparency(img) {
  const w = Math.min(img.naturalWidth || img.width, 300);
  const h = Math.min(img.naturalHeight || img.height, 300);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) return true;
  }
  return false;
}
