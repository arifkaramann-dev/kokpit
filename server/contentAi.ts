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
 * AI erişilemezse ya da başarısız olursa kullanılacak şablon içeriği.
 * Hiçbir ilan boş açıklamayla kalmasın diye — boş ilan pazaryerine gönderilemez.
 */
export function templateContentBlock(ctx: BlockContext): GeneratedBlock {
  const yuzey = ctx.surfaces?.length ? ctx.surfaces.join(", ") : ctx.useCaseName;
  return {
    titlePattern: "{{renk}} {{kullanim}} Boyası {{ambalaj}}",
    shortDescription: `{{seri}} serisi {{renk}} tonu, {{kullanim}} uygulamaları için {{ambalaj}} ambalajında.`,
    longDescription: `<p><strong>{{seri}} {{renk}}</strong> — {{kullanim}} için geliştirilmiş boya.</p><ul><li>Uygulama alanı: ${yuzey}</li><li>Ambalaj: {{ambalaj}}</li><li>Seri: {{seri}}</li></ul>`,
    applicationText: `Yüzeyi tozdan ve yağdan arındırın. Ürünü kullanmadan önce iyice karıştırın. İnce katlar hâlinde uygulayın, katlar arasında kuruma süresine uyun. ${ctx.useCaseName} uygulamalarında ince kat tercih edin.`,
    labelText: `{{seri}} {{renk}} · {{ambalaj}}\nÇocuklardan uzak tutunuz. Serin ve havadar ortamda saklayınız.`,
  };
}
