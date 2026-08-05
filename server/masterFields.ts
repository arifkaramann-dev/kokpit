/**
 * Pazaryeri alanlarını MASTER'dan türetir.
 *
 * Sorun: Trendyol/HB kategori başına zorunlu özellik (Renk, Hacim, Ürün Tipi)
 * ister. Bugüne kadar bu liste ayarlarda kategori başına SABİT duruyordu —
 * yani aynı kategorideki her ürüne aynı renk gidiyordu. Kırmızı da mavi de
 * "Kırmızı" olarak açılıyordu.
 *
 * Çözüm: master'ın küp koordinatı zaten pazaryerinin sorduğu bilgidir.
 *   renk ekseni    → Renk özelliği
 *   ambalaj ekseni → Hacim / Ambalaj Tipi özelliği
 *   form ekseni    → Ürün Tipi özelliği
 *   seri ekseni    → Ürün Grubu / Seri özelliği
 * `channelAttributes.source` hangi eksenden besleneceğini söyler;
 * `channelAttributeValues` bizim boyut kimliğimizi pazaryerinin değer
 * kimliğine çevirir (renk 12 → Trendyol 4521).
 *
 * Kural: eşleme yoksa YANLIŞ DEĞER GÖNDERİLMEZ. Zorunlu özellik eşlenmemişse
 * kalem adıyla bildirilir; kart açılmaz. Yanlış renkle açılan kart, hiç
 * açılmayan karttan pahalıdır (iade + puan düşüşü).
 *
 * Saf modül: ağ yok, veritabanı yok — test edilebilir.
 */

export type AttributeSource = "renk" | "ambalaj" | "form" | "seri" | "hacim" | "sabit";
export type DimensionKind = "renk" | "ambalaj" | "form" | "seri";

/** Kategori başına zorunlu özellik tanımı (channelAttributes satırı). */
export type ChannelAttributeDef = {
  attributeId: number;
  attributeName: string | null;
  source: AttributeSource;
  constantValueId: number | null;
  constantText: string | null;
  isRequired: boolean;
};

/** Boyut kimliği → pazaryeri değer kimliği köprüsü (channelAttributeValues). */
export type ChannelAttributeValueMap = {
  attributeId: number;
  dimensionKind: DimensionKind;
  dimensionId: number;
  attributeValueId: number | null;
  attributeText: string | null;
};

/** Özellik üretimi için master'ın küp koordinatı. */
export type AttributeMaster = {
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  /** Ambalaj hacmi — "hacim" kaynaklı özelliklerin serbest metin değeri. */
  volumeMl: number | null;
};

/** Pazaryerine giden tek özellik. */
export type ChannelAttributePayload = {
  attributeId: number;
  attributeValueId?: number;
  customAttributeValue?: string;
};

export type AttributeBuildResult = {
  attributes: ChannelAttributePayload[];
  /** Eşlenemeyen ZORUNLU özellikler — kalem gönderilmemeli. */
  missing: string[];
};

const dimensionOf = (source: AttributeSource): DimensionKind | null =>
  source === "renk" || source === "ambalaj" || source === "form" || source === "seri" ? source : null;

const dimensionIdOf = (kind: DimensionKind, master: AttributeMaster): number => {
  switch (kind) {
    case "renk":
      return master.colorId;
    case "ambalaj":
      return master.packagingId;
    case "form":
      return master.familyId;
    case "seri":
      return master.seriesId;
  }
};

/** Hacmi insan okunur yazar: 100 → "100 ml", 1000 → "1 lt". */
export function formatVolume(volumeMl: number): string {
  if (volumeMl >= 1000 && volumeMl % 1000 === 0) return `${volumeMl / 1000} lt`;
  const rounded = Math.round(volumeMl * 100) / 100;
  return `${rounded} ml`;
}

/**
 * Bir master için kategori özelliklerini üretir.
 *
 * `definitions` çağıran tarafından kanal+kategoriye göre süzülmüş olmalıdır.
 * Zorunlu olmayan özellik eşlenemezse sessizce atlanır (pazaryeri kabul eder);
 * zorunlu olan eşlenemezse `missing`'e yazılır ve kalem düşer.
 */
