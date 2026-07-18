import { describe, expect, it } from "vitest";
import { matchProductByName } from "./marketplaceQuestions";
import { mapTrendyolQuestion, type TrendyolQuestion } from "./trendyol";

function sampleQuestion(overrides: Partial<TrendyolQuestion> = {}): TrendyolQuestion {
  return {
    id: 55123,
    text: "Bu boya plastik tampona uygun mu?",
    status: "WAITING_FOR_ANSWER",
    creationDate: 1720000000000,
    productName: "Kırmızı Metalik Sprey 400ml",
    userName: "Mehmet K.",
    showUserName: true,
    ...overrides,
  };
}

describe("Trendyol sorusu → kuyruk kaydı eşlemesi", () => {
  it("temel alanları doğru eşler", () => {
    const q = mapTrendyolQuestion(sampleQuestion());
    expect(q).not.toBeNull();
    expect(q!.source).toBe("trendyol");
    expect(q!.externalId).toBe("55123");
    expect(q!.customerName).toBe("Mehmet K.");
    expect(q!.questionText).toBe("Bu boya plastik tampona uygun mu?");
    expect(q!.productName).toBe("Kırmızı Metalik Sprey 400ml");
  });

  it("boş/boşluk metinli soruları atlar (null döner)", () => {
    expect(mapTrendyolQuestion(sampleQuestion({ text: "   " }))).toBeNull();
    expect(mapTrendyolQuestion(sampleQuestion({ text: "" }))).toBeNull();
  });

  it("müşteri adı gizliyse (showUserName=false) adı boş bırakır", () => {
    const q = mapTrendyolQuestion(sampleQuestion({ showUserName: false }));
    expect(q!.customerName).toBeNull();
  });

  it("ürün adı yoksa null bırakır", () => {
    const q = mapTrendyolQuestion(sampleQuestion({ productName: null }));
    expect(q!.productName).toBeNull();
  });
});

describe("matchProductByName", () => {
  const products = [
    { id: 1, name: "Kırmızı Metalik Sprey 400ml" },
    { id: 2, name: "Sprey Vernik" },
    { id: 3, name: "Mavi Airbrush Boya 50ml" },
  ];

  it("birebir isimle eşleşir", () => {
    expect(matchProductByName(products, "Sprey Vernik")?.id).toBe(2);
  });

  it("büyük/küçük harf ve Türkçe karakterden bağımsız eşleşir", () => {
    expect(matchProductByName(products, "kırmızı metalik sprey 400ml")?.id).toBe(1);
  });

  it("içerme ile en spesifik (en uzun) eşleşmeyi seçer", () => {
    // "Kırmızı Metalik Sprey 400ml" hem kendini hem "Sprey"i içerir; daha uzun kazanır.
    expect(matchProductByName(products, "Kırmızı Metalik Sprey 400ml stok var mı?")?.id).toBe(1);
  });

  it("eşleşme yoksa veya isim boşsa null döner", () => {
    expect(matchProductByName(products, "Yeşil Guaj Boya")).toBeNull();
    expect(matchProductByName(products, null)).toBeNull();
    expect(matchProductByName(products, "  ")).toBeNull();
  });
});
