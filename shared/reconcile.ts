/**
 * Banka ekstresi mutabakatı — saf mantık (client + server + testler ortak).
 * İnternet bankacılığından indirilen CSV/Excel ekstresini satırlara çevirir ve
 * tutar + tarih yakınlığıyla mevcut tahsilat/ödeme kayıtlarıyla eşleştirir.
 */

import { norm, parsePriceNumber, splitCsvLine } from "./pricing";

export type BankLine = {
  date: string; // YYYY-MM-DD (mümkünse)
  description: string;
  /** Pozitif = para girişi (tahsilat), negatif = çıkış (ödeme). */
  amount: number;
  line: number;
};

const DATE_HEADERS = ["tarih", "islem tarihi", "date", "valor"];
const DESC_HEADERS = ["aciklama", "açıklama", "description", "detay"];
const AMOUNT_HEADERS = ["tutar", "amount", "islem tutari", "hareket"];

/** "12.05.2026" / "2026-05-12" / "12/05/2026" → YYYY-MM-DD (çözemezse ham metin). */
export function normalizeDate(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return t;
}

/** Ekstre CSV metnini banka satırlarına çevirir. Başlıkları esnek eşler. */
export function parseBankStatement(text: string): { lines: BankLine[]; errors: string[] } {
  const rows = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (rows.length < 2) return { lines: [], errors: ["Dosyada başlık + en az bir satır olmalı."] };
  const sep = (rows[0].match(/;/g)?.length ?? 0) >= (rows[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitCsvLine(rows[0], sep).map(norm);

  const dateIdx = headers.findIndex(h => DATE_HEADERS.includes(h));
  const descIdx = headers.findIndex(h => DESC_HEADERS.includes(h));
  const amountIdx = headers.findIndex(h => AMOUNT_HEADERS.some(a => h.includes(a)));
  const errors: string[] = [];
  if (dateIdx < 0) errors.push('Tarih sütunu bulunamadı ("Tarih").');
  if (amountIdx < 0) errors.push('Tutar sütunu bulunamadı ("Tutar").');
  if (errors.length) return { lines: [], errors };

  const lines: BankLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = splitCsvLine(rows[i], sep);
    const amount = parsePriceNumber(cells[amountIdx] ?? "");
    if (!Number.isFinite(amount)) {
      errors.push(`Satır ${i + 1}: tutar okunamadı — atlandı.`);
      continue;
    }
    lines.push({
      date: normalizeDate(cells[dateIdx] ?? ""),
      description: (descIdx >= 0 ? cells[descIdx] ?? "" : "").trim(),
      amount,
      line: i + 1,
    });
  }
  return { lines, errors };
}

export type LedgerTxn = { id: number; date: string; amount: number; label: string };

export type ReconcileMatch = {
  bankLine: BankLine;
  txnId: number | null;
  txnLabel: string | null;
  /** exact = tutar+tarih birebir; amount = sadece tutar; none = eşleşmedi. */
  confidence: "exact" | "amount" | "none";
};

/**
 * Banka satırlarını kayıtlarla eşleştirir: önce aynı gün + aynı tutar (exact),
 * sonra ±`dayTolerance` gün içinde aynı tutar (amount). Her kayıt bir kez eşleşir.
 */
export function reconcile(bankLines: BankLine[], txns: LedgerTxn[], dayTolerance = 3): ReconcileMatch[] {
  const used = new Set<number>();
  const dayMs = 86400000;
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;

  return bankLines.map(bl => {
    const blTime = new Date(bl.date).getTime();
    let exact: LedgerTxn | undefined;
    let amountOnly: LedgerTxn | undefined;
    for (const t of txns) {
      if (used.has(t.id) || !eq(t.amount, bl.amount)) continue;
      const dd = Number.isNaN(blTime) ? Infinity : Math.abs(new Date(t.date).getTime() - blTime) / dayMs;
      if (dd === 0) { exact = t; break; }
      if (dd <= dayTolerance && !amountOnly) amountOnly = t;
    }
    const chosen = exact ?? amountOnly;
    if (chosen) {
      used.add(chosen.id);
      return { bankLine: bl, txnId: chosen.id, txnLabel: chosen.label, confidence: exact ? "exact" : "amount" };
    }
    return { bankLine: bl, txnId: null, txnLabel: null, confidence: "none" };
  });
}
