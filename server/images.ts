import type { Express, Request, Response } from "express";
import * as db from "./db";

/**
 * Ürün görsellerini herkese açık URL'den servis eder — web sitesi ve
 * pazaryerleri bu linkleri kullanabilsin diye. Görseller veritabanında
 * base64 (data URL) saklanır; burada çözülüp gerçek resim olarak döner.
 *
 * URL biçimi: /api/img/{productId}/{kind}   (kind: main | packaging | usage)
 */

const KINDS = new Set(["main", "packaging", "usage"]);

/** "data:image/jpeg;base64,XXXX" veya düz base64'ü {mime, buffer}'a çevirir. */
function decodeImage(data: string): { mime: string; buffer: Buffer } | null {
  const m = data.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (m) {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  }
  // data: öneki yoksa JPEG varsay.
  if (data.length > 0) {
    return { mime: "image/jpeg", buffer: Buffer.from(data, "base64") };
  }
  return null;
}

export function registerImageRoutes(app: Express) {
  app.get("/api/img/:productId/:kind", async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const kind = req.params.kind;
    if (!Number.isFinite(productId) || !KINDS.has(kind)) {
      res.status(400).send("Geçersiz istek");
      return;
    }
    try {
      const row = await db.getProductImage(productId, kind as "main" | "packaging" | "usage");
      if (!row?.data) {
        res.status(404).send("Görsel yok");
        return;
      }
      const decoded = decodeImage(row.data);
      if (!decoded) {
        res.status(404).send("Görsel çözülemedi");
        return;
      }
      res.setHeader("Content-Type", decoded.mime);
      // Pazaryeri/CDN'ler tekrar tekrar çekmesin diye 1 gün önbellek.
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(decoded.buffer);
    } catch (error) {
      console.error("[images] hata:", error);
      res.status(500).send("Sunucu hatası");
    }
  });
}
