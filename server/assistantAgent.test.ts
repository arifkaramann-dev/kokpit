import { describe, expect, it } from "vitest";
import { matchConfirmation } from "./assistantAgent";

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
