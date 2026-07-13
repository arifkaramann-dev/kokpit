import { describe, expect, it } from "vitest";
import {
  buildProductCostMap,
  customerInsights,
  normalizeName,
  productProfitability,
  stockForecast,
  type FormulaCostRow,
  type MaterialLite,
  type OrderItemLite,
  type OrderLite,
  type ProductLite,
  type StockMovementLite,
} from "@shared/analytics";

const DAY = 86_400_000;
const NOW = new Date("2026-07-13T12:00:00Z").getTime();

const products: ProductLite[] = [
  // Reçete maliyeti 100, ambalaj 10, kargo 20 => birim maliyet 130; net fiyat 200 => birim kâr 70
  { id: 1, name: "Meteor Bukalemun 50ml", salePrice: 200, discountPercent: 0, packagingCost: 10, shippingCost: 20 },
  // Reçete maliyeti 90, ambalaj 5, kargo 5 => 100; indirimli net fiyat 90 => zarar -10
  { id: 2, name: "Candy Kırmızı 100ml", salePrice: 100, discountPercent: 10, packagingCost: 5, shippingCost: 5 },
];

const formulas: FormulaCostRow[] = [
  { productId: 1, qty: 2, unitCost: "50" }, // 100
  { productId: 2, qty: 3, unitCost: "30" }, // 90
];

describe("normalizeName", () => {
  it("kırpar, küçültür ve çoklu boşlukları sadeleştirir", () => {
    expect(normalizeName("  Meteor   Bukalemun  ")).toBe("meteor bukalemun");
  });
});

describe("buildProductCostMap", () => {
  it("reçete + ambalaj + kargo birim maliyetini ve birim kârı hesaplar", () => {
    const { byId, nameToId } = buildProductCostMap(products, formulas);
    const p1 = byId.get(1)!;
    expect(p1.materialCost).toBe(100);
    expect(p1.totalUnitCost).toBe(130);
    expect(p1.netPrice).toBe(200);
    expect(p1.unitProfit).toBe(70);
    expect(p1.unitMargin).toBeCloseTo(35, 5);
    expect(nameToId.get("meteor bukalemun 50ml")).toBe(1);
  });

  it("indirimli üründe net fiyat maliyetin altındaysa negatif birim kâr döner", () => {
    const { byId } = buildProductCostMap(products, formulas);
    const p2 = byId.get(2)!;
    expect(p2.totalUnitCost).toBe(100);
    expect(p2.netPrice).toBeCloseTo(90, 5);
    expect(p2.unitProfit).toBeCloseTo(-10, 5);
  });
});

