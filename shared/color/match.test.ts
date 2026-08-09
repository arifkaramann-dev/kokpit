/**
 * Eşleştirme motoru ve boya kaydı tamamlama testleri.
 *
 * Kaynak: renk uygulamasının `test/engine.test.mjs` dosyasının eşleştirme ve
 * normalleştirme bölümleri. Oradaki testler katalog JSON'ı üzerinden dönüyordu;
 * katalog artık boş olduğu için o döngüler sessizce hiçbir şey doğrulamıyordu.
 * Burada sabit örneklerle yeniden kuruldu — test, verinin varlığına değil
 * davranışa bakmalı.
 */
import { describe, expect, it } from "vitest";
import { deltaE2000, faceAndFlop, hexToLab, synthesizeMultiAngle, type Lab } from "@shared/color/color";
import { findClosest } from "@shared/color/match";
import { normalizePaint, type Paint } from "@shared/color/paint";
import { SERIES_IDS, getSeries } from "@shared/color/series";

/** Test havuzu — her seriden bir kayıt, birbirinden uzak renkler. */
const PAINTS: Paint[] = [
  { id: "p1", code: "AOC-001", name: "Kırmızı", series: "Solid", hex: "#c8102e", metallic: 0 },
  { id: "p2", code: "AOC-002", name: "Mavi", series: "Metallic", hex: "#1b4f8c", metallic: 0.34 },
  { id: "p3", code: "AOC-003", name: "Yeşil", series: "Pearl", hex: "#1e7a46", metallic: 0.16 },
  { id: "p4", code: "AOC-004", name: "Mor", series: "Candy", hex: "#6b2d8f", metallic: 0.58 },
  { id: "p5", code: "AOC-005", name: "Antrasit", series: "Meteor", hex: "#1a1a2e", metallic: 0.4 },
].map(p => {
  const base = normalizePaint(p)!;
  // Ölçüm yok; seri malzemesinden sentetik açı profili üret ki face/flop
  // ayrımı test edilebilsin.
  return {
    ...base,
    multi_angle: synthesizeMultiAngle(base.lab, { metallic: base.metallic }),
  };
});

describe("findClosest", () => {
  it.each(PAINTS)("$code kendi face rengiyle arandığında 1. sırada ve ΔE≈0", paint => {
    const { face } = faceAndFlop(paint.multi_angle);
    const top = findClosest(face!.lab, PAINTS, { limit: 1 })[0];
    expect(top.paint.id).toBe(paint.id);
    expect(top.deltaE).toBeLessThan(1e-9);
  });

  it("sonuçları ΔE'ye göre artan sıralar", () => {
    const results = findClosest({ l: 50, a: 40, b: 20 }, PAINTS, { limit: 10 });
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i].deltaE).toBeGreaterThanOrEqual(results[i - 1].deltaE);
    }
  });

  it("limit havuzdan büyükse havuz kadar döner", () => {
    expect(findClosest({ l: 50, a: 40, b: 20 }, PAINTS, { limit: 99 })).toHaveLength(PAINTS.length);
  });

  it("limit havuzdan küçükse keser", () => {
    expect(findClosest({ l: 50, a: 40, b: 20 }, PAINTS, { limit: 2 })).toHaveLength(2);
  });

  it("seri filtresi uygulanır", () => {
    const onlyPearl = findClosest({ l: 50, a: 0, b: 0 }, PAINTS, { limit: 50, series: "Pearl" });
    expect(onlyPearl.length).toBeGreaterThan(0);
    expect(onlyPearl.every(r => r.paint.series === "Pearl")).toBe(true);
  });

  it("boş havuzda boş dizi döner, patlamaz", () => {
    expect(findClosest({ l: 50, a: 0, b: 0 }, [])).toEqual([]);
  });
});

