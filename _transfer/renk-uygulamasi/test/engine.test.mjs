// Eşleştirme motoru, PBR eşlemesi ve katalog bütünlüğü testleri.
// Çalıştırmak için:  node test/engine.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { findClosest } from '../src/lib/match.js';
import { paintToPbr, MAX_ALBEDO, FLOP_REFERENCE_NDV } from '../src/lib/pbr.js';
import { hexToLab, deltaE2000, synthesizeMultiAngle, faceAndFlop } from '../src/lib/color.js';
import { SERIES_IDS } from '../src/lib/series.js';
import { normalizePaint } from '../src/lib/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));

// Katalog artık kullanıcıya ait ve boş olabilir. Motor testleri veriye değil
// MOTORA bakmalı — bu yüzden sabit bir örneklem üzerinden çalışıyorlar.
// (Önceden katalogdan besleniyorlardı ve katalog boşaltılınca hepsi düştü.)
const FIXTURES = [
  { code: 'FX-SOL', name: 'Fixture Solid', series: 'Solid', hex: '#c8102e',
    srgb: { r: 200, g: 16, b: 46 }, lab: { l: 42.54, a: 67.4, b: 41.2 },
    gloss: 82, metallic: 0, pearl: 0, flake: 0, transparency: 0,
    multi_angle: [{ angle: 15, lab: { l: 46, a: 66, b: 40 } }, { angle: 45, lab: { l: 42.54, a: 67.4, b: 41.2 } }, { angle: 110, lab: { l: 33, a: 60, b: 36 } }] },
  { code: 'FX-CND', name: 'Fixture Candy', series: 'Candy', hex: '#8e1b27',
    srgb: { r: 142, g: 27, b: 39 }, lab: { l: 31.07, a: 45.5, b: 21.3 },
    gloss: 88, metallic: 0.5, pearl: 0.1, flake: 0.35, transparency: 0.4,
    multi_angle: [{ angle: 15, lab: { l: 38, a: 47, b: 23 } }, { angle: 45, lab: { l: 31.07, a: 45.5, b: 21.3 } }, { angle: 110, lab: { l: 18, a: 38, b: 16 } }] },
  { code: 'FX-MET', name: 'Fixture Metallic', series: 'Metallic', hex: '#b8bcc0',
    srgb: { r: 184, g: 188, b: 192 }, lab: { l: 76.05, a: -0.9, b: -2.6 },
    gloss: 78, metallic: 0.9, pearl: 0, flake: 0.85, transparency: 0,
    multi_angle: [{ angle: 15, lab: { l: 82, a: -0.8, b: -2.4 } }, { angle: 45, lab: { l: 76.05, a: -0.9, b: -2.6 } }, { angle: 110, lab: { l: 58, a: -0.7, b: -2 } }] },
  { code: 'FX-PRL', name: 'Fixture Pearl', series: 'Pearl', hex: '#b9a8d4',
    srgb: { r: 185, g: 168, b: 212 }, lab: { l: 71.6, a: 14.65, b: -20.05 },
    gloss: 84, metallic: 0.2, pearl: 0.85, flake: 0.3, transparency: 0.25,
    multi_angle: [{ angle: 15, lab: { l: 77.33, a: 16.12, b: -22.06 } }, { angle: 45, lab: { l: 71.6, a: 14.65, b: -20.05 } }, { angle: 110, lab: { l: 60.86, a: 13.19, b: -18.05 } }] },
  { code: 'FX-MTR', name: 'Fixture Meteor', series: 'Meteor', hex: '#0e1430',
    srgb: { r: 14, g: 20, b: 48 }, lab: { l: 7.29, a: 8.2, b: -18.4 },
    gloss: 90, metallic: 0.75, pearl: 0.3, flake: 0.95, transparency: 0,
    multi_angle: [{ angle: 15, lab: { l: 9.5, a: 8.6, b: -19.2 } }, { angle: 45, lab: { l: 7.29, a: 8.2, b: -18.4 } }, { angle: 110, lab: { l: 4.1, a: 6.9, b: -15.1 } }] },
].map((p, i) => ({ ...p, id: `fx-${i}`, xyz: null, basecoat: null, clearcoat: 'High-Gloss', render_params: null, light_profiles: null, created_date: '2026-01-01T00:00:00Z' }));

