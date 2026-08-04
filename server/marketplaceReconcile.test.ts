import { describe, expect, it } from "vitest";
import { reconcileCatalogs, reconcileSummary } from "./marketplaceReconcile";

const remote = (barcode: string, extra: Partial<Parameters<typeof reconcileCatalogs>[1][0]> = {}) => ({
  barcode,
  title: `Uzak ${barcode}`,
  stockCode: "",
  approved: true,
  onSale: true,
  quantity: 1,
  salePrice: 100,
  ...extra,
});

const local = (id: number, barcode: string, sku = "") => ({
  channelListingId: id,
  barcode,
  sku,
  title: `Yerel ${id}`,
});

/**
 * Yanlış eşleştirme pahalı: bağlanan ürün, sonraki güncellemede BAŞKA bir
 * ürünün başlığını/görselini ezer. Testler eşleşmeyi olduğu kadar
 * eşleşmemeyi de korur.
 */
describe("reconcileCatalogs", () => {
  it("barkodu tutanları eşleştirir", () => {
    const r = reconcileCatalogs([local(1, "299001")], [remote("299001")]);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].local.channelListingId).toBe(1);
    expect(r.onlyRemote).toEqual([]);
    expect(r.onlyLocal).toEqual([]);
  });

  it("yalnız pazaryerinde olanı ayırır", () => {
    const r = reconcileCatalogs([], [remote("299002")]);
    expect(r.onlyRemote).toHaveLength(1);
    expect(r.onlyRemote[0].skuCandidate).toBeNull();
  });

  it("yalnız bizde olanı ayırır", () => {
    const r = reconcileCatalogs([local(5, "299003")], []);
    expect(r.onlyLocal).toHaveLength(1);
    expect(r.onlyLocal[0].channelListingId).toBe(5);
  });

  it("barkod tutmazsa stok kodunu aday gösterir — otomatik bağlamaz", () => {
    const r = reconcileCatalogs(
      [local(7, "farkli-barkod", "tren000001")],
      [remote("299004", { stockCode: "tren000001" })],
    );
    // Eşleşmiş SAYILMAZ: barkod tutmuyor.
    expect(r.matched).toEqual([]);
    expect(r.onlyRemote[0].skuCandidate?.channelListingId).toBe(7);
    // Yerel taraf hâlâ bağlanmamış kabul edilir.
    expect(r.onlyLocal.map(l => l.channelListingId)).toContain(7);
  });

  it("boş barkodlar birbirine eşleşmez", () => {
    // Boş barkodlar eşit sayılsaydı rastgele eşleşme üretirdi.
    const r = reconcileCatalogs([local(1, ""), local(2, "")], [remote("")]);
    expect(r.matched).toEqual([]);
  });

  it("büyük/küçük harf ve boşluk farkını yutar", () => {
    const r = reconcileCatalogs([local(1, " ABC123 ")], [remote("abc123")]);
    expect(r.matched).toHaveLength(1);
  });

  it("aynı yerel ilanı iki uzak ürüne birden vermez", () => {
    const r = reconcileCatalogs(
      [local(1, "299005", "sku-1")],
      [remote("299005"), remote("299006", { stockCode: "sku-1" })],
    );
    expect(r.matched).toHaveLength(1);
    // Barkodla zaten bağlandı; ikinci ürüne aday olarak sunulmamalı.
    expect(r.onlyRemote[0].skuCandidate).toBeNull();
  });

  it("özet sayıları doğru verir", () => {
    const r = reconcileCatalogs(
      [local(1, "a"), local(2, "b"), local(3, "c", "sku-x")],
      [remote("a"), remote("z", { stockCode: "sku-x" })],
    );
    expect(reconcileSummary(r)).toEqual({
      matched: 1,
      onlyRemote: 1,
      onlyLocal: 2,
      linkable: 1,
    });
  });
});
