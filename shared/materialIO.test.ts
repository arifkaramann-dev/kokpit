import { describe, expect, it } from "vitest";
import {
  buildMaterialExportMatrix,
  materialMatrixToParsed,
  parseMaterialCsv,
  planMaterialImport,
  type MaterialIORecord,
} from "./materialIO";

const materials: MaterialIORecord[] = [
  {
    id: 1,
    name: "MOB300",
    category: "mix boya",
    unit: "lt",
    type: "hammadde",
    stockQty: 0.2,
    criticalQty: 0.05,
    unitCost: 1900,
    supplierId: 5,
    notes: null,
  },
  {
    id: 2,
    name: "BAĞLAYICI GRA",
    category: "solvent",
    unit: "lt",
    type: "hammadde",
    stockQty: 1,
    criticalQty: 0.3,
    unitCost: 1250,
    supplierId: null,
    notes: "ürün kodu PS021",
  },
];

const suppliers = [{ id: 5, name: "Erdem Boya" }];

const sheet = (rows: string[][]) => ({
  headers: rows[0],
  rows: rows.slice(1).map((cells, i) => ({ cells, line: i + 2 })),
});

describe("dışa aktarma", () => {
  it("başlık + satır matrisi üretir, tedarikçiyi adıyla yazar", () => {
    const m = buildMaterialExportMatrix(materials, { suppliers });
    expect(m[0]).toEqual([
      "ID",
      "Malzeme Adı",
      "Kategori",
      "Birim",
      "Birim Maliyet",
      "Stok",
      "Kritik Eşik",
      "Tedarikçi",
      "Tür",
      "Notlar",
    ]);
    expect(m[1]).toEqual(["1", "MOB300", "mix boya", "lt", "1900", "0.2", "0.05", "Erdem Boya", "hammadde", ""]);
  });

  it("dışa aktarılan dosya geri okunabilir (round-trip)", () => {
    const matrix = buildMaterialExportMatrix(materials, { suppliers });
    const { parsed } = materialMatrixToParsed(matrix);
    const plan = planMaterialImport(materials, parsed!, { matchBy: "id", suppliers });
    expect(plan.updates).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(2);
  });
});

describe("CSV okuma", () => {
  it("noktalı virgül ayracını tanır ve BOM'u atar", () => {
    const { parsed } = parseMaterialCsv('﻿"Malzeme Adı";"Birim Maliyet"\r\n"MOB300";"2100"');
    expect(parsed?.headers).toEqual(["Malzeme Adı", "Birim Maliyet"]);
    expect(parsed?.rows[0].cells).toEqual(["MOB300", "2100"]);
  });

  it("tek satırlık dosyayı reddeder", () => {
    const { parsed, error } = parseMaterialCsv("Malzeme Adı;Birim Maliyet");
    expect(parsed).toBeNull();
    expect(error).toContain("en az bir veri satırı");
  });
});

describe("planMaterialImport", () => {
  it("zam listesi: yalnız fiyat sütunu güncellenir, stok ve eşiğe dokunulmaz", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet"],
        ["MOB300", "2.100,50"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].data).toEqual({ unitCost: 2100.5 });
    expect(plan.updates[0].changes).toEqual([
      { header: "Birim Maliyet", old: "1900", new: "2100.5" },
    ]);
  });

  it("boş sayı hücresi 'dokunma' demektir — stoğu sıfırlamaz", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Stok", "Birim Maliyet"],
        ["MOB300", "", "2000"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates[0].data).toEqual({ unitCost: 2000 });
    expect(plan.updates[0].data).not.toHaveProperty("stockQty");
  });

  it("değişmeyen satırı 'unchanged' sayar", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet"],
        ["MOB300", "1900"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(1);
  });

  it("eşleşmeyen satırı yeni kalem olarak açar ve eksikleri uyarır", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet"],
        ["100 ml plastik şişe", "12"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].data).toMatchObject({
      name: "100 ml plastik şişe",
      unit: "gr",
      category: "diğer",
      unitCost: 12,
    });
    expect(plan.creates[0].warnings.length).toBeGreaterThan(0);
  });

  it("ad eşleşmesi Türkçe karakter ve boşluğa takılmaz", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet"],
        ["bağlayici  gra", "1300"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe(2);
  });

  it("kayıtlı tedarikçiyi ID'ye çevirir", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Tedarikçi"],
        ["BAĞLAYICI GRA", "Erdem Boya"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates[0].data).toEqual({ supplierId: 5 });
  });

  it("tanınmayan tedarikçiyi reddetmez, açılacaklar listesine alır", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Tedarikçi"],
        ["MOB300", "ÜMİT ABİ MOBİHEL"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.newSuppliers).toEqual(["ÜMİT ABİ MOBİHEL"]);
    expect(plan.updates[0].newSupplier).toBe("ÜMİT ABİ MOBİHEL");
  });

  it("tanınmayan birimi satır hatası olarak bildirir", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim"],
        ["MOB300", "kutu"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.errors[0].message).toContain("birim tanınmadı");
  });

  it("birim yazım varyantlarını kanonik koda indirger", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim"],
        ["MOB300", "Litre"],
      ]),
      { matchBy: "ad", suppliers },
    );
    // "Litre" → "lt": mevcut değerle aynı, değişiklik yok.
    expect(plan.unchanged).toHaveLength(1);
  });

  it("aynı kalemi iki kez içeren dosyayı reddeder — hangisinin kazandığı belirsiz", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet"],
        ["MOB300", "2000"],
        ["MOB300", "2500"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.errors[0].message).toContain("birden fazla kez");
  });

  it("negatif sayıyı reddeder", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Stok"],
        ["MOB300", "-5"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.errors[0].message).toContain("sayı okunamadı");
  });

  it("eşleştirme sütunu yoksa erken ve anlaşılır hata verir", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Birim Maliyet"],
        ["1900"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.errors[0].message).toContain("Malzeme Adı");
  });

  it("ID ile eşleştirmede bulunamayan ID'yi bildirir", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["ID", "Malzeme Adı", "Birim Maliyet"],
        ["999", "Hayalet", "10"],
      ]),
      { matchBy: "id", suppliers },
    );
    expect(plan.errors[0].message).toContain("999");
  });

  it("ID sütunu boşsa satır yeni kalem sayılır (ID ile eşleştirmede bile)", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["ID", "Malzeme Adı", "Birim", "Birim Maliyet"],
        ["", "Yeni Tiner", "lt", "300"],
      ]),
      { matchBy: "id", suppliers },
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].name).toBe("Yeni Tiner");
  });

  it("tür sütununu tanır", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Tür"],
        ["MOB300", "yarı mamul"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.updates[0].data).toEqual({ type: "yari_mamul" });
  });

  it("dosyada bulunan sütunları raporlar — 'neye dokunulacak' özeti", () => {
    const plan = planMaterialImport(
      materials,
      sheet([
        ["Malzeme Adı", "Birim Maliyet", "Bilinmeyen Sütun"],
        ["MOB300", "1900", "x"],
      ]),
      { matchBy: "ad", suppliers },
    );
    expect(plan.presentFields).toEqual(["Malzeme Adı", "Birim Maliyet"]);
  });
});
