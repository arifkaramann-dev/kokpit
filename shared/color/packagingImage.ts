/**
 * Ambalaj çekimi çözümlemesi — hangi kutunun görseli çizilecek?
 *
 * ── Neden ayrı ve saf bir modül ────────────────────────────────────────────
 * Şablonlardaki ambalaj görseli eskiden koda gömülü bir listeydi
 * (`renkTemplates.PACKAGING`): dosya adları sabit, hatlar `VIVID`/`METEOR`
 * olarak elle yazılmış. Yeni bir ambalaj ya da yeni bir seri geldiğinde
 * şablon onu bilmiyordu — kutu ya eksik çiziliyordu ya yanlış hattın kutusu
 * basılıyordu.
 *
 * Artık kaynak TANIMLAR: her ambalajın kendi çekimi var, gerekirse seri
 * bazında ayrı çekimi. Bu modül o eşlemeyi yapıyor; çizim yok, tarayıcı
 * API'si yok, bu yüzden test edilebilir.
 *
 * ── Çözümleme sırası ──────────────────────────────────────────────────────
 *   1. (ambalaj × seri) tam eşleşme  — VIVID'in kendi sprey kutusu
 *   2. (ambalaj × NULL) varsayılan   — tüm serilerde kullanılan çekim
 *   3. yok                            — katman çizilmez
 *
 * "Herhangi bir seri"ye ASLA düşülmez: Vivid bir rengin yanında Meteor
 * kutusunun durması, hiç kutu olmamasından kötüdür.
 */

/** Görsel verisi olmadan taşınan çekim referansı. */
export type PackagingImageRef = {
  id: number;
  packagingId: number;
  seriesId?: number | null;
};

/** Ambalaj tanımının çözümleme için gereken alanları. */
export type PackagingLike = {
  id: number;
  name: string;
  /** Drizzle decimal alanları dize döner; sayı da kabul edilir. */
  volumeMl?: string | number | null;
};

export type SeriesPackagingLike = { seriesId: number; packagingId: number };

/** `/api/img/packaging/{id}` — adres okuma anında türetilir, satıra yazılmaz. */
export function packagingImageUrl(id: number): string {
  return `/api/img/packaging/${id}`;
}

/**
 * Bir (ambalaj, seri) çifti için çizilecek çekimin kimliği.
 *
 * @returns çekim yoksa `null` — çağıran taraf katmanı atlamalı.
 */
export function resolvePackagingImageId(
  refs: PackagingImageRef[],
  packagingId: number | null | undefined,
  seriesId: number | null | undefined,
): number | null {
  if (!packagingId) return null;
  const mine = refs.filter(r => r.packagingId === packagingId);
  if (!mine.length) return null;
  if (seriesId != null) {
    const exact = mine.find(r => r.seriesId === seriesId);
    if (exact) return exact.id;
  }
  const fallback = mine.find(r => r.seriesId == null);
  return fallback ? fallback.id : null;
}

/** Çekimin adresi — yoksa `null`. */
export function resolvePackagingImageSrc(
  refs: PackagingImageRef[],
  packagingId: number | null | undefined,
  seriesId: number | null | undefined,
): string | null {
  const id = resolvePackagingImageId(refs, packagingId, seriesId);
  return id == null ? null : packagingImageUrl(id);
}

const volumeOf = (p: PackagingLike): number => {
  const v = typeof p.volumeMl === "number" ? p.volumeMl : parseFloat(String(p.volumeMl ?? ""));
  return Number.isFinite(v) ? v : 0;
};

export type PackRangeItem = {
  packagingId: number;
  /** Ambalajın adı — karta etiket olarak basılır ("100 ml"). */
  label: string;
  volumeMl: number;
  /** Çekim adresi; yoksa `null` (etiket yine yazılabilir). */
  src: string | null;
};

/**
 * Serinin AMBALAJ GAMI — hacme göre artan.
 *
 * "Bu renk hangi boylarda var?" sorusunun cevabı kartın en çok işe yarayan
 * bilgisi ve şimdiye kadar koda gömülü sabit bir listeden geliyordu
 * (`PACK_SIZES`), yani gerçek katalogla ilgisi yoktu: satılmayan boy
 * yazıyor, yeni boy hiç görünmüyordu.
 *
 * Seri bağı varsa yalnız o serinin ambalajları; bağ tanımlanmamışsa bütün
 * ambalajlar. Boş bağ "hiç ambalaj yok" demek değil, "daraltılmamış" demek —
 * kartı boş bırakmak kullanıcıya yardım etmez.
 */
export function seriesPackRange(opts: {
  packagings: PackagingLike[];
  seriesPackagings?: SeriesPackagingLike[];
  images?: PackagingImageRef[];
  seriesId?: number | null;
  /** En fazla kaç boy — şablonda dört kutuluk yer var. */
  limit?: number;
}): PackRangeItem[] {
  const { packagings, seriesPackagings = [], images = [], seriesId = null, limit } = opts;

  const allowed =
    seriesId == null
      ? null
      : new Set(seriesPackagings.filter(sp => sp.seriesId === seriesId).map(sp => sp.packagingId));

  const rows = (allowed && allowed.size ? packagings.filter(p => allowed.has(p.id)) : packagings)
    .slice()
    .sort((a, b) => volumeOf(a) - volumeOf(b) || a.name.localeCompare(b.name, "tr"));

  const out = rows.map(p => ({
    packagingId: p.id,
    label: p.name,
    volumeMl: volumeOf(p),
    src: resolvePackagingImageSrc(images, p.id, seriesId),
  }));
  return limit != null ? out.slice(0, limit) : out;
}
