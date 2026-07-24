import { ENV } from "./_core/env";

/**
 * Kargo entegrasyonu — kendi mağaza/elden siparişleri için gönderi + etiket.
 *
 * Birincil sağlayıcı: **Geliver** (geliver.io — patron zaten kullanıyor).
 * API: https://docs.geliver.io · Temel: https://api.geliver.io/api/v1
 * Kimlik: `Authorization: Bearer <GELIVER_API_TOKEN>` (app.geliver.io/apitokens).
 * Akış (iki adım): POST /shipments (gönderi + teklifler) → teklifler KULLANICIYA
 * gösterilir, kullanıcı kargo firmasını SEÇER → seçilen teklif POST /transactions
 * ile satın alınır → yanıtta takip no + etiket URL'si döner. (Otomatik "en ucuz"
 * DEĞİL; tercih kullanıcıda.) Satın alma başarısızsa gönderi yine oluşur.
 *
 * GELIVER_TEST_MODE=1 iken gönderiler test modunda açılır (ücret yansımaz) —
 * ilk kurulum doğrulaması bu modda yapılır. Kurulum rehberi: KARGO.md.
 *
 * Geliver dışı jenerik sağlayıcı (KARGO_PROVIDER/API_KEY/API_URL) eskisi gibi
 * iskelet olarak durur; anahtarı gelirse adaptörü yazılır.
 */

const GELIVER_BASE = process.env.GELIVER_API_BASE_URL ?? "https://api.geliver.io/api/v1";

export function isGeliverConfigured(): boolean {
  return Boolean(ENV.geliverToken);
}

export function isKargoConfigured(): boolean {
  return isGeliverConfigured() || Boolean(ENV.kargoProvider && ENV.kargoApiKey && ENV.kargoApiUrl);
}

export type ShipmentInput = {
  orderNo: string;
  recipientName: string;
  phone: string;
  address: string;
  city?: string;
  district?: string;
  desi?: number;
  note?: string | null;
};

/** Sağlayıcıdan bağımsız gönderi yükü (saf/testli). Adaptör bunu kendi biçimine çevirir. */
export function buildShipmentPayload(input: ShipmentInput) {
  return {
    reference: input.orderNo,
    recipient: {
      name: input.recipientName.trim(),
      phone: input.phone.replace(/\D/g, ""),
      address: input.address.trim(),
      city: input.city?.trim() || null,
      district: input.district?.trim() || null,
    },
    parcel: { desi: input.desi && input.desi > 0 ? input.desi : 1 },
    note: input.note ?? null,
  };
}

// 81 il — plaka sırasıyla (indeks+1 = plaka kodu). Geliver gönderide hem "cityName"
// hem "cityCode" (plaka) ister; ikisi eksik/uyumsuzsa "Şehir bulunamadı" (E1165/E1172)
// döner. Sipariş/cari kartında şehir yoksa adres metninden çıkarmak için de kullanılır.
const TR_PROVINCES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin",
  "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale",
  "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum",
  "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin",
  "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli",
  "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir",
  "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat",
  "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt",
  "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük",
  "Kilis", "Osmaniye", "Düzce",
];
// Adreslerde sık geçen kısaltmalar/eski adlar → resmî il adı.
const PROVINCE_ALIASES: Record<string, string> = {
  afyon: "Afyonkarahisar", icel: "Mersin", maras: "Kahramanmaraş",
  kmaras: "Kahramanmaraş", urfa: "Şanlıurfa", surfa: "Şanlıurfa",
};

/** Türkçe harfleri ASCII'ye katlar (İ/ı→i, ş→s, ...) — karşılaştırma için. */
function foldTr(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u");
}

// İl adı (normalize) → resmî ad + plaka kodu. extractCity/cityCode ortak kaynağı.
const PROVINCE_BY_KEY = new Map(TR_PROVINCES.map((name, i) => [foldTr(name).replace(/[^a-z]/g, ""), { name, code: String(i + 1).padStart(2, "0") }]));

/**
 * Adres metninden Türkiye ilini bulur (Geliver'in zorunlu şehir alanı için).
 * İl adı tam kelime olarak aranır (ör. "Van" → "Divan"a takılmaz). Birden çok
 * il geçerse metnin SONUNDAKİ seçilir (adreste il genelde en sonda yazılır).
 * Bulunamazsa "".
 */
