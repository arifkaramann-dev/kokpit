import { describe, expect, it } from "vitest";
import { BANNER_FORBIDDEN_TOKENS, FAMILIES, FAMILY_IDS, checkLayout } from "./families";
import { RETIRED_TEMPLATE_IDS, defaultLayout } from "./layoutDefaults";
import { newLayerId, type TemplateLayout } from "./layout";
import { DEFAULT_ACCENT, mix, parseHex, sceneRamp, sceneRecipe, toHex } from "./scene";

/**
 * Şablonlar üç düz kutu değil, üç AİLE: pazarlama sattırır, tanıtım anlatır,
 * banner durdurur. Kuralları birbirinin zıddı ve aynı listede durdukları
 * sürece birbirine karışıyorlardı — afişe madde listesi, renk çipi ve kimlik
 * bloğu tam bu yüzden sızdı. Sözleşme burada bağlanıyor.
 */

/** Şablon kimliği → ailesi. `renkTemplates` istemci tarafında; eşleşme burada. */
const AILE: Record<string, "pazarlama" | "tanitim" | "banner"> = {
  marketplace: "pazarlama",
  product: "pazarlama",
  card: "pazarlama",
  story: "pazarlama",
  announce: "pazarlama",
  system: "tanitim",
  usage: "tanitim",
  palette: "tanitim",
  beforeafter: "tanitim",
  banner: "banner",
  bannerWide: "banner",
  bannerHero: "banner",
  bannerStory: "banner",
};

describe("aile sözleşmeleri", () => {
  it("her fabrika yerleşimi kendi ailesinin sözleşmesine uyar", () => {
    for (const [id, aile] of Object.entries(AILE)) {
      expect({ id, sorun: checkLayout(defaultLayout(id), aile) }).toEqual({ id, sorun: [] });
    }
  });

  it("üç ailenin zemini de birbirinden farklı", () => {
    const zeminler = FAMILY_IDS.map(f => FAMILIES[f].background);
    expect(new Set(zeminler).size).toBe(3);
  });

  it("pazarlama karesinin zemini SAF beyaz olmak zorunda", () => {
    // Pazaryeri ana görselinde gri fon reddediliyor; kural aileyi bağlıyor.
    const kirli: TemplateLayout = { ...defaultLayout("product"), background: "#fbfbfc" };
    expect(checkLayout(kirli, "pazarlama")).toContain("Pazarlama ailesinde zemin saf beyaz olmalı");
  });

  it("afişe palet çipi eklenemez", () => {
    const layout = defaultLayout("banner");
    const bozuk: TemplateLayout = {
      ...layout,
      layers: [
        ...layout.layers,
        {
          id: newLayerId("palet"),
          type: "palette",
          box: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 },
          columns: 0,
          gap: 0.01,
          showCode: false,
          labelSize: 0.02,
          labelColor: "#fff",
          visible: true,
        },
      ],
    };
    expect(checkLayout(bozuk, "banner")).toContain(
      'Banner ailesinde "palette" katmanı kullanılamaz',
    );
  });

  it("afişe madde listesi ve kimlik bloğu eklenemez", () => {
    const layout = defaultLayout("banner");
    for (const token of ["{madde1}", "{code}", "{packSizes}"]) {
      const bozuk: TemplateLayout = {
        ...layout,
        layers: [
          ...layout.layers,
          {
            id: newLayerId("kacak"),
            type: "text",
            box: { x: 0.1, y: 0.1, w: 0.5, h: 0.05 },
            text: token,
            size: 0.02,
            weight: 400,
            color: "#fff",
            align: "left",
            transform: "none",
            visible: true,
          },
        ],
      };
      expect(checkLayout(bozuk, "banner").join(" ")).toContain(token);
    }
  });

  it("yasak listesi afişte gerçekten kullanılan yer tutucuları KAPSAMAZ", () => {
    // {line}, {renkSayisi}, {slogan}, {site} afişin taşıyıcıları; yasaklanmış
    // olsalardı sözleşme kendi şablonunu reddederdi.
    for (const t of ["{line}", "{renkSayisi}", "{slogan}", "{site}"]) {
      expect(BANNER_FORBIDDEN_TOKENS).not.toContain(t);
    }
  });

  it("afiş zeminsiz kalamaz — sahne katmanı zorunlu", () => {
    const layout = defaultLayout("banner");
    const zeminsiz: TemplateLayout = {
      ...layout,
      layers: layout.layers.filter(l => l.type !== "scene"),
    };
    expect(checkLayout(zeminsiz, "banner")).toContain(
      "Afişin zemini çizilmiş sahne olmalı — scene katmanı yok",
    );
  });

  it("kimlik bloğu YALNIZ afişte kapalı", () => {
    expect(FAMILIES.banner.identityBlock).toBe(false);
    expect(FAMILIES.pazarlama.identityBlock).toBe(true);
    expect(FAMILIES.tanitim.identityBlock).toBe(true);
  });
});

