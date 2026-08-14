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

import { DEFAULT_WATERMARK, newLayerId, type Layer, type TemplateLayout } from "./layout";

const INK = "#0a0a0a";
const INK_SOFT = "#3f3f46";
const INK_FAINT = "#a1a1aa";

/**
 * Marka alt şeridi — logo solda, site sağda. Altı şablonun beşinde ortak.
 *
 * ── Logo neden `aspect` istiyor ───────────────────────────────────────────
 * Kutunun eni GENİŞLİĞİN, boyu YÜKSEKLİĞİN oranı. Marka logosu kare (1:1) ve
 * `contain` küçük olan kenara sığdırıyor: eski kutu (0.14 × 0.045) 1400'lük
 * karede 63 pikselle sınırlanıyordu — kare markasız görünüyordu, çünkü asıl
 * sınır boydu, en değil. Kutunun boyu artık `logoW * (genişlik/yükseklik)`
 * ile veriliyor; logo hangi orandaki karede olursa olsun gerçekten KARE ve
 * istenen büyüklükte çıkıyor.
 *
 * `y` şeridin ORTA çizgisi (üstü değil): logo büyüdükçe alt kenardan taşmasın
 * ve site yazısı logoyla aynı hizada kalsın.
 */
function footer(y: number, size: number, aspect: number): Layer[] {
  const logoW = 0.085;
  const logoH = logoW * aspect;
  const siteSize = size * 1.15;
  return [
    {
      id: newLayerId("logo"),
      type: "image",
      box: { x: 0.06, y: y - logoH / 2, w: logoW, h: logoH },
      source: "logo",
      fit: "contain",
      visible: true,
    },
    {
      id: newLayerId("site"),
      type: "text",
      // Metin üstten hizalanıyor; yarım satır yukarı kaydırmak onu logonun
      // orta çizgisine oturtuyor.
      box: { x: 0.5, y: y - (siteSize * aspect) / 2, w: 0.44, h: siteSize * aspect * 1.6 },
      text: "{site}",
      size: siteSize,
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
      // Rengin kendisinden yumuşak bir zemin: beyaz üstünde beyaz ambalaj
      // fotoğrafı havada duruyordu, kare de rengi ancak numunede gösteriyordu.
      //
      // Sol kenarı obje kutusunun BİTTİĞİ yerde başlıyor (0.05 + 0.52 = 0.57):
      // AI çıktısı beyaz FONLU geliyor, yani objenin kutusu opak bir beyaz
      // dikdörtgen. Üst üste binerlerse o beyaz, yıkamanın üstünü kesiyor.
      {
        id: newLayerId("wash"),
        type: "rect",
        box: { x: 0.585, y: 0.05, w: 0.375, h: 0.74 },
        fill: "paint",
        opacity: 0.1,
        radius: 0.03,
        gradient: true,
        visible: true,
      },
      ...heading(0.06, 0.055),
      {
        id: newLayerId("pack"),
        type: "image",
        box: { x: 0.55, y: 0.06, w: 0.4, h: 0.7 },
        source: "packaging",
        fit: "contain",
        shadow: true,
        visible: true,
      },
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.05, y: 0.42, w: 0.52, h: 0.42 },
        source: "object",
        fit: "contain",
        shadow: true,
        visible: true,
      },
      {
        id: newLayerId("sizes"),
        type: "text",
        box: { x: 0.06, y: 0.855, w: 0.88, h: 0.03 },
        text: "{packSizes}",
        size: 0.019,
        weight: 400,
        color: INK_FAINT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...footer(0.925, 0.017, 1),
    ],
  };
}

/**
 * Ambalaj gamı — "bu renk hangi boylarda var?"
 *
 * En sık sorulan soru ve bugüne kadar hiçbir karede cevabı yoktu; müşteri
 * ilanın açıklamasını okumak zorundaydı. Kutular Tanımlar'daki çekimlerden,
 * etiketler ambalaj adlarından geliyor — yani yeni bir boy eklenince kare
 * kendiliğinden doğru çıkar.
 *
 * Dört kutuluk yer var: gamın tamamı değil, ilk dört boy. Beşinci boy
 * `{packSizes}` satırında yine yazılı.
 */
