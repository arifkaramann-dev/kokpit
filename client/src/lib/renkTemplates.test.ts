import { describe, expect, it } from "vitest";
import { PACKAGING, fallbackPackaging } from "./renkTemplates";

/**
 * Yerleşik yedek kutunun HACİMLE seçilmesi.
 *
 * Regresyon: yedek eskiden hattan seçiliyordu ve VIVID bir rengin 100 ml'lik
 * ürününe 400 ml sprey kutusu basılıyordu — müşteriye yanlış ürün.
 */
describe("fallbackPackaging", () => {
  it("hacmi tutan kutuyu seçer", () => {
    expect(fallbackPackaging(100, "VIVID")?.volumeMl).toBe(100);
    expect(fallbackPackaging(250, "METEOR")?.id).toBe("meteor-bottle250");
  });

  it("100 ml için ASLA sprey seçmez", () => {
    const pick = fallbackPackaging(100, "VIVID");
    expect(pick?.src).not.toContain("sprey");
  });

  it("hacim tutmuyorsa yedek vermez — uydurma kutu basılmaz", () => {
    expect(fallbackPackaging(20, "VIVID")).toBeNull();
    expect(fallbackPackaging(750, "METEOR")).toBeNull();
  });

  it("hacim yoksa yedek vermez", () => {
    expect(fallbackPackaging(null, "VIVID")).toBeNull();
    expect(fallbackPackaging(0, "VIVID")).toBeNull();
  });

  it("aynı hacimde iki kutu varsa hat eşitliği bozar", () => {
    expect(fallbackPackaging(400, "VIVID")?.id).toBe("vivid-spray400");
    expect(fallbackPackaging(400, "METEOR")?.id).toBe("meteor-spray400");
    // Tanınmayan hat: yine 400 ml olan bir kutu döner, sprey olmayan bir şey değil.
    expect(fallbackPackaging(400, "BILINMEYEN")?.volumeMl).toBe(400);
  });

  it("her yerleşik kutunun hacmi tanımlı", () => {
    for (const p of PACKAGING) expect(p.volumeMl).toBeGreaterThan(0);
  });
});
