// Parmak izi ölçümlerini PBR malzeme parametrelerine çeviren saf eşleme.
// three.js'ten bağımsız tutuldu ki testlenebilsin.

import { getSeries } from './series.js';
import { invertToneMapping } from './tonemap.js';
import { hexToRgb, rgbToLinear, hexToLab, labToHex, synthesizeMultiAngle, faceAndFlop } from './color.js';

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** Referans görünümde kullanılan ton eşleyici ve pozlama. Motorla eşleşmeli. */
export const REFERENCE_TONE_MAPPING = 'neutral';
export const REFERENCE_EXPOSURE = 1;

/**
 * Ekranda hedeflenen rengin çıkması için malzemeye verilecek lineer albedo.
 *
 * Render motorunun son adımı ton eşleme; bu adım rengi bozuyor (ACES'te
 * ortalama ΔE 4.7, Neutral'da 2.5 — bkz. test/tonemap.test.mjs). Burada o
 * dönüşümün tersini alıp bozulmayı baştan telafi ediyoruz.
 *
 * Dönen değer 1.0'ı aşabilir (parlak renklerde gerekiyor), bu yüzden hex
 * değil lineer üçlü döndürülüyor — three.js'e LinearSRGBColorSpace ile verilir.
 */
export const MAX_ALBEDO = 2;

export function displayCorrectedAlbedo(hex) {
  const target = rgbToLinear(hexToRgb(hex));
  const { albedo } = invertToneMapping(target, REFERENCE_TONE_MAPPING, REFERENCE_EXPOSURE);

  // Tavan neden gerekli: ton eşleyici saf beyazı asimptotik olarak yaklaşır,
  // yani hedef #ffffff'e yaklaştıkça gereken albedo hızla büyür (Arctic
  // White'ın face açısı için 3.55 çıkıyordu). O değer sahnede her şeyi yakar,
  // tüm gölge detayını siler. Ekran zaten beyazdan parlağını gösteremiyor —
  // telafiyi orada kesmek, patlamış bir render'dan iyidir.
  return albedo.map((v) => Math.min(MAX_ALBEDO, v));
}

/**
 * @param {object} paint Digital Paint Fingerprint kaydı
 * @returns {object} MeshPhysicalMaterial parametreleri (düz sayılar)
 */
/**
 * Parmak izi → MeshPhysicalMaterial parametreleri.
 *
 * Kritik nokta — metalness:
 * Otomotiv boyası PBR anlamında METAL DEĞİLDİR. Şeffaf vernik (dielektrik)
 * altında pigmentli bir kat, içinde dağılmış alüminyum pulcuklar var.
 * metalness=1 vermek malzemenin difüz bileşenini tamamen siler; renk yalnızca
 * renklendirilmiş yansımadan gelir ve ortam karanlıksa yüzey siyaha düşer.
 * "Koyu krom" görüntüsünün sebebi tam olarak budur.
 *
 * Doğru reçete: metalness düşük (0–0.35), clearcoat 1.0, ve pulcuk etkisi
 * metalness'tan değil YÜKSEK FREKANSLI NORMAL HARİTASINDAN gelir.
 */
/**
 * Face ve flop renkleri — açıya bağlı renk kaymasının iki ucu.
 *
 * Metalik boyayı metalik yapan şey budur: kaputa dik bakınca parlak ve canlı,
 * yandan bakınca derin ve koyu. Bu bir aydınlatma etkisi DEĞİL, pulcukların
 * yönelimi yüzünden boyanın kendi renginin değişmesi. Sabit tek bir albedo
 * verilen malzeme kaçınılmaz olarak plastik gibi görünür.
 *
 * Kaynak sırası: kaydın ölçülmüş çok açılı profili varsa o, yoksa seri
 * karakterine göre sentezlenmiş profil.
 */
export function faceFlopColors(paint) {
  const measured = Array.isArray(paint.multi_angle) ? paint.multi_angle : [];
  const profile =
    measured.length >= 2
      ? measured
      : synthesizeMultiAngle(hexToLab(paint.hex), {
          // Flop şiddeti seriden gelir, pulcuk ölçeğinden değil: ikisi ayrı
          // fiziksel olay. Candy'de flop çok güçlü ama görünür pulcuk azdır.
          metallic: getSeries(paint.series).pbr.flopStrength ?? 0.2,
          pearl: paint.pearl ?? 0,
          flake: paint.flake ?? 0,
        });

  const { face, flop } = faceAndFlop(profile);
  const faceHex = face ? labToHex(face.lab) : paint.hex;
  const flopHex = flop ? labToHex(flop.lab) : paint.hex;

  return {
    faceHex,
    flopHex,
    faceLinear: displayCorrectedAlbedo(faceHex),
    flopLinear: displayCorrectedAlbedo(flopHex),
    // Profil ölçülmüş mü yoksa sentetik mi — arayüzde dürüst olmak için
    measured: measured.length >= 2,
  };
}

