// Parmak izi üretim hattının doğrulaması.
//
// Sentetik sahneler kuruyoruz: bilinen bir boya rengi + nötr zemin, üzerine
// bilinen bir ışık rengi bindiriliyor. Hat bu ışığı sökebiliyor mu?
// Aykırı kaynağı eleyebiliyor mu? Güven skoru dağılımı yansıtıyor mu?
//
// Çalıştırmak için:  node test/fingerprint.test.mjs

import { analyzeImage, buildFingerprint, OUTLIER_DELTA_E } from '../src/lib/fingerprint.js';
import { estimateIlluminant, illuminantCast } from '../src/lib/illuminant.js';
import { hexToRgb, rgbToLab, deltaE2000, linearize, delinearize } from '../src/lib/color.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
  return ok;
};

const W = 220;
const H = 160;
const PAINT = { x0: 60, y0: 40, x1: 170, y1: 120 };

/**
 * Sentetik sahne: nötr gri zemin + dikdörtgen boya bölgesi.
 * Işık, fiziksel olarak doğru şekilde LİNEER uzayda çarpılıyor.
 *
 * @param {string} paintHex boyanın gerçek rengi (D65 altında)
 * @param {[number,number,number]} lightGain kanal başına ışık kazancı
 */
function scene(paintHex, lightGain = [1, 1, 1], opts = {}) {
  const { groundLevel = 128, shading = 0.35, noise = 6, seed = 1 } = opts;
  const paint = hexToRgb(paintHex);
  const data = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);

  // Basit deterministik gürültü
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = y * W + x;
      const p = idx * 4;
      const inPaint = x >= PAINT.x0 && x <= PAINT.x1 && y >= PAINT.y0 && y <= PAINT.y1;

      let base;
      if (inPaint) {
        mask[idx] = 1;
        // Yüzey eğriliği taklidi: üstten alta parlaklık düşüşü
        const t = (y - PAINT.y0) / (PAINT.y1 - PAINT.y0);
        const k = 1 + shading * (0.5 - t);
        base = [paint.r * k, paint.g * k, paint.b * k];
      } else {
        const n = (rnd() - 0.5) * noise;
        base = [groundLevel + n, groundLevel + n, groundLevel + n];
      }

      // Işığı lineer uzayda uygula — gerçek ışık böyle davranır
      for (let c = 0; c < 3; c += 1) {
        const lin = linearize(Math.max(0, Math.min(255, base[c]))) * lightGain[c];
        data[p + c] = delinearize(lin);
      }
      data[p + 3] = 255;
    }
  }
  return { image: { width: W, height: H, data }, mask };
}

// ---------------------------------------------------------------------------
console.log('1. Aydınlatma kestirimi\n');

const TRUE_BLUE = '#1b5fbf';
const LIGHTS = {
  'nötr (D65)': [1, 1, 1],
  'sıcak (akkor/showroom)': [1.18, 1.0, 0.72],
  'soğuk (kapalı hava)': [0.82, 0.96, 1.24],
  'hafif sıcak': [1.08, 1.0, 0.88],
};

console.log('ışık                       kestirilen sapma   nötr piksel');
console.log('─'.repeat(62));
for (const [label, gain] of Object.entries(LIGHTS)) {
  const { image, mask } = scene(TRUE_BLUE, gain);
  const est = estimateIlluminant(image, { exclude: (x, y) => mask[y * W + x] === 1 });
  const cast = illuminantCast(est.white);
  console.log(
    `${label.padEnd(26)}${cast.toFixed(2).padStart(10)}${String(est.sampleCount).padStart(14)}`
  );
  check(`${label}: nötr yüzey bulundu`, est.reliable, `sample=${est.sampleCount}`);
}

// Nötr ışıkta sapma sıfıra yakın, renkli ışıkta belirgin olmalı
const neutralScene = scene(TRUE_BLUE, LIGHTS['nötr (D65)']);
const neutralCast = illuminantCast(
  estimateIlluminant(neutralScene.image, {
    exclude: (x, y) => neutralScene.mask[y * W + x] === 1,
  }).white
);
check('nötr ışıkta sapma ~0', neutralCast < 1.5, `cast ${neutralCast.toFixed(2)}`);

// ---------------------------------------------------------------------------
console.log('\n\n2. Işık düzeltmesi — ham vs düzeltilmiş\n');
console.log('ışık                      ham ΔE   düzeltilmiş ΔE   kazanç');
console.log('─'.repeat(62));

const trueLab = rgbToLab(hexToRgb(TRUE_BLUE));
const observations = [];

for (const [label, gain] of Object.entries(LIGHTS)) {
  const { image, mask } = scene(TRUE_BLUE, gain);
  const obs = analyzeImage(image, mask, { name: label });
  observations.push(obs);

  const rawDE = deltaE2000(trueLab, obs.raw.lab);
  const corrDE = deltaE2000(trueLab, obs.corrected.lab);
  console.log(
    `${label.padEnd(25)}${rawDE.toFixed(2).padStart(8)}${corrDE.toFixed(2).padStart(17)}${`${(
      rawDE - corrDE
    ).toFixed(2)}`.padStart(9)}`
  );

  if (label !== 'nötr (D65)') {
    check(`${label}: düzeltme ham halden iyi`, corrDE < rawDE, `${rawDE.toFixed(2)} → ${corrDE.toFixed(2)}`);
  }
}

