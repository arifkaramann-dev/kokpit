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
  "{packSizes}",
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
  packSizes?: string | null;
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
};

/** Görsel katmanının kaynağı. */
export type ImageSource =
  | "object"
  | "packaging"
  | "logo"
  /** Kat progresyonu kareleri — 1 tabanlı. */
  | "coat1"
  | "coat2"
  | "coat3";

export type ImageLayer = {
  id: string;
  type: "image";
  box: LayerBox;
  source: ImageSource;
  fit: "contain" | "cover";
  visible: boolean;
};

export type RectLayer = {
  id: string;
  type: "rect";
  box: LayerBox;
  /** "paint" = rengin kendisi; aksi halde CSS rengi. */
  fill: string;
  visible: boolean;
};

export type Layer = TextLayer | ImageLayer | RectLayer;

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