/** Flop referans açısı: N·V = 0.3, yaklaşık 72° — 110° aspeküler ölçüme denk. */
export const FLOP_REFERENCE_NDV = 0.3;

/**
 * Face ve flop renklerinden kanal başına soğurma katsayısı.
 *
 * Derinlik hissi, renkli saydam bir katmanın İÇİNDEN bakıyor olmaktan gelir.
 * O katmanın optiği Beer-Lambert: açı yattıkça ışığın kat ettiği yol uzar ve
 * renk ÜSTEL olarak koyulaşıp doyar. Doğrusal geçiş (mix) bu eğriyi veremez —
 * renk doğru iki uçta olsa bile arada düz göründüğü için yüzey boyalı plastik
 * gibi okunur.
 *
 * Katsayı, N·V = 0.3'te tam olarak flop rengini verecek şekilde çözülüyor:
 *   exp(-k · (1/0.3 - 1)) = flop / face
 */
function absorptionFrom(faceLinear, flopLinear) {
  const pathAtRef = 1 / FLOP_REFERENCE_NDV - 1; // 2.333
  return faceLinear.map((face, i) => {
    const flop = flopLinear[i];
    if (!(face > 1e-5)) return 0;
    const ratio = Math.max(1e-4, Math.min(1, flop / face));
    return -Math.log(ratio) / pathAtRef;
  });
}

export function paintToPbr(paint) {
  const pbr = getSeries(paint.series).pbr;
  const { pearl = 0, flake = 0, gloss = 70, transparency = 0 } = paint;

  const opacity = 1 - transparency * 0.15;

  const ff = faceFlopColors(paint);

  return {
    color: paint.hex,
    // Ton eşleme telafisi uygulanmış lineer albedo — malzemeye bu verilir.
    albedoLinear: displayCorrectedAlbedo(paint.hex),

    // Açıya bağlı renk kayması (flop). Shader'a enjekte edilir.
    faceLinear: ff.faceLinear,
    flopLinear: ff.flopLinear,
    flopMeasured: ff.measured,
    // Kanal başına soğurma katsayısı — derinliği üreten şey.
    absorption: absorptionFrom(ff.faceLinear, ff.flopLinear),

    // Seri kararı belirleyici; ölçülen pulcuk yoğunluğu yalnızca ince ayar.
    // Fotoğraftaki parlaklık aralığından ASLA türetilmiyor — o gölgenin eseri.
    //
    // Değer bilerek düşük: metalik yanıt ortamın rengini alır (beyaz), yani
    // metalness yükseldikçe parlama bölgelerinde boyanın rengi silinir ve
    // yüzey beyaza yıkanır. Gerçek arabada parlama içinde bile mavi görünür.
    // Pulcuk hissi buradan değil normal haritasından geliyor.
    metalness: clamp01(pbr.metalness + flake * 0.06),

    // Parlaklık (GU) yükseldikçe pürüz azalır. Taban 0.06 — mutlak ayna
    // otomotiv verniğinde gerçekçi değil.
    roughness: clamp01(Math.max(0.06, pbr.roughness * (1 - gloss / 190))),

    clearcoat: clamp01(pbr.clearcoat),
    clearcoatRoughness: clamp01(0.02 + (1 - gloss / 100) * 0.12),

    iridescence: clamp01(pbr.iridescence * (0.5 + pearl * 0.6)),
    iridescenceIOR: 1.25 + pearl * 0.45,
    iridescenceThicknessRange: [180, 380 + flake * 320],

    // Pulcuk dokusunun şiddeti — normal haritasına uygulanacak ölçek.
    flakeIntensity: clamp01((pbr.flakeScale ?? 0) * (0.35 + flake * 0.9)),

    envMapIntensity: 1 + flake * 0.35,
    opacity,
    transparent: opacity < 1,
  };
}
