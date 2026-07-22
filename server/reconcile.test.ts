import { describe, expect, it } from "vitest";
import { normalizeDate, parseBankStatement, reconcile, type LedgerTxn } from "@shared/reconcile";

describe("normalizeDate", () => {
  it("ISO'yu korur", () => {
    expect(normalizeDate("2026-05-12")).toBe("2026-05-12");
  });
  it("TR gün.ay.yıl → ISO", () => {
    expect(normalizeDate("12.05.2026")).toBe("2026-05-12");
    expect(normalizeDate("9/3/2026")).toBe("2026-03-09");
  });
  it("çözülemeyeni ham bırakır", () => {
    expect(normalizeDate("dün")).toBe("dün");
  });
});

describe("parseBankStatement", () => {
  it("başlıkları esnek eşler, TR tutarı okur", () => {
    const csv = ["Tarih;Açıklama;Tutar", "12.05.2026;GELEN HAVALE;1.250,50", "13.05.2026;KİRA;-3.000,00"].join("\n");
    const { lines, errors } = parseBankStatement(csv);
    expect(errors).toHaveLength(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ date: "2026-05-12", amount: 1250.5 });
    expect(lines[1].amount).toBe(-3000);
  });

  it("virgül ayraçlı dosyayı da anlar", () => {
    const csv = ["date,description,amount", "2026-01-02,ODEME,100.25"].join("\n");
    const { lines } = parseBankStatement(csv);
    expect(lines[0]).toMatchObject({ date: "2026-01-02", amount: 100.25, description: "ODEME" });
  });

  it("tarih/tutar sütunu yoksa hata döndürür", () => {
    const { errors } = parseBankStatement(["Ad;Soyad", "a;b"].join("\n"));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("tek satırlık (başlıksız) dosyayı reddeder", () => {
    const { errors } = parseBankStatement("Tarih;Tutar");
    expect(errors).toHaveLength(1);
  });
});

describe("reconcile", () => {
  const txns: LedgerTxn[] = [
    { id: 1, date: "2026-05-12", amount: 100, label: "Tahsilat A" },
    { id: 2, date: "2026-05-14", amount: 250, label: "Tahsilat B" },
  ];

  it("aynı gün + aynı tutar = exact", () => {
    const [m] = reconcile([{ date: "2026-05-12", description: "", amount: 100, line: 2 }], txns);
    expect(m).toMatchObject({ txnId: 1, confidence: "exact" });
  });

  it("tolerans içinde aynı tutar = amount", () => {
    const [m] = reconcile([{ date: "2026-05-12", description: "", amount: 250, line: 2 }], txns, 3);
    expect(m).toMatchObject({ txnId: 2, confidence: "amount" });
  });

  it("eşleşmeyen = none", () => {
    const [m] = reconcile([{ date: "2026-05-12", description: "", amount: 999, line: 2 }], txns);
    expect(m).toMatchObject({ txnId: null, confidence: "none" });
  });

  it("her kayıt yalnızca bir kez eşleşir", () => {
    const two = [
      { date: "2026-05-12", description: "", amount: 100, line: 2 },
      { date: "2026-05-12", description: "", amount: 100, line: 3 },
    ];
    const res = reconcile(two, txns);
    expect(res[0].txnId).toBe(1);
    expect(res[1].txnId).toBeNull();
  });

  it("tolerans dışındaki tarih eşleşmez", () => {
    const [m] = reconcile([{ date: "2026-05-30", description: "", amount: 250, line: 2 }], txns, 3);
    expect(m.confidence).toBe("none");
  });
});
