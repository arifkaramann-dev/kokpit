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



export type PackagingOption = {
  id: string;
  line: string;
  label: string;
  src: string;
  alpha: boolean;
};

export type SeriesInfo = { code: string; line: string; effect: string; label: string };

export type TemplateDef = {
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
  bare: boolean;
  kind?: "product" | "coats";
};

/** Şablonun bastığı renk bilgisi. */
export type PaintInfo = {
  code?: string | null;
  nameTr?: string | null;
  nameEn?: string | null;
  /** `SERIES` içindeki kod — VP/VM/VC/VS/MT. */
  seriesCode?: string | null;
  hex?: string | null;
  /** Seçili ambalaj id'si; yanlış hattaysa otomatik düzeltilir. */
  packaging?: string | null;
};

export const BRAND = {
  name: 'ART OF COLOUR',
  site: 'artofcolour.com',
  font: 'Goldman',
  logoDark: '/renk/brand/logo-siyah.png',
  logoLight: '/renk/brand/logo-beyaz.png',
};

/** Ürün gamı — etikette ve kartta gösterilir. */
export const PACK_SIZES = ['30 ML', '100 ML', '250 ML', '500 ML', '400 ML SPREY'];

/**
 * Gerçek ambalaj görselleri.
 *
 * Kutu her RENKTE aynı kalır — ürün kimliği, renk göstergesi değil; renk
 * numune damlasında gösteriliyor. Ama HATTA göre değişir: Vivid rengin
 * yanında Meteor kutusu duramaz.
 */
export const PACKAGING: PackagingOption[] = [
  { id: 'vivid-spray400', line: 'VIVID', label: 'VIVID 400 ML Sprey', src: '/renk/packaging/sprey-400-vivid.jpg', alpha: false },
  { id: 'meteor-spray400', line: 'METEOR', label: 'METEOR 400 ML Sprey', src: '/renk/packaging/sprey-400-meteor.png', alpha: true },
  { id: 'meteor-bottle500', line: 'METEOR', label: 'METEOR 500 ML Şişe', src: '/renk/packaging/sise-500.jpg', alpha: false },
  { id: 'meteor-bottle250', line: 'METEOR', label: 'METEOR 250 ML Şişe', src: '/renk/packaging/sise-250.jpg', alpha: false },
  { id: 'meteor-bottle100', line: 'METEOR', label: 'METEOR 100 ML Şişe', src: '/renk/packaging/sise-100.jpg', alpha: false },
  { id: 'meteor-bottle30', line: 'METEOR', label: 'METEOR 30 ML Şişe', src: '/renk/packaging/sise-30.jpg', alpha: false },
];

export function getPackaging(id: string): PackagingOption {
  return (
    PACKAGING.find((p) => p.id === id) ||
    PACKAGING[0]
  );
}

/**
 * Bir hattın ambalajları — yerleşikler + kullanıcının yüklediği.
 * Arayüzde yalnızca doğru hattakiler listelensin.
 */
export function packagingForLine(line: string): PackagingOption[] {
  return PACKAGING.filter(p => p.line === line);
}

/**
 * Ambalajın çizilebilir kaynağını çözer.
 * Yerleşiklerde bu bir URL, kullanıcı ambalajlarında IndexedDB'den gelen
 * bir data URI. Çağıran taraf farkı bilmek zorunda kalmasın diye burada.
 */
/**
 * Ambalajın çizilebilir kaynağı.
 *
 * Kaynak uygulamada burada kullanıcının yüklediği ambalajlar da çözülüyordu
 * (IndexedDB'den data URI). O yol kokpit'e henüz taşınmadı; yerleşik
 * ambalajlar doğrudan adresten geliyor.
 */
function resolvePackagingSrc(pack: PackagingOption): string {
  return pack.src;
}

/**
 * Seriye uygun varsayılan ambalaj.
 * Seçili ambalaj yanlış hattaysa otomatik düzeltilir — Vivid bir rengin
 * yanında Meteor kutusu görünmesin.
 */
export function defaultPackagingFor(seriesCode: string | null | undefined, current?: string | null): string {
  const line = getSeries(seriesCode).line;
  const chosen = current ? getPackaging(current) : null;
  if (chosen && chosen.line === line) return chosen.id;
  return packagingForLine(line)[0]?.id || PACKAGING[0].id;
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

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'product',
    label: 'Ürün + Numune',
    hint: 'Ambalaj ve renk numunesi aynı karede. Ana satış görseli.',
    width: 1400,
    height: 1400,
    bare: false,
    kind: 'product',
  },
  {
    id: 'coats',
    label: 'Kat Progresyonu',
    hint: '1/2/3 kat — candy ve şeffaf renklerde derinleşmeyi gösterir.',
    width: 1400,
    height: 1400,
    bare: false,
    kind: 'coats',
  },
  {
    id: 'marketplace',
    label: 'Pazaryeri ana görsel',
    hint: 'Beyaz fon, sıfır metin. Amazon/Trendyol ana görsel kuralı.',
    width: 1600,
    height: 1600,
    bare: true,
  },
  {
    id: 'card',
    label: 'Renk kartı',
    hint: 'Kod, isim, seri. Katalog ve site listesi.',
    width: 1080,
    height: 1080,
    bare: false,
  },
  {
    id: 'social',
    label: 'Instagram gönderi',
    hint: 'Kare, marka katmanlı.',
    width: 1080,
    height: 1080,
    bare: false,
  },
  {
    id: 'story',
    label: 'Story / Reels',
    hint: 'Dikey 9:16.',
    width: 1080,
    height: 1920,
    bare: false,
  },
];

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
