/**
 * Master denetimi — bugünkü kurallara UYMAYAN ürünleri bulur.
 *
 * Uyumluluk kuralları zamanla sıkılaştı: form × ambalaj kısıtı sonradan
 * geldi, seri × renk bağı sonradan geldi, ambalaj pasife alınabilir oldu.
 * Kural değişince ÖNCE üretilmiş master'lar yerinde kalıyor: "Sprey · 100 ml"
 * gibi hiç var olmayan bir ürün katalogda duruyor, listeyi ve raporları
 * kirletiyor.
 *
 * Bu modül ihlalleri SEBEBİYLE birlikte bulur. Silme kararı çağıranın (ve
 * kullanıcının) — burada yalnızca tespit var.
 *
 * Saf modül: veritabanı yok, test edilebilir.
 */

export type AuditMaster = {
  id: number;
  internalSku: string;
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  readiness: "konsantre" | "r2u";
  status: "taslak" | "aktif" | "arsiv";
};

export type AuditRules = {
  /** seriId → izinli ambalajlar (seriesPackagings). Boşsa kısıt yok. */
  seriesPackagings: Map<number, Set<number>>;
  /** seriId → izinli formlar (seriesFamilies). Boşsa kısıt yok. */
  seriesFamilies: Map<number, Set<number>>;
  /** seriId → izinli renkler (seriesColors). Boşsa kısıt yok. */
  seriesColors: Map<number, Set<number>>;
  /** formId → izinli ambalajlar (familyPackagings). Boşsa kısıt yok. */
  familyPackagings: Map<number, Set<number>>;
  /** Pasife alınmış boyut kimlikleri. */
  inactiveColors: Set<number>;
  inactiveFamilies: Set<number>;
  inactivePackagings: Set<number>;
};

export type Violation = {
  masterId: number;
  internalSku: string;
  /** Neden geçersiz — kullanıcıya olduğu gibi gösterilir. */
  reasons: string[];
  /** Satış/ilan geçmişi var mı — silinemez, yalnız arşivlenir. */
  hasHistory: boolean;
};

const allowed = (map: Map<number, Set<number>>, key: number, value: number): boolean => {
  const set = map.get(key);
  // Kısıt tanımlı değilse serbest — geçiş dönemindeki seriler engellenmesin.
  if (!set || set.size === 0) return true;
  return set.has(value);
};

/**
 * Bugünkü kurallara uymayan master'ları bulur.
 *
 * `historyIds` ilanı ya da satışı olan master'lar; onlar silinmez, arşivlenir.
 * Geçmişi silmek satış raporunu ve pazaryeri eşleşmesini bozardı.
 */
export function findInvalidMasters(input: {
  masters: AuditMaster[];
  rules: AuditRules;
  historyIds: Set<number>;
  /** Arşivdekiler zaten devre dışı; denetime girmez. */
  includeArchived?: boolean;
}): Violation[] {
  const { rules } = input;
  const out: Violation[] = [];

  for (const m of input.masters) {
    if (m.status === "arsiv" && !input.includeArchived) continue;
    const reasons: string[] = [];

    if (!allowed(rules.familyPackagings, m.familyId, m.packagingId)) {
      reasons.push("bu form bu ambalajla üretilmiyor");
    }
    if (!allowed(rules.seriesPackagings, m.seriesId, m.packagingId)) {
      reasons.push("bu seri bu ambalajı kullanmıyor");
    }
    if (!allowed(rules.seriesFamilies, m.seriesId, m.familyId)) {
      reasons.push("bu seri bu formu kullanmıyor");
    }
    if (!allowed(rules.seriesColors, m.seriesId, m.colorId)) {
      reasons.push("bu renk bu seriye ait değil");
    }
    if (rules.inactivePackagings.has(m.packagingId)) reasons.push("ambalaj pasif");
    if (rules.inactiveColors.has(m.colorId)) reasons.push("renk pasif");
    if (rules.inactiveFamilies.has(m.familyId)) reasons.push("form pasif");

    if (reasons.length > 0) {
      out.push({
        masterId: m.id,
        internalSku: m.internalSku,
        reasons,
        hasHistory: input.historyIds.has(m.id),
      });
    }
  }

  return out;
}

export type CleanupPlan = {
  /** Geçmişi yok → güvenle silinebilir. */
  deletable: Violation[];
  /** İlanı/satışı var → yalnız arşivlenir. */
  archivable: Violation[];
  /** Sebep başına sayım — kullanıcı neyin yanlış olduğunu bir bakışta görsün. */
  byReason: { reason: string; count: number }[];
};

/** İhlalleri silinebilir / arşivlenebilir diye ayırır ve sebeplerini sayar. */
export function planCleanup(violations: Violation[]): CleanupPlan {
  const counts = new Map<string, number>();
  for (const v of violations) {
    for (const r of v.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return {
    deletable: violations.filter(v => !v.hasHistory),
    archivable: violations.filter(v => v.hasHistory),
    byReason: Array.from(counts, ([reason, count]) => ({ reason, count })).sort(
      (a, b) => b.count - a.count,
    ),
  };
}
