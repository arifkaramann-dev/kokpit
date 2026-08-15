import { describe, expect, it } from "vitest";
import {
  POST_KINDS,
  fallbackCaption,
  hashtagsFor,
  nextKind,
  planPost,
  type PostKind,
} from "./socialPlan";

/**
 * Kuyruğun tek işi "sırada ne var" sorusuna cevap vermek. İki kural kritik:
 * (1) tipler sırayla döner — on renk eklenince on gün üst üste "yeni renk"
 * postu çıkmaz; (2) aynı konu arka arkaya tekrar etmez.
 */
describe("sosyal gönderi rotasyonu", () => {
  it("geçmiş boşken ilk tipten başlar", () => {
    expect(nextKind([])).toBe("renk");
  });

  it("son tipten sonraki tipe geçer", () => {
    expect(nextKind([{ kind: "renk" }])).toBe("katsistemi");
    expect(nextKind([{ kind: "kullanim" }])).toBe("palet");
  });

  it("listenin sonundan başa döner", () => {
    expect(nextKind([{ kind: "palet" }])).toBe("renk");
  });

  it("kapalı tipleri atlar", () => {
    expect(nextKind([{ kind: "renk" }], ["renk", "palet"])).toBe("palet");
    // Hepsi kapalıysa kuyruk durur — uydurma tip seçilmez.
    expect(nextKind([{ kind: "renk" }], [])).toBeNull();
  });
});

describe("gönderi planlama", () => {
  const candidates = [
    { masterId: 10, seriesId: 1, colorId: 5, colorAddedRank: 5, usageImages: 0 },
    { masterId: 11, seriesId: 1, colorId: 9, colorAddedRank: 9, usageImages: 2 },
  ];

  it("yeni renk postunda en son eklenen rengi seçer", () => {
    const plan = planPost({ day: "2026-08-17", candidates, history: [] });
    expect(plan?.kind).toBe("renk");
    expect(plan?.colorId).toBe(9);
  });

  it("kullanım kolajında karesi olmayan ürünü seçmez", () => {
    const plan = planPost({
      day: "2026-08-19",
      candidates,
      history: [{ kind: "renk", colorId: 9, plannedFor: "2026-08-17" }, { kind: "katsistemi", colorId: 5, plannedFor: "2026-08-18" }],
    });
    expect(plan?.kind).toBe("kullanim");
    // 10 numaralı ürünün hiç karesi yok; kolaj boş çıkmasın diye elenir.
    expect(plan?.masterId).toBe(11);
  });

  it("aynı tipte kullanılmış rengi geriye atar", () => {
    const plan = planPost({
      day: "2026-08-21",
      candidates,
      history: [
        { kind: "palet", colorId: 9, plannedFor: "2026-08-14" },
        { kind: "kullanim", colorId: 9, plannedFor: "2026-08-19" },
      ],
    });
    // Sıradaki tip palet; 9 daha önce palet postunda kullanılmıştı.
    expect(plan?.kind).toBe("palet");
    expect(plan?.colorId).toBe(5);
  });

  it("aday yoksa uydurmaz", () => {
    expect(planPost({ day: "2026-08-17", candidates: [], history: [] })).toBeNull();
  });

  it("kullanım karesi olan hiç ürün yoksa o günü boş bırakır", () => {
    const plan = planPost({
      day: "2026-08-19",
      candidates: [{ masterId: 10, seriesId: 1, colorId: 5, usageImages: 0 }],
      history: [
        { kind: "renk", colorId: 5, plannedFor: "2026-08-14" },
        { kind: "katsistemi", colorId: 5, plannedFor: "2026-08-17" },
      ],
      enabledKinds: ["kullanim"],
    });
    expect(plan).toBeNull();
  });
});

describe("gönderi metni", () => {
  it("her tip için AI olmadan da dolu metin üretir", () => {
    for (const kind of POST_KINDS) {
      const text = fallbackCaption({
        kind: kind as PostKind,
        colorLabel: "FUŞYA / MAGENTA",
        colorCode: "CND1009",
        seriesName: "CANDY",
        coatSystem: "Gümüş baz → Candy renk → Vernik",
      });
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain("undefined");
    }
  });

  it("kat sistemi metni zinciri yazar", () => {
    expect(
      fallbackCaption({
        kind: "katsistemi",
        colorLabel: "FUŞYA",
        seriesName: "CANDY",
        coatSystem: "Gümüş baz → Candy renk → Vernik",
      }),
    ).toContain("Gümüş baz → Candy renk → Vernik");
  });

  it("etiketlere seriyi ekler", () => {
    expect(hashtagsFor("CANDY")).toContain("#candy");
    expect(hashtagsFor(null)).toContain("#artofcolour");
  });
});
