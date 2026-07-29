/**
 * Web vitrini — v3 kataloğundan.
 *
 * Vitrin `storefrontRouter` içinde eski `products` ağacını okuyordu; v3'te
 * üretilen hiçbir master/ilan web sitesinde görünmüyordu. "web" kanalı
 * `salesChannels` içinde vardı ve yayınlanabiliyordu ama yayının vitrinde
 * karşılığı yoktu.
 *
 * Gruplama kuralı pazaryeriyle aynı mantık: bir KART = bir renk, seçenekler =
 * o rengin ambalajları. Böylece "Candy Red 30/100/250/500 ml" tek kart olur,
 * dört ayrı ürün değil.
 *
 * Saf modül — veritabanı yok, test edilebilir.
 */

export type StoreMaster = {
  id: number;
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  baseCode: string | null;
  internalSku: string;
  status: "taslak" | "aktif" | "arsiv";
  basePrice: number;
  discountPercent: number;
  buildableQty: number;
  stockQty: number;
};

export type StoreListing = {
  id: number;
  masterId: number;
  isPrimary: boolean;
  title: string;
  slug: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  status: "taslak" | "aktif" | "arsiv";
};

/** Web kanalındaki yayın — vitrinde yalnız yayınlanmış ürün görünür. */
export type StorePublication = {
  listingId: number;
  masterId: number;
  price: number;
  discountPercent: number;
  status: "taslak" | "canli" | "durduruldu";
};

export type StoreOption = {
  masterId: number;
  packagingId: number;
  packagingName: string;
  volumeMl: number;
  salePrice: number;
  discountPercent: number;
  netPrice: number;
  inStock: boolean;
};

export type StoreGroup = {
  /** Kart kimliği: renk grubunun birincil master'ı. */
  id: number;
  name: string;
  series: string | null;
  colorName: string;
  colorHex: string | null;
  shortDescription: string | null;
  imageUrls: string[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  options: StoreOption[];
};

const net = (price: number, discount: number): number =>
  Math.round(price * (1 - discount / 100) * 100) / 100;

/**
 * Vitrin kartlarını üretir.
 *
 * Satılabilirlik iki koşula bağlı: yayın "canli" VE ürün ya stokta ya da
 * hammaddeden üretilebilir. Siparişe göre üretimde mamul stok tutulmadığı için
 * yalnız stoğa bakmak vitrini boş gösterirdi.
 *
 * Taslak yayın ve taslak/arşiv master dışarıda kalır — hazırlanmakta olan kart
 * müşteriye görünmemeli.
 */
export function buildStorefront(input: {
  masters: StoreMaster[];
  listings: StoreListing[];
  publications: StorePublication[];
  colors: Map<number, { name: string; hex: string | null }>;
  packagings: Map<number, { name: string; volumeMl: number }>;
  series: Map<number, string>;
  /** masterId → görsel adresleri (ilan görseli yoksa master'ınki). */
  imagesOf: Map<number, string[]>;
}): StoreGroup[] {
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const listingById = new Map(input.listings.map(l => [l.id, l]));

  // Yayınlanmış ve satılabilir kalemler.
  type Live = { master: StoreMaster; listing: StoreListing; pub: StorePublication };
  const live: Live[] = [];
  for (const pub of input.publications) {
    if (pub.status !== "canli") continue;
    const master = masterById.get(pub.masterId);
    const listing = listingById.get(pub.listingId);
    if (!master || !listing) continue;
    if (master.status !== "aktif" || listing.status === "arsiv") continue;
    const price = pub.price > 0 ? pub.price : master.basePrice;
    if (price <= 0) continue;
    live.push({ master, listing, pub });
  }

  // Renk grubu: aynı seri + renk + form tek kart.
  const groups = new Map<string, Live[]>();
  for (const item of live) {
    const key = `${item.master.seriesId}|${item.master.colorId}|${item.master.familyId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const out: StoreGroup[] = [];
  for (const items of Array.from(groups.values())) {
    // Kart içeriği birincil ilandan; yoksa ilk ilandan.
    const head = items.find(i => i.listing.isPrimary) ?? items[0];
    const color = input.colors.get(head.master.colorId);

    const options: StoreOption[] = items
      .map(i => {
        const pack = input.packagings.get(i.master.packagingId);
        const price = i.pub.price > 0 ? i.pub.price : i.master.basePrice;
        const discount = i.pub.price > 0 ? i.pub.discountPercent : i.master.discountPercent;
        return {
          masterId: i.master.id,
          packagingId: i.master.packagingId,
          packagingName: pack?.name ?? "",
          volumeMl: pack?.volumeMl ?? 0,
          salePrice: price,
          discountPercent: discount,
          netPrice: net(price, discount),
          // Siparişe göre üretim: stok yoksa da üretilebiliyorsa satılabilir.
          inStock: i.master.stockQty > 0 || i.master.buildableQty > 0,
        };
      })
      // Aynı ambalaj iki ilandan gelirse tek seçenek kalsın.
      .filter((o, idx, arr) => arr.findIndex(x => x.packagingId === o.packagingId) === idx)
      .sort((a, b) => a.volumeMl - b.volumeMl);

    if (options.length === 0) continue;
    const prices = options.map(o => o.netPrice);

    out.push({
      id: head.master.id,
      name: head.listing.title,
      series: input.series.get(head.master.seriesId) ?? null,
      colorName: color?.name ?? "",
      colorHex: color?.hex ?? null,
      shortDescription: head.listing.shortDescription,
      imageUrls: input.imagesOf.get(head.master.id) ?? [],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      inStock: options.some(o => o.inStock),
      options,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Tek ürün sayfası — kart + seçili ambalajın tam metni. */
export function buildStoreProduct(input: {
  masterId: number;
  groups: StoreGroup[];
  listings: StoreListing[];
}): (StoreGroup & { description: string | null; usageGuide: string | null }) | null {
  const group = input.groups.find(g => g.options.some(o => o.masterId === input.masterId));
  if (!group) return null;
  const listing =
    input.listings.find(l => l.masterId === input.masterId && l.isPrimary) ??
    input.listings.find(l => l.masterId === input.masterId) ??
    input.listings.find(l => l.masterId === group.id);
  return {
    ...group,
    description: listing?.longDescription ?? null,
    usageGuide: listing?.applicationText ?? null,
  };
}
