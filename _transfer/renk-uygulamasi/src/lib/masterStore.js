// Master obje deposu.
//
// Problem: her rengi ayrı ayrı ürettirince AI her seferinde farklı bir şekil
// çiziyor. Yeşil damla ile magenta damla farklı formda çıkıyor, katalog
// dağılıyor — müşteri iki numuneyi yan yana koyduğunda rengi değil şekil
// farkını görüyor.
//
// Çözüm: obje tipi başına BİR master görsel. Sonraki renkler sıfırdan
// üretilmiyor; master referans olarak gönderilip "yalnızca rengi değiştir"
// deniyor. Şekil, ışık ve kompozisyon sabit kalıyor.

import { putAsset, getAsset, deleteAsset } from './assetStore.js';

const KEY = 'aoc.masters.v1';
const NS = 'master';
const listeners = new Set();

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function write(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hangi obje tipleri için master var — arayüzde rozet göstermek için. */
export function listMasters() {
  return read();
}

export function hasMaster(objectId) {
  return Boolean(read()[objectId]);
}

export function getMasterImage(objectId) {
  return getAsset(NS, objectId);
}

/**
 * Bir görseli o obje tipinin master'ı yapar.
 * @param {string} objectId
 * @param {string} dataUrl
 * @param {{fromColor?:string}} meta hangi renkten alındığı — izlenebilirlik
 */
export async function setMaster(objectId, dataUrl, meta = {}) {
  await putAsset(NS, objectId, dataUrl);
  const map = read();
  map[objectId] = {
    setAt: new Date().toISOString(),
    fromColor: meta.fromColor || null,
  };
  write(map);
  return map[objectId];
}

export async function clearMaster(objectId) {
  await deleteAsset(NS, objectId);
  const map = read();
  delete map[objectId];
  write(map);
}
