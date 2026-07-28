/**
 * Kanal senkron işçisi — kirli kuyruğu boşaltır.
 *
 * Zincirin son halkası. Kapasite değişince ya da fiyat güncellenince yayın
 * "kirli" işaretleniyordu ama kuyruğu kimse boşaltmıyordu; v3'te üretilen
 * hiçbir şey pazaryerine gitmiyordu.
 *
 * Tasarım kararları:
 *  · Parçalara bölünür — tek büyük parti hata verince hepsi birden düşerdi
 *  · Hata satırda kalır ("hata" durumu), sonraki turda yeniden denenir;
 *    ayrı bir hata kuyruğu ve elle müdahale gerekmez
 *  · Yapılandırılmamış kanal sessizce atlanır — Trendyol anahtarı yoksa
 *    N11 gönderimi engellenmemeli
 */

import { chunkItems, planChannelSync, toChannelPayload, type SyncItem } from "./channelSync";
import * as db from "./db";
import { isCiceksepetiConfigured, pushCiceksepetiStockPrice } from "./ciceksepeti";
import { isHepsiburadaConfigured, pushHepsiburadaStockPrice } from "./hepsiburada";
import { isN11Configured, pushN11StockPrice } from "./n11";
import { isTrendyolConfigured, pushTrendyolStockPrice } from "./trendyol";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Pazaryeri toplu uçlarının pratik parti boyutu. */
const BATCH_SIZE = 200;

function channelReady(code: string): boolean {
  switch (code) {
    case "trendyol":
      return isTrendyolConfigured();
    case "hepsiburada":
      return isHepsiburadaConfigured();
    case "n11":
      return isN11Configured();
    case "ciceksepeti":
      return isCiceksepetiConfigured();
    // Kendi web mağazası API gerektirmez; yayın anında canlıdır.
    case "web":
      return false;
    default:
      return false;
  }
}

async function pushBatch(code: string, payloads: unknown[]): Promise<void> {
  switch (code) {
    case "trendyol":
      await pushTrendyolStockPrice(payloads as never);
      return;
    case "hepsiburada":
      await pushHepsiburadaStockPrice(payloads as never);
      return;
    case "n11":
      await pushN11StockPrice(payloads as never);
      return;
    case "ciceksepeti":
      await pushCiceksepetiStockPrice(payloads as never);
      return;
    default:
      throw new Error(`Bilinmeyen kanal: ${code}`);
  }
}

export type SyncResult = {
  channel: string;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
};

/**
 * Bir kanalın kirli kuyruğunu boşaltır.
 * `dryRun` ile ne gönderileceği görünür, ağ çağrısı yapılmaz.
 */
export async function syncChannel(
  channelId: number,
  channelCode: string,
  opts: { dryRun?: boolean } = {},
): Promise<SyncResult> {
  if (!opts.dryRun && !channelReady(channelCode)) {
    return { channel: channelCode, sent: 0, failed: 0, skipped: 0, error: "Kanal yapılandırılmamış" };
  }

  const [dirty, masters] = await Promise.all([
    db.listDirtyChannelListings(channelId),
    db.listMasterProducts(),
  ]);
  if (dirty.length === 0) return { channel: channelCode, sent: 0, failed: 0, skipped: 0 };

  const plan = planChannelSync({
    listings: (dirty as Record<string, unknown>[]).map(l => ({
      id: l.id as number,
      masterId: l.masterId as number,
      channelId: l.channelId as number,
      channelSku: String(l.channelSku ?? ""),
      channelBarcode: String(l.channelBarcode ?? ""),
      price: num(l.price),
      discountPercent: num(l.discountPercent),
      pushedQty: Number(l.pushedQty ?? 0),
      status: l.status as "taslak" | "canli" | "durduruldu",
    })),
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      status: m.status as "taslak" | "aktif" | "arsiv",
      basePrice: num(m.basePrice),
      discountPercent: num(m.discountPercent),
      buildableQty: Number(m.buildableQty ?? 0),
      virtualStockCap: Number(m.virtualStockCap ?? 10),
    })),
    channelId,
  });

  if (opts.dryRun) {
    return {
      channel: channelCode,
      sent: plan.items.length,
      failed: 0,
      skipped: plan.skipped.length,
    };
  }

  let sent = 0;
  let failed = 0;
  for (const batch of chunkItems(plan.items, BATCH_SIZE)) {
    const payloads = batch
      .map(i => toChannelPayload(channelCode, i))
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (payloads.length === 0) continue;

    const ids = batch.map(b => b.channelListingId);
    try {
      await pushBatch(channelCode, payloads);
      await db.markChannelSynced(
        ids,
        new Map(batch.map((b: SyncItem) => [b.channelListingId, b.quantity])),
      );
      sent += batch.length;
    } catch (error) {
      // Parti başarısız: satırlar "hata" kalır, sonraki turda yeniden denenir.
      await db.markChannelSyncFailed(
        ids,
        error instanceof Error ? error.message : "Gönderim başarısız",
      );
      failed += batch.length;
    }
  }

  return { channel: channelCode, sent, failed, skipped: plan.skipped.length };
}

/** Tüm yapılandırılmış kanalların kuyruğunu boşaltır (zamanlayıcı çağırır). */
export async function syncAllChannels(opts: { dryRun?: boolean } = {}): Promise<SyncResult[]> {
  const channels = (await db.listSalesChannels()) as { id: number; code: string; isActive: number }[];
  const out: SyncResult[] = [];
  for (const c of channels) {
    if (!c.isActive) continue;
    if (!opts.dryRun && !channelReady(c.code)) continue;
    try {
      out.push(await syncChannel(c.id, c.code, opts));
    } catch (error) {
      out.push({
        channel: c.code,
        sent: 0,
        failed: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : "Bilinmeyen hata",
      });
    }
  }
  return out;
}
