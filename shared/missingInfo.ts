/**
 * Eksik müşteri bilgisi — kargo ve fatura için gerekenler (saf modül).
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Sipariş geliyor, kargo etiketi basılacak ama adres yarım; fatura kesilecek
 * ama TCKN/VKN yok. Bu eksikler ancak o iş yapılmaya çalışılırken, yani
 * gönderim gününde ortaya çıkıyor ve sipariş bekliyor. Eksikleri ÖNCEDEN
 * listeleyip müşteriye tek mesajla sormak, o beklemeyi tamamen kaldırıyor.
 *
 * ── Neyi eksik sayarız ────────────────────────────────────────────────────
 * "Boş mu" yetmez: adres alanı "Bursa" yazıyorsa dolu ama kargoya vermeye
 * yetmez. Bu yüzden alanlar makul asgari uzunluk/biçim kontrolünden geçer.
 * TCKN 11, VKN 10 hanedir; ikisi de değilse yazılan şey vergi numarası değildir.
 *
 * Pazaryeri siparişleri hariç tutulabilir: adres ve fatura bilgisi pazaryerinden
 * gelir, müşteriye sormak hem gereksiz hem rahatsız edicidir.
 *
 * Saf modül — veritabanı yok, test edilebilir.
 */

export type MissingField = "adres" | "telefon" | "vergiNo" | "vergiDairesi" | "email";

export const FIELD_LABELS: Record<MissingField, string> = {
  adres: "açık adres (mahalle, sokak, no, ilçe/il)",
  telefon: "cep telefonu",
  vergiNo: "TC kimlik no veya vergi numarası",
  vergiDairesi: "vergi dairesi",
  email: "e-posta",
};

export type InfoOrder = {
  id: number;
  orderNo: string;
  customerName: string;
  customerId: number | null;
  customerPhone: string | null;
  customerAddress: string | null;
  channel: string | null;
  status: string;
  totalAmount: number | string;
};

export type InfoCustomer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  eInvoice?: string | null;
};

/** Kargoya verilebilecek kadar adres var mı? "Bursa" tek başına yetmez. */
export function isUsableAddress(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (v.length < 20) return false;
  // En az bir rakam (kapı/bina no) ve en az üç kelime bekleriz.
  return /\d/.test(v) && v.split(/\s+/).filter(Boolean).length >= 3;
}

/** Aranabilir bir Türk telefon numarası mı? */
export function isUsablePhone(value: string | null | undefined): boolean {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return false;
  // 10 hane (5xxxxxxxxx), 11 hane (05xx…) ya da 12 hane (90 5xx…).
  const last10 = digits.slice(-10);
  return last10.startsWith("5") || digits.length >= 10;
}

