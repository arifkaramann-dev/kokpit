/** Türev ürün için satışa yönelik başlık üretir.
 *  Örn: "Artofcolour 3D Baskı Astar 400 ml Sprey Açık Gri 2'li Set" */
export function buildSaleTitle(
  parentName: string,
  use?: string | null,
  packaging?: string | null,
  color?: string | null,
  set?: string | null
) {
  return ["Artofcolour", use, parentName, packaging, color, set]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "2'li Set", "3 lü paket", "6x" gibi ifadelerden adet çıkarır (bulunamazsa 1). */
export function parseSetCount(set?: string | null): number {
  if (!set) return 1;
  const match = set.match(/\d+/);
  const n = match ? parseInt(match[0], 10) : 1;
  return n >= 1 ? n : 1;
}

export type DeriveCombo = {
  use: string | null;
  packaging: string | null;
  color: string | null;
  set: string | null;
};

/* ------------------------- Üretim planlama ------------------------- */

export type ProductionFormulaLine = {
  materialId: number;
  materialName?: string | null;
  qty: string | number;
};

export type ProductionMaterial = {
  id: number;
  name: string;
  stockQty: string | number;
};

export type ProductionPlan = {
  /** Stoktan düşülecek hammadde miktarları (yalnızca gerekli > 0 olanlar). */
  deductions: { materialId: number; qty: number }[];
  /** Stoğu yetmeyen (ya da hiç bulunmayan) hammadde açıklamaları. */
  missing: string[];
};

function toNum(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bir ürünü `qty` adet üretmek için reçeteyi ve mevcut stoğu değerlendirir;
 * her hammadde için gereken miktarı (deductions) ve stoğu yetmeyenlerin
 * listesini (missing) döner. Saf fonksiyon — DB'ye dokunmaz, birim test edilir.
 * Böylece "planla" ile "uygula" (transaction) ayrışır ve stok düşümü atomik olur.
 */
export function planProduction(
  formula: ProductionFormulaLine[],
  materials: ProductionMaterial[],
  qty: number,
): ProductionPlan {
  const byId = new Map(materials.map(m => [m.id, m]));
  const deductions: { materialId: number; qty: number }[] = [];
  const missing: string[] = [];
  for (const f of formula) {
    const need = qty * toNum(f.qty);
    const m = byId.get(f.materialId);
    const stock = m ? toNum(m.stockQty) : 0;
    if (!m || stock < need) {
      missing.push(`${f.materialName ?? m?.name ?? "?"} (gereken ${need}, stok ${stock})`);
    }
    if (need > 0) deductions.push({ materialId: f.materialId, qty: need });
  }
  return { deductions, missing };
}

/** Boş boyutlar tek elemanlı [null] sayılır; kombinasyon listesi döner. */
export function deriveCombos(
  uses: string[],
  packagings: string[],
  colors: string[],
  sets: string[] = []
): DeriveCombo[] {
  const u = uses.length ? uses : [null];
  const p = packagings.length ? packagings : [null];
  const c = colors.length ? colors : [null];
  const s = sets.length ? sets : [null];
  const combos: DeriveCombo[] = [];
  for (const a of u)
    for (const b of p)
      for (const d of c)
        for (const e of s) combos.push({ use: a, packaging: b, color: d, set: e });
  return combos;
}