export function buildAttributes(input: {
  definitions: ChannelAttributeDef[];
  values: ChannelAttributeValueMap[];
  master: AttributeMaster;
}): AttributeBuildResult {
  const { definitions, values, master } = input;
  const attributes: ChannelAttributePayload[] = [];
  const missing: string[] = [];

  // (özellik, boyut türü, boyut kimliği) → eşleme
  const byKey = new Map<string, ChannelAttributeValueMap>();
  for (const v of values) byKey.set(`${v.attributeId}|${v.dimensionKind}|${v.dimensionId}`, v);

  for (const def of definitions) {
    const label = def.attributeName?.trim() || `#${def.attributeId}`;

    if (def.source === "sabit") {
      if (def.constantValueId) {
        attributes.push({ attributeId: def.attributeId, attributeValueId: def.constantValueId });
      } else if (def.constantText?.trim()) {
        attributes.push({ attributeId: def.attributeId, customAttributeValue: def.constantText.trim() });
      } else if (def.isRequired) {
        missing.push(`${label}: sabit değer girilmemiş`);
      }
      continue;
    }

    if (def.source === "hacim") {
      // Hacim serbest metin kabul edilir; boyut eşlemesi gerekmez.
      if (master.volumeMl && master.volumeMl > 0) {
        attributes.push({
          attributeId: def.attributeId,
          customAttributeValue: formatVolume(master.volumeMl),
        });
      } else if (def.isRequired) {
        missing.push(`${label}: ambalaj hacmi tanımsız`);
      }
      continue;
    }

    const kind = dimensionOf(def.source);
    if (!kind) continue;
    const dimensionId = dimensionIdOf(kind, master);
    const hit = byKey.get(`${def.attributeId}|${kind}|${dimensionId}`);

    if (!hit) {
      if (def.isRequired) missing.push(`${label}: ${kind} eşlemesi yok`);
      continue;
    }
    if (hit.attributeValueId) {
      attributes.push({ attributeId: def.attributeId, attributeValueId: hit.attributeValueId });
    } else if (hit.attributeText?.trim()) {
      attributes.push({ attributeId: def.attributeId, customAttributeValue: hit.attributeText.trim() });
    } else if (def.isRequired) {
      missing.push(`${label}: ${kind} eşlemesi boş`);
    }
  }

  return { attributes, missing };
}

/* ---- Lojistik alanları: desi · ağırlık · KDV ---------------------------- */

export type LogisticsMaster = {
  desi: number | null;
  weightG: number | null;
};

export type LogisticsPackaging = {
  volumeMl: number | null;
  weightG: number | null;
  desi: number | null;
};

export type LogisticsSeries = {
  vatRate: number | null;
};

export type ResolvedLogistics = {
  desi: number;
  weightG: number;
  vatRate: number;
  /** Değer nereden geldi — kullanıcı "neden 1 desi?" diye sorduğunda cevap. */
  desiSource: "master" | "ambalaj" | "hacimden" ;
  weightSource: "master" | "ambalaj" | "hacimden";
  vatSource: "seri" | "varsayilan";
};

/** Boya yoğunluğu (g/ml) — solvent bazlı boyalar için pratik ortalama. */
const PAINT_DENSITY = 1.05;
/** Kargo desisi 1'in altına inmez; küçük koli de 1 desi ücretlenir. */
const MIN_DESI = 1;

/**
 * Master'ın lojistik alanlarını çözer.
 *
 * Öncelik master → ambalaj → hacimden tahmin. Tahmin kaba ama kargo tarifesi
 * zaten 1 desi altını tek fiyatlandırdığı için 100-500 ml şişelerde sonucu
 * değiştirmez; yine de `desiSource` ile tahmin olduğu görünür kalır.
 */
