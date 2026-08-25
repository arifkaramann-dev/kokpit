import { describe, expect, it } from "vitest";
import {
  MAX_COAT_LAYERS,
  coatSystemOf,
  coatSystemTokens,
  defaultCoatSystem,
  normalizeCoatSystem,
} from "./coatSystem";
import { defaultLayout } from "./layoutDefaults";
import { suggestColorNameEn } from "../colorNames";
import { colorLabelOf, effectLabelOf } from "../productName";
import { fillBannerVars } from "../bannerText";

/**
 * Kat sistemi müşterinin en çok sorduğu sorunun cevabı ("nasıl uygulanır").
 * Yanlış zincir basmak, yanlış uygulama anlatmak demek: candy'yi gümüş bazsız
 * uygulayan müşteri rengi hiç göremez.
 */
describe("kat sistemi", () => {
  it("CANDY gümüş bazla başlar, vernikle biter", () => {
    const chain = defaultCoatSystem("CANDY");
    expect(chain).toHaveLength(3);
    expect(chain[0].label).toContain("Gümüş");
    expect(chain[2].label).toContain("Vernik");
  });

  it("METEOR siyah zeminle başlar", () => {
    expect(defaultCoatSystem("METEOR")[0].label).toContain("Siyah");
  });

  it("örtücü seriler iki kattır", () => {
    expect(defaultCoatSystem("VİVİD")).toHaveLength(2);
  });

  it("astar ve vernik serileri tek halkadır", () => {
    expect(defaultCoatSystem("PRİMER")).toHaveLength(1);
    expect(defaultCoatSystem("GLOSS")).toHaveLength(1);
  });

  it("kayıtlı zincir varsayılanı ezer", () => {
    const own = coatSystemOf({
      name: "CANDY",
      coatSystem: [{ label: "Özel baz" }, { label: "Renk" }],
    });
    expect(own.map(l => l.label)).toEqual(["Özel baz", "Renk"]);
  });

  it("bozuk kayıtta patlamaz, varsayılana düşer", () => {
    expect(normalizeCoatSystem("{bozuk json")).toEqual([]);
    expect(normalizeCoatSystem(null)).toEqual([]);
    expect(coatSystemOf({ name: "CANDY", coatSystem: "{bozuk" })).toHaveLength(3);
  });

  it("metin dizisini de kabul eder ve sınırı aşmaz", () => {
    expect(normalizeCoatSystem(["Astar", "Renk", "", "Vernik"]).map(l => l.label)).toEqual([
      "Astar",
      "Renk",
      "Vernik",
    ]);
    expect(normalizeCoatSystem(["a", "b", "c", "d", "e"])).toHaveLength(MAX_COAT_LAYERS);
  });

  it("ok yalnız halkalar ARASINDA yazılır", () => {
    const t = coatSystemTokens(defaultCoatSystem("VİVİD"));
    // İki katlı seride birinci ok var, ikincisi boş — sarkan ok kalmasın.
    expect(t.ok1).toBe("→");
    expect(t.ok2).toBe("");
    expect(t.katman3).toBe("");
    expect(t.katSayisi).toBe("2 KAT SİSTEM");
  });

  it("ürün adı olan halkada çapraz satış yazısı dolu gelir", () => {
    const t = coatSystemTokens(defaultCoatSystem("CANDY"));
    expect(t.urun1).toContain("ARTOFCOLOUR");
    expect(t.urun3).toContain("GLOSS");
  });
});

/**
 * Renk adı iki dilde yazılıyor: yerli müşteri "fuşya", ihracat alıcısı
 * "magenta" arıyor. Tek dil yazmak diğerini aramada görünmez yapıyordu.
 */
