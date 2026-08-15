/**
 * İçerik bloğu üretimi (AI).
 *
 * Eski akıştaki `generateVariantAIContent` ile aynı marka sesini kullanır ama
 * girdisi devProject değil MASTER KOORDİNATIDIR (seri × kullanım alanı × form).
 *
 * Kritik fark: metin renk ve ambalajdan BAĞIMSIZ yazdırılır. Renk/ambalaj
 * yerine {{renk}} ve {{ambalaj}} değişkenleri istenir; ilan üretilirken o
 * ilanın koordinatıyla doldurulur. Böylece tek çağrı, o seri+kullanım
 * alanındaki bütün renk ve ambalaj varyantlarını doldurur.
 */

import { invokeLLM } from "./_core/llm";
import { extractJson } from "./autofill";

export type BlockContext = {
  seriesName: string;
  seriesNotes?: string | null;
  useCaseName: string;
  familyName?: string | null;
  /** Bu seride uygulanan yüzeyler (varsa) — uygulama metnini besler. */
  surfaces?: string[];
  /** Seride tanımlı ambalajlar — metin hangi boyutlara hitap edecek. */
  packagings?: string[];
  /**
   * Serinin KENDİ metinleri (Seriler ekranında elle girilen).
   *
   * Bunlar varken jenerik şablon yazmak, kullanıcının girdiği bilgiyi
   * gölgeliyordu: içerik zinciri blok → seri → boş şeklinde ilerlediği için
   * blok yazılır yazılmaz seri metnine hiç düşülmüyordu.
   */
  seriesContent?: {
    shortDescription?: string | null;
    longDescription?: string | null;
    applicationText?: string | null;
    guideTemplate?: string | null;
    labelTemplate?: string | null;
  };
};

export type GeneratedBlock = {
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  labelText: string | null;
  titlePattern: string | null;
};

const SYSTEM_PROMPT = `Sen Art of Colour markasının e-ticaret içerik motorusun. Art of Colour Türkiye'de otomotiv rötuş boyaları, bukalemun efekt boyalar, airbrush boyaları, sedefli (VİVİD), transparan (CANDY) boyalar, vernik (GLOSS) ve astar (PRİMER) üretir.

Türkçe yaz, sektörel terimleri doğru kullan (bazkat, 1K/2K, örtücülük, opaklık, vernik, astar). Abartılı veya yanıltıcı iddia, sahte yorum, uydurma istatistik ve rakip karşılaştırması YAZMA.

ÇOK ÖNEMLİ — metinlerde somut renk adı ve somut ambalaj/hacim GEÇMEYECEK. Onların yerine şu değişkenleri kullan: {{renk}} {{ambalaj}} {{seri}} {{kullanim}}. Metin bu değişkenlerle her renge ve her ambalaja uyacak şekilde yazılmalı. Örnek: "{{renk}} tonu, {{ambalaj}} ambalajında" — "Kırmızı, 100 ml" DEĞİL.

SADECE geçerli JSON döndür, başka hiçbir metin yazma.`;

/**
 * Bir (seri × kullanım alanı × form) bloğu üretir.
 * Başarısızlıkta null döner — çağıran şablon içeriğine düşer, ilan boş kalmaz.
 */
export async function generateContentBlock(ctx: BlockContext): Promise<GeneratedBlock | null> {
  const userPrompt = `Seri: ${ctx.seriesName}
Kullanım alanı / hedef pazar: ${ctx.useCaseName}
Ürün formu: ${ctx.familyName || "genel"}
${ctx.surfaces?.length ? `Uygulanabilir yüzeyler: ${ctx.surfaces.join(", ")}` : ""}
${ctx.packagings?.length ? `Satıldığı ambalajlar: ${ctx.packagings.join(", ")}` : ""}
${ctx.seriesNotes ? `Seri notu: ${ctx.seriesNotes}` : ""}

Bu seri + kullanım alanı için pazaryeri ilan içeriği üret. İçerik bu serideki
TÜM renkler ve TÜM ambalajlar için kullanılacak; renk ve ambalajı değişkenle
belirt.

Şu JSON şemasına birebir uy:
{
  "titlePattern": "Başlık şablonu, en fazla 90 karakter, {{renk}} ve {{kullanim}} içermeli",
  "shortDescription": "1-2 cümle, en fazla 200 karakter, vurucu özet",
  "longDescription": "SEO uyumlu detaylı açıklama. HTML kullan (<p>, <ul>, <li>, <strong>). Ürünün ${ctx.useCaseName} alanında neden uygun olduğunu anlat. En fazla 1800 karakter.",
  "applicationText": "Adım adım uygulama talimatı: yüzey hazırlığı, karıştırma/çalkalama, kat sayısı, katlar arası bekleme, kuruma. ${ctx.useCaseName} kullanımına özel notlar ekle.",
  "labelText": "Etiket üzerine basılacak kısa metin: ürün tanımı, {{renk}}, {{ambalaj}}, kısa kullanım ve güvenlik uyarısı"
}`;

  // İki deneme: geçici hata ya da bozuk JSON'da bir kez daha dene.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = response.choices[0]?.message?.content;
      const parsed = extractJson(typeof raw === "string" ? raw : "");
      if (parsed && typeof parsed === "object") {
        const str = (k: string) => {
          const v = (parsed as Record<string, unknown>)[k];
          return typeof v === "string" && v.trim() ? v.trim() : null;
        };
        const out: GeneratedBlock = {
          titlePattern: str("titlePattern"),
          shortDescription: str("shortDescription"),
          longDescription: str("longDescription"),
          applicationText: str("applicationText"),
          labelText: str("labelText"),
        };
        // Tamamen boş cevabı başarı sayma.
        if (out.shortDescription || out.longDescription || out.applicationText) return out;
      }
    } catch {
      // sıradaki denemeye geç
    }
  }
  return null;
}

