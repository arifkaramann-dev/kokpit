import { describe, expect, it } from "vitest";
import { listingQty, listingQtyFor } from "./capacity";

/*
 * Satış modu — "üretim yapmadan satamıyorum" şikayetinin karşılığı.
 *
 * Miktar yalnızca hammaddeden üretilebilir adetten türetiliyordu; reçetesi
 * bağlanmamış ya da hammaddesi biten her ürün ilanda 0 yazıyordu.
 */
describe("listingQtyFor", () => {
  it("varsayılan mod eski davranışı birebir korur", () => {
    for (const [buildable, cap] of [[0, 10], [3, 10], [40, 10], [7, 0]]) {
      expect(listingQtyFor({ buildable, cap })).toBe(listingQty(buildable, cap));
      expect(listingQtyFor({ salesMode: "siparis_uzerine", buildable, cap })).toBe(
        listingQty(buildable, cap),
      );
    }
  });

  it("stoktan: raftaki mamulü yazar, hammadde kapasitesine bakmaz", () => {
    // Hammadde bitmiş (buildable 0) ama rafta 6 adet var → satılabilir.
    expect(listingQtyFor({ salesMode: "stoktan", buildable: 0, cap: 10, stockQty: 6 })).toBe(6);
  });

  it("stoktan: açık siparişe ayrılanı düşer", () => {
    expect(
      listingQtyFor({ salesMode: "stoktan", buildable: 0, cap: 10, stockQty: 6, reservedQty: 4 }),
    ).toBe(2);
  });

  it("stoktan: raf boşsa 0", () => {
    expect(listingQtyFor({ salesMode: "stoktan", buildable: 99, cap: 10, stockQty: 0 })).toBe(0);
    expect(
      listingQtyFor({ salesMode: "stoktan", buildable: 5, cap: 10, stockQty: 2, reservedQty: 5 }),
    ).toBe(0);
  });

  it("stoktan: tavanı aşmaz", () => {
    expect(listingQtyFor({ salesMode: "stoktan", buildable: 0, cap: 10, stockQty: 250 })).toBe(10);
  });

  it("tedarikli: hammadde yokken bile satışta kalır", () => {
    // Tedarik sözü verilen ürün: kapasite 0 olsa da ilan açık kalmalı.
    expect(listingQtyFor({ salesMode: "tedarikli", buildable: 0, cap: 5 })).toBe(5);
  });

  it("tedarikli: tavan neyse o yazılır", () => {
    expect(listingQtyFor({ salesMode: "tedarikli", buildable: 999, cap: 3 })).toBe(3);
    expect(listingQtyFor({ salesMode: "tedarikli", buildable: 0, cap: 0 })).toBe(0);
  });

  it("negatif ve boş değerlerde 0'a düşer, patlamaz", () => {
    expect(listingQtyFor({ salesMode: "stoktan", buildable: 0, cap: 10, stockQty: -3 })).toBe(0);
    expect(listingQtyFor({ buildable: null, cap: null })).toBe(0);
  });
});
