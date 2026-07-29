/**
 * Pazaryeri kategorisi arama ve otomatik öneri.
 *
 * Kategori kimliğini elle bulmak, pazaryeri panelinde ağacı gezip sayıyı
 * kopyalamak demekti; her kullanım alanı × kanal için ayrı ayrı. Trendyol'un
 * kategori ağacı zaten API'den çekilebiliyor — arama ve eşleştirme burada.
 *
 * İki iş:
 *  1. Ağacı YAPRAK listesine düzleştir (yalnız yaprağa ürün açılabilir)
 *  2. Kullanım alanı adına en yakın yaprakları puanla ve öner
 *
 * Öneri KESİN DEĞİLDİR — kullanıcı onaylamadan yazılmaz. Yanlış kategori,
 * kartın reddedilmesine ya da yanlış vitrinde görünmesine yol açar; bu yüzden
 * eşik yüksek tutulur ve puan ekranda gösterilir.
 *
 * Saf modül — ağ yok, test edilebilir.
 */

/** Pazaryerinden gelen ham kategori düğümü (Trendyol/HB ortak şekli). */
export type RawCategory = {
  id?: number | string;
  categoryId?: number | string;
  name?: string;
  categoryName?: string;
  subCategories?: RawCategory[];
  children?: RawCategory[];
  leaf?: boolean;
  parentId?: number | string | null;
};

export type FlatCategory = {
  id: string;
  name: string;
  /** Kök → yaprak yolu: "Hobi > Boya > Airbrush Boyası". */
  path: string;
  /** Alt kategorisi yok — yalnız buraya ürün açılabilir. */
  isLeaf: boolean;
};

const nameOf = (c: RawCategory): string => String(c.name ?? c.categoryName ?? "").trim();
const idOf = (c: RawCategory): string => String(c.id ?? c.categoryId ?? "").trim();
const childrenOf = (c: RawCategory): RawCategory[] => c.subCategories ?? c.children ?? [];

/**
 * Kategori ağacını düz listeye çevirir.
 *
 * Trendyol `subCategories`, HB `children` kullanır; ikisi de desteklenir.
 * Yanıt bazen `{categories: [...]}` bazen doğrudan dizi gelir — çağıran
 * tarafın şekil tahmin etmesi gerekmesin diye ikisi de kabul edilir.
 */
export function flattenCategories(raw: unknown): FlatCategory[] {
  const roots: RawCategory[] = Array.isArray(raw)
    ? (raw as RawCategory[])
    : (((raw as Record<string, unknown>)?.categories ??
        (raw as Record<string, unknown>)?.data ??
        []) as RawCategory[]);

  const out: FlatCategory[] = [];
  const walk = (node: RawCategory, trail: string[]) => {
    const name = nameOf(node);
    const id = idOf(node);
    if (!id) return;
    const path = [...trail, name].filter(Boolean);
    const kids = childrenOf(node);
    out.push({
      id,
      name: name || id,
      path: path.join(" > "),
      isLeaf: kids.length === 0,
    });
    for (const k of kids) walk(k, path);
  };
  for (const r of roots) walk(r, []);
  return out;
}

/* ---- Arama -------------------------------------------------------------- */

const foldTr = (s: string): string => {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i",
  };
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâî]/g, ch => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const wordsOf = (s: string): string[] => foldTr(s).split(" ").filter(w => w.length >= 2);