const worstCorrected = Math.max(
  ...observations.map((o) => deltaE2000(trueLab, o.corrected.lab))
);
check(
  'düzeltme sonrası tüm ışıklarda gerçeğe yakın',
  worstCorrected < 6,
  `en kötü ΔE ${worstCorrected.toFixed(2)}`
);

// ---------------------------------------------------------------------------
console.log('\n\n3. Uzlaşı ve aykırı eleme\n');

const fp = buildFingerprint(observations, { code: 'TEST-001', name: 'Test Blue', series: 'Metallic' });
const consensusDE = deltaE2000(trueLab, fp.lab);

console.log(`gerçek renk      ${TRUE_BLUE}`);
console.log(`uzlaşı           ${fp.hex}`);
console.log(`gerçeğe uzaklık  ΔE ${consensusDE.toFixed(2)}`);
console.log(`kaynak dağılımı  ortalama ΔE ${fp.confidence.meanSpread}, en kötü ${fp.confidence.maxSpread}`);
console.log(`güven            ${fp.confidence.level}`);
console.log(`not              ${fp.confidence.note}`);

check('uzlaşı gerçeğe yakın', consensusDE < 5, `ΔE ${consensusDE.toFixed(2)}`);
check('tüm kaynaklar kullanıldı', fp.provenance.usedCount === observations.length);
check('provenans kaydedildi', fp.provenance.sources.length === observations.length);

// Aykırı ekle: belirgin farklı bir mavi (senin hurdalıktaki 3. görsel gibi)
const outlier = analyzeImage(
  ...(() => {
    const s = scene('#3a7a5c', [1, 1, 1]); // yeşilimsi — açıkça farklı boya
    return [s.image, s.mask, { name: 'AYKIRI yeşilimsi' }];
  })()
);
const withOutlier = buildFingerprint([...observations, outlier], {
  code: 'TEST-002',
  name: 'Test Blue',
  series: 'Metallic',
});

console.log(`\naykırı eklendikten sonra:`);
console.log(`  elenen        ${withOutlier.provenance.droppedCount}`);
console.log(`  elenen kaynak ${withOutlier.provenance.dropped.map((d) => d.name).join(', ') || '—'}`);
console.log(`  uzlaşı        ${withOutlier.hex}  (ΔE ${deltaE2000(trueLab, withOutlier.lab).toFixed(2)})`);

check('aykırı elendi', withOutlier.provenance.droppedCount === 1, `${withOutlier.provenance.droppedCount} elendi`);
check(
  'aykırı doğru kaynaktı',
  withOutlier.provenance.dropped[0]?.name === 'AYKIRI yeşilimsi'
);
check(
  'aykırı uzlaşıyı bozmadı',
  Math.abs(deltaE2000(trueLab, withOutlier.lab) - consensusDE) < 0.5,
  `${consensusDE.toFixed(2)} → ${deltaE2000(trueLab, withOutlier.lab).toFixed(2)}`
);

// ---------------------------------------------------------------------------
console.log('\n\n3b. Özne kontaminasyonu — araba kareyi doldurduğunda\n');

// Gerçek durum: araba karenin yarısını kaplıyor, kullanıcı TEK panele tıklıyor.
// Arabanın geri kalanı "arka plan" sayılıyor ve ışık kestirimine karışıyor.
// Düzeltilmezse boyanın kendi rengi ışık sanılır ve adaptasyon tam o rengi
// söker — canlı mavi soluk lacivere döner.
function dominantSubjectScene(paintHex) {
  const paint = hexToRgb(paintHex);
  const data = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = y * W + x;
      const p = idx * 4;
      const onCar = x > 18 && x < 200 && y > 40 && y < 130; // gövdenin tamamı
      const inMask = x > 45 && x < 110 && y > 55 && y < 105; // tıklanan tek panel
      let base;
      if (onCar) {
        if (inMask) mask[idx] = 1;
        const t = (y - 40) / 90;
        const k = t < 0.2 ? 1.22 : t < 0.6 ? 1.0 : 1.0 - 0.6 * ((t - 0.6) / 0.4);
        base = [paint.r * k, paint.g * k, paint.b * k];
      } else {
        base = [124, 124, 124];
      }
      for (let c = 0; c < 3; c += 1) {
        data[p + c] = delinearize(linearize(Math.max(0, Math.min(255, base[c]))));
      }
      data[p + 3] = 255;
    }
  }
  return { image: { width: W, height: H, data }, mask };
}

