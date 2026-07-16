/**
 * P7 — Oturum güvenliği: tokenVersion tabanlı sunucu tarafı oturum iptali.
 *
 * (a) JWT'deki tokenVersion, kullanıcının DB'deki değeriyle uyuşmuyorsa
 *     oturum reddedilir.
 * (b) Geriye uyumluluk: tokenVersion alanı OLMAYAN eski JWT'ler 0 sayılır ve
 *     DB değeri 0 iken kabul edilir (deploy anında kimse düşmez).
 * (c) revokeAllSessions sonrası (DB'de tokenVersion +1) eski token reddedilir.
 */
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// ENV modülü import anında process.env'i okur; sdk'yı dinamik import etmeden
// ÖNCE secret'ı ayarla.
const TEST_SECRET = "test-secret-token-version";
process.env.JWT_SECRET = TEST_SECRET;
process.env.VITE_APP_ID = "test-app";

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(),
    upsertUser: vi.fn(async () => undefined),
    incrementTokenVersion: vi.fn(async () => 1),
  };
});

const db = await import("./db");
const { sdk } = await import("./_core/sdk");
const { appRouter } = await import("./routers");
const { COOKIE_NAME } = await import("../shared/const");
const { HttpError } = await import("../shared/_core/errors");

type DbUser = NonNullable<Awaited<ReturnType<typeof db.getUserByOpenId>>>;

const OPEN_ID = "sample-user";

function makeDbUser(tokenVersion: number): DbUser {
  return {
    id: 1,
    openId: OPEN_ID,
    name: "Sample User",
    email: "sample@example.com",
    loginMethod: "password",
    role: "user",
    tokenVersion,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as DbUser;
}

function makeRequest(token: string): Request {
  return {
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  } as unknown as Request;
}

/** tokenVersion CLAIM'İ HİÇ İÇERMEYEN eski tip JWT üretir (deploy öncesi token). */
async function signLegacyToken(): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({ openId: OPEN_ID, appId: "test-app", name: "Sample User" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(secretKey);
}

describe("tokenVersion ile oturum iptali", () => {
  it("(a) tokenVersion uyuşmazlığında oturumu reddeder", async () => {
    const token = await sdk.signSession({
      openId: OPEN_ID,
      appId: "test-app",
      name: "Sample User",
      tokenVersion: 0,
    });
    vi.mocked(db.getUserByOpenId).mockResolvedValue(makeDbUser(1));

    await expect(sdk.authenticateRequest(makeRequest(token))).rejects.toMatchObject({
      statusCode: 403,
      message: "Session revoked",
    });
  });

  it("(b) alan içermeyen eski token 0 sayılır ve kabul edilir", async () => {
    const legacyToken = await signLegacyToken();
    vi.mocked(db.getUserByOpenId).mockResolvedValue(makeDbUser(0));

    const user = await sdk.authenticateRequest(makeRequest(legacyToken));
    expect(user.openId).toBe(OPEN_ID);
  });

  it("(b2) güncel token (tokenVersion=0) DB değeri 0 iken kabul edilir", async () => {
    const token = await sdk.signSession({
      openId: OPEN_ID,
      appId: "test-app",
      name: "Sample User",
      tokenVersion: 0,
    });
    vi.mocked(db.getUserByOpenId).mockResolvedValue(makeDbUser(0));

    const user = await sdk.authenticateRequest(makeRequest(token));
    expect(user.openId).toBe(OPEN_ID);
  });

  it("(c) revokeAllSessions tokenVersion'ı artırır, cookie'yi siler ve eski token artık reddedilir", async () => {
    // Eski token: tokenVersion=0 (revoke öncesi üretilmiş).
    const oldToken = await sdk.signSession({
      openId: OPEN_ID,
      appId: "test-app",
      name: "Sample User",
      tokenVersion: 0,
    });

    // revokeAllSessions ucunu çağır (korumalı: ctx.user dolu).
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
    const ctx = {
      user: makeDbUser(0),
      req: { protocol: "https", headers: {} },
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      },
    } as unknown as Parameters<typeof appRouter.createCaller>[0];

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.revokeAllSessions();

    expect(result).toEqual({ success: true });
    expect(vi.mocked(db.incrementTokenVersion)).toHaveBeenCalledWith(OPEN_ID);
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });

    // DB artık tokenVersion=1 döndürüyor: eski token reddedilmeli.
    vi.mocked(db.getUserByOpenId).mockResolvedValue(makeDbUser(1));
    await expect(sdk.authenticateRequest(makeRequest(oldToken))).rejects.toBeInstanceOf(HttpError);
  });
});
