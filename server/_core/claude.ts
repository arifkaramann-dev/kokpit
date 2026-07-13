import Anthropic from "@anthropic-ai/sdk";
import type { InvokeParams, InvokeResult, Message } from "./llm";

/**
 * Claude API köprüsü: ANTHROPIC_API_KEY tanımlıysa invokeLLM çağrıları
 * Manus yerine doğrudan Claude'a gider. Mevcut InvokeResult biçimini
 * koruduğu için çağıran kodlar değişmeden çalışır.
 */

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function contentToText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if ("text" in content && typeof content.text === "string") return content.text;
  return "";
}

/** Sık görülen Claude API hatalarını kullanıcıya anlaşılır Türkçe mesaja çevirir. */
export function translateApiError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("credit balance is too low")) {
    return new Error(
      "Anthropic API kredisi bitti. console.anthropic.com > Plans & Billing'den kredi yükleyin; yükleyince kendiliğinden çalışır."
    );
  }
  if (raw.includes("invalid x-api-key") || raw.includes("authentication_error")) {
    return new Error("ANTHROPIC_API_KEY geçersiz görünüyor. Render > Environment'taki anahtarı kontrol edin.");
  }
  if (raw.includes("overloaded_error") || raw.includes("rate_limit")) {
    return new Error("AI şu an çok yoğun, 1 dakika sonra tekrar deneyin.");
  }
  return error instanceof Error ? error : new Error(raw);
}

/** API çağrısını sarar; hata olursa Türkçeleştirip fırlatır. */
async function callClaude<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw translateApiError(error);
  }
}

export async function invokeClaude(params: InvokeParams): Promise<InvokeResult> {
  const client = new Anthropic();

  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  for (const message of params.messages) {
    if (message.role === "system") {
      systemParts.push(contentToText(message.content));
    } else if (message.role === "user" || message.role === "assistant") {
      messages.push({ role: message.role, content: contentToText(message.content) });
    }
  }
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Devam et." });
  }

  const response = await callClaude(() =>
    client.messages.create({
      model: params.model ?? "claude-opus-4-8",
      max_tokens: params.maxTokens ?? params.max_tokens ?? 4096,
      thinking: { type: "adaptive" },
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      messages,
    })
  );

  if (response.stop_reason === "refusal") {
    throw new Error("AI bu isteği güvenlik nedeniyle yanıtlamadı. İfadeyi değiştirip tekrar deneyin.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map(block => block.text)
    .join("");

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: response.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}

const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { anyOf: [{ type: "string" }, { type: "null" }] },
    invoiceNo: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unitPrice: { type: "number" },
        },
        required: ["name", "quantity", "unit", "unitPrice"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierName", "invoiceNo", "items"],
  additionalProperties: false,
} as const;

export type ParsedInvoice = {
  supplierName: string | null;
  invoiceNo: string | null;
  items: { name: string; quantity: number; unit: string; unitPrice: number }[];
};

/** Fatura fotoğrafı/PDF'inden kalemleri çıkarır (Claude vision + yapılandırılmış çıktı). */
export async function extractInvoice(mediaType: string, base64: string): Promise<ParsedInvoice> {
  if (!isClaudeConfigured()) {
    throw new Error(
      "AI fatura okuma için ANTHROPIC_API_KEY gerekli. Şimdilik kalemleri elle girebilirsiniz."
    );
  }
  const client = new Anthropic();
  const source = { type: "base64" as const, media_type: mediaType, data: base64 };
  const block =
    mediaType === "application/pdf"
      ? ({ type: "document", source } as Anthropic.DocumentBlockParam)
      : ({ type: "image", source } as Anthropic.ImageBlockParam);

  const response = await callClaude(() =>
    client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: INVOICE_SCHEMA as never } },
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "text",
              text: "Bu bir satın alma faturası/irsaliye. Tedarikçi adını, fatura numarasını ve tüm kalemleri çıkar. Her kalem için: malzeme adı (Türkçe, sade), miktar (sayı), birim (kg/gr/lt/ml/adet gibi), KDV hariç birim fiyat (sayı). Kargo/iskonto satırlarını kaleme dahil etme.",
            },
          ],
        },
      ],
    })
  );
  if (response.stop_reason === "refusal") {
    throw new Error("AI bu belgeyi işleyemedi. Kalemleri elle girebilirsiniz.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  return JSON.parse(text) as ParsedInvoice;
}

const VOICE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "sale", "order", "stock_in", "stock_out", "note", "query",
        "task_add", "task_list", "task_done", "order_status", "help", "unknown",
        "expense_add", "collection_add",
      ],
    },
    customerName: { anyOf: [{ type: "string" }, { type: "null" }] },
    channel: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      anyOf: [
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
              unitPrice: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
            required: ["name", "quantity", "unitPrice"],
            additionalProperties: false,
          },
        },
        { type: "null" },
      ],
    },
    materialName: { anyOf: [{ type: "string" }, { type: "null" }] },
    quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
    unit: { anyOf: [{ type: "string" }, { type: "null" }] },
    noteText: { anyOf: [{ type: "string" }, { type: "null" }] },
    taskKind: { anyOf: [{ type: "string", enum: ["eksik", "gorev"] }, { type: "null" }] },
    taskItems: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
    listKind: { anyOf: [{ type: "string", enum: ["eksik", "gorev", "proje"] }, { type: "null" }] },
    orderRef: { anyOf: [{ type: "string" }, { type: "null" }] },
    orderStatus: { anyOf: [{ type: "string", enum: ["new", "production", "ready", "done"] }, { type: "null" }] },
    amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    expenseCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
    reply: { type: "string" },
  },
  required: [
    "intent", "customerName", "channel", "items", "materialName", "quantity", "unit",
    "noteText", "taskKind", "taskItems", "listKind", "orderRef", "orderStatus",
    "amount", "expenseCategory", "reply",
  ],
  additionalProperties: false,
} as const;