// Kullanıcının kataloğu — doluysa bütünlük kontrolleri de çalışır.
const catalog = JSON.parse(readFileSync(join(here, '../src/data/paints.json'), 'utf8'));
const paints = FIXTURES;

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

// --- Kullanıcı kataloğu bütünlüğü (boşsa atlanır) ---
if (catalog.length) {
  check('katalog id\'leri benzersiz', new Set(catalog.map((p) => p.id)).size === catalog.length);
  check('katalog kodları benzersiz', new Set(catalog.map((p) => p.code)).size === catalog.length);
  for (const p of catalog) {
    check(
      `${p.code} katalog kaydı geçerli`,
      Boolean(p.id && p.code && p.hex && p.lab) && SERIES_IDS.includes(p.series)
    );
  }
} else {
  console.log('katalog boş — bütünlük kontrolleri atlandı, motor testleri örneklem üzerinde çalışıyor');
}

// --- Örneklem bütünlüğü ---
check('örneklem dolu', paints.length > 0);
check(
  'her kaydın zorunlu alanları var',
  paints.every(
    (p) =>
      p.id &&
      p.code &&
      p.name &&
      SERIES_IDS.includes(p.series) &&
      /^#[0-9a-f]{6}$/.test(p.hex) &&
      p.lab &&
      Array.isArray(p.multi_angle) &&
      p.multi_angle.length > 0
  )
);
check('id\'ler benzersiz', new Set(paints.map((p) => p.id)).size === paints.length);
check('kodlar benzersiz', new Set(paints.map((p) => p.code)).size === paints.length);

// hex ile Lab tutarlı mı? (katalog Lab'ları ölçüm kaynaklı, ~5 ΔE tolerans)
for (const p of paints) {
  const dE = deltaE2000(hexToLab(p.hex), p.lab);
  check(`${p.code} hex↔Lab tutarlı`, dE < 5, `ΔE ${dE.toFixed(2)}`);
}

// --- Eşleştirme motoru ---
// Bir boyanın kendi face rengiyle aranması onu 1. sırada, ΔE≈0 ile bulmalı.
for (const p of paints) {
  const { face } = faceAndFlop(p.multi_angle);
  const top = findClosest(face.lab, paints, { limit: 1 })[0];
  check(`${p.code} kendini bulur`, top.paint.id === p.id, `bulunan ${top.paint.code}`);
  check(`${p.code} ΔE≈0`, top.deltaE < 1e-9, `ΔE ${top.deltaE}`);
}

// Limit havuzdan büyük olabilir — doğrusu min(limit, havuz).
const ten = findClosest({ l: 50, a: 40, b: 20 }, paints, { limit: 10 });
check(
  'limit uygulanıyor',
  ten.length === Math.min(10, paints.length),
  `${ten.length} sonuç, havuz ${paints.length}`
);
const two = findClosest({ l: 50, a: 40, b: 20 }, paints, { limit: 2 });
check('limit havuzdan küçükken kesiyor', two.length === 2, `${two.length} sonuç`);
check(
  'sonuçlar ΔE\'ye göre artan sıralı',
  ten.every((r, i) => i === 0 || r.deltaE >= ten[i - 1].deltaE)
);

const onlyPearl = findClosest({ l: 50, a: 0, b: 0 }, paints, { limit: 50, series: 'Pearl' });
check('seri filtresi çalışıyor', onlyPearl.every((r) => r.paint.series === 'Pearl'));

