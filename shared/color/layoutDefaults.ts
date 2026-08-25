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

import { FAMILIES } from "./families";
import {
  DEFAULT_WATERMARK,
  newLayerId,
  type Layer,
  type LayerBox,
  type TemplateLayout,
} from "./layout";

const INK = "#0a0a0a";
const INK_SOFT = "#3f3f46";
const INK_FAINT = "#a1a1aa";

/** Ailelerin zemini tek yerden — sözleşme ile yerleşim ayrışmasın. */
const PAZAR_ZEMIN = FAMILIES.pazarlama.background;
const TANITIM_ZEMIN = FAMILIES.tanitim.background;
const BANNER_ZEMIN = FAMILIES.banner.background;

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

/**
 * Ürün + numune + AMBALAJ GAMI — ana satış görseli.
 *
 * ── Neden gam da burada ───────────────────────────────────────────────────
 * "Bu renk hangi boylarda var" ayrı bir şablondu (`range`) ve bu kare de aynı
 * bilgiyi zaten `{packSizes}` satırında yazıyordu: aynı cevap iki karede, biri
 * yazıyla biri görselle. İki kare üretip müşteriye ikisini de göndermek,
 * ikisini de yarım göstermek demekti.
 *
 * Birleşti: üstte ürünün kendi kutusu ve rengin numunesi (asıl satış kurgusu),
 * altta gamın şeridi. Gamın çekimi yoksa şerit sessizce boş kalıyor ve kare
 * eski hâliyle aynı — yani ambalaj çekimi olmayan kurulumda hiçbir şey
 * kaybedilmiyor.
 */
function productLayout(): TemplateLayout {
  const gam: Layer[] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = 0.06 + i * 0.235;
    gam.push({
      id: newLayerId(`pack${i + 1}`),
      type: "image",
      box: { x, y: 0.645, w: 0.2, h: 0.17 },
      source: (`pack${i + 1}` as "pack1" | "pack2" | "pack3" | "pack4"),
      fit: "contain",
      visible: true,
    });
    gam.push({
      id: newLayerId(`packlbl${i + 1}`),
      type: "text",
      box: { x, y: 0.828, w: 0.2, h: 0.03 },
      text: `{pack${i + 1}}`,
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
    background: PAZAR_ZEMIN,
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
        box: { x: 0.585, y: 0.05, w: 0.375, h: 0.55 },
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
        box: { x: 0.55, y: 0.055, w: 0.4, h: 0.52 },
        source: "packaging",
        fit: "contain",
        shadow: true,
        visible: true,
      },
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.05, y: 0.3, w: 0.47, h: 0.28 },
        source: "object",
        fit: "contain",
        shadow: true,
        visible: true,
      },
      // Gam şeridinin başlığı: kutular etiketsiz kalırsa "neden dört kutu var"
      // sorusu doğuyor. Tek satır cevap veriyor.
      {
        id: newLayerId("gambaslik"),
        type: "text",
        box: { x: 0.06, y: 0.595, w: 0.88, h: 0.035 },
        text: "AMBALAJ SEÇENEKLERİ",
        size: 0.021,
        weight: 700,
        color: INK_FAINT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...gam,
      ...footer(0.925, 0.017, 1),
    ],
  };
}

/**
 * DUYURU — "yeni renk geldi", "kampanya", "stokta".
 *
 * ── Neden gerekliydi ──────────────────────────────────────────────────────
 * On dört şablonun on dördü de KATALOG karesiydi: hepsi "bu ürün şudur" diyor,
 * hiçbiri haber vermiyordu. Yeni bir renk üretildiğinde paylaşılacak kare
 * yoktu; ürün kartı paylaşılıyor ve yeni olduğu hiçbir yerde yazmıyordu.
 *
 * Üstteki bant metni SABİT ve düzenlenebilir: "YENİ RENK", "KAMPANYA",
 * "STOKTA" — hangisi gerekiyorsa Şablon Editörü'nden yazılıyor. Yer tutucuya
 * bağlamadık çünkü duyurunun ne olduğu veride değil, o günün kararında.
 */
