import { isClaudeConfigured } from "./_core/claude";
import { invokeLLM } from "./_core/llm";

/**
 * Pazaryeri soru-cevap yardımcıları (saf eşleştirme/birleştirme mantığı + AI taslak).
 * Pazaryeri API ayrıntıları trendyol.ts'te; buradaki fonksiyonlar pazaryerinden
 * bağımsızdır ve birim test edilir (bkz. questions.test.ts).
 */

/** Pazaryerinin bildirdiği durumun yereldeki karşılığı. */
export type RemoteQuestionStatus = "open" | "answered" | "rejected";

export type LocalQuestionStatus = "open" | "draft" | "answered" | "rejected";

/** Pazaryeri sorusunun yerel şemaya eşlenmiş hali (senkron girdisi). */
export type MappedQuestion = {
  marketplace: string;
  questionId: string;
  questionText: string;
  customerName: string | null;
  /** Sorunun sorulduğu ürünün adı — katalog eşleşmesi ve AI bağlamı için. */
  productName: string | null;
  productBarcode: string | null;
  /** Katalog eşleşmesi (barkod → ad); senkron resolveProductIdForItem ile doldurur. */
  productId: number | null;
  askedAt: Date | null;
  remoteStatus: RemoteQuestionStatus;
  /** Pazaryerinde zaten verilmiş cevap (panel/mobil uygulamadan cevaplanmış olabilir). */
  remoteAnswer: string | null;
  remoteAnsweredAt: Date | null;
};

export type ExistingQuestionLike = {
  id: number;
  status: LocalQuestionStatus;
  questionText: string;
  customerName: string | null;
  productId: number | null;
  finalAnswer: string | null;
};

export type QuestionInsertValues = {
  marketplace: string;
  questionId: string;
  productId: number | null;
  productBarcode: string | null;
  customerName: string | null;
  questionText: string;
  askedAt: Date | null;
  status: LocalQuestionStatus;
  finalAnswer: string | null;
  answeredAt: Date | null;
};

export type MergeResult =
  | { action: "insert"; values: QuestionInsertValues }
  | { action: "update"; patch: Record<string, unknown> }
  | { action: "skip" };

/**
 * Çekilen soruyu mevcut kayıtla birleştirir (saf fonksiyon — DB'ye dokunmaz).
 * Kurallar:
 * - Kayıt yoksa insert; pazaryerinde zaten cevaplanmışsa answered olarak gelir.
 * - Kayıt varsa mükerrer YARATILMAZ; yalnızca değişen alanlar patch'lenir.
 * - Pazaryeri "cevaplandı" diyorsa yerel durum answered'a çekilir (finalAnswer dolar).
 * - Pazaryeri "reddetti" diyorsa rejected'a çekilir (yeniden cevap gerekir).
 * - Pazaryeri hâlâ "açık" diyorsa yerel draft/answered GERİYE ALINMAZ
 *   (gönderilmiş cevabın pazaryerine yansıması gecikebilir).
 */
export function mergeQuestion(
  existing: ExistingQuestionLike | null | undefined,
  incoming: MappedQuestion,
): MergeResult {
  if (!existing) {
    const answered = incoming.remoteStatus === "answered";
    return {
      action: "insert",
      values: {
        marketplace: incoming.marketplace,
        questionId: incoming.questionId,
        productId: incoming.productId,
        productBarcode: incoming.productBarcode,
        customerName: incoming.customerName,
        questionText: incoming.questionText,
        askedAt: incoming.askedAt,
        status: incoming.remoteStatus,
        finalAnswer: answered ? incoming.remoteAnswer : null,
        answeredAt: answered ? (incoming.remoteAnsweredAt ?? new Date()) : null,
      },
    };
  }

  const patch: Record<string, unknown> = {};
  if (incoming.questionText && incoming.questionText !== existing.questionText) {
    patch.questionText = incoming.questionText;
  }
  if (incoming.customerName && incoming.customerName !== existing.customerName) {
    patch.customerName = incoming.customerName;
  }
  // Ürün bağı sonradan kurulabilir (katalog büyüdükçe); mevcut bağ ezilmez.
  if (existing.productId == null && incoming.productId != null) {
    patch.productId = incoming.productId;
  }

  if (incoming.remoteStatus === "answered" && existing.status !== "answered") {
    patch.status = "answered";
    patch.finalAnswer = incoming.remoteAnswer ?? existing.finalAnswer ?? null;
    patch.answeredAt = incoming.remoteAnsweredAt ?? new Date();
  } else if (incoming.remoteStatus === "rejected" && existing.status !== "rejected") {
    patch.status = "rejected";
  }

  return Object.keys(patch).length > 0 ? { action: "update", patch } : { action: "skip" };
}

