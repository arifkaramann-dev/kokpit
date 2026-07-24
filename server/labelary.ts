/**
 * Labelary köprüsü: ZPL → PDF. Index'siz uç kullanıldığı için **birden çok**
 * ZPL etiketi (^XA…^XZ blokları) tek çağrıda **çok sayfalı** PDF'e çevrilir —
 * toplu kargo etiketi bu sayede tek yazdırma işi olur. Tek etikette de aynı
 * uç 1 sayfalık PDF döner.
 */
const LABELARY_URL =
  process.env.LABELARY_URL ?? "https://api.labelary.com/v1/printers/8dpmm/labels/4x6/";

/** Bir veya birden çok ZPL etiketini tek PDF'e (çok sayfalı) çevirir. */
export async function zplToPdf(zpl: string): Promise<Buffer> {
  const res = await fetch(LABELARY_URL, {
    method: "POST",
    headers: { Accept: "application/pdf", "Content-Type": "application/x-www-form-urlencoded" },
    body: zpl,
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Etiket PDF'e çevrilemedi (${res.status}): ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
