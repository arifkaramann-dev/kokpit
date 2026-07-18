/**
 * Yeniden sipariş önerisi (Purchase reorder — Odoo/Bizimhesap parite).
 * Kritik eşiğin altındaki hammaddeler için önerilen alım miktarı + tedarikçi +
 * tahmini maliyet. Saf fonksiyon — testlenebilir, router yalnız veriyi besler.
 */

export type ReorderMaterial = {
  id: number;
  name: string;
  unit: string;
  stockQty: string | number;
  criticalQty: string | number;
  unitCost: string | number;
  supplierId: number | null;
};

export type ReorderSupplier = { id: number; name: string };

export type ReorderSuggestion = {
  materialId: number;
  name: string;
  unit: string;
  stock: number;
  critical: number;
  /** Önerilen alım miktarı: stoku kritik eşiğin 2 katına tamamlar. */
  suggestedQty: number;
  unitCost: number;
  estimatedCost: number;
  supplierId: number | null;
  supplierName: string | null;
};

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Kritik eşiği tanımlı (>0) ve stoğu eşiğin altına inmiş hammaddeler için öneri
 * üretir. Hedef stok = kritik × 2 (bir kritik tampon üstü); öneri stoku hedefe
 * tamamlar. En düşük stoktan başlayarak sıralanır.
 */
export function computeReorderSuggestions(
  materials: ReorderMaterial[],
  suppliers: ReorderSupplier[],
): ReorderSuggestion[] {
  const supplierName = new Map(suppliers.map(s => [s.id, s.name]));
  const out: ReorderSuggestion[] = [];

  for (const m of materials) {
    const stock = num(m.stockQty);
    const critical = num(m.criticalQty);
    if (critical <= 0) continue; // eşik yok = takip yok
    if (stock > critical) continue; // yeterli
    const target = critical * 2;
    const suggestedQty = Math.max(target - stock, critical - stock, 1);
    const unitCost = num(m.unitCost);
    out.push({
      materialId: m.id,
      name: m.name,
      unit: m.unit,
      stock,
      critical,
      suggestedQty: +suggestedQty.toFixed(3),
      unitCost,
      estimatedCost: +(suggestedQty * unitCost).toFixed(2),
      supplierId: m.supplierId,
      supplierName: m.supplierId != null ? supplierName.get(m.supplierId) ?? null : null,
    });
  }

  return out.sort((a, b) => a.stock - a.critical - (b.stock - b.critical));
}

/** Öneri özeti: kalem sayısı, toplam tahmini maliyet, tedarikçisiz kalem sayısı. */
export function summarizeReorder(suggestions: ReorderSuggestion[]) {
  return {
    count: suggestions.length,
    totalCost: +suggestions.reduce((s, r) => s + r.estimatedCost, 0).toFixed(2),
    withoutSupplier: suggestions.filter(r => r.supplierId == null).length,
  };
}
