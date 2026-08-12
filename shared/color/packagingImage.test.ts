import { describe, expect, it } from "vitest";
import {
  packagingImageUrl,
  resolvePackagingImageId,
  resolvePackagingImageSrc,
  seriesPackRange,
} from "./packagingImage";

const refs = [
  { id: 10, packagingId: 1, seriesId: null }, // 100 ml — tüm seriler
  { id: 11, packagingId: 2, seriesId: null }, // sprey — varsayılan
  { id: 12, packagingId: 2, seriesId: 7 }, // sprey — VIVID'e özel
];

describe("resolvePackagingImageId", () => {
  it("seri çekimi varsa onu seçer", () => {
    expect(resolvePackagingImageId(refs, 2, 7)).toBe(12);
  });

  it("seri çekimi yoksa varsayılana düşer", () => {
    expect(resolvePackagingImageId(refs, 2, 9)).toBe(11);
    expect(resolvePackagingImageId(refs, 1, 7)).toBe(10);
  });

  it("başka serinin çekimini ASLA kullanmaz", () => {
    // 3 numaralı ambalajın yalnız 7. serisi için çekimi var; 9. seri istendiğinde
    // yanlış hattın kutusunu basmak yerine hiç kutu çizilmemeli.
    const only = [{ id: 20, packagingId: 3, seriesId: 7 }];
    expect(resolvePackagingImageId(only, 3, 9)).toBeNull();
  });

  it("ambalaj ya da çekim yoksa null döner", () => {
    expect(resolvePackagingImageId(refs, null, 7)).toBeNull();
    expect(resolvePackagingImageId(refs, 99, 7)).toBeNull();
    expect(resolvePackagingImageId([], 1, null)).toBeNull();
  });

  it("seri verilmezse varsayılanı kullanır", () => {
    expect(resolvePackagingImageId(refs, 2, null)).toBe(11);
  });

  it("adresi kimlikten türetir", () => {
    expect(resolvePackagingImageSrc(refs, 2, 7)).toBe(packagingImageUrl(12));
    expect(resolvePackagingImageSrc(refs, 3, 7)).toBeNull();
  });
});

describe("seriesPackRange", () => {
  const packagings = [
    { id: 1, name: "250 ml", volumeMl: "250.00" },
    { id: 2, name: "SPREY 400ML", volumeMl: "400.00" },
    { id: 3, name: "30 ML", volumeMl: "30.00" },
    { id: 4, name: "Rötuş kalemi", volumeMl: null },
  ];
  const seriesPackagings = [
    { seriesId: 7, packagingId: 1 },
    { seriesId: 7, packagingId: 3 },
    { seriesId: 9, packagingId: 2 },
  ];

  it("serinin ambalajlarını hacme göre sıralar", () => {
    const range = seriesPackRange({ packagings, seriesPackagings, seriesId: 7 });
    expect(range.map(r => r.label)).toEqual(["30 ML", "250 ml"]);
    expect(range[0].volumeMl).toBe(30);
  });

  it("seri bağı yoksa bütün ambalajları verir", () => {
    const range = seriesPackRange({ packagings, seriesPackagings, seriesId: 42 });
    expect(range.map(r => r.packagingId)).toEqual([4, 3, 1, 2]);
  });

  it("hacimsiz ambalaj en başta durur ve çökmez", () => {
    const range = seriesPackRange({ packagings: [packagings[3]], seriesId: null });
    expect(range).toEqual([{ packagingId: 4, label: "Rötuş kalemi", volumeMl: 0, src: null }]);
  });

  it("çekimi olan ambalaja adres yazar", () => {
    const range = seriesPackRange({ packagings, seriesPackagings, images: refs, seriesId: 9 });
    expect(range.map(r => r.src)).toEqual([packagingImageUrl(11)]);
  });

  it("sınırı uygular", () => {
    expect(seriesPackRange({ packagings, seriesId: null, limit: 2 })).toHaveLength(2);
  });
});
