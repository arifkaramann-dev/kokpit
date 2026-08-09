// Pazarlama şablonları.
//
// Bir renk kaydı + bir obje görseli girer, satışa hazır görsel çıkar.
// Şablon = ölçü + kompozisyon + metin katmanı. Obje görseli AI'den gelir,
// metin ve marka katmanı burada basılır.
//
// Kritik ayrım: PAZARYERİ ANA GÖRSELİ metin taşıyamaz. Amazon ve benzerleri
// ana görselde yazı, logo, filigran, çerçeve kabul etmiyor. Bu yüzden her
// şablonun `bare` bayrağı var — çıplak olanlar sadece ürün ve beyaz fon.

import { listUserPackaging, getUserPackagingImage } from './packagingStore.js';

export const BRAND = {
  name: 'ART OF COLOUR',
  site: 'artofcolour.com',
  font: 'Goldman',
  logoDark: '/brand/logo-siyah.png',
  logoLight: '/brand/logo-beyaz.png',
};

/** Ürün gamı — etikette ve kartta gösterilir. */
export const PACK_SIZES = ['30 ML', '100 ML', '250 ML', '500 ML', '400 ML SPREY'];

/**
 * Gerçek ambalaj görselleri.
 *
 * Kutu her RENKTE aynı kalır — ürün kimliği, renk göstergesi değil; renk
 * numune damlasında gösteriliyor. Ama HATTA göre değişir: Vivid rengin
 * yanında Meteor kutusu duramaz.
 */
export const PACKAGING = [
  { id: 'vivid-spray400', line: 'VIVID', label: 'VIVID 400 ML Sprey', src: '/packaging/sprey-400-vivid.png', alpha: false },
  { id: 'meteor-spray400', line: 'METEOR', label: 'METEOR 400 ML Sprey', src: '/packaging/sprey-400-meteor.png', alpha: true },
  { id: 'meteor-bottle500', line: 'METEOR', label: 'METEOR 500 ML Şişe', src: '/packaging/sise-500.jpg', alpha: false },
  { id: 'meteor-bottle250', line: 'METEOR', label: 'METEOR 250 ML Şişe', src: '/packaging/sise-250.jpg', alpha: false },
  { id: 'meteor-bottle100', line: 'METEOR', label: 'METEOR 100 ML Şişe', src: '/packaging/sise-100.jpg', alpha: false },
  { id: 'meteor-bottle30', line: 'METEOR', label: 'METEOR 30 ML Şişe', src: '/packaging/sise-30.jpg', alpha: false },
];

export function getPackaging(id) {
  return (
    PACKAGING.find((p) => p.id === id) ||
    listUserPackaging().find((p) => p.id === id) ||
    PACKAGING[0]
  );
}

/**
 * Bir hattın ambalajları — yerleşikler + kullanıcının yüklediği.
 * Arayüzde yalnızca doğru hattakiler listelensin.
 */
export function packagingForLine(line) {
  return [...PACKAGING, ...listUserPackaging()].filter((p) => p.line === line);
}

/**
 * Ambalajın çizilebilir kaynağını çözer.
 * Yerleşiklerde bu bir URL, kullanıcı ambalajlarında IndexedDB'den gelen
 * bir data URI. Çağıran taraf farkı bilmek zorunda kalmasın diye burada.
 */
async function resolvePackagingSrc(pack) {
  if (!pack.user) return pack.src;
  const data = await getUserPackagingImage(pack.id);
  return data || null;
}

/**
 * Seriye uygun varsayılan ambalaj.
 * Seçili ambalaj yanlış hattaysa otomatik düzeltilir — Vivid bir rengin
 * yanında Meteor kutusu görünmesin.
 */
export function defaultPackagingFor(seriesCode, current) {
  const line = getSeries(seriesCode).line;
  const chosen = current ? getPackaging(current) : null;
  if (chosen && chosen.line === line) return chosen.id;
  return packagingForLine(line)[0]?.id || PACKAGING[0].id;
}

