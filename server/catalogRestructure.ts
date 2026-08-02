/**
 * Katalog yeniden yapılandırma — ürün tipi eksenini düzeltir.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Katalog 300 varyanta şişmişti ve yarısı aynı şeyin kopyasıydı. Sebep tek bir
 * kavramın ÜÇ ayrı yerde yaşamasıydı:
 *
 *   1. `masterProducts.readiness` bayrağı (konsantre | r2u)
 *   2. "30 ml (ReadyToUse)" adlı ayrı bir AMBALAJ kaydı
 *   3. Ürün tipinde ise hiç yok
 *
 * Oysa R2U ürünün tipidir: "R2U Boya" ile "Boya" farklı sıvılardır, farklı
 * reçeteleri vardır. Buna karşılık "Airbrush Boya" ile "Boya" AYNI sıvıdır —
 * o bir ürün tipi değil, pazarlama kimliğidir (tıpkı Jant/Kask Boyası gibi).
 * Aynı şekilde rötuş de ayrı bir sıvı değil, kapağında fırça olan ayrı bir
 * ambalajdır.
 *
 * Bu modül hedef modeli mevcut veriyle karşılaştırıp FARKI çıkarır. Hiçbir şey
 * yazmaz; ne olacağını söyler. Uygulama kararı router'da ve kullanıcıdadır —
 * 165 kaydı arşivleyen bir işlem önizlemesiz çalıştırılmamalı.
 */

/** Türkçe güvenli ad eşleştirme: "R2U Boya" ≡ "r2u boya" ≡ "R2U  BOYA". */
export function normalizeName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[^a-zçğıöşü0-9]+/g, " ")
    .trim();
}

export type ExistingFamily = { id: number; name: string; isActive: boolean };
export type ExistingPackaging = { id: number; name: string; isActive: boolean };
export type ExistingMaster = {
  id: number;
  internalSku: string;
  familyId: number;
  packagingId: number;
  readiness: "konsantre" | "r2u";
  status: "taslak" | "aktif" | "arsiv";
};

/** Hedef ürün tipi ve o tipin satıldığı ambalajlar (adla verilir). */
export type TargetType = {
  name: string;
  skuSegment: string;
  packagingNames: string[];
};

export type RestructurePlan = {
  /** Hedefte olup katalogda bulunmayan ürün tipleri. */
  familiesToCreate: { name: string; skuSegment: string }[];
  /** Hedefte olmayan, pasife alınacak ürün tipleri (Airbrush, Rötuş…). */
  familiesToRetire: { id: number; name: string }[];
  /** Pasife alınacak ambalajlar — "(ReadyToUse)" gibi mükerrer kayıtlar. */
  packagingsToRetire: { id: number; name: string }[];
  /** Yazılacak form × ambalaj kuralı. Ad çözülemeyenler `missing`e düşer. */
  rules: { familyName: string; familyId: number | null; packagingIds: number[] }[];
  /** Hedefte adı geçip katalogda karşılığı olmayan ambalaj adları. */
  missingPackagingNames: string[];
  /** Yeni modele uymayan master'lar — arşivlenecek. */
  mastersToArchive: { id: number; internalSku: string; reason: string }[];
  summary: {
    mastersTotal: number;
    mastersKept: number;
    mastersArchived: number;
    /** Hedef modelin renk başına ürettiği SKU sayısı. */
    skuPerColor: number;
  };
};

/**
 * Mevcut katalogla hedef modeli karşılaştırır.
 *
 * Arşivleme ölçütü kasten GENİŞ: yeni modele birebir uymayan her master
 * arşivlenir. Silmez — arşiv geri alınabilir, silme değil. Katalogda hiç ilan
 * açılmamışken bile geçmişi olan kayıt bulunabilir; onu koparmak raporu bozar.
 */