describe("çift dilli renk adı", () => {
  it("iki adı eğik çizgiyle birleştirir — Türkçe önde", () => {
    expect(colorLabelOf({ name: "Fuşya", nameEn: "Magenta" })).toBe("Fuşya / Magenta");
    expect(colorLabelOf({ name: "Fuşya", nameEn: "Magenta" }, { upper: true })).toBe(
      "FUŞYA / MAGENTA",
    );
  });

  it("tek ad varsa sarkan ayraç bırakmaz", () => {
    expect(colorLabelOf({ name: "Fuşya" })).toBe("Fuşya");
    expect(colorLabelOf({ nameEn: "Magenta" })).toBe("Magenta");
    expect(colorLabelOf(null)).toBe("");
  });

  it("iki ad aynıysa kendini tekrar etmez", () => {
    expect(colorLabelOf({ name: "Amber", nameEn: "amber" })).toBe("Amber");
  });

  it("sözlükten karşılık önerir", () => {
    expect(suggestColorNameEn("Fuşya")).toBe("Magenta");
    expect(suggestColorNameEn("Bordo")).toBe("Maroon");
    expect(suggestColorNameEn("Füme")).toBe("Smoke");
    // Türkçe harf kullanmadan yazılmış adlar da eşleşmeli: katalogda "Acikmavi"
    // gibi kayıtlar var.
    expect(suggestColorNameEn("Acikmavi")).toBe("Light Blue");
  });

  it("bileşik adı kelime kelime çevirir", () => {
    expect(suggestColorNameEn("Koyu Yeşil")).toBe("Dark Green");
  });

  it("bilmediği adı UYDURMAZ", () => {
    expect(suggestColorNameEn("Meteor Işıltısı")).toBeNull();
    expect(suggestColorNameEn("")).toBeNull();
  });
});

/**
 * Afişin dört ayrı denemede düzelmeyen kusurları burada bağlanıyor: bunlar
 * tasarım tercihi değil, DÜZELTİLMİŞ HATALAR. Zemin fotoğraf bekleyip hiç
 * gelmiyordu; kimlik bloğu, madde listesi ve çip şeridi afişi kurumsal bir
 * slayta çeviriyordu.
 */
describe("banner yerleşimi", () => {
  const banner = defaultLayout("banner");
  const id = (p: string) => banner.layers.find(l => l.id.startsWith(p));
  const sahne = id("sahne");
  const karartma = id("karartma");

  it("zemin KODDAN çiziliyor — fotoğraf beklemiyor", () => {
    // Önceki hâli varlığa bağlanacak bir fotoğraf katmanı taşıyordu ve o
    // fotoğraf hiç yüklenmedi: afişin zemini hiç olmadı.
    const zemin = id("zemin");
    expect(zemin?.type).toBe("scene");
    expect(zemin?.box).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(zemin && "color" in zemin && zemin.color).toBe("accent");
    expect(banner.layers.some(l => l.type === "image" && l.source.startsWith("asset:"))).toBe(
      false,
    );
  });

  it("objenin arkasında halo var — ışıksız zeminde obje yapıştırılmış görünüyor", () => {
    const halo = id("halo");
    expect(halo?.type === "scene" && halo.variant).toBe("glow");
  });

  it("obje kadrajdan taşar", () => {
    const box = sahne?.box;
    expect(box && (box.x + box.w > 1 || box.y < 0)).toBe(true);
    expect(sahne && "knockout" in sahne && sahne.knockout).toBe(true);
  });

  it("karartma ALT kenardan yükselir — yazı okunsun, sahnenin üstü açık kalsın", () => {
    expect(karartma?.type).toBe("rect");
    expect(karartma && "flip" in karartma && karartma.flip).toBe(true);
    expect(karartma && "gradient" in karartma && karartma.gradient).toBe(true);
  });

  it("afişin taşıyıcısı seri yazısı ve tek iddia — madde listesi yok", () => {
    const seri = id("seri");
    const iddia = id("iddia");
    expect(seri?.type === "text" && seri.text).toBe("{line}");
    expect(iddia?.type === "text" && iddia.text).toBe("{renkSayisi}");
    expect(id("madde1")).toBeUndefined();
    expect(banner.layers.some(l => l.type === "palette")).toBe(false);
  });

  it("ürün kutuları önde — 'bu işi bu ürünle yaptık'", () => {
    const kutu = id("kutu1");
    expect(kutu?.type === "image" && kutu.source).toBe("pack1");
    expect(kutu && "knockout" in kutu && kutu.knockout).toBe(true);
  });

  it("dört ölçünün de kendi tarifi var ve oranları doğru", () => {
    expect([defaultLayout("banner").width, defaultLayout("banner").height]).toEqual([1080, 1080]);
    expect([defaultLayout("bannerWide").width, defaultLayout("bannerWide").height]).toEqual([1200, 628]);
    expect([defaultLayout("bannerHero").width, defaultLayout("bannerHero").height]).toEqual([1920, 600]);
    expect([defaultLayout("bannerStory").width, defaultLayout("bannerStory").height]).toEqual([1080, 1920]);
  });

  it("geniş bantta zemin yatay tarife geçiyor", () => {
    const genis = defaultLayout("bannerHero").layers.find(l => l.id.startsWith("zemin"));
    expect(genis?.type === "scene" && genis.variant).toBe("sweep");
  });
});

