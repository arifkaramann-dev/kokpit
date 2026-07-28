/**
 * Katalog üretim planlayıcısı — master ve ilan üretimini KARAR olarak hesaplar,
 * yazma işini çağırana bırakır. Saf fonksiyon: veritabanı gerektirmez.
 *
 * İki değişmez kural:
 *
 * 1) Küp SEYREKTİR. Master'lar seri × renk × form × ambalaj × hazırlık
 *    kartezyen çarpımından değil, uyumluluk tablolarının KESİŞİMİNDEN gelir.
 *    Çarpım alınsaydı 9 seri × 30 renk × 5 form × 9 ambalaj × 2 = 24.300 kayıt
 *    üretilir, büyük kısmı anlamsız olurdu (rötuş kutusu yalnız rötuşta
 *    kullanılır, sprey 400ml yalnız spreyde).
 *
 * 2) Üretim IDEMPOTENT'tir. Aynı planı ikinci kez uygulamak yeni kayıt açmaz;
 *    var olanı günceller. Kimlik veritabanındaki UNIQUE kısıtlarla aynıdır
 *    (masterProducts küp koordinatı, listings master+kullanım alanı).
 */

import { buildInternalSku, buildListingTitle, buildSlug } from "./catalogCodes";

export type Readiness = "konsantre" | "r2u";

export type PlanSeries = {
  id: number;
  name: string;
  prefix: string | null;
  /** Bu seride üretilen ambalaj kimlikleri (seriesPackagings). */
  packagingIds: number[];
  /** Bu seride üretilen form kimlikleri (seriesFamilies). */
  familyIds: number[];
  /** Bu seri r2u (kullanıma hazır) olarak da üretiliyor mu? */
  readiness: Readiness[];
};

export type PlanColor = {
  id: number;
  code: string;
  name: string;
  /** Dolu ise renk yalnız o seriye aittir (RAL kodları, candy tonları). */
  seriesId: number | null;
};

export type PlanFamily = { id: number; code: string; name: string; skuSegment: string | null };
export type PlanPackaging = {
  id: number;
  code: string;
  name: string;
  skuSegment: string | null;
  volumeMl: number;
};

export type PlannedMaster = {
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  readiness: Readiness;
  baseCode: string;
  internalSku: string;
  formulaScale: number;
};

export type MasterPlan = {
  create: PlannedMaster[];
  /** Zaten var olan koordinatlar — ikinci çalıştırmada buraya düşer. */
  existing: PlannedMaster[];
  /** internalSku çakışması (farklı koordinat aynı kodu üretti) — veri hatası. */
  conflicts: { internalSku: string; coords: string[] }[];
};

/** Küp koordinatının metin anahtarı — tekillik karşılaştırması için. */
export function cubeKey(m: {
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  readiness: Readiness;
}): string {
  return `${m.seriesId}:${m.colorId}:${m.familyId}:${m.packagingId}:${m.readiness}`;
}

/**
 * Seçilen serilerin uyumluluk kesişiminden master listesi üretir.
 *
 * `formulaScale` = ambalaj hacmi / reçete baz hacmi. Reçete baz hacim için
 * yazıldığından (örn. 1000 ml) master'ın birim ihtiyacı bu oranla bulunur;
 * tek reçete tüm boyutları besler.
 */
