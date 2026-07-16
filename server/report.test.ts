import { describe, expect, it } from "vitest";
import { calcChannelProfit, DEFAULT_CHANNEL_PROFILES, type ChannelProfile } from "../shared/pricing";
import {
  aggregateChannelProfit,
  buildProductCostMap,
  fallbackProfile,
  matchChannelProfile,
  parseChannelProfiles,
  periodStart,
  type ProductCostInfo,
  type ReportOrder,
  type ReportOrderItem,
} from "./reportUtils";

/** pricing.test.ts'teki Trendyol referans profili (resmi hesaplayıcıyla doğrulanmış). */
const TRENDYOL: ChannelProfile = {
  name: "Trendyol",
  kind: "pazaryeri",
  commissionPercent: 14,
  paymentFeePercent: 0.96,
  paymentFeeVatDeductible: true,
  fixedFee: 12.6,
  stopajPercent: 1,
  vatPercent: 20,
  shippingCost: 94.2,
};

const ELDEN: ChannelProfile = {
  name: "Elden",
  kind: "elden",
  commissionPercent: 0,
  paymentFeePercent: 0,
  paymentFeeVatDeductible: true,
  fixedFee: 0,
  stopajPercent: 0,
  vatPercent: 0,
  shippingCost: 0,
};

const PROFILES = [ELDEN, TRENDYOL];

const round2 = (n: number) => Math.round(n * 100) / 100;

function order(o: Partial<ReportOrder> & { id: number }): ReportOrder {
  return { channel: "trendyol", status: "done", totalAmount: "0", ...o };
}

function item(it: Partial<ReportOrderItem> & { orderId: number }): ReportOrderItem {
  return { productId: null, quantity: "1", unitPrice: "0", ...it };
}

describe("aggregateChannelProfit — Trendyol referans vakası", () => {
  // Ürün 5: KDV dahil 106,50 alış → 88,75 hariç maliyet (pricing.test.ts fixture'ı).
  const costs = new Map<number, ProductCostInfo>([[5, { productCost: 106.5 / 1.2, shippingCost: 0 }]]);

  it("tek siparişte calcChannelProfit ile kuruş kuruş aynı sonucu verir", () => {
    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: "trendyol", totalAmount: "325" })],
      orderItems: [item({ orderId: 1, productId: 5, quantity: "1", unitPrice: "325" })],
      costs,
      profiles: PROFILES,
    });
    const expected = calcChannelProfit({ salePrice: 325, productCost: 106.5 / 1.2, profile: TRENDYOL });

    expect(report.channels).toHaveLength(1);
    const c = report.channels[0];
    expect(c.channel).toBe("trendyol");
    expect(c.profileName).toBe("Trendyol");
    expect(c.hasProfile).toBe(true);
    expect(c.orderCount).toBe(1);
    expect(c.revenue).toBe(325);
    expect(c.revenueEx).toBe(round2(expected.saleEx)); // 270,83
    expect(c.commission).toBe(round2(expected.commission)); // 45,50
    expect(c.paymentFee).toBe(round2(expected.paymentFee)); // 2,60
    expect(c.transactionFee).toBe(round2(expected.transactionFee)); // 10,50
    expect(c.shipping).toBe(round2(expected.shipping)); // 78,50
    expect(c.stopaj).toBe(round2(expected.stopaj)); // 2,71
    expect(c.totalFees).toBe(round2(expected.totalFees));
    expect(c.productCost).toBe(round2(106.5 / 1.2)); // 88,75
    expect(c.net).toBeCloseTo(expected.net, 2); // 42,28
    expect(c.margin).toBeCloseTo(expected.margin, 1);
    expect(c.unknownCostItemCount).toBe(0);
    expect(c.unknownCostRevenue).toBe(0);
  });

  it("cancelled siparişler tamamen hariç tutulur", () => {
    const report = aggregateChannelProfit({
      orders: [
        order({ id: 1, channel: "trendyol", totalAmount: "325" }),
        order({ id: 2, channel: "trendyol", totalAmount: "999", status: "cancelled" }),
      ],
      orderItems: [
        item({ orderId: 1, productId: 5, quantity: "1", unitPrice: "325" }),
        item({ orderId: 2, productId: 5, quantity: "3", unitPrice: "333" }),
      ],
      costs,
      profiles: PROFILES,
    });
    expect(report.channels[0].orderCount).toBe(1);
    expect(report.channels[0].revenue).toBe(325);
    expect(report.totals.revenue).toBe(325);
  });

  it("işlem bedeli ve kargo SİPARİŞ başına düşülür (2 sipariş = 2 × sabit kesinti)", () => {
    const one = aggregateChannelProfit({
      orders: [order({ id: 1, totalAmount: "325" })],
      orderItems: [item({ orderId: 1, productId: 5, unitPrice: "325" })],
      costs,
      profiles: PROFILES,
    });
    const two = aggregateChannelProfit({
      orders: [order({ id: 1, totalAmount: "325" }), order({ id: 2, totalAmount: "325" })],
      orderItems: [
        item({ orderId: 1, productId: 5, unitPrice: "325" }),
        item({ orderId: 2, productId: 5, unitPrice: "325" }),
      ],
      costs,
      profiles: PROFILES,
    });
    expect(two.channels[0].transactionFee).toBeCloseTo(one.channels[0].transactionFee * 2, 2);
    expect(two.channels[0].shipping).toBeCloseTo(one.channels[0].shipping * 2, 2);
    // Yuvarlama tek yerde (kanal toplamında) yapıldığı için 2×(yuvarlanmış tekil)
    // ile kuruş farkı olabilir; gerçek beklenen değer yuvarlanmamış 2×net'tir.
    const expectedNet = calcChannelProfit({ salePrice: 325, productCost: 106.5 / 1.2, profile: TRENDYOL }).net * 2;
    expect(two.channels[0].net).toBeCloseTo(expectedNet, 2);
  });
});

