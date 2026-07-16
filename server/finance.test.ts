import { describe, expect, it } from "vitest";
import {
  collectionTotal,
  computeAccountBalance,
  computeCustomerBalances,
  computeOverdueReceivables,
  computeSupplierBalances,
  computeVatReport,
  paymentStateFor,
  singleFlight,
  toNum,
} from "./financeUtils";

describe("toNum — decimal kolon okuma", () => {
  it("string decimal'i sayıya çevirir; null/boş/bozuk 0 olur", () => {
    expect(toNum("129.90")).toBe(129.9);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
  });
});

describe("computeCustomerBalances — müşteri cari çekirdeği", () => {
  const customers = [{ id: 1, name: "Ahmet Yılmaz" }];

  it("adı değişen müşteride ID sayesinde bakiye bölünmez (güncel ad altında toplanır)", () => {
    const out = computeCustomerBalances({
      customers, // güncel ad: "Ahmet Yılmaz" — eski kayıtlar "Ahmet" adıyla yazılmış
      orders: [
        { name: "Ahmet", customerId: 1, total: "100.00", status: "done" },
        { name: "AHMET YILMAZ", customerId: 1, total: "50.00", status: "new" },
      ],
      transactions: [
        { name: "Ahmet", customerId: 1, direction: "in", amount: "30.00", category: "tahsilat" },
      ],
    });
    expect(out).toEqual({ "ahmet yılmaz": 120 });
  });

  it("ID'siz eski kayıt isim fallback ile yaşar (trim + TR küçük harf)", () => {
    const out = computeCustomerBalances({
      customers,
      orders: [{ name: "  İDİL BOYA  ", customerId: null, total: "200.00", status: "new" }],
      transactions: [{ name: "idil boya", customerId: null, direction: "in", amount: "80.00", category: "tahsilat" }],
    });
    // "İ" → "i" (tr-TR): iki yazım aynı anahtara düşer, bakiye bölünmez.
    expect(out).toEqual({ "idil boya": 120 });
  });

  it("iptal (cancelled) sipariş borç doğurmaz", () => {
    const out = computeCustomerBalances({
      customers,
      orders: [
        { name: "Ahmet", customerId: 1, total: "100.00", status: "cancelled" },
        { name: "Ahmet", customerId: 1, total: "40.00", status: "done" },
      ],
      transactions: [],
    });
    expect(out).toEqual({ "ahmet yılmaz": 40 });
  });

  it("tahsilat dışı hareketler cariyi etkilemez; iade (out tahsilat) borcu geri artırır", () => {
    const out = computeCustomerBalances({
      customers,
      orders: [{ name: "Ahmet", customerId: 1, total: "100.00", status: "done" }],
      transactions: [
        { name: "Ahmet", customerId: 1, direction: "in", amount: "999.00", category: "diğer" }, // sayılmaz
        { name: "Ahmet", customerId: 1, direction: "in", amount: "60.00", category: "tahsilat" },
        { name: "Ahmet", customerId: 1, direction: "out", amount: "10.00", category: "tahsilat" }, // iade
      ],
    });
    expect(out["ahmet yılmaz"]).toBeCloseTo(50, 10);
  });

  it("adı ve ID'si olmayan kayıtlar atlanır", () => {
    const out = computeCustomerBalances({
      customers: [],
      orders: [{ name: "   ", customerId: null, total: "100.00", status: "done" }],
      transactions: [{ name: null, customerId: null, direction: "in", amount: "5.00", category: "tahsilat" }],
    });
    expect(out).toEqual({});
  });
});

