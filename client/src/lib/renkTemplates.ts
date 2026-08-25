/**
 * Pazarlama şablonları.
 *
 * Bir renk kaydı + bir obje görseli girer, satışa hazır görsel çıkar.
 * Şablon = ölçü + kompozisyon + metin katmanı. Obje görseli AI'den gelir,
 * metin ve marka katmanı burada basılır.
 *
 * Kritik ayrım: PAZARYERİ ANA GÖRSELİ metin taşıyamaz. Amazon ve benzerleri
 * ana görselde yazı, logo, filigran, çerçeve kabul etmiyor. Bu yüzden her
 * şablonun `bare` bayrağı var — çıplak olanlar sadece ürün ve beyaz fon.
 *
 * Kaynak: renk uygulamasının `src/lib/templates.js` dosyası. Mantık birebir
 * taşındı — kanıtlanmış bir kompozisyonu yeniden tasarlamak, düzeltmekten
 * daha çok yeni hata üretirdi.
 */



import type { CoatSystem } from "@shared/color/coatSystem";
import type { PaletteEntry } from "@shared/color/layout";
import type { TemplateFamily } from "@shared/color/families";

export type PackagingOption = {
  id: string;
  line: string;
  label: string;
  src: string;
  alpha: boolean;
  /** Kutunun hacmi — yedek seçimi HACİMLE yapılır, hatla değil. */
  volumeMl: number;
};

export type SeriesInfo = { code: string; line: string; effect: string; label: string };

export type TemplateDef = {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  bare: boolean;
  /**
   * Şablonun ailesi — hangi işi yaptığı.
   *
   * Aile tasarım dilini belirliyor: zemin, tipografi ölçeği, bilgi yoğunluğu
   * ve hangi katmanların kullanılabileceği (bkz. `shared/color/families.ts`).
   * Üretim ekranı da aileye göre bölünüyor: banner beğenilmediğinde yalnız
   * banner yeniden üretiliyor.
   */
  family: TemplateFamily;
  /**
   * Aynı tarifin başka ölçüsü olan şablonlar aynı `group` değerini taşır.
   *
   * Afişin dört ölçüsü dört ayrı tasarım değil, tek tasarımın dört kadrajı;
   * üretim ekranında tek başlık altında ölçü rozetleriyle toplanıyorlar. On
   * dört ayrı kutu olarak listelemek, dört ölçüyü dört ayrı iş gibi
   * gösteriyordu.
   */
  group?: string;
  /** Ölçünün adı — grup içinde hangi kadraj olduğunu söyler. */
  sizeLabel?: string;
  kind?: "product" | "palette" | "system" | "usage" | "banner" | "beforeafter";
};

