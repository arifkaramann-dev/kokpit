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
 * Banner'ın ilk hâli "çiğ" görünüyordu: koyu zeminde beyaz fonlu kareler,
 * boş slogan alanı ve yanlış marka hattı. Bunlar tasarım tercihi değil,
 * düzeltilmiş hatalar — regresyona karşı bağlanıyor.
 */
describe("banner yerleşimi", () => {
  const banner = defaultLayout("banner");
  const hero = banner.layers.find(l => l.id.startsWith("hero"));
  const palette = banner.layers.find(l => l.type === "palette");
  const backdrop = banner.layers.find(l => l.id.startsWith("arkaplan"));

  it("koyu zeminde çizilen görsellerin fonu silinir", () => {
    expect(hero?.type).toBe("image");
    expect(hero && "knockout" in hero && hero.knockout).toBe(true);
    expect(palette && "knockout" in palette && palette.knockout).toBe(true);
  });

  it("palet kod yazmaz — banner'ın konusu seri, renk listesi değil", () => {
    expect(palette && "showCode" in palette && palette.showCode).toBe(false);
  });

  it("AI arka plan katmanı hazır ama kapalı gelir", () => {
    // Varlığa bağlanmadan görünür olsaydı her banner boş bir katman taşırdı.
    expect(backdrop?.visible).toBe(false);
  });

  it("dört ölçünün de kendi tarifi var ve oranları doğru", () => {
    expect([defaultLayout("banner").width, defaultLayout("banner").height]).toEqual([1080, 1080]);
    expect([defaultLayout("bannerWide").width, defaultLayout("bannerWide").height]).toEqual([1200, 628]);
    expect([defaultLayout("bannerHero").width, defaultLayout("bannerHero").height]).toEqual([1920, 600]);
    expect([defaultLayout("bannerStory").width, defaultLayout("bannerStory").height]).toEqual([1080, 1920]);
  });

  it("geniş formatta metin kutusu karenin yarısını geçmez", () => {
    const wide = defaultLayout("bannerHero");
    const slogan = wide.layers.find(l => l.id.startsWith("slogan"));
    expect(slogan?.box.w).toBeLessThan(0.5);
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
