import {
  groupReorderBySupplier,
  purchaseTotal,
  reorderToCsv,
  type PurchaseGroup,
  type PurchaseLine,
} from "@shared/purchaseOrder";

import { formatTL } from "./format";
import type { CompanyInfo } from "./invoice";

/**
 * Yeniden sipariş önerisinin yazdırılabilir dökümü (satın alma talep listesi).
 *
 * Fatura DEĞİLDİR: e-belge kesmez, muhasebeye kayıt düşmez. Amacı tedarikçiye
 * gönderilebilecek / eline alınabilecek bir liste vermek — eskiden bu düğme
 * yalnızca fatura sayfasına atıyordu ve 8 kalem elle yeniden yazılıyordu.
 * Tedarikçi başına ayrı blok, çünkü sipariş tedarikçi başına verilir.
 */

const esc = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

export function printPurchaseOrder(lines: PurchaseLine[], company: CompanyInfo) {
  const groups = groupReorderBySupplier(lines);
  if (groups.length === 0) return;

  const total = purchaseTotal(groups);
  const today = new Date().toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const companyName = company.companyName || "Art of Colour";
  const coLine = (label: string, key: string) =>
    company[key] ? `<div><span class="lbl">${label}:</span> ${esc(company[key])}</div>` : "";

  const block = (g: PurchaseGroup) => `
<div class="grp">
  <div class="grp-h">
    <div class="sup">${g.supplierName ? esc(g.supplierName) : "Tedarikçi tanımsız"}</div>
    <div class="cnt">${g.lines.length} kalem</div>
  </div>
  ${
    g.supplierName
      ? ""
      : `<div class="warn">Bu kalemlere tedarikçi atanmamış — sipariş verilmeden önce Stok &amp; Hammadde ekranından tedarikçi seçin.</div>`
  }
  <table>
    <thead>
      <tr>
        <th class="l">Hammadde</th>
        <th>Mevcut Stok</th>
        <th>Kritik Eşik</th>
        <th>Sipariş Miktarı</th>
        <th>Birim Maliyet</th>
        <th>Tahmini Tutar</th>
      </tr>
    </thead>
    <tbody>
      ${g.lines
        .map(
          l => `<tr>
        <td class="l">${esc(l.name)}</td>
        <td class="low">${l.stock} ${esc(l.unit)}</td>
        <td>${l.critical} ${esc(l.unit)}</td>
        <td class="qty">${l.suggestedQty} ${esc(l.unit)}</td>
        <td>${formatTL(l.unitCost)}</td>
        <td>${formatTL(l.estimatedCost)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="sub"><span>Ara toplam</span><span>${formatTL(g.subtotal)}</span></div>
</div>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return;

  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Satın Alma Talebi — ${today}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 12px; padding: 24px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
  .co { font-size: 11px; color: #333; line-height: 1.55; margin-top: 6px; }
  .co .lbl { color: #777; }
  .doc { text-align: right; }
  .doc h1 { font-size: 20px; letter-spacing: 1px; color: #1e1b4b; }
  .doc .meta { font-size: 11px; color: #333; margin-top: 8px; line-height: 1.6; }
  .grp { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; }
  .grp-h { display: flex; justify-content: space-between; align-items: baseline; background: #f4f4f7; padding: 9px 12px; border-bottom: 1px solid #e0e0e6; }
  .grp-h .sup { font-size: 13px; font-weight: 700; }
  .grp-h .cnt { font-size: 11px; color: #777; }
  .warn { background: #fffbeb; color: #92400e; font-size: 11px; padding: 7px 12px; border-bottom: 1px solid #fde68a; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #fafafc; text-align: right; padding: 7px 10px; font-size: 10px; color: #666; border-bottom: 1px solid #e0e0e6; }
  th.l, td.l { text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; text-align: right; }
  tr:last-child td { border-bottom: 0; }
  td.low { color: #be123c; font-weight: 600; }
  td.qty { font-weight: 700; }
  .sub { display: flex; justify-content: space-between; padding: 8px 12px; border-top: 1px solid #e0e0e6; background: #fafafc; font-size: 12px; font-weight: 600; }
  .grand { display: flex; justify-content: space-between; border-top: 2px solid #1e1b4b; margin-top: 8px; padding-top: 10px; font-size: 15px; font-weight: 800; color: #1e1b4b; }
  .foot { margin-top: 24px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px; line-height: 1.6; }
  @media print { body { padding: 0; } .actions { display: none; } }
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
      ${coLine("Adres", "companyAddress")}
      ${coLine("Tel", "companyPhone")}
      ${coLine("E-posta", "companyEmail")}
    </div>
  </div>
  <div class="doc">
    <h1>SATIN ALMA TALEBİ</h1>
    <div class="meta">
      <div><b>Tarih:</b> ${today}</div>
      <div><b>Kalem:</b> ${lines.length}</div>
    </div>
  </div>
</div>

${groups.map(block).join("")}

<div class="grand"><span>Genel Toplam (tahmini)</span><span>${formatTL(total)}</span></div>

<div class="foot">
  Sipariş miktarı stoğu kritik eşiğin 2 katına tamamlayacak şekilde önerilmiştir.
  Tutarlar son bilinen birim maliyete göre TAHMİNİDİR; tedarikçi fiyatı farklı olabilir.
  Bu belge fatura değildir.
</div>
</body></html>`);
  win.document.close();
}

/** Aynı dökümü Excel'de açılabilir dosya olarak indirir. */
export function downloadPurchaseCsv(lines: PurchaseLine[]) {
  const groups = groupReorderBySupplier(lines);
  if (groups.length === 0) return;
  // BOM olmadan Excel TR dosyayı Latin-1 okuyup Türkçe karakterleri bozuyor.
  const csv = "﻿" + reorderToCsv(groups);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `satin-alma-talebi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