export function planMasters(input: {
  series: PlanSeries[];
  colors: PlanColor[];
  families: PlanFamily[];
  packagings: PlanPackaging[];
  /** Katalogda hâlihazırda bulunan küp anahtarları. */
  existingKeys: Set<string>;
  brand?: string;
  formulaBaseQty?: number;
  /** Yalnız bu seriler üretilsin (boş = hepsi). */
  onlySeriesIds?: number[];
}): MasterPlan {
  const brand = input.brand ?? "aoc";
  const baseQty = input.formulaBaseQty && input.formulaBaseQty > 0 ? input.formulaBaseQty : 1000;
  const familyById = new Map(input.families.map(f => [f.id, f]));
  const packagingById = new Map(input.packagings.map(p => [p.id, p]));

  const create: PlannedMaster[] = [];
  const existing: PlannedMaster[] = [];
  const skuOwner = new Map<string, string[]>();
  const seenKeys = new Set<string>();

  const wanted = input.onlySeriesIds?.length ? new Set(input.onlySeriesIds) : null;

  for (const series of input.series) {
    if (wanted && !wanted.has(series.id)) continue;
    // Renk: seriye özel renkler + tüm serilerde geçerli olanlar.
    const colors = input.colors.filter(c => c.seriesId === null || c.seriesId === series.id);
    const readinessList = series.readiness.length > 0 ? series.readiness : ["konsantre" as const];

    for (const color of colors) {
      for (const familyId of series.familyIds) {
        const family = familyById.get(familyId);
        if (!family) continue;
        for (const packagingId of series.packagingIds) {
          const packaging = packagingById.get(packagingId);
          if (!packaging) continue;
          for (const readiness of readinessList) {
            const coord = {
              seriesId: series.id,
              colorId: color.id,
              familyId,
              packagingId,
              readiness,
            };
            const key = cubeKey(coord);
            // Aynı çalıştırmada tekrar eden koordinat (veri hatası) atlanır.
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            const baseCode = [
              brand.toLowerCase(),
              (series.prefix ?? "").toLowerCase(),
              color.code.toLowerCase(),
            ]
              .filter(Boolean)
              .join("");
            const internalSku = buildInternalSku({
              baseCode,
              familySegment: family.skuSegment ?? family.code,
              packagingSegment: packaging.skuSegment ?? packaging.code,
              readiness,
            });
            skuOwner.set(internalSku, [...(skuOwner.get(internalSku) ?? []), key]);

            const planned: PlannedMaster = {
              ...coord,
              baseCode,
              internalSku,
              formulaScale: packaging.volumeMl > 0 ? packaging.volumeMl / baseQty : 1,
            };
            if (input.existingKeys.has(key)) existing.push(planned);
            else create.push(planned);
          }
        }
      }
    }
  }

  const conflicts = Array.from(skuOwner.entries())
    .filter(([, coords]) => coords.length > 1)
    .map(([internalSku, coords]) => ({ internalSku, coords }));

  return { create, existing, conflicts };
}

/* ------------------------------ İlanlar ---------------------------------- */

export type PlanUseCase = {
  id: number;
  code: string;
  name: string;
  titlePattern: string | null;
};

export type PlannedListing = {
  masterId: number;
  useCaseId: number;
  title: string;
  slug: string;
  isPrimary: boolean;
};

export type ListingPlan = {
  create: PlannedListing[];
  /** Var olan ilanlar — başlık tazelenir, kimlik korunur. */
  update: PlannedListing[];
};

export type ListingMasterContext = {
  masterId: number;
  seriesName: string | null;
  colorName: string | null;
  familyName: string | null;
  packagingName: string | null;
};

/**
 * Master × kullanım alanı matrisinden ilan planı üretir.
 *
 * Kimlik (masterId, useCaseId) — veritabanındaki UNIQUE ile aynı. Bu yüzden
 * "ilanları yeniden üret" mükerrer kayıt açamaz: var olan güncellenir.
 * Eski varyant üreticisinin sil-ve-yeniden-aç yaklaşımı tam da bu yüzden
 * pazaryeri bağlarını koparıyordu.
 *
 * Kullanım alanı seçilmeyen (jenerik) ilan `genericUseCaseId` ile açılır ve
 * `isPrimary` işaretlenir — düşük kapasitede stoğun toplandığı, içerik
 * mirasında referans alınan ilan odur.
 */
export function planListings(input: {
  masters: ListingMasterContext[];
  useCases: PlanUseCase[];
  genericUseCaseId: number;
  /** "masterId:useCaseId" biçiminde var olan ilanlar. */
  existingKeys: Set<string>;
  brand?: string;
}): ListingPlan {
  const brand = input.brand ?? "Artofcolour";
  const create: PlannedListing[] = [];
  const update: PlannedListing[] = [];

  // Jenerik ilan her master için her zaman üretilir; kullanım alanı ilanları ek.
  const generic = input.useCases.find(u => u.id === input.genericUseCaseId) ?? null;
  const others = input.useCases.filter(u => u.id !== input.genericUseCaseId);

  for (const m of input.masters) {
    const targets: { useCase: PlanUseCase | null; id: number; isPrimary: boolean }[] = [
      { useCase: generic, id: input.genericUseCaseId, isPrimary: true },
      ...others.map(u => ({ useCase: u, id: u.id, isPrimary: false })),
    ];

    for (const t of targets) {
      const title = buildListingTitle(t.useCase?.titlePattern ?? null, {
        marka: brand,
        seri: m.seriesName,
        renk: m.colorName,
        form: m.familyName,
        ambalaj: m.packagingName,
        // Jenerik ilanda kullanım alanı yok — başlık forma düşer.
        kullanim: t.isPrimary ? null : (t.useCase?.name ?? null),
      });
      const planned: PlannedListing = {
        masterId: m.masterId,
        useCaseId: t.id,
        title,
        slug: buildSlug(title),
        isPrimary: t.isPrimary,
      };
      if (input.existingKeys.has(`${m.masterId}:${t.id}`)) update.push(planned);
      else create.push(planned);
    }
  }

  return { create, update };
}
