/**
 * Pazarlama kartlarının üretimi — yerleşim tarifinden.
 *
 * Girdi: bir obje görseli + rengin bilgileri. Çıktı: altı kare.
 *
 * Görseller BİR KEZ hazırlanıp bütün şablonlarda tekrar kullanılıyor. Her
 * şablon için ambalajı yeniden indirmek ya da kat karelerini yeniden
 * hesaplamak, altı katı iş demekti — ve kat kareleri yeniden hesaplanınca
 * şablonlar arasında ufak farklar oluşabilirdi.
 */

import { renderCoat } from "@shared/color/candy";
import { coatSystemTokens, defaultCoatSystem } from "@shared/color/coatSystem";
import { hexToLab, type Lab } from "@shared/color/color";
import {
  assetIdOf,
  resolveWatermark,
  usesPalette,
  type ImageSource,
  type LayerBox,
  type TemplateLayout,
  type TokenValues,
  type Watermark,
} from "@shared/color/layout";
import { defaultLayout, usageBoxes } from "@shared/color/layoutDefaults";
import type { Raster } from "@shared/color/recolor";
import { extractSubjectMask, measureSubjectLab } from "@shared/color/subject";
import { renderLayoutToDataUrl, type LayerImages } from "./renkLayoutRender";
import {
  BRAND,
  PACK_SIZES,
  TEMPLATES,
  fallbackPackaging,
  forceWhiteBackground,
  getSeries,
  loadImageSrc,
  type PaintInfo,
} from "./renkTemplates";

export type CardOutput = { id: string; label: string; data: string };

export type BuildCardsInput = {
  /** AI'den gelen obje görseli (data URL). */
  objectImage: string;
  /** Gümüş metalik baz — yalnız kat progresyonu kullanır. */
  baseImage?: string | null;
  paint: PaintInfo;
  /** Kullanıcının düzenlediği yerleşimler; olmayan şablon fabrika tarifiyle çizilir. */
  layouts?: Record<string, TemplateLayout>;
  /**
   * Yalnız bu şablonlar üretilsin. Verilmezse hepsi.
   *
   * İstemeyen kareyi de basmak boşa iş: her kare ayrı bir canvas turu ve
   * kullanıcı zaten hangi kareyi istediğini biliyor.
   */
  only?: string[];
};

/** Katman metinlerinin dolduracağı değerler. */
export function tokenValues(paint: PaintInfo): TokenValues {
  const series = getSeries(paint.seriesCode);
  // Gam Tanımlar'dan gelir; hiç ambalaj tanımı yoksa koda gömülü yedek listeye
  // düşülür — kartta boş bir gam satırı, eskimiş bir listeden daha kötüdür.
  const range = paint.packRange?.length ? paint.packRange.map(p => p.label) : PACK_SIZES;
  return {
    code: paint.code ?? "",
    nameTr: paint.nameTr ?? "",
    nameEn: paint.nameEn ?? "",
    series: paint.seriesLine?.trim() || series.label,
    // Marka hattı ÜRÜNÜN serisinden; efekt sıfatı bitiş türünden.
    line: paint.seriesLine?.trim() || series.line,
    effect: series.effect,
    packaging: paint.packagingName ?? "",
    volume: paint.volumeLabel ?? "",
    packSizes: range.join("  ·  "),
    pack1: range[0] ?? "",
    pack2: range[1] ?? "",
    pack3: range[2] ?? "",
    pack4: range[3] ?? "",
    brand: BRAND.name,
    site: BRAND.site,
    // Kat sistemi: kayıtlı zincir yoksa seri adından varsayılan türetilir —
    // hiçbir seri kat şemasız kalmasın.
    ...coatSystemTokens(paint.coatSystem?.length ? paint.coatSystem : defaultCoatSystem(series.line)),
    slogan: paint.bannerSlogan ?? "",
    madde1: paint.bannerBullets?.[0] ?? "",
    madde2: paint.bannerBullets?.[1] ?? "",
    madde3: paint.bannerBullets?.[2] ?? "",
    kullanim1: paint.usage?.[0]?.label ?? "",
    kullanim2: paint.usage?.[1]?.label ?? "",
    kullanim3: paint.usage?.[2]?.label ?? "",
    kullanim4: paint.usage?.[3]?.label ?? "",
  };
}

