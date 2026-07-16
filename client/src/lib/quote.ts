import { formatTL } from "./format";
import type { CompanyInfo, InvoiceItem } from "./invoice";

export type QuoteDoc = {
  quoteNo: string;
  customerName: string;
  createdAt: string | Date;
  validUntil?: string | Date | null;
  notes?: string | null;
  phone?: string | null;
  address?: string | null;
};

const n = (v: string | number | null | undefined) => {
  const x = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return isNaN(x) ? 0 : x;
};

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

/**
 * Teklif + şirket bilgisinden yazdırılabilir fiyat teklifi açar (fatura
 * şablonunun teklif sürümü). Fiyatlar KDV dahil kabul edilir; matrah ve
 * KDV ayrıca dökülür ki kurumsal alıcı net tutarı görsün.
 */
export function printQuote(quote: QuoteDoc, items: InvoiceItem[], company: CompanyInfo) {
  const vatRate = n(company.vatRate) || 20;
  const rows = items.map(it => {
    const qty = n(it.quantity);
    const gross = qty * n(it.unitPrice);
    const net = gross / (1 + vatRate / 100);
    return { name: it.productName, qty, unit: n(it.unitPrice), net, vat: gross - net, gross };
  });
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  const totalVat = rows.reduce((s, r) => s + r.vat, 0);

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

  const companyName = company.companyName || "Art of Colour";
  const line = (label: string, key: string) =>
    company[key] ? `<div><span class="lbl">${label}:</span> ${esc(company[key])}</div>` : "";

  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;

  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Teklif ${esc(quote.quoteNo)} — ${esc(quote.customerName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 12px; padding: 24px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
  .co { font-size: 11px; color: #333; line-height: 1.55; margin-top: 6px; }
  .co .lbl { color: #777; }
  .doc { text-align: right; }
  .doc h1 { font-size: 22px; letter-spacing: 1px; color: #1e1b4b; }
  .doc .meta { font-size: 11px; color: #333; margin-top: 8px; line-height: 1.6; }
  .party { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; }
  .party .h { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; }
  .party .name { font-size: 14px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f4f4f7; text-align: right; padding: 8px 10px; font-size: 11px; color: #555; border-bottom: 2px solid #e0e0e6; }
  th.l, td.l { text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; }
  .totals { width: 280px; margin-left: auto; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .totals .grand { border-top: 2px solid #1e1b4b; margin-top: 6px; padding-top: 8px; font-size: 15px; font-weight: 800; color: #1e1b4b; }
  .foot { margin-top: 28px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; line-height: 1.6; }
  .note { margin-top: 12px; font-size: 11px; color: #444; }
  @media print { body { padding: 0; } button { display: none; } }
  .actions { margin-bottom: 16px; }
  .actions button { font: inherit; padding: 8px 16px; margin-right: 8px; border: 1px solid #1e1b4b; background: #1e1b4b; color: #fff; border-radius: 6px; cursor: pointer; }
  .actions button.ghost { background: #fff; color: #1e1b4b; }
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
      ${line("Vergi D.", "taxOffice")}
      ${line("Vergi/TC No", "taxNumber")}
      ${line("Tel", "companyPhone")}
      ${line("E-posta", "companyEmail")}
      ${line("Web", "companyWeb")}
    </div>
  </div>
  <div class="doc">
    <h1>FİYAT TEKLİFİ</h1>
    <div class="meta">
      <div><b>Teklif No:</b> ${esc(quote.quoteNo)}</div>
      <div><b>Tarih:</b> ${fmtDate(quote.createdAt)}</div>
      ${quote.validUntil ? `<div><b>Geçerlilik:</b> ${fmtDate(quote.validUntil)} tarihine kadar</div>` : ""}
    </div>
  </div>
</div>

<div class="party">
  <div class="h">Sayın</div>
  <div class="name">${esc(quote.customerName)}</div>
  ${quote.address ? `<div style="font-size:11px;color:#333;margin-top:3px">${esc(quote.address)}</div>` : ""}
  ${quote.phone ? `<div style="font-size:11px;color:#333">Tel: ${esc(quote.phone)}</div>` : ""}
</div>

<table>
  <thead>
    <tr>
      <th class="l">Ürün / Hizmet</th>
      <th>Miktar</th>
      <th>Birim Fiyat</th>
      <th>Matrah</th>
      <th>KDV (%${vatRate})</th>
      <th>Tutar</th>
    </tr>
  </thead>
  <tbody>
    ${rows
      .map(
        r => `<tr>
      <td class="l">${esc(r.name)}</td>
      <td>${r.qty}</td>
      <td>${formatTL(r.unit)}</td>
      <td>${formatTL(r.net)}</td>
      <td>${formatTL(r.vat)}</td>
      <td>${formatTL(r.gross)}</td>
    </tr>`,
      )
      .join("")}
  </tbody>
</table>

<div class="totals">
  <div class="row"><span>Ara Toplam (Matrah)</span><span>${formatTL(totalNet)}</span></div>
  <div class="row"><span>KDV (%${vatRate})</span><span>${formatTL(totalVat)}</span></div>
  <div class="row grand"><span>Genel Toplam</span><span>${formatTL(totalGross)}</span></div>
</div>

${quote.notes ? `<div class="note">${esc(quote.notes)}</div>` : ""}
${company.iban ? `<div class="note"><b>IBAN:</b> ${esc(company.iban)}${company.bankName ? ` (${esc(company.bankName)})` : ""}</div>` : ""}

<div class="foot">
  Bu belge bağlayıcı satış sözleşmesi değil, fiyat teklifidir${quote.validUntil ? ` ve ${fmtDate(quote.validUntil)} tarihine kadar geçerlidir` : ""}.
  Belge ${companyName} tarafından ${new Date().toLocaleString("tr-TR")} tarihinde oluşturulmuştur.
</div>

<script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body></html>`);
  win.document.close();
}

/** Teklif özetini WhatsApp'tan göndermek için wa.me bağlantısı üretir. */
export function whatsappQuoteLink(quote: QuoteDoc, total: string | number, company: CompanyInfo): string {
  const co = company.companyName || "Art of Colour";
  const text =
    `*${co}* — Fiyat Teklifi\n` +
    `Teklif No: ${quote.quoteNo}\n` +
    `Sayın ${quote.customerName}\n` +
    `Toplam: ${formatTL(total)}\n` +
    (quote.validUntil ? `Geçerlilik: ${new Date(quote.validUntil).toLocaleDateString("tr-TR")}\n` : "") +
    `Değerlendirmenizi rica ederiz. 🎨`;
  const phone = (quote.phone ?? "").replace(/\D/g, "");
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