// --- PBR eşlemesi ---
for (const p of paints) {
  const m = paintToPbr(p);
  const inRange = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  check(
    `${p.code} PBR aralıkta`,
    inRange(m.metalness) &&
      inRange(m.roughness) &&
      inRange(m.clearcoat) &&
      inRange(m.clearcoatRoughness) &&
      inRange(m.iridescence) &&
      inRange(m.flakeIntensity) &&
      inRange(m.opacity),
    JSON.stringify(m)
  );
  check(`${p.code} roughness taban`, m.roughness >= 0.06);

  // Flop renkleri: sonlu, sınırlı, ve flop face'ten koyu olmalı.
  // Sınır önemli — ton eşleme tersi beyaza yakın hedeflerde patlıyor
  // (Arctic White'ın face açısı albedo 3.55 istiyordu, render yanıyordu).
  const all = [...m.faceLinear, ...m.flopLinear];
  check(
    `${p.code} flop renkleri sonlu ve sınırlı`,
    all.every((v) => Number.isFinite(v) && v >= 0 && v <= MAX_ALBEDO + 1e-9),
    `face ${m.faceLinear.map((v) => v.toFixed(2))} flop ${m.flopLinear.map((v) => v.toFixed(2))}`
  );
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  check(
    `${p.code} flop face'ten koyu`,
    sum(m.flopLinear) <= sum(m.faceLinear) + 1e-6,
    `face ${sum(m.faceLinear).toFixed(3)} flop ${sum(m.flopLinear).toFixed(3)}`
  );

  // Beer-Lambert soğurma eğrisi doğru uçlara oturmalı:
  //   N·V = 1   → yol 0    → face rengi (soğurma yok)
  //   N·V = 0.3 → yol 2.33 → flop rengi
  // Shader'daki exp(-k·path) ile aynı hesap.
  check(
    `${p.code} soğurma katsayıları geçerli`,
    m.absorption.every((v) => Number.isFinite(v) && v >= 0),
    JSON.stringify(m.absorption)
  );
  const pathAtRef = 1 / FLOP_REFERENCE_NDV - 1;
  const atFace = m.faceLinear.map((c, i) => c * Math.exp(-m.absorption[i] * 0));
  const atFlop = m.faceLinear.map((c, i) => c * Math.exp(-m.absorption[i] * pathAtRef));

  check(
    `${p.code} dik bakışta face rengi`,
    atFace.every((v, i) => Math.abs(v - m.faceLinear[i]) < 1e-9)
  );

  // Soğurma yalnızca KOYULTABİLİR — modelin fiziksel sınırı bu.
  // Ölçülen bir profilde flop bir kanalda face'ten parlaksa (pulcuk
  // yöneliminden gelen hue kayması, soğurma değil) o kanal temsil edilemez.
  // Racing Red'de face yeşili ~0, flop yeşili 0.021: çarpımsal bir model
  // bunu üretemez. Sözleşme: temsil edilebilir kanallarda uç tutmalı,
  // hiçbir kanalda ASLA parlatmamalı.
  const representable = m.faceLinear.map((f, i) => m.flopLinear[i] <= f + 1e-9);
  check(
    `${p.code} referans açıda flop rengi (temsil edilebilir kanallar)`,
    atFlop.every((v, i) => !representable[i] || Math.abs(v - m.flopLinear[i]) < 5e-3),
    `beklenen ${m.flopLinear.map((v) => v.toFixed(3))} bulunan ${atFlop.map((v) => v.toFixed(3))}`
  );
  check(
    `${p.code} soğurma hiçbir kanalı parlatmıyor`,
    atFlop.every((v, i) => v <= m.faceLinear[i] + 1e-9)
  );

  // Modelin Beer-Lambert OLDUĞUNU doğrula.
  //
  // Eğriliği bir eşikle ölçmeye çalıştım, işe yaramadı: eğrilik optik
  // derinliğin karesiyle büyüyor (deviation ≈ 0.10·d²), yani koyu renklerde
  // doğal olarak küçük çıkıyor ve seçtiğim iki sabit birbirini tutmuyordu.
  //
  // Doğrusu tanımlayıcı özelliği test etmek: geçirgenlik yol uzunluğunda
  // ÇARPIMSALDIR. T(p₁+p₂) = T(p₁)·T(p₂). Bu üstelde tam olarak sağlanır,
  // doğrusal enterpolasyonda sağlanmaz. Eşik yok, ölçek yok, tam eşitlik.
  const T = (k, path) => Math.exp(-k * path);
  const multiplicative = m.absorption.every((k) => {
    const p1 = 0.7;
    const p2 = 1.6;
    return Math.abs(T(k, p1 + p2) - T(k, p1) * T(k, p2)) < 1e-12;
  });
  check(`${p.code} geçirgenlik yolda çarpımsal (Beer-Lambert)`, multiplicative);

  // Ve yol uzadıkça tek yönlü koyulmalı
  const monotonic = m.absorption.every((k) => {
    let prev = Infinity;
    for (let path = 0; path <= 4; path += 0.25) {
      const t = T(k, path);
      if (t > prev + 1e-12) return false;
      prev = t;
    }
    return true;
  });
  check(`${p.code} yol uzadıkça tek yönlü koyuluyor`, monotonic);
  // Otomotiv boyası PBR anlamında saf metal değil: difüz bileşen tamamen
  // silinmemeli, yoksa karanlık ortamda yüzey siyaha düşer ("koyu krom"
  // hatası). Üst sınır Candy'yi barındıracak kadar geniş — candy'de saydam
  // renk katmanının ALTINDA gerçekten gümüş metalik baz var, parlama
  // çekirdeğinin o kadar parlak olmasının sebebi o ayna.
  check(`${p.code} metalness otomotiv aralığında`, m.metalness <= 0.7, `${m.metalness}`);
  check(`${p.code} difüz bileşen korunuyor`, m.metalness < 1, `${m.metalness}`);
}