/**
 * Efekt serileri ve kod önekleri.
 * VIVID bir ürün hattı; efekt adı hattın içinde bölünüyor.
 */
export const SERIES = [
  { code: 'VP', line: 'VIVID', effect: 'PEARLY', label: 'Vivid Pearly' },
  { code: 'VM', line: 'VIVID', effect: 'METALLIC', label: 'Vivid Metallic' },
  { code: 'VC', line: 'VIVID', effect: 'CANDY', label: 'Vivid Candy' },
  { code: 'VS', line: 'VIVID', effect: 'SOLID', label: 'Vivid Solid' },
  { code: 'MT', line: 'METEOR', effect: 'GRADIENT', label: 'Meteor Gradient' },
];

export function getSeries(code) {
  return SERIES.find((s) => s.code === code) || SERIES[0];
}

export const TEMPLATES = [
  {
    id: 'product',
    label: 'Ürün + Numune',
    hint: 'Ambalaj ve renk numunesi aynı karede. Ana satış görseli.',
    width: 1400,
    height: 1400,
    bare: false,
    kind: 'product',
  },
  {
    id: 'coats',
    label: 'Kat Progresyonu',
    hint: '1/2/3 kat — candy ve şeffaf renklerde derinleşmeyi gösterir.',
    width: 1400,
    height: 1400,
    bare: false,
    kind: 'coats',
  },
  {
    id: 'marketplace',
    label: 'Pazaryeri ana görsel',
    hint: 'Beyaz fon, sıfır metin. Amazon/Trendyol ana görsel kuralı.',
    width: 1600,
    height: 1600,
    bare: true,
  },
  {
    id: 'card',
    label: 'Renk kartı',
    hint: 'Kod, isim, seri. Katalog ve site listesi.',
    width: 1080,
    height: 1080,
    bare: false,
  },
  {
    id: 'social',
    label: 'Instagram gönderi',
    hint: 'Kare, marka katmanlı.',
    width: 1080,
    height: 1080,
    bare: false,
  },
  {
    id: 'story',
    label: 'Story / Reels',
    hint: 'Dikey 9:16.',
    width: 1080,
    height: 1920,
    bare: false,
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

/** Görseli hedef kutuya sığdıracak çizim koordinatları (contain). */
function contain(imgW, imgH, boxW, boxH) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Görseli hedef kutuyu dolduracak şekilde kırp (cover). */
function cover(imgW, imgH, boxW, boxH) {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/**
 * Fonu saf beyaza zorlar.
 *
 * Model "pure white background" dense bile hafif gri bir gradyan üretebiliyor.
 * Pazaryeri ana görselinde fon SAF beyaz olmak zorunda (255,255,255) — gri
 * fonlu görsel reddediliyor. Bu yüzden prompt'a güvenmiyoruz, ölçüp
 * düzeltiyoruz.
 *
 * Yöntem: dört köşeden taşma dolgusu (flood fill). Köşeden başlayıp benzer
 * komşuları geziyoruz; objeye ulaşınca renk farkı eşiği aşılıyor ve duruyoruz.
 * Global "açık pikselleri beyaz yap" yaklaşımı objenin parlama noktalarını da
 * silerdi — bağlantılı dolgu bunu yapmıyor.
 *
 * @returns {{canvas:HTMLCanvasElement, changed:number, wasClean:boolean}}
 */
export function forceWhiteBackground(img, tolerance = 26) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  const at = (x, y) => (y * w + x) * 4;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];

  // Köşeler zaten saf beyazsa dokunma
  const alreadyWhite = corners.every(([x, y]) => {
    const p = at(x, y);
    return d[p] >= 250 && d[p + 1] >= 250 && d[p + 2] >= 250;
  });
  if (alreadyWhite) return { canvas, changed: 0, wasClean: true };

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let changed = 0;

  for (const [cx, cy] of corners) {
    const seed = at(cx, cy);
    const sr = d[seed];
    const sg = d[seed + 1];
    const sb = d[seed + 2];
    // Köşe koyuysa orada obje var demektir; fon değil, dokunma
    if (0.2126 * sr + 0.7152 * sg + 0.0722 * sb < 170) continue;

    let head = 0;
    let tail = 0;
    const start = cy * w + cx;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const p = idx * 4;
      // Tohuma göre değil, BEYAZA göre değil — komşuluk zinciri boyunca
      // tohum rengine yakınlık: gradyanlı fonlarda zincir kopmasın diye
      // eşik cömert, ama objeye geçince renk farkı bunu aşıyor.
      const diff =
        Math.abs(d[p] - sr) + Math.abs(d[p + 1] - sg) + Math.abs(d[p + 2] - sb);
      if (diff > tolerance * 3) continue;

      d[p] = 255;
      d[p + 1] = 255;
      d[p + 2] = 255;
      changed += 1;

      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; queue[tail++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; queue[tail++] = idx + 1; }
      if (y > 0 && !visited[idx - w]) { visited[idx - w] = 1; queue[tail++] = idx - w; }
      if (y < h - 1 && !visited[idx + w]) { visited[idx + w] = 1; queue[tail++] = idx + w; }
    }
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, changed, wasClean: false };
}

