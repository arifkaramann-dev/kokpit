/**
 * Görsel yeniden renklendirme — üretim hattının belirleyici halkası.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * Amaç: hazır bir görseldeki (AI üretimi, stüdyo fotoğrafı, render — fark
 * etmez) bir bölgenin rengini, o bölgenin AYDINLATMA YAPISINI bozmadan hedef
 * boyayla değiştirmek.
 *
 * Bu, kataloğun tutarlılığının dayandığı yer. AI'a "şu hex kodunda kask üret"
 * demek işe yaramaz: görüntü modelleri kesin renk tutturmaz, her üretimde
 * biraz kayar. Sonuç, katalogda birbirini tutmayan renkler ve müşterinin
 * "gelen ürün sitedekine benzemiyor" şikâyeti olur.
 *
 * Çözüm rengi AI'dan İSTEMEK değil, sonradan ZORLAMAK: obje bir kez üretilir,
 * rengi burada matematikle oturtulur. Böylece renk konstrüksiyon gereği
 * doğrudur — ölçülüp doğrulanması gereken bir sapma kalmaz.
 *
 * ── Neden blend mode değil ────────────────────────────────────────────────
 * "multiply / overlay" ile renk katmanı bindirmek düz boyada idare eder ama
 * metalikte sahte durur, çünkü gölgeyi ve parlamayı aynı oranda boyar.
 * Gerçekte parlama noktası boyanın rengi değil IŞIĞIN rengidir — orada yüzey
 * beyaza gider, boyanın kroması görünmez.
 *
 * ── Yöntem ────────────────────────────────────────────────────────────────
 * Bölgeyi Lab'a çevir, L* yapısını (gölge, parlama, doku) aynen koru, a/b'yi
 * hedeften al. Sonra iki düzeltme:
 *   1. L* dağılımını hedef boyanın açıklığına kaydır
 *   2. Parlama bölgesinde kromayı söndür — ışık beyazdır, boya değil
 *
 * ── Neden ImageData değil ─────────────────────────────────────────────────
 * Kaynak uygulamada bu modül tarayıcının `ImageData` sınıfına bağlıydı ve
 * testler Node'da çalışabilmek için global bir sahte sınıf tanımlıyordu.
 * Burada düz `Raster` tipiyle çalışıyor: `ImageData` bu tipi yapısal olarak
 * zaten karşılar, yani istemcide doğrudan geçirilebilir; sunucuda ve testte
 * ise hiçbir tarayıcı API'sine ihtiyaç kalmaz.
 *
 * Saf modül: veritabanı, tarih, rastgelelik, tarayıcı API'si yok.
 */

import { labToRgb, rgbToLab, type Lab } from "./color";

/**
 * RGBA piksel dizisi. Tarayıcının `ImageData` nesnesi bu tipi yapısal olarak
 * karşılar — istemcide dönüşüm gerekmeden geçirilebilir.
 */
export type Raster = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type RecolorOptions = {
  /** Karışım oranı: 0 = hiç dokunma, 1 = tamamen yeniden renklendir. */
  amount?: number;
  /** Kromanın sönmeye başladığı L* — bunun üstü parlama sayılır. */
  specularStart?: number;
  /** L* varyasyonunun korunma oranı; 1 = doku aynen korunur. */
  preserveContrast?: number;
};

/** 0..1 aralığında yumuşak geçiş. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Maskelenen bölgeyi hedef boyanın rengine çevirir.
 *
 * @param src        kaynak görsel — DEĞİŞTİRİLMEZ, yeni raster döner
 * @param mask       boyanacak bölge (1 = boya), `width * height` uzunluğunda
 * @param targetLab  hedef boyanın face rengi
 */
export function recolorRegion(
  src: Raster,
  mask: Uint8Array | null | undefined,
  targetLab: Lab,
  { amount = 1, specularStart = 78, preserveContrast = 1 }: RecolorOptions = {},
): Raster {
  const out: Raster = {
    data: new Uint8ClampedArray(src.data),
    width: src.width,
    height: src.height,
  };
  if (!mask) return out;

  // 1) Bölgenin mevcut L* dağılımını çıkar.
  const lightness: number[] = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    lightness.push(rgbToLab({ r: src.data[p], g: src.data[p + 1], b: src.data[p + 2] }).l);
  }
  if (!lightness.length) return out;

  // Referans olarak medyan değil, gölge ve parlamayı dışlayan bir orta bant.
  // Ortalama kullanırsak tek bir parlak leke bütün kaydırmayı bozar.
  lightness.sort((a, b) => a - b);
  const lo = lightness[Math.floor(lightness.length * 0.35)];
  const hi = lightness[Math.floor(lightness.length * 0.75)];
  const bodyL = (lo + hi) / 2;

  // Hedef boyanın açıklığına oturtacak kaydırma
  const shift = targetLab.l - bodyL;

  // 2) Piksel piksel uygula
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    const pixel = rgbToLab({ r: src.data[p], g: src.data[p + 1], b: src.data[p + 2] });

    // L*: yapıyı koru, hedefin açıklığına kaydır.
    // preserveContrast < 1 ise varyasyon gövde etrafında sıkıştırılır.
    const varied = bodyL + (pixel.l - bodyL) * preserveContrast;
    const l = Math.max(0, Math.min(100, varied + shift));

    // Kroma: parlama bölgesinde söndür. Specular yansıma ışığın rengidir,
    // boyanın değil — orada gerçek yüzey de beyaza gider.
    const specular = smoothstep(specularStart, 100, pixel.l);
    const chromaScale = 1 - specular;

    const recolored = labToRgb({
      l,
      a: targetLab.a * chromaScale,
      b: targetLab.b * chromaScale,
    });

    // amount ile orijinale karıştır
    out.data[p] = src.data[p] + (recolored.r - src.data[p]) * amount;
    out.data[p + 1] = src.data[p + 1] + (recolored.g - src.data[p + 1]) * amount;
    out.data[p + 2] = src.data[p + 2] + (recolored.b - src.data[p + 2]) * amount;
  }

  return out;
}
