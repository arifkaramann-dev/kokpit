// Işık ortamları.
//
// Boya, çevresini yansıttığı için boya gibi görünür. Düz gri bir stüdyo onu
// öldürür: yansıyacak bir şey yoksa yüzey plastiğe döner. Bu yüzden ortamda
// üstte parlak bir kubbe, altta daha koyu bir zemin ve tek bir kuvvetli kaynak
// olmalı — clearcoat bunları yansıtınca "cilalı boya" hissi doğuyor.
//
// Ortam kameraya görünmüyor; sadece yansıma kaynağı. Arka plan temiz kalıyor.

import * as THREE from 'three';

const WIDTH = 512;
const HEIGHT = 256;

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} label
 * @property {[number,number,number]} zenith   tepe rengi (lineer, >1 olabilir)
 * @property {[number,number,number]} horizon  ufuk rengi
 * @property {[number,number,number]} ground   zemin rengi
 * @property {number} radiance  hedef ortalama ışıma (referans senaryo 1.0)
 * @property {{az:number, el:number, width:number, height:number, power:number,
 *             softness?:number, color:[number,number,number]}[]} lights
 *           Dikdörtgen şerit softbox'lar. width/height eş dikdörtgen uzayında,
 *           softness kenardaki penumbra genişliği — küçük tutulur ki yansıma
 *           keskin kalsın.
 */

