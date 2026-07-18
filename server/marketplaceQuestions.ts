import { invokeLLM } from "./_core/llm";
import { extractJson } from "./autofill";
import * as db from "./db";
import { notifyOwner } from "./notify";
import {
  answerTrendyolQuestion,
  fetchTrendyolQuestions,
  isTrendyolConfigured,
  type MappedQuestion,
} from "./trendyol";

/**
 * Soru-Cevap kuyruğu otomasyonu: pazaryerinden cevap bekleyen soruları çeker,
 * kuyruğa ekler ve (oto-cevap açıksa) AI ile güvenilir cevapları otomatik
 * gönderir. Emin olunmayan sorular taslakla birlikte "yeni" kalır — sahibin
 * onayını bekler. Böylece müşteriye yanlış/uydurma cevap gitmez.
 *
 * Ortam kısıtı: gerçek çekme/gönderme yalnızca canlıda (Render) pazaryeri
 * API'siyle çalışır; yerelde eşleme/AI mantığı testlerle doğrulanır.
 */

const AUTO_ANSWER_KEY = "questionsAutoAnswer";
// Trendyol cevabının alt sınırı; bu uzunluğun altındaki taslak otomatik gönderilmez.
const MIN_ANSWER_LEN = 10;

/** Oto-cevap ayarı açık mı? (Ayarlar tablosunda "1" ise açık.) */
export function isAutoAnswerEnabled(cfg: Record<string, string>): boolean {
  return cfg[AUTO_ANSWER_KEY] === "1";
}

export async function getAutoAnswerEnabled(): Promise<boolean> {
  return isAutoAnswerEnabled(await db.getSettings());
}

export async function setAutoAnswerEnabled(enabled: boolean): Promise<void> {
  await db.setSettings({ [AUTO_ANSWER_KEY]: enabled ? "1" : "0" });
}

const SYSTEM_PROMPT =
  "Sen Art of Colour (Türk oto rötuş/hobi boya markası) müşteri hizmetleri temsilcisisin. " +
  "Pazaryeri müşteri sorularına Türkçe, nazik, kısa ve doğru cevap yaz. " +
  "SADECE şu JSON'u döndür: {\"answer\": string, \"confident\": boolean, \"reason\": string}. " +
  "answer: müşteriye gönderilecek cevap metni. " +
  "confident=true SADECE ürünün genel bilgisiyle (kullanım, içerik, uygulama, uyumluluk) net ve " +
  "doğru cevaplanabilen sorular için. confident=false yap: fiyat/indirim/kampanya, stok/teslim " +
  "süresi, kargo/sipariş takibi, iade/şikayet, kişiye özel durumlar veya elindeki bilgiyle emin " +
  "olamadığın her durumda. Emin olmadığın teknik detayda ASLA uydurma. reason: kısa gerekçe.";

export type DraftResult = { answer: string; confident: boolean; reason: string };

/**
 * Bir soru için AI cevap taslağı üretir. Ürün seçiliyse cevap o ürünün
 * kılavuzundan beslenir. `confident` yalnızca güvenli/otomatik gönderilebilir
 * cevaplarda true döner.
 */
export async function generateQuestionAnswer(q: {
  questionText: string;
  productId?: number | null;
  productName?: string | null;
}): Promise<DraftResult> {
  const product = q.productId ? await db.getProduct(q.productId) : null;
  const context = product
    ? [
        `Ürün: ${product.name}`,
        product.usageGuide ? `Kullanım kılavuzu: ${product.usageGuide}` : null,
        product.applicationText ? `Uygulama: ${product.applicationText}` : null,
        product.shortDescription ? `Açıklama: ${product.shortDescription}` : null,
        product.safetyNotes ? `Güvenlik: ${product.safetyNotes}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : q.productName
      ? `Ürün: ${q.productName}`
      : "Ürün bilgisi yok.";

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Ürün bilgisi:\n${context}\n\nMüşteri sorusu:\n${q.questionText}\n\nİstenen JSON'u döndür.`,
      },
    ],
  });
  const raw = response.choices[0]?.message?.content;
  const text = (typeof raw === "string" ? raw : "").trim();

  const parsed = extractJson(text);
  if (parsed && typeof parsed.answer === "string" && parsed.answer.trim()) {
    return {
      answer: parsed.answer.trim(),
      confident: parsed.confident === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  }
  // JSON çıkmazsa düz metni cevap say ama otomatik gönderme (elle onay).
  return { answer: text, confident: false, reason: "Yapılandırılmamış AI yanıtı — elle onay gerekli" };
}