describe("computeSupplierBalances — tedarikçi cari çekirdeği", () => {
  const suppliers = [{ id: 7, name: "Kimya A.Ş." }];

  it("alış borç, ödeme (out) düşer, iade/tahsil (in) borcu artırır; ID kanonik", () => {
    const out = computeSupplierBalances({
      suppliers,
      purchases: [
        { name: "Kimya", supplierId: 7, total: "1000.00" }, // eski ad, ID'yle birleşir
        { name: "kimya a.ş.", supplierId: null, total: "200.00" }, // ID'siz, isimle aynı anahtara düşer
      ],
      transactions: [
        { name: "Kimya", supplierId: 7, direction: "out", amount: "300.00" }, // ödeme
        { name: "Kimya", supplierId: 7, direction: "in", amount: "50.00" }, // iade/alacak
      ],
    });
    expect(out).toEqual({ "kimya a.ş.": 1000 + 200 - 300 + 50 });
  });

  it("ID'siz eski kayıt isim fallback ile ayrı cari olarak yaşar", () => {
    const out = computeSupplierBalances({
      suppliers,
      purchases: [{ name: "Ambalaj Ltd", supplierId: null, total: "500.00" }],
      transactions: [{ name: "Ambalaj Ltd", supplierId: null, direction: "out", amount: "500.00" }],
    });
    expect(out).toEqual({ "ambalaj ltd": 0 });
  });
});

describe("computeVatReport — KDV raporu çekirdeği", () => {
  // Sabit "şimdi": 16 Temmuz 2026 → ay sınırı 1 Tem 2026 00:00, yıl sınırı 1 Oca 2026 00:00 (yerel).
  const now = new Date(2026, 6, 16, 12, 0, 0);

  it("ay/yıl sınırındaki siparişler doğru döneme düşer", () => {
    const r = computeVatReport({
      rateValue: "20",
      now,
      orders: [
        { total: "120.00", date: new Date(2026, 6, 1, 0, 0, 0), status: "done" }, // tam ay başı → ay + yıl
        { total: "240.00", date: new Date(2026, 5, 30, 23, 59, 59), status: "done" }, // ay dışı, yıl içi
        { total: "600.00", date: new Date(2025, 11, 31, 23, 59, 59), status: "done" }, // geçen yıl → hiçbiri
        { total: "360.00", date: new Date(2026, 0, 1, 0, 0, 0), status: "done" }, // tam yıl başı → yıl
      ],
      purchases: [],
    });
    expect(r.month.salesGross).toBe(120);
    expect(r.year.salesGross).toBe(120 + 240 + 360);
    // KDV dahil 120 @ %20 → KDV 20.
    expect(r.month.salesVat).toBeCloseTo(20, 10);
  });

  it("iptal sipariş matraha girmez", () => {
    const r = computeVatReport({
      rateValue: "20",
      now,
      orders: [
        { total: "120.00", date: now, status: "cancelled" },
        { total: "120.00", date: now, status: "done" },
      ],
      purchases: [],
    });
    expect(r.month.salesGross).toBe(120);
    expect(r.year.salesGross).toBe(120);
  });

  it("alış KDV'si düşülür; fatura tarihi yoksa kayıt tarihi kullanılır", () => {
    const r = computeVatReport({
      rateValue: "20",
      now,
      orders: [{ total: "240.00", date: now, status: "done" }],
      purchases: [
        { total: "120.00", date: null, created: now }, // fallback: created bu ay
        { total: "60.00", date: new Date(2026, 4, 10), created: now }, // fatura tarihi Mayıs → ay dışı, yıl içi
      ],
    });
    expect(r.month.buyGross).toBe(120);
    expect(r.year.buyGross).toBe(180);
    // Ay: satış KDV 40 − alış KDV 20 = 20 ödenecek.
    expect(r.month.payable).toBeCloseTo(20, 10);
    expect(r.year.payable).toBeCloseTo(40 - 30, 10);
  });

  it("oran ayarı boş/bozuksa %20 varsayılır; geçerli oran uygulanır", () => {
    const empty = computeVatReport({ rateValue: undefined, now, orders: [], purchases: [] });
    expect(empty.rate).toBe(20);
    const bad = computeVatReport({ rateValue: "abc", now, orders: [], purchases: [] });
    expect(bad.rate).toBe(20);
    const ten = computeVatReport({
      rateValue: "10",
      now,
      orders: [{ total: "110.00", date: now, status: "done" }],
      purchases: [],
    });
    expect(ten.rate).toBe(10);
    expect(ten.month.salesVat).toBeCloseTo(10, 10);
  });
});