/** TCKN 11, VKN 10 hane. Başka uzunluk vergi numarası değildir. */
export function isUsableTaxNumber(value: string | null | undefined): boolean {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export type MissingRow = {
  customerId: number | null;
  customerName: string;
  phone: string | null;
  /** Bilgi eksik olan açık siparişler. */
  orders: { id: number; orderNo: string; channel: string | null }[];
  missing: MissingField[];
  /** Müşteriye gönderilecek hazır mesaj. */
  message: string;
  /** Telefon varsa tek tık WhatsApp linki. */
  waLink: string | null;
};

export type MissingInfoOptions = {
  /** Fatura için vergi bilgisi de istensin mi (kurumsal satışta şart). */
  requireTax?: boolean;
  /** Pazaryeri siparişleri dahil edilsin mi (varsayılan: hayır). */
  includeMarketplace?: boolean;
  /** Mesajda kullanılacak firma adı. */
  companyName?: string;
};

const MARKETPLACE_CHANNELS = ["trendyol", "hepsiburada", "n11", "ciceksepeti", "çiçeksepeti"];

const isMarketplace = (channel: string | null) =>
  MARKETPLACE_CHANNELS.includes((channel ?? "").trim().toLocaleLowerCase("tr-TR"));

/**
 * Müşteriye gönderilecek mesaj.
 *
 * Kasten kısa ve tek amaçlı: neden istendiği bir cümleyle söylenir, istenenler
 * madde madde sıralanır. Uzun mesaj cevapsız kalır.
 */
export function buildRequestMessage(input: {
  customerName: string;
  orderNos: string[];
  missing: MissingField[];
  companyName?: string;
}): string {
  const firm = input.companyName?.trim() || "Art of Colour";
  const orderPart =
    input.orderNos.length === 1
      ? `${input.orderNos[0]} numaralı siparişinizi`
      : input.orderNos.length > 1
        ? `${input.orderNos.slice(0, 3).join(", ")} numaralı siparişlerinizi`
        : "siparişinizi";

  return [
    `Merhaba ${input.customerName},`,
    "",
    `${firm} olarak ${orderPart} hazırlıyoruz. Kargo ve fatura işlemlerini tamamlayabilmemiz için aşağıdaki bilgilere ihtiyacımız var:`,
    "",
    ...input.missing.map((f, i) => `${i + 1}. ${FIELD_LABELS[f]}`),
    "",
    "Bu mesaja yanıt olarak yazmanız yeterli. Teşekkürler 🙏",
  ].join("\n");
}

/**
 * Açık siparişleri tarayıp eksik bilgileri müşteri bazında toplar.
 *
 * Müşteri bazında gruplanır: aynı kişinin üç siparişi için üç ayrı mesaj
 * göndermek hem rahatsız edici hem gereksiz.
 */
export function findMissingInfo(
  orders: InfoOrder[],
  customers: InfoCustomer[],
  opts: MissingInfoOptions = {},
): MissingRow[] {
  const customerById = new Map(customers.map(c => [c.id, c]));
  const customerByName = new Map(
    customers.map(c => [c.name.trim().toLocaleLowerCase("tr-TR"), c]),
  );

  // Bilgi ancak GÖNDERİLMEMİŞ sipariş için anlamlı; tamamlanan ya da iptal
  // edilen siparişin adresini sormak müşteriyi şaşırtır.
  const open = orders.filter(
    o =>
      (o.status === "new" || o.status === "production" || o.status === "ready") &&
      (opts.includeMarketplace ? true : !isMarketplace(o.channel)),
  );

  type Group = { name: string; customer: InfoCustomer | null; orders: InfoOrder[] };
  const groups = new Map<string, Group>();
  for (const o of open) {
    const customer =
      (o.customerId != null ? customerById.get(o.customerId) : undefined) ??
      customerByName.get(o.customerName.trim().toLocaleLowerCase("tr-TR")) ??
      null;
    const key = customer ? `c${customer.id}` : `n:${o.customerName.trim().toLocaleLowerCase("tr-TR")}`;
    const g = groups.get(key) ?? { name: customer?.name ?? o.customerName, customer, orders: [] };
    g.orders.push(o);
    groups.set(key, g);
  }

  const rows: MissingRow[] = [];
  for (const g of Array.from(groups.values())) {
    // Bilgi hem siparişte hem cari kartında olabilir; ikisinden biri yeterli.
    const address =
      g.orders.map(o => o.customerAddress).find(isUsableAddress) ?? g.customer?.address ?? null;
    const phone = g.orders.map(o => o.customerPhone).find(isUsablePhone) ?? g.customer?.phone ?? null;

    const missing: MissingField[] = [];
    if (!isUsableAddress(address)) missing.push("adres");
    if (!isUsablePhone(phone)) missing.push("telefon");
    if (opts.requireTax) {
      if (!isUsableTaxNumber(g.customer?.taxNumber)) missing.push("vergiNo");
      if (!(g.customer?.taxOffice ?? "").trim()) missing.push("vergiDairesi");
    }
    if (missing.length === 0) continue;

    const orderNos = g.orders.map(o => o.orderNo);
    const message = buildRequestMessage({
      customerName: g.name,
      orderNos,
      missing,
      companyName: opts.companyName,
    });
    const digits = (phone ?? "").replace(/\D/g, "");
    // wa.me uluslararası format ister; 0 ile başlayan yerel numara 90 ile açılır.
    const waNumber =
      digits.length === 10 ? `90${digits}` : digits.length === 11 && digits.startsWith("0") ? `90${digits.slice(1)}` : digits;

    rows.push({
      customerId: g.customer?.id ?? null,
      customerName: g.name,
      phone,
      orders: g.orders.map(o => ({ id: o.id, orderNo: o.orderNo, channel: o.channel })),
      missing,
      message,
      waLink: waNumber.length >= 12 ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : null,
    });
  }

  // Önce en çok eksiği olan ve en çok siparişi bekleyen müşteri.
  rows.sort((a, b) => b.missing.length - a.missing.length || b.orders.length - a.orders.length);
  return rows;
}
