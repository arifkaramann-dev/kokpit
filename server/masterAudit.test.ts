import { describe, expect, it } from "vitest";
import {
  findInvalidMasters,
  planCleanup,
  type AuditMaster,
  type AuditRules,
} from "./masterAudit";

const master = (p: Partial<AuditMaster> = {}): AuditMaster => ({
  id: 1,
  internalSku: "aoccndyesilsp100",
  seriesId: 10,
  colorId: 5,
  familyId: 2, // sprey
  packagingId: 1, // 100 ml
  readiness: "konsantre",
  status: "taslak",
  ...p,
});

const rules = (p: Partial<AuditRules> = {}): AuditRules => ({
  seriesPackagings: new Map(),
  seriesFamilies: new Map(),
  seriesColors: new Map(),
  familyPackagings: new Map(),
  inactiveColors: new Set(),
  inactiveFamilies: new Set(),
  inactivePackagings: new Set(),
  ...p,
});

describe("findInvalidMasters", () => {
  it("form × ambalaj uyumsuzluğunu yakalar — Sprey · 100 ml", () => {
    const v = findInvalidMasters({
      masters: [master()],
      // sprey formu yalnız 400 ml (id 3) ile üretilir
      rules: rules({ familyPackagings: new Map([[2, new Set([3])]]) }),
      historyIds: new Set(),
    });
    expect(v).toHaveLength(1);
    expect(v[0].reasons).toContain("bu form bu ambalajla üretilmiyor");
  });

  it("uyumlu master temiz geçer", () => {
    const v = findInvalidMasters({
      masters: [master({ packagingId: 3 })],
      rules: rules({ familyPackagings: new Map([[2, new Set([3])]]) }),
      historyIds: new Set(),
    });
    expect(v).toEqual([]);
  });

  it("kısıt tanımlı değilse serbest bırakır — geçiş dönemi engellenmez", () => {
    const v = findInvalidMasters({ masters: [master()], rules: rules(), historyIds: new Set() });
    expect(v).toEqual([]);
  });

  it("boş kısıt kümesi de serbest sayılır", () => {
    const v = findInvalidMasters({
      masters: [master()],
      rules: rules({ familyPackagings: new Map([[2, new Set<number>()]]) }),
      historyIds: new Set(),
    });
    expect(v).toEqual([]);
  });

  it("seriye ait olmayan rengi yakalar", () => {
    const v = findInvalidMasters({
      masters: [master()],
      rules: rules({ seriesColors: new Map([[10, new Set([7, 8])]]) }),
      historyIds: new Set(),
    });
    expect(v[0].reasons).toContain("bu renk bu seriye ait değil");
  });

  it("pasif ambalajı yakalar", () => {
    const v = findInvalidMasters({
      masters: [master()],
      rules: rules({ inactivePackagings: new Set([1]) }),
      historyIds: new Set(),
    });
    expect(v[0].reasons).toContain("ambalaj pasif");
  });

  it("birden çok sebep birlikte bildirilir", () => {
    const v = findInvalidMasters({
      masters: [master()],
      rules: rules({
        familyPackagings: new Map([[2, new Set([3])]]),
        inactivePackagings: new Set([1]),
      }),
      historyIds: new Set(),
    });
    expect(v[0].reasons).toHaveLength(2);
  });

  it("arşivdeki master denetime girmez", () => {
    const v = findInvalidMasters({
      masters: [master({ status: "arsiv" })],
      rules: rules({ familyPackagings: new Map([[2, new Set([3])]]) }),
      historyIds: new Set(),
    });
    expect(v).toEqual([]);
  });

  it("geçmişi olan master işaretlenir — silinmemeli", () => {
    const v = findInvalidMasters({
      masters: [master()],
      rules: rules({ familyPackagings: new Map([[2, new Set([3])]]) }),
      historyIds: new Set([1]),
    });
    expect(v[0].hasHistory).toBe(true);
  });
});

describe("planCleanup", () => {
  const violations = [
    { masterId: 1, internalSku: "a", reasons: ["ambalaj pasif"], hasHistory: false },
    { masterId: 2, internalSku: "b", reasons: ["ambalaj pasif"], hasHistory: true },
    { masterId: 3, internalSku: "c", reasons: ["renk pasif"], hasHistory: false },
  ];

  it("geçmişi olanı silinebilirden ayırır", () => {
    const p = planCleanup(violations);
    expect(p.deletable.map(v => v.masterId)).toEqual([1, 3]);
    expect(p.archivable.map(v => v.masterId)).toEqual([2]);
  });

  it("sebepleri sayar ve çoktan aza sıralar", () => {
    const p = planCleanup(violations);
    expect(p.byReason[0]).toEqual({ reason: "ambalaj pasif", count: 2 });
  });

  it("boş liste boş plan verir", () => {
    expect(planCleanup([])).toMatchObject({ deletable: [], archivable: [], byReason: [] });
  });
});