describe("collectionTotal + paymentStateFor — tahsilat→ödeme durumu senkronu", () => {
  it("yalnız tahsilat kategorisi sayılır; in − out", () => {
    expect(
      collectionTotal([
        { amount: "60.00", direction: "in", category: "tahsilat" },
        { amount: "10.00", direction: "out", category: "tahsilat" },
        { amount: "500.00", direction: "in", category: "diğer" },
      ]),
    ).toBeCloseTo(50, 10);
  });

  it("kısmi ödeme → partial, tamamlanınca → paid geçişi", () => {
    expect(paymentStateFor(100, 40)).toEqual({ paidAmount: 40, status: "partial" });
    expect(paymentStateFor(100, 100)).toEqual({ paidAmount: 100, status: "paid" });
  });

  it("kuruş toleransı: toplamın 0,001 yakınına gelen tahsilat paid sayılır", () => {
    expect(paymentStateFor(100, 99.9995).status).toBe("paid");
    expect(paymentStateFor(100, 99.99).status).toBe("partial");
  });

  it("fazla ödeme paid kalır ve ödenen tutar olduğu gibi korunur", () => {
    expect(paymentStateFor(100, 150)).toEqual({ paidAmount: 150, status: "paid" });
  });

  it("sıfır/negatif net tahsilat unpaid; paidAmount asla negatif yazılmaz", () => {
    expect(paymentStateFor(100, 0)).toEqual({ paidAmount: 0, status: "unpaid" });
    expect(paymentStateFor(100, -25)).toEqual({ paidAmount: 0, status: "unpaid" });
  });
});

