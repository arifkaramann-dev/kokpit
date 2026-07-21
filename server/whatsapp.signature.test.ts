import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { isAllowedNumberMatch, verifyWebhookSignature } from "./whatsapp";

const SECRET = "test-app-secret";

function sign(rawBody: Buffer, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

describe("verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ entry: [{ id: "1" }] }));

  it("geçerli imzayı kabul eder", () => {
    expect(verifyWebhookSignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it("yanlış secret ile üretilmiş imzayı reddeder", () => {
    expect(verifyWebhookSignature(body, sign(body, "baska-secret"), SECRET)).toBe(false);
  });

  it("gövdesi değiştirilmiş isteği reddeder", () => {
    const tampered = Buffer.from(JSON.stringify({ entry: [{ id: "2" }] }));
    expect(verifyWebhookSignature(tampered, sign(body, SECRET), SECRET)).toBe(false);
  });

  it("sha256= öneki olmayan imzayı reddeder", () => {
    const bare = sign(body, SECRET).slice("sha256=".length);
    expect(verifyWebhookSignature(body, bare, SECRET)).toBe(false);
  });

  it("boş veya eksik başlığı reddeder", () => {
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
  });

  it("farklı uzunluktaki imzada çökmez, reddeder", () => {
    expect(verifyWebhookSignature(body, "sha256=abc", SECRET)).toBe(false);
  });
});

describe("isAllowedNumberMatch (izinli numara eşleşmesi)", () => {
  it("birebir aynı numarayı eşler", () => {
    expect(isAllowedNumberMatch("905551112233", "905551112233")).toBe(true);
  });

  it("başında 0 ile kaydedilmiş numarayı Meta'nın 90'lı biçimiyle eşler", () => {
    expect(isAllowedNumberMatch("905551112233", "05551112233")).toBe(true);
  });

  it("+90 ve boşluklu biçimleri eşler", () => {
    expect(isAllowedNumberMatch("905551112233", "+90 555 111 22 33")).toBe(true);
  });

  it("virgüllü listede ikinci numarayı bulur", () => {
    expect(isAllowedNumberMatch("905551112233", "905000000000, 0555 111 22 33")).toBe(true);
  });

  it("farklı numarayı reddeder", () => {
    expect(isAllowedNumberMatch("905551112234", "905551112233")).toBe(false);
  });

  it("boş listeyi reddeder (güvenli varsayılan)", () => {
    expect(isAllowedNumberMatch("905551112233", "")).toBe(false);
  });

  it("10 haneden kısa kayıtları eşleşme sayısına almaz", () => {
    expect(isAllowedNumberMatch("905551112233", "2233")).toBe(false);
  });
});
