import * as db from "./db";
import { isWhatsAppConfigured, sendWhatsAppText } from "./whatsapp";

/**
 * Sahibe bildirim: bildirim merkezine yazar ve (yapılandırılmışsa) WhatsApp'a
 * kopyalar. Aynı tür+başlık 24 saat içinde tekrarlanmışsa ikisi de atlanır
 * (dedupe createNotification'da). Zamanlayıcı/nöbetçi ajanların tek çıkışıdır.
 */
export async function notifyOwner(input: {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** WhatsApp'a da gönderilsin mi (varsayılan: evet). */
  whatsapp?: boolean;
}): Promise<void> {
  let id: number | null = null;
  try {
    id = await db.createNotification(input);
  } catch (error) {
    console.error("[notify] bildirim yazılamadı:", error);
    return;
  }
  if (id === null) return; // 24 saat içinde aynı bildirim — spam yapma
  if (input.whatsapp === false || !isWhatsAppConfigured()) return;
  const to = ownerWhatsAppNumber();
  if (!to) return;
  const text = `*${input.title}*${input.body ? `\n\n${input.body}` : ""}`;
  try {
    await sendWhatsAppText(to, text);
  } catch (error) {
    console.error("[notify] whatsapp gönderimi başarısız:", error);
  }
}

/** Proaktif mesajların gideceği numara: izin listesindeki ilk numara (sahip). */
export function ownerWhatsAppNumber(): string | null {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? "";
  const first = raw
    .split(",")
    .map(s => s.replace(/\D/g, ""))
    .filter(Boolean)[0];
  return first ?? null;
}
