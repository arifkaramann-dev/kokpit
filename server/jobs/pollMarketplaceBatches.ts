import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { marketplaceBatchJobs } from "../../drizzle/schema";
import {
  getTrendyolProductBatchStatus,
  extractTrendyolBatchStatus,
  isTrendyolConfigured,
} from "../trendyolProducts";

/**
 * Pazaryeri batch status polling daemon.
 *
 * Pending batch'leri kontrol eder, status güncellemeleri database'e yazar.
 * Dakikada bir çalıştırılmalı (cron job veya interval).
 */
export async function pollMarketplaceBatches() {
  const db = await getDb();
  if (!db) return;

  const pendingBatches = await db
    .select()
    .from(marketplaceBatchJobs)
    .where(eq(marketplaceBatchJobs.status, "pending"));

  if (pendingBatches.length === 0) return;

  for (const batch of pendingBatches) {
    try {
      if (batch.marketplace === "trendyol" && isTrendyolConfigured()) {
        const batchData = await getTrendyolProductBatchStatus(batch.batchRequestId);
        const { finalStatus, errorMessage } = extractTrendyolBatchStatus(batchData);

        await db
          .update(marketplaceBatchJobs)
          .set({
            status: finalStatus,
            errorMessage,
            completedAt: finalStatus !== "pending" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(marketplaceBatchJobs.id, batch.id));
      }
      // TODO: Hepsiburada ve N11 için benzer polling
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Bilinmeyen hata";
      await db
        .update(marketplaceBatchJobs)
        .set({
          status: "failed",
          errorMessage: `Polling hatası: ${errorMsg.slice(0, 200)}`,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceBatchJobs.id, batch.id));
    }
  }
}

/**
 * Ürün kartı açma batch'ini UI'da gösterecek bilgilerle dön.
 * `channelListingId` ile ilgili en son batch'i sor.
 */
export async function getProductCardBatchStatus(channelListingId: number) {
  const db = await getDb();
  if (!db) return null;

  const batches = await db
    .select()
    .from(marketplaceBatchJobs)
    .where(eq(marketplaceBatchJobs.channelListingId, channelListingId))
    .orderBy((t) => t.createdAt)
    .limit(1);

  return batches[0] || null;
}
