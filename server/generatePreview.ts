/**
 * Üretim önizlemesi — "ne çıkacağını göremeden üretiyorum" sorununun cevabı.
 *
 * ── Neden gerekti ─────────────────────────────────────────────────────────
 * `generateMasters` zaten `dryRun` destekliyordu ama geriye yalnız bir sayı
 * ve 20 tane iç SKU dönüyordu: `aoccndyesilab30`. Bu diziden "Sprey · 30 ml"
 * kombinasyonunun saçma olduğunu görmek imkânsız. Kullanıcı önizlemeye bakıp
 * onaylıyor, sonra katalogda 36 varyantın 26'sının çöp olduğunu fark ediyordu.
 *
 * Form × ambalaj kısıtı (`familyPackagings`) sistemde vardı ve üretim onu
 * uyguluyordu — ama TANIMSIZ bir form serinin BÜTÜN ambalajlarıyla eşleşir.
 * Sprey için kural hiç girilmediğinden sprey 30/100/250 ml de üretiyordu.
 * Kuralın var olması yetmiyor; kullanıcının onu girmesi gereken anı sistemin
 * söylemesi gerekiyor. O an, üretimden hemen önceki bu önizlemedir.
 *
 * Saf modül: veritabanı gerektirmez.
 */

import { looksLikeSpray } from "./catalogCodes";

export type PreviewFamily = { id: number; name: string | null };
export type PreviewPackaging = { id: number; name: string | null; volumeMl: number };

export type PreviewItem = {
  familyId: number;
  packagingId: number;
  familyName: string;
  packagingName: string;
};

/** Kuralsız kaldığı için üretilen, gözle bakınca yanlış görünen çift. */
export type SuspectPair = {
  familyId: number;
  packagingId: number;
  familyName: string;
  packagingName: string;
  reason: string;
};

export type PreviewReport = {
  /** Üretilecek form × ambalaj çiftleri (renkten bağımsız, tekilleştirilmiş). */
  pairs: PreviewItem[];
  /** Şüpheli çiftler — üretim engellenmez, yalnız uyarılır. */
  suspects: SuspectPair[];
  /** formId → o form için kural tanımlı mı. Tanımsızsa "hepsi" demektir. */
  unconstrainedFamilies: { familyId: number; familyName: string; packagingCount: number }[];
};

/**
 * Sprey ambalajı mı? Ad "sprey/aerosol" içeriyorsa ya da hacmi tipik aerosol
 * kutusu ölçüsündeyse (300–500 ml) sprey sayılır.
 *
 * Hacim eşiği sezgiseldir ve kasten geniş: amaç kesin sınıflandırma değil,
 * kullanıcıya "şuna bir bak" demek. Yanlış pozitif, sessizce 26 çöp varyant
 * üretmekten ucuzdur.
 */
function isSprayPackaging(p: PreviewPackaging): boolean {
  if (looksLikeSpray(p.name)) return true;
  return p.volumeMl >= 300 && p.volumeMl <= 500;
}

/**
 * Üretilecek form×ambalaj çiftlerini çıkarır ve şüphelileri işaretler.
 *
 * Kural: sprey FORMU yalnız sprey AMBALAJIYLA gider; sprey olmayan bir form
 * sprey kutusuna girmez. İkisi de sık yapılan ve pahalı olan hatadır çünkü
 * ortaya çıkan varyant hiç satılamaz ama katalogda, raporda ve iş listesinde
 * yer kaplar.
 */
export function previewPairs(input: {
  families: PreviewFamily[];
  packagings: PreviewPackaging[];
  /** formId → izinli ambalajlar. Giriş yoksa o form tüm ambalajlarla eşleşir. */
  familyPackagings?: Map<number, Set<number>>;
}): PreviewReport {
  const pairs: PreviewItem[] = [];
  const suspects: SuspectPair[] = [];
  const unconstrained: PreviewReport["unconstrainedFamilies"] = [];

  for (const family of input.families) {
    const allowed = input.familyPackagings?.get(family.id);
    const list =
      allowed && allowed.size > 0
        ? input.packagings.filter(p => allowed.has(p.id))
        : input.packagings;

    if (!allowed || allowed.size === 0) {
      unconstrained.push({
        familyId: family.id,
        familyName: family.name ?? `#${family.id}`,
        packagingCount: list.length,
      });
    }

    const familyIsSpray = looksLikeSpray(family.name);

    for (const p of list) {
      const item: PreviewItem = {
        familyId: family.id,
        packagingId: p.id,
        familyName: family.name ?? `#${family.id}`,
        packagingName: p.name ?? `#${p.id}`,
      };
      pairs.push(item);

      const packIsSpray = isSprayPackaging(p);
      if (familyIsSpray && !packIsSpray) {
        suspects.push({
          ...item,
          reason: "Sprey formu sprey olmayan ambalajla eşleşmiş",
        });
      } else if (!familyIsSpray && packIsSpray) {
        suspects.push({
          ...item,
          reason: "Sprey ambalajı sprey olmayan formla eşleşmiş",
        });
      }
    }
  }

  return { pairs, suspects, unconstrainedFamilies: unconstrained };
}

/**
 * Şüpheli çiftlerden yola çıkarak her form için önerilen ambalaj kümesini
 * üretir — kullanıcı tek tıkla kuralı yazabilsin diye.
 *
 * Öneri, o formun ŞÜPHELİ OLMAYAN ambalajlarıdır: sprey formu için sprey
 * kutuları, diğer formlar için sprey dışı ambalajlar.
 */
export function suggestFamilyPackagings(input: {
  families: PreviewFamily[];
  packagings: PreviewPackaging[];
}): { familyId: number; familyName: string; packagingIds: number[] }[] {
  return input.families.map(family => {
    const familyIsSpray = looksLikeSpray(family.name);
    const ids = input.packagings
      .filter(p => isSprayPackaging(p) === familyIsSpray)
      .map(p => p.id);
    return {
      familyId: family.id,
      familyName: family.name ?? `#${family.id}`,
      packagingIds: ids,
    };
  });
}
