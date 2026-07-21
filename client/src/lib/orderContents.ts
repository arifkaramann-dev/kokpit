import { formatTL } from "./format";

/**
 * Sipariş içeriği dökümü — kalem kalem, tek veya toplu yazdırma/PDF.
 * Her sipariş A4'te ayrı bir "toplama fişi" sayfasıdır: kalem tablosu
 * (işaret kutusu + adet + birim fiyat + tutar), adres/telefon ve notlar.
 * Tarayıcının "PDF olarak kaydet" seçeneğiyle PDF üretilir; harici servis yok.
 */

export type ContentOrder = {
  id: number;
  orderNo: string;
  customerName: string;
  channel: string | null;
  createdAt: string | Date;
  totalAmount?: string | number | null;
  itemsSummary?: string | null;
  notes?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
};

export type ContentItem = {
  orderId: number;
  productName: string;
  quantity: string | number;
  unitPrice: string | number;
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

const num = (v: string | number | null | undefined) => parseFloat(String(v ?? 0)) || 0;

function orderSheet(order: ContentOrder, items: ContentItem[]): string {
  const date = new Date(order.createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const rows =
    items.length > 0
      ? items
          .map((it, i) => {
            const qty = num(it.quantity);
            const unit = num(it.unitPrice);
            return `<tr>
              <td class="c">${i + 1}</td>
              <td class="c"><span class="box"></span></td>
              <td>${esc(it.productName)}</td>
              <td class="c"><b>${qty % 1 === 0 ? qty : qty.toFixed(2)}</b></td>
              <td class="r">${formatTL(unit)}</td>
              <td class="r">${formatTL(qty * unit)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td class="c">1</td><td class="c"><span class="box"></span></td>
          <td colspan="4">${esc(order.itemsSummary || "— kalem kaydı yok —")}</td></tr>`;

  const itemsTotal =
    items.length > 0
      ? items.reduce((s, it) => s + num(it.quantity) * num(it.unitPrice), 0)
      : num(order.totalAmount);
  const totalQty = items.reduce((s, it) => s + num(it.quantity), 0);

  const contact = [
    order.customerPhone ? `☎ ${esc(order.customerPhone)}` : "",
    order.customerAddress ? esc(order.customerAddress) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<section class="sheet">
    <header>
      <div>
        <h2>SİPARİŞ İÇERİĞİ</h2>
        <div class="meta"><b>${esc(order.orderNo)}</b> · ${esc(order.channel ?? "")} · ${date}</div>
      </div>
      <div class="cust">
        <div class="name">${esc(order.customerName)}</div>
        ${contact ? `<div class="contact">${contact}</div>` : ""}
      </div>
    </header>
    <table>
      <thead>
        <tr><th style="width:26px">#</th><th style="width:30px">✓</th><th>Ürün</th>
        <th style="width:52px">Adet</th><th style="width:80px">Birim</th><th style="width:90px">Tutar</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="r"><b>Toplam</b></td>
          <td class="c"><b>${totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)}</b></td>
          <td></td>
          <td class="r"><b>${formatTL(itemsTotal)}</b></td>
        </tr>
      </tfoot>
    </table>
    ${order.notes ? `<div class="notes"><b>Not:</b> ${esc(order.notes)}</div>` : ""}
  </section>`;
}

/** Seçilen siparişlerin içerik dökümünü tek pencerede açar (sipariş başına bir sayfa). */
export function printOrderContents(orders: ContentOrder[], items: ContentItem[]) {
  if (orders.length === 0) return;
  const byOrder = new Map<number, ContentItem[]>();
  for (const it of items) {
    const list = byOrder.get(it.orderId) ?? [];
    list.push(it);
    byOrder.set(it.orderId, list);
  }

  const sheets = orders.map(o => orderSheet(o, byOrder.get(o.id) ?? [])).join("");
  const title =
    orders.length === 1
      ? `Sipariş İçeriği — ${orders[0].orderNo}`
      : `Sipariş İçerikleri — ${orders.length} sipariş`;

  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;

  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 1.2cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #000; font-size: 12px; }
  .actions { padding: 10px; }
  .actions button { font: inherit; padding: 8px 16px; margin-right: 8px; border: 1px solid #1e1b4b; background: #1e1b4b; color: #fff; border-radius: 6px; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #1e1b4b; }
  .sheet { padding: 16px 8px; page-break-after: always; }
  .sheet:last-of-type { page-break-after: auto; }
  header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
  h2 { font-size: 15px; letter-spacing: 0.06em; }
  .meta { color: #444; margin-top: 3px; }
  .cust { text-align: right; max-width: 55%; }
  .cust .name { font-weight: 800; font-size: 14px; }
  .cust .contact { color: #444; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 5px 6px; vertical-align: top; }
  th { background: #f0f0f0; text-align: left; font-size: 11px; }
  td.c, th.c { text-align: center; }
  td.r { text-align: right; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #333; border-radius: 2px; }
  tfoot td { border-top: 2px solid #000; }
  .notes { margin-top: 8px; padding: 6px 8px; border: 1px dashed #999; border-radius: 4px; }
  @media print { .actions { display: none; } }
</style></head><body>
<div class="actions">
  <button onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="ghost" onclick="window.close()">Kapat</button>
</div>
${sheets}
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  win.document.close();
}
