/**
 * Bağımsız (bağımlılıksız) Code 128-B barkod üreteci.
 * Sipariş numarası gibi ASCII metinleri taranabilir bir SVG barkoda çevirir.
 * Kargo etiketi yazdırma penceresine gömülmek için tasarlandı (harici kütüphane yok).
 */

// Code 128 desen tablosu (değer 0–106): her giriş çubuk/boşluk genişliklerinin dizisidir.
// 104 = Start B, 106 = Stop.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** Metni Code 128-B kod değerleri dizisine çevirir (Start + veri + sağlama + Stop). */
function encode(text: string): number[] {
  const codes = [START_B];
  let checksum = START_B;
  let pos = 1;
  for (const ch of text) {
    // Code 128-B, ASCII 32–126 aralığını kapsar; dışındakileri boşlukla değiştir.
    const c = ch.charCodeAt(0);
    const value = c >= 32 && c <= 126 ? c - 32 : 0;
    codes.push(value);
    checksum += value * pos;
    pos++;
  }
  codes.push(checksum % 103);
  codes.push(STOP);
  return codes;
}

export type BarcodeOptions = {
  /** Bir modülün (en ince çubuğun) piksel genişliği. */
  moduleWidth?: number;
  /** Çubuk yüksekliği (piksel). */
  height?: number;
  /** Barkodun altına okunabilir metni yaz. */
  showText?: boolean;
};

/**
 * Metinden Code 128-B barkodunu bağımsız bir SVG dizesi olarak üretir.
 * Genişlik, kodlanan modül sayısına göre otomatik hesaplanır.
 */
export function barcodeSVG(text: string, opts: BarcodeOptions = {}): string {
  const moduleWidth = opts.moduleWidth ?? 2;
  const height = opts.height ?? 60;
  const showText = opts.showText ?? true;
  const quiet = 10; // sessiz alan (modül)
  const textH = showText ? 18 : 0;

  const codes = encode(text);
  // Her desen, çubukla başlayıp çubuk/boşluk şeklinde değişen genişliklerdir.
  let x = quiet;
  const rects: string[] = [];
  for (const code of codes) {
    const pattern = PATTERNS[code];
    let isBar = true;
    for (const widthChar of pattern) {
      const w = parseInt(widthChar, 10);
      if (isBar) {
        rects.push(
          `<rect x="${x * moduleWidth}" y="0" width="${w * moduleWidth}" height="${height}" />`,
        );
      }
      x += w;
      isBar = !isBar;
    }
  }
  const totalModules = x + quiet;
  const width = totalModules * moduleWidth;
  const totalHeight = height + textH;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const label = showText
    ? `<text x="${width / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000">${esc(text)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" ` +
    `viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="Barkod ${esc(text)}">` +
    `<rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#fff" />` +
    `<g fill="#000">${rects.join("")}</g>${label}</svg>`
  );
}
