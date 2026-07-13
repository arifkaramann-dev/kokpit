import { beforeEach, describe, expect, it, vi } from "vitest";

// parseVoiceCommand'ı (LLM) ve db'yi taklit ederek asistanın gider/tahsilat
// komutlarını gerçek Claude/DB olmadan uçtan uca doğrularız.

const parseVoiceCommand = vi.fn();
vi.mock("./_core/claude", () => ({ parseVoiceCommand: (t: string) => parseVoiceCommand(t) }));

const createExpense = vi.fn(async () => 1);
const createTransaction = vi.fn(async () => 1);
const listAccounts = vi.fn(async () => [{ id: 7, name: "Ana Kasa", kind: "kasa", balance: 0 }]);
const listUnpaidOrders = vi.fn(async () => [
  { id: 42, orderNo: "AOC-123", customerName: "Ahmet Yılmaz", due: 500 },
  { id: 43, orderNo: "AOC-124", customerName: "Ahmet Yılmaz", due: 1200 },
]);
vi.mock("./db", () => ({
  createExpense: (d: unknown) => createExpense(d),
  createTransaction: (d: unknown) => createTransaction(d),
  listAccounts: () => listAccounts(),
  listUnpaidOrders: (n?: number) => listUnpaidOrders(n),
}));

const base = {
  customerName: null,
  channel: null,
  items: null,
  materialName: null,
  quantity: null,
  unit: null,
  noteText: null,
  taskKind: null,
  taskItems: null,
  listKind: null,
  orderRef: null,
  orderStatus: null,
  amount: null,
  expenseCategory: null,
  reply: "",
};

async function run(transcript: string) {
  const { executeAssistantCommand } = await import("./assistant");
  return executeAssistantCommand(transcript);
}

beforeEach(() => vi.clearAllMocks());

describe("asistan — gider ekleme (expense_add)", () => {
  it("gideri hem P&L'e kaydeder hem kasadan düşer", async () => {
    parseVoiceCommand.mockResolvedValue({
      ...base,
      intent: "expense_add",
      amount: 500,
      expenseCategory: "reklam",
      noteText: "Instagram reklamı",
    });
    const { message } = await run("reklama 500 lira harcadım");

    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(createExpense.mock.calls[0][0]).toMatchObject({ category: "reklam", amount: "500" });
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(createTransaction.mock.calls[0][0]).toMatchObject({
      accountId: 7,
      direction: "out",
      category: "gider",
      amount: "500",
    });
    expect(message).toContain("500");
  });

  it("tutar yoksa hata verir, kayıt açmaz", async () => {
    parseVoiceCommand.mockResolvedValue({ ...base, intent: "expense_add", amount: null });
    await expect(run("gider ekle")).rejects.toThrow();
    expect(createExpense).not.toHaveBeenCalled();
  });
});

describe("asistan — tahsilat ekleme (collection_add)", () => {
  it("müşterinin en yüksek borçlu siparişine tahsilat işler ve kasaya girer", async () => {
    parseVoiceCommand.mockResolvedValue({
      ...base,
      intent: "collection_add",
      customerName: "Ahmet",
      amount: 300,
    });
    const { message } = await run("Ahmet 300 lira ödedi");

    expect(createTransaction).toHaveBeenCalledTimes(1);
    const txn = createTransaction.mock.calls[0][0] as Record<string, unknown>;
    expect(txn).toMatchObject({
      direction: "in",
      category: "tahsilat",
      amount: "300",
      accountId: 7,
      orderId: 43, // 1200 TL borçlu sipariş (en yüksek)
      orderNo: "AOC-124",
    });
    expect(message).toContain("AOC-124");
  });

  it("sipariş no verilince o siparişe eşler", async () => {
    parseVoiceCommand.mockResolvedValue({
      ...base,
      intent: "collection_add",
      orderRef: "AOC-123",
      amount: 500,
    });
    await run("AOC-123'ten 500 tahsil ettim");
    const txn = createTransaction.mock.calls[0][0] as Record<string, unknown>;
    expect(txn).toMatchObject({ orderId: 42, orderNo: "AOC-123" });
  });

  it("müşteri ve sipariş yoksa hata verir", async () => {
    parseVoiceCommand.mockResolvedValue({ ...base, intent: "collection_add", amount: 100 });
    await expect(run("para geldi")).rejects.toThrow();
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
