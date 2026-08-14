import { describe, expect, it } from "vitest";
import { resolveText, upperText, type TextLayer } from "./layout";

/**
 * Kartlarda **KİRMİZİ** yazıyordu.
 *
 * Katalogdaki adların bir kısmı Türkçe harf kullanmadan yazılmış ("Kirmizi",
 * "Denizmavisi") ve Türkçe büyütme kuralı `i` harfini `İ` yapıyor. Müşteriye
 * giden görselde yanlış yazılmış ürün adı demekti.
 */
describe("upperText", () => {
  it("Türkçe harf içermeyen adı bozmaz", () => {
    expect(upperText("Kirmizi")).toBe("KIRMIZI");
    expect(upperText("Denizmavisi")).toBe("DENIZMAVISI");
    expect(upperText("Acikmavi")).toBe("ACIKMAVI");
    expect(upperText("Vivid Candy")).toBe("VIVID CANDY");
  });

  it("düzgün yazılmış Türkçe adı doğru büyütür", () => {
    expect(upperText("Kırmızı")).toBe("KIRMIZI");
    expect(upperText("Fuşya")).toBe("FUŞYA");
    expect(upperText("Gümüş")).toBe("GÜMÜŞ");
    expect(upperText("Açık Yeşil")).toBe("AÇIK YEŞİL");
  });

  it("Türkçe harfi olan metinde i → İ kuralı korunur", () => {
    // "İğne" düzgün yazılmış (ğ var): Türkçe kural uygulanır.
    expect(upperText("iğne")).toBe("İĞNE");
  });

  it("boş metinde çökmez", () => {
    expect(upperText("")).toBe("");
  });

  it("metin katmanı bu kuralı kullanır", () => {
    const layer: TextLayer = {
      id: "t1",
      type: "text",
      box: { x: 0, y: 0, w: 1, h: 0.1 },
      text: "{nameTr}",
      size: 0.04,
      weight: 700,
      color: "#000",
      align: "left",
      transform: "upper",
      visible: true,
    };
    expect(resolveText(layer, { nameTr: "Kirmizi" })).toBe("KIRMIZI");
    expect(resolveText(layer, { nameTr: "Fuşya" })).toBe("FUŞYA");
    expect(resolveText({ ...layer, transform: "none" }, { nameTr: "Kirmizi" })).toBe("Kirmizi");
  });
});
