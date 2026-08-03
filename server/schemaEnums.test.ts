import { describe, expect, it } from "vitest";

import { channelListings, listings } from "../drizzle/schema";

/*
 * İlan durumu ile KANAL YAYINI durumu iki ayrı enum'dur ve ikisi de "status"
 * adını taşır — bu yüzden karışıyorlar.
 *
 * Gerçek olay: eşleşmeyen sipariş satırından ürün açarken iç ilana kanal
 * yayınının değeri ("canli") yazıldı. `as never` cast'i tip denetimini
 * sustur[du]ğu için derleme geçti, hata ancak canlıda INSERT anında çıktı.
 * Cast'ler kaldırıldı; bu test de enum'ların ayrı kalmasını bekçilik ediyor.
 */
describe("ilan / kanal yayını durum enum'ları", () => {
  it("iç ilan durumu taslak|aktif|arsiv", () => {
    expect(listings.status.enumValues).toEqual(["taslak", "aktif", "arsiv"]);
  });

  it("kanal yayını durumu taslak|canli|durduruldu", () => {
    expect(channelListings.status.enumValues).toEqual(["taslak", "canli", "durduruldu"]);
  });

  it("'canli' bir İLAN durumu değildir — canlıda insert'i patlatan değer buydu", () => {
    expect(listings.status.enumValues).not.toContain("canli");
  });

  it("iki enum ortak değer olarak yalnız 'taslak' paylaşır", () => {
    const shared = listings.status.enumValues.filter(v =>
      (channelListings.status.enumValues as readonly string[]).includes(v),
    );
    expect(shared).toEqual(["taslak"]);
  });
});