export function extractCityFromAddress(address: string | null | undefined): string {
  if (!address?.trim()) return "";
  const folded = ` ${foldTr(address).replace(/[^a-z]+/g, " ")} `;
  let best = "";
  let bestPos = -1;
  for (const prov of TR_PROVINCES) {
    const token = foldTr(prov).replace(/[^a-z]/g, "");
    const pos = folded.lastIndexOf(` ${token} `);
    if (pos > bestPos) {
      bestPos = pos;
      best = prov;
    }
  }
  if (!best) {
    for (const [alias, canon] of Object.entries(PROVINCE_ALIASES)) {
      if (folded.includes(` ${alias} `)) return canon;
    }
  }
  return best;
}

/** İl adından resmî ad + plaka kodunu döner (Geliver cityName+cityCode için). Bulunamazsa null. */
export function resolveProvince(cityName: string | null | undefined): { name: string; code: string } | null {
  if (!cityName?.trim()) return null;
  const key = foldTr(cityName).replace(/[^a-z]/g, "");
  const direct = PROVINCE_BY_KEY.get(key);
  if (direct) return direct;
  const alias = PROVINCE_ALIASES[key];
  if (alias) return PROVINCE_BY_KEY.get(foldTr(alias).replace(/[^a-z]/g, "")) ?? null;
  return null;
}

/**
 * Adresten ilçe (districtName) tahmini: adres "…İlçe/İl" ya da "…İlçe İl" biçiminde
 * yazıldığından, ilin hemen ÖNÜNDEKİ anlamlı kelime ilçe kabul edilir (Mah./Sok./
 * Cad./No gibi ekler atlanır). Bulunamazsa "". (Geliver districtName ister; zayıf
 * tahmin bile boş göndermekten iyidir, şehir kodu ile birlikte kabul şansını artırır.)
 */
export function extractDistrictFromAddress(address: string | null | undefined, cityName: string): string {
  if (!address?.trim() || !cityName.trim()) return "";
  const cityKey = foldTr(cityName).replace(/[^a-z]/g, "");
  // Orijinal kelimeler + normalize eşl
  const rawWords = address.split(/[\s,./\\-]+/).filter(Boolean);
  const foldWords = rawWords.map(w => foldTr(w).replace(/[^a-z]/g, ""));
  const skip = new Set(["mah", "mahalle", "mahallesi", "sok", "sokak", "cad", "cadde", "caddesi", "no", "kat", "daire", "blok", "apt", "sitesi", "site", "bulvar", "bulvari", "cd", "sk"]);
  const cityIdx = foldWords.lastIndexOf(cityKey);
  if (cityIdx > 0) {
    for (let i = cityIdx - 1; i >= 0; i--) {
      const w = foldWords[i];
      if (!w || skip.has(w) || /^\d/.test(rawWords[i])) continue;
      return rawWords[i];
    }
  }
  return "";
}

/**
 * Türkiye cep/sabit telefonunu uluslararası biçime çevirir: "+90XXXXXXXXXX".
 * WhatsApp deep-link ve Geliver alıcı telefonu bu biçimi ister (0532… çözülmez).
 */
export function toIntlPhoneTR(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("90")) d = d.slice(2);
  // Kalan 10 hane (5XXXXXXXXX / 2XXXXXXXXX) beklenir; değilse olduğu gibi bırak.
  return `+90${d}`;
}

/** Desiden küp kenarı (cm): desi = en×boy×yükseklik / 3000. Saf/testli. */
export function desiToEdgeCm(desi: number): string {
  const d = desi > 0 ? desi : 1;
  return Math.max(1, Math.cbrt(d * 3000)).toFixed(1);
}

export type ShipmentResult = {
  created: boolean;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  /** Sağlayıcıdaki gönderi kimliği (panelden bulmak için). */
  shipmentId?: string | null;
  reason?: string;
};

