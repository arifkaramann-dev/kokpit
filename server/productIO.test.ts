import { describe, expect, it } from "vitest";
import {
  buildExportMatrix,
  matrixToCsv,
  parseCatalogCsv,
  planImport,
  type ProductIORecord,
} from "@shared/productIO";

let nextId = 1;
function make(overrides: Partial<ProductIORecord>): ProductIORecord {
  return {
    id: nextId++,
    parentId: null,
    name: "Ürün",
    series: null,
    colorCode: null,
    colorHex: null,
    surfaceType: null,
    additives: null,
    description: null,
    salePrice: "100.00",
    discountPercent: "0",
    packagingCost: "0",
    shippingCost: "0",
    packaging: null,
    barcode: null,
    stockQty: 0,
    criticalQty: 0,
    labelSize: null,
    labelText: null,
    usageGuide: null,
    safetyNotes: null,
    extraInfo: null,
    sku: null,
    category: null,
    profitMargin: null,
    vatRate: "20",
    desi: null,
    paintType: null,
    features: null,
    shortDescription: null,
    longDescription: null,
    applicationText: null,
    imageUrls: null,
    videoUrl: null,
    mockupUrl: null,
    labelWarnings: null,
    status: "satista",
    ...overrides,
  };
}

/** Küçük yardımcı: matristen başlık→değer sözlüğü (ilk veri satırı). */
function rowDict(matrix: string[][], rowIdx = 1): Record<string, string> {
  const out: Record<string, string> = {};
  matrix[0].forEach((h, i) => (out[h] = matrix[rowIdx][i]));
  return out;
}

describe("buildExportMatrix", () => {
  it("başlık + değerleri, üst ürün barkodunu ve tür sütununu doldurur", () => {
    const parent = make({ name: "Sprey Astar", barcode: "ana1", sku: "AOC-ANA" });
    const variant = make({ name: "Jant Astar", parentId: parent.id, barcode: "var1" });
    const m = buildExportMatrix([parent, variant]);
    const d = rowDict(m, 2); // türev satırı
    expect(d["Tür"]).toBe("Türev");
    expect(d["Üst Ürün Barkodu"]).toBe("ana1");
    expect(d["Ürün Adı"]).toBe("Jant Astar");
    expect(rowDict(m, 1)["Tür"]).toBe("Ana Ürün");
  });

  it("ondalık virgül seçeneği fiyatı virgüllü yazar", () => {
    const p = make({ salePrice: "216.50" });
    expect(rowDict(buildExportMatrix([p], { decimalSep: "," }))["Satış Fiyatı"]).toBe("216,50");
    expect(rowDict(buildExportMatrix([p]))["Satış Fiyatı"]).toBe("216.50");
  });

  it("görsel linklerini yalnız görseli olan ürün için üretir", () => {
    const p = make({ id: 7 });
    const m = buildExportMatrix([p], {
      imageBaseUrl: "https://s.com",
      imageKinds: new Map([[7, ["main"]]]),
    });
    const d = rowDict(m);
    expect(d["Ana Görsel"]).toBe("https://s.com/api/img/7/main");
    expect(d["Ambalaj Görseli"]).toBe("");
  });

  it("features ve imageUrls JSON listelerini metne çevirir", () => {
    const p = make({ features: '["Parlak","Hızlı"]', imageUrls: '["https://a.jpg","https://b.jpg"]' });
    const d = rowDict(buildExportMatrix([p]));
    expect(d["Özellikler"]).toBe("Parlak, Hızlı");
    expect(d["Görsel Linkleri"]).toBe("https://a.jpg | https://b.jpg");
  });
});

describe("matrixToCsv + parseCatalogCsv round-trip", () => {
  it("dışa aktarılan CSV geri okunabilir", () => {
    const p = make({ name: 'Tırnaklı "Ürün"', barcode: "b1" });
    const csv = matrixToCsv(buildExportMatrix([p]));
    const { parsed, error } = parseCatalogCsv(csv);
    expect(error).toBeNull();
    expect(parsed!.headers).toContain("Ürün Adı");
    expect(parsed!.rows).toHaveLength(1);
    const nameIdx = parsed!.headers.indexOf("Ürün Adı");
    expect(parsed!.rows[0].cells[nameIdx]).toBe('Tırnaklı "Ürün"');
  });

  it("başlıksız/tek satır dosya hata döner", () => {
    expect(parseCatalogCsv("sadece-baslik").error).toBeTruthy();
  });
});

