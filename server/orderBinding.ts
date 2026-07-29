/**
 * Sipariş kalemini v3 master ürüne bağlar — KESİN yoldan.
 *
 * Sorun: pazaryerinden gelen sipariş satırı barkodu taşıyor (Trendyol
 * `line.barcode`, HB `merchantSku`), ama bu değer saklanmıyordu. Kendi
 * ürettiğimiz `channelListings.channelBarcode`'u pazaryerine gönderiyor,
 * sipariş o barkodla geri geliyor ve biz onu atıp başlık benzerliğiyle tahmin
 * yürütüyorduk. Para ve stok yolunda tahmin çalışıyordu.
 *
 * Bu modül köprüyü kurar: kanal kodu → (master, ilan). Eşleşme kesindir;
 * bulanık eşleştirme (`productionPlan.resolveOrderLines`) yalnız burası boş
 * dönerse devreye girer.
 *
 * Saf modül — veritabanı yok, test edilebilir.
 */

export type ChannelRefRow = {
  masterId: number;
  listingId: number;
  channelSku: string | null;
  channelBarcode: string | null;
};

export type ChannelRefIndex = Map<string, { masterId: number; listingId: number }>;

/** Kod karşılaştırması boşluk ve harf büyüklüğüne takılmamalı. */
const normalizeRef = (s: string): string => s.trim().toLocaleLowerCase("tr-TR");

/**
 * Kanal kodu → master dizini.
 *
 * Aynı kod iki ilana düşerse İLK kayıt kazanır ve ikincisi yok sayılır:
 * belirsiz eşleşmede rastgele birini seçmek yanlış master'a stok düşürür.
 * Kod üretimi tekil olduğu için bu pratikte yalnız elle girilen barkodlarda
 * olur; `conflicts` ile görünür kalır.
 */
export function buildChannelRefIndex(rows: ChannelRefRow[]): {
  index: ChannelRefIndex;
  conflicts: string[];
} {
  const index: ChannelRefIndex = new Map();
  const conflicts: string[] = [];

  for (const row of rows) {
    for (const raw of [row.channelSku, row.channelBarcode]) {
      const ref = raw?.trim() ? normalizeRef(raw) : "";
      if (!ref) continue;
      const existing = index.get(ref);
      if (existing) {
        if (existing.masterId !== row.masterId) conflicts.push(ref);
        continue;
      }
      index.set(ref, { masterId: row.masterId, listingId: row.listingId });
    }
  }
  return { index, conflicts };
}

/** Kalemin kanal koduna göre kesin master bağı; kod yoksa/tanınmıyorsa null. */
export function resolveMasterByRef(
  channelRef: string | null | undefined,
  index: ChannelRefIndex,
): { masterId: number; listingId: number } | null {
  if (!channelRef?.trim()) return null;
  return index.get(normalizeRef(channelRef)) ?? null;
}

/* ---- Geri doldurma ------------------------------------------------------ */

export type BindableItem = {
  id: number;
  orderId: number;
  productName: string;
  channelRef: string | null;
  masterId: number | null;
};

export type BindPlan = {
  /** Yazılacak bağlar. */
  updates: { itemId: number; masterId: number; listingId: number }[];
  /** Kanal kodu var ama tanınmadı — ilan silinmiş ya da kod elle girilmiş. */
  unknownRefs: { itemId: number; productName: string; channelRef: string }[];
  /** Kanal kodu hiç yok — elle bağlanmalı ya da bulanık eşleştirmeye kalır. */
  noRef: { itemId: number; productName: string }[];
  alreadyBound: number;
};

/**
 * Bağı olmayan kalemler için yazılacak bağları planlar.
 *
 * Bağlı kalem ASLA yeniden yazılmaz: elle düzeltilmiş bir bağ, sonradan
 * çalışan bir geri doldurma turunda sessizce bozulmamalı.
 */
export function planOrderBinding(input: {
  items: BindableItem[];
  index: ChannelRefIndex;
}): BindPlan {
  const plan: BindPlan = { updates: [], unknownRefs: [], noRef: [], alreadyBound: 0 };

  for (const item of input.items) {
    if (item.masterId != null) {
      plan.alreadyBound += 1;
      continue;
    }
    if (!item.channelRef?.trim()) {
      plan.noRef.push({ itemId: item.id, productName: item.productName });
      continue;
    }
    const hit = resolveMasterByRef(item.channelRef, input.index);
    if (!hit) {
      plan.unknownRefs.push({
        itemId: item.id,
        productName: item.productName,
        channelRef: item.channelRef.trim(),
      });
      continue;
    }
    plan.updates.push({ itemId: item.id, masterId: hit.masterId, listingId: hit.listingId });
  }
  return plan;
}
