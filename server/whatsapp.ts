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

  // Gelen mesajlar: hemen 200 dön, işlemeyi arka planda yap (Meta 20 sn bekler).
  app.post("/api/whatsapp/webhook", (req: Request, res: Response) => {
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
