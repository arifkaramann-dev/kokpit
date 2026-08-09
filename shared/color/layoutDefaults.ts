/**
 * Şablonların fabrika yerleşimleri.
 *
 * Kaynak uygulamanın koda gömülü çizimleri buraya katman listesi olarak
 * taşındı. Taşırken tasarım da elden geçti — eskisi dar ve sıkışıktı:
 * başlık bloğu kenara yapışıyor, obje alanı metne bindiriyordu.
 *
 * Bunlar VARSAYILAN: kullanıcı düzenleyince kendi sürümü veritabanına yazılır
 * ve buradaki tarif yalnız "fabrika ayarlarına dön" için kalır.
 *
 * ── Ortak dil ─────────────────────────────────────────────────────────────
 * Tüm kutular oran (0..1). Yatay ölçüler genişliğe, dikey ölçüler yüksekliğe
 * göre; böylece kare gönderi ile 9:16 story aynı tarifle doğru çalışır.
 */

import { newLayerId, type Layer, type TemplateLayout } from "./layout";

const INK = "#0a0a0a";
const INK_SOFT = "#3f3f46";
const INK_FAINT = "#a1a1aa";

/** Marka alt şeridi — logo solda, site sağda. Altı şablonun beşinde ortak. */
function footer(y: number, size: number): Layer[] {
  return [
    {
      id: newLayerId("logo"),
      type: "image",
      box: { x: 0.06, y, w: 0.14, h: 0.045 },
      source: "logo",
      fit: "contain",
      visible: true,
    },
    {
      id: newLayerId("site"),
      type: "text",
      box: { x: 0.6, y: y + 0.012, w: 0.34, h: 0.03 },
      text: "{site}",
      size,
      weight: 400,
      color: INK_FAINT,
      align: "right",
      transform: "none",
      visible: true,
    },
  ];
}

/** Kod + isimler + seri — kartın kimlik bloğu. */
function heading(x: number, y: number, scale = 1): Layer[] {
  return [
    {
      id: newLayerId("code"),
      type: "text",
      box: { x, y, w: 0.9 - x, h: 0.08 * scale },
      text: "{code}",
      size: 0.062 * scale,
      weight: 700,
      color: INK,
      align: "left",
      transform: "upper",
      visible: true,
    },
    {
      id: newLayerId("nameEn"),
      type: "text",
      box: { x, y: y + 0.075 * scale, w: 0.9 - x, h: 0.05 * scale },
      text: "{nameEn}",
      size: 0.034 * scale,
      weight: 400,
      color: INK_SOFT,
      align: "left",
      transform: "upper",
      visible: true,
    },
    {
      id: newLayerId("nameTr"),
      type: "text",
      box: { x, y: y + 0.122 * scale, w: 0.9 - x, h: 0.04 * scale },
      text: "{nameTr}",
      size: 0.024 * scale,
      weight: 400,
      color: INK_FAINT,
      align: "left",
      transform: "upper",
      visible: true,
    },
    {
      id: newLayerId("series"),
      type: "text",
      box: { x, y: y + 0.163 * scale, w: 0.9 - x, h: 0.035 * scale },
      text: "{line}  {effect}",
      size: 0.021 * scale,
      weight: 700,
      color: INK,
      align: "left",
      transform: "upper",
      visible: true,
    },
  ];
}

/** Ürün + numune — ana satış görseli. */
function productLayout(): TemplateLayout {
  return {
    width: 1400,
    height: 1400,
    background: "#ffffff",
    layers: [
      ...heading(0.06, 0.055),
      {
        id: newLayerId("pack"),
        type: "image",
        box: { x: 0.55, y: 0.06, w: 0.4, h: 0.7 },
        source: "packaging",
        fit: "contain",
        visible: true,
      },
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.05, y: 0.42, w: 0.52, h: 0.42 },
        source: "object",
        fit: "contain",
        visible: true,
      },
      ...footer(0.9, 0.017),
    ],
  };
}

/**
 * Kat progresyonu.
 *
 * Üç küçük kare + etiketleri ayrı katman: kullanıcı kat sayısını azaltmak
 * isterse fazlasını görünmez yapabilsin, kod değişmesin.
 */