describe("normalizePaint", () => {
  const NUMERIC_FIELDS = ["metallic", "pearl", "flake", "gloss", "transparency"] as const;

  // Üretim ekranı, içe aktarma ve elle giriş farklı alan kümeleri yazıyor.
  const partials = [
    { id: "a", hex: "#1b5fbf", series: "Metallic" },
    { id: "b", hex: "#c8102e" }, // seri bile yok
    { id: "c", hex: "#0a0a0c", series: "Meteor", flake: 0.5 },
    {}, // tamamen boş
  ];

  it.each(partials)("eksik kayıt %j sayısal alanları tanımlı bırakmaz", rec => {
    const p = normalizePaint(rec)!;
    for (const f of NUMERIC_FIELDS) {
      expect(Number.isFinite(p[f])).toBe(true);
      // Görüntüleme kodu doğrudan .toFixed() çağırıyor — çökmemeli.
      expect(typeof p[f].toFixed(2)).toBe("string");
    }
  });

  it.each(partials)("eksik kayıt %j yapısal alanları doldurur", rec => {
    const p = normalizePaint(rec)!;
    expect(p.hex).toBeTruthy();
    expect(p.series).toBeTruthy();
    expect(p.lab).toBeTruthy();
    expect(p.srgb).toBeTruthy();
    expect(p.xyz).toBeTruthy();
    expect(p.code).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(p.multi_angle.length).toBeGreaterThan(0);
  });

  it("var olan değerleri ezmez", () => {
    const p = normalizePaint({ id: "k", hex: "#1b5fbf", series: "Solid", metallic: 0.77, gloss: 33 })!;
    expect(p.metallic).toBe(0.77);
    expect(p.gloss).toBe(33);
  });

  it("metallic eksikse seri varsayılanına düşer", () => {
    expect(normalizePaint({ hex: "#888888", series: "Metallic" })!.metallic).toBe(
      getSeries("Metallic").pbr.metalness,
    );
    expect(normalizePaint({ hex: "#888888", series: "Solid" })!.metallic).toBe(0);
  });

  it("iki kez uygulanınca sonucu değiştirmez", () => {
    for (const paint of PAINTS) {
      const again = normalizePaint(paint)!;
      expect(again.metallic).toBe(paint.metallic);
      expect(again.gloss).toBe(paint.gloss);
      expect(again.hex).toBe(paint.hex);
    }
  });

  it("null girdide null döner", () => {
    expect(normalizePaint(null)).toBeNull();
    expect(normalizePaint(undefined)).toBeNull();
  });
});

describe("series", () => {
  it("bilinmeyen seri id'sinde hata atmaz, Solid'e düşer", () => {
    expect(getSeries("YokBöyleBirSeri").id).toBe("Solid");
    expect(getSeries(null).id).toBe("Solid");
  });

  it("tüm serilerin id'si SERIES_IDS içinde", () => {
    for (const id of SERIES_IDS) {
      expect(getSeries(id).id).toBe(id);
    }
  });
});

describe("synthesizeMultiAngle", () => {
  it("metalik arttıkça face ile flop arasındaki fark büyür", () => {
    const lab: Lab = { l: 60, a: 30, b: 10 };
    const spread = (metallic: number) => {
      const { face, flop } = faceAndFlop(synthesizeMultiAngle(lab, { metallic }));
      return face!.lab.l - flop!.lab.l;
    };
    expect(spread(0.8)).toBeGreaterThan(spread(0.2));
  });

  it("düz boyada profil neredeyse düzdür", () => {
    const { face, flop } = faceAndFlop(synthesizeMultiAngle({ l: 60, a: 30, b: 10 }));
    expect(face!.lab.l - flop!.lab.l).toBe(0);
  });
});

describe("hex ↔ Lab tutarlılığı", () => {
  // Regresyon koruması: kaynak uygulamada `lab` alanı eksik kayıtlarda sabit
  // {l:50,a:0,b:0} yazılıyordu; hex kırmızı olsa bile Lab gri çıkıyordu ve
  // eşleştirme sessizce çöküyordu. Kokpit'in `colors` tablosunda Lab yok,
  // yalnız hex var — yani bu yol her renkte işleyecek.
  it.each(["#c8102e", "#1b4f8c", "#1e7a46", "#6b2d8f", "#1a1a2e"])(
    "%s: Lab yalnız hex'ten gelse de aynı rengi anlatır",
    hex => {
      const p = normalizePaint({ code: "X", hex })!;
      expect(deltaE2000(p.lab, hexToLab(hex))).toBeLessThan(1e-9);
    },
  );

  it("hex'i farklı olan iki kayıt Lab uzayında da ayrışır", () => {
    const kirmizi = normalizePaint({ code: "A", hex: "#c8102e" })!;
    const mavi = normalizePaint({ code: "B", hex: "#1b4f8c" })!;
    expect(deltaE2000(kirmizi.lab, mavi.lab)).toBeGreaterThan(10);
  });
});
