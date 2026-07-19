import { describe, expect, it } from "vitest";
import { normalizeDate, parseBankStatement, reconcile, type LedgerTxn } from "../shared/reconcile";

describe("normalizeDate", () => {
  it("TR gün.ay.yıl → YYYY-MM-DD", () => {
    expect(normalizeDate("12.05.2026")).toBe("2026-05-12");
    expect(normalizeDate("1/2/2026")).toBe("2026-02-01");
  });
  it("ISO'yu korur ve tek haneyi doldurur", () => {
    expect(normalizeDate("2026-5-3")).toBe("2026-05-03");
  });
  it("çözemediğini ham döndürür", () => {
    expect(normalizeDate("dün")).toBe("dün");
  });
});

describe("parseBankStatement", () => {
  it("noktalı virgüllü ekstreyi okur; TR tutar ve eksi (çıkış) işaretini korur", () => {
    const csv = "Tarih;Açıklama;Tutar\n12.05.2026;Ahmet havale;1.250,00\n13.05.2026;Kira;-3.000,00";
    const { lines, errors } = parseBankStatement(csv);
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { date: "2026-05-12", description: "Ahmet havale", amount: 1250, line: 2 },
      { date: "2026-05-13", description: "Kira", amount: -3000, line: 3 },
    ]);
  });

  it("başlık esnek eşlenir (İşlem Tarihi / Hareket) ve virgül ayraçlı çalışır", () => {
    const csv = "İşlem Tarihi,Detay,Hareket Tutarı\n2026-01-02,Tahsilat,500.5";
    const { lines, errors } = parseBankStatement(csv);
    expect(errors).toEqual([]);
    expect(lines[0]).toEqual({ date: "2026-01-02", description: "Tahsilat", amount: 500.5, line: 2 });
  });

  it("tutar sütunu yoksa açıklayıcı hata döner", () => {
    const { lines, errors } = parseBankStatement("Tarih;Açıklama\n12.05.2026;X");
    expect(lines).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("okunamayan tutarlı satırı raporlayıp atlar", () => {
    const csv = "Tarih;Tutar\n12.05.2026;100\n13.05.2026;abc";
    const { lines, errors } = parseBankStatement(csv);
    expect(lines).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

describe("reconcile (ekstre ↔ kayıt eşleştirme)", () => {
  const txns: LedgerTxn[] = [
    { id: 1, date: "2026-05-12", amount: 1250, label: "Tahsilat — Ahmet" },
    { id: 2, date: "2026-05-14", amount: 900, label: "Tahsilat — Veli" },
    { id: 3, date: "2026-05-12", amount: 1250, label: "Tahsilat — ikinci 1250" },
  ];

  it("aynı gün + aynı tutar = exact", () => {
    const m = reconcile([{ date: "2026-05-12", description: "", amount: 1250, line: 2 }], txns);
    expect(m[0].confidence).toBe("exact");
    expect(m[0].txnId).toBe(1);
  });

  it("tolerans içinde (±3 gün) sadece tutar = amount", () => {
    const m = reconcile([{ date: "2026-05-12", description: "", amount: 900, line: 2 }], txns);
    expect(m[0].confidence).toBe("amount"); // kayıt 2026-05-14, 2 gün fark
    expect(m[0].txnId).toBe(2);
  });

  it("tolerans dışı tarih = eşleşmez (none)", () => {
    const m = reconcile([{ date: "2026-05-01", description: "", amount: 900, line: 2 }], txns, 3);
    expect(m[0].confidence).toBe("none");
    expect(m[0].txnId).toBeNull();
  });

  it("her kayıt yalnız bir kez eşleşir (ikinci aynı tutar diğer kayda gider)", () => {
    const m = reconcile(
      [
        { date: "2026-05-12", description: "", amount: 1250, line: 2 },
        { date: "2026-05-12", description: "", amount: 1250, line: 3 },
      ],
      txns,
    );
    expect(m[0].txnId).toBe(1);
    expect(m[1].txnId).toBe(3); // 1 kullanıldı → ikinci 1250 kaydına düşer
    expect(new Set(m.map(x => x.txnId)).size).toBe(2);
  });

  it("kuruş toleransı: 0,01 altı fark aynı sayılır, üstü sayılmaz", () => {
    const near = reconcile([{ date: "2026-05-12", description: "", amount: 1250.005, line: 2 }], txns);
    expect(near[0].txnId).toBe(1);
    const far = reconcile([{ date: "2026-05-12", description: "", amount: 1250.5, line: 2 }], txns);
    expect(far[0].confidence).toBe("none");
  });
});