const VIVID = '#0a56d6';
const vividLab = rgbToLab(hexToRgb(VIVID));
const vividChroma = Math.hypot(vividLab.a, vividLab.b);
const dom = dominantSubjectScene(VIVID);
const domObs = analyzeImage(dom.image, dom.mask, { name: 'baskın özne' });
const domChroma = Math.hypot(domObs.corrected.lab.a, domObs.corrected.lab.b);

console.log(`gerçek boya        ${VIVID}  kroma ${vividChroma.toFixed(1)}`);
console.log(`çıkarılan          ${domObs.corrected.hex}  kroma ${domChroma.toFixed(1)}`);
console.log(`ışık sapması       ${domObs.illuminant.cast}  düzeltme oranı ${domObs.illuminant.strength}`);
console.log(`gerçeğe uzaklık    ΔE ${deltaE2000(vividLab, domObs.corrected.lab).toFixed(2)}`);

check(
  'baskın özne ışık kestirimini kaçırmıyor',
  deltaE2000(vividLab, domObs.corrected.lab) < 2,
  `ΔE ${deltaE2000(vividLab, domObs.corrected.lab).toFixed(2)}`
);
check(
  'canlı rengin kroması korunuyor',
  domChroma > vividChroma * 0.9,
  `${domChroma.toFixed(1)} / ${vividChroma.toFixed(1)}`
);
check(
  'öznenin gövdesi kestirimden dışlanıyor',
  domObs.illuminant.cast < 3,
  `sapma ${domObs.illuminant.cast}`
);

// ---------------------------------------------------------------------------
console.log('\n\n4. Güven skoru dağılımı yansıtıyor mu\n');

// Birbirine çok yakın kaynaklar → yüksek güven
const tight = ['#1b5fbf', '#1c60c0', '#1a5ebe'].map((hex, i) => {
  const s = scene(hex, [1, 1, 1], { seed: i + 3 });
  return analyzeImage(s.image, s.mask, { name: `tight-${i}` });
});
const tightFp = buildFingerprint(tight, { code: 'T', name: 't', series: 'Solid' });

// Saçılmış kaynaklar → düşük güven
const loose = ['#1b5fbf', '#2f6fa8', '#0f4fd0'].map((hex, i) => {
  const s = scene(hex, [1, 1, 1], { seed: i + 9 });
  return analyzeImage(s.image, s.mask, { name: `loose-${i}` });
});
const looseFp = buildFingerprint(loose, { code: 'L', name: 'l', series: 'Solid' });

console.log(`sıkı kaynaklar    ortalama ΔE ${tightFp.confidence.meanSpread}  → güven: ${tightFp.confidence.level}`);
console.log(`saçık kaynaklar   ortalama ΔE ${looseFp.confidence.meanSpread}  → güven: ${looseFp.confidence.level}`);

check(
  'saçık kaynaklar daha yüksek dağılım veriyor',
  looseFp.confidence.meanSpread > tightFp.confidence.meanSpread,
  `${looseFp.confidence.meanSpread} vs ${tightFp.confidence.meanSpread}`
);

// ---------------------------------------------------------------------------
console.log('\n\n5. Doku ölçümü\n');

// Pürüzsüz boya vs pulcuklu boya — parıltı farkı yakalanmalı
const smooth = scene(TRUE_BLUE, [1, 1, 1], { noise: 0 });
const smoothObs = analyzeImage(smooth.image, smooth.mask, { name: 'düz' });

// Pulcuk taklidi: boya bölgesine yüksek frekanslı parlak noktalar serp
const flaky = scene(TRUE_BLUE, [1, 1, 1], { noise: 0 });
let fs = 42;
for (let i = 0; i < flaky.image.data.length; i += 4) {
  const idx = i / 4;
  if (!flaky.mask[idx]) continue;
  fs = (fs * 1103515245 + 12345) % 2147483648;
  if (fs % 11 === 0) {
    for (let c = 0; c < 3; c += 1) {
      flaky.image.data[i + c] = Math.min(255, flaky.image.data[i + c] + 70);
    }
  }
}
const flakyObs = analyzeImage(flaky.image, flaky.mask, { name: 'pulcuklu' });

console.log(`düz boya      parıltı ${smoothObs.texture.sparkle}   alacalılık ${smoothObs.texture.graininess}`);
console.log(`pulcuklu      parıltı ${flakyObs.texture.sparkle}   alacalılık ${flakyObs.texture.graininess}`);

check(
  'pulcuklu yüzeyde parıltı belirgin yüksek',
  flakyObs.texture.sparkle > smoothObs.texture.sparkle * 3,
  `${flakyObs.texture.sparkle} vs ${smoothObs.texture.sparkle}`
);
check('doku ölçümü çözünürlük durumunu raporluyor', typeof smoothObs.texture.resolutionOk === 'boolean');

// ---------------------------------------------------------------------------
check('aykırı eşiği makul', OUTLIER_DELTA_E >= 5 && OUTLIER_DELTA_E <= 15);

if (failed) {
  console.error(`\n${failed} test başarısız.`);
  process.exit(1);
}
console.log('\nParmak izi hattı testleri geçti.');