function coatsLayout(): TemplateLayout {
  const cells: Layer[] = [];
  for (let i = 0; i < 3; i += 1) {
    const x = 0.06 + i * 0.293;
    cells.push({
      id: newLayerId(`coat${i + 1}`),
      type: "image",
      box: { x, y: 0.66, w: 0.26, h: 0.16 },
      source: (`coat${i + 1}` as "coat1" | "coat2" | "coat3"),
      fit: "contain",
      visible: true,
    });
    cells.push({
      id: newLayerId(`coatlbl${i + 1}`),
      type: "text",
      box: { x, y: 0.835, w: 0.26, h: 0.03 },
      text: `${i + 1} KAT`,
      size: 0.022,
      weight: 700,
      color: "#52525b",
      align: "center",
      transform: "upper",
      visible: true,
    });
  }
  return {
    width: 1400,
    height: 1400,
    background: "#ffffff",
    layers: [
      ...heading(0.06, 0.055),
      {
        id: newLayerId("main"),
        type: "image",
        box: { x: 0.18, y: 0.28, w: 0.64, h: 0.34 },
        source: "coat3",
        fit: "contain",
        visible: true,
      },
      ...cells,
      ...footer(0.9, 0.017),
    ],
  };
}

/**
 * Pazaryeri ana görseli — ÇIPLAK.
 *
 * Amazon ve Trendyol ana görselde yazı, logo, filigran, çerçeve kabul
 * etmiyor. Bu şablona metin katmanı eklenmemeli; eklenirse ilan reddedilir.
 */
function marketplaceLayout(): TemplateLayout {
  return {
    width: 1600,
    height: 1600,
    background: "#ffffff",
    layers: [
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
        source: "object",
        fit: "contain",
        visible: true,
      },
    ],
  };
}

/** Obje üstte, renk şeridi, metin bloğu — katalog ve site listesi. */
function cardLayout(width: number, height: number): TemplateLayout {
  const objH = 0.58;
  const stripY = objH + 0.02;
  const textY = stripY + 0.06;
  return {
    width,
    height,
    background: "#ffffff",
    layers: [
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.06, y: 0.05, w: 0.88, h: objH },
        source: "object",
        fit: "contain",
        visible: true,
      },
      {
        id: newLayerId("strip"),
        type: "rect",
        box: { x: 0, y: stripY, w: 1, h: 0.028 },
        fill: "paint",
        visible: true,
      },
      {
        id: newLayerId("code"),
        type: "text",
        box: { x: 0.07, y: textY, w: 0.5, h: 0.09 },
        text: "{code}",
        size: 0.072,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameEn"),
        type: "text",
        box: { x: 0.07, y: textY + 0.095, w: 0.6, h: 0.05 },
        text: "{nameEn}",
        size: 0.04,
        weight: 400,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameTr"),
        type: "text",
        box: { x: 0.07, y: textY + 0.15, w: 0.6, h: 0.04 },
        text: "{nameTr}",
        size: 0.032,
        weight: 400,
        color: "#71717a",
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("series"),
        type: "text",
        box: { x: 0.07, y: textY + 0.2, w: 0.5, h: 0.035 },
        text: "{line}  {effect}",
        size: 0.025,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("sizes"),
        type: "text",
        box: { x: 0.45, y: textY + 0.204, w: 0.48, h: 0.03 },
        text: "{packSizes}",
        size: 0.018,
        weight: 400,
        color: INK_FAINT,
        align: "right",
        transform: "upper",
        visible: true,
      },
      ...footer(0.92, 0.019),
    ],
  };
}

/** Dikey 9:16 — story ve reels. */
function storyLayout(): TemplateLayout {
  return {
    width: 1080,
    height: 1920,
    background: "#ffffff",
    layers: [
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0, y: 0, w: 1, h: 0.62 },
        source: "object",
        fit: "cover",
        visible: true,
      },
      {
        id: newLayerId("strip"),
        type: "rect",
        box: { x: 0, y: 0.635, w: 1, h: 0.02 },
        fill: "paint",
        visible: true,
      },
      {
        id: newLayerId("code"),
        type: "text",
        box: { x: 0.08, y: 0.69, w: 0.6, h: 0.06 },
        text: "{code}",
        size: 0.09,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameEn"),
        type: "text",
        box: { x: 0.08, y: 0.755, w: 0.84, h: 0.04 },
        text: "{nameEn}",
        size: 0.05,
        weight: 400,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameTr"),
        type: "text",
        box: { x: 0.08, y: 0.8, w: 0.84, h: 0.035 },
        text: "{nameTr}",
        size: 0.038,
        weight: 400,
        color: "#71717a",
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("series"),
        type: "text",
        box: { x: 0.08, y: 0.845, w: 0.84, h: 0.03 },
        text: "{line}  {effect}",
        size: 0.03,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...footer(0.93, 0.022),
    ],
  };
}

/** Şablon kimliği → fabrika yerleşimi. */
export function defaultLayout(templateId: string): TemplateLayout {
  switch (templateId) {
    case "product":
      return productLayout();
    case "coats":
      return coatsLayout();
    case "marketplace":
      return marketplaceLayout();
    case "story":
      return storyLayout();
    case "social":
      return cardLayout(1080, 1080);
    case "card":
    default:
      return cardLayout(1080, 1080);
  }
}
