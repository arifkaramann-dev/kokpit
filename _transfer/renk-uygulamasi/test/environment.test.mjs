// Ortam ışıması testleri.
//
// Renk zinciri "birim beyaz ışık altında render = albedo" varsayımı üzerine
// kurulu (bkz. src/lib/pbr.js displayCorrectedAlbedo). Ortam bu varsayımı
// karşılamazsa ton eşleme telafisi ne kadar doğru olursa olsun ekrandaki renk
// hedeften sapar — ölçtüğümüzde stüdyo hedefin %53'ünü render ediyordu.
//
// Çalıştırmak için:  node test/environment.test.mjs

import {
  SCENARIOS,
  getScenario,
  meanRadiance,
  effectiveRadiance,
  frontalRadiance,
  normalizeRadiance,
  buildEnvironmentTexture,
  buildFlakeNormalMap,
  buildOrangePeelMap,
} from '../src/lib/environment.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

// --- meanRadiance katı açı ağırlıklandırması ---
// Düzgün bir küre ortamının ortalama ışıması, değerinin kendisi olmalı.
{
  const W = 64;
  const H = 32;
  const d = new Float32Array(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 0.5;
    d[i + 1] = 0.5;
    d[i + 2] = 0.5;
    d[i + 3] = 1;
  }
  check('düzgün ortamın ortalaması kendisi', Math.abs(meanRadiance(d, W, H) - 0.5) < 1e-4, `${meanRadiance(d, W, H)}`);
}

// Kutuplar ekvatordan az ağırlık almalı: tepe yarısı parlak bir ortamda
// ortalama, düz piksel ortalamasından FARKLI çıkmalı (sin θ ağırlığı).
{
  const W = 64;
  const H = 32;
  const d = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = (y * W + x) * 4;
      const v = y < 2 ? 10 : 0.1; // yalnızca tepe iki satır çok parlak
      d[p] = v;
      d[p + 1] = v;
      d[p + 2] = v;
      d[p + 3] = 1;
    }
  }
  const weighted = meanRadiance(d, W, H);
  const flat = (2 / H) * 10 + (1 - 2 / H) * 0.1; // ağırlıksız ortalama
  check(
    'kutup satırları katı açıya göre bastırılıyor',
    weighted < flat * 0.5,
    `ağırlıklı ${weighted.toFixed(3)} vs düz ${flat.toFixed(3)}`
  );
}

// --- effectiveRadiance: kosinüs ağırlıklı yarım küre ---
// Düzgün ışımalı ortamda sonuç ışımanın kendisi olmalı (E = πL). Bu, hangi
// normal verilirse verilsin geçerli — fonksiyonun kendi doğrulaması.
{
  const W = 128;
  const H = 64;
  const d = new Float32Array(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 0.7;
    d[i + 1] = 0.7;
    d[i + 2] = 0.7;
    d[i + 3] = 1;
  }
  for (const n of [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [0, -1, 0],
  ]) {
    const e = effectiveRadiance(d, W, H, n);
    check(`düzgün ortam, normal ${n}: etkin ışıma = ışıma`, Math.abs(e - 0.7) < 0.01, `${e.toFixed(4)}`);
  }
}

// Yönlü ortamda öne bakan yüzey küre ortalamasından farklı görür — normalize
// bu nicelik üzerinden yapılmalı, çünkü rengi yargıladığımız yüzey odur.
{
  const W = 128;
  const H = 64;
  const d = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = (y * W + x) * 4;
      const v = y < H / 4 ? 3 : 0.1; // ışık yalnızca bir kutupta toplanmış
      d[p] = v;
      d[p + 1] = v;
      d[p + 2] = v;
      d[p + 3] = 1;
    }
  }
  const sphere = meanRadiance(d, W, H);
  const front = frontalRadiance(d, W, H);
  check(
    'yönlü ortamda öne bakan ışıma küre ortalamasından ayrışıyor',
    Math.abs(front - sphere) / sphere > 0.1,
    `küre ${sphere.toFixed(3)} vs öne ${front.toFixed(3)}`
  );
}

// --- normalizeRadiance ---
{
  const W = 64;
  const H = 32;
  const d = new Float32Array(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 0.2;
    d[i + 1] = 0.3;
    d[i + 2] = 0.4;
    d[i + 3] = 1;
  }
  const gain = normalizeRadiance(d, W, H, 1);
  check('normalize sonrası öne bakan ışıma hedefte', Math.abs(frontalRadiance(d, W, H) - 1) < 1e-3);
  check('kazanç pozitif ve sonlu', Number.isFinite(gain) && gain > 0, `${gain}`);
  // Renk oranları korunmalı — normalize parlaklık ayarıdır, renk kayması değil
  check(
    'kanal oranları korunuyor',
    Math.abs(d[1] / d[0] - 0.3 / 0.2) < 1e-5 && Math.abs(d[2] / d[0] - 0.4 / 0.2) < 1e-5
  );
  // Alfa kanalına dokunulmamalı
  check('alfa bozulmuyor', d[3] === 1);
}