/**
 * Numuneye ek kat uygular.
 *
 * Candy ve şeffaf renklerde her kat, altındakinin üstüne renkli saydam bir
 * katman koyar. Işık o katmandan geçerken Beer-Lambert soğurmasına uğrar:
 * boyanın kendi renginde geçiren, tamamlayıcı renkte soğuran bir filtre.
 * Yani N kat = geçirgenliğin N-1 kez daha uygulanması.
 *
 * Bu yüzden 2. ve 3. kat için AI'ye tekrar gitmiyoruz — tek numuneden fizik
 * doğru şekilde türetiliyor. Hem bedava hem üç kare birbiriyle tutarlı.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {string} hex boyanın rengi
 * @param {number} coats 1 = dokunma
 */
export function applyCoats(source, hex, coats = 1) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  if (coats <= 1) return canvas;

  // Katmanın geçirgenliği.
  //
  // Dikkat: numune ZATEN boyanın renginde. Onu bir kez daha boyanın tam
  // rengiyle çarpmak katlamalı soğurma yapıyor ve kare siyaha düşüyor
  // (magenta'nın yeşil kanalı 0.2 → üç katta 0.04 → yeşil tamamen ölüyor).
  // Gerçekte ek kat rengi DERİNLEŞTİRİR, öldürmez.
  //
  // İki bileşen birlikte çalışıyor:
  //
  //   SELECTIVITY — rengin hangi kanalı ne kadar geçirdiği. Hue derinleşmesi
  //                 bundan geliyor.
  //   DENSITY     — katmanın genel yoğunluğu, her kanalı eşit koyultur.
  //
  // Yalnızca seçici soğurma kullanınca ilerleme cılız kalıyordu: en parlak
  // kanalın geçirgenliği tanım gereği 1.0 olduğu için magenta'nın kırmızısı
  // hiç koyulaşmıyor, üç kat arasında gözle fark edilir değişim olmuyordu.
  // Gerçek candy'de her kat genel yoğunluğu da artırır.
  const SELECTIVITY = 0.45;
  const DENSITY = 0.82;

  const n = String(hex).replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const v = parseInt(full, 16);
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const peak = Math.max(...rgb) || 255;

  const t = rgb.map((c) => DENSITY * (1 - (1 - Math.max(0.12, c / peak)) * SELECTIVITY));

  const extra = coats - 1;
  const gain = t.map((x) => Math.pow(x, extra));

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Beyaz fona dokunma — yalnızca numunenin kendisi katman alsın
    if (d[i] > 246 && d[i + 1] > 246 && d[i + 2] > 246) continue;
    d[i] *= gain[0];
    d[i + 1] *= gain[1];
    d[i + 2] *= gain[2];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Şablonu çizer.
 *
 * @param {object} opts
 * @param {string} opts.templateId
 * @param {string} opts.objectImage  data: URI — AI üretimi obje görseli
 * @param {object} opts.paint        { code, nameTr, nameEn, seriesCode, hex }
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderTemplate({ templateId, objectImage, paint }) {
  const tpl = getTemplate(templateId);
  const series = getSeries(paint.seriesCode);

  const canvas = document.createElement('canvas');
  canvas.width = tpl.width;
  canvas.height = tpl.height;
  const ctx = canvas.getContext('2d');

  // Fon her zaman saf beyaz — pazaryeri şartı, diğerlerinde de temiz duruyor
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tpl.width, tpl.height);

  const obj = objectImage ? await loadImage(objectImage) : null;

  if (tpl.bare) {
    // ÇIPLAK: yalnızca ürün, kenarlarda %8 pay. Metin/logo yok.
    // Fon saf beyaza zorlanıyor — pazaryeri şartı, prompt'a güvenilmiyor.
    const pad = tpl.width * 0.08;
    if (obj) {
      const cleaned = forceWhiteBackground(obj).canvas;
      const box = contain(
        cleaned.width,
        cleaned.height,
        tpl.width - pad * 2,
        tpl.height - pad * 2
      );
      ctx.drawImage(cleaned, box.x + pad, box.y + pad, box.w, box.h);
    }
    return canvas;
  }

  if (tpl.kind === 'product') {
    await drawProduct(ctx, tpl, obj, paint, series);
    return canvas;
  }
  if (tpl.kind === 'coats') {
    await drawCoats(ctx, tpl, obj, paint, series);
    return canvas;
  }

  await drawComposed(ctx, tpl, obj, paint, series);
  return canvas;
}

