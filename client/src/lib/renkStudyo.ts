/**
 * Renk Stüdyosu — kart görseli üretimi (istemci tarafı).
 *
 * Sunucu değil istemci: her adım canvas gerektiriyor (piksel okuma, yeniden
 * renklendirme, kompozisyon) ve sunucuda canvas yok. Sonuç bir data URL
 * olarak `renkStudyo.saveCard` ile kaydediliyor.
 *
 * ── Hat ───────────────────────────────────────────────────────────────────
 *   numune master'ı  →  fonu ayıkla  →  maske çıkar  →  renge boya
 *                    →  ambalajla birlikte karta yerleştir  →  data URL
 *
 * Renk `shared/color/recolor.ts` ile MATEMATİKSEL olarak basılıyor; AI'a
 * "şu renkte üret" denmiyor. Bu yüzden aynı master'dan üretilen bütün renkler
 * aynı formda, aynı ışıkta çıkıyor ve renk kesin oluyor.
 */

import { hexToLab } from "@shared/color/color";
import { recolorRegion, type Raster } from "@shared/color/recolor";
import { extractSubjectMask, whitenBackground } from "@shared/color/subject";

/**
 * Ambalaj görselleri — Art of Colour'ın gerçek ürün çekimleri.
 *
 * Bunlar üretilmiyor, boyanmıyor, değiştirilmiyor: karta olduğu gibi
 * yerleştiriliyor. Renge göre değişen tek katman numunedir.
 *
 * `alpha` saydam fonu olan dosyaları işaretler; saydam olmayanların fonu
 * `extractSubject` ile saf beyaza çekilir, yoksa kartın beyazı üstünde gri
 * bir kutu gibi durur.
 */
export const PACKAGING = [
  { id: "vivid-spray400", line: "VIVID", label: "VIVID 400 ML Sprey", src: "/renk/packaging/sprey-400-vivid.jpg", alpha: false },
  { id: "meteor-spray400", line: "METEOR", label: "METEOR 400 ML Sprey", src: "/renk/packaging/sprey-400-meteor.png", alpha: true },
  { id: "meteor-bottle500", line: "METEOR", label: "METEOR 500 ML Şişe", src: "/renk/packaging/sise-500.jpg", alpha: false },
  { id: "meteor-bottle250", line: "METEOR", label: "METEOR 250 ML Şişe", src: "/renk/packaging/sise-250.jpg", alpha: false },
  { id: "meteor-bottle100", line: "METEOR", label: "METEOR 100 ML Şişe", src: "/renk/packaging/sise-100.jpg", alpha: false },
  { id: "meteor-bottle30", line: "METEOR", label: "METEOR 30 ML Şişe", src: "/renk/packaging/sise-30.jpg", alpha: false },
] as const;

export type PackagingOption = (typeof PACKAGING)[number];

export function getPackaging(id: string): PackagingOption {
  return PACKAGING.find(p => p.id === id) ?? PACKAGING[0];
}

/** Görseli yükler. Aynı kaynaktan gelmeli — yoksa canvas kirlenir. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Görsel yüklenemedi: ${src}`));
    img.src = src;
  });
}

function canvasOf(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");
  return { canvas, ctx };
}

export type SubjectExtraction = {
  /** Fonu saf beyaza çekilmiş görsel. */
  canvas: HTMLCanvasElement;
  /** 1 = obje (boyanacak), 0 = fon. `width * height` uzunluğunda. */
  mask: Uint8Array;
  /** Hiç fon bulunamadı — dört köşe de koyu. Kullanıcıya bildirilmeli. */
  noBackgroundFound: boolean;
};

/**
 * Fonu ayıklar ve obje maskesini çıkarır.
 *
 * Mantığın kendisi `shared/color/subject.ts` içinde ve saf: canvas'a bağlı
 * olmadığı için Node'da test edilebiliyor. Burada yalnız canvas ↔ raster
 * dönüşümü var.
 */
