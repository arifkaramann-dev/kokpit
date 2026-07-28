/**
 * Eski ürün modeli satır tipi.
 *
 * `Products.tsx` v3'e geçişte kaldırıldı; bu tipi hâlâ eski `products`
 * tablosunu okuyan sayfalar (Üretim, Sipariş/Teklif seçicileri) kullanıyor.
 * O sayfalar da v3'e taşınınca bu dosya silinecek.
 */
export type ProductRow = {
  id: number;
  parentId: number | null;
  name: string;
  series: string | null;
  colorCode: string | null;
  colorHex: string | null;
  surfaceType: string | null;
  additives: string | null;
  description: string | null;
  salePrice: string;
  discountPercent: string;
  channelPrices: string | null;
  packagingCost: string;
  shippingCost: string;
  packaging: string | null;
  barcode: string | null;
  stockQty: number;
  criticalQty: number;
  labelSize: string | null;
  labelText: string | null;
  usageGuide: string | null;
  safetyNotes: string | null;
  extraInfo: string | null;
  sku: string | null;
  category: string | null;
  profitMargin: string | null;
  vatRate: string | null;
  desi: string | null;
  paintType: string | null;
  features: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  imageUrls: string | null;
  videoUrl: string | null;
  mockupUrl: string | null;
  labelWarnings: string | null;
  isActive: number;
  status: "taslak" | "satista" | "arsiv";
};
