import { describe, expect, it } from "vitest";
import type { VoiceCommand } from "./_core/claude";
import {
  buildConfirmPreview,
  classifyIntent,
  CONFIRM_HINT,
  describeCommand,
  isAffirmation,
  isNegation,
  preflightCheck,
} from "./assistantApproval";

/** Tüm alanları dolu bir VoiceCommand üretir (test için). */
function cmd(p: Partial<VoiceCommand> & { intent: VoiceCommand["intent"] }): VoiceCommand {
  return {
    intent: p.intent,
    customerName: p.customerName ?? null,
    channel: p.channel ?? null,
    items: p.items ?? null,
    materialName: p.materialName ?? null,
    quantity: p.quantity ?? null,
    unit: p.unit ?? null,
    noteText: p.noteText ?? null,
    taskKind: p.taskKind ?? null,
    taskItems: p.taskItems ?? null,
    listKind: p.listKind ?? null,
    orderRef: p.orderRef ?? null,
    orderStatus: p.orderStatus ?? null,
    amount: p.amount ?? null,
    expenseCategory: p.expenseCategory ?? null,
    reply: p.reply ?? "",
  };
}

describe("classifyIntent (onay sınıflandırma)", () => {
  it("kritik: para/kayıt dokunanlar", () => {
    for (const i of ["sale", "order", "expense_add", "collection_add"] as const) {
      expect(classifyIntent(i)).toBe("critical");
    }
  });
  it("onaylı: stok/görev/sipariş durumu", () => {
    for (const i of ["stock_in", "stock_out", "task_add", "task_done", "order_status"] as const) {
      expect(classifyIntent(i)).toBe("confirm");
    }
  });
  it("güvenli: okuma + düşük riskli (query/list/help/note/unknown)", () => {
    for (const i of ["query", "task_list", "help", "note", "unknown"] as const) {
      expect(classifyIntent(i)).toBe("safe");
    }
  });
});

describe("preflightCheck (onay öncesi saf alan kontrolü)", () => {
  it("stok: malzeme/miktar eksikse başarısız, doluysa geçer", () => {
    expect(preflightCheck(cmd({ intent: "stock_in" })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "stock_in", materialName: "tiner", quantity: 2 })).ok).toBe(true);
  });
  it("gider: tutar yoksa/0 ise başarısız", () => {
    expect(preflightCheck(cmd({ intent: "expense_add" })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "expense_add", amount: 0 })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "expense_add", amount: 250 })).ok).toBe(true);
  });
  it("tahsilat: tutar VE müşteri gerekir", () => {
    expect(preflightCheck(cmd({ intent: "collection_add", amount: 500 })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "collection_add", customerName: "Ahmet" })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "collection_add", amount: 500, customerName: "Ahmet" })).ok).toBe(true);
  });
  it("sipariş durumu: hedef durum yoksa başarısız", () => {
    expect(preflightCheck(cmd({ intent: "order_status" })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "order_status", orderStatus: "ready" })).ok).toBe(true);
  });
  it("görev ekle: madde de not da yoksa başarısız, taskItems varsa geçer", () => {
    expect(preflightCheck(cmd({ intent: "task_add" })).ok).toBe(false);
    expect(preflightCheck(cmd({ intent: "task_add", taskItems: ["etiket"] })).ok).toBe(true);
    expect(preflightCheck(cmd({ intent: "task_add", noteText: "kutu al" })).ok).toBe(true);
  });
  it("satış: alan koruması yok (varsayılanlarla açılır)", () => {
    expect(preflightCheck(cmd({ intent: "sale" })).ok).toBe(true);
  });
  it("başarısız sonuç dostça bir mesaj taşır", () => {
    const r = preflightCheck(cmd({ intent: "collection_add", amount: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
  });
});

describe("describeCommand + buildConfirmPreview (önizleme)", () => {
  it("satış önizlemesi müşteri, kalem ve toplamı içerir", () => {
    const s = describeCommand(
      cmd({ intent: "sale", customerName: "Ali", items: [{ name: "vernik", quantity: 2, unitPrice: 250 }] }),
    );
    expect(s).toContain("Ali");
    expect(s).toContain("vernik");
    expect(s).toContain("500");
  });
  it("tahsilat önizlemesi müşteri ve tutarı içerir", () => {
    const s = describeCommand(cmd({ intent: "collection_add", customerName: "Ayşe", amount: 300 }));
    expect(s).toContain("Ayşe");
    expect(s).toContain("300");
  });
  it("kritik önizleme uyarı + onay ipucu taşır", () => {
    const p = buildConfirmPreview(cmd({ intent: "expense_add", amount: 100, expenseCategory: "kargo" }), "critical");
    expect(p).toContain("⚠️");
    expect(p).toContain(CONFIRM_HINT);
  });
});

describe("isAffirmation / isNegation (kalıp tabanlı onay tespiti)", () => {
  it("net onaylar", () => {
    for (const t of ["evet", "Evet", "tamam", "olur", "onayla", "he", "evet 👍", "tamam olsun", "onaylıyorum"]) {
      expect(isAffirmation(t)).toBe(true);
    }
  });
  it("onay olmayanlar", () => {
    for (const t of ["", "biraz bekle", "evet ama sonra", "Ahmet 500 lira ödedi", "hayır", "yok"]) {
      expect(isAffirmation(t)).toBe(false);
    }
  });
  it("net iptaller", () => {
    for (const t of ["hayır", "iptal", "vazgeç", "yok", "olmaz", "iptal et"]) {
      expect(isNegation(t)).toBe(true);
    }
  });
  it("iptal olmayanlar (dua/temenni onay/iptal sayılmaz)", () => {
    for (const t of ["evet", "hayırlı olsun", "gider ekle: kargoya 250 lira"]) {
      expect(isNegation(t)).toBe(false);
    }
  });
  it("onay ve iptal birbirini dışlar", () => {
    expect(isAffirmation("evet") && isNegation("evet")).toBe(false);
    expect(isAffirmation("hayır") || isNegation("hayır")).toBe(true);
  });
});