/** Soru metnindeki ürün adını yerel katalogla eşleştirir (isim içerme, tr-uyumlu). */
export function matchProductByName<T extends { id: number; name: string }>(
  products: T[],
  productName: string | null | undefined,
): T | null {
  const needle = (productName ?? "").trim().toLocaleLowerCase("tr-TR");
  if (!needle) return null;
  // Önce birebir, sonra karşılıklı içerme; en uzun eşleşen kazanır (daha spesifik).
  let best: T | null = null;
  let bestLen = 0;
  for (const p of products) {
    const name = p.name.trim().toLocaleLowerCase("tr-TR");
    if (!name) continue;
    if (name === needle) return p;
    if (needle.includes(name) || name.includes(needle)) {
      if (name.length > bestLen) {
        best = p;
        bestLen = name.length;
      }
    }
  }
  return best;
}

export type QuestionSyncResult = {
  ok: boolean;
  imported: number;
  autoAnswered: number;
  /** Kuyruğa düşen ama otomatik gönderilmeyen (elle onay bekleyen) soru sayısı. */
  drafted: number;
  errors: string[];
};

// Zamanlayıcı + elle çekme aynı anda tetiklenirse aynı soruyu iki kez işlememek
// için kilit: çekme sürüyorken gelen çağrılar aynı sonucu paylaşır.
let inFlight: Promise<QuestionSyncResult> | null = null;

/** Yapılandırılmış pazaryerlerinden soruları çeker, kuyruğa ekler, oto-cevaplar. */
export function syncMarketplaceQuestions(): Promise<QuestionSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Bilinmeyen hata";
}

async function runSync(): Promise<QuestionSyncResult> {
  const result: QuestionSyncResult = { ok: true, imported: 0, autoAnswered: 0, drafted: 0, errors: [] };

  if (!isTrendyolConfigured()) {
    // Şu an soru çekme yalnızca Trendyol'da; hiçbiri bağlı değilse sessizce çık.
    result.ok = false;
    return result;
  }

  const [cfg, products] = await Promise.all([db.getSettings(), db.listProducts()]);
  const autoAnswer = isAutoAnswerEnabled(cfg);

  let fetched: MappedQuestion[] = [];
  try {
    fetched = await fetchTrendyolQuestions();
  } catch (e) {
    result.ok = false;
    result.errors.push(`Trendyol: ${msg(e)}`);
    return result;
  }

  for (const q of fetched) {
    try {
      const existing = await db.getMarketplaceQuestionByExternal(q.source, q.externalId);
      if (existing) continue;

      const matched = matchProductByName(products, q.productName);
      const id = Number(
        await db.createMarketplaceQuestion({
          source: q.source,
          externalId: q.externalId,
          customerName: q.customerName,
          questionText: q.questionText,
          productId: matched?.id ?? null,
          productName: matched?.name ?? q.productName ?? null,
        } as never),
      );
      result.imported++;

      if (!autoAnswer) continue;

      // Oto-cevap: taslak üret, güvenliyse pazaryerine gönder ve yanıtlandı işaretle.
      const draft = await generateQuestionAnswer({
        questionText: q.questionText,
        productId: matched?.id ?? null,
        productName: q.productName,
      });
      await db.updateMarketplaceQuestion(id, { answerDraft: draft.answer });

      if (!draft.confident || draft.answer.length < MIN_ANSWER_LEN) {
        result.drafted++;
        continue;
      }

      try {
        if (q.source === "trendyol") await answerTrendyolQuestion(q.externalId, draft.answer);
        await db.updateMarketplaceQuestion(id, {
          answerText: draft.answer,
          status: "answered",
          answeredAt: new Date(),
        } as never);
        result.autoAnswered++;
      } catch (e) {
        // Gönderim başarısız: taslak kalır, kuyrukta "yeni" olarak durur.
        result.errors.push(`Cevap gönderilemedi (#${q.externalId}): ${msg(e)}`);
        result.drafted++;
      }
    } catch (e) {
      result.errors.push(`Soru işlenemedi (#${q.externalId}): ${msg(e)}`);
    }
  }

  return result;
}

/** Zamanlayıcıdan çağrılır: çekip oto-cevaplar, sonucu sahibe bildirir. */
export async function runQuestionSyncAndNotify(): Promise<void> {
  const r = await syncMarketplaceQuestions();
  if (r.imported > 0) {
    const parts: string[] = [];
    if (r.autoAnswered > 0) parts.push(`${r.autoAnswered} tanesi AI ile otomatik yanıtlandı`);
    if (r.drafted > 0) parts.push(`${r.drafted} tanesi taslakla onayınızı bekliyor`);
    await notifyOwner({
      kind: "soru",
      title: `💬 ${r.imported} yeni müşteri sorusu`,
      body: parts.length ? `${parts.join(", ")}.` : "Soru-Cevap kuyruğuna düştü.",
      link: "/sorular",
    });
  }
  for (const err of r.errors) {
    await notifyOwner({ kind: "senkron-hata", title: "⚠️ Soru senkron hatası", body: err, link: "/sorular" });
  }
}
