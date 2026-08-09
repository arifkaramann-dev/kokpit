// Renk zinciri ölçümü.
//
// Soru: parmak izindeki rengi malzemeye verdiğimizde, render motorunun ton
// eşlemesinden geçtikten sonra ekranda çıkan renk ne kadar sapıyor?
// Ve ters düzeltme uygulandığında sapma sıfırlanıyor mu?
//
// Çalıştırmak için:  node test/tonemap.test.mjs

import { TONE_MAPPERS, invertToneMapping } from '../src/lib/tonemap.js';
import { rgbToLinear, linearToRgb, rgbToLab, deltaE2000, hexToRgb } from '../src/lib/color.js';

// Sabit örneklem: ton eşlemenin hasarını ölçmek için gamutu tarayan renkler.
// Kullanıcı kataloğuna bağlı DEĞİL — katalog boşaltılınca bu testler de
// düşüyordu, oysa ölçtükleri şey motorun davranışı, verinin içeriği değil.
// Koyu doygun renkler bilerek fazla: hasar orada yoğunlaşıyor.
const paints = [
  { code: 'T-WHITE', name: 'Beyaz', hex: '#f4f4f0', lab: { l: 96.09 } },
  { code: 'T-SNOW', name: 'Açık gri', hex: '#e8e9e3', lab: { l: 92.12 } },
  { code: 'T-SILVER', name: 'Gümüş', hex: '#b8bcc0', lab: { l: 76.05 } },
  { code: 'T-MINT', name: 'Açık yeşil', hex: '#a8d4bf', lab: { l: 81.39 } },
  { code: 'T-LAVENDER', name: 'Lavanta', hex: '#b9a8d4', lab: { l: 71.6 } },
  { code: 'T-GOLD', name: 'Altın', hex: '#c9a96a', lab: { l: 70.76 } },
  { code: 'T-ORANGE', name: 'Turuncu', hex: '#d9540a', lab: { l: 53.08 } },
  { code: 'T-RED', name: 'Kırmızı', hex: '#c8102e', lab: { l: 42.54 } },
  { code: 'T-BLUE', name: 'Mavi', hex: '#1b4f8c', lab: { l: 33.39 } },
  { code: 'T-GREEN', name: 'Yeşil', hex: '#1f7a3d', lab: { l: 45.01 } },
  { code: 'T-PURPLE', name: 'Mor', hex: '#5a2d6e', lab: { l: 27.23 } },
  { code: 'T-COBALT', name: 'Kobalt', hex: '#1a3c8c', lab: { l: 27.69 } },
  // Koyu doygunlar — hasarın yoğunlaştığı bant
  { code: 'T-DARKBLUE', name: 'Koyu mavi', hex: '#0e1430', lab: { l: 7.29 } },
  { code: 'T-DARKPURPLE', name: 'Koyu mor', hex: '#1a0e2a', lab: { l: 6.33 } },
  { code: 'T-DARKGREEN', name: 'Koyu yeşil', hex: '#081a16', lab: { l: 7.66 } },
  { code: 'T-CRIMSON', name: 'Koyu kırmızı', hex: '#1c0710', lab: { l: 3.94 } },
  { code: 'T-BLACK', name: 'Siyah', hex: '#0a0a0c', lab: { l: 2.78 } },
  { code: 'T-COSMIC', name: 'Kozmik siyah', hex: '#0c0c14', lab: { l: 3.54 } },
];

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

/**
 * Referans görünüm modeli: birim beyaz aydınlatma altında, render edilen
 * lineer renk = albedo. Geriye kalan tek dönüşüm ton eşleme + sRGB kodlama.
 * Yani bu, motorun renge verdiği hasarın alt sınırı — gerçek sahnede daha da
 * artar, azalmaz.
 */
function throughEngine(hex, mapper, exposure = 1) {
  const albedoLinear = rgbToLinear(hexToRgb(hex));
  const mapped = TONE_MAPPERS[mapper](albedoLinear, exposure);
  return linearToRgb(mapped);
}

function damage(mapper, exposure = 1) {
  const rows = paints.map((p) => {
    const target = hexToRgb(p.hex);
    const got = throughEngine(p.hex, mapper, exposure);
    return { code: p.code, name: p.name, dE: deltaE2000(rgbToLab(target), rgbToLab(got)) };
  });
  rows.sort((a, b) => b.dE - a.dE);
  const dEs = rows.map((r) => r.dE);
  return {
    rows,
    max: dEs[0],
    mean: dEs.reduce((a, b) => a + b, 0) / dEs.length,
    over2: dEs.filter((d) => d >= 2).length,
  };
}

