/**
 * Şablon yerleşim modeli — kullanıcının düzenleyebildiği kare tarifi.
 *
 * ── Neden katman modeli ───────────────────────────────────────────────────
 * Şablonlar önce koda gömülü çizim fonksiyonlarıydı: her kare için ayrı bir
 * `drawProduct`, `drawCoats`, `drawComposed`. Kullanıcı hiçbirini
 * değiştiremiyordu; "başlık biraz aşağı insin" bile kod değişikliği
 * gerektiriyordu.
 *
 * Şablon artık bir KATMAN LİSTESİ. Aynı liste iki yerden düzenlenebiliyor:
 * form alanlarıyla (ayar paneli) ve önizleme üstünde sürükleyerek. İkisi
 * aynı veriyi yazdığı için birbirine düşemezler — iki ayrı düzenleme sistemi
 * kurmanın en pahalı tarafı budur.
 *
 * ── Koordinatlar oran ─────────────────────────────────────────────────────
 * Tüm konum ve ölçüler kare GENİŞLİĞİNİN oranı (0..1). Aynı yerleşim 1080'lik
 * Instagram karesinde de 1600'lük pazaryeri karesinde de bozulmadan çalışsın
 * diye; piksel yazılsaydı her ölçü için ayrı şablon tutmak gerekirdi.
 *
 * Dikey konum da GENİŞLİĞE göre değil YÜKSEKLİĞE göre: 9:16 story ile kare
 * gönderi arasında dikey akış tamamen farklı, oranı yükseklikten almak
 * ikisini de doğru tutuyor.
 *
 * Saf modül: çizim yok, tarayıcı API'si yok. Tarif burada, boyama istemcide.
 */

/** Metin katmanında kullanılabilen yer tutucular. */
export const TOKENS = [
  "{code}",
  "{nameTr}",
  "{nameEn}",
  "{series}",
  "{line}",
  "{effect}",
  "{packaging}",
  "{volume}",
  "{packSizes}",
  "{pack1}",
  "{pack2}",
  "{pack3}",
  "{pack4}",
  "{brand}",
  "{site}",
] as const;

export type TokenValues = {
  code?: string | null;
  nameTr?: string | null;
  nameEn?: string | null;
  series?: string | null;
  line?: string | null;
  effect?: string | null;
  /** Ürünün kendi ambalajının adı — "250 ml". */
  packaging?: string | null;
  /** Ürünün kendi hacmi — "250 ML". */
  volume?: string | null;
  /** Serinin bütün boyları, ayraçla: "30 ML · 100 ML · 250 ML". */
  packSizes?: string | null;
  /** Gamdaki boyların adları — `pack1..pack4` görsel katmanlarının etiketi. */
  pack1?: string | null;
  pack2?: string | null;
  pack3?: string | null;
  pack4?: string | null;
  brand?: string | null;
  site?: string | null;
};

/** Katmanın çizileceği kutu — hepsi 0..1 oranı. */
export type LayerBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TextTransform = "none" | "upper";

export type TextLayer = {
  id: string;
  type: "text";
  box: LayerBox;
  /** Yer tutucu içerebilir: "{code}  {nameEn}" */
  text: string;
  /** Kare genişliğinin oranı olarak yazı boyutu. */
  size: number;
  weight: 400 | 700;
  color: string;
  align: "left" | "center" | "right";
  transform: TextTransform;
  visible: boolean;
  /**
   * Katman saydamlığı (0..1). Tanımsız = 1.
   *
   * Yeni alanlar İSTEĞE BAĞLI: kullanıcının kaydettiği yerleşimler
   * veritabanında JSON olarak duruyor ve zorunlu bir alan eklemek onları
   * geçersiz kılardı.
   */
  opacity?: number;
  /**
   * Satır arası — yazı boyutunun katı. Tanımsız = 1.2.
   * Yalnız `wrap` açıkken anlamlı.
   */
  lineHeight?: number;
  /**
   * Uzun metni kutuya SARAR (birden çok satır).
   *
   * Kapalıyken (varsayılan) metin tek satırda kalır ve sığmıyorsa küçültülür —
   * kod ve isim gibi kısa alanlarda doğru davranış. Açıkken paragraf yazılabilir;
   * açıklama, kullanım notu, malzeme listesi tek satıra sıkışmasın.
   */
  wrap?: boolean;
};

