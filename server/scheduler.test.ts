import { describe, expect, it } from "vitest";
import { isDailyDue, isIntervalDue, istanbulDateString, istanbulHour } from "./scheduler";
import { createInflightGate } from "./syncLock";
import { isTokenRevoked } from "./authUtils";

describe("scheduler vade mantığı", () => {
  it("aralıklı iş: aralık dolmadan koşmaz, dolunca koşar", () => {
    const t0 = 1_000_000;
    const interval = 15 * 60 * 1000;
    expect(isIntervalDue(t0, t0 + interval - 1, interval)).toBe(false);
    expect(isIntervalDue(t0, t0 + interval, interval)).toBe(true);
    // hiç koşmamış (0) → hemen vadesi gelmiş sayılır
    expect(isIntervalDue(0, t0, interval)).toBe(true);
  });

  it("günlük iş: saat gelmeden koşmaz, aynı gün ikinci kez koşmaz", () => {
    expect(isDailyDue(undefined, "2026-07-21", 7, 8)).toBe(false); // saat erken
    expect(isDailyDue(undefined, "2026-07-21", 8, 8)).toBe(true); // vakti geldi
    expect(isDailyDue("2026-07-21", "2026-07-21", 9, 8)).toBe(false); // bugün koştu
    expect(isDailyDue("2026-07-20", "2026-07-21", 8, 8)).toBe(true); // yeni gün
  });

  it("istanbulHour gece yarısını 0 döndürür (h24 '24' hatası regresyonu)", () => {
    // 21:00 UTC = İstanbul 00:00 (UTC+3)
    const midnightTR = new Date("2026-07-20T21:00:00Z");
    expect(istanbulHour(midnightTR)).toBe(0);
    expect(istanbulDateString(midnightTR)).toBe("2026-07-21");
  });
});

describe("senkron kilidi (createInflightGate)", () => {
  it("süren iş varken gelen çağrılar aynı sonucu paylaşır, ikinci çalıştırma başlatmaz", async () => {
    let runs = 0;
    let release!: (v: string) => void;
    const gate = createInflightGate(
      () =>
        new Promise<string>(res => {
          runs += 1;
          release = res;
        }),
    );
    const p1 = gate();
    const p2 = gate();
    expect(runs).toBe(1);
    release("ok");
    expect(await p1).toBe("ok");
    expect(await p2).toBe("ok");
    expect(p1).toBe(p2);
  });

  it("iş bitince kilit açılır: sonraki çağrı yeni çalıştırma başlatır", async () => {
    let runs = 0;
    const gate = createInflightGate(async () => {
      runs += 1;
      return runs;
    });
    expect(await gate()).toBe(1);
    expect(await gate()).toBe(2);
  });

  it("iş hata verirse de kilit açılır (takılı kalmaz)", async () => {
    let fail = true;
    const gate = createInflightGate(async () => {
      if (fail) throw new Error("patladı");
      return "tamam";
    });
    await expect(gate()).rejects.toThrow("patladı");
    fail = false;
    expect(await gate()).toBe("tamam");
  });
});

describe("oturum iptali (isTokenRevoked)", () => {
  const revokedAt = Date.parse("2026-07-21T10:00:00Z");
  it("iptal yoksa her token geçerli", () => {
    expect(isTokenRevoked(0, 123)).toBe(false);
    expect(isTokenRevoked(0, undefined)).toBe(false);
  });
  it("iptalden önce imzalanan token düşer, sonra imzalanan geçer", () => {
    const before = Math.floor((revokedAt - 60_000) / 1000);
    const after = Math.floor((revokedAt + 60_000) / 1000);
    expect(isTokenRevoked(revokedAt, before)).toBe(true);
    expect(isTokenRevoked(revokedAt, after)).toBe(false);
  });
  it("iat taşımayan eski token iptal kapsamındadır", () => {
    expect(isTokenRevoked(revokedAt, undefined)).toBe(true);
  });
});
