import { describe, expect, it } from "vitest";
import {
  classifyExpiry,
  daysUntilExpiry,
  DEFAULT_DELTAE_MAX,
  evaluateQc,
  filterExpiringLots,
  selectLotsFifo,
  sortLotsFifoExpiry,
  type LotLike,
} from "./lotUtils";

const day = (iso: string) => new Date(iso);
const NOW = day("2026-07-19T12:00:00Z");

describe("sortLotsFifoExpiry", () => {
  it("SKT'si en yakın olan önce; SKT'siz en sona", () => {
    const lots: LotLike[] = [
      { id: 1, remainingQty: "10", expiryDate: null, receivedDate: "2026-01-01" },
      { id: 2, remainingQty: "10", expiryDate: "2026-09-01", receivedDate: "2026-05-01" },
      { id: 3, remainingQty: "10", expiryDate: "2026-08-01", receivedDate: "2026-06-01" },
    ];
    expect(sortLotsFifoExpiry(lots).map(l => l.id)).toEqual([3, 2, 1]);
  });

  it("SKT eşitse eski giriş tarihi önce (FIFO)", () => {
    const lots: LotLike[] = [
      { id: 1, remainingQty: "5", expiryDate: "2026-08-01", receivedDate: "2026-06-10" },
      { id: 2, remainingQty: "5", expiryDate: "2026-08-01", receivedDate: "2026-06-01" },
    ];
    expect(sortLotsFifoExpiry(lots).map(l => l.id)).toEqual([2, 1]);
  });
});

describe("selectLotsFifo", () => {
  it("ihtiyacı FIFO-SKT sırasıyla partilerden böler", () => {
    const lots: LotLike[] = [
      { id: 1, remainingQty: "30", expiryDate: "2026-09-01", receivedDate: "2026-05-01" },
      { id: 2, remainingQty: "40", expiryDate: "2026-08-01", receivedDate: "2026-06-01" },
    ];
    const sel = selectLotsFifo(lots, 50);
    // Önce SKT'si yakın parti 2 (40), sonra parti 1'den 10.
    expect(sel.picks).toEqual([
      { lotId: 2, qty: 40 },
      { lotId: 1, qty: 10 },
    ]);
    expect(sel.consumed).toBe(50);
    expect(sel.shortage).toBe(0);
  });

  it("partiler yetmezse eldekini seçer, kalanı shortage döner (eksiye düşmez)", () => {
    const lots: LotLike[] = [{ id: 1, remainingQty: "20", expiryDate: null }];
    const sel = selectLotsFifo(lots, 50);
    expect(sel.consumed).toBe(20);
    expect(sel.shortage).toBe(30);
    expect(sel.picks).toEqual([{ lotId: 1, qty: 20 }]);
  });

  it("remainingQty 0 partiler atlanır", () => {
    const lots: LotLike[] = [
      { id: 1, remainingQty: "0", expiryDate: "2026-08-01" },
      { id: 2, remainingQty: "10", expiryDate: "2026-09-01" },
    ];
    const sel = selectLotsFifo(lots, 5);
    expect(sel.picks).toEqual([{ lotId: 2, qty: 5 }]);
  });

  it("ihtiyaç 0/negatifse boş seçim", () => {
    expect(selectLotsFifo([{ id: 1, remainingQty: "10" }], 0).picks).toHaveLength(0);
    expect(selectLotsFifo([{ id: 1, remainingQty: "10" }], -5).consumed).toBe(0);
  });
});

describe("classifyExpiry", () => {
  it("geçmiş SKT → expired", () => {
    expect(classifyExpiry("2026-07-01", NOW, 30)).toBe("expired");
  });
  it("30 gün içindeki SKT → soon", () => {
    expect(classifyExpiry("2026-08-10", NOW, 30)).toBe("soon");
  });
  it("uzak SKT → ok", () => {
    expect(classifyExpiry("2027-01-01", NOW, 30)).toBe("ok");
  });
  it("SKT yoksa → none", () => {
    expect(classifyExpiry(null, NOW, 30)).toBe("none");
    expect(classifyExpiry(undefined, NOW, 30)).toBe("none");
  });
});

describe("daysUntilExpiry", () => {
  it("kalan günü hesaplar, geçmişte negatif", () => {
    expect(daysUntilExpiry("2026-07-29T12:00:00Z", NOW)).toBe(10);
    expect(daysUntilExpiry("2026-07-09T12:00:00Z", NOW)).toBe(-10);
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe("filterExpiringLots", () => {
  it("eldeki partileri geçmiş/yaklaşan kovalarına ayırır, tükenmişi atlar", () => {
    const lots = [
      { id: 1, remainingQty: "5", expiryDate: "2026-07-01" }, // geçmiş
      { id: 2, remainingQty: "5", expiryDate: "2026-08-05" }, // yaklaşan
      { id: 3, remainingQty: "0", expiryDate: "2026-07-02" }, // tükenmiş → atla
      { id: 4, remainingQty: "5", expiryDate: "2027-06-01" }, // uzak → atla
      { id: 5, remainingQty: "5", expiryDate: null }, // SKT yok → atla
    ];
    const { expired, soon } = filterExpiringLots(lots, 30, NOW);
    expect(expired.map(l => l.id)).toEqual([1]);
    expect(soon.map(l => l.id)).toEqual([2]);
  });

  it("aynı kova içinde SKT'ye göre sıralı (en acil önce)", () => {
    const lots = [
      { id: 1, remainingQty: "5", expiryDate: "2026-08-15" },
      { id: 2, remainingQty: "5", expiryDate: "2026-07-25" },
    ];
    expect(filterExpiringLots(lots, 30, NOW).soon.map(l => l.id)).toEqual([2, 1]);
  });
});

describe("evaluateQc", () => {
  it("tüm ölçülenler sınırda → gecti", () => {
    const e = evaluateQc(
      { ph: 7, viscosity: 90, deltaE: 1.2 },
      { ph: [6, 8], viscosity: [80, 120], deltaEMax: DEFAULT_DELTAE_MAX },
    );
    expect(e.result).toBe("gecti");
    expect(e.checked).toBe(3);
    expect(e.failures).toHaveLength(0);
  });

  it("bir ölçüm sınırı aşarsa → kaldi + açıklama", () => {
    const e = evaluateQc({ deltaE: 3.5 }, { deltaEMax: 2 });
    expect(e.result).toBe("kaldi");
    expect(e.failures[0]).toContain("ΔE");
  });

  it("pH aralık dışıysa kaldi", () => {
    const e = evaluateQc({ ph: 4 }, { ph: [6, 8] });
    expect(e.result).toBe("kaldi");
  });

  it("spec yoksa / eşleşen ölçüm yoksa → beklemede", () => {
    expect(evaluateQc({ ph: 7 }, {}).result).toBe("beklemede");
    expect(evaluateQc({}, { ph: [6, 8] }).result).toBe("beklemede");
    expect(evaluateQc({ ph: 7 }, {}).checked).toBe(0);
  });

  it("string ölçümleri de kabul eder (form input'u)", () => {
    const e = evaluateQc({ deltaE: "1.0" }, { deltaEMax: 2 });
    expect(e.result).toBe("gecti");
  });
});
