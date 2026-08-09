// Renk kütüphanesi — pazarlama tarafının tek kaynağı.
//
// Metadata burada (küçük, sık okunuyor → localStorage), üretilen görseller
// assetStore'da (büyük → IndexedDB). Ayrı tutulmalarının sebebi bu.
//
// İlke: bir renk bir kere üretilir, kaydedilir, sonra hep aynı görseli
// kullanır. Aynı renge her bakışta farklı bir görsel çıkarsa katalog
// tutarsızlaşır ve müşteri neyin gerçek olduğunu bilemez.

import { deleteColorAssets } from './assetStore.js';

const KEY = 'aoc.colors.v1';
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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

export function listColors() {
  return read().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

export function getColor(id) {
  return read().find((c) => c.id === id) || null;
}

/** Koda göre bul — aynı kod iki kere kaydedilmesin. */
export function findByCode(code) {
  const wanted = String(code || '').trim().toUpperCase();
  if (!wanted) return null;
  return read().find((c) => String(c.code).trim().toUpperCase() === wanted) || null;
}

/**
 * Kaydeder ya da günceller. Kod aynıysa üzerine yazar —
 * kütüphanede tek bir VP1104 olmalı.
 */
export function saveColor(input) {
  const rows = read();
  const existing = input.id
    ? rows.find((c) => c.id === input.id)
    : findByCode(input.code);

  const record = {
    ...existing,
    ...input,
    id: existing?.id || input.id || `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const next = existing
    ? rows.map((c) => (c.id === record.id ? record : c))
    : [...rows, record];

  write(next);
  return record;
}

export async function deleteColor(id) {
  write(read().filter((c) => c.id !== id));
  await deleteColorAssets(id);
}

/** Hangi objeler üretilmiş — metadata tarafında da tutuyoruz ki liste hızlı çizilsin. */
export function markGenerated(id, objectId) {
  const rows = read();
  const row = rows.find((c) => c.id === id);
  if (!row) return null;
  const generated = new Set(row.generated || []);
  generated.add(objectId);
  const updated = { ...row, generated: [...generated], updatedAt: new Date().toISOString() };
  write(rows.map((c) => (c.id === id ? updated : c)));
  return updated;
}

export function unmarkGenerated(id, objectId) {
  const rows = read();
  const row = rows.find((c) => c.id === id);
  if (!row) return null;
  const generated = (row.generated || []).filter((o) => o !== objectId);
  const updated = { ...row, generated, updatedAt: new Date().toISOString() };
  write(rows.map((c) => (c.id === id ? updated : c)));
  return updated;
}
