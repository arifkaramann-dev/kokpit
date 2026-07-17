/**
 * ÜRÜN KAYIT Excel verilerini (scripts/data/urun-kayit.json) veritabanına
 * uygulama içinden aktarır — Render ücretsiz planda Shell olmadığı için
 * Ayarlar sayfasındaki tek tuşla çalışır. JSON derlemeye gömülür (esbuild),
 * bu yüzden canlıda dosya sistemi gerekmez. Idempotent: var olan kayıtlara
 * dokunmaz, yalnızca eksikleri ekler.
 */
import { eq, sql } from "drizzle-orm";
import { materials, products, productSeries, templates } from "../drizzle/schema";
import { getDb } from "./db";
import seed from "../scripts/data/urun-kayit.json";

export type ImportCounts = { series: number; materials: number; templates: number; products: number };

export async function importUrunKayit(): Promise<ImportCounts> {
  const db = await getDb();
  if (!db) throw new Error("Veritabanı bağlantısı yok");
  const counts: ImportCounts = { series: 0, materials: 0, templates: 0, products: 0 };

  for (const s of seed.series ?? []) {
    const [existing] = await db
      .select({ id: productSeries.id })
      .from(productSeries)
      .where(sql`LOWER(${productSeries.name}) = LOWER(${s.name})`)
      .limit(1);
    if (existing) continue;
    await db.insert(productSeries).values({
      name: s.name,
      profitMargin: String(s.profitMargin ?? 35),
      vatRate: String(s.vatRate ?? 20),
      category: s.category ?? null,
      longDescription: s.longDescription ?? null,
    });
    counts.series++;
  }

  // Paketleme/ambalaj/masraf kalemleri de malzeme olarak girer; reçeteye
  // eklenince maliyete otomatik yansırlar.
  for (const m of seed.materials ?? []) {
    const [existing] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(sql`LOWER(${materials.name}) = LOWER(${m.name})`)
      .limit(1);
    if (existing) continue;
    await db.insert(materials).values({
      name: m.name,
      category: m.category ?? "diğer",
      unit: m.unit ?? "adet",
      unitCost: String(m.unitCost ?? 0),
    });
    counts.materials++;
  }

  for (const t of seed.templates ?? []) {
    const [existing] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(sql`${templates.kind} = ${t.kind} AND LOWER(${templates.name}) = LOWER(${t.name})`)
      .limit(1);
    if (existing) continue;
    await db.insert(templates).values({ kind: t.kind as never, name: t.name, content: null });
    counts.templates++;
  }

  for (const p of seed.products ?? []) {
    if (!p.name) continue;
    const bySku = p.sku
      ? await db.select({ id: products.id }).from(products).where(eq(products.sku, p.sku)).limit(1)
      : [];
    const byName =
      bySku.length === 0
        ? await db
            .select({ id: products.id })
            .from(products)
            .where(sql`LOWER(${products.name}) = LOWER(${p.name})`)
            .limit(1)
        : [];
    if (bySku.length > 0 || byName.length > 0) continue;
    await db.insert(products).values({
      name: p.name,
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      series: p.series ?? null,
      category: p.category ?? null,
      colorCode: p.colorCode ?? null,
      packaging: p.packaging ?? null,
      salePrice: String(p.salePrice ?? 0),
      profitMargin: p.profitMargin != null ? String(p.profitMargin) : null,
      vatRate: p.vatRate != null ? String(p.vatRate) : null,
      stockQty: p.stockQty ?? 0,
      desi: p.desi != null ? String(p.desi) : null,
      paintType: p.paintType ?? null,
      surfaceType: p.surfaceType ?? null,
      features: p.features ? JSON.stringify(p.features) : null,
      shortDescription: p.shortDescription ?? null,
      longDescription: p.longDescription ?? null,
      applicationText: p.applicationText ?? null,
      imageUrls: p.imageUrls ? JSON.stringify(p.imageUrls) : null,
      videoUrl: p.videoUrl ?? null,
      mockupUrl: p.mockupUrl ?? null,
      labelText: p.labelText ?? null,
      labelSize: p.labelSize ?? null,
      labelWarnings: p.labelWarnings ?? null,
      usageGuide: p.usageGuide ?? null,
    });
    counts.products++;
  }

  return counts;
}
