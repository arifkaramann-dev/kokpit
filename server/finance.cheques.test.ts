import { describe, expect, it } from "vitest";
import { overdueCheques, type ChequeLike } from "./financeUtils";

const now = new Date("2026-07-22T00:00:00Z");

const base: Omit<ChequeLike, "id" | "direction" | "dueDate" | "amount" | "status"> = { type: "cek", partyName: "X" };

describe("overdueCheques", () => {
  const cheques: ChequeLike[] = [
    { ...base, id: 1, direction: "alinan", status: "portfoyde", dueDate: "2026-07-10", amount: "1000" }, // 12g
    { ...base, id: 2, direction: "verilen", status: "portfoyde", dueDate: "2026-07-01", amount: "500" }, // 21g
    { ...base, id: 3, direction: "alinan", status: "tahsil", dueDate: "2026-06-01", amount: "9999" }, // tahsil edilmiş
    { ...base, id: 4, direction: "alinan", status: "portfoyde", dueDate: null, amount: "100" }, // vadesiz
    { ...base, id: 5, direction: "alinan", status: "portfoyde", dueDate: "2026-08-01", amount: "200" }, // gelecek
    { ...base, id: 6, direction: "alinan", status: "portfoyde", dueDate: "2026-07-20", amount: "300" }, // 2g
  ];

  it("yalnızca portföyde + vadesi geçmişleri alır, yönlere ayırır", () => {
    const r = overdueCheques(cheques, now);
    expect(r.incoming.map(c => c.id)).toEqual([1, 6]); // en eski önce
    expect(r.outgoing.map(c => c.id)).toEqual([2]);
  });

  it("tahsil/vadesiz/gelecek olanları hariç tutar", () => {
    const ids = overdueCheques(cheques, now).incoming.map(c => c.id);
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
  });

  it("gün ve toplamları doğru hesaplar", () => {
    const r = overdueCheques(cheques, now);
    expect(r.incoming[0]).toMatchObject({ id: 1, daysOverdue: 12, amount: 1000 });
    expect(r.totalIncoming).toBe(1300);
    expect(r.totalOutgoing).toBe(500);
  });

  it("boş girişte boş sonuç", () => {
    expect(overdueCheques([], now)).toMatchObject({ incoming: [], outgoing: [], totalIncoming: 0, totalOutgoing: 0 });
  });

  it("isimsiz çeki güvenli etiketler", () => {
    const r = overdueCheques([{ ...base, id: 9, partyName: null, direction: "verilen", status: "portfoyde", dueDate: "2026-07-01", amount: "10" }], now);
    expect(r.outgoing[0].partyName).toBe("(isimsiz)");
  });
});
