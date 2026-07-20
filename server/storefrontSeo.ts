import type { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import * as db from "./db";
import { ENV } from "./_core/env";
import { buildProductHeadTags, buildRobotsTxt, buildSitemapXml, injectHead, type ProductMeta, type SitemapUrl } from "@shared/seo";
import { activeCampaignPercent, resolveStorePrice, type StoreCampaign } from "@shared/storePricing";

/**
 * Web mağaza SEO uçları (Tema B / RAKİP-FAZ 2). SUNUCU tarafı:
 *   - GET /robots.txt      (her ortamda)
 *   - GET /sitemap.xml     (her ortamda; satıştaki ürünler + statik sayfalar)
 *   - GET /magaza/urun/:id (YALNIZCA production'da HTML kabuğuna meta enjekte eder)
 *
 * Bu uçlar setupVite/serveStatic catch-all'ından ÖNCE kaydedilmelidir.
 * Development'ta ürün meta enjeksiyonu atlanır (Vite HMR/SPA bozulmasın); client
 * tarafı head yöneticisi + JSON-LD zaten fallback sağlar (Google JS render eder).
 *
 * KRİTİK: JSON-LD/OG fiyatı, mağazanın gösterdiği net fiyatla BİREBİR aynıdır
 * (resolveStorePrice ile hesaplanır) — yanıltıcı zengin snippet cezasını önler.
 */

function storeOrigin(req: Request): string {
  if (ENV.publicStoreUrl) return ENV.publicStoreUrl.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"]?.toString().split(",")[0] || req.protocol || "https").trim();
  const host = (req.headers["x-forwarded-host"]?.toString() || req.headers.host || "").toString().trim();
  return host ? `${proto}://${host}` : "";
}

/** imageUrls (JSON dizi ya da düz URL) + mockupUrl'den ilk görseli seçer; origin ile mutlaklaştırır. */
function firstImageAbs(imageUrls: string | null, mockupUrl: string | null, origin: string): string | null {
  let raw: string | null = mockupUrl || null;
  if (!raw && imageUrls) {
    try {
      const arr = JSON.parse(imageUrls);
      if (Array.isArray(arr) && typeof arr[0] === "string") raw = arr[0];
    } catch {
      if (imageUrls.startsWith("http") || imageUrls.startsWith("/")) raw = imageUrls;
    }
  }
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  return origin ? `${origin}${raw.startsWith("/") ? "" : "/"}${raw}` : raw;
}

/** HTML etiketlerini temizler ve meta description için ~160 karaktere kısaltır. */
function metaDescription(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    const text = c.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text.length > 160 ? text.slice(0, 157).trimEnd() + "…" : text;
  }
  return "Art of Colour — oto rötuş, airbrush ve hobi boyaları.";
}

// Üretilen HTML kabuğu (dist/public/index.html) bir kez okunup önbelleğe alınır.
let cachedShell: string | null | undefined;
function readBuiltShell(): string | null {
  if (cachedShell !== undefined) return cachedShell;
  const candidates = [
    path.resolve(import.meta.dirname, "public", "index.html"),
    path.resolve(process.cwd(), "dist", "public", "index.html"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedShell = fs.readFileSync(p, "utf-8");
        return cachedShell;
      }
    } catch {
      /* dene sonraki aday */
    }
  }
  cachedShell = null;
  return null;
}

async function resolveProductMeta(id: number, origin: string): Promise<ProductMeta | null> {
  const p = await db.getProduct(id);
  if (!p || p.status === "arsiv") return null;
  const materialCost = await db.getProductMaterialCost(p.id);
  const netCost = materialCost + (parseFloat(String(p.packagingCost)) || 0) + (parseFloat(String(p.shippingCost)) || 0);
  const campaigns: StoreCampaign[] = (await db.listCampaigns()).map(c => ({
    productGroup: c.productGroup,
    discountPercent: parseFloat(String(c.discountPercent ?? 0)) || 0,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
  }));
  const campaignPercent = activeCampaignPercent(campaigns, p.series);
  const resolved = resolveStorePrice({
    listPrice: parseFloat(String(p.salePrice)) || 0,
    productDiscountPercent: parseFloat(String(p.discountPercent)) || 0,
    campaignPercent,
    netCost,
  });
  return {
    id: p.id,
    name: p.name,
    description: metaDescription(p.shortDescription, p.description),
    url: `${origin}/magaza/urun/${p.id}`,
    image: firstImageAbs(p.imageUrls, p.mockupUrl, origin),
    price: resolved.price > 0 ? resolved.price : null,
    availability: (p.stockQty ?? 0) > 0 ? "InStock" : "OutOfStock",
    series: p.series,
  };
}

export function registerStorefrontSeo(app: Express) {
  app.get("/robots.txt", (req: Request, res: Response) => {
    const origin = storeOrigin(req);
    res.type("text/plain").send(buildRobotsTxt({ sitemapUrl: origin ? `${origin}/sitemap.xml` : null }));
  });

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    const origin = storeOrigin(req);
    const urls: SitemapUrl[] = [{ loc: `${origin}/magaza`, changefreq: "daily", priority: "0.8" }];
    try {
      const products = await db.listProducts();
      for (const p of products) {
        if (p.status === "arsiv" || !(parseFloat(String(p.salePrice)) > 0)) continue;
        urls.push({
          loc: `${origin}/magaza/urun/${p.id}`,
          lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : null,
          changefreq: "weekly",
          priority: "0.7",
        });
      }
    } catch {
      /* DB erişilemezse en azından mağaza kökünü içeren sitemap dön. */
    }
    res.type("application/xml").send(buildSitemapXml(urls));
  });

  // Ürün sayfası meta enjeksiyonu — yalnızca production (dev'de SPA/Vite'a dokunma).
  app.get("/magaza/urun/:id", async (req: Request, res: Response, next: NextFunction) => {
    if (ENV.isProduction !== true && process.env.NODE_ENV !== "production") return next();
    const shell = readBuiltShell();
    if (!shell) return next();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next();
    try {
      const meta = await resolveProductMeta(id, storeOrigin(req));
      if (!meta) return next(); // ürün yok → SPA kendi 404'ünü gösterir
      res.type("text/html").send(injectHead(shell, buildProductHeadTags(meta)));
    } catch {
      next();
    }
  });
}
