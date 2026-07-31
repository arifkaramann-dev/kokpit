/**
 * Kapasite ve maliyet motorlarının ortak veri yükleyicisi.
 *
 * ── Neden tek yerde ───────────────────────────────────────────────────────
 * Bu okuma üç ayrı dosyada (katalog router'ı, sipariş rezervasyonu, kapasite
 * işi) neredeyse birebir kopyalanmıştı. Üçü de aynı motorları besliyor, yani
 * biri değişip diğeri değişmezse aynı ürün iki ekranda iki farklı maliyet
 * gösterir — sessiz ve pahalı bir hata sınıfı.
 *
 * Birim dönüşümü eklenirken bu risk somutlaştı: `unit` alanını üç yere birden
 * eklemek gerekiyordu. Kopyayı tek fonksiyona indirmek, bundan sonraki her
 * alan eklemesini de otomatik olarak üç motora birden taşır.
 *
 * Sunucu tarafı okuma yapar; hesabın kendisi saf modüllerdedir
 * (capacity.ts, costing.ts).
 */

import type {
  CapacityFormula,
  CapacityMaster,
  CapacityMaterial,
  CapacityPackaging,
  MaterialType,
} from "./capacity";
import type { CostMaterial } from "./costing";
import * as db from "./db";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type CapacityInputs = {
  materials: CapacityMaterial[];
  /** Maliyet motoru için aynı kalemler — fiyat ve birim taşır. */
  costMaterials: CostMaterial[];
  formulas: CapacityFormula[];
  packagings: CapacityPackaging[];
  masters: CapacityMaster[];
  /** Ham satırlar: çağıranın motorlarda olmayan alanlara erişmesi için. */
  rawMasters: Record<string, unknown>[];
  rawMaterials: Record<string, unknown>[];
};

/**
 * Kapasite/maliyet hesabı için gereken her şeyi tek seferde okur.
 * 5.000 kalemde tam yeniden hesap milisaniyeler sürer; artımlı
 * geçersizleştirme kurmak bu ölçekte gereksiz karmaşıklık olur.
 */
export async function loadCapacityInputs(): Promise<CapacityInputs> {
  const [materials, formulas, formulaInputs, packagings, packagingInputs, masters] =
    await Promise.all([
      db.listMaterials(),
      db.listFormulas(),
      db.listFormulaInputs(),
      db.listPackagings(),
      db.listPackagingInputs(),
      db.listMasterProducts(),
    ]);

  const inputsByFormula = new Map<number, CapacityFormula["inputs"]>();
  for (const fi of formulaInputs as Record<string, unknown>[]) {
    const formulaId = fi.formulaId as number;
    inputsByFormula.set(formulaId, [
      ...(inputsByFormula.get(formulaId) ?? []),
      {
        inputMaterialId: fi.inputMaterialId as number,
        qtyPerBase: num(fi.qtyPerBase),
        // Boşsa miktar kalemin kendi biriminde kabul edilir (eski kayıtlar).
        unit: (fi.unit as string | null) ?? null,
      },
    ]);
  }

  const packInputsById = new Map<number, NonNullable<CapacityPackaging["inputs"]>>();
  for (const pi of packagingInputs as Record<string, unknown>[]) {
    const packagingId = pi.packagingId as number;
    packInputsById.set(packagingId, [
      ...(packInputsById.get(packagingId) ?? []),
      {
        materialId: pi.materialId as number,
        qtyPerUnit: num(pi.qtyPerUnit),
        unit: (pi.unit as string | null) ?? null,
      },
    ]);
  }

  const rawMaterials = materials as Record<string, unknown>[];
  const rawMasters = masters as Record<string, unknown>[];

  return {
    materials: rawMaterials.map(
      (m): CapacityMaterial => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as MaterialType) ?? "hammadde",
        stockQty: m.stockQty as string,
        reservedQty: m.reservedQty as string,
        safetyQty: m.safetyQty as string,
        unit: (m.unit as string | null) ?? null,
      }),
    ),
    costMaterials: rawMaterials.map(
      (m): CostMaterial => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as CostMaterial["type"]) ?? "hammadde",
        unitCost: (m.unitCost as string | null) ?? null,
        unit: (m.unit as string | null) ?? null,
      }),
    ),
    formulas: (formulas as Record<string, unknown>[]).map(
      (f): CapacityFormula => ({
        id: f.id as number,
        outputType: f.outputType as "yari_mamul" | "mamul",
        outputMaterialId: (f.outputMaterialId as number | null) ?? null,
        baseQty: f.baseQty as string,
        baseUnit: (f.baseUnit as string | null) ?? null,
        wastePercent: f.wastePercent as string,
        inputs: inputsByFormula.get(f.id as number) ?? [],
      }),
    ),
    packagings: (packagings as Record<string, unknown>[]).map(
      (p): CapacityPackaging => ({
        id: p.id as number,
        materialId: (p.materialId as number | null) ?? null,
        inputs: packInputsById.get(p.id as number) ?? [],
      }),
    ),
    masters: rawMasters.map(
      (m): CapacityMaster => ({
        id: m.id as number,
        formulaId: (m.formulaId as number | null) ?? null,
        formulaScale: m.formulaScale as string,
        packagingId: (m.packagingId as number | null) ?? null,
      }),
    ),
    rawMasters,
    rawMaterials,
  };
}
