import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { executeAssistantCommand } from "./assistant";

/**
 * WhatsApp Cloud API (Meta) entegrasyonu: sahibin WhatsApp'tan yazdığı
 * mesajlar asistana iletilir, cevap WhatsApp'a geri gönderilir.
 *
 * Gerekli ortam değişkenleri (Render > Environment):
 *  - WHATSAPP_VERIFY_TOKEN     : webhook doğrulama için kendi seçtiğin gizli kelime
 *  - WHATSAPP_ACCESS_TOKEN     : Meta uygulamasının kalıcı erişim anahtarı
 *  - WHATSAPP_PHONE_NUMBER_ID  : Cloud API telefon numarası kimliği
 *  - WHATSAPP_ALLOWED_NUMBERS  : cevap verilecek numaralar, virgülle (örn. 905551112233)
 *  - WHATSAPP_APP_SECRET       : Meta App Dashboard > App Secret; tanımlıysa gelen
 *                                webhook'ların X-Hub-Signature-256 imzası doğrulanır
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_VERIFY_TOKEN
  );
}

/** Sadece rakamları karşılaştırır: "+90 555 111 22 33" ile "905551112233" eşleşir. */
function normalizeNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function isAllowedSender(from: string): boolean {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? "";
  const allowed = raw
    .split(",")
    .map(s => normalizeNumber(s))
    .filter(Boolean);
  // Liste boşsa güvenlik için kimseye cevap verme.
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeNumber(from));
}

/**
 * Meta'nın `X-Hub-Signature-256` başlığını doğrular. İmza, HAM istek gövdesi
 * üzerinden `sha256=` + HMAC-SHA256(appSecret, rawBody) hex olarak hesaplanır.
 * Saf fonksiyon: DB/env erişimi yok, birim testi kolay.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  // timingSafeEqual eşit uzunluk ister; farklı uzunluk zaten eşleşmiyor demektir.
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      // WhatsApp tek mesajda 4096 karakter sınırı koyar.
      text: { body: body.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[whatsapp] send failed ${res.status}: ${detail}`);
  }
}

type IncomingMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
};

/** Meta aynı mesajı tekrar gönderebilir; son işlenen kimlikleri hatırla. */
const processedIds = new Set<string>();
function alreadyProcessed(id: string): boolean {
  if (processedIds.has(id)) return true;
  processedIds.add(id);
  if (processedIds.size > 500) {
    const first = processedIds.values().next().value;
    if (first) processedIds.delete(first);
  }
  return false;
}

async function handleMessage(msg: IncomingMessage): Promise<void> {
  if (alreadyProcessed(msg.id)) return;
  if (!isAllowedSender(msg.from)) {
    console.warn(`[whatsapp] izinsiz numara yok sayıldı: ${msg.from}`);
    return;
  }
  if (msg.type !== "text" || !msg.text?.body) {
    await sendWhatsAppText(
      msg.from,
      "Şimdilik yalnızca yazılı mesajları işleyebiliyorum. 🎤 Sesli komut için telefon klavyendeki mikrofon (dikte) ile konuşarak yazdırabilirsin — aynı şekilde çalışır."
    );
    return;
  }
  try {
    const { message } = await executeAssistantCommand(msg.text.body);
    await sendWhatsAppText(msg.from, `✅ ${message}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Komut işlenemedi";
    await sendWhatsAppText(msg.from, `⚠️ ${reason}`);
  }
}

export function registerWhatsAppRoutes(app: Express) {
  if (!process.env.WHATSAPP_APP_SECRET) {
    console.warn(
      "[whatsapp] WHATSAPP_APP_SECRET tanımsız, webhook imza doğrulaması kapalı"
    );
  }

  // Meta webhook doğrulaması (kurulumda bir kez çağrılır).
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(challenge ?? ""));
    } else {
      res.sendStatus(403);
    }
  });

  // Gelen mesajlar: imza doğrula, hemen 200 dön, işlemeyi arka planda yap (Meta 20 sn bekler).
  app.post("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const signature = req.header("x-hub-signature-256");
      if (!rawBody || !verifyWebhookSignature(rawBody, signature, appSecret)) {
        console.warn("[whatsapp] geçersiz webhook imzası, istek reddedildi");
        res.sendStatus(401);
        return;
      }
    }
    res.sendStatus(200);
    if (!isWhatsAppConfigured()) return;
    try {
      const entries = (req.body?.entry ?? []) as {
        changes?: { value?: { messages?: IncomingMessage[] } }[];
      }[];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          for (const msg of change.value?.messages ?? []) {
            void handleMessage(msg).catch(err => console.error("[whatsapp] işleme hatası:", err));
          }
        }
      }
    } catch (error) {
      console.error("[whatsapp] webhook ayrıştırma hatası:", error);
    }
  });
}