describe("planImport", () => {
  const csv = (headers: string[], ...rows: string[][]) =>
    parseCatalogCsv([headers, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\r\n")).parsed!;

  it("barkodla eşleşen ürünü günceller, yalnız değişen alanları alır", () => {
    const p = make({ name: "Astar", barcode: "b1", salePrice: "100.00", stockQty: 5 });
    const parsed = csv(["Barkod", "Satış Fiyatı", "Stok"], ["b1", "150", "5"]);
    const plan = planImport([p], parsed, { matchBy: "barkod" });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].changes.map(c => c.header)).toEqual(["Satış Fiyatı"]);
    expect(plan.updates[0].data.salePrice).toBe(150);
    expect(plan.updates[0].data.stockQty).toBeUndefined(); // değişmedi
  });

  it("değişiklik yoksa unchanged'e düşer", () => {
    const p = make({ barcode: "b1", salePrice: "100.00" });
    const plan = planImport([p], csv(["Barkod", "Satış Fiyatı"], ["b1", "100"]), { matchBy: "barkod" });
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(1);
  });

  it("eşleşmeyen + adı olan satır yeni ürün, üst ürün barkodu çözülür", () => {
    const parent = make({ name: "Ana", barcode: "ana1" });
    const parsed = csv(
      ["Ürün Adı", "Barkod", "Üst Ürün Barkodu", "Satış Fiyatı"],
      ["Yeni Türev", "yeni1", "ana1", "120"],
    );
    const plan = planImport([parent], parsed, { matchBy: "barkod" });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].name).toBe("Yeni Türev");
    expect(plan.creates[0].parentRef).toBe("ana1");
    expect(plan.creates[0].data.salePrice).toBe(120);
    expect(plan.creates[0].warnings).toHaveLength(0);
  });

  it("bulunamayan üst ürün uyarı üretir ama ürünü oluşturur", () => {
    const parsed = csv(["Ürün Adı", "Barkod", "Üst Ürün Barkodu"], ["X", "x1", "yok"]);
    const plan = planImport([], parsed, { matchBy: "barkod" });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].warnings[0]).toContain("bulunamadı");
  });

  it("eşleşme yok ve ad boşsa hata", () => {
    const parsed = csv(["Barkod", "Satış Fiyatı"], ["yok1", "50"]);
    const plan = planImport([], parsed, { matchBy: "barkod" });
    expect(plan.creates).toHaveLength(0);
    expect(plan.errors[0].message).toContain("Ürün Adı boş");
  });

  it("geçersiz sayı satırı reddeder", () => {
    const p = make({ barcode: "b1" });
    const plan = planImport([p], csv(["Barkod", "Satış Fiyatı"], ["b1", "abc"]), { matchBy: "barkod" });
    expect(plan.updates).toHaveLength(0);
    expect(plan.errors[0].message).toContain("sayı okunamadı");
  });

  it("TR ondalık (1.234,56) doğru okunur", () => {
    const p = make({ barcode: "b1", salePrice: "0" });
    const plan = planImport([p], csv(["Barkod", "Satış Fiyatı"], ["b1", "1.234,56"]), { matchBy: "barkod" });
    expect(plan.updates[0].data.salePrice).toBe(1234.56);
  });

  it("boş hücre varsayılanda atlanır, clearEmpty açıkken temizler", () => {
    const p = make({ barcode: "b1", labelText: "eski" });
    const skip = planImport([p], csv(["Barkod", "Etiket Yazısı"], ["b1", ""]), { matchBy: "barkod" });
    expect(skip.unchanged).toHaveLength(1);
    const clear = planImport([p], csv(["Barkod", "Etiket Yazısı"], ["b1", ""]), {
      matchBy: "barkod",
      clearEmpty: true,
    });
    expect(clear.updates[0].data.labelText).toBeNull();
  });

  it("durum alias'ları çözülür, geçersizi reddeder", () => {
    const p = make({ barcode: "b1", status: "satista" });
    const ok = planImport([p], csv(["Barkod", "Durum"], ["b1", "arsiv"]), { matchBy: "barkod" });
    expect(ok.updates[0].data.status).toBe("arsiv");
    const bad = planImport([p], csv(["Barkod", "Durum"], ["b1", "yayında"]), { matchBy: "barkod" });
    expect(bad.errors[0].message).toContain("geçersiz durum");
  });

  it("aynı içe aktarımda iki satır aynı ürünü hedeflerse ikincisi hata", () => {
    const p = make({ barcode: "b1", salePrice: "100" });
    const parsed = csv(["Barkod", "Satış Fiyatı"], ["b1", "110"], ["b1", "120"]);
    const plan = planImport([p], parsed, { matchBy: "barkod" });
    expect(plan.updates).toHaveLength(1);
    expect(plan.errors.some(e => e.message.includes("birden çok satırda"))).toBe(true);
  });

  it("batch içinde çift yeni barkod ikinci satırı reddeder", () => {
    const parsed = csv(["Ürün Adı", "Barkod"], ["A", "dup"], ["B", "dup"]);
    const plan = planImport([], parsed, { matchBy: "barkod" });
    expect(plan.creates).toHaveLength(1);
    expect(plan.errors.some(e => e.message.includes("zaten kullanımda"))).toBe(true);
  });

  it("ID ile eşleştirme sayısal ID kullanır", () => {
    const p = make({ id: 42, barcode: "b1", salePrice: "100" });
    const parsed = csv(["ID", "Satış Fiyatı"], ["42", "200"]);
    const plan = planImport([p], parsed, { matchBy: "id" });
    expect(plan.updates[0].id).toBe(42);
    expect(plan.updates[0].data.salePrice).toBe(200);
  });

  it("eşleştirme sütunu dosyada yoksa hata", () => {
    const parsed = csv(["Ürün Adı", "Satış Fiyatı"], ["X", "10"]);
    const plan = planImport([], parsed, { matchBy: "sku" });
    expect(plan.errors[0].message).toContain("Eşleştirme sütunu bulunamadı");
  });
});
