import { describe, expect, it } from "vitest";
import { knockoutBackgroundRaster, matteRadius } from "./matte";

/**
 * "Hâle" sorunu: koyu zeminde objenin çevresinde soluk beyaz bir kontur.
 *
 * Sebebi kenardaki KARIŞIK pikseller — rengi objenin değil, objeyle beyaz
 * fonun karışımı. Maske ikili olduğu için bunlar tam opak kalıyor ve koyu
 * zemine beyaz bir çerçeve olarak düşüyordu. Buradaki testler "gözle iyi
 * görünüyor" yerine ölçülebilir bir cevap veriyor: kalan hiçbir opak piksel
 * beyaza yakın olmamalı.
 */

/** Ortasında koyu bir kare, kenarları beyazla harmanlanmış küçük numune. */
function sample(size = 24): { raster: { data: Uint8ClampedArray; width: number; height: number }; mask: Uint8Array } {
  const data = new Uint8ClampedArray(size * size * 4);
  const mask = new Uint8Array(size * size);
  const inner = { from: 8, to: 16 };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const p = i * 4;
      const insideCore = x >= inner.from && x < inner.to && y >= inner.from && y < inner.to;
      // Çekirdeğin bir piksel dışı: obje ile beyaz fonun yarı yarıya karışımı —
      // gerçek çekimlerdeki yumuşak kenarın ta kendisi.
      const isEdge =
        !insideCore &&
        x >= inner.from - 1 &&
        x < inner.to + 1 &&
        y >= inner.from - 1 &&
        y < inner.to + 1;

      if (insideCore) {
        data[p] = 200; data[p + 1] = 20; data[p + 2] = 90;
        mask[i] = 1;
      } else if (isEdge) {
        // %50 karışım: (200+255)/2 gibi — beyaza çalan kirli kenar.
        data[p] = 228; data[p + 1] = 138; data[p + 2] = 173;
        mask[i] = 1; // maske bunu da obje sayıyor — hâlenin kaynağı bu
      } else {
        data[p] = 255; data[p + 1] = 255; data[p + 2] = 255;
        mask[i] = 0;
      }
      data[p + 3] = 255;
    }
  }
  return { raster: { data, width: size, height: size }, mask };
}

describe("beyaz fondan temiz kesim", () => {
  it("fon tamamen saydamlaşır", () => {
    const { raster, mask } = sample();
    knockoutBackgroundRaster(raster, mask, { erode: 1, feather: 1 });
    // Köşe kesinlikle fon.
    expect(raster.data[3]).toBe(0);
  });

  it("geride beyaza yakın OPAK piksel bırakmaz — hâle budur", () => {
    const { raster, mask } = sample();
    knockoutBackgroundRaster(raster, mask, { erode: 1, feather: 1 });

    let halo = 0;
    for (let i = 0; i < raster.width * raster.height; i += 1) {
      const p = i * 4;
      const a = raster.data[p + 3];
      if (a < 200) continue; // yarı saydam kenar sayılmaz
      const [r, g, b] = [raster.data[p], raster.data[p + 1], raster.data[p + 2]];
      if (r > 235 && g > 235 && b > 235) halo += 1;
    }
    expect(halo).toBe(0);
  });

  it("objenin gövdesi korunur — kesim objeyi yemez", () => {
    const { raster, mask } = sample();
    knockoutBackgroundRaster(raster, mask, { erode: 1, feather: 1 });
    const center = ((12 * 24) + 12) * 4;
    expect(raster.data[center + 3]).toBe(255);
    expect(raster.data[center]).toBe(200);
  });

  it("kenar yumuşak: hem tam opak hem tam saydam olmayan piksel var", () => {
    const { raster, mask } = sample();
    knockoutBackgroundRaster(raster, mask, { erode: 1, feather: 1 });
    let soft = 0;
    for (let i = 0; i < raster.width * raster.height; i += 1) {
      const a = raster.data[i * 4 + 3];
      if (a > 0 && a < 255) soft += 1;
    }
    expect(soft).toBeGreaterThan(0);
  });

  it("yarıçap kare ölçüsüyle büyür — 1080'lik karede 1px kesim yetmez", () => {
    expect(matteRadius(24, 24).erode).toBe(1);
    expect(matteRadius(1024, 1024).erode).toBeGreaterThan(1);
  });
});
