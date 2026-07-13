/** Pazaryeri siparişinin net kârı: brüt − komisyon − ürün maliyeti (COGS). */
export function marketplaceOrderNet(gross: number, commissionRatePct: number, cogs: number) {
  const commission = (gross * commissionRatePct) / 100;
  const net = gross - commission - cogs;
  return { commission, cogs, net, margin: gross > 0 ? (net / gross) * 100 : 0 };
}

export const MARKETPLACE_CHANNELS = ["trendyol", "hepsiburada", "n11", "ciceksepeti"];
