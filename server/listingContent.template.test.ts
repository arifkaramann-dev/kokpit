import { describe, expect, it } from "vitest";
import { surfaceSentence, templateContentBlock } from "./contentAi";
import { fillTemplate } from "./listingContent";

/**
 * Bu metinler pazaryerinde MÜŞTERİYE görünüyor.
 *
 * Canlıda "CANDY Fuşya — için geliştirilmiş boya." diye gitti: jenerik ilanda
 * kullanım alanı boş geliyor ve ona bağlı cümle sakat kalıyordu. Testler hem
 * bu tuzağı hem metnin işe yarar olmasını koruyor.
 */
describe("fillTemplate — koşullu bölümler", () => {
  it("değişken doluyken bölümü korur ve doldurur", () => {
    const out = fillTemplate("Boya.{{#kullanim}} {{kullanim}} için üretilmiştir.{{/kullanim}}", {
      kullanim: "Airbrush",
    });
    expect(out).toBe("Boya. Airbrush için üretilmiştir.");
  });

  it("değişken boşken bölümü tamamen düşürür", () => {
    // Eski davranış "— için geliştirilmiş boya." üretiyordu.
    const out = fillTemplate("Boya.{{#kullanim}} {{kullanim}} için üretilmiştir.{{/kullanim}}", {
      kullanim: null,
    });
    expect(out).toBe("Boya.");
    expect(out).not.toContain("için");
  });

  it("yalnız boşluktan ibaret değeri boş sayar", () => {
    const out = fillTemplate("A{{#renk}} {{renk}} tonu{{/renk}}", { renk: "   " });
    expect(out).toBe("A");
  });

  it("koşulsuz değişken eskisi gibi doldurulur", () => {
    expect(fillTemplate("{{seri}} {{renk}}", { seri: "CANDY", renk: "Fuşya" })).toBe("CANDY Fuşya");
  });

  it("boş değişkenden kalan sarkan ayracı temizler", () => {
    expect(fillTemplate("<strong>{{seri}}</strong> — {{kullanim}}.", { seri: "CANDY" })).toBe(
      "<strong>CANDY</strong>.",
    );
  });
});

describe("surfaceSentence", () => {
  it("kısa listeyi olduğu gibi yazar", () => {
    expect(surfaceSentence(["Metal", "Plastik"], "genel")).toBe("Metal, Plastik");
  });

  it("uzun listeyi kısaltır — anahtar kelime yığını yapmaz", () => {
    const uzun = [
      "Otomobil", "Araç", "Motosiklet", "Bisiklet", "Jant", "Kask",
      "Tampon", "Spoiler", "Metal", "Demir", "Çelik", "Alüminyum",
      "Rapala", "Sahte Balık",
    ];
    const out = surfaceSentence(uzun, "genel");
    expect(out).toBe("Otomobil, Araç, Motosiklet, Bisiklet, Jant, Kask ve benzeri yüzeyler");
    // Alakasız kalemler ilanın önüne çıkmamalı.
    expect(out).not.toContain("Sahte Balık");
  });

  it("liste yoksa yedek metne düşer", () => {
    expect(surfaceSentence([], "Airbrush")).toBe("Airbrush");
    expect(surfaceSentence(undefined, "Airbrush")).toBe("Airbrush");
  });
});

describe("templateContentBlock — pazaryerine giden metin", () => {
  const ctx = {
    seriesName: "CANDY",
    useCaseName: "Airbrush",
    surfaces: ["Metal", "Plastik", "Ahşap"],
  };

  it("jenerik ilanda (kullanım alanı boş) düzgün cümle üretir", () => {
    const filled = fillTemplate(templateContentBlock(ctx).longDescription, {
      seri: "CANDY",
      renk: "Fuşya",
      ambalaj: "100 ml",
      kullanim: null,
    });
    expect(filled).not.toContain("— için");
    expect(filled).not.toContain("{{");
    expect(filled).toContain("CANDY");
    expect(filled).toContain("Fuşya");
  });

  it("kullanım alanı doluyken onu cümleye katar", () => {
    const filled = fillTemplate(templateContentBlock(ctx).longDescription, {
      seri: "CANDY",
      renk: "Fuşya",
      ambalaj: "100 ml",
      kullanim: "Airbrush",
    });
    expect(filled).toContain("Airbrush uygulamaları için üretilmiştir");
  });

  it("alıcının sorduğu bilgileri içerir — sadece etiket dökümü değil", () => {
    const filled = fillTemplate(templateContentBlock(ctx).longDescription, {
      seri: "CANDY",
      renk: "Fuşya",
      ambalaj: "100 ml",
    });
    expect(filled).toContain("Nasıl uygulanır");
    expect(filled).toContain("kat");
    expect(filled).toContain("saklayınız");
  });

  it("hiçbir metinde doldurulmamış değişken kalmaz", () => {
    const block = templateContentBlock(ctx);
    const vars = { seri: "CANDY", renk: "Fuşya", ambalaj: "100 ml", kullanim: "Airbrush" };
    for (const text of [
      block.shortDescription,
      block.longDescription,
      block.applicationText,
      block.labelText,
    ]) {
      const filled = fillTemplate(text, vars);
      expect(filled).not.toContain("{{");
      expect(filled).not.toContain("}}");
    }
  });
});