/**
 * Görsel katmanının kaynağı.
 *
 * Sabit kaynaklar üretimden gelir: `object` AI çıktısı, `coat1..3` kat
 * progresyonu, `logo` marka varlığı.
 *
 * `packaging` ÜRÜNÜN KENDİ ambalajının çekimi; `pack1..pack4` ise serinin
 * ambalaj gamı, küçükten büyüğe. İkisi de artık Tanımlar'daki ambalaj
 * çekimlerinden geliyor (bkz. `packagingImage.ts`) — koda gömülü dosya adları
 * değil. Gam sıralı olduğu için `pack2` "ikinci boy" demek, "100 ml" demek
 * değil: seri değişince aynı şablon doğru boyları çizer.
 *
 * `asset:<id>` ise KULLANICININ yüklediği serbest görsel — kendi logosu, arka
 * plan dokusu. Kimlik dizeye gömülü çünkü yerleşim JSON olarak saklanıyor ve
 * ayrı bir alan açmak her katman türüne bulaşırdı.
 */
export type ImageSource =
  | "object"
  | "packaging"
  | "logo"
  /** Kat progresyonu kareleri — 1 tabanlı. */
  | "coat1"
  | "coat2"
  | "coat3"
  /** Serinin ambalaj gamı — hacme göre artan, 1 tabanlı. */
  | "pack1"
  | "pack2"
  | "pack3"
  | "pack4"
  | `asset:${number}`;

