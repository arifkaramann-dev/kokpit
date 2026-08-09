/**
 * Candy kat progresyonu testleri.
 *
 * Sözleşme üç maddede: kat 1 baz olduğu gibi kalır, son kat hedefe oturur,
 * aradaki katlar tek yönde ilerler. Bu üçü tutmazsa "kat progresyonu" adı
 * verilen kare üçlüsü müşteriye yanlış bir şey anlatır.
 */
import { describe, expect, it } from "vitest";
import { deltaE2000, hexToLab, rgbToLab, type Lab } from "@shared/color/color";
import { coatTransmittance, labToLinear, renderCoat } from "@shared/color/candy";
import type { Raster } from "@shared/color/recolor";

const W = 30;
const H = 30;

/** Düz renkli, tamamı boya olan bir kare. */
function flat(r: number, g: number, b: number): { img: Raster; mask: Uint8Array } {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const p = i * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }
  return { img: { data, width: W, height: H }, mask: new Uint8Array(W * H).fill(1) };
}

const bodyLab = (raster: Raster): Lab =>
  rgbToLab({ r: raster.data[0], g: raster.data[1], b: raster.data[2] });

/**
 * Gümüş metalik baz.
 *
 * Gerçekçi olması ÖNEMLİ: soğurma bazdan daha parlak bir kanal üretemez.
 * Sönük bir gri baz seçilirse fuşyanın kırmızısı ulaşılamaz hale gelir ve
 * son kat hedefe oturamaz — bu bir kod hatası değil, katmanlı boyanın
 * sınırıdır. Gerçek gümüş pulcuk beyaza yakındır.
 */
const SILVER = { r: 224, g: 224, b: 228 };
const silverLab = rgbToLab(SILVER);
const targetLab = hexToLab("#c2185b"); // fuşya

describe("coatTransmittance", () => {
  it("adım sayısı kadar uygulanınca hedefe varır", () => {
    const base = labToLinear(silverLab);
    const target = labToLinear(targetLab);
    const t = coatTransmittance(base, target, 2);
    for (let c = 0; c < 3; c += 1) {
      expect(base[c] * t[c] * t[c]).toBeCloseTo(Math.min(base[c], target[c]), 6);
    }
  });

  it("geçirgenlik 1'i aşmaz — katman ışık üretemez", () => {
    // Hedef bazdan parlak: soğurma negatif olurdu.
    const t = coatTransmittance([0.2, 0.2, 0.2], [0.9, 0.9, 0.9], 2);
    expect(t.every(v => v <= 1)).toBe(true);
  });

  it("sıfır bazda patlamaz", () => {
    expect(coatTransmittance([0, 0, 0], [0.5, 0.2, 0.3], 2).every(Number.isFinite)).toBe(true);
  });
});

describe("renderCoat", () => {
  it("1. kat bazı olduğu gibi bırakır — gümüş kalır", () => {
    const { img, mask } = flat(SILVER.r, SILVER.g, SILVER.b);
    const out = renderCoat(img, mask, silverLab, targetLab, 1, { totalCoats: 3 });
    expect(out.data).toEqual(img.data);
  });

  it("son kat hedef renge oturur", () => {
    const { img, mask } = flat(SILVER.r, SILVER.g, SILVER.b);
    const out = renderCoat(img, mask, silverLab, targetLab, 3, {
      totalCoats: 3,
      specularKeep: 0,
    });
    expect(deltaE2000(bodyLab(out), targetLab)).toBeLessThan(3);
  });

  it("ara kat baz ile hedef arasında kalır", () => {
    const { img, mask } = flat(SILVER.r, SILVER.g, SILVER.b);
    const mid = bodyLab(
      renderCoat(img, mask, silverLab, targetLab, 2, { totalCoats: 3, specularKeep: 0 }),
    );
    // Ne bazın kendisi ne de hedef — ikisinden de belirgin uzakta.
    expect(deltaE2000(mid, silverLab)).toBeGreaterThan(5);
    expect(deltaE2000(mid, targetLab)).toBeGreaterThan(5);
    // Ama hedefe bazdan daha yakın: ilerleme tek yönde.
    expect(deltaE2000(mid, targetLab)).toBeLessThan(deltaE2000(silverLab, targetLab));
  });

  it("her kat bir öncekinden daha koyu ve daha doygun", () => {
    const { img, mask } = flat(SILVER.r, SILVER.g, SILVER.b);
    const labs = [1, 2, 3].map(k =>
      bodyLab(renderCoat(img, mask, silverLab, targetLab, k, { totalCoats: 3, specularKeep: 0 })),
    );
    const chroma = (l: Lab) => Math.hypot(l.a, l.b);
    for (let i = 1; i < labs.length; i += 1) {
      expect(labs[i].l).toBeLessThan(labs[i - 1].l);
      expect(chroma(labs[i])).toBeGreaterThan(chroma(labs[i - 1]));
    }
  });

  it("parlama korumasıyla parlak pikseller sönmez", () => {
    const { img, mask } = flat(250, 250, 252);
    const korumali = renderCoat(img, mask, silverLab, targetLab, 3, { totalCoats: 3 });
    const korumasiz = renderCoat(img, mask, silverLab, targetLab, 3, {
      totalCoats: 3,
      specularKeep: 0,
    });
    expect(bodyLab(korumali).l).toBeGreaterThan(bodyLab(korumasiz).l);
  });

  it("baz hedeften koyuysa o kanal hedefe ulaşamaz — sessizce parlatmaz", () => {
    // Sönük bir baz: fuşyanın kırmızısı bazın kırmızısından parlak.
    // Doğru davranış, o kanalda hiç soğurmamak; ışık ÜRETMEK değil.
    const koyuBaz = rgbToLab({ r: 120, g: 120, b: 122 });
    const { img, mask } = flat(120, 120, 122);
    const out = renderCoat(img, mask, koyuBaz, targetLab, 3, {
      totalCoats: 3,
      specularKeep: 0,
    });
    const body = bodyLab(out);
    // Hedefe yaklaşır ama üstüne çıkmaz: sonuç bazdan parlak olamaz.
    expect(body.l).toBeLessThanOrEqual(koyuBaz.l + 1e-6);
    expect(deltaE2000(body, targetLab)).toBeGreaterThan(0);
  });

  it("maske dışına dokunmaz", () => {
    const { img } = flat(SILVER.r, SILVER.g, SILVER.b);
    const mask = new Uint8Array(W * H); // hiçbir piksel boya değil
    const out = renderCoat(img, mask, silverLab, targetLab, 3, { totalCoats: 3 });
    expect(out.data).toEqual(img.data);
  });

  it("girdiyi değiştirmez", () => {
    const { img, mask } = flat(SILVER.r, SILVER.g, SILVER.b);
    const before = Uint8ClampedArray.from(img.data);
    renderCoat(img, mask, silverLab, targetLab, 3, { totalCoats: 3 });
    expect(img.data).toEqual(before);
  });
});
