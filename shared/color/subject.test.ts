/**
 * Fon ayıklama testleri.
 *
 * Bu adım kart üretiminin en kırılgan yeri: maske yanlışsa ya obje boyanmaz
 * ya da kartın fonu boyanır. Kaynak uygulamada bu mantık canvas'a gömülü
 * olduğu için hiç test edilmemişti.
 */
import { describe, expect, it } from "vitest";
import { deltaE2000, rgbToLab } from "@shared/color/color";
import { extractSubjectMask, measureSubjectLab, whitenBackground } from "@shared/color/subject";
import type { Raster } from "@shared/color/recolor";

const W = 40;
const H = 40;

type Rgba = [number, number, number, number];

/** Verilen fonksiyonla piksel piksel bir raster kurar. */
function build(fn: (x: number, y: number) => Rgba): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = (y * W + x) * 4;
      const [r, g, b, a] = fn(x, y);
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a;
    }
  }
  return { data, width: W, height: H };
}

const inBox = (x: number, y: number) => x >= 10 && x < 30 && y >= 10 && y < 30;
const maskAt = (m: Uint8Array, x: number, y: number) => m[y * W + x];

describe("extractSubjectMask", () => {
  it("beyaz fondaki objeyi ayırır", () => {
    const img = build((x, y) => (inBox(x, y) ? [200, 20, 40, 255] : [255, 255, 255, 255]));
    const { mask, subject, noBackgroundFound } = extractSubjectMask(img);

    expect(noBackgroundFound).toBe(false);
    expect(subject).toBe(20 * 20);
    expect(maskAt(mask, 20, 20)).toBe(1); // obje merkezi
    expect(maskAt(mask, 2, 2)).toBe(0); // fon köşesi
  });

  it("gradyanlı fonu zincir boyunca takip eder", () => {
    // Fon soldan sağa 255 → 232 kayıyor. "Beyaza yakın olanı sil" kuralı
    // koyu ucu obje sanardı; zincir kuralı gradyanı sonuna kadar izler.
    const img = build((x, y) => {
      if (inBox(x, y)) return [30, 90, 200, 255];
      const v = 255 - Math.round((x / W) * 23);
      return [v, v, v, 255];
    });
    const { mask, subject } = extractSubjectMask(img);

    expect(subject).toBe(20 * 20);
    expect(maskAt(mask, W - 2, 2)).toBe(0); // gradyanın koyu ucu hâlâ fon
  });

  it("objenin içindeki parlama lekesini delmez", () => {
    // Parlama neredeyse beyaz ama fona bitişik değil — zincir oraya ulaşamaz.
    const img = build((x, y) => {
      if (!inBox(x, y)) return [255, 255, 255, 255];
      const spec = Math.hypot(x - 20, y - 20) < 3;
      return spec ? [253, 253, 253, 255] : [200, 20, 40, 255];
    });
    const { mask, subject } = extractSubjectMask(img);

    expect(subject).toBe(20 * 20);
    expect(maskAt(mask, 20, 20)).toBe(1); // parlama merkezi hâlâ obje
  });

  it("saydam fonu tanır", () => {
    const img = build((x, y) => (inBox(x, y) ? [10, 120, 60, 255] : [0, 0, 0, 0]));
    const { mask, subject } = extractSubjectMask(img);

    expect(subject).toBe(20 * 20);
    expect(maskAt(mask, 0, 0)).toBe(0);
  });

  it("koyu köşeden dolgu başlatmaz — objeyi yemez", () => {
    // Sol üst köşe koyu (obje oraya taşmış), diğer üç köşe beyaz fon.
    const img = build((x, y) => {
      if (x < 12 && y < 12) return [20, 20, 25, 255];
      return inBox(x, y) ? [200, 20, 40, 255] : [255, 255, 255, 255];
    });
    const { mask, noBackgroundFound } = extractSubjectMask(img);

    expect(noBackgroundFound).toBe(false);
    expect(maskAt(mask, 1, 1)).toBe(1); // koyu köşe obje sayıldı
    expect(maskAt(mask, W - 2, H - 2)).toBe(0); // beyaz köşe fon
  });

  it("dört köşe de koyuysa fon bulunamadığını bildirir", () => {
    const img = build(() => [12, 12, 14, 255]);
    const { mask, background, noBackgroundFound } = extractSubjectMask(img);

    expect(noBackgroundFound).toBe(true);
    expect(background).toBe(0);
    // Maske "her şey obje" — sessizce boş maske dönmek, kullanıcının hiçbir
    // şeyin neden boyanmadığını anlayamaması demek olurdu.
    expect(mask.every(v => v === 1)).toBe(true);
  });

  it("girdiyi değiştirmez", () => {
    const img = build((x, y) => (inBox(x, y) ? [200, 20, 40, 255] : [250, 250, 250, 255]));
    const before = Uint8ClampedArray.from(img.data);
    extractSubjectMask(img);
    expect(img.data).toEqual(before);
  });
});

