import { describe, expect, it } from "vitest";
import {
  clearConversation,
  getHistory,
  isResetCommand,
  matchConfirmation,
  rememberTurn,
} from "./assistantAgent";

describe("asistan onay katmanı — cevap eşleştirme", () => {
  it("onay kelimelerini tanır (noktalama ve büyük harf toleranslı)", () => {
    expect(matchConfirmation("evet")).toBe("confirm");
    expect(matchConfirmation("Evet!")).toBe("confirm");
    expect(matchConfirmation("ONAYLA")).toBe("confirm");
    expect(matchConfirmation(" tamam. ")).toBe("confirm");
  });
  it("vazgeçme kelimelerini tanır", () => {
    expect(matchConfirmation("hayır")).toBe("cancel");
    expect(matchConfirmation("hayir")).toBe("cancel");
    expect(matchConfirmation("İptal")).toBe("cancel");
    expect(matchConfirmation("vazgeç")).toBe("cancel");
  });
  it("alakasız mesajı onay saymaz (yanlış para kaydı riski)", () => {
    expect(matchConfirmation("Ahmet 500 lira ödedi")).toBeNull();
    expect(matchConfirmation("evet ama tutar 300 olsun")).toBeNull();
    expect(matchConfirmation("")).toBeNull();
  });
});

describe("asistan konuşma hafızası", () => {
  it("turları sırayla saklar — 'ondan', 'o siparişi' çözülebilsin", () => {
    clearConversation("t1");
    rememberTurn("t1", "Bülent'in borcu ne kadar?", "Bülent Yılmaz: 1.250,00 TL borç.");
    rememberTurn("t1", "peki ondan 500 tahsil ettim", "Tahsilat kaydedildi.");

    const history = getHistory("t1");
    expect(history.map(m => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(history[0].content).toContain("Bülent");
  });

  it("sohbetler birbirine karışmaz (WhatsApp ↔ uygulama içi)", () => {
    clearConversation("app");
    clearConversation("wa:905321234567");
    rememberTurn("app", "uygulama sorusu", "uygulama cevabı");
    rememberTurn("wa:905321234567", "whatsapp sorusu", "whatsapp cevabı");

    expect(getHistory("app")).toHaveLength(2);
    expect(getHistory("wa:905321234567")[0].content).toBe("whatsapp sorusu");
  });

  it("geçmişi kırpar ama ilk mesaj hep 'user' kalır (API şartı)", () => {
    clearConversation("t2");
    for (let i = 0; i < 40; i++) rememberTurn("t2", `soru ${i}`, `cevap ${i}`);

    const history = getHistory("t2");
    expect(history.length).toBeLessThanOrEqual(24);
    expect(history[0].role).toBe("user");
    // En yeni tur korunmalı: kırpma baştan yapılır.
    expect(history[history.length - 1].content).toBe("cevap 39");
  });

  it("boş asistan cevabı geçmişe yazılmaz — anlamsız tur bağlamı kirletir", () => {
    clearConversation("t3");
    rememberTurn("t3", "merhaba", "   ");
    expect(getHistory("t3").map(m => m.role)).toEqual(["user"]);
  });

  it("sıfırlama komutlarını tanır", () => {
    expect(isResetCommand("yeni konu")).toBe(true);
    expect(isResetCommand("Unut.")).toBe(true);
    expect(isResetCommand("sıfırla")).toBe(true);
    // Cümle içinde geçmesi sıfırlama sayılmaz — yanlışlıkla bağlam silinmesin.
    expect(isResetCommand("bu siparişi unut ve yenisini aç")).toBe(false);
  });

  it("temizlenen sohbet gerçekten boşalır", () => {
    rememberTurn("t4", "bir şey", "cevap");
    clearConversation("t4");
    expect(getHistory("t4")).toHaveLength(0);
  });
});