/**
 * Fazlalıkların silinmesi işin YARISI: `social` kartın birebir kopyasıydı,
 * `range` ürün karesinin zaten yazdığı bilgiyi tekrar ediyordu, `coats` ise
 * kat sistemi şemasının içindeki üç kareydi. Geri sızmalarını engelliyoruz.
 */
describe("kaldırılan şablonlar", () => {
  it("kaldırılan kimlikler artık bir aileye ait değil", () => {
    for (const id of RETIRED_TEMPLATE_IDS) {
      expect(AILE[id]).toBeUndefined();
    }
  });

  it("kart tek tarif, iki ölçü — kare ve dikey", () => {
    expect([defaultLayout("card").width, defaultLayout("card").height]).toEqual([1080, 1080]);
    expect([defaultLayout("story").width, defaultLayout("story").height]).toEqual([1080, 1920]);
  });

  it("dikey kartta obje kadrajı DOLDURUR — 9:16'da contain yarısını boş bırakıyordu", () => {
    const kare = defaultLayout("card").layers.find(l => l.id.startsWith("obj"));
    const dikey = defaultLayout("story").layers.find(l => l.id.startsWith("obj"));
    expect(kare?.type === "image" && kare.fit).toBe("contain");
    expect(dikey?.type === "image" && dikey.fit).toBe("cover");
  });

  it("ambalaj gamı ürün karesine taşındı — ayrı kare kalmadı", () => {
    const urun = defaultLayout("product");
    expect(urun.layers.some(l => l.type === "image" && l.source === "pack1")).toBe(true);
    // Gam görsel olarak gösterildiği için yazılı boy listesi tekrar değil,
    // gereksiz: iki kez aynı cevap.
    expect(urun.layers.some(l => l.type === "text" && l.text.includes("{packSizes}"))).toBe(false);
  });

  it("kat aşama kareleri kat sistemi şemasının içinde", () => {
    const sistem = defaultLayout("system");
    expect(sistem.layers.some(l => l.type === "image" && l.source === "coat1")).toBe(true);
  });
});

/**
 * Afişin zemini artık fotoğraf beklemiyor, koddan çiziliyor. Bütün derinlik
 * TEK renkten türüyor — bu yüzden rampanın doğru sıralanması afişin kendisi
 * kadar önemli.
 */
describe("çizilen sahne", () => {
  it("hex'i her biçimde okur, tanımadığını uydurmaz", () => {
    expect(parseHex("#c2185b")).toEqual({ r: 194, g: 24, b: 91 });
    expect(parseHex("c2185b")).toEqual({ r: 194, g: 24, b: 91 });
    expect(parseHex("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHex("mor")).toBeNull();
    expect(parseHex(null)).toBeNull();
  });

  it("rampa dipten parlağa doğru sıralı", () => {
    const r = sceneRamp("#5b21b6");
    const parlaklik = (hex: string) => {
      const c = parseHex(hex)!;
      return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    };
    expect(parlaklik(r.deep)).toBeLessThan(parlaklik(r.body));
    expect(parlaklik(r.body)).toBeLessThan(parlaklik(r.lift));
    expect(parlaklik(r.lift)).toBeLessThan(parlaklik(r.spark));
  });

  it("aksan rengi yoksa GRİ değil, koyu grafit döner", () => {
    // Renksiz bir afiş "seçilmemiş" değil "özensiz" görünüyor.
    expect(sceneRamp(null)).toEqual(sceneRamp(DEFAULT_ACCENT));
    expect(sceneRamp("saçma girdi")).toEqual(sceneRamp(DEFAULT_ACCENT));
  });

  it("çok açık aksan bile KARARTILIR — üstüne beyaz yazı basılıyor", () => {
    const acik = sceneRamp("#fff8b0");
    const govde = parseHex(acik.body)!;
    expect(0.2126 * govde.r + 0.7152 * govde.g + 0.0722 * govde.b).toBeLessThan(140);
  });

  it("farklı seri farklı zemin — afiş serinin kimliğini taşıyor", () => {
    expect(sceneRamp("#5b21b6").body).not.toBe(sceneRamp("#3f3f46").body);
  });

  it("geniş bantta yatay tarif kullanılıyor — açılı panel kadrajın yarısını yerdi", () => {
    const panel = sceneRecipe("panel", "#5b21b6");
    const sweep = sceneRecipe("sweep", "#5b21b6");
    expect(panel.panel?.points).not.toEqual(sweep.panel?.points);
  });

  it("halo tek başına zemin boyamaz — objenin arkasındaki ışık", () => {
    const glow = sceneRecipe("glow", "#5b21b6");
    expect(glow.stops).toHaveLength(0);
    expect(glow.glow).not.toBeNull();
    expect(glow.vignette).toBe(0);
  });

  it("renk karışımı uçlarda kendini korur", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(toHex(mix(a, b, 0))).toBe("#000000");
    expect(toHex(mix(a, b, 1))).toBe("#ffffff");
    // Sınır dışı oran kırpılıyor: taşan bir değer rengi ters çevirirdi.
    expect(toHex(mix(a, b, 2))).toBe("#ffffff");
    expect(toHex(mix(a, b, -1))).toBe("#000000");
  });
});