type GeliverOffer = {
  id?: string;
  ID?: string;
  totalAmount?: string | number;
  amount?: string | number;
  price?: string | number;
  currency?: string;
  currencyCode?: string;
  provider?: string;
  providerCode?: string;
  providerName?: string;
  providerServiceName?: string;
  serviceName?: string;
  providerServiceCode?: string;
  estimatedDeliveryDate?: string;
  estimatedDeliveryTime?: string;
  deliveryTime?: string;
};

/** Kullanıcının seçebilmesi için sadeleştirilmiş teklif (kargo firması + fiyat). */
export type ShipmentOffer = {
  id: string;
  carrier: string; // firma/servis adı (görünen)
  amount: number;
  currency: string;
  estDays: string | null;
};

export type ShipmentQuote = {
  created: boolean;
  provider: string | null;
  shipmentId: string | null;
  offers: ShipmentOffer[];
  reason?: string;
};

/** Yanıt sarmalayıcısını açar ({data: ...} ya da düz nesne). */
function unwrap(json: unknown): Record<string, unknown> {
  const j = json as Record<string, unknown> | null;
  return ((j?.data ?? j) ?? {}) as Record<string, unknown>;
}

/**
 * Geliver teklifleri düz dizi OLABİLİR ya da nesne olarak gelebilir
 * (ör. {cheapest, fastest} veya {list:[…]}). Her iki biçimi de teklif dizisine çevirir.
 */
function toOfferArray(raw: unknown): GeliverOffer[] {
  if (Array.isArray(raw)) return raw as GeliverOffer[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["list", "all", "data", "offers", "rates", "items", "results"]) {
      if (Array.isArray(o[k])) return o[k] as GeliverOffer[];
    }
    const singles = ["cheapest", "fastest", "recommended", "best", "selected"]
      .map(k => o[k])
      .filter(v => v && typeof v === "object") as GeliverOffer[];
    if (singles.length) return singles;
  }
  return [];
}

/** Ham Geliver tekliflerini görünür tekliflere çevirir (en ucuzdan pahalıya sıralı). */
export function parseGeliverOffers(raw: unknown): ShipmentOffer[] {
  const list = toOfferArray(raw);
  return list
    .map(o => {
      const carrier =
        (o.providerServiceName || o.serviceName || o.providerName || o.provider || o.providerCode || o.providerServiceCode || "Kargo")
          .toString()
          .trim();
      return {
        id: String(o.id ?? o.ID ?? ""),
        carrier,
        amount: parseFloat(String(o.totalAmount ?? o.amount ?? o.price ?? "")),
        currency: (o.currency ?? o.currencyCode ?? "TRY").toString(),
        estDays: (o.estimatedDeliveryDate ?? o.estimatedDeliveryTime ?? o.deliveryTime ?? null) as string | null,
      };
    })
    .filter(o => o.id && Number.isFinite(o.amount))
    .sort((a, b) => a.amount - b.amount);
}

