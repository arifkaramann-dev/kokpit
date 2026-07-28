/**
 * Toplu kanal yayını planlayıcısı.
 *
 * `publishListing` bir ilanı bir kanala açıyordu. 500 master × 3 ilan × 2 kanal
 * = 3.000 tıklama. Bu dosya toplu yayını KARAR olarak hesaplar; yazma işini
 * çağırana bırakır. Saf fonksiyon — DB gerektirmez.
 *
 * İki kısıt aynı anda korunur:
 *  1) Bir ilan bir kanalda yalnız bir kez yayınlanır (tekrar açılmaz)
 *  2) Bir master, bir kanalda, bir KATEGORİDE tek ilan — pazaryerlerinin
 *     mükerrer ilan yaptırımı aynı kategorideki kopyaları hedefler.
 *     Bu kural veritabanında UNIQUE olarak da duruyor; burada önden
 *     yakalanır ki toplu işlem ortasında hataya düşmesin.
 */

export type PublishListing = {
  id: number;
  masterId: number;
  useCaseId: number;
  status: "taslak" | "aktif" | "arsiv";
  /** İçerik dolu mu — boş ilan pazaryerine gönderilemez. */
  hasContent: boolean;
};

export type PublishMaster = {
  id: number;
  status: "taslak" | "aktif" | "arsiv";
  basePrice: number;
  buildableQty: number;
};

export type ExistingPublication = {
  listingId: number;
  masterId: number;
  channelId: number;
  channelCategoryId: string | null;
};

export type PublishCandidate = {
  listingId: number;
  masterId: number;
  channelId: number;
  channelCategoryId: string | null;
  price: number;
};

export type PublishSkip = {
  listingId: number;
  reason:
    | "zaten_yayinda"
    | "kategori_dolu"
    | "icerik_yok"
    | "fiyat_yok"
    | "master_pasif"
    | "ilan_arsiv"
    | "kategori_eslesmesi_yok";
};

export type PublishPlan = {
  create: PublishCandidate[];
  skip: PublishSkip[];
};

/**
 * Yayınlanacak (ilan × kanal) çiftlerini seçer.
 *
 * `categoryOf` kullanım alanı → kanal kategori kimliği eşlemesidir. Eşleme
 * yoksa ilan atlanır: kategorisiz ilan pazaryerine açılamaz ve mükerrer
 * kilidi de kategoriye dayandığı için eşleme olmadan kilit anlamsızlaşır.
 */
export function planPublications(input: {
  listings: PublishListing[];
  masters: PublishMaster[];
  existing: ExistingPublication[];
  channelId: number;
  /** useCaseId → o kanaldaki kategori kimliği. */
  categoryOf: Map<number, string>;
  /** Kapasitesi 0 olanı da yayınla (ilan açık kalsın, stok 0 gider). */
  includeUnbuildable?: boolean;
}): PublishPlan {
  const masterById = new Map(input.masters.map(m => [m.id, m]));

  const publishedListing = new Set(
    input.existing.filter(e => e.channelId === input.channelId).map(e => e.listingId),
  );
  // Bu kanalda master+kategori zaten doluysa ikinci ilan açılamaz.
  const takenCategory = new Set(
    input.existing
      .filter(e => e.channelId === input.channelId)
      .map(e => `${e.masterId}:${e.channelCategoryId ?? ""}`),
  );

  const create: PublishCandidate[] = [];
  const skip: PublishSkip[] = [];

  for (const l of input.listings) {
    if (l.status === "arsiv") {
      skip.push({ listingId: l.id, reason: "ilan_arsiv" });
      continue;
    }
    if (publishedListing.has(l.id)) {
      skip.push({ listingId: l.id, reason: "zaten_yayinda" });
      continue;
    }
    const master = masterById.get(l.masterId);
    if (!master || master.status === "arsiv") {
      skip.push({ listingId: l.id, reason: "master_pasif" });
      continue;
    }
    if (!l.hasContent) {
      skip.push({ listingId: l.id, reason: "icerik_yok" });
      continue;
    }
    if (master.basePrice <= 0) {
      skip.push({ listingId: l.id, reason: "fiyat_yok" });
      continue;
    }
    if (!input.includeUnbuildable && master.buildableQty <= 0) {
      // Üretilemeyen ürünün ilanını açmak "stokta yok" ilanı açmaktır;
      // pazaryeri sıralamasına zarar verir.
      skip.push({ listingId: l.id, reason: "master_pasif" });
      continue;
    }

    const category = input.categoryOf.get(l.useCaseId);
    if (!category) {
      skip.push({ listingId: l.id, reason: "kategori_eslesmesi_yok" });
      continue;
    }

    const key = `${l.masterId}:${category}`;
    if (takenCategory.has(key)) {
      skip.push({ listingId: l.id, reason: "kategori_dolu" });
      continue;
    }
    takenCategory.add(key);

    create.push({
      listingId: l.id,
      masterId: l.masterId,
      channelId: input.channelId,
      channelCategoryId: category,
      price: master.basePrice,
    });
  }

  return { create, skip };
}

/** Atlama sebeplerini kullanıcı diline çevirir (özet satırı için). */
export function summarizeSkips(skips: PublishSkip[]): { reason: string; count: number }[] {
  const label: Record<PublishSkip["reason"], string> = {
    zaten_yayinda: "Zaten bu kanalda yayında",
    kategori_dolu: "Bu kategoride ürünün başka ilanı var (mükerrer ilan kilidi)",
    icerik_yok: "İlan metni boş",
    fiyat_yok: "Fiyat girilmemiş",
    master_pasif: "Ürün pasif ya da üretilemiyor",
    ilan_arsiv: "İlan arşivde",
    kategori_eslesmesi_yok: "Kullanım alanı için kanal kategorisi eşlenmemiş",
  };
  const counts = new Map<string, number>();
  for (const s of skips) {
    const l = label[s.reason];
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
