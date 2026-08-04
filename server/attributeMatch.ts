import { normalizeName } from "./catalogRestructure";

/**
 * Bizim boyut değerlerimizi (renk/ambalaj/form/seri) pazaryerinin kabul ettiği
 * değerlere ADA GÖRE eşleştirir.
 *
 * Elle eşleme şöyleydi: pazaryeri panelini aç, "Fuşya"yı bul, kimliğini kopyala,
 * Kokpit'e yapıştır — 30 renk × her özellik × her kanal. Seçenek kataloğu artık
 * saklandığı için eşleşmelerin çoğu ad karşılaştırmasıyla kendiliğinden bulunur.
 *
 * Öneri KESİN DEĞİLDİR: yanlış değer kartın reddedilmesine ya da ürünün yanlış
 * renkle listelenmesine yol açar. Bu yüzden modül hiçbir şey yazmaz — yalnız
 * önerir, güveni söyler; yazma kararı kullanıcınındır.
 *
 * Saf modül — ağ ve veritabanı yok, test edilebilir.
 */

export type MarketplaceOption = { valueId: number; valueName: string };
export type DimensionValue = { id: number; name: string };

export type MatchProposal = {
  dimensionId: number;
  dimensionName: string;
  valueId: number;
  valueName: string;
  /** "tam": adlar birebir · "yakin": biri diğerini içeriyor. */
  confidence: "tam" | "yakin";
};

export type MatchResult = {
  proposals: MatchProposal[];
  /** Karşılığı bulunamayanlar — kullanıcı elle seçer. */
  unmatched: DimensionValue[];
};

/**
 * Kelime kümesi: "Açık Mavi" ≡ "Mavi Açık". Pazaryerleri sıfat sırasını
 * bizden farklı yazabiliyor, bu yüzden sıra yok sayılır.
 */
function wordSet(raw: string): Set<string> {
  return new Set(normalizeName(raw).split(" ").filter(Boolean));
}

function sameWords(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  return Array.from(a).every(w => b.has(w));
}

/** a'nın tüm kelimeleri b'de var mı? ("Fuşya" ⊂ "Fuşya Pembe") */
function subsetOf(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false;
  return Array.from(a).every(w => b.has(w));
}

/**
 * Eşleştirmeyi hesaplar.
 *
 * Sıra önemli: önce birebir ad, sonra kelime kümesi, en son kapsama. Bir
 * pazaryeri değeri İKİ boyuta birden verilmez — ilk (daha güvenli) eşleşme
 * kazanır, ikincisi eşleşmemiş sayılır. Aksi hâlde "Mavi" hem "Mavi" hem
 * "Açık Mavi" için önerilir ve biri sessizce yanlış olurdu.
 */
export function matchAttributeValues(
  dimensions: DimensionValue[],
  options: MarketplaceOption[],
): MatchResult {
  const proposals: MatchProposal[] = [];
  const unmatched: DimensionValue[] = [];
  const usedValueIds = new Set<number>();

  const prepared = options.map(o => ({
    ...o,
    norm: normalizeName(o.valueName),
    words: wordSet(o.valueName),
  }));

  // Tam eşleşmeler önce toplanır: "Mavi" boyutu, "Açık Mavi"ye kapsama ile
  // kapılmadan kendi birebir karşılığını alsın.
  const pending: { dim: DimensionValue; norm: string; words: Set<string> }[] = [];
  for (const dim of dimensions) {
    const norm = normalizeName(dim.name);
    const words = wordSet(dim.name);
    const exact = prepared.find(o => o.norm === norm && !usedValueIds.has(o.valueId));
    if (exact) {
      usedValueIds.add(exact.valueId);
      proposals.push({
        dimensionId: dim.id,
        dimensionName: dim.name,
        valueId: exact.valueId,
        valueName: exact.valueName,
        confidence: "tam",
      });
      continue;
    }
    pending.push({ dim, norm, words });
  }

  for (const { dim, words } of pending) {
    const free = prepared.filter(o => !usedValueIds.has(o.valueId));
    // Kelime kümesi eşitliği hâlâ "tam" sayılır: yalnız sıra farklı.
    const sameOrder = free.find(o => sameWords(words, o.words));
    if (sameOrder) {
      usedValueIds.add(sameOrder.valueId);
      proposals.push({
        dimensionId: dim.id,
        dimensionName: dim.name,
        valueId: sameOrder.valueId,
        valueName: sameOrder.valueName,
        confidence: "tam",
      });
      continue;
    }

    // Kapsama: en kısa aday seçilir — "Fuşya" için "Fuşya Pembe",
    // "Fuşya Pembe Koyu"ya tercih edilir (daha az varsayım).
    const contained = free
      .filter(o => subsetOf(words, o.words) || subsetOf(o.words, words))
      .sort((a, b) => a.words.size - b.words.size)[0];
    if (contained) {
      usedValueIds.add(contained.valueId);
      proposals.push({
        dimensionId: dim.id,
        dimensionName: dim.name,
        valueId: contained.valueId,
        valueName: contained.valueName,
        confidence: "yakin",
      });
      continue;
    }

    unmatched.push(dim);
  }

  return { proposals, unmatched };
}
