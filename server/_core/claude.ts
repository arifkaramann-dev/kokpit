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
