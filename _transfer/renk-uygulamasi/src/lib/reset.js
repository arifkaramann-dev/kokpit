// Tam temizlik.
//
// Veri üç ayrı yerde duruyor ve biri unutulursa uygulama yarı dolu kalır:
//   - localStorage `aoc.colors.v1`      → renk kütüphanesi metadata'sı
//   - localStorage `aoc.fingerprints.v1` → eski tarama kayıtları
//   - IndexedDB   `aoc-assets`          → üretilmiş görseller
//
// Katalog dosyası (src/data/paints.json) koddan geliyor, burada silinmez.

import { clearAllAssets } from './assetStore.js';

const LOCAL_KEYS = ['aoc.colors.v1', 'aoc.fingerprints.v1'];

/** @returns {Promise<{cleared:string[], errors:string[]}>} */
export async function resetAll() {
  const cleared = [];
  const errors = [];

  for (const key of LOCAL_KEYS) {
    try {
      const had = localStorage.getItem(key) !== null;
      localStorage.removeItem(key);
      if (had) cleared.push(key);
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  try {
    const removed = await clearAllAssets();
    cleared.push(`${removed} görsel`);
  } catch (err) {
    errors.push(`görseller: ${err?.message || 'silinemedi'}`);
  }

  return { cleared, errors };
}

/** Şu an ne kadar veri var — temizlemeden önce göstermek için. */
export function currentCounts() {
  const read = (k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || '[]');
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  };
  return {
    colors: read('aoc.colors.v1'),
    fingerprints: read('aoc.fingerprints.v1'),
  };
}
