/**
 * Katalog otomasyonu — zamanlayıcının çağırdığı işler.
 *
 * Bu işler olmadan sistem elle çalışıyordu: hammadde stoğu değişince
 * kapasite güncellenmiyor, yeni reçete girilince master'lar bağlanmıyordu.
 * Yani ilanlardaki miktar gerçeği yansıtmıyor, kart "reçetesiz" görünmeye
 * devam ediyordu.
 *
 * İkisi de IDEMPOTENT ve kendini onarır: her turda tam yeniden hesap yapar,
 * artımlı geçersizleştirme durumu tutmaz. 5.000 kalemde tam hesap
 * milisaniyeler sürdüğü için bu ölçekte doğru takas.
 */

import { computeCapacity, listingQty } from "./capacity";
import * as db from "./db";
import { loadCapacityInputs } from "./capacityInputs";
import { planFormulaBindings, type MatchableFormula } from "./formulaMatch";
import type { CapacityFormula, CapacityMaterial, MaterialType } from "./capacity";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Kapasiteyi yeniden hesaplar, master'lara yazar ve İLANA YAZILACAK SAYI
 * değişen yayınları kirli işaretler.
 *
 * Kirletme ölçütü kapasite değil, `min(kapasite, tavan)` — kapasite 600'den
 * 40'a düşse bile ilan 10'da kalıyorsa pazaryerine gönderim gerekmez.
 * Aksi halde her stok hareketi binlerce gereksiz güncelleme üretirdi.
 */
export async function runCapacityRecompute(): Promise<{
  masters: number;
  written: number;
  dirtied: number;
  zeroed: number;
  cycles: number;
}> {
  const data = await loadCapacityInputs();
  const rawMasters = data.rawMasters;

  if (rawMasters.length === 0) {
    return { masters: 0, written: 0, dirtied: 0, zeroed: 0, cycles: 0 };
  }

  const report = computeCapacity({
    materials: data.materials,
    formulas: data.formulas,
    packagings: data.packagings,
    masters: data.masters,
  });

  const capById = new Map(rawMasters.map(m => [m.id as number, Number(m.virtualStockCap ?? 10)]));
  const prevById = new Map(rawMasters.map(m => [m.id as number, Number(m.buildableQty ?? 0)]));

  const dirtyMasters = report.masters
    .filter(m => {
      const cap = capById.get(m.masterId) ?? 10;
      return listingQty(m.buildable, cap) !== listingQty(prevById.get(m.masterId) ?? 0, cap);
    })
    .map(m => m.masterId);

  const written = await db.writeBuildableQty(
    report.masters.map(m => ({ masterId: m.masterId, buildable: m.buildable })),
  );
  const dirtied = await db.markChannelListingsDirty(dirtyMasters);

  return {
    masters: report.masters.length,
    written,
    dirtied,
    zeroed: report.masters.filter(m => m.buildable <= 0).length,
    cycles: report.cycles.length,
  };
}

/**
 * Reçetesiz master'ları koordinatına uyan reçeteye bağlar.
 * Var olan bağları değiştirmez — elle yapılmış özel bağlama korunur.
 */
export async function runFormulaBinding(): Promise<{ bound: number; unmatched: number }> {
  const [formulas, masters, packagings] = await Promise.all([
    db.listFormulas(),
    db.listMasterProducts(),
    db.listPackagings(),
  ]);
  if ((formulas as unknown[]).length === 0 || (masters as unknown[]).length === 0) {
    return { bound: 0, unmatched: 0 };
  }

  const volumeById = new Map(
    (packagings as { id: number; volumeMl: string }[]).map(p => [p.id, num(p.volumeMl)]),
  );
  const plan = planFormulaBindings({
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      familyId: m.familyId as number,
      readiness: m.readiness as "konsantre" | "r2u",
      packagingVolumeMl: volumeById.get(m.packagingId as number) ?? 0,
      currentFormulaId: (m.formulaId as number | null) ?? null,
    })),
    formulas: (formulas as Record<string, unknown>[]).map(
      (f): MatchableFormula => ({
        id: f.id as number,
        outputType: f.outputType as "yari_mamul" | "mamul",
        seriesId: (f.seriesId as number | null) ?? null,
        colorId: (f.colorId as number | null) ?? null,
        familyId: (f.familyId as number | null) ?? null,
        readiness: (f.readiness as "konsantre" | "r2u" | null) ?? null,
        baseQty: num(f.baseQty),
      }),
    ),
  });

  for (const b of plan.bindings) {
    await db.updateMasterProduct(b.masterId, {
      formulaId: b.formulaId,
      formulaScale: String(b.formulaScale),
    } as never);
  }
  return { bound: plan.bindings.length, unmatched: plan.unmatched.length };
}
