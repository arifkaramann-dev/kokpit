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

export type Axis = "renk" | "ambalaj" | "form";

/**
 * Eksen tahmininde kullanılan ad listesi — YALNIZ SON ÇARE.
 *
 * Hangi pazaryeri özelliğinin hangi eksenimize denk geldiği tahmin edilecek
 * bir şey değil: kullanıcı bunu Özellik Eşlemesi ekranında zaten belirliyor
 * (`channelAttributes.source`). Tahmin, eşleme kurulmamışken bir şey
 * gösterebilmek içindir.
 *
 * Tahminin neden yetersiz olduğu canlıda görüldü: Trendyol'un "Renk"
 * özelliği bu katalogda YARI-MAT, ŞEFFAF, Metalik gibi YÜZEY değerleri
 * taşıyor. Bunları renk sanıp eklemek kataloğu bozardı.
 */
const AXIS_ATTRIBUTE_NAMES: Record<Axis, string[]> = {
  renk: ["renk", "ürün rengi", "color", "ana renk"],
  ambalaj: ["hacim", "ambalaj", "boyut", "litre", "mililitre", "gramaj", "ağırlık"],
  form: ["ürün tipi", "tip", "form", "tür", "ürün türü"],
};

/**
 * Pazaryeri özellik adı → bizim eksen eşlemesi.
 *
 * Kullanıcının Özellik Eşlemesi'nde kurduğu eşlemeden üretilir. Boş harita
 * verilirse ad tahminine düşülür.
 */
export type AxisMapping = Record<string, Axis>;

/**
 * Ürünün kendi özelliklerinden bir eksenin değerini okur.
 *
 * Önce kullanıcının kurduğu eşleme, sonra ad tahmini. Eşleme varsa tahmin
 * hiç devreye girmez — kullanıcı "bu özellik renk DEĞİL" dediyse ona uyulur.
 */
export function attributeValueFor(
  attributes: { name: string; value: string }[] | undefined,
  axis: Axis,
  mapping?: AxisMapping,
): string | null {
  const rows = (attributes ?? []).filter(a => a.value.trim());

  if (mapping && Object.keys(mapping).length > 0) {
    for (const a of rows) {
      if (mapping[normalizeName(a.name)] === axis) return a.value.trim();
    }
    // Eşleme kurulmuş ama bu eksene bir özellik bağlanmamışsa, tahmine
    // düşmek kullanıcının kararını ezmek olur.
    return null;
  }

  const wanted = AXIS_ATTRIBUTE_NAMES[axis].map(normalizeName);
  for (const a of rows) {
    if (wanted.includes(normalizeName(a.name))) return a.value.trim();
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
  suggested: { axis: Axis; name: string }[];
};

export type ImportPlan = {
  ready: ImportPlanRow[];
  blocked: ImportPlanRow[];
  /** Eklenmesi gereken tanımlar, eksen başına tekilleştirilmiş. */
  missingDefinitions: { axis: Axis; name: string; count: number }[];
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
  /** Kullanıcının Özellik Eşlemesi'nde kurduğu pazaryeri özelliği → eksen. */
  axisMapping?: AxisMapping;
}): ImportPlan {
  const ready: ImportPlanRow[] = [];
  const blocked: ImportPlanRow[] = [];
  const suggestions = new Map<string, { axis: Axis; name: string; count: number }>();

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
    axis: Axis,
    options: DimensionOption[],
  ): { hit: DimensionOption | null; suggestion: string | null } => {
    const remote = attributeValueFor(candidate.attributes, axis, input.axisMapping);
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
    const note = (axis: Axis, r: { hit: unknown; suggestion: string | null }) => {
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
