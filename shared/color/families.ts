/**
 * ŞABLON AİLELERİ — üç ayrı iş, üç ayrı tasarım dili.
 *
 * ── Neden bu dosya var ────────────────────────────────────────────────────
 * Şablonlar tek bir düz listeydi: on dört kare, tek tasarım dili, hepsi tek
 * seferde üretiliyordu. Ama o on dört kare üç FARKLI işi yapıyor ve üçünün
 * kuralları birbirinin zıddı:
 *
 *   PAZARLAMA  sattırır   → ürün kahraman, beyaz fon, bilgi yoğun, 5 saniye
 *   TANITIM    anlatır    → şema kahraman, açık nötr fon, etiketli, 15 saniye
 *   BANNER     durdurur   → YAZI kahraman, çizilmiş sahne, tek iddia, 1.5 saniye
 *
 * Aile ayrımı olmayınca banner'a pazarlama ve tanıtım kelimeleri sızdı: beyaz
 * kutucuklar, madde listesi, renk çipleri, ambalaj boy şeridi, kimlik bloğu.
 * Afiş "doldurulmuş bir şablon" gibi görünüyordu ve dört ayrı denemede tek tek
 * yamanarak düzelmedi — çünkü sorun katmanlarda değil, banner'ın kendine ait
 * bir kelime dağarcığı olmamasındaydı.
 *
 * ── Sözleşme neyi garanti eder ────────────────────────────────────────────
 * Buradaki kurallar YORUM DEĞİL, denetlenen kurallar: `checkLayout` her fabrika
 * yerleşimini ailesinin sözleşmesine karşı sınıyor ve test bunu bağlıyor. Yani
 * banner'a bir gün yeniden palet katmanı eklenirse derleme değil ama test
 * kırılır. Yasakların tek tek yazılmasının sebebi bu: bir daha sızmasın.
 */

import type { Layer, TemplateLayout } from "./layout";

export type TemplateFamily = "pazarlama" | "tanitim" | "banner";

export const FAMILY_IDS: TemplateFamily[] = ["pazarlama", "tanitim", "banner"];

export type FamilyContract = {
  id: TemplateFamily;
  label: string;
  /** Ekranda ailenin ne işe yaradığını söyleyen tek cümle. */
  purpose: string;
  /** Ailenin zemini — üçü de farklı ve karışmamalı. */
  background: string;
  /**
   * Zemin kuralı.
   * `white`  saf beyaz (pazaryeri kuralı da bunu istiyor)
   * `neutral` çok açık nötr — şema okunsun, dekor olmasın
   * `scene`  motorla çizilen sahne (bkz. `scene` katmanı)
   */
  ground: "white" | "neutral" | "scene";
  /** Kimlik bloğu (kod + TR ad + EN ad + seri) basılır mı. */
  identityBlock: boolean;
  /** Bu ailede kullanılamayacak katman türleri. */
  denyTypes: Layer["type"][];
  /** Kaç metin katmanına kadar. Afişte tek iddia; kartta bilgi serbest. */
  maxTextLayers: number;
};

/**
 * BANNER'DA YASAK — sözleşmenin dışında ayrıca isimle yasaklananlar.
 *
 * Katman TÜRÜ yasağı yetmiyor: madde listesi de ambalaj boy şeridi de birer
 * metin katmanı. Bunlar afişte okunmuyor ve dördüncü denemeye kadar hep geri
 * geldiler; yer tutucu adıyla yasaklanıyorlar.
 */
export const BANNER_FORBIDDEN_TOKENS = [
  "{madde1}",
  "{madde2}",
  "{madde3}",
  "{packSizes}",
  "{pack1}",
  "{pack2}",
  "{pack3}",
  "{pack4}",
  "{code}",
  "{nameTr}",
  "{nameEn}",
  "{katSistemi}",
  "{katman1}",
];

export const FAMILIES: Record<TemplateFamily, FamilyContract> = {
  pazarlama: {
    id: "pazarlama",
    label: "Pazarlama",
    purpose: "Sattırır — ürün kahraman, beyaz fon, kod ve boy yazılı.",
    background: "#ffffff",
    ground: "white",
    identityBlock: true,
    // Çizilmiş sahne satış karesinde fonu kirletir; pazaryeri de reddeder.
    denyTypes: ["scene"],
    maxTextLayers: 14,
  },
  tanitim: {
    id: "tanitim",
    label: "Tanıtım",
    purpose: "Anlatır — şema ve etiket kahraman, okunaklılık her şeyin önünde.",
    background: "#fbfbfc",
    ground: "neutral",
    identityBlock: true,
    denyTypes: ["scene"],
    // Kat sistemi şemasında halka başına dört etiket var; sınır ona göre.
    maxTextLayers: 30,
  },
  banner: {
    id: "banner",
    label: "Banner",
    purpose: "Durdurur — dev yazı, çizilmiş sahne, tek iddia.",
    background: "#0a0a0c",
    ground: "scene",
    identityBlock: false,
    // Palet çipi katalog işidir, afiş işi değil.
    denyTypes: ["palette"],
    // {line} + {renkSayisi} + {slogan} + {site} = 4. Beşincisi kalabalıktır.
    maxTextLayers: 4,
  },
};

export function familyOf(id: TemplateFamily): FamilyContract {
  return FAMILIES[id];
}

/**
 * Yerleşimi ailesinin sözleşmesine karşı sınar.
 *
 * Hata FIRLATMAZ, ihlalleri liste olarak döner: çağıran kullanıcı yerleşimini
 * denetliyorsa uyarı gösterir, test ise boş liste bekler. Kullanıcının kendi
 * düzenlediği şablonu "kurala uymuyor" diye çizmemek, ona kareyi hiç vermemek
 * olurdu — kural fabrika tarifini bağlar, kullanıcıyı uyarır.
 */
export function checkLayout(layout: TemplateLayout, family: TemplateFamily): string[] {
  const c = FAMILIES[family];
  const sorun: string[] = [];

  const visible = layout.layers.filter(l => l.visible);
  for (const t of c.denyTypes) {
    if (visible.some(l => l.type === t)) {
      sorun.push(`${c.label} ailesinde "${t}" katmanı kullanılamaz`);
    }
  }

  const texts = visible.filter(l => l.type === "text");
  if (texts.length > c.maxTextLayers) {
    sorun.push(
      `${c.label} ailesinde en çok ${c.maxTextLayers} metin katmanı olabilir (${texts.length} var)`,
    );
  }

  if (family === "banner") {
    for (const l of texts) {
      const yasak = BANNER_FORBIDDEN_TOKENS.filter(t => l.text.includes(t));
      if (yasak.length) sorun.push(`Afişte kullanılamaz: ${yasak.join(", ")}`);
    }
    if (!visible.some(l => l.type === "scene")) {
      sorun.push("Afişin zemini çizilmiş sahne olmalı — scene katmanı yok");
    }
  }

  if (c.ground === "white" && layout.background.toLowerCase() !== "#ffffff") {
    sorun.push(`${c.label} ailesinde zemin saf beyaz olmalı`);
  }

  return sorun;
}