function toRaster(img: HTMLImageElement | HTMLCanvasElement) {
  const w = "naturalWidth" in img ? img.naturalWidth || img.width : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight || img.height : img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const raster: Raster = { data: image.data, width: image.width, height: image.height };
  return { raster, mask: extractSubjectMask(raster).mask };
}

function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");
  const img = ctx.createImageData(r.width, r.height);
  img.data.set(r.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Kat karelerini gümüş bazdan üretir.
 *
 * Gümüş baz ya da hedef renk yoksa BOŞ döner: uydurma bir progresyon basmak,
 * müşteriye yanlış bilgi vermektir. Kartta o katmanlar çizilmez.
 */
function buildCoats(base: HTMLImageElement, targetLab: Lab | null): LayerImages {
  if (!targetLab) return {};
  const { raster, mask } = toRaster(forceWhiteBackground(base).canvas);
  const baseLab = measureSubjectLab(raster, mask);
  if (!baseLab) return {};
  return {
    coat1: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 1, { totalCoats: 3 })),
    coat2: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 2, { totalCoats: 3 })),
    coat3: rasterToCanvas(renderCoat(raster, mask, baseLab, targetLab, 3, { totalCoats: 3 })),
  };
}

/**
 * Yerleşimlerde geçen kullanıcı varlıklarını yükler.
 *
 * Tek tek değil topluca: aynı ambalaj birden çok şablonda kullanılıyorsa
 * bir kez indirilsin. Yüklenemeyen varlık atlanıyor — kart o katman olmadan
 * çizilir, hiç çizilmemesinden iyidir.
 */
async function loadAssets(layouts: TemplateLayout[]): Promise<LayerImages> {
  const ids = new Set<number>();
  for (const l of layouts) {
    for (const layer of l.layers) {
      if (layer.type !== "image") continue;
      const id = assetIdOf(layer.source);
      if (id) ids.add(id);
    }
  }
  const out: LayerImages = {};
  for (const id of Array.from(ids)) {
    try {
      out[`asset:${id}`] = await loadImageSrc(`/api/img/sample/${id}`);
    } catch (err) {
      console.warn("[renkCards] varlık yüklenemedi:", id, err);
    }
  }
  return out;
}

/**
 * Kolaj kutularını gerçek kare sayısına oturtur.
 *
 * Kullanıcı yerleşimi elle düzenlediyse ona DOKUNULMAZ: kutular yalnız
 * fabrika ölçüsündeyken yeniden hesaplanıyor. Aksi halde birinin taşıdığı
 * kutu her üretimde geri yerine kaçardı.
 */
function fitUsageBoxes(layout: TemplateLayout, count: number): TemplateLayout {
  const target = usageBoxes(count);
  const factory = usageBoxes(4);
  const same = (a: LayerBox, b: LayerBox) =>
    Math.abs(a.x - b.x) < 1e-6 &&
    Math.abs(a.y - b.y) < 1e-6 &&
    Math.abs(a.w - b.w) < 1e-6 &&
    Math.abs(a.h - b.h) < 1e-6;

  const slotOf = (id: string) => {
    const m = id.match(/^(?:use|uselbl)(\d)/);
    return m ? Number(m[1]) - 1 : -1;
  };

  const layers = layout.layers.map(layer => {
    const slot = slotOf(layer.id);
    if (slot < 0) return layer;
    // Yeri değiştirilmiş kutuya dokunma.
    if (layer.type === "image" && !same(layer.box, factory[slot])) return layer;
    const box = target[slot];
    // Kolaja sığmayan kareler gizleniyor: üç kare varken dördüncü etiket
    // havada kalmasın.
    if (!box) return { ...layer, visible: false };
    return layer.type === "image"
      ? { ...layer, box }
      : { ...layer, box: { x: box.x, y: box.y + box.h + 0.008, w: box.w, h: 0.03 } };
  });
  return { ...layout, layers };
}