async function geliverFetch(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await fetch(`${GELIVER_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ENV.geliverToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* metin kalsın */
  }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 500) };
}

type GeliverAddress = {
  id?: string; ID?: string; _id?: string;
  type?: string;
  isSenderAddress?: boolean; isSender?: boolean;
  isReturnAddress?: boolean; isReturn?: boolean;
  isDefault?: boolean; default?: boolean;
};

// Gönderici adres ID'si oturum boyu bir kez çözülür (undefined = henüz denenmedi).
let cachedSenderAddressId: string | null | undefined;

/** Geliver adres listesinden gönderici (çıkış) adresini seçer; iade adresini eler. */
function pickSenderAddress(list: GeliverAddress[]): string | null {
  const idOf = (a: GeliverAddress) => (String(a.id ?? a.ID ?? a._id ?? "") || null);
  const isReturn = (a: GeliverAddress) => a.isReturnAddress === true || a.isReturn === true || /return|iade/i.test(a.type ?? "");
  const isSender = (a: GeliverAddress) => a.isSenderAddress === true || a.isSender === true || /sender|gonder|pickup|cikis|çıkış/i.test(a.type ?? "");
  const senders = list.filter(a => idOf(a) && isSender(a) && !isReturn(a));
  const pool = senders.length ? senders : list.filter(a => idOf(a) && !isReturn(a));
  const chosen = pool.find(a => a.isDefault === true || a.default === true) ?? pool[0];
  return chosen ? idOf(chosen) : null;
}

/**
 * Gönderici adres ID'sini çözer: önce env (GELIVER_SENDER_ADDRESS_ID), yoksa
 * Geliver hesabındaki kayıtlı adreslerden (GET /addresses) otomatik seçer. Geliver
 * teklif için gönderici adresini ZORUNLU ister; bu sayede patronun ID'yi elle
 * girmesine gerek kalmaz (hesapta gönderici adresi tanımlıysa).
 */
async function resolveGeliverSenderAddressId(): Promise<string | null> {
  if (ENV.geliverSenderAddressId) return ENV.geliverSenderAddressId;
  if (cachedSenderAddressId !== undefined) return cachedSenderAddressId;
  try {
    const res = await geliverFetch("/addresses");
    const j = res.json as Record<string, unknown> | GeliverAddress[] | null;
    const list = (Array.isArray(j) ? j : (j?.["data"] ?? j?.["list"] ?? j?.["addresses"] ?? j?.["result"] ?? [])) as GeliverAddress[];
    cachedSenderAddressId = pickSenderAddress(Array.isArray(list) ? list : []);
    console.info(
      cachedSenderAddressId
        ? `Geliver gönderici adresi otomatik seçildi: ${cachedSenderAddressId}`
        : `Geliver /addresses gönderici adresi bulunamadı — ham: ${JSON.stringify(res.json).slice(0, 400)}`,
    );
    return cachedSenderAddressId;
  } catch (err) {
    console.warn("Geliver /addresses çekilemedi:", err instanceof Error ? err.message : err);
    cachedSenderAddressId = null;
    return null;
  }
}

/**
 * Geliver'de gönderi oluşturur ve teklifleri (kargo firması + fiyat) döndürür —
 * SATIN ALMAZ. Kullanıcı hangi firmayı istediğini seçer, sonra buyShipmentOffer
 * çağrılır. Böylece "her zaman en ucuz" yerine tercih kullanıcıda kalır.
 */
async function createGeliverShipment(input: ShipmentInput): Promise<ShipmentQuote> {
  const edge = desiToEdgeCm(input.desi ?? 1);
  // Geliver şehir doğrulaması cityName + cityCode (plaka) ister; ikisi birlikte
  // gönderilmezse "Şehir bulunamadı" (E1165/E1172) döner. İlçe (districtName) de
  // beklenir — adresten çıkarılır. Telefon uluslararası (+90) olmalı.
  const province = resolveProvince(input.city || extractCityFromAddress(input.address));
  const districtName = input.district?.trim() || extractDistrictFromAddress(input.address, province?.name ?? "");
  const recipientAddress: Record<string, unknown> = {
    name: input.recipientName.trim().slice(0, 100) || "Alıcı",
    phone: toIntlPhoneTR(input.phone),
    address1: input.address.trim().slice(0, 250),
    cityName: province?.name ?? input.city?.trim() ?? "",
    districtName,
    countryCode: "TR",
  };
  if (province?.code) recipientAddress.cityCode = province.code;
  const body: Record<string, unknown> = {
    // Test modunda gerçek etiket satın alınmaz; kurulum doğrulaması içindir.
    test: ENV.geliverTestMode === "1",
    recipientAddress,
    length: edge,
    width: edge,
    height: edge,
    distanceUnit: "cm",
    weight: String(input.desi && input.desi > 0 ? input.desi : 1),
    massUnit: "kg",
    order: { orderNumber: input.orderNo, sourceIdentifier: "kokpit" },
  };
  // Gönderici adresi zorunlu — env yoksa Geliver hesabından otomatik çekilir.
  const senderAddressId = await resolveGeliverSenderAddressId();
  if (senderAddressId) body.senderAddressID = senderAddressId;

  const created = await geliverFetch("/shipments", { method: "POST", body: JSON.stringify(body) });
  if (!created.ok) {
    return {
      created: false,
      provider: "geliver",
      shipmentId: null,
      offers: [],
      reason: `Geliver gönderi oluşturulamadı (${created.status}): ${created.text}`,
    };
  }
  const ship = unwrap(created.json);
  const shipmentId = String(ship.id ?? ship.ID ?? "") || null;
  // Teklifler create yanıtında farklı adlarda/biçimde gelebilir (offers dizi ya da
  // {cheapest,…} nesnesi). Hem açılmış (data) hem ham gövde denenir.
  const offers = parseGeliverOffers(
    ship.offers ?? ship.priceOffers ?? ship.rates ?? ship.offerList ?? (created.json as Record<string, unknown>)?.offers ?? [],
  );

  if (offers.length === 0) {
    // Teşhis: teklif neden boş? Ham yanıt Render loguna (sender adresi mi eksik,
    // yoksa teklifler beklenmedik alanda mı?).
    console.info(`Geliver teklif boş — ham yanıt: ${JSON.stringify(created.json).slice(0, 700)}`);
    // Geliver teklif için gönderici (çıkış) adresini ZORUNLU ister; ne env'de ne de
    // hesapta gönderici adresi varsa hiç teklif dönmez. En sık sebep budur.
    const reason = !senderAddressId
      ? "Geliver hesabında gönderici (çıkış) adresi tanımlı değil — bu yüzden fiyat teklifi dönmüyor. app.geliver.io → Adreslerim'den gönderici adresinizi ekleyin (bir kez); sistem ID'yi otomatik bulur."
      : "Gönderi oluştu ama fiyat teklifi dönmedi (desi/adres detayı kontrol edilebilir). Etiket Geliver panelinden alınabilir.";
    return { created: true, provider: "geliver", shipmentId, offers: [], reason };
  }
  return { created: true, provider: "geliver", shipmentId, offers };
}

/** Seçilen teklifi satın alır → takip no + etiket URL döner. */
async function buyGeliverOffer(offerId: string): Promise<ShipmentResult> {
  const buy = await geliverFetch("/transactions", { method: "POST", body: JSON.stringify({ offerID: offerId }) });
  if (!buy.ok) {
    return {
      created: false,
      provider: "geliver",
      trackingNumber: null,
      trackingUrl: null,
      labelUrl: null,
      reason: `Teklif satın alınamadı (${buy.status}): ${buy.text} — etiketi Geliver panelinden alabilirsin (app.geliver.io).`,
    };
  }
  const tx = unwrap(buy.json);
  const shipment = unwrap(tx.shipment ?? tx);
  const trackingNumber = String(shipment.trackingNumber ?? shipment.barcode ?? tx.trackingNumber ?? "") || null;
  const labelUrl = String(shipment.labelURL ?? shipment.labelUrl ?? tx.labelURL ?? "") || null;
  const trackingUrl = String(shipment.trackingUrl ?? shipment.trackingURL ?? "") || null;
  return { created: true, provider: "geliver", trackingNumber, trackingUrl, labelUrl };
}

/**
 * Gönderi açıp TEKLİFLERİ döndürür (satın almaz). Yapılandırma yoksa created:false
 * döner (akış bozulmaz). Kullanıcı teklif seçince buyShipmentOffer çağrılır.
 */
export async function openShipment(input: ShipmentInput): Promise<ShipmentQuote> {
  if (isGeliverConfigured()) {
    return createGeliverShipment(input);
  }
  if (!isKargoConfigured()) {
    return { created: false, provider: null, shipmentId: null, offers: [], reason: "Kargo entegrasyonu yapılandırılmamış (manuel gönderim). Kurulum: KARGO.md (Geliver)." };
  }
  // Jenerik sağlayıcı adaptörü henüz bağlanmadı; payload hazır.
  buildShipmentPayload(input);
  return { created: false, provider: ENV.kargoProvider, shipmentId: null, offers: [], reason: `Sağlayıcı adaptörü (${ENV.kargoProvider}) henüz canlı bağlanmadı — payload hazır` };
}

/** Kullanıcının seçtiği teklifi satın alır. */
export async function buyShipmentOffer(offerId: string): Promise<ShipmentResult> {
  if (!isGeliverConfigured()) {
    return { created: false, provider: null, trackingNumber: null, trackingUrl: null, labelUrl: null, reason: "Kargo entegrasyonu yapılandırılmamış." };
  }
  return buyGeliverOffer(offerId);
}