/* ------------------------- AI cevap taslağı ------------------------- */

export type DraftProductInfo = {
  name: string;
  description?: string | null;
  salePrice?: string | number | null;
};

export type DraftQuestionInfo = {
  questionText: string;
  customerName?: string | null;
  /** Katalogda eşleşme yoksa pazaryerindeki ürün adı/barkod ipucu. */
  productHint?: string | null;
};

/** LLM'e giden mesajları kurar (saf — test edilebilir). */
export function buildDraftMessages(question: DraftQuestionInfo, product: DraftProductInfo | null) {
  const systemPrompt = `Sen Art of Colour markasının müşteri hizmetleri temsilcisisin. Art of Colour; oto rötuş boyaları, bukalemun efekt boyalar (Meteor), airbrush boyaları, sedefli (Vivid), transparan (Candy) boyalar, vernik ve astar üreten butik bir Türk boya markasıdır.

Görevin: pazaryerinde (Trendyol) müşterinin sorduğu soruya satıcı ağzından KISA, kibar ve net bir Türkçe cevap taslağı yazmak.

Kurallar:
- "Merhaba," ile başla, teşekkürle bitir; samimi ama profesyonel ol.
- Yalnızca verilen ürün bilgisine dayan; bilmediğin teknik detayı UYDURMA — emin olmadığın konuda "ürün sayfasındaki açıklamada belirtilmiştir" ya da "detay için bize yazabilirsiniz" de.
- Telefon numarası, e-posta, site adresi gibi platform dışına yönlendirme YAZMA (Trendyol kuralı).
- Stok/kargo sözü verme; fiyat sorulursa listedeki fiyatı söyleyebilirsin.
- 10 karakterden kısa olmasın, 800 karakteri geçmesin.
- SADECE cevap metnini yaz; başlık, tırnak veya açıklama ekleme.`;

  const parts: string[] = [`Müşteri sorusu: ${question.questionText}`];
  if (question.customerName) parts.push(`Soran: ${question.customerName}`);
  if (product) {
    parts.push(`Ürün: ${product.name}`);
    if (product.description) parts.push(`Ürün açıklaması: ${product.description}`);
    if (product.salePrice != null && product.salePrice !== "") {
      parts.push(`Liste fiyatı: ${product.salePrice} TL`);
    }
  } else if (question.productHint) {
    parts.push(`Ürün (katalogda eşleşmedi): ${question.productHint}`);
  }

  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: parts.join("\n") },
  ];
}

export type DraftResult = { ok: true; draft: string } | { ok: false; message: string };

/** AI yapılandırılmış mı? (Claude anahtarı ya da yedek Forge anahtarı) */
export function isDraftAiConfigured(): boolean {
  return isClaudeConfigured() || Boolean(process.env.BUILT_IN_FORGE_API_KEY);
}

/**
 * Soru + ürün bilgisinden AI cevap taslağı üretir. Anahtar yoksa HATA FIRLATMAZ;
 * { ok: false, message } döner — kullanıcı cevabı elle yazabilir.
 */
export async function generateQuestionDraft(
  question: DraftQuestionInfo,
  product: DraftProductInfo | null,
): Promise<DraftResult> {
  if (!isDraftAiConfigured()) {
    return {
      ok: false,
      message:
        "AI taslak için ANTHROPIC_API_KEY gerekli (Render > Environment'a ekleyin). Cevabı elle yazabilirsiniz.",
    };
  }
  try {
    const response = await invokeLLM({ messages: buildDraftMessages(question, product) });
    const raw = response.choices[0]?.message?.content;
    const draft = typeof raw === "string" ? raw.trim() : "";
    if (!draft) return { ok: false, message: "AI taslak üretemedi, lütfen tekrar deneyin." };
    return { ok: true, draft };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "AI taslak üretilemedi.",
    };
  }
}
