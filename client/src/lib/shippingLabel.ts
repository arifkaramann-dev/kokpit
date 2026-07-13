import { barcodeSVG } from "./barcode";
import { formatTL } from "./format";

export type LabelOrder = {
  orderNo: string;
  customerName: string;
  channel: string;
  createdAt: string | Date;
  totalAmount?: string | number | null;
  itemsSummary?: string | null;
  notes?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type LabelItem = {
  productName: string;
  quantity: string | number;
};

export type CompanyInfo = Record<string, string>;

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

/**
 * Sipariş + şirket bilgisinden yazdırılabilir kargo etiketi açar (10×15 cm).
 * Üstte gönderen (şirket), altta alıcı (müşteri) ve taranabilir bir Code 128
 * barkodu (sipariş no) yer alır. Alıcı adres/telefon bilgisi sipariş notundan
 * alınır; boşsa el yazısı için alan bırakılır. Harici servis/kütüphane gerekmez.
 */
export function printShippingLabel(
  order: LabelOrder,
  items: LabelItem[],
  company: CompanyInfo,
) {
  const date = new Date(order.createdAt).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const senderName = company.companyName || "Art of Colour";
  const senderLines = [company.companyAddress, company.companyPhone]
    .filter(Boolean)
    .map(v => esc(v))
    .join(" · ");

  const barcode = barcodeSVG(order.orderNo, { moduleWidth: 2, height: 64, showText: true });

  // Kalem listesi (yoksa özet); adet gösterilir.
  const contents =
    items.length > 0
      ? items
          .map(it => `<li>${esc(it.productName)}${it.quantity ? ` <b>×${esc(String(it.quantity))}</b>` : ""}</li>`)
          .join("")
      : order.itemsSummary
        ? `<li>${esc(order.itemsSummary)}</li>`
        : "";

  const total =
    order.totalAmount != null && order.totalAmount !== ""
      ? formatTL(order.totalAmount)
      : "";

  // Alıcı adres alanı: yapısal adres > not > el yazısı için çizgili alan.
  const addrText = order.address || order.notes;
  const phoneLine = order.phone ? `<div class="phone">☎ ${esc(order.phone)}</div>` : "";
  const recipientAddr = addrText
    ? `<div class="addr">${esc(addrText)}</div>${phoneLine}`
    : `<div class="addr blank"><span></span><span></span><span></span></div>${phoneLine}`;

  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return;

  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Kargo Etiketi — ${esc(order.orderNo)}</title>
<style>
  @page { size: 10cm 15cm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #000; }
  .actions { padding: 10px; }
  .actions button { font: inherit; padding: 8px 16px; margin-right: 8px; border: 1px solid #1e1b4b; background: #1e1b4b; color: #fff; border-radius: 6px; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #1e1b4b; }
  .label { width: 10cm; height: 15cm; padding: 0.4cm; display: flex; flex-direction: column; border: 1px dashed #bbb; }
  .sender { border-bottom: 1px solid #000; padding-bottom: 0.2cm; }
  .sender .k { font-size: 0.24cm; text-transform: uppercase; letter-spacing: 0.05cm; color: #555; }
  .sender .name { font-size: 0.36cm; font-weight: 800; }
  .sender .lines { font-size: 0.24cm; color: #333; margin-top: 0.05cm; }
  .recipient { margin-top: 0.3cm; }
  .recipient .k { font-size: 0.26cm; text-transform: uppercase; letter-spacing: 0.05cm; color: #555; }
  .recipient .name { font-size: 0.6cm; font-weight: 800; line-height: 1.1; margin-top: 0.05cm; }
  .addr { font-size: 0.32cm; line-height: 1.4; margin-top: 0.15cm; min-height: 1.6cm; }
  .phone { font-size: 0.3cm; font-weight: 700; margin-top: 0.08cm; }
  .addr.blank span { display: block; border-bottom: 1px solid #999; height: 0.55cm; }
  .barcode { text-align: center; margin: 0.25cm 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .meta { display: flex; justify-content: space-between; font-size: 0.26cm; border-top: 1px solid #000; padding-top: 0.15cm; }
  .meta b { font-weight: 800; }
  .contents { margin-top: 0.2cm; font-size: 0.26cm; }
  .contents .k { text-transform: uppercase; letter-spacing: 0.05cm; color: #555; font-size: 0.22cm; }
  .contents ul { list-style: none; margin-top: 0.08cm; }
  .contents li { padding: 0.03cm 0; border-bottom: 0.5px dotted #ccc; }
  .foot { margin-top: auto; font-size: 0.22cm; color: #666; text-align: center; padding-top: 0.15cm; }
  @media print { .actions { display: none; } .label { border: none; } }
</style></head><body>
<div class="actions">
  <button onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="ghost" onclick="window.close()">Kapat</button>
</div>
<div class="label">
  <div class="sender">
    <div class="k">Gönderen</div>
    <div class="name">${esc(senderName)}</div>
    ${senderLines ? `<div class="lines">${senderLines}</div>` : ""}
  </div>
  <div class="recipient">
    <div class="k">Alıcı</div>
    <div class="name">${esc(order.customerName)}</div>
    ${recipientAddr}
  </div>
  <div class="barcode">${barcode}</div>
  <div class="meta">
    <span>Sipariş: <b>${esc(order.orderNo)}</b></span>
    <span>Kanal: <b>${esc(order.channel)}</b></span>
    ${total ? `<span>Tutar: <b>${total}</b></span>` : ""}
  </div>
  ${contents ? `<div class="contents"><div class="k">İçerik</div><ul>${contents}</ul></div>` : ""}
  <div class="foot">${esc(senderName)} · ${date}</div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  win.document.close();
}
