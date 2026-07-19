import { describe, expect, it } from "vitest";
import { calcChannelProfit, ChannelProfile, DEFAULT_CHANNEL_PROFILES } from "../shared/pricing";
import { channelProfitReport, matchChannelProfile, ProductCostInfo } from "./reportUtils";

const trendyol: ChannelProfile = {
  name: "Trendyol",
  kind: "pazaryeri",
  commissionPercent: 20,
  paymentFeePercent: 0.96,
  paymentFeeVatDeductible: true,
  fixedFee: 12.6,
  stopajPercent: 1,
  vatPercent: 20,
  shippingCost: 0,
};
const elden: ChannelProfile = {
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
const webSitesi: ChannelProfile = { ...elden, name: "Web Sitesi", kind: "website", vatPercent: 20, paymentFeePercent: 2.5 };
const profiles = [elden, webSitesi, trendyol];

const now = new Date("2026-07-16T00:00:00Z");
const since = new Date(now.getTime() - 30 * 86400000);
const inWindow = new Date(now.getTime() - 5 * 86400000);

describe("matchChannelProfile", () => {
  it("tam ad eşleşmesi (büyük/küçük harf bağımsız)", () => {
    expect(matchChannelProfile("trendyol", profiles).name).toBe("Trendyol");
    expect(matchChannelProfile("ELDEN", profiles).name).toBe("Elden");
  });
  it('kısmi eşleşme: "web" kanalı "Web Sitesi" profiline gider', () => {
    expect(matchChannelProfile("web", profiles).name).toBe("Web Sitesi");
  });
  it("eşleşmeyen kanal kesintisiz elden profiline düşer", () => {
    expect(matchChannelProfile("whatsapp", profiles).name).toBe("Elden");
    expect(matchChannelProfile(null, profiles).name).toBe("Elden");
  });
  it("elden profili yoksa varsayılan kullanılır", () => {
    expect(matchChannelProfile("bilinmeyen", [trendyol]).name).toBe(DEFAULT_CHANNEL_PROFILES[0].name);
  });
});

describe("channelProfitReport", () => {
  const costs = new Map<number, ProductCostInfo>([
    [1, { materialCost: 50, packagingCost: 10, shippingCost: 30 }],
    [2, { materialCost: 20, packagingCost: 5, shippingCost: 45 }],
  ]);

  it("tek ürünlü sipariş, kâr modeli v2 ile birebir aynı sonucu verir", () => {
    const { rows } = channelProfitReport(
      [{ id: 1, channel: "trendyol", status: "done", createdAt: inWindow, totalAmount: "300" }],
      [{ orderId: 1, productId: 1, quantity: "1" }],
      costs,
      profiles,
      since,
    );
    // Net hammadde (50) kanalın KDV'siyle brütleştirilip (50×1,2=60) ambalajla (10)
    // motora verilir → productCost 70 (çift-netleştirme düzeltmesi, Tema 0 #3).
    const expected = calcChannelProfit({ salePrice: 300, productCost: 70, productCostVatPercent: trendyol.vatPercent, profile: trendyol, shippingOverride: 30 });
    expect(rows).toHaveLength(1);
    expect(rows[0].net).toBeCloseTo(expected.net, 6);
    expect(rows[0].margin).toBeCloseTo(expected.margin, 6);
    expect(rows[0].commission).toBeCloseTo(expected.commission, 6);
    // Raporlanan maliyet artık motorun kullandığı net maliyet (KDV hariç).
    expect(rows[0].productCost).toBeCloseTo(expected.productCostEx, 6);
  });

  it("işlem bedeli ve kargo sipariş başına BİR kez sayılır (kalem başına değil)", () => {
    const { rows } = channelProfitReport(
      [{ id: 1, channel: "trendyol", status: "done", createdAt: inWindow, totalAmount: "600" }],
      [
        { orderId: 1, productId: 1, quantity: "2" }, // net mal 50 → brüt 60, +ambalaj 10 = 70; kargo 30
        { orderId: 1, productId: 2, quantity: "4" }, // net mal 20 → brüt 24, +ambalaj 5 = 29; kargo 45
      ],
      costs,
      profiles,
      since,
    );
    // productCost (motora, KDV dahil) = 2×70 + 4×29 = 256; kargo = max(30,45) = 45 (bir kez)
    const expected = calcChannelProfit({ salePrice: 600, productCost: 256, productCostVatPercent: trendyol.vatPercent, profile: trendyol, shippingOverride: 45 });
    expect(rows[0].productCost).toBeCloseTo(expected.productCostEx, 6); // raporlanan = net maliyet
    expect(rows[0].transactionFee).toBeCloseTo(expected.transactionFee, 6); // 12.6/1.2 bir kez
    expect(rows[0].shipping).toBeCloseTo(45 / 1.2, 6);
    expect(rows[0].net).toBeCloseTo(expected.net, 6);
  });

  it("iptal edilen ve pencere dışı siparişler rapora girmez", () => {
    const { rows, totals } = channelProfitReport(
      [
        { id: 1, channel: "trendyol", status: "cancelled", createdAt: inWindow, totalAmount: "300" },
        { id: 2, channel: "trendyol", status: "done", createdAt: new Date(now.getTime() - 60 * 86400000), totalAmount: "300" },
      ],
      [],
      costs,
      profiles,
      since,
    );
    expect(rows).toHaveLength(0);
    expect(totals.orders).toBe(0);
  });

  it("katalogla eşleşmeyen kalem maliyetsiz sayılır ve raporda işaretlenir", () => {
    const { rows } = channelProfitReport(
      [{ id: 1, channel: "elden", status: "done", createdAt: inWindow, totalAmount: "100" }],
      [{ orderId: 1, productId: null, quantity: "1" }],
      costs,
      profiles,
      since,
    );
    expect(rows[0].missingCostItems).toBe(1);
    expect(rows[0].productCost).toBe(0);
  });

  it("kalemsiz sipariş de maliyetsiz olarak işaretlenir", () => {
    const { rows } = channelProfitReport(
      [{ id: 1, channel: "elden", status: "done", createdAt: inWindow, totalAmount: "100" }],
      [],
      costs,
      profiles,
      since,
    );
    expect(rows[0].missingCostItems).toBe(1);
  });

  it("kanallar ayrı satırlarda toplanır; toplam satırı tutarlıdır", () => {
    const { rows, totals } = channelProfitReport(
      [
        { id: 1, channel: "trendyol", status: "done", createdAt: inWindow, totalAmount: "300" },
        { id: 2, channel: "elden", status: "done", createdAt: inWindow, totalAmount: "100" },
        { id: 3, channel: "trendyol", status: "done", createdAt: inWindow, totalAmount: "300" },
      ],
      [
        { orderId: 1, productId: 1, quantity: "1" },
        { orderId: 2, productId: 2, quantity: "1" },
        { orderId: 3, productId: 1, quantity: "1" },
      ],
      costs,
      profiles,
      since,
    );
    expect(rows).toHaveLength(2);
    const ty = rows.find(r => r.channel === "trendyol")!;
    expect(ty.orders).toBe(2);
    expect(totals.orders).toBe(3);
    expect(totals.net).toBeCloseTo(rows.reduce((s, r) => s + r.net, 0), 6);
    expect(totals.revenue).toBeCloseTo(700, 6);
  });

  it("elden satışta (KDV 0, kesintisiz) net = ciro − maliyet", () => {
    const { rows } = channelProfitReport(
      [{ id: 1, channel: "elden", status: "done", createdAt: inWindow, totalAmount: "100" }],
      [{ orderId: 1, productId: 2, quantity: "1" }],
      costs,
      profiles,
      since,
    );
    // elden profili: vat 0, kesinti yok; kargo override 45/1.0 düşülür
    expect(rows[0].net).toBeCloseTo(100 - 25 - 45, 6);
  });
});