/** Şablonun bastığı renk bilgisi. */
export type PaintInfo = {
  code?: string | null;
  nameTr?: string | null;
  nameEn?: string | null;
  /** `SERIES` içindeki kod — VP/VM/VC/VS/MT. Yalnız EFEKT adı için. */
  seriesCode?: string | null;
  /**
   * Ürünün GERÇEK seri adı — "CANDY", "METEOR".
   *
   * `{line}` eskiden `seriesCode`ten türetiliyordu; o kod ise rengin bitiş
   * türünden (duz/metalik/candy) tahmin ediliyordu ve koda gömülü listede
   * yalnız VIVID/METEOR vardı. Sonuç: CND1009 kodlu bir CANDY ürününün
   * kartında ve banner'ında **VIVID SOLID** yazıyordu — müşteriye giden
   * görselde yanlış marka hattı. Ad artık serinin kendisinden geliyor;
   * tahmin yalnız efekt sıfatı için kaldı.
   */
  seriesLine?: string | null;
  hex?: string | null;
  /**
   * Ürünün kendi ambalajının çekimi — Tanımlar → Ambalajlar'dan çözümlenmiş
   * adres. Doluysa yerleşik yedeğin önüne geçer.
   */
  packagingSrc?: string | null;
  /**
   * Ürünün hacmi (ml) — çekim yoksa yerleşik yedek BUNUNLA seçilir.
   * Ölçü tutmuyorsa kutu hiç çizilmez.
   */
  volumeMl?: number | null;
  /** Ürünün kendi ambalajının adı — "{packaging}" yer tutucusu. */
  packagingName?: string | null;
  /** Ürünün hacmi — "{volume}" yer tutucusu. */
  volumeLabel?: string | null;
  /**
   * Serinin ambalaj gamı, küçükten büyüğe. `pack1..pack4` görsel katmanları ve
   * `{packSizes}` / `{pack1..4}` yer tutucuları bundan besleniyor.
   */
  packRange?: Array<{ label: string; src: string | null }>;
  /**
   * Serinin renkleri — palet katmanının çizdiği liste. Kartın kendi rengi
   * `active` ile işaretli gelir.
   */
  palette?: PaletteEntry[];
  /**
   * Serinin kat sistemi — "gümüş baz → candy → vernik".
   *
   * Kart bunu ŞEMA olarak basıyor; boşsa seri adından varsayılan türetiliyor
   * (bkz. `shared/color/coatSystem.ts`), yani hiçbir seri kat şemasız kalmaz.
   */
  coatSystem?: CoatSystem;
  /**
   * SERİNİN AKSAN RENGİ — afişin zemini bundan türetiliyor.
   *
   * Rengin kendi hex'i değil serinin rengi: afiş serinin karesi ve aynı
   * serinin kırk rengi için kırk farklı zeminli afiş çıkarsa seri bir marka
   * gibi görünmez. Katalogdaki renklerin çoğunda hex zaten boş.
   */
  accentHex?: string | null;
  /** Seri banner metni — AI serinin kendi tanıtımından kısaltır. */
  bannerSlogan?: string | null;
  bannerBullets?: string[];
  /**
   * Bu boyayla boyanmış nesneler — kullanım alanı kolajının kareleri.
   *
   * Dört yer var ama kaçı doluysa kolaj ona göre diziliyor: eksik kare
   * yüzünden yarısı boş bir kare basmak amatör görünüyordu.
   */
  usage?: Array<{ label: string; src: string }>;
};

export const BRAND = {
  name: 'ART OF COLOUR',
  site: 'artofcolour.com.tr',
  font: 'Goldman',
  logoDark: '/renk/brand/logo-siyah.png',
  logoLight: '/renk/brand/logo-beyaz.png',
};

/**
 * Ürün gamı — YALNIZ GERİYE DÖNÜK yedek.
 *
 * Gam artık Tanımlar'daki ambalajlardan geliyor (`PaintInfo.packRange`, bkz.
 * `shared/color/packagingImage.ts`). Bu sabit liste yeni bir boy eklendiğinde
 * kendiliğinden yanlışa dönüşüyordu; ambalaj tanımı hiç yoksa kart boş
 * kalmasın diye duruyor.
 */
export const PACK_SIZES = ['30 ML', '100 ML', '250 ML', '500 ML', '400 ML SPREY'];

/**
 * Yerleşik ambalaj görselleri — YALNIZ GERİYE DÖNÜK yedek.
 *
 * Kutu her RENKTE aynı kalır — ürün kimliği, renk göstergesi değil; renk
 * numune damlasında gösteriliyor. Ama HATTA göre değişir: Vivid rengin
 * yanında Meteor kutusu duramaz.
 *
 * Bu liste koda gömülü olduğu için yeni ambalajı ve yeni seriyi bilmiyor;
 * gerçek kaynak Tanımlar → Ambalajlar → çekim. Henüz görsel yüklenmemiş
 * kurulumlarda kartın kutusuz kalmaması için burada bırakıldı.
 */
export const PACKAGING: PackagingOption[] = [
  { id: 'vivid-spray400', line: 'VIVID', label: 'VIVID 400 ML Sprey', src: '/renk/packaging/sprey-400-vivid.jpg', alpha: false, volumeMl: 400 },
  { id: 'meteor-spray400', line: 'METEOR', label: 'METEOR 400 ML Sprey', src: '/renk/packaging/sprey-400-meteor.png', alpha: true, volumeMl: 400 },
  { id: 'meteor-bottle500', line: 'METEOR', label: 'METEOR 500 ML Şişe', src: '/renk/packaging/sise-500.jpg', alpha: false, volumeMl: 500 },
  { id: 'meteor-bottle250', line: 'METEOR', label: 'METEOR 250 ML Şişe', src: '/renk/packaging/sise-250.jpg', alpha: false, volumeMl: 250 },
  { id: 'meteor-bottle100', line: 'METEOR', label: 'METEOR 100 ML Şişe', src: '/renk/packaging/sise-100.jpg', alpha: false, volumeMl: 100 },
  { id: 'meteor-bottle30', line: 'METEOR', label: 'METEOR 30 ML Şişe', src: '/renk/packaging/sise-30.jpg', alpha: false, volumeMl: 30 },
];

