/**
 * Candy kat progresyonu — gümüş bazdan matematikle.
 *
 * ── Fizik ─────────────────────────────────────────────────────────────────
 * Candy boya iki katmandır: altta GÜMÜŞ METALİK BAZ (ayna gibi), üstünde
 * saydam renk katmanları. Işık saydam katmandan geçer, gümüşten yansır ve
 * katmandan bir kez daha geçer. Her ek kat, ışığın soğurulduğu yolu uzatır.
 *
 * Bu Beer-Lambert soğurmasıdır: N kat sonra geçirgenlik T^N. Yani renk
 * derinleşir, koyulaşır ve doygunlaşır — ama kanal başına FARKLI oranda,
 * çünkü fuşya bir katman yeşili kırmızıdan çok daha fazla soğurur. Hue
 * derinleşmesi buradan geliyor.
 *
 * ── Neden zaten renkli numuneden türetilemez ──────────────────────────────
 * Önceki uygulama katları, zaten hedef renkte olan bir numuneyi her katta
 * biraz daha karartarak üretiyordu. İki sorun: birinci kat asla gümüş
 * çıkamıyordu (numune baştan fuşyaydı) ve katlar rengi derinleştirmek yerine
 * siyaha götürüyordu.
 *
 * Doğrusu gümüş bazdan başlamak. Sözleşme:
 *   kat 1        → baz, olduğu gibi (gümüş gri)
 *   kat 2..N-1   → ara katlar, giderek doygunlaşan yarı saydam renk
 *   kat N        → hedef renk, tam doygun
 *
 * Geçirgenlik buna göre çözülür: T = (hedef / baz)^(1/(N-1)). Böylece son kat
 * matematik gereği hedefe oturur — "yaklaşık" değil, tam.
 *
 * ── Neden lineer ışıkta ───────────────────────────────────────────────────
 * Soğurma fiziksel bir çarpımdır ve sRGB gama uzayında çarpmak yanlış sonuç
 * verir: katlar olması gerekenden hızlı kararır. Hesap lineer uzayda yapılıp
 * sonuç gamaya geri çevriliyor.
 *
 * Saf modül: veritabanı, tarih, rastgelelik, tarayıcı API'si yok.
 */

import { delinearize, labToRgb, linearize, type Lab, type Rgb } from "./color";
import type { Raster } from "./recolor";

/** Bir kanalın en az geçirgenliği — 0 olursa kat tamamen siyaha düşerdi. */
const MIN_TRANSMITTANCE = 0.02;

/**
 * Parlamanın korunmaya başladığı lineer parlaklık.
 *
 * Gerçek candy'de clearcoat parlaması BOYANIN değil ışığın rengidir; orada
 * yüzey beyaza gider. Soğurmayı parlamaya da tam uygularsak kare cansız,
 * matlaşmış görünür.
 *
 * Eşik YÜKSEK tutuluyor: düşük bir eşik gövdenin aydınlık yarısını da
 * "parlama" sayıp boyasız bırakıyor ve numunenin ortasında kocaman beyaz bir
 * leke kalıyordu. Yalnız gerçek specular çekirdeği korunmalı.
 */
const SPECULAR_START = 0.9;

export type CoatOptions = {
  /** Toplam kat sayısı. Kat 1 baz, kat N hedef. */
  totalCoats?: number;
  /** Parlama koruması; 0 = kapalı (saf soğurma). */
  specularKeep?: number;
};

/**
 * Kanal başına tek kat geçirgenliğini çözer.
 *
 * @param baseLinear   gümüş bazın gövde rengi (lineer 0..1)
 * @param targetLinear hedef boyanın rengi (lineer 0..1)
 * @param steps        kaç kat uygulanarak hedefe varılacak (N-1)
 */
export function coatTransmittance(
  baseLinear: readonly [number, number, number],
  targetLinear: readonly [number, number, number],
  steps: number,
): [number, number, number] {
  const n = Math.max(1, steps);
  const solve = (target: number, base: number) => {
    if (base <= 1e-6) return 1;
    // Hedef bazdan parlaksa soğurma negatif olurdu; katman ışık ÜRETEMEZ,
    // o yüzden 1'de (hiç soğurmama) kesiliyor.
    const ratio = Math.min(1, target / base);
    return Math.max(MIN_TRANSMITTANCE, Math.pow(ratio, 1 / n));
  };
  return [
    solve(targetLinear[0], baseLinear[0]),
    solve(targetLinear[1], baseLinear[1]),
    solve(targetLinear[2], baseLinear[2]),
  ];
}

/** Lab → lineer RGB üçlüsü (0..1). */
export function labToLinear(lab: Lab): [number, number, number] {
  const rgb: Rgb = labToRgb(lab);
  return [linearize(rgb.r), linearize(rgb.g), linearize(rgb.b)];
}

/**
 * Gümüş baz görselinden N. katın görüntüsünü üretir. Girdi DEĞİŞTİRİLMEZ.
 *
 * @param src       gümüş baz numunesinin rasteri
 * @param mask      boya bölgesi (1 = boya)
 * @param baseLab   bazın ölçülmüş gövde rengi
 * @param targetLab hedef boyanın rengi (son katta ulaşılacak)
 * @param coat      hangi kat çizilecek — 1 = baz, totalCoats = hedef
 */
export function renderCoat(
  src: Raster,
  mask: Uint8Array,
  baseLab: Lab,
  targetLab: Lab,
  coat: number,
  { totalCoats = 3, specularKeep = 1 }: CoatOptions = {},
): Raster {
  const out: Raster = {
    data: new Uint8ClampedArray(src.data),
    width: src.width,
    height: src.height,
  };

  const steps = Math.max(1, totalCoats - 1);
  const layer = Math.max(0, Math.min(steps, Math.round(coat) - 1));
  // Kat 1 baz: hiç katman yok, görsele dokunulmaz.
  if (layer === 0) return out;

  const t = coatTransmittance(labToLinear(baseLab), labToLinear(targetLab), steps);
  const gain: [number, number, number] = [
    Math.pow(t[0], layer),
    Math.pow(t[1], layer),
    Math.pow(t[2], layer),
  ];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;

    const lin = [
      linearize(src.data[p]),
      linearize(src.data[p + 1]),
      linearize(src.data[p + 2]),
    ];

    // Parlama koruması: piksel ne kadar parlaksa soğurma o kadar az uygulanır.
    // Clearcoat parlaması ışığın rengidir, boyanın değil.
    const luma = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const spec =
      specularKeep <= 0
        ? 0
        : specularKeep * Math.max(0, Math.min(1, (luma - SPECULAR_START) / (1 - SPECULAR_START)));

    for (let c = 0; c < 3; c += 1) {
      const absorbed = lin[c] * gain[c];
      out.data[p + c] = delinearize(absorbed + (lin[c] - absorbed) * spec);
    }
  }

  return out;
}
