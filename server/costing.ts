/**
 * Maliyet hesabı — çok seviyeli reçeteden birim maliyet.
 *
 * Bugün maliyet elle girilen bir sayı; reçete değişince güncellenmiyor ve
 * hammadde zammı fiyatlara yansımıyor. Bu motor maliyeti reçeteden TÜRETİR:
 *
 *   hammadde birim fiyatı → yarı mamul birim maliyeti → mamul maliyeti
 *
 * Yarı mamuller topolojik sırada bir kez çözülür (capacity.ts ile aynı
 * yaklaşım); her master hazır sonucu okur. Saf fonksiyon, DB gerektirmez.
 */

import type { CapacityFormula, CapacityPackaging } from "./capacity";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type CostMaterial = {
  id: number;
  name: string;
  type: "hammadde" | "yari_mamul" | "ambalaj" | "masraf";
  /** Birim maliyet — hammadde/ambalaj için satın alma fiyatı. */
  unitCost: number | string | null;
};

export type CostMaster = {
  id: number;
  formulaId: number | null;
  formulaScale: number | string;
  packagingId: number | null;
};

export type MasterCost = {
  masterId: number;
  /** Boya/içerik maliyeti (reçeteden, fire dahil). */
  materialCost: number;
  /** Şişe, kapak, etiket, koli. */
  packagingCost: number;
  totalCost: number;
  /** Maliyeti bilinmeyen kalemler — sayı eksik hesaplanmış demektir. */
  unknownInputs: string[];
};

/**
 * Yarı mamullerin birim maliyetini reçetelerinden çözer (topolojik sıra).
 * Döngü varsa o düğümler 0 kalır — capacity.ts döngüyü ayrıca raporlar.
 */
export function resolveUnitCosts(
  materials: CostMaterial[],
  formulas: CapacityFormula[],
): Map<number, number> {
  const unit = new Map<number, number>();
  for (const m of materials) unit.set(m.id, Math.max(0, num(m.unitCost)));

  const formulaByOutput = new Map<number, CapacityFormula>();
  for (const f of formulas) {
    if (f.outputType === "yari_mamul" && f.outputMaterialId != null) {
      formulaByOutput.set(f.outputMaterialId, f);
    }
  }

  // Kahn: girdisi çözülmüş yarı mamulleri sırayla hesapla.
  const nodes = Array.from(formulaByOutput.keys());
  const nodeSet = new Set(nodes);
  const deps = new Map<number, Set<number>>();
  const dependents = new Map<number, number[]>();
  for (const out of nodes) {
    const d = new Set<number>();
    for (const inp of formulaByOutput.get(out)!.inputs) {
      if (nodeSet.has(inp.inputMaterialId) && inp.inputMaterialId !== out) d.add(inp.inputMaterialId);
    }
    deps.set(out, d);
    for (const from of Array.from(d)) dependents.set(from, [...(dependents.get(from) ?? []), out]);
  }

  const queue = nodes.filter(n => (deps.get(n)?.size ?? 0) === 0);
  while (queue.length > 0) {
    const out = queue.shift()!;
    const f = formulaByOutput.get(out)!;
    const base = num(f.baseQty);
    const yieldRatio = 1 - Math.min(Math.max(num(f.wastePercent), 0), 99) / 100;
    if (base > 0 && yieldRatio > 0) {
      let batch = 0;
      for (const inp of f.inputs) {
        batch += num(inp.qtyPerBase) * (unit.get(inp.inputMaterialId) ?? 0);
      }
      // Fire, aynı çıktı için daha çok girdi harcandığı anlamına gelir.
      unit.set(out, batch / (base * yieldRatio));
    }
    for (const dep of dependents.get(out) ?? []) {
      const set = deps.get(dep)!;
      set.delete(out);
      if (set.size === 0) queue.push(dep);
    }
  }

  return unit;
}

/**
 * Master'ların birim maliyetini hesaplar.
 * Boya maliyeti hacimle ölçeklenir; ambalaj adet başına sabittir.
 */
export function computeMasterCosts(input: {
  masters: CostMaster[];
  materials: CostMaterial[];
  formulas: CapacityFormula[];
  packagings: CapacityPackaging[];
}): MasterCost[] {
  const unit = resolveUnitCosts(input.materials, input.formulas);
  const materialById = new Map(input.materials.map(m => [m.id, m]));
  const formulaById = new Map(input.formulas.map(f => [f.id, f]));
  const packById = new Map(input.packagings.map(p => [p.id, p]));

  return input.masters.map((master): MasterCost => {
    const unknown = new Set<string>();
    let materialCost = 0;
    let packagingCost = 0;

    const f = master.formulaId != null ? formulaById.get(master.formulaId) : undefined;
    if (f) {
      const yieldRatio = 1 - Math.min(Math.max(num(f.wastePercent), 0), 99) / 100;
      const scale = num(master.formulaScale) || 1;
      for (const inp of f.inputs) {
        const mat = materialById.get(inp.inputMaterialId);
        // Masraf kalemleri reçetede olsa da birim maliyete girmez.
        if (mat?.type === "masraf") continue;
        const u = unit.get(inp.inputMaterialId) ?? 0;
        if (u <= 0 && mat) unknown.add(mat.name);
        materialCost += num(inp.qtyPerBase) * scale * u * (yieldRatio > 0 ? 1 / yieldRatio : 1);
      }
    }

    const pack = master.packagingId != null ? packById.get(master.packagingId) : undefined;
    if (pack) {
      const items = [
        ...(pack.materialId != null ? [{ materialId: pack.materialId, qtyPerUnit: 1 }] : []),
        ...(pack.inputs ?? []),
      ];
      for (const item of items) {
        const mat = materialById.get(item.materialId);
        if (mat?.type === "masraf") continue;
        const u = unit.get(item.materialId) ?? 0;
        if (u <= 0 && mat) unknown.add(mat.name);
        packagingCost += num(item.qtyPerUnit) * u;
      }
    }

    const round = (n: number) => Math.round(n * 10000) / 10000;
    return {
      masterId: master.id,
      materialCost: round(materialCost),
      packagingCost: round(packagingCost),
      totalCost: round(materialCost + packagingCost),
      unknownInputs: Array.from(unknown),
    };
  });
}

/** Satış fiyatı ve maliyetten kâr — KDV hariç yaklaşım (kanal komisyonu ayrı). */
export function marginOf(price: number, cost: number): { profit: number; marginPercent: number } {
  const profit = price - cost;
  return {
    profit: Math.round(profit * 100) / 100,
    marginPercent: price > 0 ? Math.round((profit / price) * 1000) / 10 : 0,
  };
}
