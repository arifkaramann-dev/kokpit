/**
 * Oturum iptali saf mantığı: "Tüm oturumları kapat" anından (revokedAtMs) önce
 * imzalanmış token'lar geçersizdir. iat taşımayan eski token'lar da iptal
 * kapsamındadır (imza anı bilinemediği için güvenli taraf seçilir).
 */
export function isTokenRevoked(revokedAtMs: number, issuedAtSeconds?: number): boolean {
  if (revokedAtMs <= 0) return false;
  if (issuedAtSeconds == null) return true;
  return issuedAtSeconds * 1000 < revokedAtMs;
}
