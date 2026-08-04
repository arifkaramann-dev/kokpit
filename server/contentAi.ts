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
      `Art of Colour {{seri}} serisi {{renk}} tonu, {{ambalaj}} ambalajında. ` +
      `İnce katlar hâlinde kolay uygulanır, düzgün ve homojen kapatır.`,
    longDescription,
    applicationText:
      `Yüzeyi tozdan ve yağdan arındırın, parlak yüzeyleri hafifçe matlaştırın. ` +
      `Ürünü kullanmadan önce iyice karıştırın. 2-3 ince kat hâlinde uygulayın; ` +
      `katlar arasında yüzeyin dokunma kuruluğuna gelmesini bekleyin. ` +
      `İnce kat, tek kalın kattan daha düzgün ve akmasız sonuç verir. ` +
      `Dayanıklılık için üzerine vernik uygulayabilirsiniz.`,
    labelText: `{{seri}} {{renk}} · {{ambalaj}}\nÇocuklardan uzak tutunuz. Serin ve havadar ortamda saklayınız.`,
  };
}