/** `asset:12` → 12; sabit kaynaklarda null. */
export function assetIdOf(source: ImageSource): number | null {
  if (!source.startsWith("asset:")) return null;
  const id = Number(source.slice(6));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export type ImageLayer = {
  id: string;
  type: "image";
  box: LayerBox;
  source: ImageSource;
  fit: "contain" | "cover";
  visible: boolean;
  opacity?: number;
  /**
   * Yumuşak zemin gölgesi.
   *
   * Beyaz fonda beyaz bir şişe fotoğrafı zemine yapışıyor ve kare amatör
   * görünüyordu. Gölge objeyi fondan ayırıyor; pazaryeri ana görselinde
   * KULLANILMAZ (fon saf beyaz kalmalı), o yüzden şablon başına açılıyor.
   */
  shadow?: boolean;
};

export type RectLayer = {
  id: string;
  type: "rect";
  box: LayerBox;
  /** "paint" = rengin kendisi; aksi halde CSS rengi. */
  fill: string;
  visible: boolean;
  opacity?: number;
  /** Köşe yarıçapı — kare genişliğinin oranı. Tanımsız = keskin köşe. */
  radius?: number;
  /**
   * Dolgu aşağı doğru saydamlaşır.
   *
   * Renk şeridini düz basmak kartı iki parçaya bölüyordu; geçişli şerit hem
   * rengi gösteriyor hem metin bloğuna bağlanıyor.
   */
  gradient?: boolean;
};

/**
 * Renk paleti katmanı — serinin bütün renkleri, kodlarıyla.
 *
 * ── Neden ayrı bir katman türü ────────────────────────────────────────────
 * Katalog/palet karesi otuz renk gösteriyor. Otuz kutuyu tek tek katman
 * olarak yerleştirmek hem elle yapılamaz hem seri büyüdüğünde eskir: yeni
 * renk eklendiğinde kimse şablonu güncellemeye gitmez. Bu katman ızgarayı
 * KENDİ hesaplıyor; kaç renk gelirse ona göre.
 *
 * Renkler yerleşimde saklanmıyor, çizim anında veriliyor (`RenderLayoutInput.
 * palette`) — tarif hangi renklerin var olduğunu bilmemeli.
 */
export type PaletteLayer = {
  id: string;
  type: "palette";
  box: LayerBox;
  /** Kaç kolon — satır sayısı renk sayısından hesaplanır. */
  columns: number;
  /** Kutular arası boşluk; kare GENİŞLİĞİNİN oranı (iki eksende de aynı). */
  gap: number;
  /** Kutunun altına renk kodu yazılsın mı. */
  showCode: boolean;
  /** Kod yazı boyu — kare genişliğinin oranı. */
  labelSize: number;
  labelColor: string;
  /** Kutu köşe yarıçapı — kare genişliğinin oranı. */
  radius?: number;
  /** Kartın kendi rengini çerçeveleyip öne çıkar. */
  highlight?: boolean;
  visible: boolean;
  opacity?: number;
};

/** Palet katmanına çizim anında verilen renkler. */
export type PaletteEntry = {
  code?: string | null;
  name?: string | null;
  hex?: string | null;
  /** Kartın konusu olan renk — `highlight` açıkken çerçevelenir. */
  active?: boolean;
};

export type Layer = TextLayer | ImageLayer | RectLayer | PaletteLayer;

/** Yerleşim palet çiziyor mu — renk listesi olmadan o kare boş çıkar. */
export function usesPalette(layout: TemplateLayout): boolean {
  return layout.layers.some(l => l.type === "palette" && l.visible);
}

export type TemplateLayout = {
  /** Kare ölçüsü — piksel. */
  width: number;
  height: number;
  background: string;
  layers: Layer[];
};

/**
 * Yer tutucuları doldurur.
 *
 * Karşılığı olmayan yer tutucu BOŞ dizeye iner, "{nameEn}" olarak kalmaz:
 * eksik veri kartın üstünde süslü parantezle görünürse müşteriye gider.
 */
export function fillTokens(text: string, values: TokenValues): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = (values as Record<string, string | null | undefined>)[key];
    return v == null ? "" : String(v);
  });
}

/** Boşlukları toparlar — yer tutucu boşalınca çift boşluk kalmasın. */
export function tidy(text: string): string {
  return text.replace(/\s{2,}/g, " ").trim();
}

/** Metni son hâline getirir: yer tutucular + dönüşüm + boşluk temizliği. */
export function resolveText(layer: TextLayer, values: TokenValues): string {
  const filled = tidy(fillTokens(layer.text, values));
  return layer.transform === "upper" ? filled.toLocaleUpperCase("tr") : filled;
}

/** Katman kutusunu piksele çevirir. */
export function boxToPixels(
  box: LayerBox,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: box.x * width,
    y: box.y * height,
    w: box.w * width,
    h: box.h * height,
  };
}

/** Kutuyu kare içinde tutar — sürükleyerek dışarı taşınamasın. */
export function clampBox(box: LayerBox): LayerBox {
  const w = Math.max(0.02, Math.min(1, box.w));
  const h = Math.max(0.02, Math.min(1, box.h));
  return {
    w,
    h,
    x: Math.max(0, Math.min(1 - w, box.x)),
    y: Math.max(0, Math.min(1 - h, box.y)),
  };
}

/** Verilen noktayı içeren EN ÜSTTEKİ görünür katman. */
export function layerAt(
  layout: TemplateLayout,
  px: number,
  py: number,
): Layer | null {
  for (let i = layout.layers.length - 1; i >= 0; i -= 1) {
    const l = layout.layers[i];
    if (!l.visible) continue;
    const b = l.box;
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return l;
  }
  return null;
}

let seq = 0;
/** Katman kimliği — kararlı olması yeter, tahmin edilebilir olması gerekmez. */
export function newLayerId(prefix = "k"): string {
  seq += 1;
  return `${prefix}${seq}-${Math.random().toString(36).slice(2, 7)}`;
}