export const SCENARIOS = [
  //
  // Tasarım kuralı: çevre AĞIRLIKLI OLARAK KOYU, kaynaklar az sayıda ve
  // PARLAK olmalı. Her yeri eşit aydınlık bir kubbe boyayı mat plastiğe
  // çevirir — kontrast olmadığı için ne keskin yansıma ne derinlik oluşur.
  // Otomotiv çekimlerinde koyu stüdyoya uzun parlak şeritler asılmasının
  // sebebi tam bu: cilalı his, karanlıkta yansıyan parlak kaynaktan doğar.
  {
    id: 'studio',
    label: 'Stüdyo',
    description: 'Beyaz cyc, üstte softbox. Otomotiv katalog çekimi. Referans görünüm bu.',
    // Referans senaryo: tam birim ışıma. Burada gösterilen renk = parmak
    // izindeki renk. Diğer senaryolar kendi atmosferini korur.
    radiance: 1.0,
    // Karanlık stüdyo + yerleştirilmiş softbox'lar. Ortam bilerek çok düşük:
    // aydınlatmanın tamamı kaynaklardan gelmeli, ambient'ten değil. Banded
    // yansıma (parlak şerit / koyu boşluk / parlak şerit) ancak böyle oluşur.
    zenith: [0.035, 0.035, 0.038],
    horizon: [0.022, 0.022, 0.024],
    ground: [0.016, 0.016, 0.017],
    lights: [
      // ANA IŞIK — az 0.75 kameranın arkası. Ölçtük: merkez parlaklığı burada
      // 101.9, az 0.25'te 11.6. Kaynağı yanlış azimuta koymak onu işlevsiz
      // bırakıyor ve normalizasyon açığı ambient'le kapatmaya çalışıyor.
      { az: 0.75, el: 0.7, width: 0.2, height: 0.3, power: 16, color: [1, 1, 1] },
      // Uzun tepe şeridi — gövde boyunca uzanan parlama çizgisi
      { az: 0.75, el: 0.93, width: 0.52, height: 0.05, power: 26, color: [1, 1, 1] },
      // Yan dolgu, hafif soğuk
      { az: 0.58, el: 0.55, width: 0.05, height: 0.42, power: 11, color: [0.94, 0.97, 1] },
      // Karşı kenar vurgusu — gövdeyi arka plandan ayıran ince çizgi
      { az: 0.28, el: 0.62, width: 0.055, height: 0.36, power: 15, color: [1, 0.99, 0.96] },
      // Zemin sekmesi — alt gövdeyi tamamen siyaha düşürmemek için
      { az: 0.75, el: 0.16, width: 0.42, height: 0.06, power: 4, color: [1, 1, 1] },
    ],
  },
  {
    id: 'daylight',
    label: 'Gün Işığı',
    description: 'Açık gökyüzü kubbesi, sert güneş, zemin yansıması.',
    radiance: 1.15,
    zenith: [0.26, 0.4, 0.9],
    horizon: [0.5, 0.58, 0.72],
    ground: [0.085, 0.08, 0.072],
    lights: [
      // Güneş kameranın arka-yan tarafında (az 0.68): gövdeyi aydınlatsın,
      // yalnızca kenarını değil.
      { az: 0.68, el: 0.78, width: 0.022, height: 0.022, power: 130, softness: 0.006, color: [1, 0.96, 0.86] },
      // Ufuk bandı — dış mekanda gövdenin yanına düşen parlak şerit
      { az: 0.88, el: 0.52, width: 0.42, height: 0.022, power: 7, color: [0.9, 0.94, 1] },
    ],
  },
  {
    id: 'warm',
    label: 'Sarı Işık',
    description: 'Akkor/showroom aydınlatması. Boya sıcak tarafa kayar.',
    radiance: 0.85,
    zenith: [0.1, 0.078, 0.045],
    horizon: [0.055, 0.04, 0.023],
    ground: [0.022, 0.016, 0.01],
    lights: [
      // Showroom tavanındaki uzun floresan/LED şeritler — kameranın üstünden
      // öne doğru uzanan sıra
      { az: 0.75, el: 0.88, width: 0.46, height: 0.032, power: 30, color: [1, 0.76, 0.42] },
      { az: 0.62, el: 0.66, width: 0.3, height: 0.03, power: 18, color: [1, 0.82, 0.52] },
      { az: 0.3, el: 0.7, width: 0.24, height: 0.028, power: 10, color: [1, 0.79, 0.46] },
    ],
  },
  {
    id: 'night',
    label: 'Karanlık',
    description: 'Düşük ışık, birkaç noktasal kaynak. Pulcuk parıltısı öne çıkar.',
    radiance: 0.28,
    zenith: [0.05, 0.06, 0.09],
    horizon: [0.03, 0.035, 0.05],
    ground: [0.012, 0.012, 0.015],
    lights: [
      { az: 0.72, el: 0.68, width: 0.016, height: 0.016, power: 80, softness: 0.006, color: [1, 0.95, 0.85] },
      { az: 0.86, el: 0.5, width: 0.014, height: 0.014, power: 50, softness: 0.006, color: [0.7, 0.85, 1] },
      { az: 0.3, el: 0.55, width: 0.02, height: 0.02, power: 26, softness: 0.008, color: [1, 0.6, 0.4] },
    ],
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

/**
 * Eş dikdörtgen bir ortamın küre üzerindeki ortalama ışıması.
 *
 * Katı açı ağırlıklandırması şart: equirect'te tepe ve dip satırları küçücük
 * bir alanı temsil eder ama piksel sayısı ekvatorla aynıdır. Düz ortalama
 * kutupları abartır. Ağırlık sin(θ).
 */
export function meanRadiance(data, width, height) {
  let sum = 0;
  let wsum = 0;
  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height) * Math.PI;
    const w = Math.sin(theta);
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      // Lüminans: difüz yanıt için doğru ağırlıklandırma
      sum += (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) * w;
      wsum += w;
    }
  }
  return wsum > 0 ? sum / wsum : 0;
}

/**
 * Belirli bir normale bakan Lambert yüzeyin gördüğü etkin ışıma.
 *
 * Küre ortalaması yanıltıcı: kameraya bakan bir yüzey tüm küreyi değil, kendi
 * yarım küresini KOSİNÜS AĞIRLIKLI görür. Parlak şeritler tepedeyse küre
 * ortalaması 1.0 çıkar ama öne bakan panel çok daha az ışık alır ve koyu
 * render edilir. Rengi yargıladığımız yüzey öne bakan yüzey olduğu için
 * normalizasyon bu nicelik üzerinden yapılmalı.
 *
 * Düzgün ışımalı bir ortam için sonuç ışımanın kendisidir (E = πL, çıkan
 * radyans = albedo·L), bu da fonksiyonun kendi doğrulaması.
 *
 * @param {[number,number,number]} normal dünya uzayında birim vektör
 */