/**
 * Yerleşik yedek kutu — HACME göre.
 *
 * ── Neden hacim, neden hat değil ──────────────────────────────────────────
 * Önceki hâli hattan seçiyordu (`defaultPackagingFor`): VIVID bir rengin
 * yedeği listedeki ilk VIVID kayıt, yani **400 ml sprey**. 100 ml'lik bir
 * ürünün kartına sprey kutusu basılıyordu — müşteriye yanlış ürünü göstermek,
 * hiç kutu göstermemekten kötü.
 *
 * Artık ölçü tutmuyorsa yedek YOK: kutu katmanı çizilmez ve arayüz kullanıcıya
 * "bu ambalajın çekimini yükle" der. Uydurma bir kutu basmıyoruz.
 *
 * Hat yalnız EŞİTLİK BOZUCU: aynı hacimde iki kayıt varsa (400 ml sprey iki
 * hatta da var) ürünün hattındaki seçilir.
 */
export function fallbackPackaging(
  volumeMl: number | null | undefined,
  line?: string | null,
): PackagingOption | null {
  if (!volumeMl || volumeMl <= 0) return null;
  const sameVolume = PACKAGING.filter(p => p.volumeMl === volumeMl);
  if (!sameVolume.length) return null;
  return sameVolume.find(p => p.line === line) ?? sameVolume[0];
}

export function getPackaging(id: string): PackagingOption | null {
  return PACKAGING.find(p => p.id === id) ?? null;
}

/**
 * Efekt serileri ve kod önekleri.
 * VIVID bir ürün hattı; efekt adı hattın içinde bölünüyor.
 */
export const SERIES: SeriesInfo[] = [
  { code: 'VP', line: 'VIVID', effect: 'PEARLY', label: 'Vivid Pearly' },
  { code: 'VM', line: 'VIVID', effect: 'METALLIC', label: 'Vivid Metallic' },
  { code: 'VC', line: 'VIVID', effect: 'CANDY', label: 'Vivid Candy' },
  { code: 'VS', line: 'VIVID', effect: 'SOLID', label: 'Vivid Solid' },
  { code: 'MT', line: 'METEOR', effect: 'GRADIENT', label: 'Meteor Gradient' },
];

export function getSeries(code: string | null | undefined): SeriesInfo {
  return SERIES.find((s) => s.code === code) || SERIES[0];
}

/**
 * ŞABLONLAR — üç aile, dokuz tarif.
 *
 * ── Neden dokuz, neden on dört değil ──────────────────────────────────────
 * Liste on dört kutuydu ve dördü fazlalıktı: `social` kartın BİREBİR kopyası
 * (aynı fonksiyon, aynı ölçü), `story` aynı kartın dikey hâli, `range` ürün
 * karesinin zaten yazdığı ambalaj gamı, `coats` ise kat sistemi şemasının
 * içinde çizilen üç aşama karesi. Dördü de aynı cevabı ikinci kez veriyordu.
 *
 * Üçü de aynı anda üretiliyordu, bu yüzden fark edilmiyordu: müşteriye giden
 * on dört karenin dördü, bir diğerinin daha zayıf kopyasıydı.
 *
 * Aile alanı listenin en önemli kısmı — bkz. `shared/color/families.ts`.
 */
