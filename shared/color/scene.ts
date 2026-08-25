/**
 * MOTOR ÇİZİMİ SAHNE — afişin zemini.
 *
 * ── Neden çizilen zemin, neden fotoğraf değil ─────────────────────────────
 * Afişin zemini için iki yol vardı: gerçek çekim ya da koddan üretilen sahne.
 * Çekim yolu her seri için önce bir fotoğraf bekliyor; o gelene kadar afiş
 * ya boş ya da objenin kadraja yayılmış hâli oluyordu. Çizilen zemin ise
 * serinin aksan renginden anında ve her seride tutarlı çıkıyor.
 *
 * ── Zeminin tek girdisi: aksan rengi ──────────────────────────────────────
 * Sahne tek bir renkten türetiliyor (`sceneRamp`). Bütün derinlik — derin dip,
 * orta gövde, ışık, parlama — o rengin karartılıp açılmış hâlleri. Böylece
 * CANDY'nin afişi mor, METEOR'un afişi antrasit oluyor ve iki afiş yan yana
 * konduğunda aynı ailenin iki üyesi gibi duruyor.
 *
 * Aksan rengi yoksa GRİ dönmüyoruz: koyu grafit bir varsayılan var. Gri bir
 * afiş "renk seçilmemiş" demez, "özensiz" der.
 *
 * Saf modül: canvas yok, tarayıcı yok. Renk matematiği burada, boyama
 * `client/src/lib/renkLayoutRender.ts` içinde.
 */

export type SceneVariant = "panel" | "glow" | "sweep";

export type Rgb = { r: number; g: number; b: number };

/** Aksan rengi hiç girilmemiş seride afişin zemini — koyu grafit. */
export const DEFAULT_ACCENT = "#2b2b33";

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#c2185b" | "c2185b" | "#c15" → {r,g,b}; tanınmayan girdi null. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const raw = m[1];
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map(c => c + c)
          .join("")
      : raw;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** İki rengi karıştırır; t=0 → a, t=1 → b. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

export function rgba(c: Rgb, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;
}

const BLACK: Rgb = { r: 8, g: 8, b: 11 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Afişin renk rampası — tek aksandan dört durak.
 *
 * `deep` en dip (üst kenar ve köşeler), `body` gövde, `lift` ışığın vurduğu
 * yer, `spark` en parlak nokta. Dördü de aynı renkten türediği için sahne
 * "renkli gradyan" değil, TEK RENGİN ışığı gibi okunuyor.
 *
 * Aksan çok açıksa (beyaza yakın sarı gibi) doğrudan kullanmak zemini
 * okunamaz yapardı — yazı beyaz. Bu yüzden gövde her hâlükârda karartılıyor.
 */
export function sceneRamp(accent: string | null | undefined): {
  deep: string;
  body: string;
  lift: string;
  spark: string;
  base: Rgb;
} {
  const base = parseHex(accent) ?? parseHex(DEFAULT_ACCENT)!;
  return {
    deep: toHex(mix(base, BLACK, 0.86)),
    body: toHex(mix(base, BLACK, 0.62)),
    lift: toHex(mix(base, BLACK, 0.24)),
    spark: toHex(mix(base, WHITE, 0.3)),
    base,
  };
}

/**
 * Sahne katmanının tarifi — çiziciye ne yapacağını söyleyen saf veri.
 *
 * Çizici bunu okuyup canvas'a uyguluyor; hangi durağın nereye düşeceği kararı
 * burada, test edilebilir yerde duruyor.
 */
export type SceneRecipe = {
  /** Dikey ana gradyanın durakları: [oran, renk]. */
  stops: Array<[number, string]>;
  /** Radyal ışık — yoksa null. */
  glow: { x: number; y: number; radius: number; color: string; edge: string } | null;
  /** Açılı panel — yoksa null. Noktalar kutu oranında (0..1). */
  panel: { points: Array<[number, number]>; color: string } | null;
  /** Kenar karartması (vinyet) gücü, 0..1. */
  vignette: number;
};

/**
 * Sahne tarifi.
 *
 * `panel` afişin omurgası: sağ üstten sola inen geniş bir ışık paneli, altta
 * yazının oturacağı koyu alanı bırakıyor. `glow` objenin arkasına konan halo —
 * knockout edilmiş obje zeminde yüzerken arkasında ışık olmazsa yapıştırılmış
 * görünüyor. `sweep` ise geniş bantlarda (1920×600) çalışan yatay hâli:
 * o oranda açılı panel kadrajın yarısını yiyor.
 */
export function sceneRecipe(
  variant: SceneVariant,
  accent: string | null | undefined,
): SceneRecipe {
  const c = sceneRamp(accent);
  if (variant === "glow") {
    return {
      stops: [],
      glow: { x: 0.5, y: 0.42, radius: 0.62, color: rgba(c.base, 0.5), edge: rgba(c.base, 0) },
      panel: null,
      vignette: 0,
    };
  }
  if (variant === "sweep") {
    return {
      stops: [
        [0, c.body],
        [0.55, c.deep],
        [1, c.deep],
      ],
      glow: { x: 0.72, y: 0.4, radius: 0.55, color: rgba(c.base, 0.42), edge: rgba(c.base, 0) },
      panel: {
        // Yatay bantta panel soldan sağa yükselen ince bir dilim.
        points: [
          [0, 1],
          [0.62, 0.12],
          [0.86, 0.12],
          [0.3, 1],
        ],
        color: rgba(parseHex(c.lift)!, 0.35),
      },
      vignette: 0.4,
    };
  }
  return {
    stops: [
      [0, c.body],
      [0.48, c.deep],
      [1, c.deep],
    ],
    glow: { x: 0.5, y: 0.34, radius: 0.6, color: rgba(c.base, 0.45), edge: rgba(c.base, 0) },
    panel: {
      // Sağ üstten sola inen geniş panel; alt üçte bir yazı için koyu kalıyor.
      points: [
        [1, 0],
        [1, 0.46],
        [0, 0.72],
        [0, 0.2],
      ],
      color: rgba(parseHex(c.lift)!, 0.32),
    },
    vignette: 0.55,
  };
}