export function resolveLogistics(input: {
  master: LogisticsMaster;
  packaging: LogisticsPackaging | null;
  series: LogisticsSeries | null;
}): ResolvedLogistics {
  const { master, packaging, series } = input;
  const volumeMl = packaging?.volumeMl ?? 0;

  let weightG: number;
  let weightSource: ResolvedLogistics["weightSource"];
  if (master.weightG && master.weightG > 0) {
    weightG = master.weightG;
    weightSource = "master";
  } else if (packaging?.weightG && packaging.weightG > 0) {
    weightG = packaging.weightG;
    weightSource = "ambalaj";
  } else {
    weightG = Math.round(volumeMl * PAINT_DENSITY);
    weightSource = "hacimden";
  }

  let desi: number;
  let desiSource: ResolvedLogistics["desiSource"];
  if (master.desi && master.desi > 0) {
    desi = master.desi;
    desiSource = "master";
  } else if (packaging?.desi && packaging.desi > 0) {
    desi = packaging.desi;
    desiSource = "ambalaj";
  } else {
    // Hacimsel ağırlık yaklaşık olarak litre başına 1 desi; ambalaj ve koli
    // payı için yukarı yuvarlanır.
    desi = Math.max(MIN_DESI, Math.ceil(volumeMl / 1000));
    desiSource = "hacimden";
  }

  const vatRate = series?.vatRate && series.vatRate > 0 ? series.vatRate : 20;
  return {
    desi: Math.max(MIN_DESI, desi),
    weightG,
    vatRate,
    desiSource,
    weightSource,
    vatSource: series?.vatRate && series.vatRate > 0 ? "seri" : "varsayilan",
  };
}

/* ---- Görsel mirası ------------------------------------------------------ */

export type ImageRow = {
  /** Dış adres; boşsa `id` üzerinden kendi sunucumuzdan servis edilir. */
  url: string | null;
  /** Yüklenen görselin satır kimliği — servis adresini üretmek için. */
  id?: number;
  sortOrder: number;
};

/** Yüklenen görselin kendi sunucumuzdaki yolu. */
export const masterImagePath = (id: number): string => `/api/img/master/${id}`;

/**
 * Satırdan görsel adresi: dış adres varsa o, yoksa kendi servis yolumuz.
 * İkisi de yoksa null — boş satır pazaryerine gönderilmez.
 */
export function imageUrlOf(row: ImageRow): string | null {
  const external = row.url?.trim();
  if (external) return external;
  return row.id ? masterImagePath(row.id) : null;
}

/**
 * Göreli yolu mutlak adrese çevirir — pazaryeri yalnız mutlak adres kabul eder.
 * Zaten mutlak olan (http/https) dokunulmadan geçer.
 */
