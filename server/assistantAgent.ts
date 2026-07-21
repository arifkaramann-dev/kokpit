import Anthropic from "@anthropic-ai/sdk";
import {
  actionAddCollection,
  actionAddExpense,
  actionAddTasks,
  actionCompleteTasks,
  actionCreateOrder,
  actionSetOrderStatus,
  actionStockMove,
  buildBusinessSnapshot,
  executeAssistantCommand,
} from "./assistant";
import * as db from "./db";

/**
 * Asistanın tool-use ajanı (Faz 1'in açık vaadi): tek intent çözmek yerine
 * Claude gerçek araçlar çağırır — soruya veri çekerek cevap verir, art arda
 * birden fazla işi tek mesajda yapabilir.
 *
 * ONAY KATMANI:
 *  - "guvenli" araçlar (okuma + görev ekleme/kapatma) doğrudan çalışır.
 *  - "onayli" araçlar (para/stok/sipariş yazan her şey) ÖNCE kullanıcıya
 *    özetlenir; kullanıcı "evet/onayla" deyince uygulanır. Bekleyen onay
 *    konuşma başına bellekte tutulur (10 dk geçerli).
 *  - Silme gibi kritik işlemler için araç YOK — uygulama arayüzü gerekir.
 *
 * ANTHROPIC_API_KEY yoksa veya ajan hata verirse eski intent akışına
 * (executeAssistantCommand) düşer — WhatsApp asla cevapsız kalmaz.
 */

type PendingAction = { tool: string; args: Record<string, unknown>; summary: string; expiresAt: number };
const pendingByConversation = new Map<string, PendingAction>();
const PENDING_TTL_MS = 10 * 60 * 1000;

const CONFIRM_WORDS = ["evet", "onayla", "onaylıyorum", "tamam", "olur", "yap", "uygula"];
const CANCEL_WORDS = ["hayır", "hayir", "iptal", "vazgeç", "vazgec", "dur", "yapma"];

const AGENT_MODEL = "claude-opus-4-8";
const MAX_TURNS = 5;

/* ------------------------------ Araç tanımları ------------------------------ */

type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  safety: "guvenli" | "onayli";
  run: (args: Record<string, unknown>) => Promise<string>;
  /** Onay kartında gösterilecek insan-okur özet. */
  describe: (args: Record<string, unknown>) => string;
};

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const numArg = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)) || 0);

