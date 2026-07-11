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
