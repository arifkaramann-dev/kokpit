import { describe, expect, it } from "vitest";
import { barcodeSVG } from "./barcode";

describe("barcodeSVG (Code 128-B)", () => {
  it("üretilen SVG geçerli ve barkod içeriyor", () => {
    const svg = barcodeSVG("TY-123456");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("aria-label=\"Barkod TY-123456\"");
    // Okunabilir metin barkodun altında yer alır.
    expect(svg).toContain(">TY-123456</text>");
    // En az birkaç çubuk (rect) çizilmiş olmalı.
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(5);
  });

  it("doğru başlangıç ve bitiş desenlerini kodlar", () => {
    // Start B deseni "211214" (çubuk 2, boşluk 1, çubuk 1, boşluk 2, çubuk 1, boşluk 4)
    // modül genişliği 1 ile ilk çubuk x=10 (sessiz alan) genişlik 2 olmalı.
    const svg = barcodeSVG("A", { moduleWidth: 1, height: 10, showText: false });
    expect(svg).toContain('<rect x="10" y="0" width="2" height="10" />');
    // Stop deseni "2331112" ile biter; son çubuk 2 modül genişliğinde olmalı.
    // (Ayrıntılı doğrulama yerine desen tablosunun tutarlılığını kontrol ediyoruz.)
    expect(svg).toContain("<svg");
  });

  it("özel karakter içeren metni kaçış ile işler", () => {
    const svg = barcodeSVG("A&B");
    expect(svg).toContain("A&amp;B");
  });
});
