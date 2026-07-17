// ÜRÜN KAYIT Excel'inden çıkarılan verileri (scripts/data/urun-kayit.json)
// veritabanına aktarır: seriler, hammaddeler, şablon listeleri, ürünler.
// Tekrar çalıştırılabilir (idempotent): var olan kayıtların üzerine yazmaz,
// yalnızca eksikleri ekler. Kullanım: DATABASE_URL=... node scripts/import-urun-kayit.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[import] DATABASE_URL tanımlı değil.");
  process.exit(1);
}

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "data", "urun-kayit.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));

const conn = await mysql.createConnection(url);
const counts = { series: 0, materials: 0, templates: 0, products: 0 };

// --- Seriler ---
for (const s of data.series ?? []) {
  const [rows] = await conn.execute(
    "SELECT id FROM productSeries WHERE LOWER(name) = LOWER(?) LIMIT 1",
    [s.name],
  );
  if (rows.length > 0) continue;
  await conn.execute(
    `INSERT INTO productSeries (name, profitMargin, vatRate, category, longDescription)
     VALUES (?, ?, ?, ?, ?)`,
    [s.name, String(s.profitMargin ?? 35), String(s.vatRate ?? 20), s.category ?? null, s.longDescription ?? null],
  );
  counts.series++;
}

// --- Hammaddeler (paketleme/ambalaj/masraf kalemleri de malzeme olarak girer,
// böylece reçeteye eklenip maliyete otomatik yansırlar) ---
for (const m of data.materials ?? []) {
  const [rows] = await conn.execute(
    "SELECT id FROM materials WHERE LOWER(name) = LOWER(?) LIMIT 1",
    [m.name],
  );
  if (rows.length > 0) continue;
  await conn.execute(
    "INSERT INTO materials (name, category, unit, unitCost) VALUES (?, ?, ?, ?)",
    [m.name, m.category ?? "diğer", m.unit ?? "adet", String(m.unitCost ?? 0)],
  );
  counts.materials++;
}

// --- Şablon listeleri (ambalaj, renk, özellik, tür, zemin, kategori) ---
for (const t of data.templates ?? []) {
  const [rows] = await conn.execute(
    "SELECT id FROM templates WHERE kind = ? AND LOWER(name) = LOWER(?) LIMIT 1",
    [t.kind, t.name],
  );
  if (rows.length > 0) continue;
  await conn.execute("INSERT INTO templates (kind, name, content) VALUES (?, ?, ?)", [
    t.kind,
    t.name,
    t.content ?? null,
  ]);
  counts.templates++;
}

// --- Ürünler ---
for (const p of data.products ?? []) {
  if (!p.name) continue;
  const [rows] = await conn.execute(
    "SELECT id FROM products WHERE (sku IS NOT NULL AND sku = ?) OR LOWER(name) = LOWER(?) LIMIT 1",
    [p.sku ?? "", p.name],
  );
  if (rows.length > 0) continue;
  await conn.execute(
    `INSERT INTO products (name, sku, barcode, series, category, colorCode, packaging,
       salePrice, profitMargin, vatRate, stockQty, desi, paintType, surfaceType, features,
       shortDescription, longDescription, applicationText, imageUrls, videoUrl, mockupUrl,
       labelText, labelSize, labelWarnings, usageGuide)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.name,
      p.sku ?? null,
      p.barcode ?? null,
      p.series ?? null,
      p.category ?? null,
      p.colorCode ?? null,
      p.packaging ?? null,
      String(p.salePrice ?? 0),
      p.profitMargin != null ? String(p.profitMargin) : null,
      p.vatRate != null ? String(p.vatRate) : null,
      p.stockQty ?? 0,
      p.desi != null ? String(p.desi) : null,
      p.paintType ?? null,
      p.surfaceType ?? null,
      p.features ? JSON.stringify(p.features) : null,
      p.shortDescription ?? null,
      p.longDescription ?? null,
      p.applicationText ?? null,
      p.imageUrls ? JSON.stringify(p.imageUrls) : null,
      p.videoUrl ?? null,
      p.mockupUrl ?? null,
      p.labelText ?? null,
      p.labelSize ?? null,
      p.labelWarnings ?? null,
      p.usageGuide ?? null,
    ],
  );
  counts.products++;
}

await conn.end();
console.log(
  `[import] Eklendi → seri: ${counts.series}, hammadde: ${counts.materials}, şablon: ${counts.templates}, ürün: ${counts.products}`,
);