export function effectiveRadiance(data, width, height, normal) {
  const [nx, ny, nz] = normal;
  let acc = 0;

  const dTheta = Math.PI / height;
  const dPhi = (2 * Math.PI) / width;

  for (let y = 0; y < height; y += 1) {
    // three.js equirect: v = asin(dir.y)/π + 0.5 → satır 0, dir.y = -1
    const v = (y + 0.5) / height;
    const elev = (v - 0.5) * Math.PI; // -π/2 .. +π/2
    const dy = Math.sin(elev);
    const cosElev = Math.cos(elev);

    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const phi = (u - 0.5) * 2 * Math.PI;
      const dx = Math.cos(phi) * cosElev;
      const dz = Math.sin(phi) * cosElev;

      const cosine = dx * nx + dy * ny + dz * nz;
      if (cosine <= 0) continue;

      const p = (y * width + x) * 4;
      const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
      // dω = cos(elev) dElev dPhi
      acc += lum * cosine * cosElev * dTheta * dPhi;
    }
  }

  // E / π — düzgün ortamda ışımanın kendisine eşit olur
  return acc / Math.PI;
}

/** Kameraya bakan yüzeyin gördüğü ışıma. Kamera (0, 0.6, 4.2) konumunda. */
export function frontalRadiance(data, width, height) {
  const n = [0, 0.6, 4.2];
  const len = Math.hypot(...n);
  return effectiveRadiance(data, width, height, [n[0] / len, n[1] / len, n[2] / len]);
}

/**
 * Ortamı hedef ortalama ışımaya ölçekler.
 *
 * Neden gerekli: renk zinciri "birim beyaz ışık altında render = albedo"
 * varsayımı üzerine kurulu (bkz. pbr.js/displayCorrectedAlbedo). Ortam
 * ortalama 0.45 ışıma veriyorsa Lambert yüzey albedo×0.45 render eder —
 * yani ekrandaki renk hedeflenenin yarısı kadar koyu çıkar. Ton eşleme
 * telafisi ne kadar doğru olursa olsun bu farkı kapatamaz.
 *
 * Referans senaryo (stüdyo) tam 1.0'a normalize edilir: orada gösterilen
 * renk parmak izindeki renktir. Diğer senaryolar kendi atmosferini korur.
 */
export function normalizeRadiance(data, width, height, target) {
  // Küre ortalaması değil, ÖNE BAKAN yüzeyin gördüğü ışıma üzerinden
  // ölçekliyoruz — rengi yargıladığımız yüzey o.
  const mean = frontalRadiance(data, width, height);
  if (mean <= 1e-6) return 1;
  const gain = target / mean;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= gain;
    data[i + 1] *= gain;
    data[i + 2] *= gain;
  }
  return gain;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Senaryodan eş dikdörtgen (equirectangular) HDR doku üretir.
 * @returns {THREE.DataTexture}
 */
/**
 * @param {string} scenarioId
 * @param {{withLights?:boolean, normalize?:boolean}} [opts]
 *        withLights=false yalnızca ambient kubbeyi üretir — kaynakların
 *        öne bakan yüzeye katkısını ölçebilmek için (bkz. environment testi).
 */