/** Bir şablonun kullandığı görsel kaynakları. */
function usedSources(layout: TemplateLayout): Set<ImageSource> {
  const out = new Set<ImageSource>();
  for (const l of layout.layers) if (l.type === "image" && l.visible) out.add(l.source);
  return out;
}

export async function buildCards({
  objectImage,
  baseImage,
  paint,
  layouts = {},
  only,
}: BuildCardsInput): Promise<CardOutput[]> {
  const wanted = only?.length ? TEMPLATES.filter(t => only.includes(t.id)) : TEMPLATES;
  const values = tokenValues(paint);
  const targetLab = paint.hex ? hexToLab(paint.hex) : null;

  // Yerleşimler ÖNCE çözülüyor: hangi görsellerin indirilmesi gerektiği
  // yerleşimde yazıyor. Kullanıcı yalnız "Instagram gönderi"yi istediğinde
  // dört gam kutusunu indirmek boşa bir ağ turu.
  const resolved = wanted.map(t => layouts[t.id] ?? defaultLayout(t.id));
  const needed = new Set<ImageSource>();
  for (const layout of resolved) usedSources(layout).forEach(s => needed.add(s));

  // Filigran da logoyu kullanıyor ama bir KATMAN değil; `usedSources` onu
  // göremez. Logosuz kalırsa kare sessizce korumasız çıkardı.
  const watermarks: Array<Watermark | null> = wanted.map((t, i) =>
    resolveWatermark(resolved[i], { bare: t.bare }),
  );
  if (watermarks.some(Boolean)) needed.add("logo");

  const obj = await loadImageSrc(objectImage);

  // Ambalaj ve logo isteğe bağlı: yüklenemezse kart o katman olmadan çizilir,
  // hiç üretilmemesinden iyidir. Sessiz kalmasın diye uyarı basılıyor.
  //
  // Kaynak sırası: ürünün ambalajına yüklenmiş ÇEKİM → yerleşik yedek görsel.
  // Tanımlar'daki çekim her zaman kazanır; kullanıcının kendi kutusu, bizim
  // örnek kutumuzun önüne geçmeli.
  // Kaynak sırası: ürünün ambalajına yüklenmiş ÇEKİM → aynı HACİMDEKİ yerleşik
  // yedek → hiçbiri. Yedek hacimle seçiliyor: 100 ml'lik ürüne 400 ml sprey
  // basmak müşteriye yanlış ürünü göstermekti.
  let packaging: HTMLImageElement | null = null;
  if (needed.has("packaging")) {
    const src =
      paint.packagingSrc ||
      fallbackPackaging(paint.volumeMl, getSeries(paint.seriesCode).line)?.src ||
      null;
    if (src) {
      try {
        packaging = await loadImageSrc(src);
      } catch (err) {
        console.warn("[renkCards] ambalaj yüklenemedi:", err);
      }
    }
  }

  // Ambalaj gamı — `pack1..pack4`. Çekimi olmayan boy atlanıyor; etiketi
  // (`{pack2}`) yine yazılabilir, yalnız görsel katmanı boş kalır.
  const packRange: LayerImages = {};
  const rangeSlots = ["pack1", "pack2", "pack3", "pack4"] as const;
  for (let i = 0; i < rangeSlots.length; i += 1) {
    const slot = rangeSlots[i];
    const src = paint.packRange?.[i]?.src;
    if (!src || !needed.has(slot)) continue;
    try {
      packRange[slot] = await loadImageSrc(src);
    } catch (err) {
      console.warn("[renkCards] gam ambalajı yüklenemedi:", src, err);
    }
  }

  // Kullanım alanı kareleri — `use1..use4`. Kaçı yüklenirse kolaj ona göre
  // diziliyor; yüklenemeyen kare sessizce düşüyor ve ızgara yeniden hesaplanıyor.
  const usageImages: LayerImages = {};
  const usageSlots = ["use1", "use2", "use3", "use4"] as const;
  for (let i = 0; i < usageSlots.length; i += 1) {
    const slot = usageSlots[i];
    const src = paint.usage?.[i]?.src;
    if (!src || !needed.has(slot)) continue;
    try {
      usageImages[slot] = await loadImageSrc(src);
    } catch (err) {
      console.warn("[renkCards] kullanım karesi yüklenemedi:", src, err);
    }
  }

  let logo: HTMLImageElement | null = null;
  if (needed.has("logo")) {
    try {
      logo = await loadImageSrc(BRAND.logoDark);
    } catch (err) {
      console.warn("[renkCards] logo yüklenemedi:", err);
    }
  }

  let coats: LayerImages = {};
  if (baseImage && needed.has("coat1")) {
    try {
      coats = buildCoats(await loadImageSrc(baseImage), targetLab);
    } catch (err) {
      console.warn("[renkCards] kat progresyonu üretilemedi:", err);
    }
  }

  // Palet kareleri: renk başına bir görsel, kod anahtarıyla. Yalnız palet
  // çizen bir şablon seçiliyse indiriliyor — otuz kare, otuz istek demek.
  const paletteImages: Record<string, HTMLImageElement> = {};
  if (resolved.some(usesPalette)) {
    for (const entry of paint.palette ?? []) {
      if (!entry.src || !entry.code) continue;
      try {
        paletteImages[entry.code] = await loadImageSrc(entry.src);
      } catch (err) {
        console.warn("[renkCards] palet karesi yüklenemedi:", entry.code, err);
      }
    }
  }

  const assets = await loadAssets(resolved);
  const images: LayerImages = {
    object: obj,
    packaging,
    logo,
    ...packRange,
    ...coats,
    ...usageImages,
    ...assets,
  };

  const out: CardOutput[] = [];
  for (let i = 0; i < wanted.length; i += 1) {
    const tpl = wanted[i];
    const layout = resolved[i];
    // Kat kareleri yoksa o şablon yalnız başlık ve marka ile çıkardı; boş
    // kare basmak yerine atlanıyor ve sebebi çağıran tarafa bırakılıyor.
    const sources = usedSources(layout);
    if (sources.has("coat1") && !coats.coat1) continue;
    // Ambalaj gamı şablonu, gam çekimleri yüklenmeden yalnız etiketlerden
    // oluşan boş bir tablo olurdu. Aynı gerekçe: boş kare basılmaz.
    if (sources.has("pack1") && !packRange.pack1) continue;
    // Palet karesi renk listesi olmadan boş bir ızgara olurdu.
    if (usesPalette(layout) && !paint.palette?.length) continue;
    /*
     * Banner sloganı yoksa kare basılmaz.
     *
     * Slogan ve maddeler karenin YARISI: onlarsız geriye seri adı ve boş bir
     * zemin kalıyor, "tasarlanmış" değil "yarım kalmış" bir reklam görüntüsü
     * çıkıyordu. Aynı kural kat/gam/palet şablonlarında da geçerli — eksik
     * veriyle boş kare basmıyoruz, kullanıcı sebebini ekranda görüyor.
     */
    if (tpl.kind === "banner" && !paint.bannerSlogan?.trim()) continue;

    /*
     * Kolaj: kutular ELDEKİ kare sayısına göre yeniden hesaplanıyor.
     *
     * Yerleşim dört kutuyla kayıtlı ama gerçek kare sayısı ancak burada
     * biliniyor. Sabit ızgarada iki karelik bir renk, yarısı boş bir kare
     * üretiyordu. Hiç kare yoksa şablon atlanıyor — kolajın kendisi yok.
     */
    const usageCount = usageSlots.filter(s => images[s]).length;
    let drawn = layout;
    if (sources.has("use1")) {
      if (usageCount === 0) continue;
      drawn = fitUsageBoxes(layout, usageCount);
    }

    out.push({
      id: tpl.id,
      label: tpl.label,
      data: await renderLayoutToDataUrl({
        layout: drawn,
        values,
        images,
        paintHex: paint.hex,
        palette: paint.palette,
        paletteImages,
        watermark: watermarks[i],
      }),
    });
  }
  return out;
}
