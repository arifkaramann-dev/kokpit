/**
 * Pazaryeri ↔ Kokpit ürün mutabakatı.
 *
 * "Trendyol'daki ürünleri sisteme çekebilir miyim?" sorusunun temeli. İki taraf
 * ayrı ayrı büyüdü: Kokpit'te olup pazaryerine hiç açılmamış ilanlar, pazaryerinde
 * olup Kokpit'te karşılığı olmayan ürünler ve ikisinde birden olanlar var.
 * Güncelleme yalnız ÜÇÜNCÜ grup için mümkün — bir ürünü güncelleyebilmek için
 * iki tarafta da kaydı olmalı.
 *
 * Eşleştirme BARKOD üzerinden yapılır: pazaryerinde de bizde de tekil olan tek
 * alan odur. Stok kodu ikincil ipucudur (barkod tutmuyorsa aday olarak
 * gösterilir) ama otomatik bağlanmaz — yanlış bağlanan ürün, sonraki
 * güncellemede başka bir ürünün başlığını ezer.
 *
 * Saf modül — ağ ve veritabanı yok, test edilebilir.
 */

export type LocalListing = {
  channelListingId: number;
  barcode: string;
  sku: string;
  title: string;
};

export type RemoteProduct = {
  barcode: string;
  title: string;
  stockCode: string;
  approved: boolean;
  onSale: boolean;
  quantity: number;
  salePrice: number;
};

export type ReconcileResult = {
  /** İki tarafta da var — güncellenebilir. */
  matched: { local: LocalListing; remote: RemoteProduct }[];
  /**
   * Yalnız pazaryerinde. Bizde karşılığı yok; güncellenemez.
   * `skuCandidate` doluysa stok kodu bizdeki bir ilanla tutuyor demektir —
   * muhtemel eşleşme, ONAY ister.
   */
  onlyRemote: { remote: RemoteProduct; skuCandidate: LocalListing | null }[];
  /** Yalnız bizde — pazaryerinde kart açılabilir. */
  onlyLocal: LocalListing[];
};

const key = (s: string) => s.trim().toLocaleLowerCase("tr");

/**
 * İki katalogu karşılaştırır.
 *
 * Barkodu boş olan yerel ilan eşleşme adayı değildir: boş barkodlar birbirine
 * eşit sayılıp rastgele eşleşme üretirdi.
 */
export function reconcileCatalogs(
  local: LocalListing[],
  remote: RemoteProduct[],
): ReconcileResult {
  const localByBarcode = new Map<string, LocalListing>();
  const localBySku = new Map<string, LocalListing>();
  for (const l of local) {
    if (l.barcode.trim()) localByBarcode.set(key(l.barcode), l);
    if (l.sku.trim()) localBySku.set(key(l.sku), l);
  }

  const matched: ReconcileResult["matched"] = [];
  const onlyRemote: ReconcileResult["onlyRemote"] = [];
  const usedLocalIds = new Set<number>();

  for (const r of remote) {
    const hit = localByBarcode.get(key(r.barcode));
    if (hit) {
      matched.push({ local: hit, remote: r });
      usedLocalIds.add(hit.channelListingId);
      continue;
    }
    // Barkod tutmuyor: stok kodu bir ipucu olabilir ama tek başına yeterli
    // değil — kullanıcıya aday olarak gösterilir, otomatik bağlanmaz.
    const candidate = r.stockCode.trim() ? (localBySku.get(key(r.stockCode)) ?? null) : null;
    onlyRemote.push({
      remote: r,
      skuCandidate: candidate && !usedLocalIds.has(candidate.channelListingId) ? candidate : null,
    });
  }

  const onlyLocal = local.filter(l => !usedLocalIds.has(l.channelListingId));
  return { matched, onlyRemote, onlyLocal };
}

/** Mutabakat özeti — ekranın üst şeridi. */
export function reconcileSummary(r: ReconcileResult) {
  return {
    matched: r.matched.length,
    onlyRemote: r.onlyRemote.length,
    onlyLocal: r.onlyLocal.length,
    /** Stok koduyla bağlanmaya aday olanlar — tek tıkla çözülebilir. */
    linkable: r.onlyRemote.filter(x => x.skuCandidate !== null).length,
  };
}