export function extractSubject(
  img: HTMLImageElement | HTMLCanvasElement,
  tolerance = 26,
): SubjectExtraction {
  const w = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  const { canvas, ctx } = canvasOf(w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const raster: Raster = { data: image.data, width: image.width, height: image.height };

  const { mask, noBackgroundFound } = extractSubjectMask(raster, tolerance);
  whitenBackground(raster, mask);
  ctx.putImageData(image, 0, 0);

  return { canvas, mask, noBackgroundFound };
}

/**
 * Numuneyi hedef renge boyar.
 *
 * Maske objenin tamamıdır; yeniden renklendirme aydınlatma yapısını koruyup
 * yalnız rengi değiştirdiği için gölge, parlama ve doku olduğu gibi kalır.
 */
export function recolorSample(
  img: HTMLImageElement | HTMLCanvasElement,
  hex: string,
  opts: { amount?: number; preserveContrast?: number } = {},
): { canvas: HTMLCanvasElement; noBackgroundFound: boolean } {
  const { canvas, mask, noBackgroundFound } = extractSubject(img);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const raster: Raster = {
    data: source.data,
    width: source.width,
    height: source.height,
  };
  const out = recolorRegion(raster, mask, hexToLab(hex), opts);

  // Yeni bir ImageData kurmak yerine mevcut tampona yazıyoruz: bir kopya
  // eksiliyor ve `ImageData` yapıcısının dar dizi tipi sorunu doğmuyor.
  source.data.set(out.data);
  ctx.putImageData(source, 0, 0);
  return { canvas, noBackgroundFound };
}

/** Bir kutunun içine oranı bozmadan sığdırır. */
function contain(sw: number, sh: number, bw: number, bh: number) {
  const scale = Math.min(bw / sw, bh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

export type CardInput = {
  /** Boyanmış numune (recolorSample çıktısı). Yoksa yalnız ambalaj çizilir. */
  sample?: HTMLCanvasElement | null;
  packagingId: string;
  color: { code: string; name: string; nameEn?: string | null; hex: string };
  seriesLabel?: string | null;
  /** Kart kenarı — pazaryeri kartları için 1200 güvenli varsayılan. */
  size?: number;
};

/**
 * Pazaryeri kart görselini çizer.
 *
 * Fon her zaman saf beyaz: Trendyol ve Hepsiburada ana görselde beyaz fon
 * şartı koyuyor, diğer kanallarda da temiz duruyor.
 */
export async function renderCard({
  sample,
  packagingId,
  color,
  seriesLabel,
  size = 1200,
}: CardInput): Promise<HTMLCanvasElement> {
  const W = size;
  const H = size;
  const { canvas, ctx } = canvasOf(W, H);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const pad = W * 0.06;
  const stageH = H * 0.78;

  // Ambalaj — sağda, dikey merkezli. Gerçek ürün fotoğrafı, dokunulmuyor.
  const pack = getPackaging(packagingId);
  try {
    const packImg = await loadImage(pack.src);
    const cleaned = pack.alpha ? packImg : extractSubject(packImg).canvas;
    const cw = "naturalWidth" in cleaned ? cleaned.naturalWidth || cleaned.width : cleaned.width;
    const ch = "naturalHeight" in cleaned ? cleaned.naturalHeight || cleaned.height : cleaned.height;
    const box = contain(cw, ch, W * 0.42, stageH * 0.86);
    ctx.drawImage(cleaned, W - pad - W * 0.42 + box.x, pad + box.y, box.w, box.h);
  } catch {
    // Ambalaj yüklenemezse kart numuneyle devam etsin — boş kart üretmekten iyi.
  }

  // Numune — solda, ambalajın önünde
  if (sample) {
    const box = contain(sample.width, sample.height, W * 0.5, stageH * 0.62);
    ctx.drawImage(sample, pad * 0.6 + box.x, pad + stageH * 0.3 + box.y, box.w, box.h);
  }

  // Renk şeridi — kartın altında, rengin kendisi hiç aracısız görünsün
  ctx.fillStyle = color.hex;
  ctx.fillRect(0, H - H * 0.06, W, H * 0.06);

  // Başlık
  const title = color.nameEn ? `${color.name} · ${color.nameEn}` : color.name;
  ctx.fillStyle = "#0a0a0c";
  ctx.textBaseline = "top";
  ctx.font = `700 ${Math.round(W * 0.055)}px Goldman, system-ui, sans-serif`;
  ctx.fillText(title.toUpperCase(), pad, pad * 0.7, W - pad * 2);

  ctx.fillStyle = "#6b7280";
  ctx.font = `400 ${Math.round(W * 0.03)}px Goldman, system-ui, sans-serif`;
  const sub = [color.code, seriesLabel].filter(Boolean).join("  ·  ");
  ctx.fillText(sub, pad, pad * 0.7 + W * 0.07, W - pad * 2);

  return canvas;
}

/**
 * Marka yazı tipini yükler.
 *
 * Canvas, yazı tipi hazır değilken çizerse sessizce sistem fontuna düşer ve
 * kart markasız görünür. Çizimden ÖNCE beklenmesi gerekiyor.
 * Yüklenemezse hata atmaz — kart sistem fontuyla da üretilebilmeli.
 */
export async function ensureBrandFont(): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  try {
    const faces = [
      new FontFace("Goldman", "url(/renk/fonts/goldman-400-latin.woff2)", { weight: "400" }),
      new FontFace("Goldman", "url(/renk/fonts/goldman-700-latin.woff2)", { weight: "700" }),
    ];
    const loaded = await Promise.all(faces.map(f => f.load()));
    loaded.forEach(f => document.fonts.add(f));
    return true;
  } catch {
    return false;
  }
}

/** Kartı JPEG data URL'e çevirir — pazaryeri kartları için yeterli ve küçük. */
export function toDataUrl(canvas: HTMLCanvasElement, quality = 0.92): string {
  return canvas.toDataURL("image/jpeg", quality);
}
