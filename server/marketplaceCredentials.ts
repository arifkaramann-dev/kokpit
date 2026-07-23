import { ENV } from "./_core/env";
import { getSettings, setSettings } from "./db";
import { isHbTestEnv } from "./hepsiburada";

/**
 * Pazaryeri kimlik bilgilerinin uygulama-içi yönetimi.
 *
 * İki kaynak vardır:
 *   1. Render → Environment değişkenleri (process.env) — varsayılan, güvenli.
 *   2. Uygulama içi Ayarlar ekranı — DB `settings` tablosunda `mp:<pazaryeri>:<alan>`.
 *
 * DB'de DOLU bir değer varsa env'in ÜZERİNE yazılır (canlıda hızlı düzeltme:
 * Render paneline girmeden anahtarı Ayarlar'dan değiştir). Boş DB değeri env
 * varsayılanını korur. Değerler `ENV.*` alanlarına yazıldığından mevcut
 * pazaryeri kodu (trendyol.ts, hepsiburada.ts, n11.ts, ciceksepeti.ts) hiç
 * değişmeden bu değerleri kullanır.
 *
 * Sırlar (apiKey/secret/password) istemciye ASLA ham gönderilmez; yalnızca
 * "tanımlı mı" + maskeli önizleme döner. Genel `settings.get` de "mp:" ön ekli
 * anahtarları gizler (server/modules/sistem.ts).
 */

export const MP_KEY_PREFIX = "mp:";

export type CredType = "text" | "password" | "select";

export type CredField = {
  /** ENV nesnesindeki alan adı (bu alana overlay yazılır). */
  envField: keyof typeof ENV;
  /** DB anahtarının son parçası: mp:<mp>:<field>. */
  field: string;
  label: string;
  type: CredType;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** DB değerini ENV biçimine çevirir (varsayılan: aynen yazar). */
  toEnv?: (dbVal: string) => string;
  /** Hiç DB değeri yokken ekranda gösterilecek varsayılan (env'den türetilir). */
  envDisplay?: () => string;
};

export type MarketplaceCredDef = {
  key: string;
  label: string;
  docHint: string;
  fields: CredField[];
};

export const MARKETPLACE_CREDENTIALS: MarketplaceCredDef[] = [
  {
    key: "trendyol",
    label: "Trendyol",
    docHint: "Satıcı Paneli → Hesap Bilgilerim → Entegrasyon Bilgileri",
    fields: [
      { envField: "trendyolSellerId", field: "sellerId", label: "Satıcı ID", type: "text", placeholder: "123456" },
      { envField: "trendyolApiKey", field: "apiKey", label: "API Key", type: "password", secret: true },
      { envField: "trendyolApiSecret", field: "apiSecret", label: "API Secret", type: "password", secret: true },
    ],
  },
  {
    key: "hepsiburada",
    label: "Hepsiburada",
    docHint: "Merchant paneli → Entegrasyon / OMS bilgileri",
    fields: [
      { envField: "hepsiburadaMerchantId", field: "merchantId", label: "Merchant ID (GUID)", type: "text" },
      {
        envField: "hepsiburadaUsername",
        field: "username",
        label: "Developer Username",
        type: "text",
        help: "İsteklerde User-Agent olarak gönderilir.",
      },
      { envField: "hepsiburadaPassword", field: "password", label: "Secretkey (şifre)", type: "password", secret: true },
      {
        envField: "hepsiburadaServiceKey",
        field: "serviceKey",
        label: "Servis Anahtarı (Listing — opsiyonel)",
        type: "password",
        secret: true,
        help: "Stok/fiyat için ayrı anahtar; boşsa şifre kullanılır.",
      },
      {
        envField: "hepsiburadaEnv",
        field: "env",
        label: "Ortam",
        type: "select",
        options: [
          { value: "prod", label: "Canlı (üretim)" },
          { value: "sit", label: "Test (SIT)" },
        ],
        toEnv: v => (v === "sit" ? "sit" : ""),
        envDisplay: () => (isHbTestEnv() ? "sit" : "prod"),
        help: "Test (SIT) modunda otomatik sipariş senkronu kapalıdır.",
      },
    ],
  },
  {
    key: "n11",
    label: "N11",
    docHint: "Mağaza paneli → Entegrasyon / API",
    fields: [
      { envField: "n11AppKey", field: "appKey", label: "App Key", type: "password", secret: true },
      { envField: "n11AppSecret", field: "appSecret", label: "App Secret", type: "password", secret: true },
    ],
  },
  {
    key: "ciceksepeti",
    label: "Çiçeksepeti",
    docHint: "Satıcı paneli → API Bilgileri",
    fields: [{ envField: "ciceksepetiApiKey", field: "apiKey", label: "x-api-key", type: "password", secret: true }],
  },
];

const dbKey = (mp: string, field: string) => `${MP_KEY_PREFIX}${mp}:${field}`;

