// Yeniden renklendirme testleri.
//
// Sözleşme: bölgenin AYDINLATMA yapısı korunur, RENGİ hedeften gelir.
// Bu, hazır bir görselin (AI üretimi ya da fotoğraf) üzerine ölçülmüş bir
// boyayı kolorimetrik doğrulukla oturtmanın yolu.
//
// Çalıştırmak için:  node test/recolor.test.mjs

import { recolorRegion } from '../src/lib/recolor.js';
import { rgbToLab, hexToLab, hexToRgb, deltaE2000, linearize, delinearize } from '../src/lib/color.js';

// Node'da ImageData yok — testin ihtiyacı olan asgari arayüzü sağlıyoruz.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

const W = 60;
const H = 40;

/**
 * Sentetik "boyalı obje" görseli: gövde, gölge ve parlak specular leke.
 * Işık lineer uzayda uygulanıyor.
 */
function scene(baseHex) {
  const base = hexToRgb(baseHex);
  const data = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = y * W + x;
      const p = idx * 4;
      const inObject = x > 8 && x < 52 && y > 6 && y < 34;

      let rgb;
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
  return { image: new globalThis.ImageData(data, W, H), mask };
}

const labAt = (img, x, y) => {
  const p = (y * W + x) * 4;
  return rgbToLab({ r: img.data[p], g: img.data[p + 1], b: img.data[p + 2] });
};
const chroma = (l) => Math.hypot(l.a, l.b);

// ---------------------------------------------------------------------------
console.log('Kaynak yeşil bir obje, hedef mavi boya\n');

const SOURCE = '#2e8b3d';
const TARGET = '#0a56d6';
const targetLab = hexToLab(TARGET);
const { image, mask } = scene(SOURCE);
const out = recolorRegion(image, mask, targetLab);

// Gövde rengi hedefe oturmalı
const body = labAt(out, 24, 24);
const bodyDE = deltaE2000(targetLab, body);
console.log(`gövde        hedef ΔE ${bodyDE.toFixed(2)}  (L ${body.l.toFixed(1)}, kroma ${chroma(body).toFixed(1)})`);
check('gövde rengi hedefe oturuyor', bodyDE < 8, `ΔE ${bodyDE.toFixed(2)}`);

// Maske dışı hiç değişmemeli
let outsideChanged = 0;
for (let i = 0; i < mask.length; i += 1) {
  if (mask[i]) continue;
  const p = i * 4;
  if (
    out.data[p] !== image.data[p] ||
    out.data[p + 1] !== image.data[p + 1] ||
    out.data[p + 2] !== image.data[p + 2]
  ) {
    outsideChanged += 1;
  }
}
check('maske dışına dokunulmuyor', outsideChanged === 0, `${outsideChanged} piksel değişti`);

// Kaynak görsel bozulmamalı
const src2 = scene(SOURCE);
check(
  'kaynak görsel yerinde değiştirilmiyor',
  image.data.every((v, i) => v === src2.image.data[i])
);

// ---------------------------------------------------------------------------
// AYDINLATMA YAPISI korunmalı: üst (parlak) > orta > alt (gölge)
const top = labAt(out, 24, 9);
const mid = labAt(out, 24, 22);
const bottom = labAt(out, 24, 32);
console.log(`\nyapı         üst L ${top.l.toFixed(1)} > orta L ${mid.l.toFixed(1)} > alt L ${bottom.l.toFixed(1)}`);
check('parlaklık sıralaması korunuyor', top.l > mid.l && mid.l > bottom.l);

// Kaynaktaki L* sıralamasıyla aynı yönde olmalı
const sTop = labAt(image, 24, 9);
const sBottom = labAt(image, 24, 32);
check(
  'kontrast yönü kaynakla aynı',
  Math.sign(top.l - bottom.l) === Math.sign(sTop.l - sBottom.l)
);

// ---------------------------------------------------------------------------
// SPECULAR beyaz kalmalı — ışığın rengi, boyanın değil
const spec = labAt(out, 24, 13);
console.log(`specular     L ${spec.l.toFixed(1)}, kroma ${chroma(spec).toFixed(1)}  (gövde kroması ${chroma(body).toFixed(1)})`);
check('specular parlak kalıyor', spec.l > 85, `L ${spec.l.toFixed(1)}`);
check(
  'specular boyaya boyanmıyor',
  chroma(spec) < chroma(body) * 0.3,
  `kroma ${chroma(spec).toFixed(1)} vs gövde ${chroma(body).toFixed(1)}`
);

// ---------------------------------------------------------------------------
// amount = 0 hiçbir şeyi değiştirmemeli
const none = recolorRegion(image, mask, targetLab, { amount: 0 });
check('amount=0 görseli değiştirmiyor', none.data.every((v, i) => v === image.data[i]));

// Kaynak rengi hedefi etkilememeli: farklı kaynaklardan aynı hedefe gidilince
// gövde renkleri birbirine yakın çıkmalı.
const fromRed = recolorRegion(scene('#b02020').image, scene('#b02020').mask, targetLab);
const fromGrey = recolorRegion(scene('#777777').image, scene('#777777').mask, targetLab);
const dRed = deltaE2000(labAt(fromRed, 24, 24), labAt(fromGrey, 24, 24));
console.log(`\nkaynaktan bağımsızlık   kırmızıdan vs griden gövde ΔE ${dRed.toFixed(2)}`);
check('sonuç kaynak renginden bağımsız', dRed < 3, `ΔE ${dRed.toFixed(2)}`);

if (failed) {
  console.error(`\n${failed} test başarısız.`);
  process.exit(1);
}
console.log('\nYeniden renklendirme testleri geçti.');