// --- Senaryolar ---
console.log('senaryo      hedef   öne bakan   küre ort.   albedo 0.30 render eder');
console.log('─'.repeat(70));

for (const s of SCENARIOS) {
  const tex = buildEnvironmentTexture(s.id);
  const measured = frontalRadiance(tex.image.data, tex.image.width, tex.image.height);
  const sphere = meanRadiance(tex.image.data, tex.image.width, tex.image.height);
  const target = s.radiance ?? 1;
  console.log(
    `${s.id.padEnd(12)}${String(target).padStart(7)}${measured.toFixed(3).padStart(12)}${sphere
      .toFixed(3)
      .padStart(12)}${(0.3 * measured).toFixed(3).padStart(24)}`
  );
  check(`${s.id}: öne bakan ışıma hedefe normalize`, Math.abs(measured - target) < 0.02, `${measured.toFixed(4)}`);
  check(
    `${s.id}: tüm değerler sonlu ve negatif değil`,
    tex.image.data.every((v) => Number.isFinite(v) && v >= 0)
  );
}

// --- Kontrast ---
// Keskin yansıma için ortamın dinamik aralığı yüksek olmalı. Yumuşak, her
// yeri eşit aydınlık bir kubbe yüzeyi plastiğe çevirir: clearcoat ne kadar
// pürüzsüz olursa olsun ortamda keskin bir şey yoksa yansıma keskin olmaz.
console.log('\nsenaryo      tepe/ortam oranı   kenar keskinliği');
console.log('─'.repeat(48));

for (const s of SCENARIOS) {
  const tex = buildEnvironmentTexture(s.id);
  const d = tex.image.data;
  const w = tex.image.width;
  const h = tex.image.height;

  let peak = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum > peak) peak = lum;
  }
  const mean = meanRadiance(d, w, h);
  const ratio = mean > 0 ? peak / mean : 0;

  // Keskinlik: kaynak sınırında bir satır boyunca en büyük komşu sıçraması.
  // Kademeli sönümlü dairesel kaynakta bu küçük, keskin softbox'ta büyük.
  let maxJump = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 1; x < w; x += 1) {
      const a = 0.2126 * d[(y * w + x - 1) * 4] + 0.7152 * d[(y * w + x - 1) * 4 + 1];
      const b = 0.2126 * d[(y * w + x) * 4] + 0.7152 * d[(y * w + x) * 4 + 1];
      const jump = Math.abs(b - a);
      if (jump > maxJump) maxJump = jump;
    }
  }

  // Keskinlik ÖLÇEKSİZ ölçülüyor: sıçramanın mutlak büyüklüğü ortamın genel
  // parlaklığına bağlı, dolayısıyla sabit bir eşik anlamsız. Ortalamaya
  // oranlamak kaynağın kenarının ne kadar ani olduğunu doğrudan verir.
  const sharpness = mean > 0 ? maxJump / mean : 0;

  console.log(
    `${s.id.padEnd(12)}${ratio.toFixed(1).padStart(14)}${sharpness.toFixed(1).padStart(15)}`
  );
  check(`${s.id}: kaynaklar ortamdan belirgin parlak`, ratio > 8, `oran ${ratio.toFixed(1)}`);
  check(`${s.id}: kaynak kenarı keskin`, sharpness > 1, `keskinlik ${sharpness.toFixed(2)}`);
}

// --- Anahtar ışık yerleşimi ---
//
// Bir kaynağı yanlış azimuta koymak onu işlevsiz bırakır. Render'dan ölçtük:
// tek bir kaynak az 0.75'teyken (kameranın arkası) küre merkezinin
// parlaklığı 101.9, az 0.25'teyken (objenin arkası) 11.6.
//
// Stüdyonun ana softbox'ı az 0.24'teydi — yani hiç işe yaramıyordu ve
// normalizasyon açığı ambient'i yükselterek kapatıyordu. Sonuç: düz,
// ambient-baskın, yapay aydınlatma. Bu sessizce geri gelebilecek bir hata.
//
// Sözleşme: öne bakan yüzeye gelen ışığın çoğu KAYNAKLARDAN gelmeli.
console.log('\nsenaryo      ışıklı   ambient   kaynak payı');
console.log('─'.repeat(48));

