import { describe, expect, it } from "vitest";
import {
  MASTER_EXPORT_HEADER,
  buildMasterExportMatrix,
  buildMasterTemplateMatrix,
  masterMatrixToParsed,
  planMasterImport,
  type MasterDimensions,
  type MasterIORecord,
} from "./masterIO";
import { derivedNameOf, displayNameOf } from "./productName";

const dims: MasterDimensions = {
  series: [{ id: 1, name: "CANDY" }],
  colors: [
    { id: 10, name: "Kırmızı" },
    { id: 11, name: "Açık Mavi" },
  ],
  families: [{ id: 20, name: "1K Şeffaf" }],
  packagings: [
    { id: 30, name: "100 ml" },
    { id: 31, name: "500 ml" },
  ],
};

const master = (p: Partial<MasterIORecord> = {}): MasterIORecord => ({
  id: 1,
  internalSku: "aoccndred-1k-100-r2u",
  name: "Candy Kırmızı 100 ml",
  gtin: "8691960000015",
  basePrice: 190,
  stockQty: 12,
  status: "aktif",
  seriesId: 1,
  colorId: 10,
  familyId: 20,
  packagingId: 30,
  readiness: "r2u",
  series: "CANDY",
  colorName: "Kırmızı",
  family: "1K Şeffaf",
  packaging: "100 ml",
  ...p,
});

/** Dosyayı matristen kurup plana çevirir — testlerin tekrar eden kısmı. */
function plan(
  matrix: string[][],
  masters: MasterIORecord[] = [master()],
  matchBy: "kod" | "id" = "kod",
) {
  const { parsed, error } = masterMatrixToParsed(matrix);
  expect(error).toBeNull();
  return planMasterImport(masters, parsed!, { matchBy, dims });
}

describe("buildMasterExportMatrix", () => {
  it("başlık + satır yazar, koordinatı da taşır", () => {
    const m = buildMasterExportMatrix([master()]);
    expect(m[0]).toEqual(MASTER_EXPORT_HEADER);
    expect(m[1]).toEqual([
      "1", "aoccndred-1k-100-r2u", "Candy Kırmızı 100 ml", "190", "12",
      "8691960000015", "aktif", "CANDY", "Kırmızı", "1K Şeffaf", "100 ml", "r2u",
    ]);
  });

  /*
   * Türetilmiş adı dosyaya yazmak, dosya geri yüklendiğinde adsız ürünlere
   * sessizce elle girilmiş ad atamak olurdu.
   */
  it("adı olmayan ürünün ad hücresi boş kalır", () => {
    const m = buildMasterExportMatrix([master({ name: null })]);
    expect(m[1][2]).toBe("");
  });

  it("dışa aktarılan dosya geri yüklenince değişiklik üretmez", () => {
    const p = plan(buildMasterExportMatrix([master()]) as string[][]);
    expect(p.updates).toEqual([]);
    expect(p.creates).toEqual([]);
    expect(p.unchanged).toHaveLength(1);
  });

  it("şablon başlıkla uyumlu", () => {
    const t = buildMasterTemplateMatrix();
    expect(t[0]).toEqual(MASTER_EXPORT_HEADER);
    expect(t[1]).toHaveLength(MASTER_EXPORT_HEADER.length);
  });
});