export function buildEnvironmentTexture(scenarioId, opts = {}) {
  const { withLights = true, normalize = true } = opts;
  const s = getScenario(scenarioId);
  const data = new Float32Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    // v: 0 = tepe, 1 = dip
    const v = y / (HEIGHT - 1);
    // elevation: 1 tepe, 0 ufuk, -1 dip
    const el = 1 - 2 * v;

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1);
      let r;
      let g;
      let b;

      if (el >= 0) {
        // Gökyüzü: ufuktan tepeye geçiş. Karekök, gerçek gökyüzüne daha yakın.
        const t = Math.sqrt(el);
        r = lerp(s.horizon[0], s.zenith[0], t);
        g = lerp(s.horizon[1], s.zenith[1], t);
        b = lerp(s.horizon[2], s.zenith[2], t);
      } else {
        // Zemin: ufka yakınken biraz gökyüzü sızar, aşağı indikçe koyulaşır
        const t = Math.min(1, -el * 2.2);
        r = lerp(s.horizon[0] * 0.55, s.ground[0], t);
        g = lerp(s.horizon[1] * 0.55, s.ground[1], t);
        b = lerp(s.horizon[2] * 0.55, s.ground[2], t);
      }

      // Kaynaklar — dikdörtgen şerit softbox'lar, KESKİN kenarlı.
      //
      // Önce dairesel ve kademeli sönümlü kaynaklar kullanıyordum; sonuç
      // yumuşak yuvarlak lekelerdi ve yüzey plastik gibi görünüyordu.
      // Araba kaportasındaki o karakteristik uzun ince parlama, keskin
      // kenarlı şerit kaynağın yansımasıdır. Clearcoat ne kadar pürüzsüz
      // olursa olsun ortamda keskin bir şey yoksa yansıma keskin olmaz.
      for (const L of withLights ? s.lights : []) {
        let du = Math.abs(u - L.az);
        if (du > 0.5) du = 1 - du;
        const dv = Math.abs(v - (1 - L.el));

        const hw = L.width / 2;
        const hh = L.height / 2;
        // Dikdörtgenin dışına olan mesafe (içerideyse 0)
        const ox = Math.max(0, du - hw);
        const oy = Math.max(0, dv - hh);
        const outside = Math.hypot(ox, oy);

        const soft = L.softness ?? 0.012;
        if (outside > soft) continue;
        // Kenarda kısa bir penumbra, içeride tam güç — softbox böyle davranır
        const k = (soft > 0 ? 1 - outside / soft : 1) * L.power;

        r += L.color[0] * k;
        g += L.color[1] * k;
        b += L.color[2] * k;
      }

      const p = (y * WIDTH + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 1;
    }
  }

  // Işımayı hedefe ölçekle — renk zincirinin birim ışık varsayımı bunu şart
  // koşuyor, yoksa render hedef renkten koyu çıkar.
  if (normalize) normalizeRadiance(data, WIDTH, HEIGHT, s.radiance ?? 1);

  const tex = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Portakal kabuğu (orange peel) normal haritası.
 *
 * Verniğin fırın sonrası hafif dalgalılığı. Gerçek otomotiv boyasını kusursuz
 * CG'den ayıran en belirgin şey bu: mükemmel bir ayna yüzeyi gerçek dünyada
 * yoktur, yansıyan çizgiler daima hafifçe dalgalanır. Pulcuk haritasından
 * farkı ölçek — pulcuk mikron mertebesinde ve rastgele, portakal kabuğu
 * milimetre mertebesinde ve YUMUŞAK.
 *
 * Clearcoat normaline uygulanır, taban katmanına değil: dalgalanan şey
 * verniğin yüzeyi, pigment değil.
 */
export function buildOrangePeelMap(size = 256, cells = 20, seed = 11) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  // Kaba rastgele yükseklik ızgarası — kenarlarda sarmalı ki doku döşenebilsin
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rnd();

  const at = (x, y) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);

  // Değer gürültüsü: kaba ızgarayı yumuşak enterpolasyonla büyüt
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      height[y * size + x] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    }
  }

  // Yükseklikten normal: merkezi fark
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => height[((y % size) + size) % size * size + (((x % size) + size) % size)];
  // Eğim bilerek düşük: portakal kabuğu ince bir DALGALANMA, pürüzlü bir
  // yüzey değil. Yüksek değerde pulcuk gürültüsünden ayırt edilemez hale
  // geliyor ve iki katman birbirine karışıyor.
  const strength = 0.9;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const p = (y * size + x) * 4;
      data[p] = Math.round((-dx / len) * 0.5 * 255 + 127.5);
      data[p + 1] = Math.round((-dy / len) * 0.5 * 255 + 127.5);
      data[p + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5);
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Pulcuk normal haritası.
 *
 * Metaliği metalik yapan şey renk değil doku: alt-milimetre ölçekli alüminyum
 * pulcuklar ışığı tek tek yansıtır, göz bunu "parıltı" olarak okur. Tek bir
 * düz normal ile bu asla oluşmaz — o yüzden yüksek frekanslı rastgele
 * normaller üretip yüzeye çok yüksek tekrar oranıyla bindiriyoruz.
 */
export function buildFlakeNormalMap(size = 256, seed = 7) {
  const data = new Uint8Array(size * size * 4);
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  for (let i = 0; i < size * size; i += 1) {
    // Pulcukların çoğu yüzeye paralel; küçük bir kısmı belirgin eğik.
    const strong = rnd() < 0.12;
    const spread = strong ? 0.9 : 0.12;
    const nx = (rnd() * 2 - 1) * spread;
    const ny = (rnd() * 2 - 1) * spread;
    const nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));

    const p = i * 4;
    data[p] = Math.round((nx * 0.5 + 0.5) * 255);
    data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[p + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
