/**
 * Reçete & ambalaj sağlık denetimi — "fiyat neden saçma çıkıyor?"nun cevabı.
 *
 * Maliyet motoru doğru çalışıyor ama VERİ yanlış olduğunda sonuç sessizce
 * saçmalıyor ve kullanıcı hatayı ancak fiyat listesine bakınca fark ediyor.
 * Bu modül maliyeti bozan bilinen veri hatalarını isimleriyle listeler ve her
 * biri için ne yapılacağını söyler.
 *
 * Yakalanan hatalar:
 *
 * 1. `ambalaj_recetede` — şişe/kapak/etiket reçeteye konmuş. Reçete satırları
 *    ambalaj HACMİYLE ölçeklenir: 1 lt bazlı reçeteye "1 adet şişe" yazarsanız
 *    250 ml ürün 0,25 şişe, 5 lt ürün 5 şişe sayar. Ambalaj kalemleri hacimle
 *    ölçeklenmez; yerleri ambalaj tanımıdır.
 * 2. `baz_litre_degil` — reçete 1 litre bazında değil. Ölçek = ambalaj hacmi /
 *    baz olduğundan 500 ml bazlı reçetede 250 ml ürün 0,5 çıkar; şirket
 *    defteri 1 litre için yazıldığı sürece doğrusu 0,25'tir.
 * 3. `olcek_eskimis` — master'daki ölçek reçetenin güncel bazıyla uyuşmuyor
 *    (reçete düzenlendi ama ürünler yeniden bağlanmadı).
 * 4. `ambalaj_hacimsiz` — ambalaj adında hacim yazıyor ama `volumeMl` boş;
 *    ölçek 1 kalır, 30 ml ile 5 lt aynı maliyeti alır.
 * 5. `ambalaj_maliyetsiz` — kullanılan ambalajın adet maliyeti 0; kâr hesabı
 *    ambalajı hiç görmüyor.
 * 6. `birim_uyusmuyor` — satırın birimi kalemin birimine çevrilemiyor.
 *
 * Saf modül — veritabanı yok, test edilebilir.
 */

import { qtyInMaterialUnit } from "@shared/units";
import { BASE_VOLUME_ML, baseInMl, scaleForPackaging } from "./formulaBase";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type AuditMaterial = {
  id: number;
  name: string;
  type: "hammadde" | "yari_mamul" | "ambalaj" | "masraf";
  unit?: string | null;
  unitCost?: number | string | null;
};

export type AuditFormula = {
  id: number;
  name: string;
  outputType: "yari_mamul" | "mamul";
  baseQty: number | string;
  baseUnit?: string | null;
  inputs: { inputMaterialId: number; qtyPerBase: number | string; unit?: string | null }[];
};

export type AuditPackaging = {
  id: number;
  name: string;
  volumeMl: number | string;
  isActive?: boolean;
  /** Ana kap + ek kalemlerden hesaplanmış adet maliyeti. */
  unitCost: number;
};

export type AuditMaster = {
  id: number;
  internalSku?: string | null;
  formulaId: number | null;
  formulaScale: number | string | null;
  packagingId: number | null;
  status?: string | null;
};

export type AuditIssueKind =
  | "ambalaj_recetede"
  | "baz_litre_degil"
  | "olcek_eskimis"
  | "ambalaj_hacimsiz"
  | "ambalaj_maliyetsiz"
  | "birim_uyusmuyor";

export type AuditIssue = {
  kind: AuditIssueKind;
  severity: "yuksek" | "orta";
  /** Kullanıcıya gösterilecek tek cümlelik teşhis. */
  message: string;
  formulaId?: number;
  packagingId?: number;
  materialId?: number;
  /** Etkilenen master sayısı — önceliklendirme için. */
  affectedMasters: number;
};

export type RecipeAuditResult = {
  issues: AuditIssue[];
  counts: Record<AuditIssueKind, number>;
};

/** "100 ML PET", "SPREY 400ML", "5 LT BİDON" gibi adlardan hacim çıkarır. */
export function volumeFromName(name: string): number | null {
  const m = String(name).match(/(\d+(?:[.,]\d+)?)\s*(ml|ml\b|cc|lt|l|litre)\b/i);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = m[2].toLowerCase();
  return unit === "lt" || unit === "l" || unit === "litre" ? qty * 1000 : qty;
}