/** Serbest metin araması — yaprak kategoriler önce gelir. */
export function searchCategories(
  categories: FlatCategory[],
  query: string,
  limit = 30,
): FlatCategory[] {
  const q = foldTr(query);
  if (!q) return categories.filter(c => c.isLeaf).slice(0, limit);
  const terms = q.split(" ").filter(Boolean);

  return categories
    .map(c => {
      const hay = foldTr(c.path);
      // Tüm terimler geçmeli — kısmi eşleşme gürültü üretiyor.
      const hit = terms.every(t => hay.includes(t));
      if (!hit) return null;
      // Ad üzerinde eşleşme, yol üzerinde eşleşmeden değerlidir.
      const inName = terms.every(t => foldTr(c.name).includes(t));
      return { c, score: (inName ? 2 : 0) + (c.isLeaf ? 1 : 0) };
    })
    .filter((x): x is { c: FlatCategory; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.c.path.length - b.c.path.length)
    .slice(0, limit)
    .map(x => x.c);
}

/* ---- Otomatik öneri ----------------------------------------------------- */

/**
 * Boya ürünleri için alan sözlüğü.
 *
 * Kullanım alanı adı ("3D Baskı") kategori adıyla ("3D Yazıcı Malzemeleri")
 * birebir tutmaz. Bu eşlemeler kelime örtüşmesine ek ipucu verir; olmadığında
 * öneri "boya" gibi genel kategorilere kayıyordu.
 */
const HINTS: Record<string, string[]> = {
  "3d": ["3d", "yazici", "baski", "filament"],
  rapala: ["balik", "olta", "yem", "misina"],
  otomotiv: ["oto", "arac", "araba", "rotus"],
  bisiklet: ["bisiklet"],
  maket: ["maket", "hobi", "model"],
  jant: ["jant", "oto"],
  airbrush: ["airbrush", "hobi", "boya"],
  sprey: ["sprey", "boya"],
  rotus: ["rotus", "oto", "boya"],
  genel: ["boya", "hobi"],
};

export type CategorySuggestion = {
  categoryId: string;
  name: string;
  path: string;
  /** 0–1 arası güven. Eşik altı öneri gösterilmez. */
  score: number;
};

/**
 * Bir kullanım alanı için en olası kategorileri döner.
 *
 * Puan = ortak kelime oranı + alan sözlüğü ipucu. Yalnız YAPRAK kategoriler
 * önerilir; ara düğüme ürün açılamaz.
 */
export function suggestCategory(input: {
  useCaseName: string;
  categories: FlatCategory[];
  /** Ek arama terimleri (seri adı, ürün formu). */
  extraTerms?: string[];
  limit?: number;
  minScore?: number;
}): CategorySuggestion[] {
  const base = wordsOf(input.useCaseName);
  const hintKey = Object.keys(HINTS).find(k => foldTr(input.useCaseName).includes(k));
  const hints = hintKey ? HINTS[hintKey] : [];
  const extra = (input.extraTerms ?? []).flatMap(wordsOf);
  const terms = Array.from(new Set([...base, ...hints, ...extra]));
  if (terms.length === 0) return [];

  const minScore = input.minScore ?? 0.25;

  return input.categories
    .filter(c => c.isLeaf)
    .map(c => {
      const hay = wordsOf(c.path);
      if (hay.length === 0) return null;
      const haySet = new Set(hay);
      let hit = 0;
      for (const t of terms) {
        if (haySet.has(t)) hit += 1;
        // Kısmi eşleşme yarım puan: "boya" ↔ "boyalari"
        else if (hay.some(h => h.startsWith(t) || t.startsWith(h))) hit += 0.5;
      }
      // Normalizasyon ARANAN TERİM SAYISINA göre yapılır. Daha dar bir
      // paydaya (örn. yalnız ad kelimeleri) bölmek puanı erkenden 1'e
      // sıkıştırıyor ve sıralamayı yok ediyordu: iki farklı kategori aynı
      // puanı alıp seçim yol uzunluğuna kalıyordu.
      const score = Math.min(1, hit / terms.length);
      return score > 0 ? { categoryId: c.id, name: c.name, path: c.path, score } : null;
    })
    .filter((x): x is CategorySuggestion => x !== null && x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
    .slice(0, input.limit ?? 5);
}

/** Birden çok kullanım alanı için tek seferde öneri. */
export function suggestForUseCases(input: {
  useCases: { id: number; name: string }[];
  categories: FlatCategory[];
  extraTerms?: string[];
  minScore?: number;
}): { useCaseId: number; useCaseName: string; suggestions: CategorySuggestion[] }[] {
  return input.useCases.map(u => ({
    useCaseId: u.id,
    useCaseName: u.name,
    suggestions: suggestCategory({
      useCaseName: u.name,
      categories: input.categories,
      extraTerms: input.extraTerms,
      minScore: input.minScore,
    }),
  }));
}