export function planRestructure(input: {
  families: ExistingFamily[];
  packagings: ExistingPackaging[];
  masters: ExistingMaster[];
  target: TargetType[];
  /** Adında bunlardan biri geçen ambalaj pasife alınır (mükerrer kayıtlar). */
  retirePackagingPatterns?: string[];
}): RestructurePlan {
  const famByName = new Map(input.families.map(f => [normalizeName(f.name), f]));
  const packByName = new Map(input.packagings.map(p => [normalizeName(p.name), p]));
  const targetNames = new Set(input.target.map(t => normalizeName(t.name)));

  const familiesToCreate: RestructurePlan["familiesToCreate"] = [];
  for (const t of input.target) {
    if (!famByName.has(normalizeName(t.name))) {
      familiesToCreate.push({ name: t.name, skuSegment: t.skuSegment });
    }
  }

  // Hedefte olmayan aktif tipler pasife alınır: Airbrush artık pazarlama
  // kimliği, Rötuş artık ambalaj — ikisi de ürün tipi değil.
  const familiesToRetire = input.families
    .filter(f => f.isActive && !targetNames.has(normalizeName(f.name)))
    .map(f => ({ id: f.id, name: f.name }));

  const patterns = (input.retirePackagingPatterns ?? []).map(normalizeName).filter(Boolean);
  const packagingsToRetire = input.packagings
    .filter(p => p.isActive && patterns.some(pat => normalizeName(p.name).includes(pat)))
    .map(p => ({ id: p.id, name: p.name }));
  const retiredPackagingIds = new Set(packagingsToRetire.map(p => p.id));

  const rules: RestructurePlan["rules"] = [];
  const missingPackagingNames = new Set<string>();
  /** familyId → izinli ambalajlar; master denetimi bunu kullanır. */
  const allowedByFamilyId = new Map<number, Set<number>>();
  let skuPerColor = 0;

  for (const t of input.target) {
    const fam = famByName.get(normalizeName(t.name)) ?? null;
    const packagingIds: number[] = [];
    for (const name of t.packagingNames) {
      const p = packByName.get(normalizeName(name));
      if (!p) {
        missingPackagingNames.add(name);
        continue;
      }
      if (retiredPackagingIds.has(p.id)) continue;
      packagingIds.push(p.id);
    }
    skuPerColor += packagingIds.length;
    rules.push({ familyName: t.name, familyId: fam?.id ?? null, packagingIds });
    if (fam) allowedByFamilyId.set(fam.id, new Set(packagingIds));
  }

  const retiredFamilyIds = new Set(familiesToRetire.map(f => f.id));
  const mastersToArchive: RestructurePlan["mastersToArchive"] = [];

  for (const m of input.masters) {
    if (m.status === "arsiv") continue;
    const reasons: string[] = [];

    if (retiredFamilyIds.has(m.familyId)) reasons.push("Ürün tipi artık geçerli değil");
    if (retiredPackagingIds.has(m.packagingId)) reasons.push("Ambalaj mükerrer, pasife alındı");
    // R2U artık bir ürün tipi; bayrak olarak taşınan kayıtlar kopyadır.
    if (m.readiness === "r2u") reasons.push("R2U artık ürün tipi, bayrak değil");

    const allowed = allowedByFamilyId.get(m.familyId);
    if (allowed && !allowed.has(m.packagingId)) {
      reasons.push("Bu ürün tipi bu ambalajda satılmıyor");
    }

    if (reasons.length > 0) {
      mastersToArchive.push({ id: m.id, internalSku: m.internalSku, reason: reasons.join(" · ") });
    }
  }

  const active = input.masters.filter(m => m.status !== "arsiv").length;
  return {
    familiesToCreate,
    familiesToRetire,
    packagingsToRetire,
    rules,
    missingPackagingNames: Array.from(missingPackagingNames),
    mastersToArchive,
    summary: {
      mastersTotal: active,
      mastersKept: active - mastersToArchive.length,
      mastersArchived: mastersToArchive.length,
      skuPerColor,
    },
  };
}