describe("computeOverdueReceivables — Tahsilat Takipçisi (30+ gün gecikmiş alacak)", () => {
  // Sabit "şimdi": 16 Temmuz 2026 12:00 (yerel). 30 gün sınırı = 16 Haziran 12:00.
  const now = new Date(2026, 6, 16, 12, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
  const customers = [{ id: 1, name: "Ahmet Yılmaz" }];
  const order = (over: Partial<Parameters<typeof computeOverdueReceivables>[0]["orders"][number]>) => ({
    name: "Ahmet",
    customerId: 1,
    total: "100.00",
    status: "done",
    paymentStatus: "unpaid",
    paidAmount: "0",
    createdAt: daysAgo(45),
    ...over,
  });

  it("30 gün sınırı DAHİL: tam 30 gün önceki sipariş gecikmiş, 30 güne 1 sn kala değil", () => {
    const out = computeOverdueReceivables({
      customers,
      transactions: [],
      now,
      orders: [
        order({ createdAt: daysAgo(30) }), // tam sınır → gecikmiş
        order({ createdAt: new Date(now.getTime() - 30 * DAY + 1000), total: "999.00" }), // 29,99 gün → değil
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].overdueAmount).toBe(100);
    expect(out[0].overdueDays).toBe(30);
  });

  it("kısmi ödemede yalnız KALAN gecikmiş sayılır", () => {
    const out = computeOverdueReceivables({
      customers,
      transactions: [{ name: "Ahmet", customerId: 1, direction: "in", amount: "60.00", category: "tahsilat" }],
      now,
      orders: [order({ paymentStatus: "partial", paidAmount: "60.00" })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].overdueAmount).toBeCloseTo(40, 10);
  });

  it("iptal (cancelled) ve paid siparişler listeye girmez", () => {
    const out = computeOverdueReceivables({
      customers,
      transactions: [],
      now,
      orders: [
        order({ status: "cancelled" }),
        order({ paymentStatus: "paid", paidAmount: "100.00" }),
      ],
    });
    expect(out).toEqual([]);
  });

  it("en eski sipariş tarihi ve gün sayısı seçilir; adet ve toplam doğru", () => {
    const out = computeOverdueReceivables({
      customers,
      transactions: [],
      now,
      orders: [
        order({ createdAt: daysAgo(35), total: "100.00" }),
        order({ createdAt: daysAgo(90), total: "50.00" }), // en eski
        order({ createdAt: daysAgo(10), total: "999.00" }), // 30 gün altı → sayılmaz
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].orderCount).toBe(2);
    expect(out[0].overdueAmount).toBe(150);
    expect(out[0].overdueDays).toBe(90);
    expect(out[0].oldestOrderDate.getTime()).toBe(daysAgo(90).getTime());
    expect(out[0].name).toBe("Ahmet Yılmaz"); // ID → carinin güncel adı
  });

  it("siparişe bağlanmadan işlenmiş tahsilat cari bakiyeden düşer: kapanmış cari listeye girmez, kısmi kapanan tutarı sınırlar", () => {
    // Sipariş 100 TL unpaid duruyor ama 100 TL tahsilat siparişsiz işlenmiş → bakiye 0.
    const kapali = computeOverdueReceivables({
      customers,
      transactions: [{ name: "Ahmet", customerId: 1, direction: "in", amount: "100.00", category: "tahsilat" }],
      now,
      orders: [order({})],
    });
    expect(kapali).toEqual([]);
    // 70 TL siparişsiz tahsilat → bakiye 30: gecikmiş tutar 100 değil 30 raporlanır.
    const kismi = computeOverdueReceivables({
      customers,
      transactions: [{ name: "Ahmet", customerId: 1, direction: "in", amount: "70.00", category: "tahsilat" }],
      now,
      orders: [order({})],
    });
    expect(kismi).toHaveLength(1);
    expect(kismi[0].overdueAmount).toBeCloseTo(30, 10);
  });

  it("birden çok müşteri gecikmiş tutara göre azalan sıralanır", () => {
    const out = computeOverdueReceivables({
      customers: [],
      transactions: [],
      now,
      orders: [
        order({ name: "Küçük", customerId: null, total: "50.00" }),
        order({ name: "Büyük", customerId: null, total: "500.00" }),
      ],
    });
    expect(out.map(c => c.name)).toEqual(["Büyük", "Küçük"]);
  });
});

describe("computeAccountBalance — kasa/banka bakiyesi", () => {
  it("açılış + gelen − giden; transfer hareketleri de in/out olarak dahil", () => {
    const bal = computeAccountBalance({ id: 1, openingBalance: "1000.00" }, [
      { accountId: 1, direction: "in", amount: "250.00" }, // tahsilat
      { accountId: 1, direction: "out", amount: "100.00" }, // ödeme
      { accountId: 1, direction: "in", amount: "50.00" }, // transfer girişi
      { accountId: 2, direction: "in", amount: "999.00" }, // başka hesap
      { accountId: null, direction: "out", amount: "999.00" }, // hesapsız hareket
    ]);
    expect(bal).toBeCloseTo(1000 + 250 - 100 + 50, 10);
  });

  it("boş açılış bakiyesi 0 sayılır", () => {
    expect(computeAccountBalance({ id: 3, openingBalance: null }, [])).toBe(0);
  });
});

describe("singleFlight — pazaryeri senkron tek-uçuş kilidi", () => {
  it("eşzamanlı iki çağrı tek uçuş yapar ve aynı sonucu paylaşır", async () => {
    let runs = 0;
    let release!: (v: string) => void;
    const gate = new Promise<string>(res => (release = res));
    const sync = singleFlight(async () => {
      runs++;
      return gate;
    });
    const p1 = sync();
    const p2 = sync(); // uçuş sürerken gelen ikinci çağrı
    expect(p2).toBe(p1); // aynı promise paylaşılır
    release("sonuc");
    await expect(p1).resolves.toBe("sonuc");
    await expect(p2).resolves.toBe("sonuc");
    expect(runs).toBe(1);
  });

  it("uçuş bitince kilit açılır; sonraki çağrı yeni çalıştırma başlatır", async () => {
    let runs = 0;
    const sync = singleFlight(async () => ++runs);
    await sync();
    await sync();
    expect(runs).toBe(2);
  });

  it("hata da kilidi açar: başarısız uçuştan sonra tekrar denenebilir", async () => {
    let runs = 0;
    const sync = singleFlight(async () => {
      runs++;
      if (runs === 1) throw new Error("pazaryeri hatası");
      return "tamam";
    });
    await expect(sync()).rejects.toThrow("pazaryeri hatası");
    await expect(sync()).resolves.toBe("tamam");
    expect(runs).toBe(2);
  });
});
