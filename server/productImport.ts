import { normalizeName } from "./catalogRestructure";

/**
 * Pazaryeri ürününden Kokpit ürünü (master) çıkarma planı.
 *
 * Kataloğumuz bir KÜP: seri × renk × ambalaj × form. Pazaryeri kaydı bu
 * koordinatları taşımaz, yalnız bir başlık taşır: "Artofcolour Fuşya Airbrush
 * Boyası 100 ml". Koordinat başlıktan çıkarılır.
 *
 * Tek kural: SADECE kullanıcının önceden tanımladığı boyut değerleri eşleşir.
 * Başlıkta geçen ama Tanımlar'da olmayan bir renk için yeni renk YARATILMAZ —
 * çöp koordinatlı ürün, sonradan elle temizlenmesi gereken bir karmaşa demek.
 * Çözülemeyen koordinat eksik olarak bildirilir, kullanıcı karar verir.
 *
 * Seri genelde başlıkta geçmez (yukarıdaki örnekte yok), bu yüzden parti için
 * dışarıdan verilir. Uydurmak yerine sormak doğru.
 *
 * Saf modül — ağ ve veritabanı yok, test edilebilir.
 */

export type DimensionOption = { id: number; name: string };

export type ImportCandidate = {
  barcode: string;
  title: string;
  stockCode: string;
  salePrice: number;
  /** Ürünün pazaryerindeki kendi özellikleri (Renk: Fuşya, Hacim: 100 ml…). */
  attributes?: { name: string; value: string }[];
};

/**
 * Bir eksenin pazaryerindeki özellik adları.
 *
 * Trendyol "Renk", Hepsiburada "Ürün Rengi" diyebiliyor; eşleşme ad üzerinden
 * kurulduğu için birden çok karşılık denenir.
 */
const AXIS_ATTRIBUTE_NAMES: Record<"renk" | "ambalaj" | "form", string[]> = {
  renk: ["renk", "ürün rengi", "color", "ana renk"],
  ambalaj: ["hacim", "ambalaj", "boyut", "litre", "mililitre", "gramaj", "ağırlık"],
  form: ["ürün tipi", "tip", "form", "tür", "ürün türü"],
};

/** Ürünün kendi özelliklerinden bir eksenin değerini okur. */
export function attributeValueFor(
  attributes: { name: string; value: string }[] | undefined,
  axis: "renk" | "ambalaj" | "form",
): string | null {
  const wanted = AXIS_ATTRIBUTE_NAMES[axis].map(normalizeName);
  for (const a of attributes ?? []) {
    if (wanted.includes(normalizeName(a.name)) && a.value.trim()) return a.value.trim();
  }
  return null;
}

export type ImportPlanRow = {
  candidate: ImportCandidate;
  colorId: number | null;
  colorName: string | null;
  packagingId: number | null;
  packagingName: string | null;
  familyId: number | null;
  familyName: string | null;
  /** Çözülemeyen koordinatlar — doluysa ürün oluşturulamaz. */
  missing: string[];
  /**
   * Pazaryerinden okunan ama Tanımlar'da karşılığı olmayan değerler.
   *
   * "Renk çözülemedi" demek yetmiyordu: hangi rengin eksik olduğu
   * bilinmeden Tanımlar'a ne ekleneceği de bilinmiyor. Ad buradan gelir.
   */
  suggested: { axis: "renk" | "ambalaj" | "form"; name: string }[];
};

export type ImportPlan = {
  ready: ImportPlanRow[];
  blocked: ImportPlanRow[];
  /** Eklenmesi gereken tanımlar, eksen başına tekilleştirilmiş. */
  missingDefinitions: { axis: "renk" | "ambalaj" | "form"; name: string; count: number }[];
};

/**
 * Başlıkta geçen boyut değerini bulur.
 *
 * En UZUN eşleşme kazanır: "100 ml" varken "10 ml" seçilmemeli, "Açık Mavi"
 * varken "Mavi" seçilmemeli. Kısa eşleşme sessizce yanlış ürün üretirdi.
 */
