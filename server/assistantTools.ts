import Anthropic from "@anthropic-ai/sdk";
import { isClaudeConfigured, translateApiError } from "./_core/claude";
import * as db from "./db";
import { findOpenOrderForCollection } from "./orderUtils";

/**
 * Asistan araç kayıt defteri + üç sınıflı onay katmanı.
 *
 * Risk sınıfları:
 *  - "guvenli": salt-okur araçlar; LLM döngüsünde otomatik çalışır.
 *  - "onayli" : yazma yapan araçlar; kullanıcı "evet" demeden ASLA çalışmaz.
 *               Bekleyen onay kullanıcı başına tektir ve 10 dakikada zaman aşar.
 *  - "kritik" : bu sürümde araç YOK; sınıf tanımı ve "asla otomatik çalışmaz"
 *               garantisi burada durur. Kritik bir araç eklense bile
 *               executeTool onu hiçbir koşulda (confirmed=true dahil)
 *               çalıştırmaz — ileride ayrı, daha sıkı bir akış gerektirir.
 */

export type RiskClass = "guvenli" | "onayli" | "kritik";

export type AssistantTool = {
  name: string;
  description: string;
  riskClass: RiskClass;
  /** Anthropic tool-use input_schema (JSON Schema, type: object). */
  inputSchema: Record<string, unknown>;
  /** Onaylı araçlar için kullanıcıya gösterilecek onay sorusu. */
  confirmText?: (input: Record<string, unknown>) => string;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Ödenmemiş siparişlerden borçlu listesi çıkarır (iptal/iade hariç verilmeli). */
export function computeDebtors(
  orders: { customerName: string; orderNo: string; totalAmount: unknown; paidAmount?: unknown; paymentStatus?: string | null }[]
) {
  return orders
    .filter(o => o.paymentStatus !== "paid")
    .map(o => ({
      name: o.customerName,
      orderNo: o.orderNo,
      due: Math.max(0, num(o.totalAmount) - num(o.paidAmount)),
    }))
    .filter(d => d.due > 0)
    .sort((a, b) => b.due - a.due);
}

// ---------------------------------------------------------------------------
// GÜVENLİ (salt-okur) araçlar — mevcut snapshot/db fonksiyonlarını sarar.
// Finansal rakamlar db.financeSummary() ile AYNI kaynaktan gelir (kopya hesap yok).
// ---------------------------------------------------------------------------

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

const satisOzeti: AssistantTool = {
  name: "satis_ozeti",
  description:
    "Satış ve finans özeti: bugünkü sipariş sayısı/tutarı, bu ayın cirosu, gideri ve net kârı, son 30 gün cirosu. Ciro/kâr/gider soruları için bunu kullan.",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const [finance, today, orders] = await Promise.all([
      db.financeSummary(),
      db.countOrdersToday(),
      db.listOrders(),
    ]);
    const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30 = orders.filter(
      o => o.status !== "cancelled" && new Date(o.createdAt as unknown as string).getTime() >= since30
    );
    const revenue30 = last30.reduce((s, o) => s + num(o.totalAmount), 0);
    return [
      `Bugünkü sipariş: ${today?.count ?? 0} adet, ${today?.total ?? 0} TL`,
      `Bu ay: ciro ${finance.monthRevenue.toFixed(2)} TL, gider ${finance.monthExpense.toFixed(2)} TL, net kâr ${finance.monthNet.toFixed(2)} TL`,
      `Son 30 gün ciro: ${revenue30.toFixed(2)} TL (${last30.length} sipariş)`,
    ].join("\n");
  },
};

const kasaBakiyesi: AssistantTool = {
  name: "kasa_bakiyesi",
  description: "Kasa/banka hesaplarının bakiyeleri ve toplam nakit durumu.",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const [finance, accounts] = await Promise.all([db.financeSummary(), db.listAccounts()]);
    const lines = accounts.map(a => `- ${a.name} (${a.kind}): ${num(a.balance).toFixed(2)} TL`);
    return [`Toplam kasa/banka bakiyesi: ${finance.cashTotal.toFixed(2)} TL`, ...lines].join("\n");
  },
};

