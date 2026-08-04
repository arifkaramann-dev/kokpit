/**
 * İlan içeriği — blok devralma ve kişiselleştirme.
 *
 * Yeni katalogda `generateListings` ilana yalnız başlık ve slug yazıyordu;
 * gövde boş kalıyordu. Eski akışta içerik motoru vardı ama devProject'e
 * bağlıydı ve `listings` tablosuna hiç dokunmuyordu. Bu dosya o motoru
 * master koordinatına bağlar.
 *
 * ── Neden blok? ────────────────────────────────────────────────────────────
 * İçerik SERİYE ve KULLANIM ALANINA göre değişir; renge göre değişen tek şey
 * metinde geçen renk adıdır. "Candy Red 3D Baskı Boyası" ile "Candy Blue
 * 3D Baskı Boyası" açıklaması kelimesi kelimesine aynıdır, yalnız renk farklı.
 *
 * Bu yüzden AI varyant başına değil blok başına çağrılır. Eski akış varyant
 * başına çağırıyor ve 85 varyantta gateway timeout'a giriyordu. Blok
 * yaklaşımıyla 9 seri × 7 kullanım alanı = 63 çağrı binlerce ilanı doldurur.
 *
 * Saf fonksiyon — DB ve LLM çağrısı yok, tamamen test edilebilir.
 */

export type ContentVars = {
  marka?: string | null;
  seri?: string | null;
  renk?: string | null;
  form?: string | null;
  ambalaj?: string | null;
  kullanim?: string | null;
  hacim?: string | null;
};

/**
 * Şablon değişkenlerini doldurur. Bilinmeyen değişken boş bırakılır.
 *
 * Koşullu bölüm: `{{#kullanim}}… {{kullanim}} için…{{/kullanim}}`
 *
 * Boş değişken yalnız boşluk bırakmıyor, cümleyi SAKAT bırakıyordu. Jenerik
 * ilanda kullanım alanı bilerek boş geçiliyor (başlık forma düşsün diye) ve
 * "{{kullanim}} için geliştirilmiş boya" cümlesi pazaryerine
 * "— için geliştirilmiş boya." diye gidiyordu. Boşluk temizliği bunu
 * düzeltemez: eksik olan kelimenin kendisi. Değişkene bağlı cümle parçası
 * artık koşullu bölüme sarılır ve değişken boşsa parça tamamen düşer.
 */
export function fillTemplate(template: string | null | undefined, vars: ContentVars): string {
  if (!template) return "";

  const value = (name: string): string => {
    const v = (vars as Record<string, string | null | undefined>)[name];
    return typeof v === "string" ? v.trim() : "";
  };

  // Koşullu bölümler önce çözülür: içindeki değişkenler ancak bölüm
  // korunduysa doldurulmalı.
  const withSections = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, name: string, body: string) => (value(name) ? body : ""),
  );

  return withSections
    .replaceAll("{{marka}}", value("marka"))
    .replaceAll("{{seri}}", value("seri"))
    .replaceAll("{{renk}}", value("renk"))
    .replaceAll("{{form}}", value("form"))
    .replaceAll("{{ambalaj}}", value("ambalaj"))
    .replaceAll("{{kullanim}}", value("kullanim"))
    .replaceAll("{{hacim}}", value("hacim"))
    // Değişken boş kalınca oluşan çift boşluk ve boşluklu noktalama temizlenir.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    // Boş bölüm sonrası kalan sarkan ayraç ("<strong>X</strong> — .") temizlenir.
    .replace(/\s*[—–-]\s*([.<])/g, "$1")
    .trim();
}

export type ContentBlockLike = {
  id: number;
  seriesId: number;
  useCaseId: number;
  familyId: number | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  labelText: string | null;
  titlePattern: string | null;
};

/** Seri kaydındaki şablonlar — blok yoksa devreye girer. */
export type SeriesFallback = {
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  labelTemplate: string | null;
};

/**
 * Bir master+kullanım alanı için geçerli bloğu seçer.
 * Forma özel blok (familyId dolu), genel bloğu yener — airbrush ile spreyin
 * uygulama metni gerçekten farklıdır.
 */
