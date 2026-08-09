/**
 * Yeniden renklendirme testleri.
 *
 * Sözleşme: bölgenin AYDINLATMA yapısı korunur, RENGİ hedeften gelir. Bu,
 * hazır bir görselin (AI üretimi ya da fotoğraf) üzerine bir boyayı
 * kolorimetrik doğrulukla oturtmanın yolu.
 *
 * Kaynak: renk uygulamasının `test/recolor.test.mjs` dosyası. Orada Node'da
 * çalışabilmek için global bir sahte `ImageData` sınıfı tanımlanıyordu;
 * `recolor.ts` düz `Raster` tipiyle çalıştığı için burada gerekmiyor.
 */
import { describe, expect, it } from "vitest";
import { deltaE2000, delinearize, hexToLab, hexToRgb, linearize, rgbToLab } from "@shared/color/color";
import { recolorRegion, type Raster } from "@shared/color/recolor";

const W = 60;
const H = 40;

/**
 * Sentetik "boyalı obje" görseli: gövde, gölge ve parlak specular leke.
 * Işık lineer uzayda uygulanıyor — gama uzayında çarpmak fiziksel olarak
 * yanlış gölge üretir ve testi gerçeğe benzemez kılardı.
 */
function scene(baseHex: string): { image: Raster; mask: Uint8Array } {
  const base = hexToRgb(baseHex);
  const data = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = y * W + x;
      const p = idx * 4;
      const inObject = x > 8 && x < 52 && y > 6 && y < 34;

      let rgb: number[];
      if (inObject) {
        mask[idx] = 1;
        const t = (y - 6) / 28;
        // üstte parlak, ortada nominal, altta gölge
        const k = t < 0.25 ? 1.3 : t < 0.65 ? 1.0 : 1.0 - 0.55 * ((t - 0.65) / 0.35);
        rgb = [base.r * k, base.g * k, base.b * k];
        // specular leke — ışığın rengi, boyanın değil
        if (Math.hypot(x - 24, y - 13) < 4) rgb = [248, 250, 252];
      } else {
        rgb = [120, 120, 120];
      }

      for (let c = 0; c < 3; c += 1) {
        data[p + c] = delinearize(linearize(Math.max(0, Math.min(255, rgb[c]))));
      }
      data[p + 3] = 255;
    }
  }
  return { image: { data, width: W, height: H }, mask };
}

const labAt = (img: Raster, x: number, y: number) => {
  const p = (y * W + x) * 4;
  return rgbToLab({ r: img.data[p], g: img.data[p + 1], b: img.data[p + 2] });
};
const chroma = (l: { a: number; b: number }) => Math.hypot(l.a, l.b);

const SOURCE = "#2e8b3d"; // yeşil obje
const TARGET = "#0a56d6"; // hedef mavi boya
const targetLab = hexToLab(TARGET);

describe("recolorRegion", () => {
  it("gövde rengini hedefe oturtur", () => {
    const { image, mask } = scene(SOURCE);
    const out = recolorRegion(image, mask, targetLab);
    expect(deltaE2000(targetLab, labAt(out, 24, 24))).toBeLessThan(8);
  });

  it("maske dışına dokunmaz", () => {
    const { image, mask } = scene(SOURCE);
    const out = recolorRegion(image, mask, targetLab);
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i]) continue;
      const p = i * 4;
      expect(out.data[p]).toBe(image.data[p]);
      expect(out.data[p + 1]).toBe(image.data[p + 1]);
      expect(out.data[p + 2]).toBe(image.data[p + 2]);
    }
  });

  it("kaynak görseli yerinde değiştirmez", () => {
    const { image, mask } = scene(SOURCE);
    const before = Uint8ClampedArray.from(image.data);
    recolorRegion(image, mask, targetLab);
    expect(image.data).toEqual(before);
  });

  it("aydınlatma yapısını korur — parlak > orta > gölge", () => {
    const { image, mask } = scene(SOURCE);
    const out = recolorRegion(image, mask, targetLab);
    const top = labAt(out, 24, 9);
    const mid = labAt(out, 24, 22);
    const bottom = labAt(out, 24, 32);
    expect(top.l).toBeGreaterThan(mid.l);
    expect(mid.l).toBeGreaterThan(bottom.l);

    // Kontrast yönü kaynakla aynı olmalı — yapı ters çevrilmemeli.
    const srcTop = labAt(image, 24, 9);
    const srcBottom = labAt(image, 24, 32);
    expect(Math.sign(top.l - bottom.l)).toBe(Math.sign(srcTop.l - srcBottom.l));
  });

  it("specular lekeyi boyamaz — parlama ışığın rengidir", () => {
    const { image, mask } = scene(SOURCE);
    const out = recolorRegion(image, mask, targetLab);
    const spec = labAt(out, 24, 13);
    const body = labAt(out, 24, 24);
    expect(spec.l).toBeGreaterThan(85);
    // Parlamada kroma gövdenin çok altında kalmalı, yoksa metalik sahte durur.
    expect(chroma(spec)).toBeLessThan(chroma(body) * 0.3);
  });

  it("amount=0 görseli hiç değiştirmez", () => {
    const { image, mask } = scene(SOURCE);
    const out = recolorRegion(image, mask, targetLab, { amount: 0 });
    expect(out.data).toEqual(image.data);
  });

  it("maske yoksa kaynağın kopyasını döner", () => {
    const { image } = scene(SOURCE);
    const out = recolorRegion(image, null, targetLab);
    expect(out.data).toEqual(image.data);
    expect(out.data).not.toBe(image.data);
  });

  it("sonuç kaynak renginden bağımsızdır", () => {
    // Kataloğun tutarlılığı buna dayanıyor: aynı master objeden aynı hedefe
    // gidildiğinde, master'ın kendi rengi ne olursa olsun sonuç aynı çıkmalı.
    // Aksi halde her renk biraz farklı bir yerden başlar ve katalog dağılır.
    const red = scene("#b02020");
    const grey = scene("#777777");
    const fromRed = recolorRegion(red.image, red.mask, targetLab);
    const fromGrey = recolorRegion(grey.image, grey.mask, targetLab);
    expect(deltaE2000(labAt(fromRed, 24, 24), labAt(fromGrey, 24, 24))).toBeLessThan(3);
  });

  it("farklı hedefler ayrışır — hedef gerçekten uygulanıyor", () => {
    const { image, mask } = scene(SOURCE);
    const mavi = recolorRegion(image, mask, hexToLab("#0a56d6"));
    const kirmizi = recolorRegion(image, mask, hexToLab("#c8102e"));
    expect(deltaE2000(labAt(mavi, 24, 24), labAt(kirmizi, 24, 24))).toBeGreaterThan(20);
  });
});
