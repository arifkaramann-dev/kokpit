import { ENV } from "./_core/env";

/**
 * e-Fatura / e-Arşiv entegratör soyutlaması. Sağlayıcıdan bağımsız fatura
 * yükü (payload) üretir; gerçek gönderim sağlayıcı adaptörüne devredilir.
 * Anahtarlar yalnızca Render'da; yoksa fatura "taslak" olarak üretilir, gönderilmez.
 *
 * Sağlayıcı seçimi EFATURA_PROVIDER ile (izibiz/uyumsoft/parasut...). Şimdilik
 * jenerik adaptör payload'ı döner; canlı entegratör anlaşması gelince
 * muhasebe-entegrasyon-uzmani ilgili adaptörü doldurur.
 */

export function isEfaturaConfigured(): boolean {
  return Boolean(ENV.efaturaProvider && ENV.efaturaUsername && ENV.efaturaPassword && ENV.efaturaApiUrl);
}

export type InvoiceLine = {
  name: string;
  quantity: number;
  unitPrice: number; // KDV dahil birim fiyat
  vatPercent: number;
};

export type CompanyInfo = {
  name: string;
  taxNumber: string;
  taxOffice: string;
  address: string;
};

export type CustomerInfo = {
  name: string;
  taxNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type InvoicePayload = {
  invoiceType: "e-fatura" | "e-arsiv";
  company: CompanyInfo;
  customer: CustomerInfo;
  lines: {
    name: string;
    quantity: number;
    unitPriceEx: number; // KDV hariç birim
    vatPercent: number;
    vatAmount: number;
    lineTotalEx: number;
  }[];
  subtotalEx: number;
  vatTotal: number;
  grandTotal: number; // KDV dahil
  note?: string | null;
};

/** Vergi numarası 10 hane ise kurumsal (e-fatura), 11 hane TCKN ise bireysel (e-arşiv). */
export function decideInvoiceType(customerTaxNumber?: string | null): "e-fatura" | "e-arsiv" {
  const digits = (customerTaxNumber ?? "").replace(/\D/g, "");
  return digits.length === 10 ? "e-fatura" : "e-arsiv";
}

/** Sipariş/satış kalemlerinden sağlayıcıdan bağımsız fatura yükü üretir (saf/testli). */
export function buildInvoicePayload(input: {
  company: CompanyInfo;
  customer: CustomerInfo;
  lines: InvoiceLine[];
  note?: string | null;
}): InvoicePayload {
  const lines = input.lines.map(l => {
    const v = 1 + l.vatPercent / 100;
    const unitPriceEx = l.unitPrice / v;
    const lineTotalEx = unitPriceEx * l.quantity;
    const vatAmount = (l.unitPrice - unitPriceEx) * l.quantity;
    return {
      name: l.name,
      quantity: l.quantity,
      unitPriceEx: +unitPriceEx.toFixed(4),
      vatPercent: l.vatPercent,
      vatAmount: +vatAmount.toFixed(2),
      lineTotalEx: +lineTotalEx.toFixed(2),
    };
  });
  const subtotalEx = +lines.reduce((s, l) => s + l.lineTotalEx, 0).toFixed(2);
  const vatTotal = +lines.reduce((s, l) => s + l.vatAmount, 0).toFixed(2);
  const grandTotal = +(subtotalEx + vatTotal).toFixed(2);
  return {
    invoiceType: decideInvoiceType(input.customer.taxNumber),
    company: input.company,
    customer: input.customer,
    lines,
    subtotalEx,
    vatTotal,
    grandTotal,
    note: input.note ?? null,
  };
}

export type SendInvoiceResult = {
  sent: boolean;
  provider: string | null;
  /** Sağlayıcı fatura kimliği (UUID/ETTN) — gönderildiyse. */
  externalId: string | null;
  /** Gönderilmediyse neden (yapılandırma yok vb.). */
  reason?: string;
};

/**
 * Faturayı entegratöre gönderir. Yapılandırma yoksa taslak döner (sent:false)
 * — akış bozulmaz; anahtar gelince aynı çağrı gerçek gönderime döner.
 */
export async function sendInvoice(payload: InvoicePayload): Promise<SendInvoiceResult> {
  if (!isEfaturaConfigured()) {
    return { sent: false, provider: null, externalId: null, reason: "e-Fatura entegratörü yapılandırılmamış (taslak olarak hazır)" };
  }
  // Canlı entegratör adaptörü buraya gelecek (izibiz/uyumsoft/parasut).
  // Şu an güvenli varsayılan: göndermeyi denemeyip taslak bırak (yanlış canlı çağrı yapma).
  return {
    sent: false,
    provider: ENV.efaturaProvider,
    externalId: null,
    reason: `Sağlayıcı adaptörü (${ENV.efaturaProvider}) henüz canlı bağlanmadı — payload hazır`,
  };
}
