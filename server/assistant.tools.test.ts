import { describe, expect, it } from "vitest";
import {
  clearPendingConfirmation,
  ConfirmationRequiredError,
  executeTool,
  getPendingConfirmation,
  llmToolDefs,
  parseConfirmationReply,
  PENDING_CONFIRMATION_TTL_MS,
  requestToolConfirmation,
  setPendingConfirmation,
  toolRegistry,
  type AssistantTool,
} from "./assistantTools";
import { executeAssistantCommand } from "./assistant";

/** Çalışıp çalışmadığını kaydeden sahte araç üretir. */
function makeTool(name: string, riskClass: AssistantTool["riskClass"]) {
  const state = { executed: false };
  const tool: AssistantTool = {
    name,
    description: "test aracı",
    riskClass,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    confirmText: () => `${name} işlemini onaylıyor musun? (evet/hayır)`,
    execute: async () => {
      state.executed = true;
      return `${name} çalıştı`;
    },
  };
  return { tool, state };
}

describe("araç kayıt defteri — risk sınıfı kuralları", () => {
  it("(a) onaysız hiçbir 'onayli' araç execute edilmez", async () => {
    const { tool, state } = makeTool("test_onayli", "onayli");
    const registry = new Map([[tool.name, tool]]);

    await expect(executeTool("test_onayli", {}, { registry })).rejects.toBeInstanceOf(
      ConfirmationRequiredError
    );
    expect(state.executed).toBe(false);

    // confirmed: false açıkça verilse de çalışmaz.
    await expect(
      executeTool("test_onayli", {}, { registry, confirmed: false })
    ).rejects.toBeInstanceOf(ConfirmationRequiredError);
    expect(state.executed).toBe(false);

    // Yalnızca confirmed: true ile çalışır.
    await expect(executeTool("test_onayli", {}, { registry, confirmed: true })).resolves.toBe(
      "test_onayli çalıştı"
    );
    expect(state.executed).toBe(true);
  });

  it("(a) onay hatası, kullanıcıya sorulacak onay metnini taşır", async () => {
    const { tool } = makeTool("test_onayli", "onayli");
    const registry = new Map([[tool.name, tool]]);
    const error = await executeTool("test_onayli", { x: 1 }, { registry }).catch(e => e);
    expect(error).toBeInstanceOf(ConfirmationRequiredError);
    expect((error as ConfirmationRequiredError).summary).toContain("onaylıyor musun");
    expect((error as ConfirmationRequiredError).input).toEqual({ x: 1 });
  });

  it("(d) 'kritik' sınıf araç asla otomatik çalıştırılamaz (confirmed=true dahil)", async () => {
    const { tool, state } = makeTool("test_kritik", "kritik");
    const registry = new Map([[tool.name, tool]]);

    await expect(executeTool("test_kritik", {}, { registry })).rejects.toThrow(/kritik/);
    await expect(
      executeTool("test_kritik", {}, { registry, confirmed: true })
    ).rejects.toThrow(/kritik/);
    expect(state.executed).toBe(false);
  });

  it("(d) kritik sınıf araçlar LLM'e sunulan araç listesine girmez", () => {
    const { tool } = makeTool("test_kritik", "kritik");
    const registry = new Map<string, AssistantTool>([
      ["test_kritik", tool],
      ["satis_ozeti", toolRegistry.get("satis_ozeti")!],
    ]);
    const names = llmToolDefs(registry).map(t => t.name);
    expect(names).not.toContain("test_kritik");
    expect(names).toContain("satis_ozeti");
  });

  it("(d) gerçek kayıt defterinde bu sprintte kritik araç yoktur", () => {
    for (const tool of toolRegistry.values()) {
      expect(["guvenli", "onayli"]).toContain(tool.riskClass);
    }
  });

  it("guvenli araçlar onay istemez, bilinmeyen araç hata verir", async () => {
    const { tool, state } = makeTool("test_guvenli", "guvenli");
    const registry = new Map([[tool.name, tool]]);
    await expect(executeTool("test_guvenli", {}, { registry })).resolves.toBe(
      "test_guvenli çalıştı"
    );
    expect(state.executed).toBe(true);
    await expect(executeTool("boyle_arac_yok", {}, { registry })).rejects.toThrow(
      /Bilinmeyen araç/
    );
  });
});

