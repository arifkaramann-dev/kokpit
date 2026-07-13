import * as db from "./db";

/**
 * e-Fatura / e-Arşiv entegrasyon temeli.
 *
 * Türkiye'de e-Arşiv/e-Fatura göndermek GİB onaylı bir ENTEGRATÖR
 * (İzibiz / Uyumsoft / Foriba vb.) ile sözleşme ve kimlik bilgisi gerektirir.
 * Her entegratörün API sözleşmesi farklıdır; bu modül entegratörden bağımsız
 * bir soyutlama sağlar:
 *   1) Ayarlardan entegratör bilgilerini okur (Ayarlar > e-Fatura).
 *   2) Siparişten standart (normalize) fatura verisini üretir.
 *   3) Yapılandırılmış entegratör "gateway" URL'sine POST eder.
 *
 * `einvoice_api_url` girilmediğinde net bir "yapılandırılmadı" hatası döner —
 * sahte bir başarı üretmez. Entegratör seçilince, o entegratörün alan
 * eşlemesi bu dosyada `buildProviderPayload` içinde netleştirilir.
 */

export type EInvoiceConfig = {
  provider: string; // izibiz | uyumsoft | foriba | custom
  apiUrl: string;
  username: string;
  password: string;
  testMode: boolean;
};

export type EInvoiceLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  vatAmount: number;
};

export type NormalizedInvoice = {
  invoiceType: "e-arsiv" | "e-fatura";
  invoiceNo: string;
  date: string;
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  lines: EInvoiceLine[];
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  seller: {
    name: string;
    address: string | null;
    taxOffice: string | null;
    taxNumber: string | null;
  };
};

export async function getEInvoiceConfig(): Promise<EInvoiceConfig> {
  const s = await db.getSettings();
  return {
    provider: s.einvoice_provider ?? "",
    apiUrl: s.einvoice_api_url ?? "",
    username: s.einvoice_username ?? "",
    password: s.einvoice_password ?? "",
    testMode: (s.einvoice_test_mode ?? "true") !== "false",
  };
}

export async function isEInvoiceConfigured(): Promise<boolean> {
  const c = await getEInvoiceConfig();
  return Boolean(c.provider && c.apiUrl && c.username);
}

/**
 * Kalem satırlarından KDV dökümlü fatura satırlarını üretir (saf fonksiyon).
 * Birim fiyatlar KDV DAHİL kabul edilir; matrah ve KDV ayrıştırılır.
 */
export function computeInvoiceLines(
  items: { productName: string; quantity: number | string; unitPrice: number | string }[],
  vatRate: number,
): EInvoiceLine[] {
  return items.map(i => {
    const qty = parseFloat(String(i.quantity)) || 0;
    const unit = parseFloat(String(i.unitPrice)) || 0;
    const gross = qty * unit; // KDV dahil
    const net = gross / (1 + vatRate / 100);
    const vat = gross - net;
    return {
      name: i.productName,
      quantity: qty,
      unitPrice: unit,
      vatRate,
      lineTotal: round2(net),
      vatAmount: round2(vat),
    };
  });
}

/** Siparişten (kalemleri ve şirket bilgisiyle) normalize fatura verisi üretir. */
export async function buildInvoiceForOrder(orderId: number, invoiceNo: string): Promise<NormalizedInvoice> {
  const order = await db.getOrder(orderId);
  if (!order) throw new Error("Sipariş bulunamadı");
  const items = await db.listOrderItems(orderId);
  const settings = await db.getSettings();
  const vatRate = parseFloat(settings.vatRate ?? "20") || 20;

  const lines = computeInvoiceLines(items as never, vatRate);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  const grandTotal = round2(subtotal + vatTotal);

  return {
    // Bireysel müşteriye (vergi no yoksa) e-Arşiv; kurumsala e-Fatura seçilir.
    invoiceType: "e-arsiv",
    invoiceNo,
    date: new Date().toISOString().slice(0, 10),
    customerName: order.customerName,
    customerAddress: order.customerAddress,
    customerPhone: order.customerPhone,
    lines,
    subtotal,
    vatTotal,
    grandTotal,
    seller: {
      name: settings.companyName ?? "",
      address: settings.companyAddress ?? null,
      taxOffice: settings.taxOffice ?? null,
      taxNumber: settings.taxNumber ?? null,
    },
  };
}

/**
 * Normalize faturayı entegratörün beklediği gövdeye çevirir.
 * Şu an entegratörden bağımsız düz JSON gönderiyoruz; entegratör seçilince
 * (İzibiz/Uyumsoft/Foriba) burada o entegratörün alan adlarına eşlenir.
 */
function buildProviderPayload(inv: NormalizedInvoice, config: EInvoiceConfig) {
  return {
    provider: config.provider,
    testMode: config.testMode,
    invoice: inv,
  };
}

export type SendResult = { ok: true; uuid: string | null; status: string; raw?: unknown };

/** Normalize faturayı yapılandırılmış entegratör gateway'ine gönderir. */
export async function sendEInvoice(inv: NormalizedInvoice): Promise<SendResult> {
  const config = await getEInvoiceConfig();
  if (!config.provider || !config.apiUrl || !config.username) {
    throw new Error(
      "e-Fatura entegratörü yapılandırılmamış. Ayarlar > e-Fatura'dan entegratör (İzibiz/Uyumsoft/Foriba), " +
        "API adresi ve kullanıcı bilgilerini girin. e-Arşiv göndermek için GİB onaylı bir entegratörle sözleşme gerekir.",
    );
  }

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    },
    body: JSON.stringify(buildProviderPayload(inv, config)),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Entegratör kimlik bilgileri reddedildi (yetki hatası). Kullanıcı adı/şifreyi kontrol edin.");
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`e-Fatura gönderimi başarısız (${res.status}): ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { uuid?: string; id?: string; status?: string };
  return { ok: true, uuid: data.uuid ?? data.id ?? null, status: data.status ?? "sent", raw: data };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
