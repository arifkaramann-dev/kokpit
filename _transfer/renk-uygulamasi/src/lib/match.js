// Eşleştirme motoru — taranan rengi katalogdaki Digital Paint Fingerprint'lere
// ΔE2000 mesafesine göre sıralar.

import { deltaE2000, faceAndFlop } from './color.js';

/**
 * @param {{l:number,a:number,b:number}} targetLab  Örneklenen (face) renk
 * @param {Array} paints  Katalog kayıtları
 * @param {{limit?:number, series?:string|null}} opts
 */
export function findClosest(targetLab, paints, { limit = 10, series = null } = {}) {
  const pool = series ? paints.filter((p) => p.series === series) : paints;

  return pool
    .map((paint) => {
      // Katalog kaydının face rengi üzerinden eşleştir — parlama açısı
      // farkları flop tarafında büyük sapma yaratır.
      const { face } = faceAndFlop(paint.multi_angle);
      const paintFace = face ? face.lab : paint.lab;
      const dE = deltaE2000(targetLab, paintFace);
      const dEBody = deltaE2000(targetLab, paint.lab);
      return { paint, deltaE: dE, deltaEBody: dEBody };
    })
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, limit);
}
