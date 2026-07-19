import crypto from "node:crypto";
import { ENV } from "./_core/env";

/**
 * PAYTR iFrame API entegrasyonu (kendi web mağazasının kartla ödemesi).
 * Anahtarlar yalnızca Render → Environment'ta; repoya girmez. Anahtar yoksa
 * mağaza "havale/kapıda ödeme" akışına düşer (bu modül çağrılmaz).
 * Belgeler: dev.paytr.com → iFrame API.
 */

const PAYTR_TOKEN_URL = process.env.PAYTR_TOKEN_URL ?? "https://www.paytr.com/odeme/api/get-token";

export function isPaytrConfigured(): boolean {
  return Boolean(ENV.paytrMerchantId && ENV.paytrMerchantKey && ENV.paytrMerchantSalt);
}

export type PaytrBasketItem = { name: string; price: number; quantity: number };

export type PaytrTokenParams = {
  merchantOid: string; // sipariş no (yalnızca harf/rakam)
  email: string;
  paymentAmountKurus: number; // KDV dahil toplam, KURUŞ cinsinden
  userName: string;
  userAddress: string;
  userPhone: string;
  userIp: string;
  basket: PaytrBasketItem[];
  okUrl: string;
  failUrl: string;
  testMode?: boolean;
};

/** PAYTR user_basket alanı: [[ad, birim fiyat(TL, string), adet], ...] base64(JSON). */
export function encodeBasket(basket: PaytrBasketItem[]): string {
  const arr = basket.map(i => [i.name, i.price.toFixed(2), i.quantity]);
  return Buffer.from(JSON.stringify(arr)).toString("base64");
}

/**
 * PAYTR paytr_token'ını üretir (HMAC-SHA256 → base64). Saf/deterministik olduğu
 * için testlerde doğrulanır. Sıra PAYTR'ın beklediği sıradır; değiştirilmez.
 */
export function buildPaytrToken(p: PaytrTokenParams, basketB64: string): string {
  const testMode = p.testMode ? "1" : "0";
  const noInstallment = "0";
  const maxInstallment = "0";
  const currency = "TL";
  const hashStr =
    ENV.paytrMerchantId +
    p.userIp +
    p.merchantOid +
    p.email +
    String(p.paymentAmountKurus) +
    basketB64 +
    noInstallment +
    maxInstallment +
    currency +
    testMode +
    ENV.paytrMerchantSalt;
  return crypto.createHmac("sha256", ENV.paytrMerchantKey).update(hashStr).digest("base64");
}

/**
 * PAYTR'dan iframe token'ı alır. Başarılıysa mağaza bu token'la
 * `https://www.paytr.com/odeme/guvenli/<token>` iframe'ini gösterir.
 */
export async function getPaytrIframeToken(p: PaytrTokenParams): Promise<string> {
  if (!isPaytrConfigured()) {
    throw new Error("PAYTR yapılandırılmamış (PAYTR_MERCHANT_ID/KEY/SALT gerekli).");
  }
  const basketB64 = encodeBasket(p.basket);
  const paytrToken = buildPaytrToken(p, basketB64);
  const body = new URLSearchParams({
    merchant_id: ENV.paytrMerchantId,
    user_ip: p.userIp,
    merchant_oid: p.merchantOid,
    email: p.email,
    payment_amount: String(p.paymentAmountKurus),
    paytr_token: paytrToken,
    user_basket: basketB64,
    debug_on: "0",
    no_installment: "0",
    max_installment: "0",
    user_name: p.userName,
    user_address: p.userAddress,
    user_phone: p.userPhone,
    merchant_ok_url: p.okUrl,
    merchant_fail_url: p.failUrl,
    timeout_limit: "30",
    currency: "TL",
    test_mode: p.testMode ? "1" : "0",
  });

  const res = await fetch(PAYTR_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; token?: string; reason?: string };
  if (data.status !== "success" || !data.token) {
    throw new Error(`PAYTR token alınamadı: ${data.reason ?? "bilinmeyen hata"}`);
  }
  return data.token;
}

/**
 * PAYTR bildirim (callback) imzasını doğrular. Ödeme sonucu POST'unda gelen
 * hash, merchant_oid + salt + status + total_amount ile HMAC-SHA256 base64 olmalı.
 */
export function verifyPaytrCallback(params: {
  merchantOid: string;
  status: string;
  totalAmount: string;
  hash: string;
}): boolean {
  if (!isPaytrConfigured()) return false;
  const hashStr = params.merchantOid + ENV.paytrMerchantSalt + params.status + params.totalAmount;
  const expected = crypto.createHmac("sha256", ENV.paytrMerchantKey).update(hashStr).digest("base64");
  return expected === params.hash;
}