export const TEMPLATES: TemplateDef[] = [
  /* ── PAZARLAMA — sattırır ─────────────────────────────────────────────── */
  {
    id: 'marketplace',
    label: 'Pazaryeri ana görsel',
    hint: 'Beyaz fon, sıfır metin. Amazon/Trendyol ana görsel kuralı.',
    width: 1600,
    height: 1600,
    bare: true,
    family: 'pazarlama',
  },
  {
    id: 'product',
    label: 'Ürün + numune + gam',
    hint: 'Ambalaj, renk numunesi ve boy seçenekleri aynı karede. Ana satış görseli.',
    width: 1400,
    height: 1400,
    bare: false,
    family: 'pazarlama',
    kind: 'product',
  },
  {
    id: 'card',
    label: 'Renk kartı — kare',
    hint: 'Kod, isim, seri. Katalog, site listesi ve Instagram gönderisi.',
    width: 1080,
    height: 1080,
    bare: false,
    family: 'pazarlama',
    group: 'kart',
    sizeLabel: 'Kare 1:1',
  },
  {
    id: 'story',
    label: 'Renk kartı — dikey',
    hint: 'Aynı kart 9:16 kadrajda. Story ve Reels.',
    width: 1080,
    height: 1920,
    bare: false,
    family: 'pazarlama',
    group: 'kart',
    sizeLabel: 'Dikey 9:16',
  },
  {
    id: 'announce',
    label: 'Duyuru',
    hint: '"Yeni renk", "kampanya", "stokta" — üstteki bant metni elle yazılır.',
    width: 1080,
    height: 1080,
    bare: false,
    family: 'pazarlama',
  },

  /* ── TANITIM — anlatır ────────────────────────────────────────────────── */
  {
    id: 'system',
    label: 'Kat sistemi',
    hint: 'Nasıl uygulanır: zemin → renk → vernik. Serinin kendi zinciri, varsa kat kareleriyle.',
    width: 1400,
    height: 1400,
    bare: false,
    family: 'tanitim',
    kind: 'system',
  },
  {
    id: 'usage',
    label: 'Kullanım alanları',
    hint: 'Bu boyayla boyanmış nesneler. Kaç kare varsa ona göre dizilir.',
    width: 1400,
    height: 1400,
    bare: false,
    family: 'tanitim',
    kind: 'usage',
  },
  {
    id: 'palette',
    label: 'Seri paleti',
    hint: 'Serinin diğer renkleri, kodlarıyla. Renk ölçümü yapılmamışsa üretilmez.',
    width: 1400,
    height: 1400,
    bare: false,
    family: 'tanitim',
    kind: 'palette',
  },
  {
    id: 'beforeafter',
    label: 'Öncesi / sonrası',
    hint: 'Rötuşun kanıtı. İki çekimi Şablon Editörü\'nden kendi varlıklarına bağla.',
    width: 1400,
    height: 1400,
    bare: false,
    family: 'tanitim',
    kind: 'beforeafter',
  },

  /*
   * ── BANNER — durdurur ─────────────────────────────────────────────────
   *
   * Tek tarif, dört kadraj. Ayrı ölçü olmalarının sebebi tasarım değil mecra:
   * tek şablonu yeniden ölçeklendirmek yazıyı ya eziyor ya kaybediyordu.
   */
  {
    id: 'banner',
    label: 'Seri afişi',
    hint: 'Seri reklamı. Çizilmiş zemin, dev seri yazısı, tek iddia.',
    width: 1080,
    height: 1080,
    bare: false,
    family: 'banner',
    group: 'banner',
    sizeLabel: 'Instagram kare',
    kind: 'banner',
  },
  {
    id: 'bannerWide',
    label: 'Seri afişi',
    hint: 'Mağaza vitrini ve site kartı.',
    width: 1200,
    height: 628,
    bare: false,
    family: 'banner',
    group: 'banner',
    sizeLabel: 'Pazaryeri vitrin',
    kind: 'banner',
  },
  {
    id: 'bannerHero',
    label: 'Seri afişi',
    hint: 'Geniş ekran üst şeridi.',
    width: 1920,
    height: 600,
    bare: false,
    family: 'banner',
    group: 'banner',
    sizeLabel: 'Site başlığı',
    kind: 'banner',
  },
  {
    id: 'bannerStory',
    label: 'Seri afişi',
    hint: 'Dikey seri tanıtımı.',
    width: 1080,
    height: 1920,
    bare: false,
    family: 'banner',
    group: 'banner',
    sizeLabel: 'Story 9:16',
    kind: 'banner',
  },
];

/** Ailenin şablonları — üretim ekranı ve editör bununla bölünüyor. */
export function templatesOfFamily(family: TemplateFamily): TemplateDef[] {
  return TEMPLATES.filter(t => t.family === family);
}

export function getTemplate(id: string): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