function announceLayout(): TemplateLayout {
  return {
    width: 1080,
    height: 1080,
    background: PAZAR_ZEMIN,
    layers: [
      {
        id: newLayerId("bant"),
        type: "rect",
        box: { x: 0, y: 0, w: 1, h: 0.115 },
        fill: "paint",
        visible: true,
      },
      {
        id: newLayerId("duyuru"),
        type: "text",
        box: { x: 0.06, y: 0.032, w: 0.88, h: 0.06 },
        text: "YENİ RENK",
        size: 0.052,
        weight: 700,
        color: "#ffffff",
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("obj"),
        type: "image",
        box: { x: 0.1, y: 0.16, w: 0.8, h: 0.42 },
        source: "object",
        fit: "contain",
        shadow: true,
        visible: true,
      },
      {
        id: newLayerId("code"),
        type: "text",
        box: { x: 0.07, y: 0.62, w: 0.6, h: 0.1 },
        text: "{code}",
        size: 0.085,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameTr"),
        type: "text",
        box: { x: 0.07, y: 0.725, w: 0.86, h: 0.06 },
        text: "{nameTr}",
        size: 0.048,
        weight: 400,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("nameEn"),
        type: "text",
        box: { x: 0.07, y: 0.788, w: 0.86, h: 0.05 },
        text: "{nameEn}",
        size: 0.034,
        weight: 400,
        color: INK_FAINT,
        align: "left",
        transform: "upper",
        visible: true,
      },
      {
        id: newLayerId("series"),
        type: "text",
        box: { x: 0.07, y: 0.845, w: 0.86, h: 0.04 },
        text: "{line}  {effect}",
        size: 0.026,
        weight: 700,
        color: INK,
        align: "left",
        transform: "upper",
        visible: true,
      },
      ...footer(0.935, 0.019, 1),
    ],
  };
}

/**
 * ÖNCESİ / SONRASI — rötuş işinin kanıtı.
 *
 * ── Veri kaynağı yok, kasıtlı ─────────────────────────────────────────────
 * İki kare de kullanıcının kendi çekimi: çizik kaporta ve rötuşlanmış hâli.
 * Bunlar renk kaydından türetilemez ve AI'den de üretilmemeli — "öncesi"
 * uydurmak, kanıt olması gereken karenin tek işini bitirir.
 *
 * Katmanlar `before`/`after` kaynağına bağlı ve o kaynaklar Şablon
 * Editörü'nden kullanıcının yüklediği varlığa yönlendiriliyor. Bağlanmadan
 * kare üretilmiyor (bkz. `renkCards`).
 */
