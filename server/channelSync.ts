/**
 * Kanal senkronu — v3 yayınlarından pazaryeri gönderim yükü.
 *
 * Eski gönderim (`pushToTrendyol` vb.) `products` tablosunu okuyordu; v3'te
 * üretilen master/ilan/yayınların hiçbiri pazaryerine gitmiyordu. Zincir tam
 * burada kopuyordu: toplu yayın `channelListings` kaydını açıp "kirli"
 * işaretliyor ama kuyruğu kimse boşaltmıyordu.
 *
 * Bu dosya kuyruktan gönderim yükünü ÜRETİR (saf); ağ çağrısını çağıran yapar.
 */

import { listingQtyFor, type SalesMode } from "./capacity";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export type SyncChannelListing = {
  id: number;
  masterId: number;
  channelId: number;
  channelSku: string;
  channelBarcode: string;
  price: number;
  discountPercent: number;
  pushedQty: number;
  status: "taslak" | "canli" | "durduruldu";
};

export type SyncMaster = {
  id: number;
  status: "taslak" | "aktif" | "arsiv";
  basePrice: number;
  discountPercent: number;
  buildableQty: number;
  virtualStockCap: number;
  /** İlan miktarının hangi kurala göre çıkacağı. */
  salesMode?: SalesMode | null;
  /** Raftaki mamul — `stoktan` modunda miktarın kaynağı. */
  stockQty?: number;
  reservedQty?: number;
};

/** Pazaryerine gidecek tek kalem — kanal biçimine çevrilmeden önce. */
export type SyncItem = {
  channelListingId: number;
  channelSku: string;
  barcode: string;
  /** İlanda görünecek miktar: min(kapasite, tavan). */
  quantity: number;
  /** İndirim öncesi liste fiyatı. */
  listPrice: number;
  /** İndirim sonrası satış fiyatı. */
  salePrice: number;
};

export type SyncPlan = {
  items: SyncItem[];
  /** Gönderilmeyenler ve sebepleri — sessizce atlanmaz. */
  skipped: { channelListingId: number; reason: string }[];
};

/**
 * Kirli yayınlardan gönderim listesi üretir.
 *
 * Miktar `min(kapasite, sanal tavan)`: kapasite hammaddeden gelir, tavan
 * pazaryerinde gereğinden fazla stok göstermemek içindir. Kapasite 0 ise 0
 * gönderilir — ilan kapanır, üretilemeyen ürün satılmaz.
 *
 * Fiyat kanala özel değer varsa ondan, yoksa master'ın taban fiyatından gelir.
 */
export function planChannelSync(input: {
  listings: SyncChannelListing[];
  masters: SyncMaster[];
  /** Yalnız bu kanal. */
  channelId: number;
}): SyncPlan {
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const items: SyncItem[] = [];
  const skipped: SyncPlan["skipped"] = [];

  for (const l of input.listings) {
    if (l.channelId !== input.channelId) continue;
    if (l.status === "durduruldu") {
      skipped.push({ channelListingId: l.id, reason: "Yayın durdurulmuş" });
      continue;
    }
    const master = masterById.get(l.masterId);
    if (!master) {
      skipped.push({ channelListingId: l.id, reason: "Ürün bulunamadı" });
      continue;
    }
    if (!l.channelBarcode?.trim()) {
      skipped.push({ channelListingId: l.id, reason: "Pazaryeri barkodu yok" });
      continue;
    }

    // Arşivlenen ürün stoğu sıfırlanarak gönderilir — ilan silinmez ama
    // satışa kapanır. Silmek geçmiş satış verisini de götürürdü.
    const arsiv = master.status === "arsiv";
    const quantity = arsiv
      ? 0
      : listingQtyFor({
          salesMode: master.salesMode,
          buildable: master.buildableQty,
          cap: master.virtualStockCap,
          stockQty: master.stockQty,
          reservedQty: master.reservedQty,
        });

    const listPrice = l.price > 0 ? l.price : master.basePrice;
    if (listPrice <= 0) {
      skipped.push({ channelListingId: l.id, reason: "Fiyat girilmemiş" });
      continue;
    }
    const discount = l.price > 0 ? l.discountPercent : master.discountPercent;

    items.push({
      channelListingId: l.id,
      channelSku: l.channelSku,
      barcode: l.channelBarcode.trim(),
      quantity,
      listPrice: Math.round(listPrice * 100) / 100,
      salePrice: Math.round(listPrice * (1 - discount / 100) * 100) / 100,
    });
  }

  return { items, skipped };
}

/**
 * Toplu gönderim parçalara bölünür — pazaryerleri tek istekte sınırsız kalem
 * kabul etmez ve büyük parti hata verince hepsi birden başarısız olur.
 */
export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Kanal koduna göre gönderim yükü — her pazaryeri farklı alan adı bekler. */
export function toChannelPayload(channelCode: string, item: SyncItem) {
  switch (channelCode) {
    case "trendyol":
      return {
        barcode: item.barcode,
        quantity: item.quantity,
        listPrice: item.listPrice,
        salePrice: item.salePrice,
      };
    case "hepsiburada":
      // HB merchantSku ile eşleşir; barkod yerine satıcı kodu gider.
      return {
        merchantSku: item.channelSku,
        price: item.salePrice,
        availableStock: item.quantity,
      };
    case "n11":
      return {
        sellerStockCode: item.channelSku,
        quantity: item.quantity,
        price: item.salePrice,
      };
    case "ciceksepeti":
      return {
        stockCode: item.channelSku,
        quantity: item.quantity,
        price: item.salePrice,
      };
    default:
      return null;
  }
}
