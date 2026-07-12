import { ENV } from "./_core/env";
import { isHepsiburadaConfigured, syncHepsiburadaOrders } from "./hepsiburada";
import { isTrendyolConfigured, syncTrendyolOrders } from "./trendyol";

/**
 * Pazaryeri entegrasyonlarının ortak yönetimi: durum teşhisi ve toplu çekme.
 * Hangi pazaryerinin bağlı olduğunu, hangi ayarın eksik olduğunu ve son
 * çekmenin sonucunu tek yerden döndürür — "neden sipariş gelmiyor?" sorusunu
 * kullanıcının kendisinin görebilmesi için.
 */

export type MarketplaceStatus = {
  key: "trendyol" | "hepsiburada";
  label: string;
  configured: boolean;
  missing: string[];
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
      missing: [
        !ENV.hepsiburadaMerchantId && "HEPSIBURADA_MERCHANT_ID",
        !ENV.hepsiburadaUsername && "HEPSIBURADA_USERNAME",
        !ENV.hepsiburadaPassword && "HEPSIBURADA_PASSWORD",
      ].filter((x): x is string => Boolean(x)),
    },
  ];
}

export type SyncResult = {
  key: "trendyol" | "hepsiburada";
  label: string;
  ok: boolean;
  imported: number;
  skipped: number;
  error: string | null;
  skippedReason?: "not_configured";
};

/** Yapılandırılmış tüm pazaryerlerinden sipariş çeker; her biri için sonuç döner. */
export async function syncAllMarketplaces(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const runners: {
    key: "trendyol" | "hepsiburada";
    label: string;
    configured: boolean;
    run: () => Promise<{ imported: number; skipped: number }>;
  }[] = [
    { key: "trendyol", label: "Trendyol", configured: isTrendyolConfigured(), run: () => syncTrendyolOrders() },
    { key: "hepsiburada", label: "Hepsiburada", configured: isHepsiburadaConfigured(), run: () => syncHepsiburadaOrders() },
  ];

  for (const r of runners) {
    if (!r.configured) {
      results.push({ key: r.key, label: r.label, ok: false, imported: 0, skipped: 0, error: null, skippedReason: "not_configured" });
      continue;
    }
    try {
      const { imported, skipped } = await r.run();
      results.push({ key: r.key, label: r.label, ok: true, imported, skipped, error: null });
    } catch (error) {
      results.push({
        key: r.key,
        label: r.label,
        ok: false,
        imported: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    }
  }

  return results;
}
