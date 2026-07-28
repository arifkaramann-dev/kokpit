import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  pickBlock,
  planContentBlocks,
  resolveListingContent,
  type ContentBlockLike,
} from "./listingContent";

const block = (p: Partial<ContentBlockLike> = {}): ContentBlockLike => ({
  id: 1,
  seriesId: 10,
  useCaseId: 2,
  familyId: null,
  shortDescription: "{{renk}} tonunda {{kullanim}} boyası",
  longDescription: null,
  applicationText: null,
  labelText: null,
  titlePattern: null,
  ...p,
});

describe("fillTemplate", () => {
  it("değişkenleri doldurur", () => {
    expect(
      fillTemplate("{{renk}} {{kullanim}} Boyası {{ambalaj}}", {
        renk: "Candy Red",
        kullanim: "3D Baskı",
        ambalaj: "100 ML PET",
      }),
    ).toBe("Candy Red 3D Baskı Boyası 100 ML PET");
  });

  it("bilinmeyen değişken boş kalır, çift boşluk temizlenir", () => {
    expect(fillTemplate("{{renk}} {{form}} Boyası", { renk: "Mavi" })).toBe("Mavi Boyası");
  });

  it("değişken boşalınca noktalama yapışır", () => {
    expect(fillTemplate("{{seri}} serisi{{renk}}, dayanıklı", { seri: "CANDY" })).toBe(
      "CANDY serisi, dayanıklı",
    );
  });

  it("boş şablonda boş döner", () => {
    expect(fillTemplate(null, { renk: "Mavi" })).toBe("");
  });
});

describe("pickBlock — en özel blok kazanır", () => {
  const blocks = [
    block({ id: 1, familyId: null }),
    block({ id: 2, familyId: 100 }),
    block({ id: 3, seriesId: 20, familyId: null }),
  ];

  it("forma özel blok geneli yener", () => {
    expect(pickBlock(blocks, { seriesId: 10, useCaseId: 2, familyId: 100 })?.id).toBe(2);
  });

  it("forma özel yoksa genele düşer", () => {
    expect(pickBlock(blocks, { seriesId: 10, useCaseId: 2, familyId: 999 })?.id).toBe(1);
  });

  it("başka serinin bloğunu almaz", () => {
    expect(pickBlock(blocks, { seriesId: 99, useCaseId: 2, familyId: 100 })).toBeNull();
  });

  it("başka kullanım alanının bloğunu almaz", () => {
    expect(pickBlock(blocks, { seriesId: 10, useCaseId: 7, familyId: 100 })).toBeNull();
  });
});

describe("resolveListingContent", () => {
  const series = {
    shortDescription: "{{seri}} serisi profesyonel boya",
    longDescription: "Uzun açıklama",
    applicationText: null,
    labelTemplate: "{{renk}} · {{ambalaj}}",
  };
  const vars = { seri: "CANDY", renk: "Candy Red", kullanim: "3D Baskı", ambalaj: "100 ML PET" };

  it("blok varsa bloktan çözer ve kişiselleştirir", () => {
    const r = resolveListingContent({ block: block(), series, vars });
    expect(r.shortDescription).toBe("Candy Red tonunda 3D Baskı boyası");
    expect(r.source).toBe("blok");
  });

  it("blok yoksa seri şablonuna düşer", () => {
    const r = resolveListingContent({ block: null, series, vars });
    expect(r.shortDescription).toBe("CANDY serisi profesyonel boya");
    expect(r.source).toBe("seri");
  });

  it("blok tamamen boşsa seriye düşer — yarı dolu blok içeriği yutmaz", () => {
    const bos = block({ shortDescription: null, longDescription: null, applicationText: null });
    const r = resolveListingContent({ block: bos, series, vars });
    expect(r.source).toBe("seri");
    expect(r.longDescription).toBe("Uzun açıklama");
  });

  it("hiçbiri yoksa boş ve sebebi bildirilir", () => {
    const r = resolveListingContent({ block: null, series: null, vars });
    expect(r).toMatchObject({ shortDescription: null, source: "yok" });
  });

  it("aynı blok farklı renkler için farklı metin üretir", () => {
    const kirmizi = resolveListingContent({ block: block(), series, vars });
    const mavi = resolveListingContent({
      block: block(),
      series,
      vars: { ...vars, renk: "Candy Blue" },
    });
    expect(kirmizi.shortDescription).toContain("Candy Red");
    expect(mavi.shortDescription).toContain("Candy Blue");
  });
});

describe("planContentBlocks — AI çağrısını en aza indirir", () => {
  const masters = [
    { seriesId: 10, useCaseIds: [1, 2], familyId: 100 },
    { seriesId: 10, useCaseIds: [1, 2], familyId: 200 },
    { seriesId: 20, useCaseIds: [1], familyId: 100 },
  ];

  it("renk/ambalaj çarpanı yok — blok seri × kullanım alanı başına", () => {
    // 3 master, ama yalnız 3 benzersiz (seri, kullanım) çifti
    const plan = planContentBlocks({ masters, existing: [] });
    expect(plan).toHaveLength(3);
  });

  it("dolu blok tekrar üretilmez", () => {
    const plan = planContentBlocks({
      masters,
      existing: [block({ seriesId: 10, useCaseId: 1, familyId: null })],
    });
    expect(plan.some(p => p.seriesId === 10 && p.useCaseId === 1)).toBe(false);
    expect(plan).toHaveLength(2);
  });

  it("boş blok yeniden üretilir", () => {
    const plan = planContentBlocks({
      masters,
      existing: [
        block({ seriesId: 10, useCaseId: 1, familyId: null, shortDescription: null, longDescription: null, applicationText: null }),
      ],
    });
    expect(plan).toHaveLength(3);
  });

  it("regenerate ile dolu bloklar da listelenir", () => {
    const plan = planContentBlocks({
      masters,
      existing: [block({ seriesId: 10, useCaseId: 1, familyId: null })],
      regenerate: true,
    });
    expect(plan).toHaveLength(3);
  });

  it("perFamily ile form başına ayrı blok çıkar", () => {
    const plan = planContentBlocks({ masters, existing: [], perFamily: true });
    // (10,1,100) (10,2,100) (10,1,200) (10,2,200) (20,1,100)
    expect(plan).toHaveLength(5);
  });

  it("master'ı olmayan kombinasyona çağrı yapılmaz", () => {
    const plan = planContentBlocks({ masters: [], existing: [] });
    expect(plan).toHaveLength(0);
  });
});
