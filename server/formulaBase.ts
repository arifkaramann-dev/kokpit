/**
 * Reçete baz hacmi — "reçetelerimiz 1 litreliktir" kuralının kod karşılığı.
 *
 * ── Sorun ─────────────────────────────────────────────────────────────────
 * Master'ın ambalaj hacmi reçete bazına BÖLÜNEREK ölçek çıkarılıyor
 * (`formulaScale = ambalajHacmi / bazMiktar`). Reçeteler 500 ml bazlı
 * yazıldığında 250 ml ürün 0,5 · 100 ml ürün 0,2 ölçek alıyordu: rakamlar
 * kendi içinde tutarlı ama şirketin reçete defteriyle uyumsuz. Defterde
 * "1 litre için şu kadar" yazıyorsa 250 ml ürünün ölçeği 0,25 olmalı.
 *
 * Üstelik baz birimi hesaba KATILMIYORDU: `1 lt` bazlı bir reçetede
 * 250 / 1 = 250 ölçek çıkıyordu — 1000 katlık sessiz maliyet hatası.
 * `baseInMl` bu iki sorunu birden kapatır.
 *
 * ── Çözüm ─────────────────────────────────────────────────────────────────
 * `planBaseNormalization` reçeteyi 1 litre bazına ÇEVİRİR: baz miktarı ve tüm
 * girdi miktarları aynı çarpanla ölçeklenir. Oran korunduğu için birim maliyet
 * değişmez — değişen tek şey defterin okunabilirliği ve ambalaj ölçeğinin
 * doğru çıkması.
 *
 * Hacimsel olmayan bazlar (gr/kg ile yazılmış reçeteler) ÇEVRİLMEZ: ml ile
 * gram arasında yoğunluk bilgisi olmadan dönüşüm uydurmak olur. Onlar
 * `skipped` olarak raporlanır ve kullanıcı görür.
 *
 * Saf modül — veritabanı yok, test edilebilir.
 */

import { convertQty, unitFamily } from "@shared/units";

/** Şirket standardı: reçeteler 1 litre (1000 ml) için yazılır. */
export const BASE_VOLUME_ML = 1000;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type BaseFormulaInput = {
  id: number;
  inputMaterialId: number;
  qtyPerBase: number | string;
  unit?: string | null;
};

export type BaseFormula = {
  id: number;
  name: string;
  outputType: "yari_mamul" | "mamul";
  baseQty: number | string;
  baseUnit?: string | null;
  inputs: BaseFormulaInput[];
};

/**
 * Reçete bazının mililitre karşılığı; baz hacimsel değilse `null`.
 *
 * Birim boşsa ml varsayılır — eski kayıtlar baz birimi yazmadan `1000` girmiş
 * durumda ve onları "bilinmiyor" saymak çalışan reçeteleri bozardı.
 */
export function baseInMl(baseQty: unknown, baseUnit: unknown): number | null {
  const qty = num(baseQty);
  if (qty <= 0) return null;
  const raw = String(baseUnit ?? "").trim();
  if (!raw) return qty; // birimsiz eski kayıt: ml kabul
  if (unitFamily(raw) !== "hacim") return null;
  return convertQty(qty, raw, "ml");
}

/**
 * Ambalaj hacminden reçete ölçeği.
 *
 * Hacimsiz ambalajda (rötuş kutusu, set) ve hacimsel olmayan reçetede ölçek 1
 * kalır: bilmediğimiz bir katsayı uydurmaktansa reçeteyi bir kez uygulamak
 * daha az yanlıştır ve hata görünür kalır.
 */
export function scaleForPackaging(
  packagingVolumeMl: unknown,
  baseQty: unknown,
  baseUnit: unknown,
): number {
  const volume = num(packagingVolumeMl);
  if (volume <= 0) return 1;
  const base = baseInMl(baseQty, baseUnit);
  if (base == null || base <= 0) return 1;
  return volume / base;
}

export type BaseChange = {
  formulaId: number;
  name: string;
  fromQty: number;
  fromUnit: string;
  toQty: number;
  toUnit: "ml";
  /** Girdi miktarlarının çarpılacağı katsayı. */
  factor: number;
  inputs: { id: number; from: number; to: number }[];
};

export type BaseNormalizationPlan = {
  changes: BaseChange[];
  /** Zaten hedef bazda olan reçeteler. */
  alreadyOk: number[];
  /** Hacimsel olmayan baz — elle düzeltilmeli. */
  skipped: { formulaId: number; name: string; reason: string }[];
};

/**
 * Reçeteleri hedef hacim bazına (varsayılan 1 lt) çeviren planı üretir.
 *
 * Yalnız MAMUL reçeteleri çevrilir: yarı mamul reçetesinin bazı çıktının
 * stok birimiyle ilişkilidir (`resolveUnitCosts` onu kendi birimine indirger),
 * oraya 1 litre dayatmak yarı mamul birim maliyetini bozar.
 */
export function planBaseNormalization(
  formulas: BaseFormula[],
  targetMl: number = BASE_VOLUME_ML,
): BaseNormalizationPlan {
  const plan: BaseNormalizationPlan = { changes: [], alreadyOk: [], skipped: [] };
  if (!(targetMl > 0)) return plan;

  for (const f of formulas) {
    if (f.outputType !== "mamul") continue;
    const currentMl = baseInMl(f.baseQty, f.baseUnit);
    if (currentMl == null || currentMl <= 0) {
      plan.skipped.push({
        formulaId: f.id,
        name: f.name,
        reason: `baz hacimsel değil (${num(f.baseQty)} ${String(f.baseUnit ?? "").trim() || "?"}) — litre bazına çevrilemez`,
      });
      continue;
    }
    // Zaten 1 litre: hem miktar hem birim doğruysa dokunma.
    if (Math.abs(currentMl - targetMl) < 1e-9 && num(f.baseQty) === targetMl) {
      plan.alreadyOk.push(f.id);
      continue;
    }
    const factor = targetMl / currentMl;
    plan.changes.push({
      formulaId: f.id,
      name: f.name,
      fromQty: num(f.baseQty),
      fromUnit: String(f.baseUnit ?? "ml").trim() || "ml",
      toQty: targetMl,
      toUnit: "ml",
      factor,
      inputs: f.inputs.map(i => ({
        id: i.id,
        from: num(i.qtyPerBase),
        // 4 ondalık: reçete satırları gram/ml düzeyinde, daha fazlası gürültü.
        to: Math.round(num(i.qtyPerBase) * factor * 10000) / 10000,
      })),
    });
  }

  return plan;
}
