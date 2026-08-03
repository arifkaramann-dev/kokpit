/**
 * Yeniden sipariş önerisini SİPARİŞ DÖKÜMÜNE çevirir.
 *
 * Öneri tek düz liste olarak üretilir; oysa sipariş tedarikçi başına verilir.
 * Buradaki gruplama dökümü (yazdırma/CSV) tedarikçiye göre böler, her bloğun
 * kendi ara toplamını çıkarır. Saf fonksiyon — hem arayüz hem test kullanır.
 */

export type PurchaseLine = {
  materialId: number;
  name: string;
  unit: string;
  stock: number;
  critical: number;
  suggestedQty: number;
  unitCost: number;
  estimatedCost: number;
  supplierId: number | null;
  supplierName: string | null;
};

export type PurchaseGroup = {
  supplierId: number | null;
  /** Tedarikçisi tanımsız kalemler için null — döküm bunu ayrı blokta gösterir. */
  supplierName: string | null;
  lines: PurchaseLine[];
  subtotal: number;
};

const round2 = (n: number) => +n.toFixed(2);

/**
 * Kalemleri tedarikçiye göre gruplar.
 *
 * Sıra: tutarı en büyük tedarikçi önce (önce en çok parayı bağlayan siparişi
 * verirsiniz), tedarikçisi tanımsız blok her zaman EN SONA — o bir sipariş
 * değil, tamamlanacak eksik veridir. Grup içindeki kalem sırası korunur
 * (öneri zaten en kritikten sıralı gelir).
 */
export function groupReorderBySupplier(lines: PurchaseLine[]): PurchaseGroup[] {
  const groups = new Map<string, PurchaseGroup>();

  for (const l of lines) {
    const key = l.supplierId == null ? "__yok__" : String(l.supplierId);
    const g = groups.get(key) ?? {
      supplierId: l.supplierId,
      supplierName: l.supplierId == null ? null : l.supplierName,
      lines: [],
      subtotal: 0,
    };
    g.lines.push(l);
    g.subtotal = round2(g.subtotal + l.estimatedCost);
    groups.set(key, g);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if ((a.supplierId == null) !== (b.supplierId == null)) return a.supplierId == null ? 1 : -1;
    return b.subtotal - a.subtotal;
  });
}

/** Döküm toplamı — grup ara toplamlarının toplamı. */
export function purchaseTotal(groups: PurchaseGroup[]): number {
  return round2(groups.reduce((s, g) => s + g.subtotal, 0));
}

const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  // Excel TR ayırıcı olarak ; bekler; tırnak/satır sonu içeren hücre kaçışlanır.
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Excel'de açılabilir döküm (noktalı virgül ayraçlı).
 *
 * Sayılar TR ondalık ayracıyla (virgül) yazılır — aksi halde Excel TR
 * kurulumunda "0.25" metin sayılır ve toplam alınamaz.
 */
export function reorderToCsv(groups: PurchaseGroup[]): string {
  const dec = (n: number) => String(n).replace(".", ",");
  const rows: string[] = [
    ["Tedarikçi", "Hammadde", "Stok", "Kritik Eşik", "Birim", "Önerilen Alım", "Birim Maliyet", "Tahmini Maliyet"]
      .map(csvCell)
      .join(";"),
  ];

  for (const g of groups) {
    for (const l of g.lines) {
      rows.push(
        [
          csvCell(g.supplierName ?? "TEDARİKÇİ TANIMSIZ"),
          csvCell(l.name),
          dec(l.stock),
          dec(l.critical),
          csvCell(l.unit),
          dec(l.suggestedQty),
          dec(l.unitCost),
          dec(l.estimatedCost),
        ].join(";"),
      );
    }
    rows.push(["", `${g.supplierName ?? "TEDARİKÇİ TANIMSIZ"} ara toplam`, "", "", "", "", "", dec(g.subtotal)].map(csvCell).join(";"));
  }

  rows.push(["", "GENEL TOPLAM", "", "", "", "", "", dec(purchaseTotal(groups))].map(csvCell).join(";"));
  return rows.join("\n");
}
