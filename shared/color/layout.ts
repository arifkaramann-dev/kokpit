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
  /* "40 RENK" — serinin gam büyüklüğü, banner'ın tek iddiası. */
  "{renkSayisi}",
  "{pack1}",
  "{pack2}",
  "{pack3}",
  "{pack4}",
  "{brand}",
  "{site}",
  /* Kat sistemi — "bu boya hangi katmanlarla uygulanır" (bkz. coatSystem.ts). */
  "{katSistemi}",
  "{katSayisi}",
  "{katman1}",
  "{katman2}",
  "{katman3}",
  "{katman4}",
  "{urun1}",
  "{urun2}",
  "{urun3}",
  "{urun4}",
  "{ok1}",
  "{ok2}",
  "{ok3}",
  /* Seri banner metni — AI serinin kendi tanıtımından kısaltır. */
  "{slogan}",
  "{madde1}",
  "{madde2}",
  "{madde3}",
  /* Kullanım alanı kolajının etiketleri. */
  "{kullanim1}",
  "{kullanim2}",
  "{kullanim3}",
  "{kullanim4}",
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
  /** "40 RENK" — palet uzunluğundan. Boş palette boş kalır. */
  renkSayisi?: string | null;
  /** Gamdaki boyların adları — `pack1..pack4` görsel katmanlarının etiketi. */
  pack1?: string | null;
  pack2?: string | null;
  pack3?: string | null;
  pack4?: string | null;
  brand?: string | null;
  site?: string | null;
  /** Zincirin tamamı: "Gümüş baz → Candy renk → Vernik". */
  katSistemi?: string | null;
  /** "3 KAT SİSTEM" — şema başlığı. */
  katSayisi?: string | null;
  katman1?: string | null;
  katman2?: string | null;
  katman3?: string | null;
  katman4?: string | null;
  /** Halkanın önerdiği kendi ürünümüz — "ARTOFCOLOUR GLOSS". */
  urun1?: string | null;
  urun2?: string | null;
  urun3?: string | null;
  urun4?: string | null;
  /** Halkalar arası ok — son halkadan sonra boş kalır. */
  ok1?: string | null;
  ok2?: string | null;
  ok3?: string | null;
  slogan?: string | null;
  madde1?: string | null;
  madde2?: string | null;
  madde3?: string | null;
  kullanim1?: string | null;
  kullanim2?: string | null;
  kullanim3?: string | null;
  kullanim4?: string | null;
};

import type { SceneVariant } from "./scene";

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
  /**
   * Kullanım alanı kareleri — bu boyayla boyanmış nesneler, 1 tabanlı.
   *
   * Kolaj bunlardan KAÇI VARSA onunla diziliyor: iki kare varsa yan yana,
   * dört varsa 2×2. Eksik kare yüzünden boş kutu kalmasın diye sayı şablona
   * gömülü değil (bkz. `layoutDefaults.usageLayout`).
   */
  | "use1"
  | "use2"
  | "use3"
  | "use4"
  /**
   * Öncesi / sonrası çekimi — rötuş işinin kanıtı.
   *
   * Bu ikisinin sistemde HENÜZ veri kaynağı yok: çizik kaporta ile rötuşlanmış
   * kaporta, renk kaydından türetilebilecek şeyler değil. Şablon Editörü'nde
   * kullanıcı bunları kendi yüklediği varlığa (`asset:<id>`) bağlıyor.
   * Bağlanmadan kare üretilmiyor — yarısı boş bir "öncesi/sonrası" basmak,
   * hiç basmamaktan kötü.
   */
  | "before"
  | "after"
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
  /**
   * Görselin BEYAZ FONUNU siler.
   *
   * AI obje kareleri beyaz fonlu geliyor. Açık zeminli kartta bu doğru
   * davranış (fon karta karışıyor), koyu zeminli banner'da ise objenin
   * etrafında parlak beyaz bir dikdörtgen bırakıyor — karenin en amatör
   * görünen yeri. Aynı maske palet karelerinde de kullanılıyor.
   *
   * Varsayılan KAPALI: açık zeminli mevcut şablonların çıktısı değişmesin.
   */
  knockout?: boolean;
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
  /**
   * Geçişi TERSİNE çevirir: altta opak, yukarı doğru saydam.
   *
   * Fotoğraf üstüne yazı basarken gereken şey bu — karartma alt kenardan
   * yükseliyor, yazı okunuyor, fotoğrafın üstü açık kalıyor. Aşağı inen
   * geçişle aynı işi yapmak fotoğrafın gökyüzünü karartıp altını açık
   * bırakırdı.
   */
  flip?: boolean;
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
  /**
   * Kaç kolon. **0 = otomatik**: kutuya sığacak ve hücreler kareye yakın
   * kalacak şekilde hesaplanır. Seri 12 renkten 40 renge çıktığında şablonu
   * elle güncellemek gerekmesin.
   */
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
  /**
   * Palet karelerinin BEYAZ FONUNU siler.
   *
   * Kareler beyaz fonlu ürün çekimleri; açık zeminli bir kartta sorun yok ama
   * koyu zeminli banner'da her kare parlak beyaz bir dikdörtgen olarak
   * duruyordu — tasarımın en amatör görünen yeri buydu. Fon silinince objeler
   * zeminde yüzüyor.
   *
   * Varsayılan KAPALI: mevcut açık zeminli şablonların çıktısı değişmesin.
   */
  knockout?: boolean;
  /**
   * Kareleri DEĞİL, rengin kendisini çizer — dolu daireler.
   *
   * Palet karesi olarak rengin stüdyo çekimini basmak kartta doğru: müşteri
   * gerçek boyayı görüyor. Banner'da ise kahraman zaten aynı obje, palet de
   * onun küçültülmüş kopyalarını basınca kare "aynı şeyin tekrarı" gibi
   * okunuyordu. Renk çipi hem tekrarı kırıyor hem gamı daha net gösteriyor.
   */
  swatches?: boolean;
  visible: boolean;
  opacity?: number;
};

