import { describe, expect, it } from "vitest";
import { extractTrendyolBatchStatus } from "./trendyolProducts";

/**
 * Batch durumu okuma — kart açma sonucunun TEK doğruluk kaynağı.
 *
 * Buradaki yanlış bir "success" kullanıcıya "ürün açıldı" dedirtir, oysa
 * Trendyol kalemi reddetmiştir; yanlış bir "failed" ise kullanıcıyı aynı
 * barkodu ikinci kez göndermeye iter. İkisi de canlıda pahalı.
 */
describe("extractTrendyolBatchStatus", () => {
  it("kalem listesi boşken pending kalır (parti henüz işlenmedi)", () => {
    expect(extractTrendyolBatchStatus({ batchRequestId: "b1", items: [] })).toEqual({
      finalStatus: "pending",
      errorMessage: null,
    });
  });

  it("items alanı hiç yokken pending kalır", () => {
    expect(extractTrendyolBatchStatus({ batchRequestId: "b1" }).finalStatus).toBe("pending");
  });

  it("tüm kalemler SUCCESS ise success döner", () => {
    const r = extractTrendyolBatchStatus({
      items: [
        { barcode: "AOC1", status: "SUCCESS" },
        { barcode: "AOC2", status: "SUCCESS" },
      ],
    });
    expect(r).toEqual({ finalStatus: "success", errorMessage: null });
  });

  it("tek kalem bile FAILED ise parti failed sayılır", () => {
    const r = extractTrendyolBatchStatus({
      items: [
        { barcode: "AOC1", status: "SUCCESS" },
        { barcode: "AOC2", status: "FAILED", errors: [{ message: "Zorunlu özellik eksik" }] },
      ],
    });
    expect(r.finalStatus).toBe("failed");
    expect(r.errorMessage).toContain("AOC2");
    expect(r.errorMessage).toContain("Zorunlu özellik eksik");
  });

  it("bilinen hata anahtarı Türkçe açıklamaya çevrilir", () => {
    const r = extractTrendyolBatchStatus({
      items: [
        {
          barcode: "AOC9",
          status: "FAILED",
          errors: [
            { key: "batchRequest.recurring.product.create.not.allowed", message: "Bilinmeyen bir hata oluştu" },
          ],
        },
      ],
    });
    // Ham "Bilinmeyen bir hata" bilgi taşımıyor; anahtarın karşılığı gösterilmeli.
    expect(r.errorMessage).toContain("zaten kayıtlı");
    expect(r.errorMessage).not.toContain("Bilinmeyen bir hata");
  });

  // Okunamayan gövde "başarısız" DEĞİLDİR: yanlış failed, kullanıcıyı aynı
  // barkodu tekrar göndermeye iter. Pending kalıp yeniden sorulmalı.
  it("beklenmedik gövde çökmez ve pending kalır", () => {
    expect(extractTrendyolBatchStatus(null).finalStatus).toBe("pending");
    expect(extractTrendyolBatchStatus("bozuk").finalStatus).toBe("pending");
  });
});
