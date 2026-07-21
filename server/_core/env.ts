export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  ownerPassword: process.env.OWNER_PASSWORD ?? "",
  ownerName: process.env.OWNER_NAME ?? "",
  trendyolSellerId: process.env.TRENDYOL_SELLER_ID ?? "",
  trendyolApiKey: process.env.TRENDYOL_API_KEY ?? "",
  trendyolApiSecret: process.env.TRENDYOL_API_SECRET ?? "",
  hepsiburadaMerchantId: process.env.HEPSIBURADA_MERCHANT_ID ?? "",
  hepsiburadaUsername: process.env.HEPSIBURADA_USERNAME ?? "",
  hepsiburadaPassword: process.env.HEPSIBURADA_PASSWORD ?? "",
  // Listing (stok/fiyat) API'si için "Servis Anahtarı"; boşsa şifre kullanılır.
  hepsiburadaServiceKey: process.env.HEPSIBURADA_SERVICE_KEY ?? "",
  // "sit" = Hepsiburada TEST ortamı (canlıya geçiş testleri). Boş = canlı (prod).
  // Test modunda otomatik sipariş senkronu kapalıdır (test verisi panoya karışmasın).
  hepsiburadaEnv: (process.env.HEPSIBURADA_ENV ?? "").toLowerCase(),
  // Katalog (MPOP) tabanı; boşsa HEPSIBURADA_ENV'e göre seçilir.
  hepsiburadaMpopBaseUrl: process.env.HEPSIBURADA_MPOP_BASE_URL ?? "",
  // N11 REST API (api.n11.com) — appKey/appSecret başlıklarıyla kimlik.
  n11AppKey: process.env.N11_APP_KEY ?? "",
  n11AppSecret: process.env.N11_APP_SECRET ?? "",
  // Çiçeksepeti REST API (apis.ciceksepeti.com) — x-api-key başlığı.
  ciceksepetiApiKey: process.env.CICEKSEPETI_API_KEY ?? "",
  // Sesli uyandırma (Picovoice Porcupine). AccessKey tarayıcıda kullanılır; repoya girmez.
  // Keyword/Model yolları boşsa hazır İngilizce kelime + gömülü model kullanılır.
  picovoiceAccessKey: process.env.PICOVOICE_ACCESS_KEY ?? "",
  picovoiceKeywordPath: process.env.PICOVOICE_KEYWORD_PATH ?? "",
  picovoiceKeywordLabel: process.env.PICOVOICE_KEYWORD_LABEL ?? "",
  picovoiceModelPath: process.env.PICOVOICE_MODEL_PATH ?? "",
  // PAYTR sanal POS (kendi web mağaza ödemesi). Anahtarlar yalnızca Render'da.
  paytrMerchantId: process.env.PAYTR_MERCHANT_ID ?? "",
  paytrMerchantKey: process.env.PAYTR_MERCHANT_KEY ?? "",
  paytrMerchantSalt: process.env.PAYTR_MERCHANT_SALT ?? "",
  // e-Fatura/e-Arşiv entegratörü (soyut). Sağlayıcı: izibiz/uyumsoft/parasut vb.
  efaturaProvider: process.env.EFATURA_PROVIDER ?? "",
  efaturaUsername: process.env.EFATURA_USERNAME ?? "",
  efaturaPassword: process.env.EFATURA_PASSWORD ?? "",
  efaturaApiUrl: process.env.EFATURA_API_URL ?? "",
  // Kargo toplayıcı (Navlungo/Basit Kargo vb.) — otomatik etiket/takip.
  kargoProvider: process.env.KARGO_PROVIDER ?? "",
  kargoApiKey: process.env.KARGO_API_KEY ?? "",
  kargoApiUrl: process.env.KARGO_API_URL ?? "",
  // Geliver kargo pazaryeri (kendi mağaza gönderileri). Token: app.geliver.io/apitokens.
  geliverToken: process.env.GELIVER_API_TOKEN ?? "",
  // Varsayılan gönderici adresi ID'si (bir kez oluşturulur, panelden/API'den alınır).
  geliverSenderAddressId: process.env.GELIVER_SENDER_ADDRESS_ID ?? "",
  // "1" = Geliver test modu (gerçek etiket satın alınmaz, ücret yansımaz).
  geliverTestMode: process.env.GELIVER_TEST_MODE ?? "",
  // Bizimhesap B2B API (e-Fatura/ön muhasebe köprüsü). FirmID panel destek talebiyle alınır.
  bizimhesapFirmId: process.env.BIZIMHESAP_FIRM_ID ?? "",
  // Mağazanın herkese açık adresi (SEO/sitemap ve PAYTR dönüş adresleri için).
  publicStoreUrl: process.env.PUBLIC_STORE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
