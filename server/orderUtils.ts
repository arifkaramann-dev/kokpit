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

export type CollectionOrderLike = {
  id: number;
  orderNo: string;
  customerName: string;
  totalAmount: unknown;
  paidAmount: unknown;
  createdAt: unknown;
};

/**
 * Tahsilatın bağlanacağı siparişi seçer: sipariş no verildiyse onu,
 * yoksa müşterinin ödenmemiş (kalan > 0) en eski siparişini döner.
 * Eşleşme yoksa undefined — tahsilat siparişsiz, sadece cariye işlenir.
 */
export function findOpenOrderForCollection<T extends CollectionOrderLike>(
  orders: T[],
  customerName: string,
  orderRef?: string | null
): T | undefined {
  const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
  if (orderRef && orderRef.trim() && orderRef.trim().toLowerCase() !== "son") {
    const ref = orderRef.trim().toLowerCase();
    const hit =
      orders.find(o => o.orderNo.toLowerCase() === ref) ??
      orders.find(o => o.orderNo.toLowerCase().includes(ref));
    if (hit) return hit;
  }
  const name = customerName.trim().toLowerCase();
  return orders
    .filter(o => o.customerName.trim().toLowerCase() === name && num(o.totalAmount) - num(o.paidAmount) > 0.001)
    .sort((a, b) => new Date(a.createdAt as never).getTime() - new Date(b.createdAt as never).getTime())[0];
}