export function absoluteImageUrl(url: string, publicBaseUrl: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = publicBaseUrl.trim().replace(/\/+$/, "");
  if (!base) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * İlan görselleri: ilanın kendi görseli varsa o, yoksa master'dan devralınır.
 *
 * Aynı fiziksel şişenin fotoğrafı "3D Baskı Boyası" ilanında da "Rapala
 * Boyası" ilanında da aynıdır; görseli ilan başına yüklemek 6 ilanlık bir
 * master'da 6 kat iş demekti. Master'a bir kez yüklenir, ilanlar devralır.
 */
export function resolveImages(input: {
  listingImages: ImageRow[];
  masterImages: ImageRow[];
  limit?: number;
  /** Verilirse göreli yollar mutlak adrese çevrilir (pazaryeri gönderimi). */
  publicBaseUrl?: string;
}): string[] {
  const source = input.listingImages.length > 0 ? input.listingImages : input.masterImages;
  const urls = [...source]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(imageUrlOf)
    .filter((u): u is string => Boolean(u))
    .map(u => (input.publicBaseUrl ? absoluteImageUrl(u, input.publicBaseUrl) : u));
  // Aynı görsel iki kez gönderilirse pazaryeri kartı tekrarlı gösterir.
  const unique = Array.from(new Set(urls));
  return input.limit ? unique.slice(0, input.limit) : unique;
}

/* ---- Özellik adından kaynak tahmini ------------------------------------- */

/**
 * Eksene ASLA bağlanmayan özellikler.
 *
 * Trendyol her kategoriye ürün güvenliği (GPSR) alanları ekledi: "Üretici Adı",
 * "Birincil İthalatçı Mail Adresi", "Menşei", "Kullanım Talimatı/Uyarıları",
 * "Paket Görseli (ön)"… Bunlar ürünün küp koordinatıyla değil ŞİRKETLE
 * ilgilidir; hepsi sabit değerdir ve çoğunun değer listesi yoktur.
 *
 * Bu kontrol ipuçlarından ÖNCE çalışır. "Paket Görseli (ön)" içindeki "paket"
 * kelimesi özelliği ambalaj eksenine bağlıyordu; ekranda "Eksik eşleme: Paket
 * Görseli (ön) — 0/12" paneli çıkıyor, ama seçenek listesi olmadığı için
 * hiçbir ambalaj eşlenemiyordu. Gerçek ambalaj/hacim özelliği de bu sahte
 * panellerin arasında kayboluyordu.
 */
const CONSTANT_ONLY =
  /ithalatç|üretici|imalatç|menşe|görsel|resim|mail|e-?posta|adres|telefon|iletişim|talimat|uyarı|güvenli|belge|sertifika|garanti|firma|marka sahibi|sorumlu|web sitesi|gtip|barkod/i;

/**
 * Ad, ürünün eksenlerinden türetilemeyecek kurumsal/yasal bir alanı mı
 * gösteriyor? İçe aktarma bunu kullanarak eski hatalı tahminleri de düzeltir.
 */
export function isConstantOnlyAttribute(attributeName: string): boolean {
  return CONSTANT_ONLY.test(attributeName.trim());
}

/** Türkçe ek payı: "tip" kökü "tipi"yi yakalar ama "Türkiye"yi yakalamaz. */
const SUFFIX_TOLERANCE = 3;

/** Adı sözcüklere böler: "Paket Görseli (ön)" → ["paket","görseli","ön"]. */
function attributeWords(name: string): string[] {
  return name
    .toLocaleLowerCase("tr")
    .split(/[^a-zçğıiöşü0-9]+/)
    .filter(Boolean);
}

/** Sözcüklerden biri bu kökle mi başlıyor (kısa Türkçe eki tolere ederek)? */
function hasStem(words: string[], stem: string): boolean {
  return words.some(
    w => w === stem || (w.startsWith(stem) && w.length - stem.length <= SUFFIX_TOLERANCE),
  );
}

/*
 * Kökler sözcük başına eşleşir; serbest `RegExp.test` değil. Eski liste çıplak
 * "tür"/"tip"/"paket" arıyordu ve ad içinde nerede geçerse geçsin kabul
 * ediyordu — bu yüzden yasal alanlar eksenlere dağılıyordu.
 * Sıra önemli: "Ambalaj Tipi" ambalajdır, ürün tipi değil.
 */
const SOURCE_HINTS: { source: AttributeSource; stems: string[]; phrases: string[] }[] = [
  { source: "renk", stems: ["renk", "color"], phrases: [] },
  { source: "hacim", stems: ["hacim", "miktar", "litre", "mililitre", "ml", "gramaj"], phrases: [] },
  { source: "ambalaj", stems: ["ambalaj", "paket", "şişe", "kutu"], phrases: ["kap tipi"] },
  { source: "form", stems: ["tip", "tür", "çeşit", "form"], phrases: ["ürün tipi", "ürün türü"] },
  { source: "seri", stems: ["seri", "model"], phrases: ["ürün grubu", "ürün ailesi"] },
];

/**
 * Pazaryerinden çekilen özellik adına bakarak hangi eksenden besleneceğini
 * tahmin eder. Yalnızca ilk kurulumda ön dolgu içindir — kullanıcı ekrandan
 * değiştirebilir. Tanınmayan ad "sabit" kalır; sessizce yanlış eksene
 * bağlanmaz.
 */
export function guessSource(attributeName: string): AttributeSource {
  const name = attributeName.trim();
  if (!name) return "sabit";
  if (isConstantOnlyAttribute(name)) return "sabit";

  const words = attributeWords(name);
  const joined = words.join(" ");
  for (const hint of SOURCE_HINTS) {
    if (hint.phrases.some(p => joined.includes(p))) return hint.source;
    if (hint.stems.some(s => hasStem(words, s))) return hint.source;
  }
  return "sabit";
}