describe("planMasterImport — güncelleme", () => {
  it("değişen alanı yazar, eskisini de gösterir", () => {
    const p = plan([
      ["Kod", "Fiyat"],
      ["aoccndred-1k-100-r2u", "210"],
    ]);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].data).toEqual({ basePrice: 210 });
    expect(p.updates[0].changes).toEqual([{ header: "Fiyat", old: "190", new: "210" }]);
  });

  /*
   * Bu modülün en önemli kuralı: zam listesinde yalnız fiyat sütunu doludur,
   * boşları 0 saymak stokları ve barkodları sessizce silerdi.
   */
  it("boş hücreye dokunmaz", () => {
    const p = plan([
      ["Kod", "Satış Adı", "Fiyat", "Stok", "Barkod"],
      ["aoccndred-1k-100-r2u", "", "210", "", ""],
    ]);
    expect(p.updates[0].data).toEqual({ basePrice: 210 });
  });

  it("aynı değer geri yazılırsa değişiklik saymaz", () => {
    const p = plan([
      ["Kod", "Fiyat", "Stok"],
      ["aoccndred-1k-100-r2u", "190", "12"],
    ]);
    expect(p.updates).toEqual([]);
    expect(p.unchanged).toHaveLength(1);
  });

  it("barkodu ancak açık işaretle siler", () => {
    const p = plan([
      ["Kod", "Barkod"],
      ["aoccndred-1k-100-r2u", "-"],
    ]);
    expect(p.updates[0].data).toEqual({ gtin: "" });
  });

  it("koordinat sütunları mevcut üründe yok sayılır", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Ambalaj"],
      ["aoccndred-1k-100-r2u", "CANDY", "Açık Mavi", "500 ml"],
    ]);
    expect(p.updates).toEqual([]);
    expect(p.unchanged).toHaveLength(1);
  });

  it("ID ile eşleştirir", () => {
    const p = plan(
      [
        ["ID", "Fiyat"],
        ["1", "250"],
      ],
      [master()],
      "id",
    );
    expect(p.updates[0].id).toBe(1);
  });

  it("aynı ürün iki kez geçerse ikisini de reddeder", () => {
    const p = plan([
      ["Kod", "Fiyat"],
      ["aoccndred-1k-100-r2u", "200"],
      ["aoccndred-1k-100-r2u", "300"],
    ]);
    expect(p.updates).toHaveLength(1);
    expect(p.errors[0].message).toContain("birden fazla kez");
  });

  it("durum takma adlarını çözer", () => {
    const p = plan([
      ["Kod", "Durum"],
      ["aoccndred-1k-100-r2u", "pasif"],
    ]);
    expect(p.updates[0].data).toEqual({ status: "arsiv" });
  });

  it("bozuk sayıyı satır numarasıyla raporlar", () => {
    const p = plan([
      ["Kod", "Fiyat"],
      ["aoccndred-1k-100-r2u", "yüz lira"],
    ]);
    expect(p.updates).toEqual([]);
    expect(p.errors[0]).toMatchObject({ line: 2 });
    expect(p.errors[0].message).toContain("Fiyat");
  });

  it("geçersiz barkodu reddeder", () => {
    const p = plan([
      ["Kod", "Barkod"],
      ["aoccndred-1k-100-r2u", "12"],
    ]);
    expect(p.errors[0].message).toContain("8-14");
  });
});

