/**
 * Katman tarifini karea çizer.
 *
 * `shared/color/layout.ts` NE çizileceğini söyler, burası çizer. Ayrım
 * kasıtlı: tarif saf ve test edilebilir kalıyor, canvas'a bağlı olan tek yer
 * burası oluyor.
 */

import {
  boxToPixels,
  resolveText,
  type ImageSource,
  paletteColumns,
  upperText,
  type PaletteEntry,
  type PaletteLayer,
  type TemplateLayout,
  type TokenValues,
  type Watermark,
} from "@shared/color/layout";
import { knockoutBackgroundRaster } from "@shared/color/matte";
import { extractSubjectMask } from "@shared/color/subject";
import { ensureBrandFont, forceWhiteBackground } from "./renkTemplates";

export type LayerImages = Partial<Record<ImageSource, HTMLCanvasElement | HTMLImageElement | null>>;

export type RenderLayoutInput = {
  layout: TemplateLayout;
  values: TokenValues;
  images: LayerImages;
  /** `fill: "paint"` katmanlarının rengi. */
  paintHex?: string | null;
  /** Palet katmanının çizeceği renkler — serinin gamı. */
  palette?: PaletteEntry[];
  /** Palet karelerinin yüklenmiş görselleri, renk KODUNA göre. */
  paletteImages?: Record<string, HTMLImageElement | HTMLCanvasElement>;
  /**
   * Marka filigranı — `resolveWatermark` ile çözülmüş hâli. null/undefined =
   * çizilmez. Çözümü çağıran yapıyor çünkü "çıplak şablon" bilgisi (pazaryeri
   * ana görseli) şablon tanımında, yerleşimde değil.
   */
  watermark?: Watermark | null;
};

