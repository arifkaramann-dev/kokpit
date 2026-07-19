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

/** Sabit türev başlığı öneki (buildSaleTitle ile aynı). */
const SALE_TITLE_PREFIX = "Artofcolour";

/** Ana ürün adı değişince türev başlığındaki gömülü eski adı yenisiyle değiştirir.
 *  Türev başlığı buildSaleTitle ile üretildiğinden ana ürün adı başlıkta birebir
 *  yer alır ("Artofcolour {yüzey} {ANA AD} {ambalaj} {renk} {set}"); yalnızca o
 *  segment değiştirilir, sabit "Artofcolour" öneki ile yüzey/ambalaj/renk/set
 *  ekleri korunur. Eski ad başlıkta hiç geçmiyorsa (ör. elle farklılaştırılmış
 *  türev) başlık olduğu gibi bırakılır. */
export function renameVariantTitle(
  variantName: string,
  oldParentName: string,
  newParentName: string
): string {
  const oldName = oldParentName.trim();
  const newName = newParentName.trim();
  if (!oldName || oldName === newName) return variantName;
  // Sabit öneki ("Artofcolour ") atla ki ana ad ondan sonraki ilk eşleşmede bulunsun;
  // böylece ana ad da "Artofcolour" ile başlasa önek yanlışlıkla değiştirilmez.
  const from = variantName.startsWith(`${SALE_TITLE_PREFIX} `) ? SALE_TITLE_PREFIX.length : 0;
  const idx = variantName.indexOf(oldName, from);
  if (idx === -1) return variantName;
  return (variantName.slice(0, idx) + newName + variantName.slice(idx + oldName.length))
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
