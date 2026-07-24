import { describe, expect, it } from "vitest";
import { extractMessageText, isControlChat, normalizeJid, readWaConfig, sameJid } from "./whatsapp";

describe("whatsapp köprüsü — saf mantık", () => {
  describe("readWaConfig", () => {
    it("varsayılan: kapalı, .wa-auth, boş kontrol", () => {
      expect(readWaConfig({})).toEqual({ enabled: false, authDir: ".wa-auth", controlJid: "" });
    });
    it("WHATSAPP_ENABLED=1 açar, diğer değerler açmaz", () => {
      expect(readWaConfig({ WHATSAPP_ENABLED: "1" }).enabled).toBe(true);
      expect(readWaConfig({ WHATSAPP_ENABLED: "true" }).enabled).toBe(false);
      expect(readWaConfig({ WHATSAPP_ENABLED: "0" }).enabled).toBe(false);
    });
    it("authDir ve controlJid env'den okunur (trim'li)", () => {
      const cfg = readWaConfig({ WHATSAPP_AUTH_DIR: "/data/wa", WHATSAPP_CONTROL_JID: "  905321234567@s.whatsapp.net  " });
      expect(cfg.authDir).toBe("/data/wa");
      expect(cfg.controlJid).toBe("905321234567@s.whatsapp.net");
    });
  });

  describe("normalizeJid", () => {
    it("cihaz ekini ve sunucu ekini atar", () => {
      expect(normalizeJid("905321234567:12@s.whatsapp.net")).toBe("905321234567");
      expect(normalizeJid("905321234567@s.whatsapp.net")).toBe("905321234567");
    });
    it("boş/undefined güvenli", () => {
      expect(normalizeJid(undefined)).toBe("");
      expect(normalizeJid(null)).toBe("");
      expect(normalizeJid("")).toBe("");
    });
  });

  describe("sameJid", () => {
    it("cihaz eki farklı olsa da aynı hesabı eşler", () => {
      expect(sameJid("905321234567:3@s.whatsapp.net", "905321234567@s.whatsapp.net")).toBe(true);
    });
    it("farklı numaraları ayırır, boşları eşlemez", () => {
      expect(sameJid("905321234567@s.whatsapp.net", "905000000000@s.whatsapp.net")).toBe(false);
      expect(sameJid("", "")).toBe(false);
      expect(sameJid(undefined, "905321234567@s.whatsapp.net")).toBe(false);
    });
  });

  describe("isControlChat", () => {
    const self = "905321234567:5@s.whatsapp.net";
    it("controlJid boşsa self-chat (kendine mesaj) kontrol yüzeyidir", () => {
      expect(isControlChat("905321234567@s.whatsapp.net", "", self)).toBe(true);
      expect(isControlChat("905999999999@s.whatsapp.net", "", self)).toBe(false);
    });
    it("controlJid tanımlıysa yalnızca o sohbet geçer", () => {
      const ctrl = "905888888888@s.whatsapp.net";
      expect(isControlChat("905888888888@s.whatsapp.net", ctrl, self)).toBe(true);
      expect(isControlChat("905321234567@s.whatsapp.net", ctrl, self)).toBe(false);
    });
    it("status@broadcast ve boş asla geçmez", () => {
      expect(isControlChat("status@broadcast", "", self)).toBe(false);
      expect(isControlChat(undefined, "", self)).toBe(false);
    });
  });

  describe("extractMessageText", () => {
    it("düz conversation", () => {
      expect(extractMessageText({ conversation: "  900e düzleriz  " })).toBe("900e düzleriz");
    });
    it("extendedTextMessage (alıntılı/linkli)", () => {
      expect(extractMessageText({ extendedTextMessage: { text: "Bülent'e 900 elden satış" } })).toBe(
        "Bülent'e 900 elden satış",
      );
    });
    it("resim/video altyazısı", () => {
      expect(extractMessageText({ imageMessage: { caption: "dekont" } })).toBe("dekont");
      expect(extractMessageText({ videoMessage: { caption: "video not" } })).toBe("video not");
    });
    it("ephemeral/viewOnce sarmalını açar", () => {
      expect(extractMessageText({ ephemeralMessage: { message: { conversation: "gizli mesaj" } } })).toBe("gizli mesaj");
      expect(extractMessageText({ viewOnceMessageV2: { message: { conversation: "tek görüm" } } })).toBe("tek görüm");
    });
    it("metin yoksa / boşsa null", () => {
      expect(extractMessageText(null)).toBeNull();
      expect(extractMessageText({})).toBeNull();
      expect(extractMessageText({ conversation: "   " })).toBeNull();
      expect(extractMessageText({ imageMessage: {} })).toBeNull();
    });
  });
});
