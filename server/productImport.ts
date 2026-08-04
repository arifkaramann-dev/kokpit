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
};

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
};

export type ImportPlan = {
  ready: ImportPlanRow[];
  blocked: ImportPlanRow[];
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

  for (const candidate of input.candidates) {
    const color = findInTitle(candidate.title, input.colors);
    const packaging = findInTitle(candidate.title, input.packagings);
    const family = findInTitle(candidate.title, input.families);

    const missing: string[] = [];
    if (!color) missing.push("renk");
    if (!packaging) missing.push("ambalaj");
    if (!family) missing.push("form");

    const row: ImportPlanRow = {
      candidate,
      colorId: color?.id ?? null,
      colorName: color?.name ?? null,
      packagingId: packaging?.id ?? null,
      packagingName: packaging?.name ?? null,
      familyId: family?.id ?? null,
      familyName: family?.name ?? null,
      missing,
    };
    if (missing.length === 0) ready.push(row);
    else blocked.push(row);
  }

  return { ready, blocked };
}
