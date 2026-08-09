// Yerel veri katmanı.
// Katalog src/data/paints.json içinde sabit; kullanıcının taradığı parmak
// izleri localStorage'da tutulur. API, Base44 entity çağrılarının yerini alır.

import catalog from '@/data/paints.json';
import { normalizePaint } from './normalize.js';

export { normalizePaint };

const KEY = 'aoc.fingerprints.v1';
const listeners = new Set();

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Katalog + kullanıcı taramaları, en yeni tarama en üstte. Hepsi normalize. */
export function listPaints() {
  const scans = readLocal().sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
  return [...scans, ...catalog].map(normalizePaint);
}

export function listCatalog() {
  return catalog.map(normalizePaint);
}

export function listScans() {
  return readLocal()
    .sort((a, b) => (a.created_date < b.created_date ? 1 : -1))
    .map(normalizePaint);
}

export function recent(limit = 6) {
  return listPaints().slice(0, limit);
}

export function getPaint(id) {
  return listPaints().find((p) => p.id === id) || null;
}

export function bySeries(series) {
  if (!series) return listPaints();
  return listPaints().filter((p) => p.series === series);
}

/** Yeni parmak izi kaydeder ve kaydı döndürür. */
export function createFingerprint(record) {
  const rows = readLocal();
  const entry = {
    ...record,
    id: record.id || `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    is_scan: true,
    created_date: new Date().toISOString(),
  };
  rows.push(entry);
  writeLocal(rows);
  return normalizePaint(entry);
}

export function deleteFingerprint(id) {
  writeLocal(readLocal().filter((p) => p.id !== id));
}

export function clearScans() {
  writeLocal([]);
}

/** Tarama kodu üretir — canlı uygulamadaki TARA-##### formatı. */
export function nextScanCode() {
  return `TARA-${Math.floor(10000 + Math.random() * 89999)}`;
}
