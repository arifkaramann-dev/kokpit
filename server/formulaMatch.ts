/**
 * Master ↔ formül eşleştirme.
 *
 * 5.000 master'ı tek tek reçeteye elle bağlamak gerçekçi değil. Formüller
 * koordinatın bir KISMINI tanımlar; boş bırakılan eksen "hepsi" demektir:
 *
 *   seri=CANDY, renk=∅, form=airbrush   → CANDY'nin tüm renkleri, airbrush
 *   seri=CANDY, renk=Red, form=∅        → yalnız Candy Red, her formda
 *   seri=∅,     renk=∅,   form=sprey    → tüm serilerin sprey formu
 *
 * Bir master'a birden çok formül uyabilir; EN ÖZEL olan kazanır. Böylece genel
 * bir seri reçetesi yazıp yalnız birkaç rengi özelleştirebilirsiniz — mirasın
 * kopyalama yerine çözümleme ile yapılmasının reçete tarafındaki karşılığı.
 */

export type Readiness = "konsantre" | "r2u";

export type MatchableFormula = {
  id: number;
  outputType: "yari_mamul" | "mamul";
  seriesId: number | null;
  colorId: number | null;
  familyId: number | null;
  readiness: Readiness | null;
  baseQty: number;
};

export type MatchableMaster = {
  id: number;
  seriesId: number;
  colorId: number;
  familyId: number;
  readiness: Readiness;
  packagingVolumeMl: number;
  currentFormulaId: number | null;
};

export type FormulaBinding = {
  masterId: number;
  formulaId: number;
  formulaScale: number;
  /** Kaç eksende birebir eşleşti (özgüllük) — teşhis için. */
  specificity: number;
};

/**
 * Tek bir master için en uygun formülü seçer.
 * Dolu eksen eşleşmezse formül elenir; boş eksen her değere uyar.
 * Puan = birebir eşleşen eksen sayısı; eşitlikte küçük id (önce tanımlanan).
 */
export function matchFormula(
  master: MatchableMaster,
  formulas: MatchableFormula[],
): { formula: MatchableFormula; specificity: number } | null {
  let best: { formula: MatchableFormula; specificity: number } | null = null;

  for (const f of formulas) {
    // Yalnız mamul reçeteleri master'a bağlanır; yarı mamul reçeteleri
    // BOM'un ara katmanıdır, ürüne doğrudan bağlanmaz.
    if (f.outputType !== "mamul") continue;

    let score = 0;
    if (f.seriesId !== null) {
      if (f.seriesId !== master.seriesId) continue;
      score++;
    }
    if (f.colorId !== null) {
      if (f.colorId !== master.colorId) continue;
      score++;
    }
    if (f.familyId !== null) {
      if (f.familyId !== master.familyId) continue;
      score++;
    }
    if (f.readiness !== null) {
      if (f.readiness !== master.readiness) continue;
      score++;
    }

    if (!best || score > best.specificity || (score === best.specificity && f.id < best.formula.id)) {
      best = { formula: f, specificity: score };
    }
  }

  return best;
}

/**
 * Tüm master'lar için bağlama planı üretir.
 *
 * `formulaScale` = ambalaj hacmi / reçete baz hacmi. Reçete baz hacim için
 * yazıldığından tek reçete tüm boyutları besler; ölçek burada hesaplanır.
 * Hacimsiz ambalajlarda (rötuş kutusu) ölçek 1 kalır.
 */
export function planFormulaBindings(input: {
  masters: MatchableMaster[];
  formulas: MatchableFormula[];
  /** true: zaten formülü olan master'lar da yeniden bağlanır. */
  rebindExisting?: boolean;
}): { bindings: FormulaBinding[]; unmatched: number[] } {
  const bindings: FormulaBinding[] = [];
  const unmatched: number[] = [];

  for (const master of input.masters) {
    if (!input.rebindExisting && master.currentFormulaId != null) continue;
    const hit = matchFormula(master, input.formulas);
    if (!hit) {
      unmatched.push(master.id);
      continue;
    }
    const base = hit.formula.baseQty > 0 ? hit.formula.baseQty : 1;
    const scale = master.packagingVolumeMl > 0 ? master.packagingVolumeMl / base : 1;
    // Zaten aynı formüle aynı ölçekle bağlıysa yazma.
    if (master.currentFormulaId === hit.formula.id) continue;
    bindings.push({
      masterId: master.id,
      formulaId: hit.formula.id,
      formulaScale: scale,
      specificity: hit.specificity,
    });
  }

  return { bindings, unmatched };
}
