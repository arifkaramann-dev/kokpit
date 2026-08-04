/**
 * Katalog kod üretimi — internal SKU, pazaryeri SKU'su, barkod, ilan başlığı.
 *
 * ── Değişmez kural ────────────────────────────────────────────────────────
 * Bu fonksiyonların ürettiği pazaryeri kodları BİR KEZ üretilip veritabanına
 * yazılır ve bir daha HESAPLANMAZ. Her gönderimde yeniden türetilirse, türetme
 * kuralında ileride yapılacak en ufak değişiklik tüm pazaryeri eşleşmelerini
 * kalıcı olarak koparır (ilan geçmişi, yorumlar, arama sıralaması gider).
 * Saklanan değer gerçektir; buradaki fonksiyonlar yalnızca ilk değeri üretir.
 */

/** Türkçe karakterleri koda uygun ASCII'ye indirger. */
function asciiFold(s: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", ö: "o", Ö: "o",
    ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", Î: "i",
  };
  return s.replace(/[çÇğĞıİöÖşŞüÜâÂîÎ]/g, ch => map[ch] ?? ch);
}

/** Kod parçası: küçük harf, yalnız harf+rakam. */
export function codeSegment(value: string | null | undefined, maxLen = 12): string {
  return asciiFold(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, maxLen);
}

/**
 * Addaki harf kelimeleri (rakamlar ve noktalama atılır).
 * "30 ML PET" → ["ml", "pet"] · "1 LT(900 GR)" → ["lt", "gr"]
 */
export function codeWords(value: string | null | undefined): string[] {
  return asciiFold(String(value ?? ""))
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Temel kod (renk kimliği): marka + seri ön eki + renk kodu.
 * Örn. aoc + cnd + red1822 → "aoccndred1822"
 *
 * DİKKAT: Bu kod bir MASTER'ı değil bir RENGİ tanımlar — form, ambalaj ve
 * hazırlık bilgisi içermez. Master kimliği için buildInternalSku kullanılır.
 */
export function buildBaseCode(input: {
  brand?: string | null;
  seriesPrefix?: string | null;
  colorCode?: string | null;
}): string {
  return [
    codeSegment(input.brand ?? "aoc", 8),
    codeSegment(input.seriesPrefix, 8),
    codeSegment(input.colorCode, 16),
  ]
    .filter(Boolean)
    .join("");
}

/**
 * Boyut SKU eklerini TEKİL hale getirir.
 *
 * Sorun: ambalaj SKU eki hacimden türetiliyordu ("100 ML PET" → "100").
 * "30 ML PET" ve "30 ML CAM" ikisi de "30" alıyor; aynı seri+renk+form
 * altında iki farklı ambalaj AYNI internal SKU'yu üretiyor ve master üretimi
 * "Kod çakışması" ile duruyordu. Kullanıcının yapabileceği bir şey yoktu —
 * ekleri elle düzeltmesi isteniyordu.
 *
 * Çözüm: çakışan eke, adın AYIRT EDİCİ parçasından kısa bir ek eklenir
 * ("30pet" · "30cam"). Ayırt edici parça bulunamazsa sıra numarası eklenir.
 * Sonuç okunur kalır ve deterministiktir: aynı girdi hep aynı eki verir.
 *
 * `id` sırası değil, ADIN kendisi belirleyici — satır sırası değişince kod
 * değişmesin diye.
 */
export function uniqueSkuSegments(
  rows: { id: number; name: string; base: string }[],
): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();

  // Aynı temel eki paylaşanlar gruplanır; tekil olanlar olduğu gibi kalır.
  const byBase = new Map<string, typeof rows>();
  for (const r of rows) {
    const base = codeSegment(r.base, 8) || codeSegment(r.name, 8) || "x";
    byBase.set(base, [...(byBase.get(base) ?? []), r]);
  }

  for (const [base, group] of Array.from(byBase.entries())) {
    if (group.length === 1) {
      out.set(group[0].id, base);
      used.add(base);
      continue;
    }
    // Ada göre sırala: sonuç satır sırasından bağımsız olsun.
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      // Addaki rakam olmayan ilk anlamlı kelime ayırt edicidir: "30 ML PET"
      // içinde "ml" atlanır, "pet" alınır.
      const words = codeWords(r.name).filter(
        w => w.length >= 2 && w !== "ml" && w !== "lt" && w !== "litre",
      );
      let candidate = "";
      for (const w of words) {
        const guess = `${base}${w.slice(0, 4)}`;
        if (!used.has(guess)) {
          candidate = guess;
          break;
        }
      }
      if (!candidate) candidate = `${base}${i + 1}`;
      // Son çare: hâlâ çakışıyorsa sayı artırılır.
      let n = 2;
      while (used.has(candidate)) candidate = `${base}${i + 1}x${n++}`;
      out.set(r.id, candidate);
      used.add(candidate);
    }
  }
  return out;
}

/**
 * Ambalaj adı hazırlık (r2u) bilgisini mi taşıyor?
 *
 * "30 ml (ReadyToUse)" bir AMBALAJ değil, 30 ml ambalajın kullanıma hazır
 * halidir. Hazırlık zaten ayrı bir eksen (`masterProducts.readiness`); böyle
 * bir satır ambalaj listesinde durursa aynı ürün iki kez üretilir:
 * "30 ML + r2u" ve "30 ml (ReadyToUse) + r2u".
 */