function contain(sw: number, sh: number, bw: number, bh: number) {
  const s = Math.min(bw / sw, bh / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

function cover(sw: number, sh: number, bw: number, bh: number) {
  const s = Math.max(bw / sw, bh / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

const sizeOf = (img: HTMLCanvasElement | HTMLImageElement) => ({
  w: "naturalWidth" in img ? img.naturalWidth || img.width : img.width,
  h: "naturalHeight" in img ? img.naturalHeight || img.height : img.height,
});

/**
 * Metni kutuya sığdırır.
 *
 * Uzun bir renk adı kutudan taşıp yanındaki katmanın üstüne biniyordu. Canvas
 * kendiliğinden kırpmaz; ölçüp küçültmek gerekiyor. Alt sınır var: sonsuza
 * kadar küçültmek yerine bir yerde durup taşmayı kabul etmek, okunamayacak
 * kadar küçük yazıdan iyidir.
 */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  weight: number,
  startPx: number,
): number {
  let px = startPx;
  const min = startPx * 0.55;
  for (;;) {
    ctx.font = `${weight} ${Math.round(px)}px Goldman, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW || px <= min) return px;
    px *= 0.94;
  }
}

/**
 * Metni satırlara böler — `wrap` açık katmanlar için.
 *
 * Kelime kelime ölçülüyor; tek bir kelime kutudan geniş olsa da bölünmüyor.
 * Sözcük ortasından kesmek okunurluğu, taşmadan daha çok bozar.
 */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxW) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

/** Köşeleri yuvarlatılmış dikdörtgen yolu — `roundRect` desteklenmeyebilir. */
function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Görselin gölgesi olabilir mi — yani fonu saydam mı?
 *
 * Beyaz fonlu bir kareye gölge basılınca gölge OBJENİN değil, dikdörtgen
 * karenin çevresine düşüyor ve kart, beyaz zemine yapıştırılmış bir polaroid
 * gibi görünüyordu. AI çıktıları beyaz fonlu geliyor; kullanıcının yüklediği
 * ambalaj çekimi ise genelde fonu silinmiş PNG.
 *
 * Karar çizim anında ölçülüyor, kullanıcıya sorulmuyor: "bu görselin fonu
 * saydam mı" bilgisi kullanıcının kafasında değil, dosyanın içinde.
 */
function canCastShadow(img: HTMLCanvasElement | HTMLImageElement): boolean {
  if (!("getContext" in img)) return true; // logo: saydam PNG olduğu biliniyor
  const ctx = img.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const w = img.width;
  const h = img.height;
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  return corners.some(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 250);
}

/** "#c2185b" → "rgba(194,24,91,0)" — geçişli şeridin bitiş durağı. */
function fadeOut(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "rgba(255,255,255,0)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

/**
 * Renk paletini ızgaraya çizer.
 *
 * Satır sayısı renk sayısından çıkıyor, hücre boyu kutuya bölünerek: aynı
 * yerleşim 12 renkli bir seride de 40 renkli bir seride de taşmadan çalışsın.
 * Renk sayısı arttıkça kutular küçülür — kırpmak, "diğer renkler" karesinin
 * amacını (gamın TAMAMINI göstermek) bozardı.
 */
/**
 * Beyaz fonu siler — palet karesi koyu zeminde beyaz kutu olarak durmasın.
 *
 * Kareler beyaz fonlu ürün çekimleri. Açık zeminli kartta sorun yok, koyu
 * zeminli banner'da her biri parlak beyaz bir dikdörtgen oluyordu; tasarımın
 * en amatör görünen yeri buydu.
 *
 * Fon tespiti şablon üretiminin başka yerinde zaten var (`extractSubjectMask`,
 * köşelerden komşuluk zinciriyle ilerleyen dolgu). Aynı maskeyi burada alfa
 * kanalına yazıyoruz: obje kalıyor, fon saydamlaşıyor. Yeni bir eşik ya da
 * ikinci bir "fon nedir" tanımı üretmiyoruz — iki farklı cevap veren iki kod
 * yolu, bu projede daha önce tam olarak bu şekilde sorun çıkardı.
 *
 * Sonuç önbellekleniyor: aynı palet karesi birden çok banner ölçüsünde
 * çiziliyor ve maske hesabı piksel piksel dolaşıyor.
 */
const knockoutCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, HTMLCanvasElement>();

function knockoutBackground(
  img: HTMLImageElement | HTMLCanvasElement,
): HTMLImageElement | HTMLCanvasElement {
  const cached = knockoutCache.get(img);
  if (cached) return cached;

  const { w, h } = sizeOf(img);
  if (!w || !h) return img;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return img;

  ctx.drawImage(img, 0, 0, w, h);
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    // Çapraz kaynak görsel canvas'ı kirletir; fonu silemeyiz ama kareyi de
    // kaybetmeyelim — olduğu gibi çizilir.
    return img;
  }

  const raster = { data: image.data, width: w, height: h };
  const { mask, noBackgroundFound } = extractSubjectMask(raster);
  // Fon bulunamadıysa maske "her şey obje" olur; alfa yazmak anlamsız.
  if (noBackgroundFound) return img;

  // Maskeyi doğrudan alfaya yazmak yetmiyor: kenardaki karışık pikseller
  // (obje + beyaz fon) tam opak kalıyor ve koyu zeminde HÂLE oluyordu.
  // Aşındır → yumuşat → beyazı sök (bkz. `shared/color/matte.ts`).
  knockoutBackgroundRaster(raster, mask);
  ctx.putImageData(image, 0, 0);
  knockoutCache.set(img, canvas);
  return canvas;
}

function drawPalette(
  ctx: CanvasRenderingContext2D,
  layer: PaletteLayer,
  box: { x: number; y: number; w: number; h: number },
  entries: PaletteEntry[],
  width: number,
  images: Record<string, HTMLImageElement | HTMLCanvasElement>,
) {
  /*
   * Çip modunda RENGİ OLMAYAN kayıt çizilmez.
   *
   * Katalogdaki renklerin çoğunun hex'i boş (renk kaynağı referans fotoğraf).
   * Yedek dolgu açık gri olduğu için banner'da yan yana boş beyaz haplar
   * çıkıyordu — "renk gamı" değil, doldurulmamış form gibi. Rengi bilinmeyeni
   * göstermemek, yanlış göstermekten iyi.
   */
  const list = layer.swatches ? entries.filter(e => !!e.hex) : entries;
  if (layer.swatches && list.length < 2) return;

  const columns =
    layer.columns > 0
      ? Math.max(1, Math.round(layer.columns))
      : paletteColumns(list.length, box.w, box.h);
  const rows = Math.ceil(list.length / columns);
  if (!rows) return;

  const gap = Math.max(0, layer.gap) * width;
  let cellW = (box.w - gap * (columns - 1)) / columns;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const labelPx = layer.showCode ? layer.labelSize * width : 0;
  // Etiket için hücrenin altından yer ayrılıyor; kalanı kutu.
  const swatchH = Math.max(cellW * 0.25, cellH - labelPx * 1.5);
  // Çip DAİRE olmalı: hücre genişliği yüksekliğinden büyükse hap şeklinde
  // uzuyor ve boş bir düğmeye benziyordu. Genişlik yüksekliğe kırpılıyor.
  if (layer.swatches) cellW = Math.min(cellW, swatchH);
  const radius = (layer.radius ?? 0) * width;

  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = box.x + col * (cellW + gap);
    const y = box.y + row * (cellH + gap);

    // Rengin stüdyo karesi varsa O çizilir; hex yalnız görsel yoksa devreye
    // giren yedek. Kutuya sığdırılıyor (kırpmadan): kareler farklı oranlarda
    // olabilir ve obje kırpılırsa palet bozuk görünür.
    // `swatches` açıkken kare hiç aranmaz: çizilecek şey rengin kendisi.
    const raw = layer.swatches ? undefined : e.code ? images[e.code] : undefined;
    const img = raw && layer.knockout ? knockoutBackground(raw) : raw;
    if (img) {
      const { w: sw, h: sh } = sizeOf(img);
      const fitted = contain(sw, sh, cellW, swatchH);
      ctx.save();
      roundedPath(ctx, x, y, cellW, swatchH, radius);
      ctx.clip();
      ctx.drawImage(img, x + fitted.x, y + fitted.y, fitted.w, fitted.h);
      ctx.restore();
    } else {
      ctx.fillStyle = e.hex || "#e5e7eb";
      // Çip modunda daire: yarıçap kutunun yarısı. Kare çipler zaten renk
      // kutusu gibi duruyor ve palet şeridini tabloya çeviriyordu.
      const r = layer.swatches ? Math.min(cellW, swatchH) / 2 : radius;
      roundedPath(ctx, x, y, cellW, swatchH, r);
      ctx.fill();
    }

    // Kartın kendi rengi: dışına çerçeve. İçine çizmek kutunun rengini
    // değiştirirdi ve palet karesinin tek işi rengi doğru göstermek.
    if (layer.highlight && e.active) {
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = Math.max(2, width * 0.0035);
      roundedPath(
        ctx,
        x - ctx.lineWidth,
        y - ctx.lineWidth,
        cellW + ctx.lineWidth * 2,
        swatchH + ctx.lineWidth * 2,
        radius,
      );
      ctx.stroke();
    }

    if (!layer.showCode) continue;
    const code = upperText(e.code ?? "");
    if (!code) continue;
    ctx.fillStyle = layer.labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const weight = e.active ? 700 : 400;
    const px = fitFont(ctx, code, cellW, weight, labelPx);
    ctx.font = `${weight} ${Math.round(px)}px Goldman, system-ui, sans-serif`;
    ctx.fillText(code, x + cellW / 2, y + swatchH + labelPx * 0.28);
  }
}

/**
 * Logoyu tek renge boyar — alfa kanalını koruyarak.
 *
 * Marka logosu koyu bir PNG; koyu bir karenin ya da rengin üstünde filigran
 * olarak görünmezdi. `source-in` bileşimi logonun ŞEKLİNİ maske olarak
 * kullanıp içini istenen renkle dolduruyor: aynı dosya hem açık hem koyu
 * zeminde, hem de ürünün kendi renginde kullanılabiliyor.
 */
function tintImage(
  img: HTMLCanvasElement | HTMLImageElement,
  color: string,
  targetW: number,
): HTMLCanvasElement {
  const { w: sw, h: sh } = sizeOf(img);
  const scale = sw > 0 ? targetW / sw : 1;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(targetW));
  c.height = Math.max(1, Math.round(sh * scale));
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Filigranı karenin ÜSTÜNE basar.
 *
 * En üstte olması şart: objenin altına çizilen filigran, objeyi kesip alan
 * biri için hiç yok demektir. Döşeme kare merkezinden döndürülerek kuruluyor
 * ve köşegen kadar geniş bir alanı tarıyor — eğik döşemede kenarlar boş
 * kalmasın.
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  wm: Watermark,
  logo: HTMLCanvasElement | HTMLImageElement,
  width: number,
  height: number,
  paintHex?: string | null,
) {
  const color =
    wm.tint === "paint" ? paintHex || "#0a0a0a" : wm.tint === "light" ? "#ffffff" : "#0a0a0a";
  const stampW = Math.max(24, wm.scale * width);
  const stamp = tintImage(logo, color, stampW);
  if (!stamp.width || !stamp.height) return;

  ctx.save();
  ctx.globalAlpha = wm.opacity;

  if (wm.mode === "center") {
    ctx.drawImage(stamp, (width - stamp.width) / 2, (height - stamp.height) / 2);
    ctx.restore();
    return;
  }

  ctx.translate(width / 2, height / 2);
  ctx.rotate((wm.angle * Math.PI) / 180);
  // Döndürülmüş düzlemde kareyi kesin örtmek için köşegen yetiyor.
  const reach = Math.hypot(width, height) / 2 + stamp.width;
  const stepX = stamp.width * 1.7;
  const stepY = stamp.height * 3.4;
  let row = 0;
  for (let y = -reach; y <= reach; y += stepY) {
    // Şaşırtmalı diziliş: hizalı ızgara, kırpınca tekrar eden bir desen
    // bırakıyor ve temizlemesi kolaylaşıyor.
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let x = -reach + offset; x <= reach; x += stepX) {
      ctx.drawImage(stamp, x, y);
    }
    row += 1;
  }
  ctx.restore();
}

export async function renderLayout({
  layout,
  values,
  images,
  paintHex,
  palette = [],
  paletteImages = {},
  watermark,
}: RenderLayoutInput): Promise<HTMLCanvasElement> {
  await ensureBrandFont();

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");

  ctx.fillStyle = layout.background || "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);

  for (const layer of layout.layers) {
    if (!layer.visible) continue;
    const box = boxToPixels(layer.box, layout.width, layout.height);

    // Saydamlık her katman türünde aynı işi yapıyor; tek yerde kurulup tek
    // yerde geri alınıyor ki bir tür eklenince unutulmasın.
    ctx.save();
    if (layer.opacity != null) ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

    if (layer.type === "rect") {
      const base = layer.fill === "paint" ? paintHex || "#cccccc" : layer.fill;
      if (layer.gradient) {
        // `flip`: altta opak, yukarı doğru saydam — fotoğraf üstüne yazı
        // basarken karartma alt kenardan yükselmeli.
        const g = layer.flip
          ? ctx.createLinearGradient(box.x, box.y + box.h, box.x, box.y)
          : ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
        g.addColorStop(0, base);
        g.addColorStop(1, fadeOut(base));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = base;
      }
      if (layer.radius) {
        roundedPath(ctx, box.x, box.y, box.w, box.h, layer.radius * layout.width);
        ctx.fill();
      } else {
        ctx.fillRect(box.x, box.y, box.w, box.h);
      }
      ctx.restore();
      continue;
    }

    if (layer.type === "palette") {
      // Renk listesi verilmemişse katman atlanıyor: boş bir ızgara çizmek
      // "bu serinin rengi yok" izlenimi verirdi.
      if (palette.length) drawPalette(ctx, layer, box, palette, layout.width, paletteImages);
      ctx.restore();
      continue;
    }

    if (layer.type === "image") {
      const img = images[layer.source];
      if (!img) {
        ctx.restore();
        continue;
      }
      // Logo saydam PNG; fonunu ayıklamaya çalışmak onu bozar.
      // `knockout` açıkken fon SİLİNİYOR (koyu zeminli banner); kapalıyken
      // beyaza sabitleniyor (açık zeminli kartlarda fon karta karışsın).
      const drawable =
        layer.source === "logo"
          ? img
          : layer.knockout
            ? knockoutBackground(img)
            : forceWhiteBackground(img).canvas;
      const { w: sw, h: sh } = sizeOf(drawable);
      const fitted =
        layer.fit === "cover" ? cover(sw, sh, box.w, box.h) : contain(sw, sh, box.w, box.h);
      if (layer.shadow && canCastShadow(drawable)) {
        // Gölge kare ölçüsüne göre: 1080'lik gönderi ile 1600'lük pazaryeri
        // karesinde aynı piksel değeri biri kalın biri görünmez olurdu.
        ctx.shadowColor = "rgba(15,15,20,0.28)";
        ctx.shadowBlur = layout.width * 0.022;
        ctx.shadowOffsetY = layout.width * 0.008;
      }
      if (layer.fit === "cover") {
        // Kutunun dışına taşan kısım kırpılmalı, yoksa komşu katmanı ezer.
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
      }
      ctx.drawImage(drawable, box.x + fitted.x, box.y + fitted.y, fitted.w, fitted.h);
      ctx.restore();
      continue;
    }

    const text = resolveText(layer, values);
    if (!text) {
      ctx.restore();
      continue;
    }

    ctx.fillStyle = layer.color;
    ctx.textBaseline = "top";
    ctx.textAlign = layer.align;
    const tx =
      layer.align === "right" ? box.x + box.w : layer.align === "center" ? box.x + box.w / 2 : box.x;

    if (layer.wrap) {
      // Sarılan metinde yazı boyutu KÜÇÜLTÜLMEZ: satır sayısı arttıkça
      // küçültmek paragrafı okunamaz hale getirirdi. Kutuya sığmayan satırlar
      // çizilmez — komşu katmanın üstüne binmesindense kesilsin.
      const px = layer.size * layout.width;
      ctx.font = `${layer.weight} ${Math.round(px)}px Goldman, system-ui, sans-serif`;
      const step = px * (layer.lineHeight ?? 1.2);
      const lines = wrapLines(ctx, text, box.w);
      for (let i = 0; i < lines.length; i += 1) {
        const y = box.y + i * step;
        if (y + px > box.y + box.h && i > 0) break;
        ctx.fillText(lines[i], tx, y);
      }
    } else {
      const px = fitFont(ctx, text, box.w, layer.weight, layer.size * layout.width);
      ctx.fillText(text, tx, box.y);
    }
    ctx.restore();
  }

  // Filigran EN SON: katmanların üstünde kalmalı, yoksa objeyi kesip alan biri
  // için hiç basılmamış gibi olur.
  if (watermark && images.logo) {
    drawWatermark(ctx, watermark, images.logo, layout.width, layout.height, paintHex);
  }

  return canvas;
}

export async function renderLayoutToDataUrl(input: RenderLayoutInput): Promise<string> {
  const canvas = await renderLayout(input);
  return canvas.toDataURL("image/png");
}
