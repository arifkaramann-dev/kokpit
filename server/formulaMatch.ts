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

import { scaleForPackaging } from "./formulaBase";

export type Readiness = "konsantre" | "r2u";

export type MatchableFormula = {
  id: number;
  outputType: "yari_mamul" | "mamul";
  seriesId: number | null;
  colorId: number | null;
  familyId: number | null;
  readiness: Readiness | null;
  /**
   * Çoklu kapsam (formulaScopes). Bir eksende değer varsa TEK değerli
   * kolonun yerine geçer; boşsa kolon (o da boşsa "hepsi") kullanılır.
   */
  scopes?: {
    seri?: number[];
    renk?: number[];
    form?: number[];
    hazirlik?: Readiness[];
  };
  baseQty: number;
  /** `baseQty`nin birimi. Boşsa ml kabul edilir (eski kayıtlar). */
  baseUnit?: string | null;
};

export type MatchableMaster = {
  id: number;
  seriesId: number;
  colorId: number;
  familyId: number;
  readiness: Readiness;
  packagingVolumeMl: number;
  currentFormulaId: number | null;
  /**
   * Master'da yazılı ölçek. Reçetenin bazı değiştiğinde (500 ml → 1 lt) formül
   * bağı aynı kalır ama ölçek eskir; bunu bilmeden "zaten bağlı" deyip geçmek
   * ölçeği sonsuza kadar yanlış bırakırdı.
   */
  currentScale?: number | null;
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

    // Eksen kontrolü: çoklu kapsam varsa üyelik, yoksa tek değerli kolon,
    // o da boşsa eksen serbest ("hepsi").
    const axis = <T>(list: T[] | undefined, single: T | null, actual: T): boolean | null => {
      if (list && list.length > 0) return list.includes(actual);
      if (single !== null) return single === actual;
      return null; // serbest — puana katkı yok
    };

    let score = 0;
    let rejected = false;
    for (const hit of [
      axis(f.scopes?.seri, f.seriesId, master.seriesId),
      axis(f.scopes?.renk, f.colorId, master.colorId),
      axis(f.scopes?.form, f.familyId, master.familyId),
      axis(f.scopes?.hazirlik, f.readiness, master.readiness),
    ]) {
      if (hit === null) continue;
      if (!hit) {
        rejected = true;
        break;
      }
      score++;
    }
    if (rejected) continue;

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
 *
 * Baz BİRİMİ artık hesaba katılıyor (`scaleForPackaging`): "1 lt" bazlı bir
 * reçetede eskiden 250 / 1 = 250 ölçek çıkıyor ve maliyet 1000 katına
 * fırlıyordu. Şirket standardı 1 litre baz olduğu için doğru sonuç 0,25.
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
    const scale = scaleForPackaging(
      master.packagingVolumeMl,
      hit.formula.baseQty,
      hit.formula.baseUnit,
    );
    // Zaten aynı formüle AYNI ÖLÇEKLE bağlıysa yazma; ölçek kaymışsa düzelt.
    const scaleUnchanged =
      master.currentScale == null || Math.abs(master.currentScale - scale) < 1e-6;
    if (master.currentFormulaId === hit.formula.id && scaleUnchanged) continue;
    bindings.push({
      masterId: master.id,
      formulaId: hit.formula.id,
      formulaScale: scale,
      specificity: hit.specificity,
    });
  }

  return { bindings, unmatched };
}