const TOOLS: ToolDef[] = [
  {
    name: "isletme_ozeti",
    description:
      "İşletmenin güncel verilerini döndürür: bugünkü/son siparişler, ciro-gider-net, kasa, alacaklar ve borçlular, stok durumu, görevler. Kullanıcı işletme hakkında bir şey sorduğunda ÖNCE bunu çağır, cevabını bu veriye dayandır.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
    safety: "guvenli",
    run: async () => buildBusinessSnapshot(),
    describe: () => "İşletme özetini oku",
  },
  {
    name: "gorev_ekle",
    description: "Görev veya eksik/alınacak listesine madde ekler. kind: 'gorev' | 'eksik'.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["gorev", "eksik"] },
        titles: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "titles"],
    },
    safety: "guvenli",
    run: async args =>
      (await actionAddTasks({ kind: args.kind === "eksik" ? "eksik" : "gorev", titles: (args.titles as string[]) ?? [] })).message,
    describe: args => `${((args.titles as string[]) ?? []).join(", ")} → ${args.kind === "eksik" ? "eksik listesi" : "görevler"}`,
  },
  {
    name: "gorev_tamamla",
    description: "Görev/eksik listesinde maddeleri tamamlandı işaretler (isimle eşleşir).",
    input_schema: {
      type: "object" as const,
      properties: { names: { type: "array", items: { type: "string" } } },
      required: ["names"],
    },
    safety: "guvenli",
    run: async args => (await actionCompleteTasks({ names: (args.names as string[]) ?? [] })).message,
    describe: args => `Tamamla: ${((args.names as string[]) ?? []).join(", ")}`,
  },
  {
    name: "gider_ekle",
    description: "Gider kaydeder (kira, kargo, reklam, malzeme...). Tutar TL.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: { type: "string", description: "kira|kargo|reklam|komisyon|malzeme|fatura|diğer" },
        amount: { type: "number" },
        description: { type: "string" },
      },
      required: ["amount", "description"],
    },
    safety: "onayli",
    run: async args =>
      (await actionAddExpense({ category: str(args.category) || undefined, amount: numArg(args.amount), description: str(args.description) })).message,
    describe: args => `Gider: ${str(args.category) || "diğer"} — ${numArg(args.amount).toFixed(2)} TL (${str(args.description)})`,
  },
  {
    name: "tahsilat_ekle",
    description:
      "Müşteriden alınan ödemeyi kaydeder; müşterinin ödenmemiş en eski siparişine bağlanır ve cari hesabına işlenir.",
    input_schema: {
      type: "object" as const,
      properties: {
        customerName: { type: "string" },
        amount: { type: "number" },
        orderRef: { type: "string", description: "belirli bir sipariş no (opsiyonel)" },
      },
      required: ["customerName", "amount"],
    },
    safety: "onayli",
    run: async args =>
      (await actionAddCollection({ customerName: str(args.customerName), amount: numArg(args.amount), orderRef: str(args.orderRef) || undefined })).message,
    describe: args => `Tahsilat: ${str(args.customerName)} — ${numArg(args.amount).toFixed(2)} TL`,
  },
  {
    name: "stok_hareketi",
    description: "Hammadde stok girişi/çıkışı yapar. direction: 'in' (geldi) | 'out' (kullanıldı).",
    input_schema: {
      type: "object" as const,
      properties: {
        materialName: { type: "string" },
        direction: { type: "string", enum: ["in", "out"] },
        quantity: { type: "number" },
        unit: { type: "string" },
      },
      required: ["materialName", "direction", "quantity"],
    },
    safety: "onayli",
    run: async args =>
      (
        await actionStockMove({
          materialName: str(args.materialName),
          direction: args.direction === "in" ? "in" : "out",
          quantity: numArg(args.quantity),
          unit: str(args.unit) || undefined,
        })
      ).message,
    describe: args =>
      `Stok ${args.direction === "in" ? "girişi" : "çıkışı"}: ${str(args.materialName)} — ${numArg(args.quantity)} ${str(args.unit) || ""}`.trim(),
  },
  {
    name: "siparis_durumu",
    description:
      "Bir siparişin durumunu değiştirir. orderRef: sipariş no, müşteri adı veya 'son'. status: new|production|ready|done|cancelled.",
    input_schema: {
      type: "object" as const,
      properties: {
        orderRef: { type: "string" },
        status: { type: "string", enum: ["new", "production", "ready", "done", "cancelled"] },
      },
      required: ["status"],
    },
    safety: "onayli",
    run: async args =>
      (
        await actionSetOrderStatus({
          orderRef: str(args.orderRef) || undefined,
          status: str(args.status) as "new" | "production" | "ready" | "done" | "cancelled",
        })
      ).message,
    describe: args => `Sipariş durumu: ${str(args.orderRef) || "son sipariş"} → ${str(args.status)}`,
  },
  {
    name: "satis_veya_siparis_ekle",
    description:
      "Elden satış (kind='sale', hemen tamamlanır) veya yeni sipariş (kind='order') oluşturur. Kalemler: ürün adı, adet, birim fiyat TL.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["sale", "order"] },
        customerName: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productName: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["productName", "quantity", "unitPrice"],
          },
        },
        note: { type: "string" },
      },
      required: ["kind", "items"],
    },
    safety: "onayli",
    run: async args =>
      (
        await actionCreateOrder({
          kind: args.kind === "sale" ? "sale" : "order",
          customerName: str(args.customerName) || undefined,
          items: ((args.items as { productName: string; quantity: number; unitPrice: number }[]) ?? []).map(i => ({
            productName: str(i.productName),
            quantity: numArg(i.quantity) || 1,
            unitPrice: numArg(i.unitPrice),
          })),
          noteText: str(args.note) || undefined,
        })
      ).message,
    describe: args => {
      const items = ((args.items as { productName: string; quantity: number; unitPrice: number }[]) ?? [])
        .map(i => `${i.quantity}× ${i.productName} (${i.unitPrice} TL)`)
        .join(", ");
      return `${args.kind === "sale" ? "Elden satış" : "Sipariş"}${str(args.customerName) ? ` — ${str(args.customerName)}` : ""}: ${items}`;
    },
  },
];

const toolMap = new Map(TOOLS.map(t => [t.name, t]));

