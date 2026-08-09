/**
 * Eşleştirme motoru — bir rengi katalogdaki boyalara ΔE2000 mesafesine göre
 * sıralar. "Elimizde bu renge en yakın hangi ürün var?" sorusunun cevabı.
 *
 * Saf modül: hem sunucuda (tRPC üzerinden sorgu) hem istemcide (anlık
 * önizleme) aynı sıralamayı üretir. Aynı soruya iki farklı cevap veren bir
 * eşleştirici, cevabın kendisinden daha zararlıdır.
 */

import { deltaE2000, faceAndFlop, type Lab } from "./color";
import type { Paint } from "./paint";

export type MatchResult = {
  paint: Paint;
  /** Face rengine göre fark — sıralama bunun üzerinden yapılır. */
  deltaE: number;
  /** Kaydın gövde (ortalama) rengine göre fark; teşhis için. */
  deltaEBody: number;
};

export type MatchOptions = {
  limit?: number;
  /** Verilirse yalnız o seriden eşleşme döner. */
  series?: string | null;
};

/**
 * En yakın boyaları sıralar.
 *
 * Eşleştirme kaydın FACE (en parlak açı) rengi üzerinden yapılır. Sebep:
 * metalik boyada pulcuk yönelimi flop tarafında büyük sapma yaratır; iki
 * boya face'te neredeyse aynı, flop'ta çok farklı olabilir. Kullanıcının
 * "bu renk mi" diye baktığı yer face'tir, karşılaştırma da orada olmalı.
 *
 * `deltaEBody` yine de dönüyor — face ile gövde arasındaki fark büyükse
 * kaydın çok açılı profili şüphelidir, teşhiste işe yarar.
 */
export function findClosest(
  targetLab: Lab,
  paints: readonly Paint[],
  { limit = 10, series = null }: MatchOptions = {},
): MatchResult[] {
  const pool = series ? paints.filter(p => p.series === series) : paints;

  return pool
    .map(paint => {
      const { face } = faceAndFlop(paint.multi_angle);
      const paintFace = face ? face.lab : paint.lab;
      return {
        paint,
        deltaE: deltaE2000(targetLab, paintFace),
        deltaEBody: deltaE2000(targetLab, paint.lab),
      };
    })
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, limit);
}
