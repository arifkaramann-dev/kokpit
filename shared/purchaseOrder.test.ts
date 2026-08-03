import { describe, expect, it } from "vitest";

import {
  groupReorderBySupplier,
  purchaseTotal,
  reorderToCsv,
  type PurchaseLine,
} from "./purchaseOrder";

const line = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
  materialId: 1,
  name: "GRAVIHEL FLUORESCENT PP 40 YELLOW",
  unit: "lt",
  stock: 0.25,
  critical: 0.5,
  suggestedQty: 1,
  unitCost: 1000,
  estimatedCost: 1000,
  supplierId: 7,
  supplierName: "ÜMİT ABİ MOBİHEL",
  ...over,
});

describe("groupReorderBySupplier", () => {
  it("aynı tedarikçinin kalemlerini tek blokta toplar ve ara toplam çıkarır", () => {
    const groups = groupReorderBySupplier([
      line({ materialId: 1 }),
      line({ materialId: 2, name: "PP 41 ORANGE YELLOW" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierName).toBe("ÜMİT ABİ MOBİHEL");
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].subtotal).toBe(2000);
  });

  it("tutarı büyük tedarikçi önce gelir", () => {
    const groups = groupReorderBySupplier([
      line({ materialId: 1, supplierId: 7, supplierName: "Küçük", estimatedCost: 100 }),
      line({ materialId: 2, supplierId: 8, supplierName: "Büyük", estimatedCost: 900 }),
    ]);
    expect(groups.map(g => g.supplierName)).toEqual(["Büyük", "Küçük"]);
  });

  it("tedarikçisi tanımsız kalemler ayrı blokta ve EN SONDA durur", () => {
    const groups = groupReorderBySupplier([
      line({ materialId: 1, supplierId: null, supplierName: null, estimatedCost: 9999 }),
      line({ materialId: 2, supplierId: 7, supplierName: "ÜMİT ABİ", estimatedCost: 10 }),
    ]);
    // Tutarı büyük olsa bile sona gider: sipariş değil, eksik veri.
    expect(groups.map(g => g.supplierName)).toEqual(["ÜMİT ABİ", null]);
    expect(groups[1].lines).toHaveLength(1);
  });

  it("grup içinde kalem sırası korunur — öneri en kritikten sıralı gelir", () => {
    const groups = groupReorderBySupplier([
      line({ materialId: 3, name: "En kritik" }),
      line({ materialId: 1, name: "Daha az kritik" }),
    ]);
    expect(groups[0].lines.map(l => l.name)).toEqual(["En kritik", "Daha az kritik"]);
  });

  it("boş öneri boş döküm verir", () => {
    expect(groupReorderBySupplier([])).toEqual([]);
    expect(purchaseTotal([])).toBe(0);
  });

  it("genel toplam grup ara toplamlarının toplamıdır", () => {
    const groups = groupReorderBySupplier([
      line({ materialId: 1, estimatedCost: 1000.555 }),
      line({ materialId: 2, supplierId: 8, supplierName: "B", estimatedCost: 0.445 }),
    ]);
    expect(purchaseTotal(groups)).toBe(1001);
  });
});

describe("reorderToCsv", () => {
  const csv = () =>
    reorderToCsv(
      groupReorderBySupplier([
        line({ materialId: 1 }),
        line({ materialId: 2, supplierId: null, supplierName: null, estimatedCost: 50 }),
      ]),
    );

  it("başlık satırı ve noktalı virgül ayracı kullanır", () => {
    expect(csv().split("\n")[0]).toBe(
      "Tedarikçi;Hammadde;Stok;Kritik Eşik;Birim;Önerilen Alım;Birim Maliyet;Tahmini Maliyet",
    );
  });

  it("sayıları TR ondalık ayracıyla yazar — yoksa Excel TR'de metin sayılır", () => {
    expect(csv()).toContain("0,25;0,5;lt;1;1000;1000");
  });

  it("tedarikçisiz blok açıkça etiketlenir", () => {
    expect(csv()).toContain("TEDARİKÇİ TANIMSIZ");
  });

  it("ara toplam ve genel toplam satırları düşer", () => {
    const out = csv();
    expect(out).toContain("ÜMİT ABİ MOBİHEL ara toplam");
    expect(out).toContain("GENEL TOPLAM;;;;;;1050");
  });

  it("ayraç veya tırnak içeren hammadde adı kaçışlanır", () => {
    const out = reorderToCsv(
      groupReorderBySupplier([line({ name: 'Tiner; "özel" karışım' })]),
    );
    expect(out).toContain('"Tiner; ""özel"" karışım"');
  });
});