const borcluMusteriler: AssistantTool = {
  name: "borclu_musteriler",
  description:
    "Borçlu müşteriler ve tahsil edilecek toplam alacak. 'Kim borçlu', 'ne kadar tahsilat bekliyor' soruları için bunu kullan.",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const [finance, orders] = await Promise.all([db.financeSummary(), db.listOrders()]);
    const debtors = computeDebtors(orders.filter(o => o.status !== "cancelled"));
    const lines = debtors
      .slice(0, 20)
      .map(d => `- ${d.name}: ${d.due.toFixed(2)} TL (${d.orderNo})`);
    return [
      `Toplam tahsil edilecek (alacak): ${finance.receivables.toFixed(2)} TL`,
      lines.length ? "Borçlu müşteriler:" : "Borçlu müşteri yok.",
      ...lines,
    ].join("\n");
  },
};

const stokDurumu: AssistantTool = {
  name: "stok_durumu",
  description: "Hammadde stok listesi ve kritik seviyenin altındaki malzemeler.",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const [materials, critical] = await Promise.all([db.listMaterials(), db.listCriticalMaterials()]);
    const lines = materials
      .slice(0, 40)
      .map(m => `- ${m.name}: ${m.stockQty} ${m.unit} (birim maliyet ${m.unitCost} TL)`);
    return [
      `Hammadde sayısı: ${materials.length}`,
      `Kritik stok altındakiler: ${critical.map(m => `${m.name} (${m.stockQty} ${m.unit})`).join(", ") || "yok"}`,
      ...lines,
    ].join("\n");
  },
};

const siparisListesi: AssistantTool = {
  name: "siparis_listesi",
  description: "Sipariş durum sayıları ve son 15 sipariş (tarih, müşteri, kanal, durum, tutar).",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const [statusCounts, orders] = await Promise.all([db.orderStatusCounts(), db.listOrders()]);
    const recent = orders.slice(0, 15).map(o => {
      const date =
        o.createdAt instanceof Date
          ? o.createdAt.toISOString().slice(0, 10)
          : String(o.createdAt).slice(0, 10);
      return `- ${date} ${o.orderNo} | ${o.customerName} | ${o.channel} | ${o.status} | ${o.totalAmount} TL`;
    });
    return [
      `Sipariş durumları: ${statusCounts.map(s => `${s.status}: ${s.count}`).join(", ") || "yok"}`,
      "Son siparişler:",
      ...recent,
    ].join("\n");
  },
};

const gorevListesi: AssistantTool = {
  name: "gorev_listesi",
  description: "Açık görevler ve eksik listesi (alınacaklar).",
  riskClass: "guvenli",
  inputSchema: EMPTY_SCHEMA,
  async execute() {
    const open = await db.listTasks(undefined, "open");
    const eksik = open.filter(t => t.kind === "eksik").map(t => `☐ ${t.title}`);
    const gorev = open.filter(t => t.kind === "gorev").map(t => `☐ ${t.title}`);
    return [
      `Eksik listesi (${eksik.length}): ${eksik.join(", ") || "boş"}`,
      `Açık görevler (${gorev.length}): ${gorev.join(", ") || "yok"}`,
    ].join("\n");
  },
};

// ---------------------------------------------------------------------------
// ONAYLI (yazma) araçlar — kullanıcı onayı olmadan ÇALIŞMAZ.
// ---------------------------------------------------------------------------

const giderEkle: AssistantTool = {
  name: "gider_ekle",
  description:
    "İşletme gideri kaydeder (kira, kargo, reklam vb.). Kullanıcı onayı gerektirir.",
  riskClass: "onayli",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Gider tutarı (TL)" },
      category: {
        type: "string",
        enum: ["kira", "kargo", "reklam", "komisyon", "maaş", "fatura", "ambalaj", "vergi", "diğer"],
      },
      description: { type: "string", description: "Kısa açıklama" },
    },
    required: ["amount", "category", "description"],
    additionalProperties: false,
  },
  confirmText(input) {
    return `${str(input.category)} kategorisinde ${num(input.amount).toFixed(2)} TL gider ekleyeceğim ("${str(input.description)}"). Onaylıyor musun? (evet/hayır)`;
  },
  async execute(input) {
    const amount = num(input.amount);
    if (amount <= 0) throw new Error("Gider tutarı geçersiz.");
    const category = str(input.category) || "diğer";
    await db.createExpense({
      category,
      description: str(input.description).slice(0, 255),
      amount: String(amount),
    } as never);
    return `Gider eklendi: ${category} — ${amount.toFixed(2)} TL ✅ (Giderler sayfasında)`;
  },
};