describe("aggregateChannelProfit — profil eşleşmesi", () => {
  it("profili olmayan kanal kesintisiz + KDV %20 varsayılanla hesaplanır ve işaretlenir", () => {
    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: "n11", totalAmount: "120" })],
      orderItems: [],
      costs: new Map(),
      profiles: PROFILES,
    });
    const c = report.channels[0];
    expect(c.hasProfile).toBe(false);
    expect(c.profileName).toBeNull();
    expect(c.revenueEx).toBe(100); // 120 / 1,20 — KDV hasılat değildir
    expect(c.totalFees).toBe(0); // kesinti bilinmiyor → 0 ama uyarı bayrağı var
  });

  it("kanal adı profile önekle eşleşir (web → Web Sitesi) ve boş kanal 'diğer' olur", () => {
    const web = DEFAULT_CHANNEL_PROFILES.find(p => p.name === "Web Sitesi")!;
    expect(matchChannelProfile("web", DEFAULT_CHANNEL_PROFILES)).toBe(web);
    expect(matchChannelProfile("Trendyol", DEFAULT_CHANNEL_PROFILES)?.name).toBe("Trendyol");
    expect(matchChannelProfile("n11", DEFAULT_CHANNEL_PROFILES)).toBeNull();

    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: null, totalAmount: "100" })],
      orderItems: [],
      costs: new Map(),
      profiles: PROFILES,
    });
    expect(report.channels[0].channel).toBe("diğer");
  });

  it("fallbackProfile kesintisiz ve KDV %20'dir", () => {
    const p = fallbackProfile("n11");
    expect(p.vatPercent).toBe(20);
    expect(p.commissionPercent + p.paymentFeePercent + p.fixedFee + p.stopajPercent + p.shippingCost).toBe(0);
  });
});

describe("aggregateChannelProfit — maliyeti bilinmeyen kalemler (temkinli sunum)", () => {
  const costs = new Map<number, ProductCostInfo>([[5, { productCost: 40, shippingCost: 0 }]]);

  it("bilinmeyen kalemin KDV hariç cirosu net kârdan düşülür (kâr şişmez)", () => {
    // Elden (KDV 0, kesintisiz): bilinen kalem 100 (maliyet 40) + bilinmeyen kalem 50.
    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: "elden", totalAmount: "150" })],
      orderItems: [
        item({ orderId: 1, productId: 5, quantity: "1", unitPrice: "100" }),
        item({ orderId: 1, productId: null, quantity: "1", unitPrice: "50" }),
      ],
      costs,
      profiles: PROFILES,
    });
    const c = report.channels[0];
    expect(c.unknownCostItemCount).toBe(1);
    expect(c.unknownCostRevenue).toBe(50);
    expect(c.unknownCostShare).toBeCloseTo((50 / 150) * 100, 2);
    // net = 150 − 40 (bilinen maliyet) − 50 (bilinmeyen kalemin katkısı sıfır) = 60
    expect(c.net).toBe(60);
    expect(c.productCost).toBe(40);
  });

  it("katalogda eşleşen ama formülsüz ürün de 'maliyeti bilinmeyen' sayılır", () => {
    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: "elden", totalAmount: "80" })],
      orderItems: [item({ orderId: 1, productId: 99, quantity: "1", unitPrice: "80" })], // 99 haritada yok
      costs,
      profiles: PROFILES,
    });
    expect(report.channels[0].unknownCostItemCount).toBe(1);
    expect(report.channels[0].net).toBe(0); // tüm ciro bilinmez → temkinli net 0
  });

  it("kalemsiz sipariş cironun tamamı bilinmeyen tek kalem sayılır", () => {
    const report = aggregateChannelProfit({
      orders: [order({ id: 1, channel: "elden", totalAmount: "200" })],
      orderItems: [],
      costs,
      profiles: PROFILES,
    });
    const c = report.channels[0];
    expect(c.unknownCostItemCount).toBe(1);
    expect(c.unknownCostRevenue).toBe(200);
    expect(c.net).toBe(0);
  });

  it("bilinmeyen ciro KDV'li kanalda KDV hariç bazda düşülür", () => {
    // Trendyol'da (KDV %20) 120 TL bilinmeyen kalem → kârdan 100 düşülür, 120 değil.
    const withUnknown = aggregateChannelProfit({
      orders: [order({ id: 1, totalAmount: "325" })],
      orderItems: [
        item({ orderId: 1, productId: 5, quantity: "1", unitPrice: "205" }),
        item({ orderId: 1, productId: null, quantity: "1", unitPrice: "120" }),
      ],
      costs,
      profiles: PROFILES,
    });
    const allKnown = calcChannelProfit({ salePrice: 325, productCost: 40, profile: TRENDYOL });
    expect(withUnknown.channels[0].net).toBeCloseTo(round2(allKnown.net - 120 / 1.2), 2);
  });
});

