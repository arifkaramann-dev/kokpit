/**
 * Renk adı sözlüğü — Türkçe ↔ İngilizce.
 *
 * ── Neden sabit sözlük, neden AI değil ────────────────────────────────────
 * Katalogdaki renklerin İngilizce adı boştu ve kartın üst satırı (`{nameEn}`)
 * hiç dolmuyordu. Otuz rengi tek tek yazmak saatlik bir iş; her biri için AI'a
 * sormak ise hem para hem gereksiz: "Fuşya → Magenta", "Bordo → Maroon" gibi
 * eşleşmeler sabit ve tartışmasız. Sözlük ücretsiz, anında ve tekrar
 * çalıştırıldığında AYNI sonucu verir — AI'ın veremediği son özellik bu.
 *
 * Sözlükte olmayan ad için null döner; kullanıcı onay ekranında elle yazar.
 * Yanlış bir tahmin uydurmaktansa boş bırakmak doğrudur: ad etikete ve
 * pazaryeri başlığına gidiyor.
 *
 * Saf modül: veritabanı yok, tarayıcı yok, ağ yok.
 */

/** Karşılaştırma için sadeleştirir: "Açık Gri " → "acikgri". */
function fold(value: string | null | undefined): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
  };
  return String(value ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâîû]/g, ch => map[ch] ?? ch)
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Türkçe ad → İngilizce karşılık.
 *
 * Boya sektörünün kullandığı karşılıklar seçildi: "Füme" için "Smoke"
 * (literal "Fume" değil), "Antrasit" için "Anthracite" (sektörde bu ad
 * uluslararası olarak kullanılıyor).
 */
const TR_TO_EN: Record<string, string> = {
  // Sıfatlar — bileşik adlarda kelime kelime çeviri için ("Açık Mavi").
  acik: "Light",
  koyu: "Dark",
  parlak: "Bright",
  mat: "Matte",
  metalik: "Metallic",
  neon: "Neon",
  // Nötr / gri ailesi
  beyaz: "White",
  siyah: "Black",
  gri: "Grey",
  acikgri: "Light Grey",
  koyugri: "Dark Grey",
  fume: "Smoke",
  antrasit: "Anthracite",
  gumus: "Silver",
  altin: "Gold",
  bronz: "Bronze",
  bakir: "Copper",
  krom: "Chrome",
  sedef: "Pearl",
  seffaf: "Clear",
  renksiz: "Colourless",
  notr: "Neutral",
  // Kırmızı ailesi
  kirmizi: "Red",
  acikkirmizi: "Light Red",
  koyukirmizi: "Dark Red",
  bordo: "Maroon",
  visne: "Cherry",
  mercan: "Coral",
  somon: "Salmon",
  pembe: "Pink",
  fusya: "Magenta",
  mor: "Purple",
  eflatun: "Violet",
  lila: "Lilac",
  lavanta: "Lavender",
  // Sarı / turuncu ailesi
  sari: "Yellow",
  hardal: "Mustard",
  turuncu: "Orange",
  amber: "Amber",
  bej: "Beige",
  krem: "Cream",
  kahverengi: "Brown",
  tarcin: "Cinnamon",
  // Mavi / yeşil ailesi
  mavi: "Blue",
  acikmavi: "Light Blue",
  koyumavi: "Dark Blue",
  denizmavisi: "Navy Blue",
  lacivert: "Navy",
  turkuaz: "Turquoise",
  petrol: "Petrol",
  camgobegi: "Teal",
  yesil: "Green",
  acikyesil: "Light Green",
  koyuyesil: "Dark Green",
  fistikyesili: "Pistachio",
  zeytin: "Olive",
  neonyesil: "Neon Green",
  neonsari: "Neon Yellow",
  neonturuncu: "Neon Orange",
  neonpembe: "Neon Pink",
};

/**
 * Rengin İngilizce adını önerir; bilinmiyorsa null.
 *
 * Bileşik adlarda ("Açık Mavi") önce TAMAMI aranır, bulunamazsa kelime kelime
 * çevrilir ("Açık" + "Mavi" → "Light Blue"). Kelimelerden biri bile
 * bilinmiyorsa null döner — yarısı Türkçe bir ad üretmek, hiç ad üretmemekten
 * kötüdür.
 */
export function suggestColorNameEn(nameTr: string | null | undefined): string | null {
  const whole = TR_TO_EN[fold(nameTr)];
  if (whole) return whole;

  const words = String(nameTr ?? "")
    .split(/[\s/·,-]+/)
    .map(w => w.trim())
    .filter(Boolean);
  if (words.length < 2) return null;

  const parts: string[] = [];
  for (const w of words) {
    const hit = TR_TO_EN[fold(w)];
    if (!hit) return null;
    parts.push(hit);
  }
  // "Açık" + "Mavi" → "Light Blue": sıfat İngilizcede de önde kalıyor.
  return parts.join(" ");
}

/** Sözlükte kaç eşleşme var — ekranda "x renk otomatik bulundu" demek için. */
export const COLOR_NAME_COUNT = Object.keys(TR_TO_EN).length;