describe("productProfitability", () => {
  const orders: OrderLite[] = [
    { id: 10, customerName: "Ahmet", channel: "trendyol", totalAmount: 400, createdAt: new Date(NOW - 2 * DAY) },
    { id: 11, customerName: "Mehmet", channel: "elden", totalAmount: 180, createdAt: new Date(NOW - 5 * DAY) },
    { id: 12, customerName: "Eski", channel: "web", totalAmount: 999, createdAt: new Date(NOW - 200 * DAY) },
  ];
  const items: OrderItemLite[] = [
    { orderId: 10, productName: "Meteor Bukalemun 50ml", quantity: 2, unitPrice: 200 }, // ciro 400, maliyet 260, kâr 140
    { orderId: 11, productName: "Candy Kırmızı 100ml", quantity: 2, unitPrice: 90 }, // ciro 180, maliyet 200, kâr -20
    { orderId: 11, productName: "Serbest Elden Ürün", quantity: 1, unitPrice: 50 }, // eşleşmez
    { orderId: 12, productName: "Meteor Bukalemun 50ml", quantity: 1, unitPrice: 200 }, // pencere dışı (200 gün)
  ];

  it("ürün bazında ciro, maliyet, kâr ve marjı hesaplar; kâra göre sıralar", () => {
    const r = productProfitability({ products, formulas, orders, orderItems: items }, { now: NOW, sinceDays: 90 });
    const meteor = r.rows.find(x => x.name.startsWith("Meteor"))!;
    expect(meteor.qty).toBe(2); // 200 günlük sipariş sayılmaz
    expect(meteor.revenue).toBe(400);
    expect(meteor.cost).toBe(260);
    expect(meteor.profit).toBe(140);
    expect(meteor.margin).toBeCloseTo(35, 5);
    expect(r.rows[0].name).toBe(meteor.name); // en kârlı başta
  });

  it("ad eşleşmeyen kalemi 'maliyeti bilinmiyor' olarak işaretler ve kapsamı düşürür", () => {
    const r = productProfitability({ products, formulas, orders, orderItems: items }, { now: NOW, sinceDays: 90 });
    const free = r.rows.find(x => x.name === "Serbest Elden Ürün")!;
    expect(free.matched).toBe(false);
    expect(free.cost).toBeNull();
    expect(free.profit).toBeNull();
    expect(r.summary.unmatchedRevenue).toBe(50);
    expect(r.summary.coverage).toBeCloseTo(580 / 630, 5);
  });

  it("zarar/düşük marj eden ürünleri ayrı listeler", () => {
    const r = productProfitability({ products, formulas, orders, orderItems: items }, { now: NOW, sinceDays: 90, lowMarginThreshold: 15 });
    expect(r.lowMargin.map(x => x.name)).toContain("Candy Kırmızı 100ml");
    expect(r.lowMargin[0].profit).toBeLessThan(0);
  });

  it("toplam kâr yalnızca maliyeti bilinen kalemlerden gelir", () => {
    const r = productProfitability({ products, formulas, orders, orderItems: items }, { now: NOW, sinceDays: 90 });
    expect(r.summary.totalProfit).toBeCloseTo(140 - 20, 5);
    expect(r.summary.matchedCount).toBe(2);
  });
});

describe("customerInsights", () => {
  const orders: OrderLite[] = [
    { id: 1, customerName: "Ahmet Yıldız", totalAmount: 500, paidAmount: 500, paymentStatus: "paid", channel: "trendyol", createdAt: new Date(NOW - 3 * DAY) },
    { id: 2, customerName: "Ahmet Yıldız", totalAmount: 300, paidAmount: 100, paymentStatus: "partial", channel: "web", createdAt: new Date(NOW - 100 * DAY) },
    { id: 3, customerName: "Zeynep Kaya", totalAmount: 1000, paidAmount: 0, paymentStatus: "unpaid", channel: "elden", createdAt: new Date(NOW - 90 * DAY) },
    { id: 4, customerName: "Yeni Müşteri", totalAmount: 200, paidAmount: 200, paymentStatus: "paid", channel: "web", createdAt: new Date(NOW - 1 * DAY) },
  ];

  it("müşteri bazında toplam harcama, sipariş sayısı ve alacağı toplar", () => {
    const r = customerInsights(orders, { now: NOW, sleepingDays: 60 });
    const ahmet = r.top.find(c => c.name === "Ahmet Yıldız")!;
    expect(ahmet.orderCount).toBe(2);
    expect(ahmet.totalSpent).toBe(800);
    expect(ahmet.outstanding).toBe(200); // 300-100 partial; paid sipariş 0
    expect(ahmet.daysSinceLast).toBe(3); // en son sipariş 3 gün önce
    expect(ahmet.channels.sort()).toEqual(["trendyol", "web"]);
  });

  it("en değerli müşteriyi başa koyar", () => {
    const r = customerInsights(orders, { now: NOW });
    expect(r.top[0].name).toBe("Zeynep Kaya"); // 1000 TL
  });

  it("uykuda müşteriyi (>=60 gün) değerine göre ayırır", () => {
    const r = customerInsights(orders, { now: NOW, sleepingDays: 60 });
    // Zeynep 90 gün, Ahmet son siparişi 3 gün önce (aktif), Yeni 1 gün
    expect(r.sleeping.map(c => c.name)).toEqual(["Zeynep Kaya"]);
  });

  it("bu ayın yeni müşterisini yakalar", () => {
    const r = customerInsights(orders, { now: NOW });
    expect(r.newThisMonth.map(c => c.name)).toContain("Yeni Müşteri");
  });
});

