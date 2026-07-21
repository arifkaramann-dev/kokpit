import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { runAssistant } from "./assistantAgent";

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

/**
 * İzinli numara eşleşmesi (saf/testli). Ülke kodu/baştaki 0 farkları en sık
 * "cevap gelmiyor" sebebiydi: "05551112233" ile Meta'nın gönderdiği
 * "905551112233" eşleşmiyordu. Son 10 hane (TR yerel numara) karşılaştırılır.
 */
export function isAllowedNumberMatch(from: string, allowedCsv: string): boolean {
  const tail = (s: string) => normalizeNumber(s).slice(-10);
  const fromTail = tail(from);
  if (fromTail.length < 10) return false;
  const allowed = allowedCsv
    .split(",")
    .map(s => tail(s))
    .filter(s => s.length === 10);
  // Liste boşsa güvenlik için kimseye cevap verme.
  return allowed.includes(fromTail);
}

function isAllowedSender(from: string): boolean {
  return isAllowedNumberMatch(from, process.env.WHATSAPP_ALLOWED_NUMBERS ?? "");
}

/* ------------------------- Tanı (diagnostik) kaydı ------------------------- */

export type WhatsAppDiagEvent = {
  at: string;
  kind: "webhook" | "mesaj" | "cevap" | "gonderim" | "hata";
  detail: string;
  ok: boolean;
};

// Son olaylar bellekte tutulur (yeniden başlatınca sıfırlanır — tanı için yeterli).
const diagEvents: WhatsAppDiagEvent[] = [];
export function waLog(kind: WhatsAppDiagEvent["kind"], detail: string, ok = true) {
  diagEvents.unshift({ at: new Date().toISOString(), kind, detail: detail.slice(0, 300), ok });
  if (diagEvents.length > 100) diagEvents.pop();
}

/** Numarayı maskeler: 905551112233 → 90555***2233 (tanı ekranında sızıntı olmasın). */
function maskNumber(value: string): string {
  const d = normalizeNumber(value);
  return d.length > 7 ? `${d.slice(0, 5)}***${d.slice(-4)}` : d || value;
}

/** Ayarlar sayfasındaki "WhatsApp Tanı" kartının veri kaynağı. */
export function getWhatsAppDiagnostics() {
  const allowedRaw = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return {
    configured: isWhatsAppConfigured(),
    accessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    allowedNumbers: allowedRaw.map(maskNumber),
    events: diagEvents.slice(0, 50),
  };
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

export type SendWhatsAppResult = { ok: boolean; status: number; detail: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendWhatsAppResult> {
  try {
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
      // En sık sebep: süresi dolmuş access token (geçici token 24 saatte ölür).
      waLog("gonderim", `Gönderim başarısız (${res.status}): ${detail}`, false);
      return { ok: false, status: res.status, detail: detail.slice(0, 300) };
    }
    waLog("gonderim", `Mesaj gönderildi → ${to.slice(0, 5)}***`);
    return { ok: true, status: res.status, detail: "" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Ağ hatası";
    console.error(`[whatsapp] send error: ${detail}`);
    waLog("gonderim", `Gönderim hatası: ${detail}`, false);
    return { ok: false, status: 0, detail };
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
  const masked = `${normalizeNumber(msg.from).slice(0, 5)}***`;
  if (!isAllowedSender(msg.from)) {
    console.warn(`[whatsapp] izinsiz numara yok sayıldı: ${msg.from}`);
    waLog(
      "mesaj",
      `İzinsiz numaradan mesaj YOK SAYILDI (${masked}). Cevap istiyorsan WHATSAPP_ALLOWED_NUMBERS'a bu numarayı ekle.`,
      false,
    );
    return;
  }
  if (msg.type !== "text" || !msg.text?.body) {
    waLog("mesaj", `Metin dışı mesaj (${msg.type}) — bilgilendirme gönderiliyor`);
    await sendWhatsAppText(
      msg.from,
      "Şimdilik yalnızca yazılı mesajları işleyebiliyorum. 🎤 Sesli komut için telefon klavyendeki mikrofon (dikte) ile konuşarak yazdırabilirsin — aynı şekilde çalışır."
    );
    return;
  }
  waLog("mesaj", `Mesaj alındı (${masked}): "${msg.text.body.slice(0, 80)}"`);
  try {
    // Tool-use ajanı (onay katmanlı); hata/eksik anahtar durumunda intent akışına düşer.
    const { message } = await runAssistant(msg.text.body, msg.from);
    waLog("cevap", `Asistan cevap üretti (${message.length} karakter), gönderiliyor`);
    await sendWhatsAppText(msg.from, `✅ ${message}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Komut işlenemedi";
    waLog("hata", `Asistan hatası: ${reason}`, false);
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
      waLog("webhook", "Meta webhook doğrulaması BAŞARILI (verify token eşleşti)");
      res.status(200).send(String(challenge ?? ""));
    } else {
      waLog("webhook", "Webhook doğrulama isteği reddedildi (verify token eşleşmedi)", false);
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
        waLog(
          "webhook",
          "Webhook İMZASI GEÇERSİZ, istek reddedildi — WHATSAPP_APP_SECRET Meta panelindeki App Secret ile birebir aynı mı?",
          false,
        );
        res.sendStatus(401);
        return;
      }
    }
    res.sendStatus(200);
    if (!isWhatsAppConfigured()) {
      waLog("webhook", "Webhook geldi ama WHATSAPP_* ayarları eksik — mesaj işlenmedi", false);
      return;
    }
    try {
      const entries = (req.body?.entry ?? []) as {
        changes?: { value?: { messages?: IncomingMessage[]; statuses?: unknown[] } }[];
      }[];
      let messageCount = 0;
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          for (const msg of change.value?.messages ?? []) {
            messageCount++;
            void handleMessage(msg).catch(err => {
              console.error("[whatsapp] işleme hatası:", err);
              waLog("hata", `Mesaj işleme hatası: ${err instanceof Error ? err.message : String(err)}`, false);
            });
          }
        }
      }
      // Mesaj içermeyen webhook'lar (teslimat durumu vb.) normaldir; kaydı tutulur
      // ki "webhook geliyor mu?" sorusu tanı ekranından cevaplanabilsin.
      if (messageCount === 0) waLog("webhook", "Webhook alındı (mesaj yok — durum bildirimi)");
    } catch (error) {
      console.error("[whatsapp] webhook ayrıştırma hatası:", error);
      waLog("hata", `Webhook ayrıştırma hatası: ${error instanceof Error ? error.message : String(error)}`, false);
    }
  });
}