function rangeLayout(): TemplateLayout {
  const slots: Layer[] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = 0.055 + i * 0.2375;
    slots.push({
      id: newLayerId(`pack${i + 1}`),
      type: "image",
      box: { x, y: 0.3, w: 0.2, h: 0.36 },
      source: (`pack${i + 1}` as "pack1" | "pack2" | "pack3" | "pack4"),
      fit: "contain",
      shadow: true,
      visible: true,
    });
    slots.push({
      id: newLayerId(`packlbl${i + 1}`),
      type: "text",
      box: { x, y: 0.68, w: 0.2, h: 0.035 },
      text: `{pack${i + 1}}`,
      size: 0.022,
      weight: 700,
      color: INK_SOFT,
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
        id: newLayerId("strip"),
        type: "rect",
        box: { x: 0.06, y: 0.265, w: 0.88, h: 0.012 },
        fill: "paint",
        radius: 0.006,
        visible: true,
      },
      ...slots,
      // Renk numunesi kutuların altında: kutular rengi göstermiyor (etiket her
      // renkte aynı), rengi gösteren tek şey numune.
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.055, y: 0.73, w: 0.3, h: 0.15 },
        source: "object",
        fit: "contain",
        visible: true,
      },
      {
        id: newLayerId("note"),
        type: "text",
        box: { x: 0.42, y: 0.79, w: 0.52, h: 0.06 },
        // `{series}` değil `{line} {effect}`: seri etiketi ("Vivid Candy")
        // küçük harf taşıyor ve Türkçe büyütmede "VİVİD" oluyor. Hat ve efekt
        // zaten büyük harfle tanımlı.
        text: "{brand} · {line} {effect}",
        size: 0.022,
        weight: 700,
        color: INK_SOFT,
        align: "right",
        transform: "upper",
        visible: true,
      },
      ...footer(0.925, 0.017, 1),
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
        shadow: true,
        visible: true,
      },
      ...cells,
      ...footer(0.925, 0.017, 1),
    ],
  };
}

/**
 * Seri paleti — "bu serinin diğer renkleri", kodlarıyla.
 *
 * Katalog ve pazarlama karesi: müşteri bir rengi beğendiğinde ikinci sorusu
 * "başka hangi renkler var" oluyor ve cevabı ilan açıklamasında yazıyordu.
 * Izgara kendini renk sayısına göre kuruyor, yani yeni renk eklendiğinde kare
 * kendiliğinden doğru çıkar — şablona dönüp elle kutu eklemek gerekmez.
 */
function paletteLayout(): TemplateLayout {
  return {
    width: 1400,
    height: 1400,
    background: "#ffffff",
    layers: [
      ...heading(0.06, 0.055),
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.63, y: 0.05, w: 0.31, h: 0.16 },
        source: "object",
        fit: "contain",
        visible: true,
      },
      {
        id: newLayerId("title"),
        type: "text",
        box: { x: 0.06, y: 0.255, w: 0.88, h: 0.035 },
        // Hattı ve efekti üstteki kimlik bloğu zaten yazıyor; burada tekrarı
        // kareyi kalabalıklaştırıyordu.
        text: "SERİNİN DİĞER RENKLERİ",
        size: 0.023,
        weight: 700,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("palette"),
        type: "palette",
        box: { x: 0.06, y: 0.3, w: 0.88, h: 0.56 },
        // 0 = otomatik: kolon sayısı renk sayısına göre hesaplanır, hepsi tek
        // kareye sığar. Seri büyüdüğünde şablona dönmek gerekmesin.
        columns: 0,
        gap: 0.012,
        showCode: true,
        labelSize: 0.017,
        labelColor: INK_SOFT,
        radius: 0.008,
        highlight: true,
        visible: true,
      },
      ...footer(0.925, 0.017, 1),
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
    // Filigran BURADA yasak. `resolveWatermark` çıplak şablonda zaten çizdirmez;
    // burada da açıkça kapalı duruyor ki editörde açık görünüp kullanıcıya
    // "koruma var" yalanını söylemesin.
    watermark: { ...DEFAULT_WATERMARK, enabled: false },
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
        shadow: true,
        visible: true,
      },
      {
        id: newLayerId("strip"),
        type: "rect",
        box: { x: 0, y: stripY, w: 1, h: 0.028 },
        fill: "paint",
        visible: true,
      },
      // Şeridin altına aynı renkten sönen bir geçiş: düz şerit kartı iki
      // parçaya bölüyor, geçiş metin bloğuna bağlıyor.
      {
        id: newLayerId("fade"),
        type: "rect",
        box: { x: 0, y: stripY + 0.028, w: 1, h: 0.05 },
        fill: "paint",
        opacity: 0.22,
        gradient: true,
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
      ...footer(0.94, 0.019, width / height),
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
        id: newLayerId("fade"),
        type: "rect",
        box: { x: 0, y: 0.655, w: 1, h: 0.04 },
        fill: "paint",
        opacity: 0.22,
        gradient: true,
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
      ...footer(0.95, 0.022, 1080 / 1920),
    ],
  };
}

/** Şablon kimliği → fabrika yerleşimi. */
export function defaultLayout(templateId: string): TemplateLayout {
  switch (templateId) {
    case "product":
      return productLayout();
    case "range":
      return rangeLayout();
    case "palette":
      return paletteLayout();
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
