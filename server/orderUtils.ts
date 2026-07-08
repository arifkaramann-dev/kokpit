/** Sipariş kalemi satırından toplam/özet türeten yardımcılar (saf fonksiyonlar). */

export type OrderItemLike = {
  productName: string;
  quantity: number;
  unitPrice: number;
};

export function itemsTotal(items: OrderItemLike[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function summarizeItems(items: OrderItemLike[]): string {
  return items
    .map(item => `${formatQtyForSummary(item.quantity)}× ${item.productName}`)
    .join(", ");
}

function formatQtyForSummary(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toLocaleString("tr-TR");
}

/** Kalem satırlarını decimal (string) alanlı insert kayıtlarına çevirir. */
export function toItemRows(items: OrderItemLike[]) {
  return items.map(item => ({
    productName: item.productName,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
  }));
}
