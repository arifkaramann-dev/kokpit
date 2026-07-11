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

  const response = await client.messages.create({
    model: params.model ?? "claude-opus-4-8",
    max_tokens: params.maxTokens ?? params.max_tokens ?? 4096,
    thinking: { type: "adaptive" },
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages,
  });

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

  const response = await client.messages.create({
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
  });
  if (response.stop_reason === "refusal") {
    throw new Error("AI bu belgeyi işleyemedi. Kalemleri elle girebilirsiniz.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  return JSON.parse(text) as ParsedInvoice;
}
