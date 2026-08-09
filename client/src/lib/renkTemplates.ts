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


import { hexToLab, type Lab } from "@shared/color/color";
import { renderCoat } from "@shared/color/candy";
import type { Raster } from "@shared/color/recolor";
import { extractSubjectMask, measureSubjectLab } from "@shared/color/subject";

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

type Box = { x: number; y: number; w: number; h: number };

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

/** Görseli hedef kutuya sığdıracak çizim koordinatları (contain). */
function contain(imgW: number, imgH: number, boxW: number, boxH: number): Box {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Görseli hedef kutuyu dolduracak şekilde kırp (cover). */
function cover(imgW: number, imgH: number, boxW: number, boxH: number): Box {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Şablonu çizer.
 *
 * @param {object} opts
 * @param {string} opts.templateId
 * @param {string} opts.objectImage  data: URI — AI üretimi obje görseli
 * @param {object} opts.paint        { code, nameTr, nameEn, seriesCode, hex }
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderTemplate({
  templateId,
  objectImage,
  baseImage,
  paint,
}: {
  templateId: string;
  /** data: URI — AI üretimi obje görseli */
  objectImage?: string | null;
  /**
   * data: URI — GÜMÜŞ METALİK BAZ numunesi. Yalnız kat progresyonu kullanır.
   *
   * Katlar bundan türetiliyor: candy'de altta gümüş baz vardır, üstüne saydam
   * renk katmanları biner. Zaten renkli bir numuneden başlanırsa birinci kat
   * asla gümüş çıkamaz.
   */
  baseImage?: string | null;
  paint: PaintInfo;
}): Promise<HTMLCanvasElement> {
  const tpl = getTemplate(templateId);
  const series = getSeries(paint.seriesCode);

  // Çizimden ÖNCE: canvas hazır olmayan fontu bekleyemez, sessizce sistem
  // fontuna düşer ve kart markasız çıkar.
  await ensureBrandFont();

  const canvas = document.createElement('canvas');
  canvas.width = tpl.width;
  canvas.height = tpl.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas bağlamı alınamadı');

  // Fon her zaman saf beyaz — pazaryeri şartı, diğerlerinde de temiz duruyor
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tpl.width, tpl.height);

  const obj = objectImage ? await loadImage(objectImage) : null;

  if (tpl.bare) {
    // ÇIPLAK: yalnızca ürün, kenarlarda %8 pay. Metin/logo yok.
    // Fon saf beyaza zorlanıyor — pazaryeri şartı, prompt'a güvenilmiyor.
    const pad = tpl.width * 0.08;
    if (obj) {
      const cleaned = forceWhiteBackground(obj).canvas;
      const box = contain(
        cleaned.width,
        cleaned.height,
        tpl.width - pad * 2,
        tpl.height - pad * 2
      );
      ctx.drawImage(cleaned, box.x + pad, box.y + pad, box.w, box.h);
    }
    return canvas;
  }

  if (tpl.kind === 'product') {
    await drawProduct(ctx, tpl, obj, paint, series);
    return canvas;
  }
  if (tpl.kind === 'coats') {
    const base = baseImage ? await loadImage(baseImage) : null;
    await drawCoats(ctx, tpl, base ?? obj, paint, series, base != null);
    return canvas;
  }

  await drawComposed(ctx, tpl, obj, paint, series);
  return canvas;
}

/** Kod + isim başlığı — iki şablonda da aynı görünsün diye ortak. */
function drawHeading(
  ctx: CanvasRenderingContext2D,
  W: number,
  x: number,
  y: number,
  paint: PaintInfo,
  series: SeriesInfo,
  align: CanvasTextAlign = 'left',
): void {
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  const codeSize = Math.round(W * 0.062);
  ctx.font = `700 ${codeSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(paint.code || '—', x, y);

  ctx.font = `400 ${Math.round(W * 0.034)}px Goldman, sans-serif`;
  ctx.fillStyle = '#3f3f46';
  ctx.fillText((paint.nameEn || '').toUpperCase(), x, y + codeSize * 1.22);

  ctx.font = `400 ${Math.round(W * 0.024)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText((paint.nameTr || '').toUpperCase(), x, y + codeSize * 1.9);

  ctx.font = `700 ${Math.round(W * 0.021)}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(`${series.line}  ${series.effect}`, x, y + codeSize * 2.5);
}

/** Alt şerit: logo solda, site sağda. */
async function drawFooter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pad: number,
): Promise<number> {
  const footerH = W * 0.06;
  const top = H - pad * 0.6 - footerH;
  ctx.textAlign = 'left';
  try {
    const logo = await loadImage(BRAND.logoDark);
    const logoW = footerH / (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, pad, top, logoW, footerH);
  } catch {
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(W * 0.022)}px Goldman, sans-serif`;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(BRAND.name, pad, top + footerH / 2);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.017)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(BRAND.site, W - pad, top + footerH / 2);
  return top;
}

/**
 * Ürün + numune.
 *
 * Ambalaj arkada durur, renk numunesi önde. Rakip görsellerdeki kurgu bu:
 * müşteri hem ne satın aldığını hem rengin nasıl göründüğünü tek karede
 * görür. Ambalaj her renkte AYNI — ürün kimliği, renk göstergesi değil.
 */
async function drawProduct(
  ctx: CanvasRenderingContext2D,
  tpl: TemplateDef,
  obj: HTMLImageElement | null,
  paint: PaintInfo,
  series: SeriesInfo,
): Promise<void> {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.06;

  const footerTop = await drawFooter(ctx, W, H, pad);
  const stage = { x: 0, y: 0, w: W, h: footerTop - pad * 0.5 };

  // Ambalaj — sağ tarafta, dikey merkezli.
  // Hat kontrolü burada da yapılıyor: kayıtta eski/yanlış bir ambalaj kalmışsa
  // (seri değiştirilmiş olabilir) sessizce doğru hatta düzeltilir.
  const pack = getPackaging(defaultPackagingFor(paint.seriesCode, paint.packaging));
  try {
    const src = await resolvePackagingSrc(pack);
    if (!src) throw new Error('ambalaj görseli yok');
    const packImg = await loadImage(src);
    const cleaned = pack.alpha ? packImg : forceWhiteBackground(packImg).canvas;
    const targetH = stage.h * 0.78;
    const cw = "naturalWidth" in cleaned ? cleaned.naturalWidth || cleaned.width : cleaned.width;
    const ch = "naturalHeight" in cleaned ? cleaned.naturalHeight || cleaned.height : cleaned.height;
    const ratio = cw / ch;
    const packW = targetH * ratio;
    ctx.drawImage(cleaned, W - pad - packW * 0.92, stage.y + stage.h * 0.06, packW, targetH);
  } catch (err) {
    // Ambalaj yüklenemezse sahne numuneyle devam etsin — boş kart üretmekten
    // iyidir. Ama sessiz kalmasın: yolu yanlış bir ambalaj, kartların
    // aylarca ambalajsız çıkmasına ve kimsenin fark etmemesine yol açıyordu.
    console.warn('[renkTemplates] ambalaj çizilemedi:', pack.id, pack.src, err);
  }

  // Numune — sol altta, ambalajın önünde
  if (obj) {
    const cleaned = forceWhiteBackground(obj).canvas;
    const boxW = W * 0.62;
    const boxH = stage.h * 0.5;
    const box = contain(cleaned.width, cleaned.height, boxW, boxH);
    ctx.drawImage(
      cleaned,
      pad * 0.4 + box.x,
      stage.y + stage.h - boxH - stage.h * 0.02 + box.y,
      box.w,
      box.h
    );
  }

  drawHeading(ctx, W, pad, stage.y + pad * 0.6, paint, series);
}

/**
 * Kat progresyonu.
 *
 * Candy ve şeffaf renklerde kat sayısı rengi belirgin şekilde derinleştirir;
 * müşterinin en çok sorduğu şey bu. Üç kare AI'ye üç kez gitmeden, tek
 * numuneden Beer-Lambert ile türetiliyor.
 */
/** Canvas'ı rastere çevirir ve boya maskesini çıkarır. */
function toRasterWithMask(
  img: HTMLImageElement | HTMLCanvasElement,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData; raster: Raster; mask: Uint8Array } {
  const w = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas bağlamı alınamadı');
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const raster: Raster = { data: image.data, width: image.width, height: image.height };
  const { mask } = extractSubjectMask(raster);
  return { canvas, ctx, image, raster, mask };
}

/**
 * Kat progresyonu.
 *
 * ── Neden gümüş bazdan ────────────────────────────────────────────────────
 * Candy iki katmandır: altta gümüş metalik baz, üstünde saydam renk. Kat
 * sayısı arttıkça ışığın soğurulduğu yol uzar ve renk derinleşir. Müşterinin
 * en çok sorduğu şey bu.
 *
 * Önceki hâli katları, ZATEN hedef renkteki numuneyi her katta biraz daha
 * karartarak üretiyordu. Birinci kat asla gümüş çıkamıyor, katlar rengi
 * derinleştirmek yerine siyaha götürüyordu — yani kare üçlüsü müşteriye
 * yanlış bir şey anlatıyordu.
 *
 * Artık gümüş baz numunesinden Beer-Lambert ile türetiliyor:
 *   1 KAT → baz, gümüş gri
 *   2 KAT → yarı saydam, açık renk
 *   3 KAT → doygun hedef renk
 *
 * Üçü de TEK numuneden çıkıyor, yani kareler arasında obje değişmiyor.
 */
async function drawCoats(
  ctx: CanvasRenderingContext2D,
  tpl: TemplateDef,
  obj: HTMLImageElement | null,
  paint: PaintInfo,
  series: SeriesInfo,
  hasSilverBase: boolean,
): Promise<void> {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.06;

  const footerTop = await drawFooter(ctx, W, H, pad);
  const headingH = W * 0.062 * 3.1;
  const top = pad * 0.6 + headingH + pad * 0.4;

  drawHeading(ctx, W, pad, pad * 0.6, paint, series);

  const available = footerTop - top - pad * 0.6;

  if (!obj) {
    ctx.fillStyle = paint.hex || '#cccccc';
    ctx.fillRect(pad, top, W - pad * 2, available);
    return;
  }

  const COATS = 3;
  const src = toRasterWithMask(forceWhiteBackground(obj).canvas);
  const baseLab = measureSubjectLab(src.raster, src.mask);
  const targetLab: Lab | null = paint.hex ? hexToLab(paint.hex) : null;

  /**
   * Bir katın karesini üretir.
   *
   * Gümüş baz ya da hedef renk yoksa katman hesaplanamaz; numune olduğu gibi
   * çizilir. Uydurma bir progresyon basmak, müşteriye yanlış bilgi vermektir.
   */
  const coatCanvas = (coat: number): HTMLCanvasElement => {
    if (!hasSilverBase || !baseLab || !targetLab) return src.canvas;
    const out = renderCoat(src.raster, src.mask, baseLab, targetLab, coat, {
      totalCoats: COATS,
    });
    const c = document.createElement('canvas');
    c.width = out.width;
    c.height = out.height;
    const cctx = c.getContext('2d');
    if (!cctx) throw new Error('Canvas bağlamı alınamadı');
    const img = cctx.createImageData(out.width, out.height);
    img.data.set(out.data);
    cctx.putImageData(img, 0, 0);
    return c;
  };

  // Ana kare: son kat — ürünün vaadi, en derin hâli.
  const mainH = available * 0.62;
  const main = coatCanvas(COATS);
  const mainBox = contain(main.width, main.height, W - pad * 2, mainH);
  ctx.drawImage(main, pad + mainBox.x, top + mainBox.y, mainBox.w, mainBox.h);

  // Üç küçük kare: 1, 2, 3 kat
  const smallTop = top + mainH + pad * 0.3;
  const smallH = available - mainH - pad * 0.3;
  const cellW = (W - pad * 2) / COATS;

  for (let i = 0; i < COATS; i += 1) {
    const coat = coatCanvas(i + 1);
    const box = contain(coat.width, coat.height, cellW * 0.86, smallH * 0.74);
    ctx.drawImage(
      coat,
      pad + cellW * i + (cellW - box.w) / 2,
      smallTop + box.y * 0.4,
      box.w,
      box.h
    );

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `700 ${Math.round(W * 0.022)}px Goldman, sans-serif`;
    ctx.fillStyle = '#52525b';
    ctx.fillText(`${i + 1} KAT`, pad + cellW * i + cellW / 2, smallTop + smallH);
  }

  // Gümüş baz yoksa kullanıcıya söyle — üç aynı kare basıp susmaktansa.
  if (!hasSilverBase) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `400 ${Math.round(W * 0.018)}px Goldman, sans-serif`;
    ctx.fillStyle = '#b45309';
    ctx.fillText('Kat progresyonu için gümüş baz numunesi gerekli', pad, top - pad * 0.35);
  }
}

