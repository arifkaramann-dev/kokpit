/**
 * Kat sistemi — "bu boya hangi katmanlarla uygulanır".
 *
 * ── Neden veri, neden metin değil ─────────────────────────────────────────
 * Müşterinin en çok sorduğu soru "nasıl uygulanır"dı ve cevabı yalnız serinin
 * uzun açıklamasının içinde, paragraf arasında yazıyordu. Kimse okumuyor,
 * herkes soruyordu.
 *
 * Zincir VERİ olunca şablon onu tek karede şema olarak basabiliyor:
 *
 *     ARTOFCOLOUR PRIMER  →  CANDY  →  ARTOFCOLOUR GLOSS
 *        gümüş baz            renk         vernik
 *
 * Ve seri değiştiğinde kare kendiliğinden doğru kalıyor — kimsenin şablona
 * gidip elle düzeltmesi gerekmiyor.
 *
 * ── Neden varsayılan var ──────────────────────────────────────────────────
 * Hiçbir seri kat şemasız kalmasın: kayıt boşsa seri ADINDAN makul bir zincir
 * türetilir. Yanlış olabilir — ama görünür şekilde yanlıştır, kullanıcı açıp
 * düzeltir. Boş kare ise fark edilmez ve o şablon hiç kullanılmaz.
 *
 * ── Neden ürün adı katmanın içinde ────────────────────────────────────────
 * "Gümüş baz" bir işlem, "ARTOFCOLOUR SILVER" bir üründür. İkisi ayrı alanda
 * duruyor ki şema hem eğitici olsun hem kendi ürününü satsın: müşteri tek
 * karede üç ürünü birden görüyor.
 *
 * Saf modül: veritabanı yok, tarayıcı yok.
 */

/** Zincirin bir halkası. */
export type CoatLayer = {
  /** İşlem adı — "Gümüş baz", "Candy renk", "Vernik". */
  label: string;
  /** Bu adımda önerilen kendi ürünümüz — "ARTOFCOLOUR GLOSS". İsteğe bağlı. */
  product?: string | null;
};

export type CoatSystem = CoatLayer[];

/** Şemada en fazla bu kadar halka çizilir; fazlası okunmaz hale gelir. */
export const MAX_COAT_LAYERS = 4;

const BASE_SILVER: CoatLayer = { label: "Gümüş baz", product: "ARTOFCOLOUR SILVER" };
const BASE_BLACK: CoatLayer = { label: "Siyah zemin", product: "ARTOFCOLOUR BLACK" };
const PRIMER: CoatLayer = { label: "Astar", product: "ARTOFCOLOUR PRIMER" };
const CLEAR: CoatLayer = { label: "Vernik", product: "ARTOFCOLOUR GLOSS" };

/**
 * Seri adından varsayılan zincir.
 *
 * CANDY saydamdır: altındaki gümüş baz olmadan rengi görünmez, o yüzden baz
 * zincirin ZORUNLU ilk halkasıdır. METEOR renk değiştiren sedef efektidir ve
 * efekt ancak koyu zeminde okunur. Düz/sedef renkler (VİVİD) örtücüdür, baz
 * istemez — onlarda zincir renk + vernikten ibarettir.
 *
 * PRIMER ve GLOSS'un kendisi bir katman ürünüdür; onların "kat sistemi" tek
 * halkadır (kendisi).
 */
export function defaultCoatSystem(seriesName: string | null | undefined): CoatSystem {
  const n = String(seriesName ?? "").toLocaleUpperCase("tr").replace(/[^A-ZÇĞİÖŞÜ]/g, "");
  const renk = (label: string): CoatLayer => ({ label });

  if (n.includes("CANDY")) return [BASE_SILVER, renk("Candy renk"), CLEAR];
  if (n.includes("METEOR")) return [BASE_BLACK, renk("Meteor efekt"), CLEAR];
  if (n.includes("PRIMER") || n.includes("PRİMER") || n.includes("ASTAR")) return [PRIMER];
  if (n.includes("GLOSS") || n.includes("VERNIK") || n.includes("VERNİK")) return [CLEAR];
  // Kalan her şey örtücü son kat sayılır: renk + vernik.
  return [renk(seriesName?.trim() ? `${seriesName.trim()} renk` : "Renk"), CLEAR];
}

/**
 * Kayıttan gelen değeri güvenli zincire çevirir.
 *
 * Alan JSON sütunu: elle düzenlenebiliyor, eski kayıtlarda dizi yerine metin
 * durabiliyor. Bozuk değerde patlamak yerine boş dönülür — çağıran varsayılana
 * düşer ve kare yine basılır.
 */
export function normalizeCoatSystem(value: unknown): CoatSystem {
  let arr: unknown[] = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  }

  const out: CoatSystem = [];
  for (const item of arr) {
    if (out.length >= MAX_COAT_LAYERS) break;
    if (typeof item === "string") {
      if (item.trim()) out.push({ label: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    const product = String(row.product ?? "").trim();
    out.push(product ? { label, product } : { label });
  }
  return out;
}

/** Kayıtlı zincir varsa o, yoksa seri adından türetilen varsayılan. */
export function coatSystemOf(series: {
  name?: string | null;
  coatSystem?: unknown;
}): CoatSystem {
  const own = normalizeCoatSystem(series.coatSystem);
  return own.length > 0 ? own : defaultCoatSystem(series.name);
}

/**
 * Şablonun bastığı metinler.
 *
 * `katman1..4` halkaların adı, `urun1..4` o adımın ürünü, `katSayisi` "3 KAT
 * SİSTEM" başlığı için. Boş halkalar boş dizeye iner — şablon dört kutuyu
 * hep taşır, dolmayan kutu görünmez kalır (bkz. `layout.resolveText`).
 */
export function coatSystemTokens(system: CoatSystem): Record<string, string> {
  const out: Record<string, string> = {
    katSayisi: system.length > 0 ? `${system.length} KAT SİSTEM` : "",
    katSistemi: system.map(l => l.label).join("  →  "),
  };
  for (let i = 0; i < MAX_COAT_LAYERS; i += 1) {
    out[`katman${i + 1}`] = system[i]?.label ?? "";
    out[`urun${i + 1}`] = system[i]?.product ?? "";
    // Ok, halkalar ARASINDA durur: son halkadan sonra ok yazmak zinciri
    // yarım gösterir. İki katlı seride üçüncü ok kendiliğinden boş kalır.
    if (i < MAX_COAT_LAYERS - 1) out[`ok${i + 1}`] = system[i + 1] ? "→" : "";
  }
  return out;
}
