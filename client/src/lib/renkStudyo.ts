/**
 * Renk Stüdyosu — istemci tarafı görsel işleri.
 *
 * Üretimi AI yapıyor (sunucuda), burada yalnız üretim SONRASI düzeltme var:
 * modelin çıkardığı rengi istenen hex'e tam oturtmak.
 *
 * Neden istemcide: her adım canvas gerektiriyor (piksel okuma, yeniden
 * renklendirme) ve sunucuda canvas yok.
 */

import { hexToLab } from "@shared/color/color";
import { recolorRegion, type Raster } from "@shared/color/recolor";
import { extractSubjectMask, whitenBackground } from "@shared/color/subject";

/** Görseli yükler. Aynı kaynaktan gelmeli — yoksa canvas kirlenir. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
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

export type ExactColorResult = {
  /** Rengi hedefe oturtulmuş görsel, data URL. */
  data: string;
  /**
   * Hiç fon bulunamadı — dört köşe de koyu. Maske "her şey obje" olur, yani
   * fon da boyanır. Kullanıcıya bildirilmeli.
   */
  noBackgroundFound: boolean;
};

/**
 * AI çıktısının rengini istenen hex'e TAM oturtur.
 *
 * ── Neden gerekebiliyor ───────────────────────────────────────────────────
 * Görüntü modelleri kesin renk tutturmaz. "MAGENTA #C2185B" istersin, çıkan
 * karenin pembesi ölçtüğünde başka bir pembedir. Katalogda bu, aynı rengin
 * farklı ürünlerde farklı görünmesi demek.
 *
 * Bu düzeltme aydınlatma yapısını (gölge, parlama, doku) olduğu gibi bırakıp
 * yalnız rengi hedefe kaydırır; sonuç AI'ın çizdiği obje ama tam istenen
 * renkte. İsteğe bağlıdır: modelin kendi yorumunu korumak istenirse
 * çalıştırılmaz.
 */
export async function forceExactColor(src: string, hex: string): Promise<ExactColorResult> {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const { canvas, ctx } = canvasOf(w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const raster: Raster = { data: image.data, width: image.width, height: image.height };

  const { mask, noBackgroundFound } = extractSubjectMask(raster);
  whitenBackground(raster, mask);

  const out = recolorRegion(raster, mask, hexToLab(hex));
  // Yeni ImageData kurmak yerine mevcut tampona yazıyoruz: bir kopya eksiliyor.
  image.data.set(out.data);
  ctx.putImageData(image, 0, 0);

  return { data: canvas.toDataURL("image/png"), noBackgroundFound };
}

/** Dosyayı data URL'e çevirir. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

/** Boşluk ve Türkçe harfleri anahtar biçimine indirger. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
