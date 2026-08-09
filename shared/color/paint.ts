/**
 * Boya kaydının tek tanımı ve tamamlama noktası.
 *
 * ── Neden var ─────────────────────────────────────────────────────────────
 * Kayıtlar birden fazla yoldan geliyor — AI ile üretilen renk, elle girilen
 * katalog satırı, kokpit'in `colors` tablosundan okunan satır — ve her biri
 * farklı alan kümesi yazıyor. Görüntüleme kodu bu alanlarda doğrudan
 * `.toFixed()` çağırdığı için biri eksik olduğunda sayfa çöküyordu.
 *
 * Eksikleri okuyan tarafta değil BURADA tamamlıyoruz: her okuma noktasına
 * ayrı ayrı korumalı erişim yazmak, er ya da geç unutulan bir nokta bırakır.
 * Tek kapı olunca unutulacak yer kalmıyor.
 *
 * Saf modül: veritabanı, tarih, rastgelelik yok.
 */

import { hexToRgb, rgbToLab, rgbToXyz, type AngleSample, type Lab, type Rgb, type Xyz } from "./color";
import { getSeries } from "./series";

/**
 * Bir boyanın tam kaydı.
 *
 * `lab` rengin ölçüsü, `hex` insan tarafı; ikisi aynı rengi anlatır ve
 * tutarlı kalmaları çağıranın sorumluluğudur (`normalizePaint` üretmez,
 * yalnız eksikse tamamlar).
 */
export type Paint = {
  id?: string;
  /** Ürün kodu — katalogda ve etikette görünen. */
  code: string;
  name: string;
  /** `SERIES` içindeki bir id; bilinmeyen değer Solid'e düşer. */
  series: string;

  hex: string;
  srgb: Rgb;
  lab: Lab;
  xyz: Xyz;

  /** 0..1 — pulcuk/metalik oranı. Eksikse seri varsayılanı. */
  metallic: number;
  /** 0..1 — interferans (sedef) pigmenti oranı. */
  pearl: number;
  /** 0..1 — görünür pulcuk yoğunluğu. */
  flake: number;
  /** 0..100 — parlaklık (gloss units yaklaşımı). */
  gloss: number;
  /** 0..1 — saydamlık; Candy serisinde belirleyici. */
  transparency: number;

  /** Candy/Meteor gibi serilerde altta duran baz kat. */
  basecoat: string | null;
  clearcoat: string;
  /** Açıya göre renk profili; ölçüm yoksa tek açılık düz profil. */
  multi_angle: AngleSample[];

  /** Kaynak kayıttan gelen, burada tanınmayan alanlar korunur. */
  [key: string]: unknown;
};

/** `normalizePaint` girdisi — her alanı eksik olabilir. */
export type PaintInput = Partial<Paint> & Record<string, unknown>;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Eksik alanları makul varsayılanlarla tamamlar.
 *
 * Varsayılanlar keyfi değil: `metallic` seri tanımından gelir (Metallic
 * serisindeki bir kayıt, alan boşsa 0 değil 0.34 olmalıdır), `multi_angle`
 * ise en azından tek açılık düz profile düşer ki açı okuyan kod boş dizi
 * görüp çökmesin.
 *
 * `null` girdide `null` döner — çağıran "kayıt yok" durumunu ayırt edebilsin.
 */
export function normalizePaint(raw: PaintInput | null | undefined): Paint | null {
  if (!raw) return null;

  const hex = String(raw.hex ?? "#808080").toLowerCase();
  const series = typeof raw.series === "string" && raw.series ? raw.series : "Solid";
  const srgb: Rgb = raw.srgb ?? hexToRgb(hex);

  // `lab` HEX'TEN TÜRETİLİR — sabit bir varsayılana düşmez.
  //
  // Kaynak uygulamada bu satır `raw.lab || { l: 50, a: 0, b: 0 }` idi: Lab
  // yoksa kayıt nötr griye sabitleniyordu, oysa `srgb` ve `xyz` aynı fonksiyon
  // içinde hex'ten türetiliyordu. Yani hex'i kırmızı olan bir kayıt srgb/xyz
  // tarafında kırmızı, Lab tarafında gri görünüyordu.
  //
  // Uygulamada bu hata hiç patlamadı çünkü kayıtlar tarama hattından geliyordu
  // ve Lab'ı hep dolu oluyordu. Kokpit'te durum tersine dönüyor: `colors`
  // tablosunda hex var, Lab yok. Eski davranışla taşınan HER renk gri Lab
  // alırdı ve ΔE eşleştirmesi hepsini birbirinin aynısı sayardı — sessizce,
  // hata vermeden, tamamen yanlış sonuçla.
  const lab: Lab = raw.lab ?? rgbToLab(srgb);

  return {
    ...raw,
    hex,
    series,
    lab,
    srgb,
    xyz: raw.xyz ?? rgbToXyz(srgb),

    // Malzeme alanları: eksikse seri varsayılanına düş.
    metallic: num(raw.metallic, getSeries(series).pbr.metalness),
    pearl: num(raw.pearl, 0),
    flake: num(raw.flake, 0.2),
    gloss: num(raw.gloss, 70),
    transparency: num(raw.transparency, 0),

    basecoat: raw.basecoat ?? null,
    clearcoat: raw.clearcoat ?? "High-Gloss",
    multi_angle:
      Array.isArray(raw.multi_angle) && raw.multi_angle.length
        ? raw.multi_angle
        : [{ angle: 45, lab }],

    code: raw.code || "—",
    name: raw.name || "İsimsiz",
  };
}