for (const s of SCENARIOS) {
  const lit = buildEnvironmentTexture(s.id, { normalize: false });
  const ambient = buildEnvironmentTexture(s.id, { withLights: false, normalize: false });

  const full = frontalRadiance(lit.image.data, lit.image.width, lit.image.height);
  const amb = frontalRadiance(ambient.image.data, ambient.image.width, ambient.image.height);
  const share = full > 0 ? (full - amb) / full : 0;

  console.log(
    `${s.id.padEnd(12)}${full.toFixed(3).padStart(8)}${amb.toFixed(3).padStart(10)}${`${(share * 100).toFixed(
      0
    )}%`.padStart(13)}`
  );
  check(
    `${s.id}: öne bakan yüzeyi ağırlıkla kaynaklar aydınlatıyor`,
    share > 0.6,
    `kaynak payı %${(share * 100).toFixed(0)}`
  );
}

// Referans senaryo tam 1.0 olmalı: orada gösterilen renk parmak izindeki renk.
const ref = getScenario('studio');
check('referans senaryo birim ışımada', (ref.radiance ?? 1) === 1, `${ref.radiance}`);

// Senaryolar arası: karanlık en sönük, gün ışığı en parlak olmalı
const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s.radiance ?? 1]));
check('karanlık en sönük senaryo', byId.night === Math.min(...Object.values(byId)));
check('gün ışığı en parlak senaryo', byId.daylight === Math.max(...Object.values(byId)));

// --- Pulcuk normal haritası ---
{
  const tex = buildFlakeNormalMap(64, 3);
  const d = tex.image.data;
  check('pulcuk haritası doğru boyutta', d.length === 64 * 64 * 4);
  // Normaller birim uzunluğa yakın olmalı ve çoğunluğu yukarı bakmalı
  let unit = 0;
  let up = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const nx = (d[i] / 255) * 2 - 1;
    const ny = (d[i + 1] / 255) * 2 - 1;
    const nz = (d[i + 2] / 255) * 2 - 1;
    if (Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.06) unit += 1;
    if (nz > 0.9) up += 1;
  }
  check('normaller birim uzunlukta', unit / n > 0.9, `${((unit / n) * 100).toFixed(0)}%`);
  check(
    'pulcukların çoğu yüzeye paralel, azınlığı eğik',
    up / n > 0.6 && up / n < 0.97,
    `${((up / n) * 100).toFixed(0)}% düz`
  );
  // Deterministik olmalı — aynı tohum aynı harita
  const again = buildFlakeNormalMap(64, 3);
  check('aynı tohum aynı haritayı üretiyor', again.image.data.every((v, i) => v === d[i]));
}

// --- Portakal kabuğu haritası ---
// Pulcuktan farkı ÖLÇEK: pulcuk yüksek frekanslı ve rastgele, kabuk düşük
// frekanslı ve YUMUŞAK. İkisi karışırsa kabuk parıltıya, parıltı gürültüye
// döner. Komşu texel farkını ölçerek bunu ayırt ediyoruz.
{
  const size = 128;
  const peel = buildOrangePeelMap(size, 16, 5);
  const flake = buildFlakeNormalMap(size, 5);

  const meanNeighbourDelta = (tex) => {
    const d = tex.image.data;
    let sum = 0;
    let n = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 1; x < size; x += 1) {
        const a = (y * size + x - 1) * 4;
        const b = (y * size + x) * 4;
        sum += Math.abs(d[b] - d[a]) + Math.abs(d[b + 1] - d[a + 1]);
        n += 1;
      }
    }
    return sum / n;
  };

  const peelDelta = meanNeighbourDelta(peel);
  const flakeDelta = meanNeighbourDelta(flake);
  console.log(`\nkomşu texel farkı — kabuk ${peelDelta.toFixed(2)}, pulcuk ${flakeDelta.toFixed(2)}`);

  check(
    'portakal kabuğu pulcuktan çok daha yumuşak',
    peelDelta < flakeDelta / 5,
    `kabuk ${peelDelta.toFixed(2)} vs pulcuk ${flakeDelta.toFixed(2)}`
  );

  // Normaller geçerli olmalı
  const d = peel.image.data;
  let unit = 0;
  let up = 0;
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const nx = (d[i] / 255) * 2 - 1;
    const ny = (d[i + 1] / 255) * 2 - 1;
    const nz = (d[i + 2] / 255) * 2 - 1;
    if (Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.06) unit += 1;
    if (nz > 0) up += 1;
  }
  check('kabuk normalleri birim uzunlukta', unit / total > 0.9, `${((unit / total) * 100).toFixed(0)}%`);
  check('kabuk normalleri yüzeyden dışa bakıyor', up === total);
  check('kabuk haritası döşenebilir boyutta', d.length === size * size * 4);

  // Deterministik
  const again = buildOrangePeelMap(size, 16, 5);
  check('aynı tohum aynı kabuğu üretiyor', again.image.data.every((v, i) => v === d[i]));
}

if (failed) {
  console.error(`\n${failed} test başarısız.`);
  process.exit(1);
}
console.log('\nOrtam testleri geçti.');