function beforeAfterLayout(): TemplateLayout {
  const frame = (
    n: number,
    source: "before" | "after",
    label: string,
    x: number,
  ): Layer[] => [
    {
      id: newLayerId(`kare${n}`),
      type: "image",
      box: { x, y: 0.3, w: 0.43, h: 0.4 },
      source,
      fit: "cover",
      visible: true,
    },
    {
      id: newLayerId(`kareetiket${n}`),
      type: "text",
      box: { x, y: 0.715, w: 0.43, h: 0.04 },
      text: label,
      size: 0.026,
      weight: 700,
      color: INK_SOFT,
      align: "center",
      transform: "upper",
      visible: true,
    },
  ];
  return {
    width: 1400,
    height: 1400,
    background: TANITIM_ZEMIN,
    layers: [
      ...heading(0.06, 0.055),
      ...frame(1, "before", "ÖNCESİ", 0.05),
      ...frame(2, "after", "SONRASI", 0.52),
      // Aradaki ok: iki kare yan yana durunca hangisinin önce olduğu
      // okunmuyor. Etiketler söylüyor, ok bakışı soldan sağa çekiyor.
      {
        id: newLayerId("ok"),
        type: "text",
        box: { x: 0.475, y: 0.475, w: 0.05, h: 0.06 },
        text: "→",
        size: 0.038,
        weight: 400,
        color: INK_FAINT,
        align: "center",
        transform: "none",
        visible: true,
      },
      {
        id: newLayerId("not"),
        type: "text",
        box: { x: 0.06, y: 0.79, w: 0.88, h: 0.04 },
        text: "{brand} · {line} {effect} İLE UYGULANDI",
        size: 0.021,
        weight: 700,
        color: INK_SOFT,
        align: "left",
        transform: "upper",
        visible: true,
      },
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
    background: TANITIM_ZEMIN,
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
    background: PAZAR_ZEMIN,
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

/**
 * RENK KARTI — obje üstte, renk şeridi, metin bloğu.
 *
 * ── Üç kutu değil, tek tarif ──────────────────────────────────────────────
 * Bu tarif önce üç ayrı şablondu: `card`, `social`, `story`. `social` ile
 * `card` BİREBİR aynıydı — ikisi de aynı fonksiyonu aynı ölçüyle çağırıyordu,
 * yani üretim listesinde aynı kare iki kez duruyordu. `story` ise aynı kurgunun
 * dikey hâliydi, ayrı bir fonksiyon olarak kopyalanmıştı.
 *
 * Tek tarif kaldı, ölçüye göre uyarlanıyor: dikey kadrajda obje kadrajı
 * doldurur (`cover`) çünkü 9:16'da `contain` karenin yarısını boş bırakıyor;
 * kare kadrajda objenin tamamı görünür (`contain`) çünkü ürün kırpılmamalı.
 */
function cardLayout(width: number, height: number): TemplateLayout {
  const tall = height / width >= 1.4;
  // Dikey kadraj telefonda daha küçük görünüyor; yazı bir kademe büyüyor.
  const k = tall ? 1.25 : 1;
  const objH = tall ? 0.62 : 0.58;
  const stripY = objH + (tall ? 0.015 : 0.02);
  const textY = stripY + (tall ? 0.055 : 0.06);
  return {
    width,
    height,
    background: PAZAR_ZEMIN,
    layers: [
      {
        id: newLayerId("obj"),
        type: "image",
        box: tall ? { x: 0, y: 0, w: 1, h: objH } : { x: 0.06, y: 0.05, w: 0.88, h: objH },
        source: "object",
        fit: tall ? "cover" : "contain",
        shadow: !tall,
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
        size: 0.072 * k,
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
        size: 0.04 * k,
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
        size: 0.032 * k,
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
        size: 0.025 * k,
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
        size: 0.018 * k,
        weight: 400,
        color: INK_FAINT,
        align: "right",
        transform: "upper",
        visible: true,
      },
      ...footer(tall ? 0.95 : 0.94, 0.019 * k, width / height),
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
    background: TANITIM_ZEMIN,
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
    background: TANITIM_ZEMIN,
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
 * SERİ AFİŞİ — reklam.
 *
 * ── Afişin işi ────────────────────────────────────────────────────────────
 * Bu kare bir ürün kartı değil. Kartın işi anlatmak, afişin işi DURDURMAK:
 * akışta 1.5 saniye. O sürede okunan şey tek bir kelime öbeği ve bir sayıdır;
 * kod, ad, boy listesi, madde listesi okunmaz. Bu yüzden afişin kendi
 * sözleşmesi var (`shared/color/families.ts`) ve kimlik bloğu, palet, ambalaj
 * şeridi burada YASAK — dördü de daha önce tek tek sızıp afişi kurumsal bir
 * slayta çevirdi.
 *
 * ── Zemin neden çizilir ───────────────────────────────────────────────────
 * Önceki hâli tam sayfa fotoğraf bekliyordu ve fotoğraf gelene kadar objenin
 * kadraja yayılmış hâliyle idare ediyordu. Çekim hiç gelmedi, dolayısıyla
 * afişin zemini hiç olmadı. Artık zemin KODDAN çiziliyor: serinin aksan
 * renginden dip, gövde, ışık paneli ve halo (`shared/color/scene.ts`). Çekim
 * beklemiyor, her seride tutarlı ve seriye göre gerçekten değişiyor.
 *
 * ── Kurgu ─────────────────────────────────────────────────────────────────
 *   çizilmiş sahne → objenin arkasında halo → kadrajdan taşan obje
 *   → alttan yükselen karartma → dev SERİ YAZISI → tek iddia ("40 RENK")
 *   → önde ürün kutuları ("bu işi bu ürünle yaptık")
 */
function bannerLayout(width: number, height: number): TemplateLayout {
  const aspect = width / height;
  const wide = aspect >= 1.6;
  const tall = height / width >= 1.5;
  // Afişte yazı büyük olur; geniş bantta yükseklik sınırı ölçeği düşürüyor.
  const k = wide ? 0.5 : tall ? 0.9 : 1;

  return {
    width,
    height,
    background: BANNER_ZEMIN,
    layers: [
      /*
       * ZEMİN — tam sayfa çizilmiş sahne.
       *
       * Geniş bantta `sweep`: o oranda köşeden inen panel kadrajın yarısını
       * yiyor ve yazıya yer bırakmıyor.
       */
      {
        id: newLayerId("zemin"),
        type: "scene",
        box: { x: 0, y: 0, w: 1, h: 1 },
        variant: wide ? "sweep" : "panel",
        color: "accent",
        visible: true,
      },
      /*
       * HALO — objenin arkasındaki ışık.
       *
       * Fonu silinmiş obje ışıksız bir zeminde yüzmüyor, YAPIŞTIRILMIŞ
       * görünüyor. Halo onu zemine oturtuyor ve bakışı objeye çekiyor.
       */
      {
        id: newLayerId("halo"),
        type: "scene",
        box: wide ? { x: 0.32, y: 0, w: 0.68, h: 1 } : { x: 0.05, y: 0.05, w: 0.95, h: 0.62 },
        variant: "glow",
        color: "accent",
        opacity: 0.9,
        visible: true,
      },
      // Obje kadrajdan taşıyor: afişte kahraman çerçeveye sığmaz.
      {
        id: newLayerId("sahne"),
        type: "image",
        box: wide ? { x: 0.34, y: -0.12, w: 0.72, h: 1.3 } : { x: 0.06, y: 0.14, w: 1.02, h: 0.58 },
        source: "object",
        fit: "contain",
        knockout: true,
        visible: true,
      },
      /*
       * Karartma ALT KENARDAN yükseliyor (`flip`): sahnenin üstü açık kalıyor,
       * yazının oturduğu alt bölge okunur oluyor. Aşağı inen geçiş tam tersini
       * yapar — ışığı karartıp yazıyı en parlak yere bırakırdı.
       */
      {
        id: newLayerId("karartma"),
        type: "rect",
        box: { x: 0, y: 0.38, w: 1, h: 0.62 },
        fill: "#000000",
        opacity: 0.78,
        gradient: true,
        flip: true,
        visible: true,
      },
      /*
       * ÜRÜN KUTULARI önde, alt köşede, üst üste binerek.
       *
       * Afişin "bu işi bu ürünle yaptık" cümlesi bu. Kutular Tanımlar'daki
       * gerçek çekimlerden geliyor; çekimi olmayan boy sessizce düşüyor.
       */
      ...[1, 2, 3].map((n, i) => ({
        id: newLayerId(`kutu${n}`),
        type: "image" as const,
        box: wide
          ? { x: 0.04 + i * 0.075, y: 0.42, w: 0.13, h: 0.5 }
          : { x: 0.05 + i * 0.11, y: tall ? 0.62 : 0.58, w: 0.19, h: 0.26 },
        source: (`pack${n}` as "pack1" | "pack2" | "pack3"),
        fit: "contain" as const,
        knockout: true,
        visible: true,
      })),
      // SERİ YAZISI — afişin en büyük öğesi. Afişte marka adı fısıldanmaz.
      {
        id: newLayerId("seri"),
        type: "text",
        box: wide
          ? { x: 0.38, y: 0.52, w: 0.58, h: 0.24 }
          : { x: 0.06, y: 0.79, w: 0.88, h: 0.13 },
        text: "{line}",
        size: 0.14 * k,
        weight: 700,
        color: "#ffffff",
        align: "left",
        transform: "upper",
        visible: true,
      },
      /*
       * TEK İDDİA: "40 RENK".
       *
       * Madde listesi yerine tek bir sayı — afişte okunan şey budur ve veri
       * zaten elimizde: paletin uzunluğu.
       */
      {
        id: newLayerId("iddia"),
        type: "text",
        box: wide
          ? { x: 0.38, y: 0.76, w: 0.58, h: 0.08 }
          : { x: 0.06, y: 0.9, w: 0.6, h: 0.06 },
        text: "{renkSayisi}",
        size: 0.045 * k,
        weight: 700,
        color: "#ffffff",
        align: "left",
        transform: "upper",
        opacity: 0.85,
        visible: true,
      },
      // Slogan varsa iddianın altında tek satır; yoksa afiş yine tam.
      {
        id: newLayerId("slogan"),
        type: "text",
        box: wide
          ? { x: 0.38, y: 0.845, w: 0.5, h: 0.06 }
          : { x: 0.06, y: tall ? 0.94 : 0.95, w: 0.7, h: 0.05 },
        text: "{slogan}",
        size: 0.026 * k,
        weight: 400,
        color: "#d9d3de",
        align: "left",
        transform: "none",
        visible: true,
      },
      ...footer(tall ? 0.975 : wide ? 0.93 : 0.965, 0.015, aspect),
    ],
  };
}

/**
 * KALDIRILAN ŞABLONLAR — kayıtlı yerleşimleri temizlenecek kimlikler.
 *
 * `social` kartın birebir kopyasıydı, `range` ürün karesiyle birleşti,
 * `coats` kat sistemi şemasının içine girdi. Üçünün de veritabanında
 * düzenlenmiş yerleşimi kalmış olabilir; migration bunları siliyor ve liste
 * burada duruyor ki silinen kimlik ile kod tek yerden eşleşsin.
 */
export const RETIRED_TEMPLATE_IDS = ["social", "range", "coats"] as const;

/** Şablon kimliği → fabrika yerleşimi. */
export function defaultLayout(templateId: string): TemplateLayout {
  switch (templateId) {
    case "system":
      return coatSystemLayout();
    case "usage":
      return usageLayout();
    case "beforeafter":
      return beforeAfterLayout();
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
    case "palette":
      return paletteLayout();
    case "announce":
      return announceLayout();
    case "marketplace":
      return marketplaceLayout();
    // Kart tek tarif, iki ölçü: kare gönderi ve dikey story.
    case "story":
      return cardLayout(1080, 1920);
    case "card":
    default:
      return cardLayout(1080, 1080);
  }
}