const tahsilatEkle: AssistantTool = {
  name: "tahsilat_ekle",
  description:
    "Müşteriden alınan tahsilatı kaydeder ve varsa açık siparişine işler. Kullanıcı onayı gerektirir.",
  riskClass: "onayli",
  inputSchema: {
    type: "object",
    properties: {
      customerName: { type: "string", description: "Müşteri adı" },
      amount: { type: "number", description: "Tahsilat tutarı (TL)" },
      orderRef: { anyOf: [{ type: "string" }, { type: "null" }], description: "Sipariş no (varsa)" },
      note: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: ["customerName", "amount"],
    additionalProperties: false,
  },
  confirmText(input) {
    return `${str(input.customerName)} müşterisinden ${num(input.amount).toFixed(2)} TL tahsilat kaydedeceğim. Onaylıyor musun? (evet/hayır)`;
  },
  async execute(input) {
    const amount = num(input.amount);
    const rawName = str(input.customerName).trim();
    if (amount <= 0) throw new Error("Tahsilat tutarı geçersiz.");
    if (!rawName) throw new Error("Müşteri adı eksik.");
    const orderRef = input.orderRef == null ? undefined : str(input.orderRef);
    const [customersList, orders, accountList] = await Promise.all([
      db.listCustomers(),
      db.listOrders(),
      db.listAccounts(),
    ]);
    // Cari ekstre ada göre bağlandığı için kayıtlı adı esas al.
    const needle = rawName.toLowerCase();
    const canonical =
      customersList.find(c => c.name.trim().toLowerCase() === needle)?.name ??
      customersList.find(c => c.name.toLowerCase().includes(needle))?.name ??
      orders.find(o => o.customerName.toLowerCase().includes(needle))?.customerName ??
      rawName;
    const target = findOpenOrderForCollection(orders, canonical, orderRef);
    const account = accountList.find(a => a.kind === "kasa") ?? accountList[0];
    await db.createTransaction({
      accountId: account?.id ?? null,
      direction: "in",
      category: "tahsilat",
      amount: String(amount),
      customerName: canonical,
      orderId: target?.id ?? null,
      orderNo: target?.orderNo ?? null,
      description: "Asistan tahsilatı",
      note: input.note == null ? null : str(input.note),
    } as never);
    let message = `Tahsilat kaydedildi: ${canonical} — ${amount.toFixed(2)} TL ✅`;
    if (target) {
      const remaining = Math.max(0, num(target.totalAmount) - num(target.paidAmount) - amount);
      message += `\n${target.orderNo} siparişine işlendi${remaining > 0.001 ? `, kalan ${remaining.toFixed(2)} TL` : ", sipariş tamamen ödendi 🎉"}`;
    }
    if (account) message += `\nHesap: ${account.name}`;
    return message;
  },
};

const gorevEkle: AssistantTool = {
  name: "gorev_ekle",
  description:
    "Görev veya eksik listesi (alınacaklar) maddesi ekler. Kullanıcı onayı gerektirir.",
  riskClass: "onayli",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["eksik", "gorev"] },
      titles: { type: "array", items: { type: "string" }, description: "Eklenecek maddeler" },
    },
    required: ["kind", "titles"],
    additionalProperties: false,
  },
  confirmText(input) {
    const titles = Array.isArray(input.titles) ? input.titles.map(str) : [];
    const label = input.kind === "eksik" ? "eksik listesine" : "görevlere";
    return `${titles.map(t => `"${t}"`).join(", ")} ${label} ekleyeceğim (${titles.length} madde). Onaylıyor musun? (evet/hayır)`;
  },
  async execute(input) {
    const kind = input.kind === "eksik" ? "eksik" : "gorev";
    const titles = (Array.isArray(input.titles) ? input.titles.map(str) : [])
      .map(t => t.trim())
      .filter(Boolean);
    if (titles.length === 0) throw new Error("Eklenecek madde yok.");
    for (const title of titles) await db.createTask({ kind, title });
    const label = kind === "eksik" ? "eksik listesine" : "görevlere";
    return `${titles.map(t => `"${t}"`).join(", ")} ${label} eklendi ✅ (${titles.length} madde)`;
  },
};

