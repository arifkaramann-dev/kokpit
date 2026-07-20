/**
 * SEO yardımcıları — saf/testli. Web mağaza taranabilirliği için sitemap/robots
 * ve ürün sayfası meta (title, description, Open Graph, JSON-LD Product) üretimi.
 *
 * KRİTİK: JSON-LD/OG'deki fiyat, mağazanın GÖSTERDİĞİ net fiyatla (indirim
 * uygulanmış) BİREBİR aynı olmalıdır — yanıltıcı zengin snippet cezasını önler.
 * Bu yüzden meta üreten taraf fiyatı resolveStorePrice ile hesaplar, buraya verir.
 */

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** HTML metin/attr enjeksiyonu için kaçış (meta content, title). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SitemapUrl = { loc: string; lastmod?: string | null; changefreq?: string; priority?: string };

export function buildSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map(u => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${escapeXml(u.changefreq)}</changefreq>`);
      if (u.priority) parts.push(`    <priority>${escapeXml(u.priority)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildRobotsTxt(opts: { sitemapUrl?: string | null } = {}): string {
  const lines = [
    "User-agent: *",
    "Allow: /magaza",
    // Yönetim paneli ve API'ler taranmasın (herkese açık değil / SEO değeri yok).
    "Disallow: /api/",
    "Disallow: /siparisler",
    "Disallow: /musteriler",
    "Disallow: /ayarlar",
  ];
  if (opts.sitemapUrl) lines.push("", `Sitemap: ${opts.sitemapUrl}`);
  return lines.join("\n") + "\n";
}

export type ProductMeta = {
  id: number;
  name: string;
  description: string;
  url: string;
  image?: string | null;
  /** Mağazanın gösterdiği NET fiyat (indirim uygulanmış). */
  price?: number | null;
  currency?: string;
  availability?: "InStock" | "OutOfStock";
  brand?: string;
  series?: string | null;
};

/** JSON-LD schema.org/Product nesnesini string olarak üretir. */
export function buildProductJsonLd(m: ProductMeta): string {
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: m.name,
    brand: { "@type": "Brand", name: m.brand ?? "Art of Colour" },
  };
  if (m.description) obj.description = m.description;
  if (m.image) obj.image = m.image;
  if (m.series) obj.category = m.series;
  if (m.price != null && m.price > 0) {
    obj.offers = {
      "@type": "Offer",
      priceCurrency: m.currency ?? "TRY",
      price: m.price.toFixed(2),
      availability: `https://schema.org/${m.availability ?? "InStock"}`,
      url: m.url,
    };
  }
  return JSON.stringify(obj);
}

/**
 * <head> içine enjekte edilecek meta etiketlerini üretir: title, description,
 * canonical, Open Graph, Twitter, ve JSON-LD Product. Değerler HTML-kaçışlı.
 */
export function buildProductHeadTags(m: ProductMeta): string {
  const title = `${m.name} | Art of Colour`;
  const desc = m.description || `${m.name} — Art of Colour butik boya.`;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    `<link rel="canonical" href="${escapeHtml(m.url)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:url" content="${escapeHtml(m.url)}" />`,
    m.image ? `<meta property="og:image" content="${escapeHtml(m.image)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${buildProductJsonLd(m).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean);
  return tags.join("\n    ");
}

/**
 * Verilen head etiketlerini HTML kabuğunun </head>'inden hemen önce enjekte eder.
 * Mevcut statik <title> varsa onu kaldırır (çift title olmasın).
 */
export function injectHead(html: string, headTags: string): string {
  const withoutTitle = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  if (withoutTitle.includes("</head>")) {
    return withoutTitle.replace("</head>", `    ${headTags}\n  </head>`);
  }
  return withoutTitle;
}
