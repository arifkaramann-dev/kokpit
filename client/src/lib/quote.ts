import { formatTL } from "./format";

export type QuotePrintItem = { productName: string; quantity: string | number; unitPrice: string | number };

export type QuotePrintData = {
  quoteNo: string;
  date: string | Date;
  validUntil?: string | Date | null;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  items: QuotePrintItem[];
  total: string | number;
  notes?: string | null;
};

export type CompanyInfo = Record<string, string>;

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

/** Yazdırılabilir fiyat teklifi belgesi açar. */
export function printQuote(q: QuotePrintData, company: CompanyInfo) {
  const companyName = company.companyName || "Art of Colour";
  const line = (label: string, key: string) =>
    company[key] ? `<div><span class="lbl">${label}:</span> ${esc(company[key])}</div>` : "";
  const rows = q.items
    .map(it => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unitPrice) || 0;
      return `<tr>
        <td>${esc(it.productName)}</td>
        <td class="num">${qty.toLocaleString("tr-TR")}</td>
        <td class="num">${formatTL(price)}</td>
        <td class="num">${formatTL(qty * price)}</td>
      </tr>`;
    })
    .join("");

  const win = window.open("", "_blank", "width=820,height=640");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Teklif ${esc(q.quoteNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 13px; padding: 28px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 22px; }
  .brand { font-size: 19px; font-weight: 800; }
  .co { font-size: 11px; color: #333; line-height: 1.55; margin-top: 6px; }
  .co .lbl { color: #888; }
  .doc h1 { font-size: 18px; letter-spacing: 1px; color: #1e1b4b; }
  .doc .meta { font-size: 11px; color: #333; margin-top: 6px; text-align: right; line-height: 1.6; }
  .party { border: 1px solid #ddd; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px; line-height: 1.6; }
  .party .lbl { color: #888; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { padding: 9px 10px; border-bottom: 1px solid #eee; text-align: left; }
  th { background: #f5f5f7; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #555; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .total { margin-top: 14px; text-align: right; font-size: 16px; }
  .total b { font-size: 22px; color: #1e1b4b; }
  .notes { margin-top: 16px; font-size: 12px; color: #444; line-height: 1.6; }
  .foot { margin-top: 22px; font-size: 11px; color: #666; line-height: 1.6; }
  .actions { margin-bottom: 18px; }
  .actions button { font: inherit; padding: 8px 16px; margin-right: 8px; border: 1px solid #1e1b4b; background: #1e1b4b; color: #fff; border-radius: 6px; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #1e1b4b; }
  @media print { .actions { display: none; } body { padding: 0; } }
</style></head><body>
<div class="actions">
  <button onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="ghost" onclick="window.close()">Kapat</button>
</div>
<div class="top">
  <div>
    <div class="brand">${esc(companyName)}</div>
    <div class="co">
      ${line("Adres", "companyAddress")}
      ${line("Tel", "companyPhone")}
      ${line("Vergi/TC No", "taxNumber")}
    </div>
  </div>
  <div class="doc">
    <h1>FİYAT TEKLİFİ</h1>
    <div class="meta">
      <div><b>Teklif No:</b> ${esc(q.quoteNo)}</div>
      <div><b>Tarih:</b> ${fmtDate(q.date)}</div>
      ${q.validUntil ? `<div><b>Geçerlilik:</b> ${fmtDate(q.validUntil)}</div>` : ""}
    </div>
  </div>
</div>
<div class="party">
  <div><span class="lbl">Sayın:</span> <b>${esc(q.customerName)}</b></div>
  ${q.customerPhone ? `<div><span class="lbl">Tel:</span> ${esc(q.customerPhone)}</div>` : ""}
  ${q.customerAddress ? `<div><span class="lbl">Adres:</span> ${esc(q.customerAddress)}</div>` : ""}
</div>
<table>
  <thead>
    <tr><th>Ürün / Hizmet</th><th class="num">Miktar</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th></tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="4" style="color:#999">Kalem yok</td></tr>'}</tbody>
</table>
<div class="total">Genel Toplam: <b>${formatTL(q.total)}</b></div>
${q.notes ? `<div class="notes"><b>Not:</b> ${esc(q.notes)}</div>` : ""}
<div class="foot">
  Bu teklif ${q.validUntil ? `${fmtDate(q.validUntil)} tarihine kadar` : "belirtilen süre boyunca"} geçerlidir.
  Fiyatlara KDV dahil değildir. Teklifimizi onaylamanız halinde siparişiniz oluşturulacaktır.
</div>
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`);
  win.document.close();
}
