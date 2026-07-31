/**
 * Sipariş ↔ hammadde rezervasyonu.
 *
 * Sipariş ile üretim arasındaki günlerde hammadde "boşta" görünüyordu; sistem
 * aynı 500 gramlık pigmenti arka arkaya on siparişe söz vermeyi hiçbir uyarı
 * vermeden kabul ediyordu. Rezervasyon o boşluğu kapatır.
 *
 * Yaşam döngüsü sipariş DURUMUNA bağlanır — ayrı bir düğmeye değil; ayrı düğme
 * olsaydı unutulur ve defter gerçekle ayrışırdı:
 *
 *   yeni · üretimde  → rezerve et (bir kez)
 *   hazır · tamam    → tüket (rezerv kapanır, stok düşer)
 *   iptal            → serbest bırak (stok yerinde kalır)
 */

import * as db from "./db";
import { loadCapacityInputs } from "./capacityInputs";
import type { CapacityFormula, CapacityMaterial, CapacityPackaging } from "./capacity";
import { planProduction, resolveOrderLines } from "./productionPlan";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type ReservationOutcome = {
  action: "rezerve" | "tuketildi" | "iptal" | "degisiklik_yok";
  /** Rezerve edilen kalem sayısı. */
  reserved: number;
  /** Yetmeyen kalemler — sipariş kabul edilir ama üretim engelli sayılır. */
  short: { materialId: number; name: string; needed: number }[];
  /** Katalogla eşleşmeyen sipariş satırları — ihtiyaç eksik hesaplanmıştır. */
  unmatchedLines: string[];
};


/** Bir siparişin hammadde ihtiyacını satırlarından hesaplar. */
async function orderRequirements(orderId: number) {
  const [items, listings, channelListings] = await Promise.all([
    db.listOrderItems(orderId),
    db.listListings(),
    db.listChannelListings(),
  ]);

  const refsByListing = new Map<number, string[]>();
  for (const c of channelListings as { listingId: number; channelSku: string; channelBarcode: string }[]) {
    refsByListing.set(c.listingId, [
      ...(refsByListing.get(c.listingId) ?? []),
      c.channelSku,
      c.channelBarcode,
    ]);
  }
  const resolvable = (listings as { id: number; masterId: number; title: string }[]).map(l => ({
    masterId: l.masterId,
    listingId: l.id,
    title: l.title,
    channelRefs: refsByListing.get(l.id) ?? [],
  }));

  const resolved = resolveOrderLines(
    (items as {
      id: number;
      orderId: number;
      productName: string;
      quantity: string;
      channelRef: string | null;
      masterId: number | null;
    }[]).map(i => ({
      id: i.id,
      orderId: i.orderId,
      productName: i.productName,
      quantity: num(i.quantity),
      // Kayıtlı bağ ve kanal kodu artık taşınıyor: bulanık başlık
      // eşleştirmesi kritik yoldan çıkıp yedek yola iniyor.
      channelRef: i.channelRef,
      masterId: i.masterId,
    })),
    resolvable,
  );

  const demandMap = new Map<number, number>();
  for (const r of resolved) {
    if (r.masterId == null) continue;
    demandMap.set(r.masterId, (demandMap.get(r.masterId) ?? 0) + r.line.quantity);
  }

  const data = await loadCapacityInputs();
  const plan = planProduction({
    demand: Array.from(demandMap.entries()).map(([masterId, qty]) => ({ masterId, qty })),
    materials: data.materials,
    formulas: data.formulas,
    packagings: data.packagings,
    // Üretim planı ölçeği sayı bekler; yükleyici ham decimal metnini taşır.
    masters: data.masters.map(m => ({ ...m, formulaScale: num(m.formulaScale) })),
  });

  return {
    plan,
    unmatchedLines: resolved.filter(r => r.masterId == null).map(r => r.line.productName),
  };
}

/**
 * Sipariş durumuna göre rezervasyonu eşitler. Durum değişmemişse ya da zaten
 * doğru durumdaysa hiçbir şey yapmaz (idempotent) — panoda kart sürüklerken
 * aynı durum tekrar yazılabiliyor.
 */
export async function syncOrderReservation(
  orderId: number,
  status: "new" | "production" | "ready" | "done" | "cancelled",
): Promise<ReservationOutcome> {
  const empty: ReservationOutcome = { action: "degisiklik_yok", reserved: 0, short: [], unmatchedLines: [] };

  if (status === "cancelled") {
    const n = await db.closeOrderReservations(orderId, "release");
    return n > 0 ? { ...empty, action: "iptal", reserved: n } : empty;
  }

  if (status === "ready" || status === "done") {
    const n = await db.closeOrderReservations(orderId, "consume");
    return n > 0 ? { ...empty, action: "tuketildi", reserved: n } : empty;
  }

  // yeni / üretimde: rezerv yoksa aç.
  if (await db.hasActiveReservation(orderId)) return empty;

  const { plan, unmatchedLines } = await orderRequirements(orderId);
  // Yalnız SATIN ALINAN kalemler rezerve edilir; yarı mamul üretileceği için
  // onun kendi girdileri zaten listede ayrıca duruyor.
  const targets = plan.needs.filter(n => n.type !== "yari_mamul" && n.needed > 0);
  if (targets.length === 0) {
    return { ...empty, unmatchedLines };
  }

  const done: { materialId: number; qty: number }[] = [];
  const short: ReservationOutcome["short"] = [];
  for (const t of targets) {
    const ok = await db.reserveMaterial(t.materialId, t.needed);
    if (ok) done.push({ materialId: t.materialId, qty: t.needed });
    else short.push({ materialId: t.materialId, name: t.name, needed: t.needed });
  }

  // Kısmi rezervasyon bırakılmaz: bir kalem yetmiyorsa üretim zaten yapılamaz,
  // ayrılan malzeme başka siparişlerin kapasitesini boşuna kilitler.
  if (short.length > 0) {
    for (const d of done) await db.releaseMaterial(d.materialId, d.qty);
    return { ...empty, short, unmatchedLines };
  }

  for (const d of done) await db.recordReservation(orderId, d.materialId, d.qty);
  return { action: "rezerve", reserved: done.length, short: [], unmatchedLines };
}