const SYSTEM_PROMPT = [
  "Sen Art of Colour boya markasının işletme asistanısın (Kokpit). Türkçe, kısa ve net konuş; WhatsApp'a uygun sade metin yaz (markdown başlık kullanma, gerekirse • madde imi).",
  "İşletme verisi gereken HER soruda önce isletme_ozeti aracını çağır; rakamları oradan al, uydurma.",
  "Yazma araçları onay katmanından geçer: aracı normal şekilde çağır, sistem onayı kullanıcıya sorar. Aynı mesajda birden fazla iş varsa sırayla hepsini yap.",
  "Kesin emin olmadığın müşteri/ürün adlarını olduğu gibi araca ver — eşleştirmeyi sistem yapar.",
  "Para, adet ve tarihleri Türk formatında yaz (1.250,50 TL gibi). Bilmediğin şeyi bilmediğini söyle.",
].join("\n");

/* ------------------------------ Onay katmanı ------------------------------ */

export function matchConfirmation(reply: string): "confirm" | "cancel" | null {
  const norm = reply.trim().toLocaleLowerCase("tr-TR").replace(/[.!?,;]+$/g, "");
  if (CONFIRM_WORDS.includes(norm)) return "confirm";
  if (CANCEL_WORDS.includes(norm)) return "cancel";
  return null;
}

async function isAgentEnabled(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    const cfg = await db.getSettings();
    return cfg["assistant.agentMode"] !== "0"; // varsayılan: açık
  } catch {
    return true;
  }
}

/**
 * Asistanın tek giriş kapısı: onay akışı + ajan + eski akışa düşüş.
 * conversationKey: uygulama içi sohbet için "app", WhatsApp için telefon no.
 */
export async function runAssistant(transcript: string, conversationKey: string): Promise<{ message: string }> {
  // 1) Bekleyen onay var mı?
  const pending = pendingByConversation.get(conversationKey);
  if (pending) {
    if (Date.now() > pending.expiresAt) {
      pendingByConversation.delete(conversationKey);
    } else {
      const decision = matchConfirmation(transcript);
      if (decision === "confirm") {
        pendingByConversation.delete(conversationKey);
        const tool = toolMap.get(pending.tool);
        if (!tool) return { message: "Bekleyen işlem artık geçerli değil." };
        try {
          return { message: await tool.run(pending.args) };
        } catch (error) {
          return { message: `İşlem uygulanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}` };
        }
      }
      if (decision === "cancel") {
        pendingByConversation.delete(conversationKey);
        return { message: "Tamam, vazgeçtim — hiçbir şey kaydedilmedi. 👍" };
      }
      // Onay bekleyen işlem varken başka bir şey yazıldıysa bekleyeni düşür,
      // yeni mesajı normal akışta işle (kullanıcı konuyu değiştirdi).
      pendingByConversation.delete(conversationKey);
    }
  }

  // 2) Ajan kapalıysa eski intent akışı.
  if (!(await isAgentEnabled())) return executeAssistantCommand(transcript);

  // 3) Tool-use ajanı; herhangi bir hatada eski akışa düş.
  try {
    return await runAgentLoop(transcript, conversationKey);
  } catch (error) {
    console.warn("[assistant-agent] ajan hatası, intent akışına düşülüyor:", error);
    return executeAssistantCommand(transcript);
  }
}

async function runAgentLoop(transcript: string, conversationKey: string): Promise<{ message: string }> {
  const client = new Anthropic();
  const tools: Anthropic.Tool[] = TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: transcript }];
  const doneMessages: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    if (toolUses.length === 0) {
      // Ajan bitirdi: yapılan işler + son metin.
      const parts = [...doneMessages];
      if (text) parts.push(text);
      return { message: parts.join("\n\n") || "Anlaşıldı." };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      const tool = toolMap.get(tu.name);
      const args = (tu.input ?? {}) as Record<string, unknown>;
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Bilinmeyen araç." });
        continue;
      }
      if (tool.safety === "onayli") {
        // Yazma işlemi: uygulamadan önce kullanıcı onayı iste ve turu bitir.
        const summary = tool.describe(args);
        pendingByConversation.set(conversationKey, {
          tool: tool.name,
          args,
          summary,
          expiresAt: Date.now() + PENDING_TTL_MS,
        });
        const parts = [...doneMessages];
        if (text) parts.push(text);
        parts.push(`Şunu yapacağım:\n➡️ ${summary}\n\nOnaylıyor musun? (evet / hayır)`);
        return { message: parts.join("\n\n") };
      }
      try {
        const out = await tool.run(args);
        if (tool.name !== "isletme_ozeti") doneMessages.push(out);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out.slice(0, 8000) });
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Hata: ${error instanceof Error ? error.message : "bilinmeyen"}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { message: doneMessages.join("\n\n") || "İşlem tamamlanamadı, daha kısa bir komutla tekrar dener misin?" };
}