/** Kod + isim başlığı — iki şablonda da aynı görünsün diye ortak. */
function drawHeading(ctx, W, x, y, paint, series, align = 'left') {
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  const codeSize = Math.round(W * 0.062);
  ctx.font = `700 ${codeSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(paint.code || '—', x, y);

  ctx.font = `400 ${Math.round(W * 0.034)}px Goldman, sans-serif`;
  ctx.fillStyle = '#3f3f46';
  ctx.fillText((paint.nameEn || '').toUpperCase(), x, y + codeSize * 1.22);

  ctx.font = `400 ${Math.round(W * 0.024)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText((paint.nameTr || '').toUpperCase(), x, y + codeSize * 1.9);

  ctx.font = `700 ${Math.round(W * 0.021)}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(`${series.line}  ${series.effect}`, x, y + codeSize * 2.5);
}

/** Alt şerit: logo solda, site sağda. */
async function drawFooter(ctx, W, H, pad) {
  const footerH = W * 0.06;
  const top = H - pad * 0.6 - footerH;
  ctx.textAlign = 'left';
  try {
    const logo = await loadImage(BRAND.logoDark);
    const logoW = footerH / (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, pad, top, logoW, footerH);
  } catch {
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(W * 0.022)}px Goldman, sans-serif`;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(BRAND.name, pad, top + footerH / 2);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.017)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(BRAND.site, W - pad, top + footerH / 2);
  return top;
}

/**
 * Ürün + numune.
 *
 * Ambalaj arkada durur, renk numunesi önde. Rakip görsellerdeki kurgu bu:
 * müşteri hem ne satın aldığını hem rengin nasıl göründüğünü tek karede
 * görür. Ambalaj her renkte AYNI — ürün kimliği, renk göstergesi değil.
 */
