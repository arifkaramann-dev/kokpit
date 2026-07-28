/**
 * Ürün takibi — "bu üründe ne eksik, nerede fırsat var?"
 *
 * Kullanıcının takip etmek istediği dört şey: eksikler · getiriler ·
 * hedef pazar · pazarlama seçenekleri. Bu dosya birinci ve dördüncüyü
 * hesaplar (getiri costing.ts'te, hedef pazar ilan/kanal verisinde).
 *
 * Fark şu: sağlık skoru "kart ne kadar dolu" der; FIRSAT analizi "bu ürünü
 * hangi pazara henüz açmadın" der. İkincisi para kazandıran taraftır —
 * eksik alan doldurmak değil, açılmamış ilan açmak satış getirir.
 */

export type HealthMaster = {
  id: number;
  formulaId: number | null;
  buildableQty: number;
  gtin: string | null;
  status: "taslak" | "aktif" | "arsiv";
};

export type HealthListing = {
  id: number;
  masterId: number;
  useCaseId: number;
  title: string;
  shortDescription: string | null;
  longDescription: string | null;
  status: "taslak" | "aktif" | "arsiv";
  imageCount: number;
};

export type HealthChannelListing = {
  listingId: number;
  masterId: number;
  channelId: number;
  status: "taslak" | "canli" | "durduruldu";
};

export type MasterHealth = {
  masterId: number;
  /** Tamamlanma yüzdesi — 100 = pazaryerine hazır. */
  score: number;
  /** Eksik olan şeyler, kullanıcı diliyle. */
  missing: string[];
  /** İlan açılmamış kullanım alanları — açılmamış pazar. */
  openUseCaseIds: number[];
  /** Yayına alınmamış kanallar. */
  openChannelIds: number[];
  listingCount: number;
  liveCount: number;
};

/**
 * Bir master'ın tamamlanma durumu ve açılmamış pazar fırsatları.
 *
 * Kontroller ağırlıksız ve eşit: her biri "olmadan satılamaz ya da eksik
 * satılır" seviyesinde. Ağırlık vermek skoru yorumlanamaz hale getirirdi.
 */
export function masterHealth(input: {
  master: HealthMaster;
  listings: HealthListing[];
  channelListings: HealthChannelListing[];
  allUseCaseIds: number[];
  allChannelIds: number[];
  /** Bu master'ın maliyeti biliniyor mu (reçete + hammadde fiyatı tam mı). */
  costKnown: boolean;
  /** En az bir ilanda fiyat girilmiş mi. */
  hasPrice: boolean;
}): MasterHealth {
  const { master, listings, channelListings } = input;
  const mine = listings.filter(l => l.masterId === master.id);
  const myChannels = channelListings.filter(c => c.masterId === master.id);
  const live = myChannels.filter(c => c.status === "canli");

  const withContent = mine.filter(
    l => (l.shortDescription?.trim() || l.longDescription?.trim()) && l.title.trim(),
  );
  const withImage = mine.filter(l => l.imageCount > 0);

  const checks: [label: string, ok: boolean][] = [
    ["Reçete bağlı değil", master.formulaId != null],
    ["Üretilemiyor — hammadde/kapasite yok", master.buildableQty > 0],
    ["Maliyet bilinmiyor", input.costKnown],
    ["Fiyat girilmemiş", input.hasPrice],
    ["İlan açılmamış", mine.length > 0],
    ["İlan metni boş", withContent.length > 0],
    ["Görsel yok", withImage.length > 0],
    ["Hiçbir kanalda yayında değil", live.length > 0],
  ];

  const done = checks.filter(([, ok]) => ok).length;
  const usedUseCases = new Set(mine.map(l => l.useCaseId));
  const usedChannels = new Set(myChannels.map(c => c.channelId));

  return {
    masterId: master.id,
    score: Math.round((done / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
    openUseCaseIds: input.allUseCaseIds.filter(id => !usedUseCases.has(id)),
    openChannelIds: input.allChannelIds.filter(id => !usedChannels.has(id)),
    listingCount: mine.length,
    liveCount: live.length,
  };
}

export type SeriesRollup = {
  seriesId: number;
  masterCount: number;
  /** Ortalama tamamlanma — serinin bütün olarak ne kadar hazır olduğu. */
  avgScore: number;
  /** Hiç ilanı olmayan master sayısı — en büyük açılmamış fırsat. */
  withoutListing: number;
  /** Üretilemeyen master sayısı — hammadde sorunu. */
  notBuildable: number;
  liveListings: number;
};

/**
 * Seri bazında toplu görünüm. Kullanıcı ürünleri tek tek değil seri seri
 * takip ediyor ("CANDY serisi ne durumda"); 5.000 satırlık listede tek tek
 * bakmak mümkün değil.
 */
export function rollupBySeries(
  rows: { seriesId: number; health: MasterHealth; buildable: number }[],
): SeriesRollup[] {
  const bySeries = new Map<number, typeof rows>();
  for (const r of rows) {
    bySeries.set(r.seriesId, [...(bySeries.get(r.seriesId) ?? []), r]);
  }
  return Array.from(bySeries.entries())
    .map(([seriesId, list]): SeriesRollup => ({
      seriesId,
      masterCount: list.length,
      avgScore: Math.round(list.reduce((s, r) => s + r.health.score, 0) / list.length),
      withoutListing: list.filter(r => r.health.listingCount === 0).length,
      notBuildable: list.filter(r => r.buildable <= 0).length,
      liveListings: list.reduce((s, r) => s + r.health.liveCount, 0),
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}