describe("aggregateChannelProfit — çok kanallı toplama", () => {
  const costs = new Map<number, ProductCostInfo>([[5, { productCost: 40, shippingCost: 0 }]]);

  it("kanalları ayrı toplar, ciroya göre sıralar ve toplam satırı üretir", () => {
    const report = aggregateChannelProfit({
      orders: [
        order({ id: 1, channel: "trendyol", totalAmount: "325" }),
        order({ id: 2, channel: "elden", totalAmount: "100" }),
        order({ id: 3, channel: "elden", totalAmount: "100" }),
      ],
      orderItems: [
        item({ orderId: 1, productId: 5, unitPrice: "325" }),
        item({ orderId: 2, productId: 5, unitPrice: "100" }),
        item({ orderId: 3, productId: 5, unitPrice: "100" }),
      ],
      costs,
      profiles: PROFILES,
    });
    expect(report.channels.map(c => c.channel)).toEqual(["trendyol", "elden"]);
    const elden = report.channels[1];
    expect(elden.orderCount).toBe(2);
    expect(elden.revenue).toBe(200);
    expect(elden.net).toBe(120); // 2 × (100 − 40), KDV 0, kesintisiz
    expect(elden.margin).toBe(60);

    expect(report.totals.orderCount).toBe(3);
    expect(report.totals.revenue).toBe(525);
    expect(report.totals.net).toBeCloseTo(report.channels[0].net + elden.net, 2);
    expect(report.totals.totalFees).toBeCloseTo(report.channels[0].totalFees, 2);
  });

  it("aynı kanalın farklı yazımları (Trendyol/trendyol) tek kovada birleşir", () => {
    const report = aggregateChannelProfit({
      orders: [
        order({ id: 1, channel: "Trendyol", totalAmount: "100" }),
        order({ id: 2, channel: "trendyol", totalAmount: "100" }),
      ],
      orderItems: [],
      costs,
      profiles: PROFILES,
    });
    expect(report.channels).toHaveLength(1);
    expect(report.channels[0].orderCount).toBe(2);
  });
});

describe("buildProductCostMap", () => {
  it("formüllü ürüne hammadde+ambalaj yazar; formülsüz ürün haritaya girmez", () => {
    const map = buildProductCostMap(
      [{ productId: 5, materialCost: "31.25" }],
      [
        { id: 5, packagingCost: "8.75", shippingCost: "94.20" },
        { id: 6, packagingCost: "5.00", shippingCost: "0" }, // formülü yok
      ],
    );
    expect(map.get(5)).toEqual({ productCost: 40, shippingCost: 94.2 });
    expect(map.has(6)).toBe(false);
  });
});

describe("parseChannelProfiles", () => {
  it("boş/bozuk ayarda varsayılan profilleri döner", () => {
    expect(parseChannelProfiles(undefined)).toBe(DEFAULT_CHANNEL_PROFILES);
    expect(parseChannelProfiles("not-json")).toBe(DEFAULT_CHANNEL_PROFILES);
    expect(parseChannelProfiles("[]")).toBe(DEFAULT_CHANNEL_PROFILES);
  });
  it("eski biçimli kayıtları normalize eder (pazaryerine stopaj %1 eklenir)", () => {
    const parsed = parseChannelProfiles(
      JSON.stringify([{ name: "Trendyol", commissionPercent: 20, fixedFee: 10, vatPercent: 20, shippingCost: 0 }]),
    );
    expect(parsed[0].stopajPercent).toBe(1);
    expect(parsed[0].kind).toBe("pazaryeri");
  });
});

describe("periodStart — mevcut rapor dönem tanımlarıyla aynı", () => {
  const now = new Date(2026, 6, 16, 14, 30); // 16 Tem 2026
  it("month: ay başı", () => {
    expect(periodStart("month", now).getTime()).toBe(new Date(2026, 6, 1).getTime());
  });
  it("year: yıl başı", () => {
    expect(periodStart("year", now).getTime()).toBe(new Date(2026, 0, 1).getTime());
  });
  it("30d: şimdi − 30 gün", () => {
    expect(periodStart("30d", now).getTime()).toBe(now.getTime() - 30 * 86400000);
  });
});