describe("planMasterImport — yeni ürün", () => {
  it("kod boşsa koordinattan yeni ürün açar", () => {
    const p = plan([
      ["Kod", "Satış Adı", "Fiyat", "Seri", "Renk", "Form", "Ambalaj", "Hazırlık"],
      ["", "Candy Açık Mavi 500 ml", "240", "CANDY", "Açık Mavi", "1K Şeffaf", "500 ml", "r2u"],
    ]);
    expect(p.creates).toHaveLength(1);
    expect(p.creates[0].coord).toEqual({
      seriesId: 1,
      colorId: 11,
      familyId: 20,
      packagingId: 31,
      readiness: "r2u",
    });
    expect(p.creates[0].data).toMatchObject({ name: "Candy Açık Mavi 500 ml", basePrice: 240 });
  });

  it("hazırlık yazılmazsa konsantre sayar", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["", "CANDY", "Açık Mavi", "1K Şeffaf", "500 ml"],
    ]);
    expect(p.creates[0].coord.readiness).toBe("konsantre");
  });

  it("eksen adında boşluk farkını yok sayar", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["", "candy", "açık mavi", "1k şeffaf", "500ml"],
    ]);
    expect(p.creates).toHaveLength(1);
  });

  /* Kullanıcının koyduğu kural: mükerrer ürün açılmayacak. */
  it("dolu koordinata ikinci ürün açmaz", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj", "Hazırlık"],
      ["", "CANDY", "Kırmızı", "1K Şeffaf", "100 ml", "r2u"],
    ]);
    expect(p.creates).toEqual([]);
    expect(p.errors[0].message).toContain("zaten var");
  });

  it("aynı dosyada aynı koordinatı iki kez açmaz", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["", "CANDY", "Açık Mavi", "1K Şeffaf", "500 ml"],
      ["", "CANDY", "Açık Mavi", "1K Şeffaf", "500 ml"],
    ]);
    expect(p.creates).toHaveLength(1);
    expect(p.errors[0].message).toContain("zaten var");
  });

  /*
   * Kod yazılmış ama eşleşmiyorsa kullanıcı bir ürünü güncellemek istiyordu ve
   * kodu yanlış yazdı. Sessizce yeni ürün açmak mükerrer üretirdi.
   */
  it("tanınmayan kodu yeni ürün saymaz", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["yanlis-kod", "CANDY", "Açık Mavi", "1K Şeffaf", "500 ml"],
    ]);
    expect(p.creates).toEqual([]);
    expect(p.errors[0].message).toContain("bulunamadı");
  });

  it("tanınmayan rengi açmaz, Tanımlar'a yollar", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["", "CANDY", "Turkuaz", "1K Şeffaf", "500 ml"],
    ]);
    expect(p.creates).toEqual([]);
    expect(p.errors[0].message).toContain("Tanımlar");
  });

  it("eksik koordinat sütununu söyler", () => {
    const p = plan([
      ["Kod", "Seri", "Renk", "Form", "Ambalaj"],
      ["", "CANDY", "", "1K Şeffaf", ""],
    ]);
    expect(p.errors[0].message).toContain("Renk");
    expect(p.errors[0].message).toContain("Ambalaj");
  });
});

describe("planMasterImport — dosya sorunları", () => {
  it("eşleştirme sütunu yoksa açıklar", () => {
    const p = plan([
      ["Fiyat"],
      ["200"],
    ]);
    expect(p.errors[0].message).toContain('"Kod" sütunu bulunamadı');
  });

  it("tanınan alan sütunu yoksa açıklar", () => {
    const p = plan([
      ["Kod", "Alakasız"],
      ["aoccndred-1k-100-r2u", "x"],
    ]);
    expect(p.errors[0].message).toContain("Tanınan sütun yok");
  });

  it("boş satırı atlar", () => {
    const p = plan([
      ["Kod", "Fiyat"],
      ["aoccndred-1k-100-r2u", "210"],
      ["", ""],
    ]);
    expect(p.errors).toEqual([]);
    expect(p.updates).toHaveLength(1);
  });

  it("başlıksız dosyayı reddeder", () => {
    const { parsed, error } = masterMatrixToParsed([["Kod", "Fiyat"]]);
    expect(parsed).toBeNull();
    expect(error).toContain("en az bir veri satırı");
  });
});

describe("displayNameOf", () => {
  it("elle girilen ad kazanır", () => {
    expect(displayNameOf({ name: "Özel Ad", series: "CANDY" })).toBe("Özel Ad");
  });

  it("ad yoksa koordinattan türetir", () => {
    expect(
      displayNameOf({
        series: "CANDY",
        colorName: "Kırmızı",
        family: "1K Şeffaf",
        packaging: "100 ml",
        readiness: "r2u",
      }),
    ).toBe("CANDY Kırmızı — 1K Şeffaf · 100 ml (R2U)");
  });

  it("konsantre için hazırlık yazmaz", () => {
    expect(derivedNameOf({ series: "CANDY", colorName: "Kırmızı", readiness: "konsantre" })).toBe(
      "CANDY Kırmızı",
    );
  });

  it("koordinat da yoksa SKU'ya düşer", () => {
    expect(displayNameOf({ internalSku: "aoc-x" })).toBe("aoc-x");
  });
});
