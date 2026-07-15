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
  // Sesli uyandırma (Picovoice Porcupine). AccessKey tarayıcıda kullanılır; repoya girmez.
  // Keyword/Model yolları boşsa hazır İngilizce kelime + gömülü model kullanılır.
  picovoiceAccessKey: process.env.PICOVOICE_ACCESS_KEY ?? "",
  picovoiceKeywordPath: process.env.PICOVOICE_KEYWORD_PATH ?? "",
  picovoiceKeywordLabel: process.env.PICOVOICE_KEYWORD_LABEL ?? "",
  picovoiceModelPath: process.env.PICOVOICE_MODEL_PATH ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
