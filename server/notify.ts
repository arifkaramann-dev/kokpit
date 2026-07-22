import * as db from "./db";

/**
 * Sahibe bildirim: bildirim merkezine yazar. Aynı tür+başlık 24 saat içinde
 * tekrarlanmışsa atlanır (dedupe createNotification'da). Zamanlayıcı/nöbetçi
 * ajanların tek çıkışıdır.
 */
export async function notifyOwner(input: {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  try {
    await db.createNotification(input);
  } catch (error) {
    console.error("[notify] bildirim yazılamadı:", error);
  }
}
