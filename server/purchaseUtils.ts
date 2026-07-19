/**
 * Alış faturası saf mantığı: net/KDV/brüt toplamlar, birim dönüşümü ve ağırlıklı
 * ortalama maliyet. Yan etkisiz; db.ts bunları kullanır, birim testleri doğrudan
 * bu fonksiyonları test eder (finans onaylı davranış burada kilitlenir).
 *
 * Net/brüt konvansiyonu (Tema 0 #3): birim maliyet KDV HARİÇ (net) tutulur — kâr/
 * maliyet tabanı nettir (indirilecek KDV gerçek maliyet değil, mahsup edilir).
 * İndirilecek KDV ayrı izlenir (vatTotal); tedarikçi carisi brüt (net+KDV) görür.
 */

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PurchaseItemInput = {
  name: string;
  qty: number;
  unit: string;
  /** KDV HARİÇ birim fiyat. */
  unitCost: number;
  /** Satır KDV oranı (%). Verilmezse 20 varsayılır. */
  vatRate?: number;
};

/** Varsayılan KDV oranı — fatura okuma oran vermezse (boya dikeyinde ana oran %20). */
export const DEFAULT_VAT_RATE = 20;

/**
 * Fatura toplamları: net matrah (Σ qty×unitCost), indirilecek KDV (satır bazlı
 * oranlarla) ve brüt (net+KDV). Yuvarlama kuruş düzeyinde ve TEK yerde (sonda).
 */
export function purchaseTotals(items: PurchaseItemInput[]): {
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
} {
  let net = 0;
  let vat = 0;
  for (const i of items) {
    const lineNet = i.qty * i.unitCost;
    const rate = i.vatRate ?? DEFAULT_VAT_RATE;
    net += lineNet;
    vat += (lineNet * rate) / 100;
  }
  const netTotal = round2(net);
  const vatTotal = round2(vat);
  return { netTotal, vatTotal, grossTotal: round2(netTotal + vatTotal) };
}

/* ------------------------- Birim dönüşümü ------------------------- */

/** Birim adını sadeleştirir (küçük harf, eş anlamlıları tek forma indirger). */
export function normalizeUnit(u: string | null | undefined): string {
  const s = (u ?? "").trim().toLocaleLowerCase("tr-TR");
  const map: Record<string, string> = {
    kilogram: "kg", kilo: "kg", kg: "kg",
    gram: "gr", gr: "gr", g: "gr",
    ton: "ton",
    litre: "lt", lt: "lt", l: "lt", "lt.": "lt",
    mililitre: "ml", ml: "ml", cc: "ml",
    cl: "cl",
    adet: "adet", ad: "adet", "ad.": "adet", tane: "adet", pcs: "adet", "adt": "adet",
    paket: "paket", pk: "paket",
    kutu: "kutu",
  };
  return map[s] ?? s;
}

/**
 * `fromUnit` cinsinden 1 miktarın `toUnit` cinsinden karşılığı (dönüşüm faktörü):
 * qty(to) = qty(from) × factor. Aynı boyutta değillerse (kg↔adet gibi) null döner.
 * Örn. kg→gr = 1000, gr→kg = 0.001, lt→ml = 1000.
 */
export function unitConversionFactor(fromUnit: string, toUnit: string): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return 1;
  // Baz birime (gr / ml / adet) çeviren faktörler; yalnız aynı boyut çevrilebilir.
  const mass: Record<string, number> = { ton: 1_000_000, kg: 1000, gr: 1 };
  const volume: Record<string, number> = { lt: 1000, cl: 10, ml: 1 };
  for (const dim of [mass, volume]) {
    if (from in dim && to in dim) return dim[from] / dim[to];
  }
  return null;
}

/* ------------------------- Ağırlıklı ortalama maliyet ------------------------- */

export type MaterialState = { stockQty: unknown; unitCost: unknown; unit: string };

export type ApplyResult = {
  /** Materyalin birimi cinsinden yeni stok. */
  newStockQty: number;
  /** Ağırlıklı ortalama yeni birim maliyet (materyal birimi başına, KDV hariç). */
  newUnitCost: number;
  /** Stoğa eklenen miktar (materyal birimine dönüştürülmüş). */
  addedQty: number;
  /** Fatura birimi materyal biriminden farklı ama dönüştürülebildi mi? */
  converted: boolean;
  /** Birimler aynı boyutta mı (dönüştürülebilir mi)? false ise ham eklendi — uyar. */
  compatible: boolean;
};

/**
 * Mevcut hammaddeye fatura kalemini uygular: birim dönüşümü + AĞIRLIKLI ORTALAMA
 * maliyet ((eski stok×eski maliyet + yeni×yeni)/toplam). "Son fiyatla ez" YOK.
 *
 * Birim güvenliği: fatura birimi materyal biriminden farklıysa aynı boyuttaysa
 * (kg↔gr, lt↔ml) dönüştürülür; farklı boyutsa (adet↔kg) dönüştürülemez →
 * `compatible:false` ile ham eklenir ve çağıran kod uyarı üretir (sessiz bozma yok).
 */
export function applyPurchaseToMaterial(existing: MaterialState, item: PurchaseItemInput): ApplyResult {
  const factor = unitConversionFactor(item.unit, existing.unit);
  const compatible = factor != null;
  const f = factor ?? 1;
  const addedQty = item.qty * f;
  // Birim maliyet de aynı faktörle küçülür: TL/kg ÷ 1000 = TL/gr.
  const effUnitCost = item.unitCost / f;

  const oldQty = toNum(existing.stockQty);
  const oldCost = toNum(existing.unitCost);
  const newStockQty = oldQty + addedQty;
  // Ağırlıklı ortalama; toplam stok 0/negatifse (düzeltme) yeni maliyete düşülür.
  const newUnitCost =
    newStockQty > 0 ? (oldQty * oldCost + addedQty * effUnitCost) / newStockQty : effUnitCost;

  return {
    newStockQty,
    newUnitCost,
    addedQty,
    converted: compatible && normalizeUnit(item.unit) !== normalizeUnit(existing.unit),
    compatible,
  };
}