/** Palet katmanına çizim anında verilen renkler. */
export type PaletteEntry = {
  code?: string | null;
  name?: string | null;
  /**
   * Rengin stüdyo karesi — palette ASIL çizilen budur.
   *
   * Düz hex kutusu boyayı anlatmıyor: katalogdaki birçok rengin hex'i boş
   * (renk kaynağı fotoğraf) ve dolu olanlarda bile metalik pulun çakması,
   * candy'nin derinliği düz bir karede kaybolur.
   */
  src?: string | null;
  /** Görsel yoksa çizilen düz dolgu. */
  hex?: string | null;
  /** Kartın konusu olan renk — `highlight` açıkken çerçevelenir. */
  active?: boolean;
};

/**
 * Otomatik kolon sayısı — hücreler kareye yakın kalsın.
 *
 * Kutunun en-boy oranını ve renk sayısını birlikte kullanır: geniş bir şeritte
 * çok kolon, kare bir alanda kök civarı. Sonuç 1..n arasına sıkıştırılır.
 */
export function paletteColumns(count: number, boxW: number, boxH: number): number {
  if (count <= 1) return Math.max(1, count);
  const ratio = boxH > 0 ? boxW / boxH : 1;
  const cols = Math.round(Math.sqrt(count * ratio));
  return Math.max(1, Math.min(count, cols || 1));
}

/**
 * SAHNE KATMANI — koddan çizilen afiş zemini.
 *
 * ── Neden ayrı bir katman türü ────────────────────────────────────────────
 * Afişin zemini elimizdeki `rect` ile kurulmaya çalışıldı: üst üste birkaç
 * geçişli dikdörtgen. Çıkan şey zemin değil, "üst üste konmuş dikdörtgenler"
 * gibi görünüyordu — çünkü zeminin işi renk basmak değil, IŞIK kurmak: dip,
 * gövde, ışığın vurduğu panel ve objenin arkasındaki halo birlikte derinlik
 * yapıyor. Dördünü ayrı katman olarak yerleştirmek kullanıcıya dört ayrı
 * kutu vermek demekti ve biri kaydığında sahne dağılıyordu.
 *
 * Katman tek: rengi ve türü seçiliyor, gerisini `shared/color/scene.ts`
 * hesaplıyor.
 */
export type SceneLayer = {
  id: string;
  type: "scene";
  box: LayerBox;
  variant: SceneVariant;
  /**
   * "accent" = SERİNİN aksan rengi (Tanımlar → Seriler), "paint" = ürünün
   * kendi rengi, aksi halde CSS rengi.
   *
   * Afiş serinin karesi — bu yüzden varsayılan aksan. Rengin kendi hex'i
   * katalogdaki çoğu kayıtta boş ve afişi renkten rengi değişen bir şeye
   * çevirirdi: aynı serinin kırk afişi kırk farklı zeminle çıkardı.
   */
  color: string;
  visible: boolean;
  opacity?: number;
};

export type Layer = TextLayer | ImageLayer | RectLayer | PaletteLayer | SceneLayer;

/** Yerleşim palet çiziyor mu — renk listesi olmadan o kare boş çıkar. */
export function usesPalette(layout: TemplateLayout): boolean {
  return layout.layers.some(l => l.type === "palette" && l.visible);
}