async function drawProduct(ctx, tpl, obj, paint, series) {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.06;

  const footerTop = await drawFooter(ctx, W, H, pad);
  const stage = { x: 0, y: 0, w: W, h: footerTop - pad * 0.5 };

  // Ambalaj — sağ tarafta, dikey merkezli.
  // Hat kontrolü burada da yapılıyor: kayıtta eski/yanlış bir ambalaj kalmışsa
  // (seri değiştirilmiş olabilir) sessizce doğru hatta düzeltilir.
  const pack = getPackaging(defaultPackagingFor(paint.seriesCode, paint.packaging));
  try {
    const src = await resolvePackagingSrc(pack);
    if (!src) throw new Error('ambalaj görseli yok');
    const packImg = await loadImage(src);
    const cleaned = pack.alpha ? packImg : forceWhiteBackground(packImg).canvas;
    const targetH = stage.h * 0.78;
    const ratio = (cleaned.naturalWidth || cleaned.width) / (cleaned.naturalHeight || cleaned.height);
    const packW = targetH * ratio;
    ctx.drawImage(cleaned, W - pad - packW * 0.92, stage.y + stage.h * 0.06, packW, targetH);
  } catch {
    // Ambalaj yüklenemezse sahne numuneyle devam etsin
  }

  // Numune — sol altta, ambalajın önünde
  if (obj) {
    const cleaned = forceWhiteBackground(obj).canvas;
    const boxW = W * 0.62;
    const boxH = stage.h * 0.5;
    const box = contain(cleaned.width, cleaned.height, boxW, boxH);
    ctx.drawImage(
      cleaned,
      pad * 0.4 + box.x,
      stage.y + stage.h - boxH - stage.h * 0.02 + box.y,
      box.w,
      box.h
    );
  }

  drawHeading(ctx, W, pad, stage.y + pad * 0.6, paint, series);
}

/**
 * Kat progresyonu.
 *
 * Candy ve şeffaf renklerde kat sayısı rengi belirgin şekilde derinleştirir;
 * müşterinin en çok sorduğu şey bu. Üç kare AI'ye üç kez gitmeden, tek
 * numuneden Beer-Lambert ile türetiliyor.
 */
async function drawCoats(ctx, tpl, obj, paint, series) {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.06;

  const footerTop = await drawFooter(ctx, W, H, pad);
  const headingH = W * 0.062 * 3.1;
  const top = pad * 0.6 + headingH + pad * 0.4;

  drawHeading(ctx, W, pad, pad * 0.6, paint, series);

  if (!obj) {
    ctx.fillStyle = paint.hex || '#cccccc';
    ctx.fillRect(pad, top, W - pad * 2, footerTop - top - pad);
    return;
  }

  const cleaned = forceWhiteBackground(obj).canvas;
  const available = footerTop - top - pad * 0.6;

  // Ana numune (3 kat — en derin hali, ürünün vaadi)
  const mainH = available * 0.62;
  const main = applyCoats(cleaned, paint.hex, 3);
  const mainBox = contain(main.width, main.height, W - pad * 2, mainH);
  ctx.drawImage(main, pad + mainBox.x, top + mainBox.y, mainBox.w, mainBox.h);

  // Üç küçük kare: 1, 2, 3 kat
  const smallTop = top + mainH + pad * 0.3;
  const smallH = available - mainH - pad * 0.3;
  const cellW = (W - pad * 2) / 3;

  for (let i = 0; i < 3; i += 1) {
    const coat = applyCoats(cleaned, paint.hex, i + 1);
    const box = contain(coat.width, coat.height, cellW * 0.86, smallH * 0.74);
    ctx.drawImage(
      coat,
      pad + cellW * i + (cellW - box.w) / 2,
      smallTop + box.y * 0.4,
      box.w,
      box.h
    );

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `700 ${Math.round(W * 0.022)}px Goldman, sans-serif`;
    ctx.fillStyle = '#52525b';
    ctx.fillText(`${i + 1} KAT`, pad + cellW * i + cellW / 2, smallTop + smallH);
  }
}

