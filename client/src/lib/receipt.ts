import { formatTL } from "./format";

export type ReceiptData = {
  no: string | number;
  date: string | Date;
  direction: "in" | "out";
  amount: string | number;
  category: string;
  party?: string | null; // müşteri / tedarikçi
  method?: string | null;
  account?: string | null;
  description?: string | null;
};

export type CompanyInfo = Record<string, string>;

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Tahsilat/Ödeme makbuzu (bilgi belgesi) yazdırma penceresi açar.
 * direction in → TAHSİLAT MAKBUZU (alındı), out → ÖDEME MAKBUZU (verildi).
 */
export function printReceipt(r: ReceiptData, company: CompanyInfo) {
  const isIn = r.direction === "in";
  const title = isIn ? "TAHSİLAT MAKBUZU" : "ÖDEME MAKBUZU";
  const partyLabel = isIn ? "Tahsil edilen (müşteri)" : "Ödenen (tedarikçi)";
  const verb = isIn ? "tahsil edilmiştir" : "ödenmiştir";
  const date = new Date(r.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const companyName = company.companyName || "Art of Colour";
  const line = (label: string, key: string) =>
    company[key] ? `<div><span class="lbl">${label}:</span> ${esc(company[key])}</div>` : "";

  const win = window.open("", "_blank", "width=760,height=560");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>${title} ${esc(String(r.no))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 13px; padding: 28px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 22px; }
  .brand { font-size: 19px; font-weight: 800; }
  .co { font-size: 11px; color: #333; line-height: 1.55; margin-top: 6px; }
  .co .lbl { color: #888; }
  .doc h1 { font-size: 18px; letter-spacing: 1px; color: ${isIn ? "#047857" : "#b91c1c"}; }
  .doc .meta { font-size: 11px; color: #333; margin-top: 6px; text-align: right; line-height: 1.6; }
  .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px 18px; margin-top: 8px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eee; }
  .row:last-child { border-bottom: none; }
  .row .k { color: #666; }
  .amount { margin-top: 18px; text-align: center; }
  .amount .big { font-size: 30px; font-weight: 800; color: ${isIn ? "#047857" : "#b91c1c"}; }
  .statement { margin-top: 18px; font-size: 12px; color: #444; line-height: 1.6; }
  .sign { margin-top: 46px; display: flex; justify-content: space-between; font-size: 12px; color: #555; }
  .sign div { border-top: 1px solid #999; padding-top: 6px; width: 40%; text-align: center; }
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
    <h1>${title}</h1>
    <div class="meta">
      <div><b>No:</b> ${esc(String(r.no))}</div>
      <div><b>Tarih:</b> ${date}</div>
    </div>
  </div>
</div>
<div class="box">
  <div class="row"><span class="k">${partyLabel}</span><span><b>${esc(r.party || "-")}</b></span></div>
  <div class="row"><span class="k">İşlem türü</span><span style="text-transform:capitalize">${esc(r.category)}</span></div>
  ${r.method ? `<div class="row"><span class="k">Ödeme yöntemi</span><span>${esc(r.method)}</span></div>` : ""}
  ${r.account ? `<div class="row"><span class="k">Hesap</span><span>${esc(r.account)}</span></div>` : ""}
  ${r.description ? `<div class="row"><span class="k">Açıklama</span><span>${esc(r.description)}</span></div>` : ""}
</div>
<div class="amount">
  <div class="big">${formatTL(r.amount)}</div>
</div>
<div class="statement">
  Yukarıda belirtilen <b>${formatTL(r.amount)}</b> tutar, ${date} tarihinde
  ${esc(r.party || "ilgili")} ${isIn ? "'den" : "'e"} <b>${verb}</b>.
  Bu belge bilgilendirme amaçlı makbuzdur.
</div>
<div class="sign">
  <div>Teslim Eden</div>
  <div>Teslim Alan</div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`);
  win.document.close();
}