describe("whitenBackground", () => {
  it("fonu saf beyaza çeker, objeye dokunmaz", () => {
    const img = build((x, y) => (inBox(x, y) ? [200, 20, 40, 255] : [244, 246, 248, 255]));
    const { mask } = extractSubjectMask(img);
    whitenBackground(img, mask);

    const at = (x: number, y: number) => {
      const p = (y * W + x) * 4;
      return [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]];
    };
    expect(at(2, 2)).toEqual([255, 255, 255, 255]);
    expect(at(20, 20)).toEqual([200, 20, 40, 255]);
  });
});

describe("measureSubjectLab", () => {
  it("objenin rengini ölçer, fonu karıştırmaz", () => {
    const img = build((x, y) => (inBox(x, y) ? [200, 20, 40, 255] : [255, 255, 255, 255]));
    const { mask } = extractSubjectMask(img);
    const lab = measureSubjectLab(img, mask)!;
    expect(deltaE2000(lab, rgbToLab({ r: 200, g: 20, b: 40 }))).toBeLessThan(1);
  });

  it("specular lekeyi rengin dışında tutar", () => {
    // Objenin %3'ü neredeyse beyaz. Düz ortalama rengi soldururdu; yoğunluk
    // ağırlıklı ölçüm gövde rengini korumalı.
    const img = build((x, y) => {
      if (!inBox(x, y)) return [255, 255, 255, 255];
      return Math.hypot(x - 20, y - 20) < 2 ? [252, 252, 252, 255] : [30, 120, 60, 255];
    });
    const { mask } = extractSubjectMask(img);
    const lab = measureSubjectLab(img, mask)!;
    expect(deltaE2000(lab, rgbToLab({ r: 30, g: 120, b: 60 }))).toBeLessThan(2);
  });

  it("gölgeli gövdede plato rengini seçer, gölgeye kaymaz", () => {
    // Alt üçte bir gölgede. Düz ortalama koyuya kayar; plato baskın olmalı.
    const img = build((x, y) => {
      if (!inBox(x, y)) return [255, 255, 255, 255];
      return y > 24 ? [15, 60, 30, 255] : [30, 120, 60, 255];
    });
    const { mask } = extractSubjectMask(img);
    const lab = measureSubjectLab(img, mask)!;
    const plato = rgbToLab({ r: 30, g: 120, b: 60 });
    const golge = rgbToLab({ r: 15, g: 60, b: 30 });
    expect(deltaE2000(lab, plato)).toBeLessThan(deltaE2000(lab, golge));
  });

  it("bölge çok küçükse null döner — uydurma renk üretmez", () => {
    const img = build((x, y) => (x < 3 && y < 3 ? [10, 10, 10, 255] : [255, 255, 255, 255]));
    const { mask } = extractSubjectMask(img);
    expect(measureSubjectLab(img, mask)).toBeNull();
  });
});

describe("uyarlanabilir tolerans", () => {
  it("parlak obje kenarı düz beyaz fona yakınken dolgu içeri sızmaz", () => {
    // Gerçek hata buydu: gümüş bazın parlak üst kenarı (240) beyaz fona (255)
    // yeterince yakın olduğu için sabit tolerans dolgunun objeye girmesine
    // izin veriyordu. O bölge "fon" sayılıp hiç boyanmıyor, numunenin
    // ortasında kocaman beyaz bir leke kalıyordu.
    const img = build((x, y) => {
      if (!inBox(x, y)) return [255, 255, 255, 255];
      // Üstte neredeyse beyaz, aşağı indikçe koyulaşan gümüş gövde.
      const t = (y - 10) / 20;
      const v = Math.round(240 - t * 60);
      return [v, v, v + 4, 255];
    });
    const { mask, subject } = extractSubjectMask(img);

    expect(subject).toBe(20 * 20);
    expect(maskAt(mask, 20, 11)).toBe(1); // parlak üst kenar hâlâ obje
  });

  it("gradyanlı fonda tolerans genişler — zincir kopmaz", () => {
    const img = build((x, y) => {
      if (inBox(x, y)) return [30, 90, 200, 255];
      const v = 255 - Math.round((x / W) * 23);
      return [v, v, v, 255];
    });
    expect(extractSubjectMask(img).subject).toBe(20 * 20);
  });
});