// ---------------------------------------------------------------------------
console.log('Ton eşlemenin renge verdiği hasar (birim beyaz ışık, exposure 1.0)');
console.log('Katalogdaki 25 boya, ΔE2000\n');
console.log('operatör    ortalama ΔE   en kötü ΔE   ΔE≥2 olan renk');
console.log('─'.repeat(60));

const results = {};
for (const mapper of ['none', 'aces', 'agx', 'neutral']) {
  const d = damage(mapper);
  results[mapper] = d;
  console.log(
    `${mapper.padEnd(12)}${d.mean.toFixed(2).padStart(8)}${d.max.toFixed(2).padStart(13)}${String(
      `${d.over2}/${paints.length}`
    ).padStart(17)}`
  );
}

console.log('\nACES\'in en çok bozduğu 5 renk:');
for (const r of results.aces.rows.slice(0, 5)) {
  console.log(`  ${r.code.padEnd(13)} ${r.name.padEnd(20)} ΔE ${r.dE.toFixed(2)}`);
}

// --- Beklentiler ---
check(
  'ton eşleme uygulanmadan sapma sıfır',
  results.none.max < 0.01,
  `max ΔE ${results.none.max.toFixed(4)}`
);
check(
  'ACES rengi belirgin şekilde bozuyor',
  results.aces.mean > 2,
  `ortalama ΔE ${results.aces.mean.toFixed(2)}`
);
check(
  'Neutral ortalamada ACES\'ten belirgin daha iyi',
  results.neutral.mean < results.aces.mean * 0.75,
  `neutral ${results.neutral.mean.toFixed(2)} vs aces ${results.aces.mean.toFixed(2)}`
);

// Hasar koyu ve doygun renklerde yoğunlaşıyor — Meteor serisi L* 3-8 bandında.
// Bu, hedef kitlesi araba metalikleri olan bir katalog için en kötü senaryo.
const darkCodes = new Set(paints.filter((p) => p.lab.l < 15).map((p) => p.code));
const darkMean = (m) => {
  const rows = results[m].rows.filter((r) => darkCodes.has(r.code));
  return rows.reduce((a, r) => a + r.dE, 0) / rows.length;
};
const lightMean = (m) => {
  const rows = results[m].rows.filter((r) => !darkCodes.has(r.code));
  return rows.reduce((a, r) => a + r.dE, 0) / rows.length;
};
console.log(`\nHasarın dağılımı (koyu renkler L*<15, ${darkCodes.size} adet):`);
for (const m of ['aces', 'neutral']) {
  console.log(`  ${m.padEnd(9)} koyu ${darkMean(m).toFixed(2).padStart(5)}   açık ${lightMean(m).toFixed(2).padStart(5)}`);
}
// ACES'in hasarı koyu doygun renklerde yoğunlaşıyor. Neutral'da böyle bir
// yoğunlaşma yok — tepe sıkıştırması ancak peak≥0.76'da devreye girdiği için
// koyu renkler o aşamaya hiç ulaşmıyor, sadece siyah noktası offseti yiyorlar.
// Katalogu koyu araba metaliklerinden oluşacak bir ürün için bu, Neutral
// lehine en güçlü argüman.
check(
  'ACES hasarı koyu renklerde yoğunlaşıyor',
  darkMean('aces') > lightMean('aces'),
  `koyu ${darkMean('aces').toFixed(2)} vs açık ${lightMean('aces').toFixed(2)}`
);
check(
  'Neutral koyu renklerde ACES\'e göre çok daha iyi',
  darkMean('neutral') < darkMean('aces') / 2,
  `neutral ${darkMean('neutral').toFixed(2)} vs aces ${darkMean('aces').toFixed(2)}`
);

// ---------------------------------------------------------------------------
// Ters düzeltme: hedeflenen rengi ekranda aynen çıkarmak
console.log('\n\nTers düzeltme sonrası kalan sapma');
console.log('(malzemeye düzeltilmiş albedo verildiğinde ekranda çıkan renk)\n');
console.log('operatör    ortalama ΔE   en kötü ΔE   yakınsamayan');
console.log('─'.repeat(60));

for (const mapper of ['aces', 'agx', 'neutral']) {
  const rows = paints.map((p) => {
    const targetLinear = rgbToLinear(hexToRgb(p.hex));
    const inv = invertToneMapping(targetLinear, mapper, 1);
    // Düzeltilmiş albedo'yu motordan geçir, hedefe ne kadar oturduğuna bak
    const out = linearToRgb(TONE_MAPPERS[mapper](inv.albedo, 1));
    return {
      code: p.code,
      dE: deltaE2000(rgbToLab(hexToRgb(p.hex)), rgbToLab(out)),
      converged: inv.converged,
      iterations: inv.iterations,
    };
  });
  const dEs = rows.map((r) => r.dE);
  const mean = dEs.reduce((a, b) => a + b, 0) / dEs.length;
  const max = Math.max(...dEs);
  const notConverged = rows.filter((r) => !r.converged);
  console.log(
    `${mapper.padEnd(12)}${mean.toFixed(3).padStart(8)}${max.toFixed(3).padStart(13)}${String(
      notConverged.length
    ).padStart(15)}`
  );
  results[`${mapper}_corrected`] = { mean, max, notConverged };
}