// ---------------------------------------------------------------------------
// Kayıt defteri
// ---------------------------------------------------------------------------

/** Sıralı araç kayıt defteri. Bu sprintte "kritik" sınıfında araç YOKTUR. */
export const toolRegistry = new Map<string, AssistantTool>(
  [satisOzeti, kasaBakiyesi, borcluMusteriler, stokDurumu, siparisListesi, gorevListesi, giderEkle, tahsilatEkle, gorevEkle].map(
    t => [t.name, t]
  )
);

export function getTool(name: string): AssistantTool | undefined {
  return toolRegistry.get(name);
}

/** LLM'e gönderilecek araç tanımları — kritik sınıfı ASLA LLM'e sunulmaz. */
export function llmToolDefs(registry: ReadonlyMap<string, AssistantTool> = toolRegistry): Anthropic.Tool[] {
  return Array.from(registry.values())
    .filter(t => t.riskClass !== "kritik")
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
}

/** Onaylı bir araç onaysız çağrıldığında fırlatılır; summary onay sorusudur. */
export class ConfirmationRequiredError extends Error {
  constructor(
    public toolName: string,
    public input: Record<string, unknown>,
    public summary: string
  ) {
    super(summary);
    this.name = "ConfirmationRequiredError";
  }
}

/**
 * Aracı risk sınıfı kurallarıyla çalıştırır:
 *  - guvenli: her zaman çalışır.
 *  - onayli : yalnızca opts.confirmed === true ise çalışır; aksi halde
 *             ConfirmationRequiredError fırlatır (onay sorusuyla birlikte).
 *  - kritik : HİÇBİR koşulda çalışmaz (confirmed=true dahil) — garanti.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  opts: { confirmed?: boolean; registry?: ReadonlyMap<string, AssistantTool> } = {}
): Promise<string> {
  const registry = opts.registry ?? toolRegistry;
  const tool = registry.get(name);
  if (!tool) throw new Error(`Bilinmeyen araç: ${name}`);
  if (tool.riskClass === "kritik") {
    throw new Error(`"${name}" kritik sınıfta; asistan üzerinden otomatik çalıştırılamaz.`);
  }
  if (tool.riskClass === "onayli" && opts.confirmed !== true) {
    throw new ConfirmationRequiredError(
      name,
      input,
      tool.confirmText?.(input) ?? `"${name}" işlemini yapacağım. Onaylıyor musun? (evet/hayır)`
    );
  }
  return tool.execute(input);
}

// ---------------------------------------------------------------------------
// Bekleyen onay yönetimi — bellek içi, kullanıcı başına TEK bekleyen işlem,
// 10 dakika zaman aşımı. (Tek instance'lı Render dağıtımı için yeterli.)
// ---------------------------------------------------------------------------

export const PENDING_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export type PendingConfirmation = {
  toolName: string;
  input: Record<string, unknown>;
  summary: string;
  createdAt: number;
};

const pendingByUser = new Map<string, PendingConfirmation>();

export function setPendingConfirmation(
  userKey: string,
  data: Omit<PendingConfirmation, "createdAt">,
  now: number = Date.now()
): void {
  pendingByUser.set(userKey, { ...data, createdAt: now });
}

/** Süresi dolmuş bekleyen işlemi sessizce temizler ve null döner. */
export function getPendingConfirmation(
  userKey: string,
  now: number = Date.now()
): PendingConfirmation | null {
  const pending = pendingByUser.get(userKey);
  if (!pending) return null;
  if (now - pending.createdAt > PENDING_CONFIRMATION_TTL_MS) {
    pendingByUser.delete(userKey);
    return null;
  }
  return pending;
}

export function clearPendingConfirmation(userKey: string): void {
  pendingByUser.delete(userKey);
}

