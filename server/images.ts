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

/** Ortak gönderim: MIME, önbellek ve CORS başlıkları tek yerde. */
function sendImage(res: Response, data: string) {
  const decoded = decodeImage(data);
  if (!decoded) {
    res.status(404).send("Görsel çözülemedi");
    return;
  }
  res.setHeader("Content-Type", decoded.mime);
  // Pazaryeri/CDN'ler tekrar tekrar çekmesin diye 1 gün önbellek.
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(decoded.buffer);
}

export function registerImageRoutes(app: Express) {
  /**
   * v3 master görseli: /api/img/master/{imageId}
   *
   * Ürün rotasından ÖNCE tanımlanır — "master" bir productId olarak
   * yorumlanmasın diye sıra önemlidir.
   */
  app.get("/api/img/master/:imageId", async (req: Request, res: Response) => {
    const imageId = Number(req.params.imageId);
    if (!Number.isFinite(imageId)) {
      res.status(400).send("Geçersiz istek");
      return;
    }
    try {
      const row = await db.getMasterImage(imageId);
      if (!row?.data) {
        res.status(404).send("Görsel yok");
        return;
      }
      sendImage(res, row.data);
    } catch (error) {
      console.error("[images] master görseli hatası:", error);
      res.status(500).send("Sunucu hatası");
    }
  });

  /**
   * Numune master görseli: /api/img/sample/{id}
   *
   * Renk stüdyosu bu görseli canvas'a çizip yeniden renklendiriyor. tRPC ile
   * base64 taşımak yerine normal bir görsel adresi veriliyor: tarayıcı onu
   * önbelleğe alabilir ve aynı master onlarca renk için tekrar tekrar
   * indirilmez.
   *
   * DİKKAT: canvas'tan piksel okunacağı için aynı kaynaktan servis edilmesi
   * şart — çapraz kaynak bir görsel canvas'ı kirletir ve `getImageData`
   * güvenlik hatası verir.
   */
  app.get("/api/img/sample/:id", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).send("Geçersiz istek");
      return;
    }
    try {
      const row = await db.getSampleMasterById(id);
      if (!row?.data) {
        res.status(404).send("Görsel yok");
        return;
      }
      sendImage(res, row.data);
    } catch (error) {
      console.error("[images] numune master görseli hatası:", error);
      res.status(500).send("Sunucu hatası");
    }
  });
}
