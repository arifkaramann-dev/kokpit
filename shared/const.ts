// Shared constants and helpers used by both client and server.

/** Session cookie name for the app's auth session. */
export const COOKIE_NAME = "app_session";

/** One-time nonce cookie used to validate the OAuth `state` round-trip. */
export const OAUTH_STATE_COOKIE = "oauth_state";

export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Oturum (JWT + cookie) ömrü: 7 gün. Süre dolunca yeniden giriş gerekir. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const AXIOS_TIMEOUT_MS = 30_000;

/** Error messages shared between server (thrown) and client (matched). */
export const UNAUTHED_ERR_MSG = "Oturum bulunamadı, lütfen giriş yapın.";
export const NOT_ADMIN_ERR_MSG = "Bu işlem için yönetici yetkisi gerekli.";

export type OAuthState = {
  redirectUri: string;
  nonce: string;
};

/**
 * Encode/decode the OAuth `state` parameter as base64 JSON.
 * `btoa`/`atob` are available both in browsers and in Node >= 16,
 * so these helpers work on client and server alike.
 */
export function encodeOAuthState(state: OAuthState): string {
  return btoa(JSON.stringify(state));
}

export function decodeOAuthState(state: string): OAuthState {
  try {
    const parsed = JSON.parse(atob(state)) as Partial<OAuthState>;
    return {
      redirectUri: parsed.redirectUri ?? "",
      nonce: parsed.nonce ?? "",
    };
  } catch {
    throw new Error("invalid oauth state");
  }
}
