/**
 * Boya serileri — Art of Colour'ın son kat aileleri.
 *
 * Seri, rengin ötesinde bir DAVRANIŞ sınıfıdır: aynı Lab değerine sahip iki
 * boya, biri Solid biri Candy ise gözde bambaşka görünür. Bu yüzden seri hem
 * katalog gruplaması hem de malzeme varsayılanlarının kaynağıdır.
 *
 * `pbr` bloğu 3B önizleme içindir ve o zincir şu an DONDURULMUŞ durumda
 * (bkz. docs/renk-uygulamasi-entegrasyon.md). Bugün buradan yalnızca
 * `metalness` okunuyor — `normalize.ts`, kayıtta `metallic` yoksa seri
 * varsayılanı olarak onu kullanıyor. Kalan alanlar (roughness, clearcoat,
 * iridescence, flakeScale, flopStrength) 3B zinciri geri çağrıldığında
 * yeniden devreye girer; veriyi bugün budamak, yarın yeniden türetmek
 * anlamına gelirdi.
 *
 * DİKKAT: bu, kokpit'teki `colors.finish` enum'undan (duz/metalik/sedef/
 * candy/neon/seffaf) FARKLI bir kavramdır. O bir SATIŞ etiketidir ve
 * pazaryeri kartında "Renk Tipi" olarak gider; bu ise render ve malzeme
 * davranışıdır. İkisini birbirine çevirmeye çalışmak, ikisini de bozar.
 */

/** 3B render varsayılanları — 3B zinciri dondurulana kadar yalnız `metalness` okunur. */
export type SeriesPbr = {
  metalness: number;
  roughness: number;
  clearcoat: number;
  iridescence: number;
  flakeScale: number;
  flopStrength: number;
};

export type Series = {
  id: string;
  label: string;
  /** Katalogda seriyi temsil eden örnek renk. */
  swatch: string;
  description: string;
  pbr: SeriesPbr;
};

export const SERIES: readonly Series[] = [
  {
    id: "Solid",
    label: "Solid",
    swatch: "#2b2b2b",
    description: "Düz, tek tonlu son kat. Yüksek opaklık, etkili örtücülük.",
    // flopStrength pulcuk ölçeğinden AYRI: biri rengin açıyla ne kadar
    // derinleştiği, diğeri yüzeyde ne kadar parıltı göründüğü. Candy'de
    // flop güçlü ama görünür pulcuk azdır — pulcuk saydam katmanın ALTINDA.
    pbr: {
      metalness: 0.0,
      roughness: 0.42,
      clearcoat: 1,
      iridescence: 0,
      flakeScale: 0,
      flopStrength: 0.12,
    },
  },
  {
    id: "Candy",
    label: "Candy",
    swatch: "#c0392b",
    description: "Saydam renk katmanı üzerine metalik baz. Derin, camsı görünüm.",
    // Saydam renk katmanının altında GÜMÜŞ METALİK BAZ var — parlama
    // çekirdeğinin candy'de bu kadar parlak olmasının sebebi o ayna.
    // Metalik specular albedoyla renklenir, yani yansıma da yeşil/kırmızı
    // çıkar; beyaza yıkanmaz. Derinliği soğurma katsayısı taşıyor.
    pbr: {
      metalness: 0.58,
      roughness: 0.22,
      clearcoat: 1,
      iridescence: 0.06,
      flakeScale: 0.35,
      flopStrength: 0.55,
    },
  },
  {
    id: "Metallic",
    label: "Metallic",
    swatch: "#7f8c8d",
    description: "Alüminyum pulcuklu, açıya bağlı parlama değişimi.",
    pbr: {
      metalness: 0.34,
      roughness: 0.34,
      clearcoat: 1,
      iridescence: 0,
      flakeScale: 1,
      flopStrength: 0.45,
    },
  },
  {
    id: "Pearl",
    label: "Pearl",
    swatch: "#8e44ad",
    description: "İnterferans pigmanları, iridesan renk geçişi.",
    pbr: {
      metalness: 0.16,
      roughness: 0.3,
      clearcoat: 1,
      iridescence: 0.85,
      flakeScale: 0.7,
      flopStrength: 0.4,
    },
  },
  {
    id: "Meteor",
    label: "Meteor",
    swatch: "#1a1a2e",
    description: "Koyu baz, parlak pulcuk, derin uzaysı etki.",
    pbr: {
      metalness: 0.4,
      roughness: 0.24,
      clearcoat: 1,
      iridescence: 0.3,
      flakeScale: 1.4,
      flopStrength: 0.58,
    },
  },
];

export const SERIES_IDS: readonly string[] = SERIES.map(s => s.id);

/**
 * Seriyi id'den bulur.
 *
 * Bilinmeyen id'de HATA ATMAZ, ilk seriye (Solid) düşer. Sebep: seri adı
 * kullanıcı verisinden geliyor ve eski kayıtlarda kaldırılmış bir seri adı
 * durabilir. Katalog sayfasının tek bir bozuk satır yüzünden çökmesindense
 * o satırın Solid varsayılanıyla görünmesi yeğdir.
 */
export function getSeries(id: string | null | undefined): Series {
  return SERIES.find(s => s.id === id) ?? SERIES[0];
}