describe("bekleyen onay yönetimi — zaman aşımı ve tek işlem", () => {
  it("(b) onay bekleyen işlem 10 dakikada zaman aşımına uğrar", () => {
    const t0 = 1_000_000;
    setPendingConfirmation("u-timeout", { toolName: "gider_ekle", input: {}, summary: "?" }, t0);

    // Süre dolmadan erişilebilir.
    expect(getPendingConfirmation("u-timeout", t0 + PENDING_CONFIRMATION_TTL_MS)).not.toBeNull();
    // Süre dolunca null döner ve kayıt temizlenir.
    expect(getPendingConfirmation("u-timeout", t0 + PENDING_CONFIRMATION_TTL_MS + 1)).toBeNull();
    expect(getPendingConfirmation("u-timeout", t0)).toBeNull();
  });

  it("kullanıcı başına tek bekleyen işlem tutulur (yenisi eskisini ezer)", () => {
    setPendingConfirmation("u-tek", { toolName: "gider_ekle", input: { a: 1 }, summary: "1" }, 0);
    setPendingConfirmation("u-tek", { toolName: "gorev_ekle", input: { b: 2 }, summary: "2" }, 1);
    const pending = getPendingConfirmation("u-tek", 2);
    expect(pending?.toolName).toBe("gorev_ekle");
    clearPendingConfirmation("u-tek");
    expect(getPendingConfirmation("u-tek", 3)).toBeNull();
  });

  it("bekleyen onaylar kullanıcıya (userKey) özeldir", () => {
    setPendingConfirmation("905551112233", { toolName: "gider_ekle", input: {}, summary: "?" }, 0);
    expect(getPendingConfirmation("app", 1)).toBeNull();
    expect(getPendingConfirmation("905551112233", 1)).not.toBeNull();
    clearPendingConfirmation("905551112233");
  });

  it("requestToolConfirmation onay sorusunu döndürür ve bekleyene yazar", () => {
    const message = requestToolConfirmation(
      "u-req",
      "tahsilat_ekle",
      { customerName: "Ahmet Yılmaz", amount: 500 },
      0
    );
    expect(message).toContain("Ahmet Yılmaz");
    expect(message).toContain("500.00 TL");
    expect(message).toContain("Onaylıyor musun");
    const pending = getPendingConfirmation("u-req", 1);
    expect(pending?.toolName).toBe("tahsilat_ekle");
    clearPendingConfirmation("u-req");
  });

  it("requestToolConfirmation yalnızca 'onayli' sınıfı kabul eder", () => {
    expect(() => requestToolConfirmation("u-x", "satis_ozeti", {})).toThrow(/onay akışına uygun değil/);
  });
});

describe("onay yanıtı çözümleme", () => {
  it("evet varyantlarını tanır", () => {
    expect(parseConfirmationReply("evet")).toBe("yes");
    expect(parseConfirmationReply("Evet!")).toBe("yes");
    expect(parseConfirmationReply(" TAMAM ")).toBe("yes");
    expect(parseConfirmationReply("onaylıyorum")).toBe("yes");
  });

  it("hayır varyantlarını tanır", () => {
    expect(parseConfirmationReply("hayır")).toBe("no");
    expect(parseConfirmationReply("HAYIR")).toBe("no");
    expect(parseConfirmationReply("iptal")).toBe("no");
    expect(parseConfirmationReply("vazgeç")).toBe("no");
  });

  it("belirsiz yanıtlarda null döner", () => {
    expect(parseConfirmationReply("belki")).toBeNull();
    expect(parseConfirmationReply("bugün ciro ne kadar")).toBeNull();
  });
});

describe("executeAssistantCommand — onay akışı (LLM çağrısı olmadan)", () => {
  it("(c) 'hayır' yanıtı bekleyen işlemi iptal eder, araç çalışmaz", async () => {
    const { tool, state } = makeTool("test_iptal_araci", "onayli");
    toolRegistry.set(tool.name, tool);
    try {
      setPendingConfirmation("wa-1", {
        toolName: tool.name,
        input: {},
        summary: "onaylıyor musun?",
      });
      const result = await executeAssistantCommand("hayır", { userKey: "wa-1" });
      expect(result.message).toContain("iptal");
      expect(state.executed).toBe(false);
      expect(getPendingConfirmation("wa-1")).toBeNull();
    } finally {
      toolRegistry.delete(tool.name);
      clearPendingConfirmation("wa-1");
    }
  });

  it("'evet' yanıtı bekleyen işlemi onaylayıp çalıştırır", async () => {
    const { tool, state } = makeTool("test_onay_araci", "onayli");
    toolRegistry.set(tool.name, tool);
    try {
      setPendingConfirmation("wa-2", {
        toolName: tool.name,
        input: {},
        summary: "onaylıyor musun?",
      });
      const result = await executeAssistantCommand("evet", { userKey: "wa-2" });
      expect(result.message).toBe("test_onay_araci çalıştı");
      expect(state.executed).toBe(true);
      expect(getPendingConfirmation("wa-2")).toBeNull();
    } finally {
      toolRegistry.delete(tool.name);
      clearPendingConfirmation("wa-2");
    }
  });

  it("(b) süresi dolmuş bekleyen işlem 'evet' dense bile çalıştırılmaz", async () => {
    const { tool, state } = makeTool("test_gec_onay", "onayli");
    toolRegistry.set(tool.name, tool);
    // LLM anahtarını geçici kaldır: zaman aşımı sonrası "evet" normal komut
    // olarak işlenmeye gider; anahtar yokken LLM'e ÇIKILMADAN hata döner.
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      // 11 dakika önce oluşturulmuş bekleyen işlem.
      setPendingConfirmation(
        "wa-3",
        { toolName: tool.name, input: {}, summary: "onaylıyor musun?" },
        Date.now() - PENDING_CONFIRMATION_TTL_MS - 60_000
      );
      // Bekleyen işlem zaman aşımına uğradığı için "evet" normal komut gibi
      // işlenmeye gider; LLM anahtarı test ortamında olmadığından hata döner —
      // önemli olan aracın ÇALIŞMAMASI.
      await executeAssistantCommand("evet", { userKey: "wa-3" }).catch(() => undefined);
      expect(state.executed).toBe(false);
    } finally {
      toolRegistry.delete(tool.name);
      clearPendingConfirmation("wa-3");
    }
  });
});