check(
  'Neutral ters düzeltmesi hedefi tutturuyor',
  results.neutral_corrected.max < 0.1,
  `max ΔE ${results.neutral_corrected.max.toFixed(3)}`
);
check(
  'Neutral ters düzeltmesi her renkte yakınsıyor',
  results.neutral_corrected.notConverged.length === 0,
  `${results.neutral_corrected.notConverged.length} renk yakınsamadı`
);

// ---------------------------------------------------------------------------
// Telafi edilmiş albedo 1.0'ı aşabiliyor mu? Aşıyorsa hex üzerinden
// gidilemez, lineer uzayda verilmesi gerekir.
const albedos = paints.map((p) => ({
  code: p.code,
  albedo: invertToneMapping(rgbToLinear(hexToRgb(p.hex)), 'neutral', 1).albedo,
}));
const peakAlbedo = Math.max(...albedos.flatMap((a) => a.albedo));
const overOne = albedos.filter((a) => a.albedo.some((v) => v > 1));
console.log(`\nTelafi edilmiş albedo tepe değeri: ${peakAlbedo.toFixed(4)}`);
console.log(`1.0'ı aşan renk sayısı: ${overOne.length}/${paints.length}`);
if (overOne.length) {
  console.log(`  örn. ${overOne[0].code} → [${overOne[0].albedo.map((v) => v.toFixed(3)).join(', ')}]`);
}
check('telafi edilmiş albedo sonlu ve makul', Number.isFinite(peakAlbedo) && peakAlbedo < 2);

// ---------------------------------------------------------------------------
// Operatörlerin shader'la aynı olduğunun kontrolü: bilinen sabit noktalar
// Siyah her operatörde siyah kalmalı.
for (const [name, fn] of Object.entries(TONE_MAPPERS)) {
  const black = fn([0, 0, 0], 1);
  check(`${name}: siyah siyah kalıyor`, black.every((v) => Math.abs(v) < 1e-6), JSON.stringify(black));
}

// Neutral'ın siyah noktası kaydırması.
// Operatör, en düşük kanala bakıp tüm kanallardan bir offset çıkarıyor
// (offset = x<0.08 ? x-6.25x² : 0.04). Sonuç: koyu ve doygun renkler hem
// koyulaşıyor hem doygunluk kaybediyor — göreli kayıp zayıf kanalda en büyük.
// Bu yüzden ters düzeltme opsiyonel değil, zorunlu.
const lowIn = [0.05, 0.03, 0.12];
const lowOut = TONE_MAPPERS.neutral(lowIn, 1);
const shift = lowIn.map((v, i) => v - lowOut[i]);
check(
  'Neutral koyu renklerde sabit bir siyah noktası offseti uyguluyor',
  shift.every((s) => s > 0.02) && Math.max(...shift) - Math.min(...shift) < 1e-6,
  `${JSON.stringify(lowIn)} → ${JSON.stringify(lowOut.map((v) => +v.toFixed(4)))}, offset ${shift[0].toFixed(4)}`
);
check(
  'bu kayma zayıf kanalda orantısal olarak çok daha büyük',
  (lowIn[1] - lowOut[1]) / lowIn[1] > 3 * ((lowIn[2] - lowOut[2]) / lowIn[2]),
  `yeşil %${(((lowIn[1] - lowOut[1]) / lowIn[1]) * 100).toFixed(0)}, mavi %${(((lowIn[2] - lowOut[2]) / lowIn[2]) * 100).toFixed(0)}`
);

// Monotonluk: parlaklığı artırınca çıktı azalmamalı
let monotonic = true;
for (let t = 0; t < 1; t += 0.02) {
  const a = TONE_MAPPERS.neutral([t, t * 0.5, t * 0.2], 1);
  const b = TONE_MAPPERS.neutral([t + 0.02, (t + 0.02) * 0.5, (t + 0.02) * 0.2], 1);
  if (b[0] < a[0] - 1e-9) monotonic = false;
}
check('Neutral monoton artan', monotonic);

if (failed) {
  console.error(`\n${failed} test başarısız.`);
  process.exit(1);
}
console.log('\nRenk zinciri testleri geçti.');
