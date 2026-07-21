import { COOKIE_NAME } from "@shared/const";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Local email/password login for running the app outside Manus.
 * Credentials come from OWNER_EMAIL / OWNER_PASSWORD env vars; a successful
 * login mints the same JWT session cookie the OAuth flow uses, so the rest
 * of the auth stack (sdk.authenticateRequest, tRPC context) works unchanged.
 */

export const LOCAL_OWNER_OPEN_ID = "local-owner";

// Oturum ömrü: 1 yıl → 30 gün (Sprint 2 güvenlik sertleştirmesi). Günlük kullanan
// tek sahip için yeterince uzun; çalınan token'ın ömrünü ciddi kısaltır.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

// Minimal in-memory brute-force guard: 10 failed attempts per IP per 15 minutes.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string) {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    if (!ENV.ownerEmail || !ENV.ownerPassword) {
      res.status(501).json({
        error: "Giriş yapılandırılmamış: OWNER_EMAIL ve OWNER_PASSWORD ortam değişkenlerini ayarlayın.",
      });
      return;
    }

    const ip = req.ip ?? "unknown";
    if (isRateLimited(ip)) {
      res.status(429).json({ error: "Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin." });
      return;
    }

    const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const emailOk =
      typeof email === "string" &&
      safeEqual(email.trim().toLowerCase(), ENV.ownerEmail.trim().toLowerCase());
    const passwordOk = typeof password === "string" && safeEqual(password, ENV.ownerPassword);

    if (!emailOk || !passwordOk) {
      recordFailure(ip);
      res.status(401).json({ error: "E-posta veya şifre hatalı." });
      return;
    }

    const name = ENV.ownerName || "Yönetici";
    try {
      await db.upsertUser({
        openId: LOCAL_OWNER_OPEN_ID,
        name,
        email: ENV.ownerEmail,
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      });
    } catch (error) {
      console.error("[Auth] Failed to upsert owner user:", error);
      res.status(500).json({ error: "Veritabanına ulaşılamadı. DATABASE_URL ayarlı mı?" });
      return;
    }

    const sessionToken = await sdk.signSession(
      { openId: LOCAL_OWNER_OPEN_ID, appId: ENV.appId || "local", name },
      { expiresInMs: SESSION_TTL_MS }
    );

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });
    res.json({ success: true });
  });
}