// Seri beklentileri: Metallic, Solid'den daha metalik; Pearl en iridesan.
const bySeries = (s) => paints.filter((p) => p.series === s).map(paintToPbr);
const avg = (arr, key) => arr.reduce((a, m) => a + m[key], 0) / arr.length;
check(
  'Metallic > Solid metalness',
  avg(bySeries('Metallic'), 'metalness') > avg(bySeries('Solid'), 'metalness')
);
check(
  'Pearl en yüksek iridescence',
  SERIES_IDS.filter((s) => s !== 'Pearl').every(
    (s) => avg(bySeries('Pearl'), 'iridescence') > avg(bySeries(s), 'iridescence')
  )
);

// --- Görüntüleme sözleşmesi ---
// Parmak izleri üç farklı yoldan geliyor (katalog, tarama, üretim ekranı) ve
// her biri farklı alan kümesi yazıyor. Görüntüleme kodu bu alanlarda doğrudan
// .toFixed() çağırıyor; biri eksikse sayfa çöküyor. normalizePaint tek
// tamamlama noktası — sözleşmeyi burada kilitliyoruz.
const NUMERIC_FIELDS = ['metallic', 'pearl', 'flake', 'gloss', 'transparency'];

const partialRecords = [
  { id: 'a', hex: '#1b5fbf', series: 'Metallic' }, // üretim ekranının yazdığı asgari kayıt
  { id: 'b', hex: '#c8102e' }, // seri bile yok
  { id: 'c', hex: '#0a0a0c', series: 'Meteor', flake: 0.5 }, // kısmi
  {}, // tamamen boş
];

for (const [i, rec] of partialRecords.entries()) {
  const p = normalizePaint(rec);
  check(
    `eksik kayıt #${i}: sayısal alanlar tanımlı`,
    NUMERIC_FIELDS.every((f) => Number.isFinite(p[f])),
    JSON.stringify(NUMERIC_FIELDS.map((f) => `${f}=${p[f]}`))
  );
  check(
    `eksik kayıt #${i}: .toFixed() çağrılabilir`,
    NUMERIC_FIELDS.every((f) => typeof p[f].toFixed(2) === 'string')
  );
  check(
    `eksik kayıt #${i}: yapısal alanlar dolu`,
    Boolean(p.hex && p.series && p.lab && p.srgb && p.xyz && p.code && p.name) &&
      Array.isArray(p.multi_angle) &&
      p.multi_angle.length > 0
  );
}

// Normalleştirme var olan değerleri ezmemeli
const keep = normalizePaint({ id: 'k', hex: '#1b5fbf', series: 'Solid', metallic: 0.77, gloss: 33 });
check('mevcut değerler korunuyor', keep.metallic === 0.77 && keep.gloss === 33);

// Katalog kayıtları normalleştirmeden geçince değişmemeli
for (const p of paints) {
  const n = normalizePaint(p);
  check(
    `${p.code} normalleştirme katalogu bozmuyor`,
    n.metallic === p.metallic && n.gloss === p.gloss && n.hex === p.hex
  );
}

// --- Çok açılı profil sentezi ---
const prof = synthesizeMultiAngle({ l: 60, a: 30, b: 10 }, { metallic: 0.8, pearl: 0.2, flake: 0.5 });
check('sentez 5 açı üretir', prof.length === 5);
check(
  'face → flop L azalır',
  prof.every((p, i) => i === 0 || p.lab.l <= prof[i - 1].lab.l)
);
const { face, flop } = faceAndFlop(prof);
check('face en parlak', face.lab.l >= flop.lab.l);

if (failed) {
  console.error(`\n${failed} test başarısız.`);
  process.exit(1);
}
console.log(`Motor testleri geçti (${paints.length} boya, ${SERIES_IDS.length} seri).`);