export function pickBlock(
  blocks: ContentBlockLike[],
  coord: { seriesId: number; useCaseId: number; familyId: number },
): ContentBlockLike | null {
  let generic: ContentBlockLike | null = null;
  for (const b of blocks) {
    if (b.seriesId !== coord.seriesId || b.useCaseId !== coord.useCaseId) continue;
    if (b.familyId === coord.familyId) return b; // en özel
    if (b.familyId === null) generic = generic ?? b;
  }
  return generic;
}

export type ResolvedContent = {
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  labelText: string | null;
  /** İçerik nereden geldi — kullanıcıya "bu metin nereden çıktı" demek için. */
  source: "blok" | "seri" | "yok";
};

/**
 * İlan içeriğini çözer ve o ilanın koordinatıyla kişiselleştirir.
 *
 * Zincir: blok → seri şablonu → boş. Kopyalama değil çözümleme: blok metni
 * değişince tüm ilanlar yeniden üretildiğinde güncellenir, binlerce satır
 * elle düzeltilmez.
 */
export function resolveListingContent(input: {
  block: ContentBlockLike | null;
  series: SeriesFallback | null;
  vars: ContentVars;
}): ResolvedContent {
  const { block, series, vars } = input;

  const fromBlock = block
    ? {
        shortDescription: fillTemplate(block.shortDescription, vars),
        longDescription: fillTemplate(block.longDescription, vars),
        applicationText: fillTemplate(block.applicationText, vars),
        labelText: fillTemplate(block.labelText, vars),
      }
    : null;

  // Blok var ama tamamen boşsa seriye düşülür — yarı dolu blok yüzünden
  // içerik kaybolmasın.
  const blockHasContent =
    !!fromBlock &&
    !!(fromBlock.shortDescription || fromBlock.longDescription || fromBlock.applicationText);

  if (blockHasContent && fromBlock) {
    return {
      shortDescription: fromBlock.shortDescription || null,
      longDescription: fromBlock.longDescription || null,
      applicationText: fromBlock.applicationText || null,
      labelText: fromBlock.labelText || null,
      source: "blok",
    };
  }

  if (series) {
    const s = {
      shortDescription: fillTemplate(series.shortDescription, vars) || null,
      longDescription: fillTemplate(series.longDescription, vars) || null,
      applicationText: fillTemplate(series.applicationText, vars) || null,
      labelText: fillTemplate(series.labelTemplate, vars) || null,
    };
    if (s.shortDescription || s.longDescription || s.applicationText) {
      return { ...s, source: "seri" };
    }
  }

  return {
    shortDescription: null,
    longDescription: null,
    applicationText: null,
    labelText: null,
    source: "yok",
  };
}

/**
 * AI'ye gönderilecek blok listesi: hangi (seri × kullanım alanı × form)
 * kombinasyonları içeriksiz.
 *
 * Yalnız GERÇEKTEN master'ı olan kombinasyonlar üretilir — kullanılmayan
 * kombinasyona AI çağırmak boşa para.
 */
export function planContentBlocks(input: {
  masters: { seriesId: number; useCaseIds: number[]; familyId: number }[];
  existing: ContentBlockLike[];
  /** true: dolu blokları da yeniden üret. */
  regenerate?: boolean;
  /** true: form bazlı ayrı blok üret (airbrush ≠ sprey). */
  perFamily?: boolean;
}): { seriesId: number; useCaseId: number; familyId: number | null }[] {
  const wanted = new Map<string, { seriesId: number; useCaseId: number; familyId: number | null }>();
  for (const m of input.masters) {
    for (const useCaseId of m.useCaseIds) {
      const familyId = input.perFamily ? m.familyId : null;
      wanted.set(`${m.seriesId}:${useCaseId}:${familyId ?? "-"}`, {
        seriesId: m.seriesId,
        useCaseId,
        familyId,
      });
    }
  }

  if (input.regenerate) return Array.from(wanted.values());

  const filled = new Set(
    input.existing
      .filter(b => b.shortDescription || b.longDescription || b.applicationText)
      .map(b => `${b.seriesId}:${b.useCaseId}:${b.familyId ?? "-"}`),
  );
  return Array.from(wanted.entries())
    .filter(([key]) => !filled.has(key))
    .map(([, v]) => v);
}