describe("stockForecast", () => {
  const materials: MaterialLite[] = [
    { id: 1, name: "Beyaz Pigment", unit: "gr", stockQty: 200, criticalQty: 100 }, // hızlı tüketilen
    { id: 2, name: "Nadir Katkı", unit: "ml", stockQty: 5, criticalQty: 10 }, // tüketimi yok, eşik altı
    { id: 3, name: "Tiner", unit: "lt", stockQty: 1000, criticalQty: 50 }, // bol
    { id: 4, name: "Boş Şişe", unit: "adet", stockQty: 0, criticalQty: 20 }, // tükendi
  ];
  // Pencere 90 gün. Pigment: 90 günde 900 çıkış => 10/gün => 200 stok 20 gün yeter.
  const movements: StockMovementLite[] = [
    { materialId: 1, type: "out", qty: 900, createdAt: new Date(NOW - 10 * DAY) },
    { materialId: 1, type: "in", qty: 500, createdAt: new Date(NOW - 5 * DAY) }, // giriş sayılmaz
    { materialId: 3, type: "out", qty: 90, createdAt: new Date(NOW - 30 * DAY) }, // 1/gün => 1000 gün yeter
    { materialId: 1, type: "out", qty: 9999, createdAt: new Date(NOW - 200 * DAY) }, // pencere dışı
  ];

  it("tüketim hızından günlük kullanım ve gün-kapağı hesaplar", () => {
    const f = stockForecast(materials, movements, { now: NOW, windowDays: 90, leadDays: 14, targetDays: 30 });
    const pigment = f.rows.find(r => r.id === 1)!;
    expect(pigment.dailyUsage).toBeCloseTo(10, 5);
    expect(pigment.daysOfCover).toBeCloseTo(20, 5);
    expect(pigment.status).toBe("low"); // 20 gün: lead 14 ile 2×lead 28 arası
  });

  it("hedef günü karşılayacak sipariş miktarı önerir", () => {
    const f = stockForecast(materials, movements, { now: NOW, windowDays: 90, targetDays: 30 });
    const pigment = f.rows.find(r => r.id === 1)!;
    // 30 gün × 10/gün = 300 ihtiyaç − 200 stok = 100 öneri
    expect(pigment.suggestedOrder).toBe(100);
  });

  it("tükenen (stok 0) hammaddeyi 'out' işaretler ve en başa koyar", () => {
    const f = stockForecast(materials, movements, { now: NOW });
    expect(f.rows[0].id).toBe(4);
    expect(f.rows[0].status).toBe("out");
    expect(f.counts.out).toBe(1);
  });

  it("tüketim geçmişi yoksa sabit kritik eşiğe düşer", () => {
    const f = stockForecast(materials, movements, { now: NOW });
    const rare = f.rows.find(r => r.id === 2)!;
    expect(rare.dailyUsage).toBe(0);
    expect(rare.daysOfCover).toBeNull();
    expect(rare.status).toBe("low"); // stok 5 <= eşik 10
    expect(rare.suggestedOrder).toBe(15); // 2×10 − 5
  });

  it("bol stoklu ve yavaş tüketilen hammaddeyi sipariş listesine koymaz", () => {
    const f = stockForecast(materials, movements, { now: NOW });
    const tiner = f.rows.find(r => r.id === 3)!;
    expect(tiner.status).toBe("ok");
    expect(f.toOrder.map(r => r.id)).not.toContain(3);
  });
});
