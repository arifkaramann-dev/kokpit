import { describe, expect, it } from "vitest";
import {
  flattenCategories,
  searchCategories,
  suggestCategory,
  suggestForUseCases,
  type FlatCategory,
} from "./categorySuggest";

const trendyolTree = {
  categories: [
    {
      id: 1,
      name: "Hobi & Sanat",
      subCategories: [
        {
          id: 10,
          name: "Boya Malzemeleri",
          subCategories: [
            { id: 100, name: "Airbrush Boyası", subCategories: [] },
            { id: 101, name: "Maket Boyası", subCategories: [] },
          ],
        },
        { id: 11, name: "3D Yazıcı Malzemeleri", subCategories: [] },
      ],
    },
    {
      id: 2,
      name: "Otomotiv",
      subCategories: [{ id: 20, name: "Oto Rötuş Boyası", subCategories: [] }],
    },
  ],
};

describe("flattenCategories", () => {
  it("ağacı yol bilgisiyle düzleştirir", () => {
    const flat = flattenCategories(trendyolTree);
    const airbrush = flat.find(c => c.id === "100");
    expect(airbrush).toMatchObject({
      name: "Airbrush Boyası",
      path: "Hobi & Sanat > Boya Malzemeleri > Airbrush Boyası",
      isLeaf: true,
    });
  });

  it("ara düğümü yaprak saymaz", () => {
    const flat = flattenCategories(trendyolTree);
    expect(flat.find(c => c.id === "10")?.isLeaf).toBe(false);
  });

  it("düz dizi yanıtını da kabul eder", () => {
    const flat = flattenCategories([{ id: 5, name: "Boya" }]);
    expect(flat).toHaveLength(1);
  });

  it("HB'nin children alanını da okur", () => {
    const flat = flattenCategories([
      { id: 1, name: "Kök", children: [{ id: 2, name: "Yaprak" }] },
    ]);
    expect(flat.map(c => c.id)).toEqual(["1", "2"]);
    expect(flat[1].isLeaf).toBe(true);
  });

  it("kimliksiz düğüm atlanır", () => {
    expect(flattenCategories([{ name: "Kimliksiz" }])).toEqual([]);
  });

  it("boş yanıt boş liste döner", () => {
    expect(flattenCategories(null)).toEqual([]);
    expect(flattenCategories({})).toEqual([]);
  });
});

describe("searchCategories", () => {
  const flat = flattenCategories(trendyolTree);

  it("ada göre bulur", () => {
    const hits = searchCategories(flat, "airbrush");
    expect(hits[0].id).toBe("100");
  });

  it("Türkçe karakter farkını yok sayar", () => {
    expect(searchCategories(flat, "BOYASI").length).toBeGreaterThan(0);
    expect(searchCategories(flat, "rötuş")[0].id).toBe("20");
  });

  it("tüm terimler geçmeli — gürültü elenir", () => {
    expect(searchCategories(flat, "airbrush otomotiv")).toEqual([]);
  });

  it("boş arama yaprakları döner", () => {
    const hits = searchCategories(flat, "");
    expect(hits.every(c => c.isLeaf)).toBe(true);
  });

  it("sınırı uygular", () => {
    expect(searchCategories(flat, "boya", 1)).toHaveLength(1);
  });
});

describe("suggestCategory", () => {
  const categories = flattenCategories(trendyolTree);

  it("3D kullanım alanını 3D kategorisine önerir", () => {
    const s = suggestCategory({ useCaseName: "3D Baskı", categories });
    expect(s[0].categoryId).toBe("11");
  });

  it("otomotiv kullanım alanını rötuş kategorisine önerir", () => {
    const s = suggestCategory({ useCaseName: "Otomotiv", categories });
    expect(s[0].categoryId).toBe("20");
  });

  it("maket kullanım alanını maket boyasına önerir", () => {
    const s = suggestCategory({ useCaseName: "Maket", categories });
    expect(s[0].categoryId).toBe("101");
  });

  it("yalnız yaprak önerir — ara düğüme ürün açılamaz", () => {
    const s = suggestCategory({ useCaseName: "Boya", categories, minScore: 0 });
    expect(s.every(x => x.categoryId !== "10")).toBe(true);
  });

  it("eşik altı öneri döndürmez — yanlış kategori kartı düşürür", () => {
    const s = suggestCategory({ useCaseName: "Zzzz Alakasız", categories });
    expect(s).toEqual([]);
  });

  it("ek terimler eşleşmeyi güçlendirir", () => {
    const s = suggestCategory({
      useCaseName: "Genel",
      categories,
      extraTerms: ["airbrush"],
    });
    expect(s[0].categoryId).toBe("100");
  });

  it("puan 0-1 aralığında kalır", () => {
    const s = suggestCategory({ useCaseName: "Airbrush Boyası", categories, minScore: 0 });
    expect(s.every(x => x.score > 0 && x.score <= 1)).toBe(true);
  });
});

describe("suggestForUseCases", () => {
  it("her kullanım alanı için ayrı öneri üretir", () => {
    const rows = suggestForUseCases({
      useCases: [
        { id: 1, name: "3D Baskı" },
        { id: 2, name: "Otomotiv" },
      ],
      categories: flattenCategories(trendyolTree),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].suggestions[0].categoryId).toBe("11");
    expect(rows[1].suggestions[0].categoryId).toBe("20");
  });

  it("kategori yoksa boş öneri döner", () => {
    const rows = suggestForUseCases({
      useCases: [{ id: 1, name: "3D Baskı" }],
      categories: [] as FlatCategory[],
    });
    expect(rows[0].suggestions).toEqual([]);
  });
});
