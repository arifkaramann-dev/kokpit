/**
 * v3 → Trendyol ürün kartı eşlemesi.
 *
 * `mapProductsToTrendyolItems` eski `products` ağacını (ana ürün + türevler)
 * kart kalemlerine çeviriyordu ve erişilemez hale gelen ProductDetail
 * sayfasında yaşıyordu. Bu dosya aynı mantığı v3 nesnelerine bağlar:
 * master + ilan + kanal yayını.
 *
 * Değişmeyen kural: aynı ürün ailesinin kalemleri ortak `productMainId`
 * paylaşır → Trendyol'da tek ilan, varyant seçicili. v3'te gruplama
 * anahtarı `channelListings.groupKey`; boşsa master'ın temel kodu kullanılır
 * (aynı rengin farklı ambalajları doğal olarak gruplanır).
 *
 * Zorunlu özellikler (Renk, Hacim, Ürün Tipi) artık kategori başına sabit
 * listeden değil, master'ın küp koordinatından türetilir — bkz.
 * `masterFields.ts`. Sabit liste geriye dönük uyum için yedekte durur.
 */

import {
  buildAttributes,
  type ChannelAttributeDef,
  type ChannelAttributeValueMap,
} from "./masterFields";

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export type CardMaster = {
  id: number;
  baseCode: string | null;
  internalSku: string;
  status: "taslak" | "aktif" | "arsiv";
  basePrice: number;
  discountPercent: number;
  buildableQty: number;
  virtualStockCap: number;
  /** Çözülmüş lojistik değerleri (master → ambalaj → hacimden tahmin). */
  desi: number | null;
  vatRate: number | null;
  // Küp koordinatı — zorunlu özellikler buradan türetilir.
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  volumeMl: number | null;
};

export type CardListing = {
  id: number;
  masterId: number;
  useCaseId: number;
  title: string;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrls: string[];
};

export type CardChannelListing = {
  id: number;
  listingId: number;
  masterId: number;
  channelSku: string;
  channelBarcode: string;
  channelCategoryId: string | null;
  groupKey: string | null;
  price: number;
  discountPercent: number;
};

export type CardSettings = {
  brandId: number;
  cargoCompanyId: number;
  /**
   * Kategori kimliği → sabit özellik listesi. Küp eşlemesi tanımlanmamış
   * kategoriler için yedek; tanımlıysa eşleme kazanır.
   */
  attributeDefaults: Record<string, { attributeId: number; attributeValueId?: number; customAttributeValue?: string }[]>;
};

export type TrendyolCardItem = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: "TRY";
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;
  images: { url: string }[];
  attributes: unknown[];
};

export type CardMappingResult = {
  items: TrendyolCardItem[];
  /** Gönderilemeyen kalemler ve sebepleri — sessizce eksik kart açılmaz. */
  problems: string[];
};

/**
 * Kanal yayınlarını Trendyol ürün kartı kalemlerine çevirir.
 *
 * Zorunlu alanların hepsi kontrol edilir ve eksik olan kalem ADIYLA bildirilir;
 * Trendyol tarafında toplu ret almak yerine burada görülür.
 */
export function mapToTrendyolCards(input: {
  channelListings: CardChannelListing[];
  listings: CardListing[];
  masters: CardMaster[];
  settings: CardSettings;
  /** Kategori kimliği → küp eksenine bağlı özellik tanımları. */
  attributeDefs?: Record<string, ChannelAttributeDef[]>;
  /** Boyut kimliği → pazaryeri değer kimliği köprüsü. */
  attributeValues?: ChannelAttributeValueMap[];
  /** Kapasitesi 0 olanı da gönder (ilan açılsın, stok 0 gitsin). */
  includeUnbuildable?: boolean;
}): CardMappingResult {
  const listingById = new Map(input.listings.map(l => [l.id, l]));
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const items: TrendyolCardItem[] = [];
  const problems: string[] = [];

  for (const cl of input.channelListings) {
    const listing = listingById.get(cl.listingId);
    const master = masterById.get(cl.masterId);
    const label = listing?.title ?? cl.channelSku;

    if (!listing || !master) {
      problems.push(`${label}: ilan veya ürün kaydı bulunamadı`);
      continue;
    }
    if (master.status === "arsiv") {
      problems.push(`${label}: ürün arşivde`);
      continue;
    }
    if (!cl.channelBarcode?.trim()) {
      problems.push(`${label}: pazaryeri barkodu yok`);
      continue;
    }
    const categoryId = Number(cl.channelCategoryId);
    if (!categoryId) {
      problems.push(
        `${label}: kategori seçilmemiş — Toplu Yayın → "Kategori Eşlemesi" sekmesinden bu kullanım alanına kategori seçin`,
      );
      continue;
    }
    const description =
      listing.longDescription?.trim() || listing.shortDescription?.trim() || "";
    if (!description) {
      problems.push(`${label}: açıklama boş (zorunlu)`);
      continue;
    }
    if (listing.imageUrls.length === 0) {
      problems.push(`${label}: görsel yok (zorunlu)`);
      continue;
    }
    const listPrice = cl.price > 0 ? cl.price : master.basePrice;
    if (listPrice <= 0) {
      problems.push(`${label}: fiyat girilmemiş`);
      continue;
    }
    const buildable = master.buildableQty;
    if (buildable <= 0 && !input.includeUnbuildable) {
      problems.push(`${label}: üretilemiyor (hammadde/kapasite yok)`);
      continue;
    }
    // Özellikler önce küp eşlemesinden; tanımlı değilse eski sabit listeden.
    const defs = input.attributeDefs?.[String(categoryId)] ?? [];
    let attributes: unknown[];
    if (defs.length > 0) {
      const built = buildAttributes({
        definitions: defs,
        values: input.attributeValues ?? [],
        master,
      });
      if (built.missing.length > 0) {
        problems.push(`${label}: ${built.missing.join(" · ")}`);
        continue;
      }
      attributes = built.attributes;
    } else {
      const fallback = input.settings.attributeDefaults[String(categoryId)];
      if (!fallback) {
        problems.push(`${label}: "${categoryId}" kategorisi için zorunlu özellikler tanımlanmamış`);
        continue;
      }
      attributes = fallback;
    }

    const discount = cl.price > 0 ? cl.discountPercent : master.discountPercent;
    // Gruplama: aynı productMainId'yi paylaşan kalemler Trendyol'da tek ilan
    // altında varyant olur. Boşsa temel kod (marka+seri+renk) kullanılır —
    // aynı rengin farklı ambalajları doğal olarak gruplanır.
    const productMainId = (cl.groupKey || master.baseCode || master.internalSku).trim();

    items.push({
      barcode: cl.channelBarcode.trim(),
      title: listing.title.slice(0, 100),
      productMainId,
      brandId: input.settings.brandId,
      categoryId,
      quantity: Math.max(0, Math.min(buildable, master.virtualStockCap)),
      stockCode: cl.channelSku,
      dimensionalWeight: num(master.desi, 1),
      description,
      currencyType: "TRY",
      listPrice: Math.round(listPrice * 100) / 100,
      salePrice: Math.round(listPrice * (1 - discount / 100) * 100) / 100,
      vatRate: num(master.vatRate, 20),
      cargoCompanyId: input.settings.cargoCompanyId,
      images: listing.imageUrls.slice(0, 8).map(url => ({ url })),
      attributes,
    });
  }

  return { items, problems };
}