export function looksLikeReadyToUse(name: string | null | undefined): boolean {
  // Rakamlar korunur: "R2U" harf kelimelerine bölününce ("r","u") kaybolurdu.
  const flat = asciiFold(String(name ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return /readytouse|r2u|kullanimahazir|hazir/.test(flat);
}

/**
 * Ambalaj adı sprey mi? Sprey kutusu yalnız sprey formunda anlamlıdır;
 * form × ambalaj uyumluluğu tohumlanırken kullanılır.
 */
export function looksLikeSpray(name: string | null | undefined): boolean {
  return codeWords(name).some(w => w === "sprey" || w === "spray" || w === "aerosol");
}

/**
 * Master kimliği: temel kod + form eki + ambalaj eki + hazırlık eki.
 * Örn. aoccndred1822 + ab + 100 + r2u → "aoccndred1822ab100r2u"
 */
export function buildInternalSku(input: {
  baseCode: string;
  familySegment?: string | null;
  packagingSegment?: string | null;
  readiness?: "konsantre" | "r2u" | null;
}): string {
  return [
    codeSegment(input.baseCode, 40),
    codeSegment(input.familySegment, 8),
    codeSegment(input.packagingSegment, 8),
    input.readiness === "r2u" ? "r2u" : "",
  ]
    .filter(Boolean)
    .join("");
}

/**
 * Pazaryeri satıcı kodu. Bilinçli olarak OPAK: internal SKU'dan türetilmez,
 * sıralı bir sayaçtan üretilir. Sebebi kullanıcının açık şartı — internal SKU
 * hiçbir pazaryerine gitmemeli. Türetseydik iç kodlama düzeni dışarıdan
 * okunabilir hale gelirdi.
 */
export function buildChannelSku(channelCode: string, sequence: number): string {
  const prefix = codeSegment(channelCode, 4) || "ch";
  return `${prefix}${String(Math.max(1, Math.floor(sequence))).padStart(6, "0")}`;
}

/** EAN-13 kontrol hanesi (tek konumlar ×1, çift konumlar ×3). */
export function ean13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelveDigits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Pazaryeri barkodu — geçerli EAN-13 biçiminde, mağaza içi ön ekle.
 *
 * GS1 kaydı yok; barkodlar kendi üretilir. Rastgele sayı yerine "299" ile
 * başlayan (mağaza içi kullanıma ayrılmış) blok + sıralı numara kullanılır:
 * rastgele üretim bir gün başka bir markanın gerçek GTIN'ine çakışabilir ve
 * ilanınız yanlış ürün sayfasına düşer.
 *
 * Master'ın gerçek GTIN'i (varsa) ayrıdır; fatura/irsaliye onu kullanır.
 * Buradaki barkod yalnızca İLAN kimliğidir — aynı kanalda birden fazla ilanın
 * yan yana durabilmesi için her ilana ayrı barkod gerekir.
 */
export function buildChannelBarcode(sequence: number, prefix = "299"): string {
  const p = prefix.replace(/\D/g, "").slice(0, 3).padStart(3, "2");
  const body = String(Math.max(1, Math.floor(sequence))).padStart(9, "0").slice(-9);
  const twelve = `${p}${body}`;
  return `${twelve}${ean13CheckDigit(twelve)}`;
}

/** Barkodun EAN-13 olarak geçerliliği (içe aktarılan kodları doğrulamak için). */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}

export type TitleVars = {
  marka?: string | null;
  seri?: string | null;
  renk?: string | null;
  form?: string | null;
  ambalaj?: string | null;
  kullanim?: string | null;
};

/**
 * İlan başlığı. Şablon verilmezse kullanım alanı öncelikli makul bir başlık
 * kurulur: "Artofcolour Candy Red 3D Baskı Boyası 100 ML PET".
 */
export function buildListingTitle(pattern: string | null | undefined, vars: TitleVars): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  if (pattern && pattern.trim()) {
    const filled = pattern
      .replaceAll("{{marka}}", vars.marka ?? "")
      .replaceAll("{{seri}}", vars.seri ?? "")
      .replaceAll("{{renk}}", vars.renk ?? "")
      .replaceAll("{{form}}", vars.form ?? "")
      .replaceAll("{{ambalaj}}", vars.ambalaj ?? "")
      .replaceAll("{{kullanim}}", vars.kullanim ?? "");
    return clean(filled);
  }
  // Seri şablonsuz başlıkta da yer alır: "Artofcolour Fuşya Airbrush Boyası"
  // hangi seriden olduğunu söylemiyordu — CANDY ile VIVID aynı renkte aynı
  // başlığı alıyor, pazaryerinde ayırt edilemiyordu.
  return clean(
    [vars.marka, vars.seri, vars.renk, vars.kullanim ?? vars.form, "Boyası", vars.ambalaj]
      .filter(Boolean)
      .join(" "),
  );
}

/** URL parçası — Türkçe karakterler indirgenir, tekrarlı tire sadeleşir. */
export function buildSlug(title: string): string {
  return asciiFold(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

/**
 * Ambalaj adından hacim (ml) çıkarır: "100 ML PET" → 100, "1 LT(900 GR)" → 1000.
 * Formül ölçeklemesinin paydası olduğu için tohumlamada kritik.
 */
export function parseVolumeMl(name: string | null | undefined): number {
  const s = asciiFold(String(name ?? "")).toLowerCase();
  const lt = s.match(/(\d+(?:[.,]\d+)?)\s*(?:lt|litre|l)\b/);
  if (lt) return Math.round(parseFloat(lt[1].replace(",", ".")) * 1000);
  const ml = s.match(/(\d+(?:[.,]\d+)?)\s*ml\b/);
  if (ml) return Math.round(parseFloat(ml[1].replace(",", ".")));
  const bare = s.match(/(\d{2,4})/);
  return bare ? parseInt(bare[1], 10) : 0;
}
