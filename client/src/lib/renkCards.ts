/**
 * Pazarlama kartlarının üretimi — yerleşim tarifinden.
 *
 * Girdi: bir obje görseli + rengin bilgileri. Çıktı: altı kare.
 *
 * Görseller BİR KEZ hazırlanıp bütün şablonlarda tekrar kullanılıyor. Her
 * şablon için ambalajı yeniden indirmek ya da kat karelerini yeniden
 * hesaplamak, altı katı iş demekti — ve kat kareleri yeniden hesaplanınca
 * şablonlar arasında ufak farklar oluşabilirdi.
 */

import { renderCoat } from "@shared/color/candy";
import { hexToLab, type Lab } from "@shared/color/color";
import { assetIdOf, type ImageSource, type TemplateLayout, type TokenValues } from "@shared/color/layout";
import { defaultLayout } from "@shared/color/layoutDefaults";
import type { Raster } from "@shared/color/recolor";
import { extractSubjectMask, measureSubjectLab } from "@shared/color/subject";
import { renderLayoutToDataUrl, type LayerImages } from "./renkLayoutRender";
import {
  BRAND,
  PACK_SIZES,
  TEMPLATES,
  defaultPackagingFor,
  forceWhiteBackground,
  getPackaging,
  getSeries,
  loadImageSrc,
  type PaintInfo,
} from "./renkTemplates";

export type CardOutput = { id: string; label: string; data: string };

export type BuildCardsInput = {
  /** AI'den gelen obje görseli (data URL). */
  objectImage: string;
  /** Gümüş metalik baz — yalnız kat progresyonu kullanır. */
  baseImage?: string | null;
  paint: PaintInfo;
  /** Kullanıcının düzenlediği yerleşimler; olmayan şablon fabrika tarifiyle çizilir. */
  layouts?: Record<string, TemplateLayout>;
};

/** Katman metinlerinin dolduracağı değerler. */
export function tokenValues(paint: PaintInfo): TokenValues {
  const series = getSeries(paint.seriesCode);
  return {
    code: paint.code ?? "",
    nameTr: paint.nameTr ?? "",
    nameEn: paint.nameEn ?? "",
    series: series.label,
    line: series.line,
    effect: series.effect,
    packSizes: PACK_SIZES.join("  ·  "),
    brand: BRAND.name,
    site: BRAND.site,
  };
}

function toRaster(img: HTMLImageElement | HTMLCanvasElement) {
  const w = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const raster: Raster = { data: image.data, width: image.width, height: image.height };
  return { raster, mask: extractSubjectMask(raster).mask };
}

function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");
  const img = ctx.createImageData(r.width, r.height);
  img.data.set(r.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Kat karelerini gümüş bazdan üretir.
 *
 * Gümüş baz ya da hedef renk yoksa BOŞ döner: uydurma bir progresyon basmak,
 * müşteriye yanlış bilgi vermektir. Kartta o katmanlar çizilmez.
 */
function buildCoats(base: HTMLImageElement, targetLab: Lab | null): LayerImages {
  if (!targetLab) return {};
  const { raster, mask } = toRaster(forceWhiteBackground(base).canvas);
  const baseLab = measureSubjectLab(raster, mask);
  if (!baseLab) return {};
  return {
    coat1: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 1, { totalCoats: 3 })),
    coat2: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 2, { totalCoats: 3 })),
    coat3: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 3, { totalCoats: 3 })),
  };
}

/**
 * Yerleşimlerde geçen kullanıcı varlıklarını yükler.
 *
 * Tek tek değil topluca: aynı ambalaj birden çok şablonda kullanılıyorsa
 * bir kez indirilsin. Yüklenemeyen varlık atlanıyor — kart o katman olmadan
 * çizilir, hiç çizilmemesinden iyidir.
 */
async function loadAssets(layouts: TemplateLayout[]): Promise<LayerImages> {
  const ids = new Set<number>();
  for (const l of layouts) {
    for (const layer of l.layers) {
      if (layer.type !== "image") continue;
      const id = assetIdOf(layer.source);
      if (id) ids.add(id);
    }
  }
  const out: LayerImages = {};
  for (const id of Array.from(ids)) {
    try {
      out[`asset:${id}`] = await loadImageSrc(`/api/img/sample/${id}`);
    } catch (err) {
      console.warn("[renkCards] varlık yüklenemedi:", id, err);
    }
  }
  return out;
}

/** Bir şablonun kullandığı görsel kaynakları. */
function usedSources(layout: TemplateLayout): Set<ImageSource> {
  const out = new Set<ImageSource>();
  for (const l of layout.layers) if (l.type === "image" && l.visible) out.add(l.source);
  return out;
}

export async function buildCards({
  objectImage,
  baseImage,
  paint,
  layouts = {},
}: BuildCardsInput): Promise<CardOutput[]> {
  const values = tokenValues(paint);
  const targetLab = paint.hex ? hexToLab(paint.hex) : null;

  const obj = await loadImageSrc(objectImage);

  // Ambalaj ve logo isteğe bağlı: yüklenemezse kart o katman olmadan çizilir,
  // hiç üretilmemesinden iyidir. Sessiz kalmasın diye uyarı basılıyor.
  let packaging: HTMLImageElement | null = null;
  try {
    const pack = getPackaging(defaultPackagingFor(paint.seriesCode, paint.packaging));
    packaging = await loadImageSrc(pack.src);
  } catch (err) {
    console.warn("[renkCards] ambalaj yüklenemedi:", err);
  }

  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImageSrc(BRAND.logoDark);
  } catch (err) {
    console.warn("[renkCards] logo yüklenemedi:", err);
  }

  let coats: LayerImages = {};
  if (baseImage) {
    try {
      coats = buildCoats(await loadImageSrc(baseImage), targetLab);
    } catch (err) {
      console.warn("[renkCards] kat progresyonu üretilemedi:", err);
    }
  }

  const resolved = TEMPLATES.map(t => layouts[t.id] ?? defaultLayout(t.id));
  const assets = await loadAssets(resolved);
  const images: LayerImages = { object: obj, packaging, logo, ...coats, ...assets };

  const out: CardOutput[] = [];
  for (let i = 0; i < TEMPLATES.length; i += 1) {
    const tpl = TEMPLATES[i];
    const layout = resolved[i];
    // Kat kareleri yoksa o şablon yalnız başlık ve marka ile çıkardı; boş
    // kare basmak yerine atlanıyor ve sebebi çağıran tarafa bırakılıyor.
    const needsCoats = usedSources(layout).has("coat1");
    if (needsCoats && !coats.coat1) continue;

    out.push({
      id: tpl.id,
      label: tpl.label,
      data: await renderLayoutToDataUrl({ layout, values, images, paintHex: paint.hex }),
    });
  }
  return out;
}
