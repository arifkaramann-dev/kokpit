import { ENV } from "./_core/env";
import { isCiceksepetiConfigured, syncCiceksepetiOrders, testCiceksepetiConnection } from "./ciceksepeti";
import { isHbTestEnv, isHepsiburadaConfigured, syncHepsiburadaOrders, testHepsiburadaConnection } from "./hepsiburada";
import { isN11Configured, syncN11Orders, testN11Connection } from "./n11";
import { isTrendyolConfigured, syncTrendyolOrders, testTrendyolConnection } from "./trendyol";

/**
 * Pazaryeri entegrasyonlarının ortak yönetimi: durum teşhisi ve toplu çekme.
 * Hangi pazaryerinin bağlı olduğunu, hangi ayarın eksik olduğunu ve son
 * çekmenin sonucunu tek yerden döndürür — "neden sipariş gelmiyor?" sorusunu
 * kullanıcının kendisinin görebilmesi için.
 */

export type MarketplaceKey = "trendyol" | "hepsiburada" | "n11" | "ciceksepeti";

export type MarketplaceStatus = {
  key: MarketplaceKey;
  label: string;
  configured: boolean;
  missing: string[];
  /** true = test (SIT) ortamına bağlı; oto-senkron kapalı, test paneli aktif. */
  testMode?: boolean;
};

export function marketplaceStatus(): MarketplaceStatus[] {
  return [
    {
      key: "trendyol",
      label: "Trendyol",
      configured: isTrendyolConfigured(),
      missing: [
        !ENV.trendyolSellerId && "TRENDYOL_SELLER_ID",
        !ENV.trendyolApiKey && "TRENDYOL_API_KEY",
        !ENV.trendyolApiSecret && "TRENDYOL_API_SECRET",
      ].filter((x): x is string => Boolean(x)),
    },
    {
      key: "hepsiburada",
      label: "Hepsiburada",
      configured: isHepsiburadaConfigured(),
      testMode: isHbTestEnv(),
      missing: [
        !ENV.hepsiburadaMerchantId && "HEPSIBURADA_MERCHANT_ID",
        !ENV.hepsiburadaUsername && "HEPSIBURADA_USERNAME",
        !ENV.hepsiburadaPassword && "HEPSIBURADA_PASSWORD",
      ].filter((x): x is string => Boolean(x)),
    },
    {
      key: "n11",
      label: "N11",
      configured: isN11Configured(),
      missing: [
        !ENV.n11AppKey && "N11_APP_KEY",
        !ENV.n11AppSecret && "N11_APP_SECRET",
      ].filter((x): x is string => Boolean(x)),
    },
    {
      key: "ciceksepeti",
      label: "Çiçeksepeti",
      configured: isCiceksepetiConfigured(),
      missing: [!ENV.ciceksepetiApiKey && "CICEKSEPETI_API_KEY"].filter((x): x is string => Boolean(x)),
    },
  ];
}

/** Bir pazaryerine gerçek istek atıp ham HTTP sonucunu döner (teşhis için). */
export async function testMarketplaceConnection(
  key: MarketplaceKey,
): Promise<{ ok: boolean; status: number; body: string }> {
  switch (key) {
    case "trendyol":
      return testTrendyolConnection();
    case "hepsiburada":
      return testHepsiburadaConnection();
    case "n11":
      return testN11Connection();
    case "ciceksepeti":
      return testCiceksepetiConnection();
  }
}

export type SyncResult = {
  key: MarketplaceKey;
  label: string;
  ok: boolean;
  imported: number;
  updated: number;
  skipped: number;
  error: string | null;
  skippedReason?: "not_configured" | "test_mode";
};

// Aynı anda birden fazla çekme çalışırsa (otomatik + elle) aynı sipariş iki kez
// eklenebilir (yarış durumu). Kilit: çekme sürüyorken gelen çağrılar aynı
// sonucu paylaşır, ikinci bir çekme başlatmaz.
let inFlight: Promise<SyncResult[]> | null = null;

/** Yapılandırılmış tüm pazaryerlerinden sipariş çeker; her biri için sonuç döner. */
export function syncAllMarketplaces(): Promise<SyncResult[]> {
  if (inFlight) return inFlight;
  inFlight = runSyncAll().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSyncAll(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const runners: {
    key: MarketplaceKey;
    label: string;
    configured: boolean;
    /** Dolu ise senkron atlanır (test ortamı verisi canlı panoya karışmasın). */
    skip?: "test_mode";
    run: () => Promise<{ imported: number; skipped: number; updated?: number }>;
  }[] = [
    { key: "trendyol", label: "Trendyol", configured: isTrendyolConfigured(), run: () => syncTrendyolOrders() },
    {
      key: "hepsiburada",
      label: "Hepsiburada",
      configured: isHepsiburadaConfigured(),
      skip: isHbTestEnv() ? "test_mode" : undefined,
      run: () => syncHepsiburadaOrders(),
    },
    { key: "n11", label: "N11", configured: isN11Configured(), run: () => syncN11Orders() },
    { key: "ciceksepeti", label: "Çiçeksepeti", configured: isCiceksepetiConfigured(), run: () => syncCiceksepetiOrders() },
  ];

  for (const r of runners) {
    if (!r.configured) {
      results.push({ key: r.key, label: r.label, ok: false, imported: 0, updated: 0, skipped: 0, error: null, skippedReason: "not_configured" });
      continue;
    }
    if (r.skip) {
      results.push({ key: r.key, label: r.label, ok: true, imported: 0, updated: 0, skipped: 0, error: null, skippedReason: r.skip });
      continue;
    }
    try {
      const { imported, skipped, updated } = await r.run();
      results.push({ key: r.key, label: r.label, ok: true, imported, updated: updated ?? 0, skipped, error: null });
    } catch (error) {
      results.push({
        key: r.key,
        label: r.label,
        ok: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    }
  }

  return results;
}