async function drawComposed(ctx, tpl, obj, paint, series) {
  const W = tpl.width;
  const H = tpl.height;
  const pad = W * 0.07;

  // Yerleşim aşağıdan yukarı kurgulanıyor.
  //
  // İlk sürümde y'yi yukarıdan aşağı biriktiriyordum ve logoyu ayrıca
  // "en alta" koyuyordum; ikisi çakıştı, logo Türkçe ismin üstüne bindi.
  // Doğrusu: alt şeridin (logo + site) yüksekliğini ÖNCE ayır, metin bloğunu
  // onun üstüne otur, obje alanını kalandan hesapla. Böylece hiçbir katman
  // diğerinin alanına giremez.

  const footerH = W * 0.075; // logo satırı
  const lineGap = W * 0.052; // metin satırları arası
  const textBlockH = lineGap * 2 + W * 0.075; // kod satırı + 2 satır
  const stripH = H * 0.028;

  const footerTop = H - pad * 0.55 - footerH;
  const textTop = footerTop - pad * 0.5 - textBlockH;
  const stripTop = textTop - pad * 0.55 - stripH;
  const objH = stripTop;

  // --- Obje alanı ---
  if (obj) {
    const box = cover(obj.naturalWidth, obj.naturalHeight, W, objH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, objH);
    ctx.clip();
    ctx.drawImage(obj, box.x, box.y, box.w, box.h);
    ctx.restore();
  } else {
    ctx.fillStyle = paint.hex || '#cccccc';
    ctx.fillRect(0, 0, W, objH);
  }

  // --- Renk şeridi ---
  ctx.fillStyle = paint.hex || '#cccccc';
  ctx.fillRect(0, stripTop, W, stripH);

  // --- Metin bloğu ---
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const codeSize = Math.round(W * 0.072);
  ctx.font = `700 ${codeSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(paint.code || '—', pad, textTop);

  // İngilizce isim kodun sağında, alt hizası kodla aynı
  const codeWidth = ctx.measureText(paint.code || '—').width;
  const enSize = Math.round(W * 0.04);
  ctx.font = `400 ${enSize}px Goldman, sans-serif`;
  ctx.fillStyle = '#3f3f46';
  ctx.fillText(
    (paint.nameEn || '').toUpperCase(),
    pad + codeWidth + W * 0.028,
    textTop + (codeSize - enSize) * 0.82
  );

  // Türkçe isim
  const trTop = textTop + codeSize * 1.28;
  ctx.font = `400 ${Math.round(W * 0.032)}px Goldman, sans-serif`;
  ctx.fillStyle = '#71717a';
  ctx.fillText((paint.nameTr || '').toUpperCase(), pad, trTop);

  // Seri + ambalaj gamı aynı satırda, iki uçta
  const seriesTop = trTop + lineGap;
  ctx.font = `700 ${Math.round(W * 0.025)}px Goldman, sans-serif`;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText(`${series.line}  ${series.effect}`, pad, seriesTop);

  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.018)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(PACK_SIZES.join('  ·  '), W - pad, seriesTop + W * 0.006);

  // --- Alt şerit: logo solda, site sağda. Kendi ayrılmış alanında. ---
  ctx.textAlign = 'left';
  try {
    const logo = await loadImage(BRAND.logoDark);
    const ratio = logo.naturalHeight / logo.naturalWidth;
    const logoH = footerH;
    const logoW = logoH / ratio;
    ctx.drawImage(logo, pad, footerTop, logoW, logoH);
  } catch {
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(W * 0.026)}px Goldman, sans-serif`;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(BRAND.name, pad, footerTop + footerH / 2);
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = `400 ${Math.round(W * 0.019)}px Goldman, sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(BRAND.site, W - pad, footerTop + footerH / 2);
}

/** Şablonu üretip PNG data URI döndürür. */
export async function renderToDataUrl(opts) {
  const canvas = await renderTemplate(opts);
  return canvas.toDataURL('image/png');
}
