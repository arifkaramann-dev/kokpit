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

import { DEFAULT_WATERMARK, newLayerId, type Layer, type LayerBox, type TemplateLayout } from "./layout";

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
    /*
     * Türkçe ad ÜSTTE ve büyük, İngilizce altta.
     *
     * Önce tersiydi (İngilizce büyük, Türkçe soluk dipnot) ve markanın ana
     * pazarı Türkiye olduğu için kartın en görünür ikinci satırı müşterinin
     * aradığı kelime değildi. İki ad ayrı katman kalıyor: kartta alt alta,
     * satış adında "FUŞYA / MAGENTA" olarak yan yana yazılıyor.
     */
    {
      id: newLayerId("nameTr"),
      type: "text",
      box: { x, y: y + 0.075 * scale, w: 0.9 - x, h: 0.05 * scale },
      text: "{nameTr}",
      size: 0.034 * scale,
      weight: 400,
      color: INK_SOFT,
      align: "left",
      transform: "upper",
      visible: true,
    },
    {
      id: newLayerId("nameEn"),
      type: "text",
      box: { x, y: y + 0.122 * scale, w: 0.9 - x, h: 0.04 * scale },
      text: "{nameEn}",
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
        id: newLayerId("nameTr"),
        type: "text",
        box: { x: 0.07, y: textY + 0.095, w: 0.6, h: 0.05 },
        text: "{nameTr}",
        size: 0.04,
        weight: 400,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameEn"),
        type: "text",
        box: { x: 0.07, y: textY + 0.15, w: 0.6, h: 0.04 },
        text: "{nameEn}",
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
        id: newLayerId("nameTr"),
        type: "text",
        box: { x: 0.08, y: 0.755, w: 0.84, h: 0.04 },
        text: "{nameTr}",
        size: 0.05,
        weight: 400,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameEn"),
        type: "text",
        box: { x: 0.08, y: 0.8, w: 0.84, h: 0.035 },
        text: "{nameEn}",
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

/**
 * KAT SİSTEMİ — "bu boya hangi katmanlarla uygulanır".
 *
 * ── Neden şema, neden fotoğraf değil ──────────────────────────────────────
 * Aynı objenin siyah → efektli → vernikli üç aşamasını çekmek her renk için
 * üç ayrı AI karesi demek. Şema hiçbir kare gerektirmiyor, her seride doğru
 * ve anında üretiliyor. Objenin aşama kareleri VARSA alt şeride ekleniyor
 * (`coat1..3` görünür kalıyor); yoksa şema tek başına da tam bir kare.
 *
 * Dört halka yeri var ama her seri o kadar kullanmıyor: boş halkanın metni
 * boş dizeye iniyor ve kutu görünmez kalıyor. Kutu sayısını şablona gömmek,
 * iki katlı seride ortada boş bir kare bırakırdı.
 */
function coatSystemLayout(): TemplateLayout {
  const cells: Layer[] = [];
  // Dört sütun: kutu + ok. Ok SON halkadan sonra yazılmıyor — metni boş kalan
  // halkada zaten görünmez, dolu son halkada ise sarkan bir ok kalmasın diye
  // okun metni bir SONRAKİ katmanın adına bağlı.
  for (let i = 0; i < 4; i += 1) {
    const x = 0.06 + i * 0.225;
    cells.push({
      id: newLayerId(`katkutu${i + 1}`),
      type: "rect",
      box: { x, y: 0.34, w: 0.195, h: 0.2 },
      fill: i === 0 ? "#e4e4e7" : "paint",
      opacity: i === 0 ? 1 : 0.18 + i * 0.27,
      radius: 0.014,
      visible: true,
    });
    cells.push({
      id: newLayerId(`katno${i + 1}`),
      type: "text",
      box: { x: x + 0.015, y: 0.36, w: 0.16, h: 0.04 },
      text: `${i + 1}`,
      size: 0.03,
      weight: 700,
      color: INK_FAINT,
      align: "left",
      transform: "none",
      visible: true,
    });
    cells.push({
      id: newLayerId(`katad${i + 1}`),
      type: "text",
      box: { x: x + 0.015, y: 0.425, w: 0.165, h: 0.06 },
      text: `{katman${i + 1}}`,
      size: 0.024,
      weight: 700,
      color: INK,
      align: "left",
      transform: "upper",
      wrap: true,
      visible: true,
    });
    cells.push({
      id: newLayerId(`katurun${i + 1}`),
      type: "text",
      box: { x: x + 0.015, y: 0.49, w: 0.165, h: 0.04 },
      text: `{urun${i + 1}}`,
      size: 0.016,
      weight: 400,
      color: INK_SOFT,
      align: "left",
      transform: "upper",
      wrap: true,
      visible: true,
    });
    if (i < 3) {
      cells.push({
        id: newLayerId(`katok${i + 1}`),
        type: "text",
        // Ok yalnız SONRAKİ halka doluysa yazılıyor. Kararı yer tutucu
        // veriyor (`{ok1}` = sonraki halka varsa "→", yoksa boş): şablon
        // kaç katlı seride kullanılacağını bilmiyor, veri biliyor.
        box: { x: x + 0.196, y: 0.415, w: 0.03, h: 0.05 },
        text: `{ok${i + 1}}`,
        size: 0.028,
        weight: 400,
        color: INK_FAINT,
        align: "center",
        transform: "none",
        visible: true,
      });
    }
  }

  // Aşama kareleri — objenin kat kat hâli. Üretilmişse çizilir.
  for (let i = 0; i < 3; i += 1) {
    cells.push({
      id: newLayerId(`asama${i + 1}`),
      type: "image",
      box: { x: 0.09 + i * 0.29, y: 0.6, w: 0.24, h: 0.2 },
      source: (`coat${i + 1}` as "coat1" | "coat2" | "coat3"),
      fit: "contain",
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
        id: newLayerId("sistembaslik"),
        type: "text",
        box: { x: 0.06, y: 0.27, w: 0.88, h: 0.05 },
        text: "{katSayisi}",
        size: 0.03,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...cells,
      {
        id: newLayerId("sistemozet"),
        type: "text",
        box: { x: 0.06, y: 0.83, w: 0.88, h: 0.04 },
        text: "{katSistemi}",
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
 * KULLANIM ALANI KOLAJI — bu boyayla boyanmış nesneler.
 *
 * ── Neden esnek ızgara ────────────────────────────────────────────────────
 * Her rengin dört kullanım karesi olmayacak: biri yeni eklenmiş, diğerinin
 * yalnız iki karesi üretilmiş olabilir. Sabit 2×2 ızgara o durumda kareyi
 * yarısı boş, amatör bir hâlde bırakıyordu.
 *
 * Dördü de yerleşimde duruyor ama kutular ELDEKİ KARE SAYISINA göre yeniden
 * hesaplanıyor (bkz. `usageBoxes`): iki kare yan yana büyük, üç kare şerit,
 * dört kare 2×2. Çizim tarafı yüklenemeyen kaynağı zaten atlıyor.
 */
function usageLayout(): TemplateLayout {
  const cells: Layer[] = [];
  for (let i = 0; i < 4; i += 1) {
    const box = usageBoxes(4)[i];
    cells.push({
      id: newLayerId(`use${i + 1}`),
      type: "image",
      box,
      source: (`use${i + 1}` as "use1" | "use2" | "use3" | "use4"),
      fit: "cover",
      visible: true,
    });
    cells.push({
      id: newLayerId(`uselbl${i + 1}`),
      type: "text",
      box: { x: box.x, y: box.y + box.h + 0.008, w: box.w, h: 0.03 },
      text: `{kullanim${i + 1}}`,
      size: 0.019,
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
    layers: [...heading(0.06, 0.055), ...cells, ...footer(0.945, 0.017, 1)],
  };
}

/**
 * Kolaj kutuları — kaç kare varsa ona göre.
 *
 * Çizim anında çağrılır: yerleşim dört kutuyla kaydedilmiş olsa bile gerçek
 * kare sayısı ancak üretim anında biliniyor.
 */
export function usageBoxes(count: number): LayerBox[] {
  const top = 0.28;
  if (count <= 1) return [{ x: 0.12, y: top, w: 0.76, h: 0.5 }];
  if (count === 2) {
    return [
      { x: 0.06, y: top, w: 0.43, h: 0.44 },
      { x: 0.51, y: top, w: 0.43, h: 0.44 },
    ];
  }
  if (count === 3) {
    return [
      { x: 0.06, y: top, w: 0.283, h: 0.38 },
      { x: 0.3585, y: top, w: 0.283, h: 0.38 },
      { x: 0.657, y: top, w: 0.283, h: 0.38 },
    ];
  }
  return [
    { x: 0.08, y: top, w: 0.4, h: 0.28 },
    { x: 0.52, y: top, w: 0.4, h: 0.28 },
    { x: 0.08, y: top + 0.32, w: 0.4, h: 0.28 },
    { x: 0.52, y: top + 0.32, w: 0.4, h: 0.28 },
  ];
}

/**
 * SERİ BANNER'I — reklam karesi.
 *
 * Dört ölçüde de aynı tarif kullanılıyor; oran farkını dikey akış kendisi
 * soğuruyor (kutular yüksekliğin oranı). Ölçüye özel dört ayrı yerleşim
 * tutmak, bir metni değiştirince dördünü de elle güncellemek demekti.
 *
 * Kare "renk" değil "seri" anlatıyor: konu tek bir renk olmadığı için palet
 * katmanı merkezde — müşteri serinin gamını bir bakışta görüyor.
 */
function bannerLayout(width: number, height: number): TemplateLayout {
  const wide = width / height >= 1.6;
  const tall = height / width >= 1.5;
  const aspect = width / height;
  // Geniş banner'da metin solda, palet sağda; kare ve dikeyde alt alta.
  const textW = wide ? 0.44 : 0.88;
  const paletteBox = wide
    ? { x: 0.54, y: 0.18, w: 0.4, h: 0.62 }
    : { x: 0.06, y: tall ? 0.42 : 0.46, w: 0.88, h: tall ? 0.3 : 0.34 };

  return {
    width,
    height,
    background: "#0a0a0a",
    layers: [
      {
        id: newLayerId("zemin"),
        type: "rect",
        box: { x: 0, y: 0, w: 1, h: 1 },
        fill: "paint",
        opacity: 0.22,
        gradient: true,
        visible: true,
      },
      {
        id: newLayerId("seri"),
        type: "text",
        box: { x: 0.06, y: 0.1, w: textW, h: 0.08 },
        text: "{line}",
        size: 0.055 / (wide ? 1.4 : 1),
        weight: 700,
        color: "#ffffff",
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("slogan"),
        type: "text",
        box: { x: 0.06, y: 0.19, w: textW, h: 0.14 },
        text: "{slogan}",
        size: 0.038 / (wide ? 1.3 : 1),
        weight: 700,
        color: "#ffffff",
        align: "left",
        transform: "none",
        wrap: true,
        lineHeight: 1.25,
        visible: true,
      },
      ...[1, 2, 3].map((n, i) => ({
        id: newLayerId(`madde${n}`),
        type: "text" as const,
        box: { x: 0.06, y: 0.34 + i * 0.045, w: textW, h: 0.04 },
        text: `{madde${n}}`,
        size: 0.022 / (wide ? 1.25 : 1),
        weight: 400 as const,
        color: "#d4d4d8",
        align: "left" as const,
        transform: "none" as const,
        visible: true,
      })),
      {
        id: newLayerId("palet"),
        type: "palette",
        box: paletteBox,
        columns: 0,
        gap: 0.012,
        showCode: false,
        labelSize: 0.016,
        labelColor: "#a1a1aa",
        radius: 0.008,
        highlight: false,
        visible: true,
      },
      {
        id: newLayerId("gam"),
        type: "text",
        box: { x: 0.06, y: tall ? 0.78 : 0.84, w: 0.88, h: 0.04 },
        text: "{packSizes}",
        size: 0.018,
        weight: 400,
        color: "#a1a1aa",
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...footer(tall ? 0.95 : 0.93, 0.016, aspect),
    ],
  };
}

/** Şablon kimliği → fabrika yerleşimi. */
export function defaultLayout(templateId: string): TemplateLayout {
  switch (templateId) {
    case "system":
      return coatSystemLayout();
    case "usage":
      return usageLayout();
    case "banner":
      return bannerLayout(1080, 1080);
    case "bannerWide":
      return bannerLayout(1200, 628);
    case "bannerHero":
      return bannerLayout(1920, 600);
    case "bannerStory":
      return bannerLayout(1080, 1920);
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