export function findInTitle(
  title: string,
  options: DimensionOption[],
): DimensionOption | null {
  const hay = ` ${normalizeName(title)} `;
  let best: DimensionOption | null = null;
  let bestLen = 0;
  for (const o of options) {
    const needle = normalizeName(o.name);
    if (!needle) continue;
    if (!hay.includes(` ${needle} `) && !hay.includes(` ${needle}`)) continue;
    // Kelime sınırı: "mavi" başlıktaki "mavimsi" ile eşleşmemeli.
    if (!new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(hay.trim())) {
      continue;
    }
    if (needle.length > bestLen) {
      best = o;
      bestLen = needle.length;
    }
  }
  return best;
}

/**
 * Her aday için küp koordinatını çözer.
 *
 * Koordinatın tamamı çözülmeden ürün oluşturulmaz: eksik bir eksen, ürünün
 * yanlış yerde doğması ve kapasite/reçete bağlarının tutmaması demek.
 */
export function planProductImport(input: {
  candidates: ImportCandidate[];
  colors: DimensionOption[];
  packagings: DimensionOption[];
  families: DimensionOption[];
}): ImportPlan {
  const ready: ImportPlanRow[] = [];
  const blocked: ImportPlanRow[] = [];
  const suggestions = new Map<string, { axis: "renk" | "ambalaj" | "form"; name: string; count: number }>();

  /**
   * Bir ekseni çözer.
   *
   * Önce ürünün KENDİ özelliği okunur (pazaryeri değeri birebir verir), sonra
   * o değer bizim tanımlarımızda aranır. Bulunamazsa başlık ayrıştırmaya
   * düşülür — başlık yazımı serbest olduğu için yedek sıradadır.
   *
   * Eşleşme yoksa pazaryerinden okunan AD önerilir: "renk çözülemedi" demek
   * yetmiyordu, Tanımlar'a neyin ekleneceği de bilinmeliydi.
   */
  const resolve = (
    candidate: ImportCandidate,
    axis: "renk" | "ambalaj" | "form",
    options: DimensionOption[],
  ): { hit: DimensionOption | null; suggestion: string | null } => {
    const remote = attributeValueFor(candidate.attributes, axis);
    if (remote) {
      const norm = normalizeName(remote);
      const exact = options.find(o => normalizeName(o.name) === norm);
      if (exact) return { hit: exact, suggestion: null };
    }
    const fromTitle = findInTitle(candidate.title, options);
    if (fromTitle) return { hit: fromTitle, suggestion: null };
    return { hit: null, suggestion: remote };
  };

  for (const candidate of input.candidates) {
    const color = resolve(candidate, "renk", input.colors);
    const packaging = resolve(candidate, "ambalaj", input.packagings);
    const family = resolve(candidate, "form", input.families);

    const missing: string[] = [];
    const suggested: ImportPlanRow["suggested"] = [];
    const note = (axis: "renk" | "ambalaj" | "form", r: { hit: unknown; suggestion: string | null }) => {
      if (r.hit) return;
      missing.push(axis);
      if (!r.suggestion) return;
      suggested.push({ axis, name: r.suggestion });
      const key = `${axis}:${normalizeName(r.suggestion)}`;
      const hit = suggestions.get(key);
      if (hit) hit.count += 1;
      else suggestions.set(key, { axis, name: r.suggestion, count: 1 });
    };
    note("renk", color);
    note("ambalaj", packaging);
    note("form", family);

    const row: ImportPlanRow = {
      candidate,
      colorId: color.hit?.id ?? null,
      colorName: color.hit?.name ?? null,
      packagingId: packaging.hit?.id ?? null,
      packagingName: packaging.hit?.name ?? null,
      familyId: family.hit?.id ?? null,
      familyName: family.hit?.name ?? null,
      missing,
      suggested,
    };
    if (missing.length === 0) ready.push(row);
    else blocked.push(row);
  }

  return { ready, blocked, missingDefinitions: Array.from(suggestions.values()) };
}