async function drawComposed(
  ctx: CanvasRenderingContext2D,
  tpl: TemplateDef,
  obj: HTMLImageElement | null,
  paint: PaintInfo,
  series: SeriesInfo,
): Promise<void> {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.07;

  // Yerleşim aşağıdan yukarı kurgulanıyor.
  //
  // İlk sürümde y'yi yukarıdan aşağı biriktiriyordum ve logoyu ayrıca
  // "en alta" koyuyordum; ikisi çakıştı, logo Türkçe ismin üstüne bindi.
  // Doğrusu: alt şeridin (logo + site) yüksekliğini ÖNCE ayır, metin bloğunu
  // onun üstüne otur, obje alanını kalandan hesapla. Böylece hiçbir katman
  // diğerinin alanına giremez.

  const footerH = W * 0.075; // logo satırı
  const lineGap = W * 0.052; // metin satırları arası
  const textBlockH = lineGap * 2 + W * 0.075; // kod satırı + 2 satır
  const stripH = H * 0.028;

  const footerTop = H - pad * 0.55 - footerH;
  const textTop = footerTop - pad * 0.5 - textBlockH;
  const stripTop = textTop - pad * 0.55 - stripH;
  const objH = stripTop;

  // --- Obje alanı ---
  if (obj) {
    const box = cover(obj.naturalWidth, obj.naturalHeight, W, objH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, objH);
    ctx.clip();
    ctx.drawImage(obj, box.x, box.y, box.w, box.h);
    ctx.restore();
  } else {
    ctx.fillStyle = paint.hex || '#cccccc';
    ctx.fillRect(0, 0, W, objH);
  }

  // --- Renk şeridi ---
  ctx.fillStyle = paint.hex || '#cccccc';
  ctx.fillRect(0, stripTop, W, stripH);

  // --- Metin bloğu ---
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const codeSize = Math.round(W * 0.072);
  ctx.font = `700 ${codeSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(paint.code || '—', pad, textTop);

  // İngilizce isim kodun sağında, alt hizası kodla aynı
  const codeWidth = ctx.measureText(paint.code || '—').width;
  const enSize = Math.round(W * 0.04);
  ctx.font = `400 ${enSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#3f3f46';
  ctx.fillText(
    (paint.nameEn || '').toUpperCase(),
    pad + codeWidth + W * 0.028,
    textTop + (codeSize - enSize) * 0.82
  );

  // Türkçe isim
  const trTop = textTop + codeSize * 1.28;
  ctx.font = `400 ${Math.round(W * 0.032)}px Goldman, sans-serif`;
  ctx.fillStyle = '#71717a';
  ctx.fillText((paint.nameTr || '').toUpperCase(), pad, trTop);

  // Seri + ambalaj gamı aynı satırda, iki uçta
  const seriesTop = trTop + lineGap;
  ctx.font = `700 ${Math.round(W * 0.025)}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(`${series.line}  ${series.effect}`, pad, seriesTop);

  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.018)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(PACK_SIZES.join('  ·  '), W - pad, seriesTop + W * 0.006);

  // --- Alt şerit: logo solda, site sağda. Kendi ayrılmış alanında. ---
  ctx.textAlign = 'left';
  try {
    const logo = await loadImage(BRAND.logoDark);
    const ratio = logo.naturalHeight / logo.naturalWidth;
    const logoH = footerH;
    const logoW = logoH / ratio;
    ctx.drawImage(logo, pad, footerTop, logoW, logoH);
  } catch {
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(W * 0.026)}px Goldman, sans-serif`;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(BRAND.name, pad, footerTop + footerH / 2);
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.019)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(BRAND.site, W - pad, footerTop + footerH / 2);
}

/** Şablonu üretip PNG data URI döndürür. */
export async function renderToDataUrl(opts: Parameters<typeof renderTemplate>[0]): Promise<string> {
  const canvas = await renderTemplate(opts);
  return canvas.toDataURL('image/png');
}