/**
 * Filigran — markanın kareye giydirilmesi.
 *
 * ── Neden katman değil ────────────────────────────────────────────────────
 * Filigran bir katman olsaydı kullanıcı onu silebilir, altta bırakabilir ya
 * da yerleşimi düzenlerken kazara kapatabilirdi; asıl işi (kareyi başkasının
 * kullanamaması) tam da "her zaman ve en üstte" olmasına bağlı. Bu yüzden
 * yerleşimin bir ÖZELLİĞİ: katman listesinden bağımsız, çizimin son adımı.
 *
 * `tint: "paint"` markayı ÜRÜNÜN RENGİNE boyar — kare rengin kendisiyle
 * imzalanmış olur; koyu bir logo, koyu bir karede zaten görünmezdi.
 */
export type WatermarkMode = "tile" | "center";
export type WatermarkTint = "ink" | "light" | "paint";

export type Watermark = {
  enabled: boolean;
  /** "tile" = çapraz döşeme (kırpılamaz), "center" = tek büyük damga. */
  mode: WatermarkMode;
  /** Damganın genişliği — kare genişliğinin oranı. */
  scale: number;
  opacity: number;
  tint: WatermarkTint;
  /** Döşemenin eğimi (derece). Düz döşeme kolayca kırpılıp temizlenebiliyor. */
  angle: number;
};

/**
 * Fabrika filigranı.
 *
 * Soluk (%8) ve döşeli: görseli satmaya devam edecek kadar görünmez, kopyalayıp
 * kendi ilanında kullanmaya kalkanı engelleyecek kadar her yerde. Tek köşedeki
 * bir damga kırpılıp atılabilir; çapraz döşeme atılamaz.
 */
export const DEFAULT_WATERMARK: Watermark = {
  enabled: true,
  mode: "tile",
  scale: 0.24,
  opacity: 0.08,
  tint: "ink",
  angle: -30,
};

export type TemplateLayout = {
  /** Kare ölçüsü — piksel. */
  width: number;
  height: number;
  background: string;
  layers: Layer[];
  /**
   * Marka filigranı. TANIMSIZ = "fabrika ayarı", kapalı DEĞİL.
   *
   * Kayıtlı yerleşimler bu alan doğmadan önce veritabanına yazıldı; tanımsızı
   * "kapalı" saymak, düzenlenmiş şablonları sessizce korumasız bırakırdı.
   */
  watermark?: Watermark;
};

/**
 * Karede çizilecek filigran — yoksa null.
 *
 * ÇIPLAK şablonda (pazaryeri ana görseli) her zaman null: Amazon ve Trendyol
 * ana görselde filigran kabul etmiyor, kullanıcı açmış olsa bile ilan
 * reddedilirdi. Kural burada, tek yerde: her çağıran ayrı ayrı hatırlamasın.
 */
export function resolveWatermark(
  layout: TemplateLayout,
  opts: { bare?: boolean } = {},
): Watermark | null {
  if (opts.bare) return null;
  const w = layout.watermark ?? DEFAULT_WATERMARK;
  if (!w.enabled) return null;
  return {
    ...w,
    scale: Math.max(0.05, Math.min(1, w.scale)),
    opacity: Math.max(0, Math.min(1, w.opacity)),
  };
}

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

/** Türkçeye özgü harfler — metnin gerçekten Türkçe yazıldığının işareti. */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Büyük harfe çevirir — Türkçe kuralı YALNIZ gerçekten Türkçe yazılmış metinde.
 *
 * ── Sorun ─────────────────────────────────────────────────────────────────
 * Katalogdaki renk adlarının bir kısmı Türkçe harf kullanmadan yazılmış:
 * "Kirmizi", "Denizmavisi", "Acikmavi". Türkçe büyütme kuralı `i` harfini
 * `İ` yapar, dolayısıyla kartlarda **KİRMİZİ**, **DENİZMAVİSİ** yazıyordu.
 * Müşteriye giden görselde yanlış yazılmış ürün adı.
 *
 * ── Kural ─────────────────────────────────────────────────────────────────
 * Metinde Türkçeye özgü bir harf varsa (ç ğ ı ö ş ü İ) düzgün yazılmış
 * demektir; Türkçe kuralı uygulanır ("Fuşya" → FUŞYA, "Kırmızı" → KIRMIZI).
 * Yoksa değişmez kural: "Kirmizi" → KIRMIZI.
 *
 * Doğru düzeltme elbette katalogdaki adı "Kırmızı" diye yazmak; ama yanlış
 * yazılmış veriyi görselde daha da bozmak yerine, elimizdeki en makul hâlini
 * basıyoruz. Düzgün yazılmış ad hiçbir şey kaybetmiyor.
 */
export function upperText(text: string): string {
  return TURKISH_LETTERS.test(text) ? text.toLocaleUpperCase("tr") : text.toUpperCase();
}

/** Metni son hâline getirir: yer tutucular + dönüşüm + boşluk temizliği. */
export function resolveText(layer: TextLayer, values: TokenValues): string {
  const filled = tidy(fillTokens(layer.text, values));
  return layer.transform === "upper" ? upperText(filled) : filled;
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
