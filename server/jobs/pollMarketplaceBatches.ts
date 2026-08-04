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

  /*
   * Bir batch birden çok ilanı kapsar ve her ilan için bir satır yazılır.
   * Kimlik başına TEK sorgu atılır; sonuç o kimliğin tüm satırlarına yazılır —
   * yoksa 20 kalemlik bir parti pazaryerine 20 kez sorulurdu.
   */
  const byBatchId = new Map<string, typeof pendingBatches>();
  for (const batch of pendingBatches) {
    const list = byBatchId.get(batch.batchRequestId) ?? [];
    list.push(batch);
    byBatchId.set(batch.batchRequestId, list);
  }

  for (const [batchRequestId, rows] of Array.from(byBatchId.entries())) {
    const marketplace = rows[0].marketplace;
    // Kart açma şu an yalnız Trendyol'da var; başka kanal eklenince buraya
    // kendi durum sorgusuyla girer (uydurma uç yerine gerçek sözleşmeyle).
    if (marketplace !== "trendyol" || !isTrendyolConfigured()) continue;

    try {
      const batchData = await getTrendyolProductBatchStatus(batchRequestId);
      const { finalStatus, errorMessage } = extractTrendyolBatchStatus(batchData);
      if (finalStatus === "pending") continue;

      await db
        .update(marketplaceBatchJobs)
        .set({
          status: finalStatus,
          errorMessage,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceBatchJobs.batchRequestId, batchRequestId));
    } catch (error) {
      /*
       * Sorgu hatası batch'in BAŞARISIZ olduğu anlamına gelmez (ağ, kota,
       * pazaryeri 5xx). "failed" yazmak yanlış bilgi olurdu; satır pending
       * kalır ve sonraki turda yeniden sorulur.
       */
      console.error(`[batch] ${batchRequestId} durumu sorulamadı:`, error);
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