/**
 * Kartta "{seri} {efekt}" yazıyor. Efekt rengin `finish` alanından tahmin
 * ediliyor ve varsayılanı "duz"; katalogdaki renklerin çoğunda hiç
 * değiştirilmemiş. Sonuç kartta **CANDY SOLID** oluyordu: candy saydam bir
 * efekt, düz değil — kendi kendini yalanlayan bir etiket.
 */
describe("seri + efekt etiketi", () => {
  it("SOLID hiç yazılmaz — varsayılan değer bilgi katmıyor", () => {
    expect(effectLabelOf("CANDY", "SOLID")).toBe("");
    expect(effectLabelOf("VIVID", "SOLID")).toBe("");
  });

  it("seri adı efekti zaten söylüyorsa tekrar etmez", () => {
    expect(effectLabelOf("CANDY", "CANDY")).toBe("");
    expect(effectLabelOf("METEOR", "METEOR")).toBe("");
  });

  it("bilgi katan efekt korunur — VIVID CANDY gerçek bir hat adı", () => {
    expect(effectLabelOf("VIVID", "CANDY")).toBe("CANDY");
    expect(effectLabelOf("VIVID", "PEARLY")).toBe("PEARLY");
    expect(effectLabelOf("METEOR", "GRADIENT")).toBe("GRADIENT");
  });

  it("seri bilinmiyorsa efekt tek başına yazılır", () => {
    expect(effectLabelOf(null, "PEARLY")).toBe("PEARLY");
    expect(effectLabelOf("CANDY", null)).toBe("");
  });
});

/**
 * İlan metinleri bilerek değişkenli yazılıyor ({{renk}}, {{ambalaj}}); banner
 * ise tek serinin karesi ve değişkeni dolduracak bir yer yok. İki istem
 * karışınca banner'a ham "{{seri}} ile derinlik" basıldı.
 */
describe("banner metni temizliği", () => {
  it("bilinen değişkeni gerçek değeriyle doldurur", () => {
    expect(fillBannerVars("{{seri}} ile derinlik ve canlılık", "CANDY")).toBe(
      "CANDY ile derinlik ve canlılık",
    );
  });

  it("bilinmeyen değişkeni atar ve boşluk bırakmaz", () => {
    expect(fillBannerVars("{{renk}} tonlarında {{ambalaj}} güç", "CANDY")).toBe("tonlarında güç");
  });

  it("temiz metne dokunmaz", () => {
    expect(fillBannerVars("Şeffaf Renklerin Efsanesi", "CANDY")).toBe(
      "Şeffaf Renklerin Efsanesi",
    );
    expect(fillBannerVars(null, "CANDY")).toBe("");
  });
});
