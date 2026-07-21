import { ENV } from "./_core/env";

/**
 * e-Fatura / e-Arşiv entegratör soyutlaması. Sağlayıcıdan bağımsız fatura
 * yükü (payload) üretir; gerçek gönderim sağlayıcı adaptörüne devredilir.
 * Anahtarlar yalnızca Render'da; yoksa fatura "taslak" olarak üretilir, gönderilmez.
 *
 * Birincil sağlayıcı: **Bizimhesap** (patron zaten abone, 21.07.2026 kararı).
 * B2B API: https://apidocs.bizimhesap.com — POST /api/b2b/addinvoice, kimlik
 * tek alanla: firmId (Bizimhesap panel → destek talebiyle alınır). Fatura
 * Bizimhesap'a işlenir; GİB'e e-Fatura/e-Arşiv gönderimini Bizimhesap'ın
 * kendi e-fatura altyapısı yapar (mali mühür onlara tanımlı olmalı).
 * Kurulum: EFATURA_PROVIDER=bizimhesap + BIZIMHESAP_FIRM_ID (Render).
 *
 * Diğer sağlayıcılar (izibiz/uyumsoft/parasut) için jenerik iskelet durur.
 */

export function isEfaturaConfigured(): boolean {
  if (ENV.efaturaProvider.toLowerCase() === "bizimhesap") return Boolean(ENV.bizimhesapFirmId);
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

/* ------------------------- Bizimhesap B2B adaptörü ------------------------- */

const BIZIMHESAP_ADDINVOICE_URL = ENV.efaturaApiUrl || "https://bizimhesap.com/api/b2b/addinvoice";

/**
 * InvoicePayload → Bizimhesap addinvoice gövdesi (saf/testli).
 * Alan adları apidocs.bizimhesap.com/addinvoice belgesindekiyle birebirdir:
 * firmId, invoiceNo, invoiceType (3=satış), dates, customer, details[], amounts.
 * Tutar kuralı: unitPrice/gross/net KDV HARİÇ, tax ayrı, total = net + tax.
 */
export function buildBizimhesapInvoice(payload: InvoicePayload, firmId: string, invoiceNo?: string | null) {
  const now = new Date().toISOString();
  const details = payload.lines.map((l, i) => {
    const total = +(l.lineTotalEx + l.vatAmount).toFixed(2);
    return {
      productId: String(i + 1),
      productName: l.name,
      note: "",
      barcode: "",
      taxRate: String(l.vatPercent),
      quantity: l.quantity,
      unitPrice: l.unitPriceEx.toFixed(2),
      grossPrice: l.lineTotalEx.toFixed(2),
      discount: "0",
      net: l.lineTotalEx.toFixed(2),
      tax: l.vatAmount.toFixed(2),
      total: total.toFixed(2),
    };
  });
  return {
    firmId,
    invoiceNo: invoiceNo ?? "",
    invoiceType: 3, // 3 = satış faturası, 5 = alış
    note: payload.note ?? "",
    dates: { invoiceDate: now, dueDate: now },
    customer: {
      customerId: "",
      title: payload.customer.name,
      taxOffice: "",
      taxNo: (payload.customer.taxNumber ?? "").replace(/\D/g, ""),
      email: payload.customer.email ?? "",
      address: payload.customer.address ?? "",
      phone: payload.customer.phone ?? "",
    },
    amounts: {
      currency: "TL",
      gross: payload.subtotalEx.toFixed(2),
      discount: "0",
      net: payload.subtotalEx.toFixed(2),
      tax: payload.vatTotal.toFixed(2),
      total: payload.grandTotal.toFixed(2),
    },
    details,
  };
}

async function sendInvoiceBizimhesap(payload: InvoicePayload, invoiceNo?: string | null): Promise<SendInvoiceResult> {
  const body = buildBizimhesapInvoice(payload, ENV.bizimhesapFirmId, invoiceNo);
  const res = await fetch(BIZIMHESAP_ADDINVOICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = (await res.text().catch(() => "")).slice(0, 500);
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* metin kalsın */
  }
  // Belgede başarı gövdesi net tanımlı değil; hata alanları savunmacı okunur.
  const errorText = json && typeof json.error === "string" && json.error ? json.error : null;
  if (!res.ok || errorText) {
    return {
      sent: false,
      provider: "bizimhesap",
      externalId: null,
      reason: `Bizimhesap addinvoice başarısız (${res.status}): ${errorText ?? text}`,
    };
  }
  const idCandidate = json?.guid ?? json?.invoiceGuid ?? json?.id ?? json?.url;
  return { sent: true, provider: "bizimhesap", externalId: idCandidate != null ? String(idCandidate) : null };
}

/**
 * Faturayı entegratöre gönderir. Yapılandırma yoksa taslak döner (sent:false)
 * — akış bozulmaz; anahtar gelince aynı çağrı gerçek gönderime döner.
 */
export async function sendInvoice(payload: InvoicePayload, opts?: { invoiceNo?: string | null }): Promise<SendInvoiceResult> {
  if (!isEfaturaConfigured()) {
    return { sent: false, provider: null, externalId: null, reason: "e-Fatura entegratörü yapılandırılmamış (taslak olarak hazır). Kurulum: EFATURA.md (Bizimhesap)" };
  }
  if (ENV.efaturaProvider.toLowerCase() === "bizimhesap") {
    try {
      return await sendInvoiceBizimhesap(payload, opts?.invoiceNo);
    } catch (error) {
      return {
        sent: false,
        provider: "bizimhesap",
        externalId: null,
        reason: `Bizimhesap bağlantı hatası: ${error instanceof Error ? error.message : "bilinmeyen"}`,
      };
    }
  }
  // Diğer sağlayıcı adaptörleri (izibiz/uyumsoft/parasut) henüz bağlanmadı.
  return {
    sent: false,
    provider: ENV.efaturaProvider,
    externalId: null,
    reason: `Sağlayıcı adaptörü (${ENV.efaturaProvider}) henüz canlı bağlanmadı — payload hazır`,
  };
}