export function auditRecipes(input: {
  formulas: AuditFormula[];
  materials: AuditMaterial[];
  packagings: AuditPackaging[];
  masters: AuditMaster[];
  targetBaseMl?: number;
}): RecipeAuditResult {
  const target = input.targetBaseMl ?? BASE_VOLUME_ML;
  const materialById = new Map(input.materials.map(m => [m.id, m]));
  const formulaById = new Map(input.formulas.map(f => [f.id, f]));
  const packById = new Map(input.packagings.map(p => [p.id, p]));

  // Arşivlenmiş master'lar hatayı büyütmesin: satılmayan ürün için uyarı gürültüdür.
  const liveMasters = input.masters.filter(m => m.status !== "arsiv");

  const mastersByFormula = new Map<number, AuditMaster[]>();
  const mastersByPackaging = new Map<number, AuditMaster[]>();
  for (const m of liveMasters) {
    if (m.formulaId != null) {
      mastersByFormula.set(m.formulaId, [...(mastersByFormula.get(m.formulaId) ?? []), m]);
    }
    if (m.packagingId != null) {
      mastersByPackaging.set(m.packagingId, [...(mastersByPackaging.get(m.packagingId) ?? []), m]);
    }
  }

  const issues: AuditIssue[] = [];

  for (const f of input.formulas) {
    const affected = mastersByFormula.get(f.id)?.length ?? 0;

    // 1) Ambalaj kalemi reçetede — hacimle ölçeklenip maliyeti bozuyor.
    for (const line of f.inputs) {
      const mat = materialById.get(line.inputMaterialId);
      if (mat?.type === "ambalaj") {
        issues.push({
          kind: "ambalaj_recetede",
          severity: "yuksek",
          message: `"${f.name}" reçetesinde ambalaj kalemi var: ${mat.name}. Reçete satırları ambalaj hacmiyle ölçeklenir, ambalaj ölçeklenmemeli — bu kalemi ambalaj tanımına taşıyın.`,
          formulaId: f.id,
          materialId: mat.id,
          affectedMasters: affected,
        });
      }
      // 6) Birim çevrilemiyor: sayı olduğu gibi kullanılıyor, maliyet güvenilmez.
      if (mat && mat.type !== "masraf") {
        const conv = qtyInMaterialUnit(num(line.qtyPerBase), line.unit, mat.unit);
        if (conv.mismatch) {
          issues.push({
            kind: "birim_uyusmuyor",
            severity: "yuksek",
            message: `"${f.name}" reçetesinde ${mat.name} satırının birimi (${String(line.unit ?? "?")}) kalemin birimine (${String(mat.unit ?? "?")}) çevrilemiyor — maliyet bu satır için güvenilmez.`,
            formulaId: f.id,
            materialId: mat.id,
            affectedMasters: affected,
          });
        }
      }
    }

    // 2) Baz 1 litre değil.
    if (f.outputType === "mamul") {
      const ml = baseInMl(f.baseQty, f.baseUnit);
      if (ml == null) {
        issues.push({
          kind: "baz_litre_degil",
          severity: "orta",
          message: `"${f.name}" reçetesinin bazı hacimsel değil (${num(f.baseQty)} ${String(f.baseUnit ?? "?")}) — ambalaj hacmine göre ölçeklenemiyor, her boyda 1 kat uygulanıyor.`,
          formulaId: f.id,
          affectedMasters: affected,
        });
      } else if (Math.abs(ml - target) > 1e-9) {
        issues.push({
          kind: "baz_litre_degil",
          severity: "yuksek",
          message: `"${f.name}" reçetesi ${num(f.baseQty)} ${String(f.baseUnit ?? "ml")} bazlı (${ml} ml). Reçeteler 1 litre için yazılmalı — bu yüzden 250 ml ürün ${(250 / ml).toString().replace(".", ",")} ölçek alıyor, doğrusu 0,25.`,
          formulaId: f.id,
          affectedMasters: affected,
        });
      }
    }
  }

  // 3) Master ölçeği reçetenin güncel bazıyla uyumsuz.
  for (const m of liveMasters) {
    if (m.formulaId == null) continue;
    const f = formulaById.get(m.formulaId);
    const pack = m.packagingId != null ? packById.get(m.packagingId) : undefined;
    if (!f || !pack) continue;
    const expected = scaleForPackaging(pack.volumeMl, f.baseQty, f.baseUnit);
    const actual = num(m.formulaScale) || 1;
    if (Math.abs(expected - actual) > 1e-4) {
      issues.push({
        kind: "olcek_eskimis",
        severity: "yuksek",
        message: `${m.internalSku || `#${m.id}`} ürününde ölçek ${actual} yazıyor ama reçete bazına göre ${Math.round(expected * 10000) / 10000} olmalı — "Reçeteleri Bağla" ile tazeleyin.`,
        formulaId: f.id,
        packagingId: pack.id,
        affectedMasters: 1,
      });
    }
  }

  // 4-5) Ambalaj tanımı hataları — yalnız kullanılan ambalajlar için.
  for (const p of input.packagings) {
    const used = mastersByPackaging.get(p.id)?.length ?? 0;
    if (used === 0) continue;
    const volume = num(p.volumeMl);
    if (volume <= 0) {
      const guess = volumeFromName(p.name);
      if (guess != null) {
        issues.push({
          kind: "ambalaj_hacimsiz",
          severity: "yuksek",
          message: `"${p.name}" ambalajının hacmi girilmemiş (adından ${guess} ml görünüyor). Hacimsiz ambalajda reçete ölçeği 1 kalır — 30 ml ile 1 lt aynı boya maliyetini alır.`,
          packagingId: p.id,
          affectedMasters: used,
        });
      }
    }
    if (p.unitCost <= 0) {
      issues.push({
        kind: "ambalaj_maliyetsiz",
        severity: "orta",
        message: `"${p.name}" ambalajının adet maliyeti 0 — şişe/kapak/etiket kâr hesabına girmiyor.`,
        packagingId: p.id,
        affectedMasters: used,
      });
    }
  }

  const counts = {
    ambalaj_recetede: 0,
    baz_litre_degil: 0,
    olcek_eskimis: 0,
    ambalaj_hacimsiz: 0,
    ambalaj_maliyetsiz: 0,
    birim_uyusmuyor: 0,
  } as Record<AuditIssueKind, number>;
  for (const i of issues) counts[i.kind] += 1;

  // Önce çok ürünü etkileyen yüksek önem: kullanıcı listenin başından
  // başlayınca en çok parayı en hızlı düzeltir.
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "yuksek" ? -1 : 1;
    return b.affectedMasters - a.affectedMasters;
  });

  return { issues, counts };
}
