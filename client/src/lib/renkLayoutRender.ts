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
  type TemplateLayout,
  type TokenValues,
} from "@shared/color/layout";
import { ensureBrandFont, forceWhiteBackground } from "./renkTemplates";

export type LayerImages = Partial<Record<ImageSource, HTMLCanvasElement | HTMLImageElement | null>>;

export type RenderLayoutInput = {
  layout: TemplateLayout;
  values: TokenValues;
  images: LayerImages;
  /** `fill: "paint"` katmanlarının rengi. */
  paintHex?: string | null;
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

export async function renderLayout({
  layout,
  values,
  images,
  paintHex,
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

    if (layer.type === "rect") {
      ctx.fillStyle = layer.fill === "paint" ? paintHex || "#cccccc" : layer.fill;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      continue;
    }

    if (layer.type === "image") {
      const img = images[layer.source];
      if (!img) continue;
      // Logo saydam PNG; fonunu ayıklamaya çalışmak onu bozar.
      const drawable =
        layer.source === "logo" ? img : forceWhiteBackground(img).canvas;
      const { w: sw, h: sh } = sizeOf(drawable);
      const fitted =
        layer.fit === "cover" ? cover(sw, sh, box.w, box.h) : contain(sw, sh, box.w, box.h);
      if (layer.fit === "cover") {
        // Kutunun dışına taşan kısım kırpılmalı, yoksa komşu katmanı ezer.
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.drawImage(drawable, box.x + fitted.x, box.y + fitted.y, fitted.w, fitted.h);
        ctx.restore();
      } else {
        ctx.drawImage(drawable, box.x + fitted.x, box.y + fitted.y, fitted.w, fitted.h);
      }
      continue;
    }

    const text = resolveText(layer, values);
    if (!text) continue;

    const px = fitFont(ctx, text, box.w, layer.weight, layer.size * layout.width);
    ctx.fillStyle = layer.color;
    ctx.textBaseline = "top";
    ctx.textAlign = layer.align;
    const tx = layer.align === "right" ? box.x + box.w : layer.align === "center" ? box.x + box.w / 2 : box.x;
    ctx.fillText(text, tx, box.y);
  }

  return canvas;
}

export async function renderLayoutToDataUrl(input: RenderLayoutInput): Promise<string> {
  const canvas = await renderLayout(input);
  return canvas.toDataURL("image/png");
}