/**
 * Sunucu açılışından ÖNCE, env'den okunan saf varsayılanların anlık kopyası.
 * (Modül yüklenirken alınır; refresh ENV'i değiştirse bile buradan orijinal
 * env değeri okunabilir — "kaynak env mi DB mi?" ayrımı için gerekir.)
 */
const ENV_DEFAULTS: Record<string, string> = {};
for (const mp of MARKETPLACE_CREDENTIALS) {
  for (const f of mp.fields) {
    ENV_DEFAULTS[f.envField as string] = String((ENV as Record<string, unknown>)[f.envField] ?? "");
  }
}

function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

/**
 * DB'deki `mp:` değerlerini env üzerine bindirir. DB erişilemezse (yerel/test)
 * sessizce çıkar; env varsayılanları geçerli kalır.
 */
export async function refreshMarketplaceCredentials(): Promise<void> {
  let cfg: Record<string, string>;
  try {
    cfg = await getSettings();
  } catch {
    return;
  }
  for (const mp of MARKETPLACE_CREDENTIALS) {
    for (const f of mp.fields) {
      const stored = cfg[dbKey(mp.key, f.field)];
      if (stored !== undefined && stored !== "") {
        (ENV as Record<string, unknown>)[f.envField as string] = f.toEnv ? f.toEnv(stored) : stored;
      }
    }
  }
}

export type MaskedCredField = {
  field: string;
  label: string;
  type: CredType;
  secret: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** Değer tanımlı mı (env veya DB'den)? */
  isSet: boolean;
  /** Değer nereden geliyor: DB (uygulama içi), env (Render), yok. */
  source: "db" | "env" | "empty";
  /** Sır OLMAYAN alanların mevcut değeri (Satıcı ID, ortam vb.). */
  value?: string;
  /** Sır alanların maskeli önizlemesi (••••1234). */
  masked?: string;
};

export type MaskedMarketplace = {
  key: string;
  label: string;
  docHint: string;
  testMode?: boolean;
  fields: MaskedCredField[];
};

/** Ayarlar ekranı için: her pazaryerinin alan durumları (sır alanlar maskeli). */
export async function getMarketplaceCredentials(): Promise<MaskedMarketplace[]> {
  const cfg = await getSettings().catch(() => ({}) as Record<string, string>);
  return MARKETPLACE_CREDENTIALS.map(mp => ({
    key: mp.key,
    label: mp.label,
    docHint: mp.docHint,
    testMode: mp.key === "hepsiburada" ? isHbTestEnv() : undefined,
    fields: mp.fields.map((f): MaskedCredField => {
      const stored = cfg[dbKey(mp.key, f.field)] ?? "";
      const envDefault = ENV_DEFAULTS[f.envField as string] ?? "";
      const source: "db" | "env" | "empty" = stored !== "" ? "db" : envDefault !== "" ? "env" : "empty";
      const common = {
        field: f.field,
        label: f.label,
        type: f.type,
        secret: Boolean(f.secret),
        placeholder: f.placeholder,
        help: f.help,
        options: f.options,
        source,
      };
      if (f.secret) {
        const effective = stored || envDefault;
        return { ...common, isSet: Boolean(effective), masked: maskSecret(effective) };
      }
      if (f.type === "select") {
        const value = stored || (f.envDisplay ? f.envDisplay() : envDefault) || f.options?.[0]?.value || "";
        return { ...common, isSet: true, source: stored !== "" ? "db" : "env", value };
      }
      const value = stored || envDefault;
      return { ...common, isSet: Boolean(value), value };
    }),
  }));
}

/**
 * Ayarlar ekranından gelen değerleri DB'ye yazar ve overlay'i tazeler.
 * Girdi anahtarları "<pazaryeri>:<alan>" biçiminde (ör. "trendyol:apiKey").
 * Boş bırakılan SIR alanı "dokunma" demektir (mevcut değer korunur);
 * sır olmayan alan boş kaydedilebilir (temizleme).
 */
export async function saveMarketplaceCredentials(input: Record<string, string>): Promise<{ saved: number }> {
  const defByKey = new Map<string, CredField>();
  for (const mp of MARKETPLACE_CREDENTIALS) {
    for (const f of mp.fields) defByKey.set(`${mp.key}:${f.field}`, f);
  }
  const entries: Record<string, string> = {};
  for (const [k, rawVal] of Object.entries(input)) {
    const def = defByKey.get(k);
    if (!def) continue; // bilinmeyen anahtarı yok say
    const val = rawVal.trim();
    if (def.secret && val === "") continue; // boş sır = değiştirme
    entries[`${MP_KEY_PREFIX}${k}`] = val;
  }
  if (Object.keys(entries).length > 0) await setSettings(entries);
  await refreshMarketplaceCredentials();
  return { saved: Object.keys(entries).length };
}