/* ---- Seri banner metni --------------------------------------------------- */

export type BannerText = { slogan: string; bullets: string[] };

/**
 * Banner sloganı ve üç maddesi — SERİNİN KENDİ METNİNDEN.
 *
 * ── Neden sıfırdan yazdırmıyoruz ──────────────────────────────────────────
 * Seriler zaten markanın diliyle yazılmış tanıtımlara sahip: METEOR "Renk
 * Değiştiren Sedefli Büyü", CANDY "Şeffaf Renklerin Efsanesi". AI'a sıfırdan
 * slogan yazdırmak her çağrıda başka bir marka sesi üretiyor ve bir süre
 * sonra hiçbir kare diğerine benzemiyor. İş "kısaltmak", "uydurmak" değil.
 *
 * Metin yoksa AI'a hiç gidilmiyor: uydurulacak bir şey yoksa boş dönüp
 * kullanıcıdan seri metnini doldurması isteniyor — sahte bir slogan basmak,
 * banner'ı hiç basmamaktan kötü.
 */
export async function generateSeriesBanner(ctx: {
  seriesName: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  /** Serinin kat sistemi — "gümüş baz → candy → vernik". Maddelere girer. */
  coatSystem?: string | null;
  surfaces?: string[];
}): Promise<BannerText | null> {
  const source = [ctx.shortDescription, ctx.longDescription].filter(Boolean).join("\n\n").trim();
  if (!source) return null;

  const userPrompt = `Seri: ${ctx.seriesName}
${ctx.coatSystem ? `Uygulama sistemi: ${ctx.coatSystem}` : ""}
${ctx.surfaces?.length ? `Yüzeyler: ${surfaceSentence(ctx.surfaces, "")}` : ""}

Serinin kendi tanıtım metni:
"""
${source.slice(0, 4000)}
"""

Bu metinden bir REKLAM BANNER'ı için slogan ve üç madde çıkar. Yeni iddia
UYDURMA — yalnız yukarıdaki metinde geçenleri kısalt. Slogan en fazla 60
karakter, her madde en fazla 32 karakter olmalı (banner'a sığacak).

Şu JSON şemasına birebir uy:
{
  "slogan": "Kısa, vurucu slogan",
  "bullets": ["Madde bir", "Madde iki", "Madde üç"]
}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = response.choices[0]?.message?.content;
      const parsed = extractJson(typeof raw === "string" ? raw : "");
      if (!parsed || typeof parsed !== "object") continue;
      const row = parsed as Record<string, unknown>;
      const slogan = typeof row.slogan === "string" ? row.slogan.trim().slice(0, 160) : "";
      const bullets = Array.isArray(row.bullets)
        ? row.bullets
            .map(b => (typeof b === "string" ? b.trim().slice(0, 80) : ""))
            .filter(Boolean)
            .slice(0, 3)
        : [];
      if (slogan) return { slogan, bullets };
    } catch {
      // sıradaki denemeye geç
    }
  }
  return null;
}

/**
 * Yüzey listesini okunur bir cümleye çevirir.
 *
 * Ham liste olduğu gibi basılıyordu: 25 kalemlik "Otomobil, Araç, Motosiklet,
 * Jant, Kask, … Rapala, Sahte Balık, Reçine" dökümü. Bu bir ürün açıklaması
 * değil anahtar kelime yığını — müşteriye bilgi vermiyor, ilanı ucuz
 * gösteriyor ve alakasız kalemler (olta yemi ile oto boya yan yana) güven
 * kırıyor. Liste kısaltılır, gerisi "ve benzeri yüzeyler" ile toplanır.
 */
export function surfaceSentence(surfaces: string[] | undefined, fallback: string): string {
  const list = (surfaces ?? []).map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return fallback;
  if (list.length <= 6) return list.join(", ");
  return `${list.slice(0, 6).join(", ")} ve benzeri yüzeyler`;
}

/**
 * AI erişilemezse ya da başarısız olursa kullanılacak şablon içeriği.
 * Hiçbir ilan boş açıklamayla kalmasın diye — boş ilan pazaryerine gönderilemez.
 *
 * Bu metin pazaryerinde MÜŞTERİYE görünüyor; "yedek içerik" olması özensiz
 * olmasını haklı çıkarmaz. Eski hâli ürünü anlatmıyordu: tek satır tanım +
 * seri/ambalaj dökümü. Ne işe yaradığı, nasıl uygulandığı, ne kadar kuruduğu
 * yazmıyordu — alıcının sorduğu sorular bunlar.
 *
 * `{{kullanim}}` jenerik ilanda BOŞ gelir; ona bağlı cümleler koşullu bölüme
 * sarılır, yoksa cümle sakat kalır.
 */
export function templateContentBlock(ctx: BlockContext): GeneratedBlock {
  const yuzey = surfaceSentence(ctx.surfaces, ctx.useCaseName);

  /*
   * Serinin kendi metni her zaman jenerik şablonu YENER.
   *
   * Kullanıcı Seriler ekranında açıklama, uygulama metni ve etiket şablonu
   * giriyor; blok üretimi bunlara hiç bakmadan jenerik metin yazıyordu. Blok
   * yazılınca içerik zinciri seriye düşmediği için girilen bilgi ilanlara hiç
   * ulaşmıyordu. Alan alan devralınır: seride olan alan seriden, olmayan
   * şablondan gelir — yarım dolu seri yüzünden içerik kaybolmasın.
   */
  const own = ctx.seriesContent ?? {};
  const pick = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const longDescription = [
    `<p><strong>Art of Colour {{seri}} {{renk}}</strong>, {{ambalaj}} ambalajında hazır kullanım boyasıdır.`,
    `{{#kullanim}} {{kullanim}} uygulamaları için üretilmiştir.{{/kullanim}}</p>`,
    `<p>Uygulanabilir yüzeyler: ${yuzey}.</p>`,
    `<p><strong>Nasıl uygulanır?</strong></p>`,
    `<ul>`,
    `<li>Yüzeyi tozdan, yağdan ve nemden arındırın; parlak yüzeyleri hafifçe matlaştırın.</li>`,
    `<li>Kullanmadan önce ürünü iyice karıştırın.</li>`,
    `<li>İnce katlar hâlinde uygulayın; tek kalın kat yerine 2-3 ince kat daha düzgün sonuç verir.</li>`,
    `<li>Katlar arasında yüzey dokunma kuruluğuna gelene kadar bekleyin.</li>`,
    `<li>Dayanıklılık ve parlaklık için üzerine vernik uygulanabilir.</li>`,
    `</ul>`,
    `<p><strong>Ürün bilgisi</strong></p>`,
    `<ul>`,
    `<li>Seri: {{seri}}</li>`,
    `<li>Renk: {{renk}}</li>`,
    `<li>Ambalaj: {{ambalaj}}</li>`,
    `</ul>`,
    `<p>Çocukların erişemeyeceği yerde, serin ve havadar ortamda saklayınız.</p>`,
  ].join("");

  return {
    titlePattern: "{{renk}} {{kullanim}} Boyası {{ambalaj}}",
    shortDescription:
      pick(own.shortDescription) ??
      `Art of Colour {{seri}} serisi {{renk}} tonu, {{ambalaj}} ambalajında. ` +
        `İnce katlar hâlinde kolay uygulanır, düzgün ve homojen kapatır.`,
    longDescription: pick(own.longDescription) ?? longDescription,
    applicationText:
      pick(own.applicationText) ??
      pick(own.guideTemplate) ??
      `Yüzeyi tozdan ve yağdan arındırın, parlak yüzeyleri hafifçe matlaştırın. ` +
        `Ürünü kullanmadan önce iyice karıştırın. 2-3 ince kat hâlinde uygulayın; ` +
        `katlar arasında yüzeyin dokunma kuruluğuna gelmesini bekleyin. ` +
        `İnce kat, tek kalın kattan daha düzgün ve akmasız sonuç verir. ` +
        `Dayanıklılık için üzerine vernik uygulayabilirsiniz.`,
    labelText:
      pick(own.labelTemplate) ??
      `{{seri}} {{renk}} · {{ambalaj}}\nÇocuklardan uzak tutunuz. Serin ve havadar ortamda saklayınız.`,
  };
}