/**
 * Fonu saf beyaza zorlar.
 *
 * Model "pure white background" dense bile hafif gri bir gradyan üretebiliyor.
 * Pazaryeri ana görselinde fon SAF beyaz olmak zorunda (255,255,255) — gri
 * fonlu görsel reddediliyor. Bu yüzden prompt'a güvenmiyoruz, ölçüp
 * düzeltiyoruz.
 *
 * Yöntem: dört köşeden taşma dolgusu (flood fill). Köşeden başlayıp benzer
 * komşuları geziyoruz; objeye ulaşınca renk farkı eşiği aşılıyor ve duruyoruz.
 * Global "açık pikselleri beyaz yap" yaklaşımı objenin parlama noktalarını da
 * silerdi — bağlantılı dolgu bunu yapmıyor.
 *
 * @returns {{canvas:HTMLCanvasElement, changed:number, wasClean:boolean}}
 */
export function forceWhiteBackground(
  img: HTMLImageElement | HTMLCanvasElement,
  tolerance = 26,
): { canvas: HTMLCanvasElement; changed: number; wasClean: boolean } {
  const w = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas bağlamı alınamadı');
  ctx.drawImage(img, 0, 0);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  // Köşeler zaten saf beyazsa dokunma
  const alreadyWhite = corners.every(([x, y]) => {
    const p = at(x, y);
    return d[p] >= 250 && d[p + 1] >= 250 && d[p + 2] >= 250;
  });
  if (alreadyWhite) return { canvas, changed: 0, wasClean: true };

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let changed = 0;

  for (const [cx, cy] of corners) {
    const seed = at(cx, cy);
    const sr = d[seed];
    const sg = d[seed + 1];
    const sb = d[seed + 2];
    // Köşe koyuysa orada obje var demektir; fon değil, dokunma
    if (0.2126 * sr + 0.7152 * sg + 0.0722 * sb < 170) continue;

    let head = 0;
    let tail = 0;
    const start = cy * w + cx;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const p = idx * 4;
      // Tohuma göre değil, BEYAZA göre değil — komşuluk zinciri boyunca
      // tohum rengine yakınlık: gradyanlı fonlarda zincir kopmasın diye
      // eşik cömert, ama objeye geçince renk farkı bunu aşıyor.
      const diff =
        Math.abs(d[p] - sr) + Math.abs(d[p + 1] - sg) + Math.abs(d[p + 2] - sb);
      if (diff > tolerance * 3) continue;

      d[p] = 255;
      d[p + 1] = 255;
      d[p + 2] = 255;
      changed += 1;

      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (y > 0 && !visited[idx - w]) { visited[idx - w] = 1; queue[tail++] = idx - w; }
      if (y < h - 1 && !visited[idx + w]) { visited[idx + w] = 1; queue[tail++] = idx + w; }
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, changed, wasClean: false };
}

/**
 * Marka yazı tipini yükler.
 *
 * Canvas, yazı tipi hazır değilken çizerse HATA VERMEZ — sessizce sistem
 * fontuna düşer ve kart markasız görünür. Bu yüzden çizimden önce beklenmesi
 * şart; "font ismini yazmak" yetmiyor.
 *
 * Bir kez yüklenir ve `document.fonts` içinde kalır. Yüklenemezse hata
 * atmaz: kart sistem fontuyla da üretilebilmeli, hiç üretilememesindense.
 */
let fontPromise: Promise<boolean> | null = null;

export function ensureBrandFont(): Promise<boolean> {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return false;
    try {
      const faces = [
        new FontFace('Goldman', 'url(/renk/fonts/goldman-400-latin.woff2)', { weight: '400' }),
        new FontFace('Goldman', 'url(/renk/fonts/goldman-700-latin.woff2)', { weight: '700' }),
        new FontFace('Goldman', 'url(/renk/fonts/goldman-400-latin-ext.woff2)', {
          weight: '400',
          unicodeRange: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB',
        }),
        new FontFace('Goldman', 'url(/renk/fonts/goldman-700-latin-ext.woff2)', {
          weight: '700',
          unicodeRange: 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB',
        }),
      ];
      const loaded = await Promise.all(faces.map(f => f.load()));
      loaded.forEach(f => document.fonts.add(f));
      return true;
    } catch {
      return false;
    }
  })();
  return fontPromise;
}

export function loadImageSrc(src: string): Promise<HTMLImageElement> {
  return loadImage(src);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