export type VoiceCommand = {
  intent:
    | "sale" | "order" | "stock_in" | "stock_out" | "note" | "query"
    | "task_add" | "task_list" | "task_done" | "order_status" | "help" | "unknown"
    | "expense_add" | "collection_add";
  customerName: string | null;
  channel: string | null;
  items: { name: string; quantity: number | null; unitPrice: number | null }[] | null;
  materialName: string | null;
  quantity: number | null;
  unit: string | null;
  noteText: string | null;
  taskKind: "eksik" | "gorev" | null;
  taskItems: string[] | null;
  listKind: "eksik" | "gorev" | "proje" | null;
  orderRef: string | null;
  orderStatus: "new" | "production" | "ready" | "done" | null;
  amount: number | null;
  expenseCategory: string | null;
  reply: string;
};

/** Sesli komut metnini yapılandırılmış işletme komutuna çevirir. */
export async function parseVoiceCommand(transcript: string): Promise<VoiceCommand> {
  if (!isClaudeConfigured()) {
    throw new Error("Sesli komut için ANTHROPIC_API_KEY gerekli (Render > Environment'a ekleyin).");
  }
  const client = new Anthropic();
  const response = await callClaude(() =>
    client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: VOICE_SCHEMA as never } },
      system:
        "Boya işletmesi yönetim uygulamasının sesli komut çözücüsüsün. Türkçe konuşma metnini işletme komutuna çevir. " +
        "'sattım/elden satış' → sale; 'sipariş geldi/al' → order; 'stok girişi/geldi/aldım' → stock_in; 'kullandım/stoktan düş' → stock_out; 'not al' → note; " +
        "işletme hakkında soru/rapor isteği ('kaç sipariş var', 'ciro ne kadar', 'stok durumu' gibi) → query ve soruyu noteText alanına aynen yaz. " +
        "'eksik listesine ekle / alınacaklara yaz / bitti, almam lazım' → task_add, taskKind=eksik, her kalemi taskItems dizisine ayrı yaz; " +
        "'görev ekle / yapılacaklara ekle / hatırlat' → task_add, taskKind=gorev; " +
        "'eksik listesi / bugün neler alınacaktı / alınacaklar neler' → task_list, listKind=eksik; " +
        "'görevlerim / yapılacaklar neler' → task_list, listKind=gorev; " +
        "'projeler ne durumda / geliştirmeler' → task_list, listKind=proje; " +
        "'X aldım / X tamamlandı / listeden çıkar' → task_done, tamamlanan maddeleri taskItems dizisine yaz. " +
        "Sipariş durumu değiştirme ('AOC-... kargoya hazır', 'son siparişi tamamla', 'Ahmet'in siparişi üretimde') → order_status; " +
        "orderRef alanına sipariş no / müşteri adı / 'son' yaz, orderStatus alanına new|production|ready|done. " +
        "Gider/masraf kaydı ('reklama 500 lira harcadım', 'kira ödedim 8000', 'kargoya 250 verdim', 'X için Y lira gider') → expense_add; " +
        "amount alanına tutarı (TL), expenseCategory alanına kategoriyi (kira|kargo|reklam|komisyon|maaş|fatura|diğer) yaz, açıklamayı noteText'e yaz. " +
        "Tahsilat/ödeme alma ('Ahmet 200 lira ödedi', 'X'ten 500 tahsil ettim', 'müşteri parayı yatırdı') → collection_add; " +
        "customerName alanına müşteri adını, amount alanına tutarı yaz; sipariş no biliniyorsa orderRef'e yaz. " +
        "'yardım / ne yapabilirsin / komutlar' → help. " +
        "Ürün/malzeme adlarını sade yaz. 'reply' alanına yapılan işi tek cümlede Türkçe özetle.",
      messages: [{ role: "user", content: transcript }],
    })
  );
  if (response.stop_reason === "refusal") throw new Error("Komut işlenemedi, tekrar deneyin.");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  return JSON.parse(text) as VoiceCommand;
}

/** İşletme verisi özetiyle serbest soruyu yanıtlar (WhatsApp/sesli asistan Q&A). */
export async function answerBusinessQuestion(question: string, snapshot: string): Promise<string> {
  if (!isClaudeConfigured()) {
    throw new Error("AI asistan için ANTHROPIC_API_KEY gerekli (Render > Environment'a ekleyin).");
  }
  const client = new Anthropic();
  const response = await callClaude(() =>
    client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      system:
        "Art of Colour boya işletmesinin kişisel asistanısın. Sana işletmenin güncel veri özeti verilir; " +
        "soruyu SADECE bu veriye dayanarak Türkçe, kısa ve net yanıtla (WhatsApp mesajı gibi, birkaç cümle/madde). " +
        "Veride olmayan bir şey sorulursa uydurma, 'bu bilgi elimde yok' de. Tutarları TL olarak yaz.",
      messages: [{ role: "user", content: `İşletme veri özeti:\n${snapshot}\n\nSoru: ${question}` }],
    })
  );
  if (response.stop_reason === "refusal") throw new Error("Soru yanıtlanamadı, tekrar deneyin.");
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
}