/** Onaylı aracı bekleyen onaya yazar ve kullanıcıya sorulacak metni döndürür. */
export function requestToolConfirmation(
  userKey: string,
  toolName: string,
  input: Record<string, unknown>,
  now: number = Date.now()
): string {
  const tool = toolRegistry.get(toolName);
  if (!tool) throw new Error(`Bilinmeyen araç: ${toolName}`);
  if (tool.riskClass !== "onayli") {
    throw new Error(`"${toolName}" onay akışına uygun değil (sınıf: ${tool.riskClass}).`);
  }
  const summary =
    tool.confirmText?.(input) ?? `"${toolName}" işlemini yapacağım. Onaylıyor musun? (evet/hayır)`;
  setPendingConfirmation(userKey, { toolName, input, summary }, now);
  return summary;
}

const YES_WORDS = new Set([
  "evet", "onay", "onayla", "onaylıyorum", "onayliyorum", "tamam", "tamamdır", "tamamdir",
  "olur", "okey", "ok", "yap", "he", "aynen", "kabul",
]);
const NO_WORDS = new Set([
  "hayır", "hayir", "iptal", "vazgeç", "vazgec", "yapma", "olmaz", "istemiyorum",
  "istemem", "yok", "no", "dur",
]);

/** Onay yanıtını çözer: "evet" → yes, "hayır" → no, başka bir şey → null. */
export function parseConfirmationReply(text: string): "yes" | "no" | null {
  const cleaned = text
    .toLocaleLowerCase("tr")
    .replace(/[.,!?]/g, " ")
    .replace(/👍|✅|❌/g, " ")
    .trim();
  if (YES_WORDS.has(cleaned)) return "yes";
  if (NO_WORDS.has(cleaned)) return "no";
  return null;
}

// ---------------------------------------------------------------------------
// Anthropic tool-use döngüsü — soru-cevap (ve LLM'in seçtiği onaylı işlemler).
// ---------------------------------------------------------------------------

const LOOP_SYSTEM =
  "Art of Colour boya işletmesinin kişisel asistanısın. Kullanıcının sorusunu yanıtlamak için " +
  "SADECE sana verilen araçlardan gelen veriyi kullan; veri yoksa uydurma, 'bu bilgi elimde yok' de. " +
  "Türkçe, kısa ve esnaf diline uygun yanıt ver (WhatsApp mesajı gibi, birkaç cümle/madde). Tutarları TL yaz. " +
  "Yazma araçları (gider_ekle, tahsilat_ekle, gorev_ekle) kullanıcı onayı ister; sistem onayı senin yerine yönetir, " +
  "aracı normal şekilde çağırman yeterli.";

const MAX_TOOL_ROUNDS = 5;

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
}

/**
 * Anthropic messages + tools döngüsü: LLM güvenli araçlarla veriyi çeker ve
 * yanıtı üretir. LLM onaylı bir araç çağırırsa araç ÇALIŞTIRILMAZ; işlem
 * bekleyen onaya yazılır ve kullanıcıya onay sorusu döndürülür.
 */
export async function answerWithTools(
  question: string,
  userKey: string
): Promise<{ message: string; needsConfirmation: boolean }> {
  if (!isClaudeConfigured()) {
    throw new Error("AI asistan için ANTHROPIC_API_KEY gerekli (Render > Environment'a ekleyin).");
  }
  const client = new Anthropic();
  const tools = llmToolDefs();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1500,
        thinking: { type: "adaptive" },
        system: LOOP_SYSTEM,
        tools,
        messages,
      });
    } catch (error) {
      throw translateApiError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new Error("Soru yanıtlanamadı, tekrar deneyin.");
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return {
        message: textOf(response) || "Bu soruya yanıt üretemedim, farklı şekilde sorabilir misin?",
        needsConfirmation: false,
      };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const input = (toolUse.input ?? {}) as Record<string, unknown>;
      try {
        const output = await executeTool(toolUse.name, input);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: output });
      } catch (error) {
        if (error instanceof ConfirmationRequiredError) {
          // Yazma aracı onaysız ÇALIŞTIRILMAZ: bekleyen onaya yaz, kullanıcıya sor.
          setPendingConfirmation(userKey, {
            toolName: error.toolName,
            input: error.input,
            summary: error.summary,
          });
          return { message: error.summary, needsConfirmation: true };
        }
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error instanceof Error ? error.message : "Araç çalıştırılamadı",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  throw new Error("Soru çok fazla adım gerektirdi, daha net sorabilir misin?");
}
