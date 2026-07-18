/**
 * Ürün kataloğu Excel/CSV içe-dışa aktarma (saf modül).
 *
 * Tek "alan kataloğu" hem dışa aktarmayı (başlık + değerler) hem içe aktarmayı
 * (başlık → alan eşleşmesi + tip dönüşümü) besler. Böylece dışa aktarılan dosya
 * düzenlenip geri yüklenince birebir round-trip olur.
 *
 * İçe aktarma "oluştur-veya-güncelle" mantığıyla çalışır: eşleştirme sütunu
 * (ID / Barkod / SKU) ile eşleşen satır güncellenir, eşleşmeyen + adı olan satır
 * yeni ürün olarak eklenir. Dosyada olmayan sütunlar hiç değiştirilmez.
 */

import { norm, parsePriceNumber, splitCsvLine } from "./pricing";

/** İçe/dışa aktarmada kullanılan ürün alanları (DB kolonlarının üst kümesi). */
export type ProductIORecord = {
  id: number;
  parentId: number | null;
  name: string;
  series: string | null;
  colorCode: string | null;
  colorHex: string | null;
  surfaceType: string | null;
  additives: string | null;
  description: string | null;
  salePrice: string | number;
  discountPercent: string | number;
  packagingCost: string | number;
  shippingCost: string | number;
  packaging: string | null;
  barcode: string | null;
  stockQty: number;
  criticalQty: number;
  labelSize: string | null;
  labelText: string | null;
  usageGuide: string | null;
  safetyNotes: string | null;
  extraInfo: string | null;
  sku: string | null;
  category: string | null;
  profitMargin: string | number | null;
  vatRate: string | number | null;
  desi: string | number | null;
  paintType: string | null;
  features: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  imageUrls: string | null;
  videoUrl: string | null;
  mockupUrl: string | null;
  labelWarnings: string | null;
  status: "taslak" | "satista" | "arsiv";
};

type FieldType = "text" | "number" | "int" | "list-comma" | "list-pipe" | "status";

type FieldDef = {
  header: string;
  key: keyof ProductIORecord;
  type: FieldType;
};

/** Düzenlenebilir alanlar — dışa aktarmada yazılır, içe aktarmada okunur. */
export const IO_FIELDS: FieldDef[] = [
  { header: "Ürün Adı", key: "name", type: "text" },
  { header: "Barkod", key: "barcode", type: "text" },
  { header: "SKU", key: "sku", type: "text" },
  { header: "Durum", key: "status", type: "status" },
  { header: "Seri", key: "series", type: "text" },
  { header: "Renk Kodu", key: "colorCode", type: "text" },
  { header: "Renk Hex", key: "colorHex", type: "text" },
  { header: "Kullanım/Yüzey", key: "surfaceType", type: "text" },
  { header: "Kategori", key: "category", type: "text" },
  { header: "Ürün Türü", key: "paintType", type: "text" },
  { header: "Ambalaj", key: "packaging", type: "text" },
  { header: "Satış Fiyatı", key: "salePrice", type: "number" },
  { header: "İndirim %", key: "discountPercent", type: "number" },
  { header: "KDV %", key: "vatRate", type: "number" },
  { header: "Kâr Oranı %", key: "profitMargin", type: "number" },
  { header: "Desi", key: "desi", type: "number" },
  { header: "Ambalaj Maliyeti", key: "packagingCost", type: "number" },
  { header: "Kargo Maliyeti", key: "shippingCost", type: "number" },
  { header: "Stok", key: "stockQty", type: "int" },
  { header: "Kritik Stok", key: "criticalQty", type: "int" },
  { header: "Etiket Boyutu", key: "labelSize", type: "text" },
  { header: "Etiket Yazısı", key: "labelText", type: "text" },
  { header: "Kullanım Kılavuzu", key: "usageGuide", type: "text" },
  { header: "Güvenlik", key: "safetyNotes", type: "text" },
  { header: "Etiket Uyarıları", key: "labelWarnings", type: "text" },
  { header: "Ek Bilgi", key: "extraInfo", type: "text" },
  { header: "Kısa Açıklama", key: "shortDescription", type: "text" },
  { header: "Uzun Açıklama", key: "longDescription", type: "text" },
  { header: "Uygulama Metni", key: "applicationText", type: "text" },
  { header: "Açıklama", key: "description", type: "text" },
  { header: "Özellikler", key: "features", type: "list-comma" },
  { header: "Katkılar", key: "additives", type: "text" },
  { header: "Görsel Linkleri", key: "imageUrls", type: "list-pipe" },
  { header: "Video", key: "videoUrl", type: "text" },
  { header: "Mockup", key: "mockupUrl", type: "text" },
];

/** Yalnız dışa aktarılan (içe aktarmada yok sayılan) bilgi sütunları. */
export const READONLY_HEADERS = [
  "ID",
  "Tür",
  "Üst Ürün Barkodu",
  "Ana Görsel",
  "Ambalaj Görseli",
  "Kullanım Görseli",
] as const;

export type MatchBy = "id" | "barkod" | "sku";

/* ------------------------- Dışa aktarma ------------------------- */

function jsonListToText(value: string | null, sep: string): string {
  if (!value) return "";
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.join(sep) : String(value);
  } catch {
    return String(value);
  }
}

/** Ondalık gösterim: nokta (varsayılan) ya da virgül (Excel TR sayı algılasın). */
function fmtNumber(value: string | number | null | undefined, decimalSep: "." | ","): string {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value);
  return decimalSep === "," ? s.replace(".", ",") : s;
}

function cellFor(p: ProductIORecord, f: FieldDef, decimalSep: "." | ","): string {
  const raw = p[f.key];
  switch (f.type) {
    case "number":
      return fmtNumber(raw as string | number | null, decimalSep);
    case "int":
      return raw === null || raw === undefined ? "" : String(raw);
    case "list-comma":
      return jsonListToText(raw as string | null, ", ");
    case "list-pipe":
      return jsonListToText(raw as string | null, " | ");
    default:
      return raw === null || raw === undefined ? "" : String(raw);
  }
}

export type ExportOptions = {
  decimalSep?: "." | ",";
  /** productId → ["main","packaging","usage"] yüklü görsel türleri. */
  imageKinds?: Map<number, string[]>;
  /** Görsel linki tabanı, örn. https://site.com (yoksa görsel sütunları boş). */
  imageBaseUrl?: string;
};

/**
 * Ürünleri başlık + satır matrisine çevirir (ilk satır başlık).
 * ID/Tür/Üst Ürün/görsel sütunları bilgi amaçlıdır; içe aktarmada değiştirilmez.
 */
export function buildExportMatrix(products: ProductIORecord[], opts: ExportOptions = {}): string[][] {
  const decimalSep = opts.decimalSep ?? ".";
  const byId = new Map(products.map(p => [p.id, p]));
  const imgUrl = (id: number, kind: string) =>
    opts.imageBaseUrl && (opts.imageKinds?.get(id)?.includes(kind) ?? false)
      ? `${opts.imageBaseUrl}/api/img/${id}/${kind}`
      : "";

  const header = [
    "ID",
    "Tür",
    "Üst Ürün Barkodu",
    ...IO_FIELDS.map(f => f.header),
    "Ana Görsel",
    "Ambalaj Görseli",
    "Kullanım Görseli",
  ];

  const rows = products.map(p => {
    const parent = p.parentId !== null ? byId.get(p.parentId) : null;
    return [
      String(p.id),
      p.parentId === null ? "Ana Ürün" : "Türev",
      parent?.barcode ?? parent?.sku ?? "",
      ...IO_FIELDS.map(f => cellFor(p, f, decimalSep)),
      imgUrl(p.id, "main"),
      imgUrl(p.id, "packaging"),
      imgUrl(p.id, "usage"),
    ];
  });

  return [header, ...rows];
}

/** Matrisi CSV metnine çevirir (BOM + ; ayraç, Excel TR uyumlu). */
export function matrixToCsv(matrix: string[][]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = matrix.map(row => row.map(esc).join(";")).join("\r\n");
  return "﻿" + body;
}

/* ------------------------- İçe aktarma: parse ------------------------- */

export type ParsedCsv = {
  headers: string[];
  /** Ham hücre satırları (başlık hariç), her biri kaynak satır no ile. */
  rows: Array<{ cells: string[]; line: number }>;
  sep: string;
};

export function parseCatalogCsv(text: string): { parsed: ParsedCsv | null; error: string | null } {
  const lines = text.split(/\r?\n/);
  // Sondaki boş satırları at ama tırnak içi satır sonlarını bozmadığımız için basit tutuyoruz.
  const nonEmpty = lines.filter((l, i) => l.trim().length > 0 || i === 0);
  if (nonEmpty.length < 2) {
    return { parsed: null, error: "Dosyada başlık + en az bir veri satırı olmalı." };
  }
  const first = nonEmpty[0];
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitCsvLine(first, sep).map(h => h.replace(/^﻿/, "").trim());
  const rows: ParsedCsv["rows"] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    if (!nonEmpty[i].trim()) continue;
    rows.push({ cells: splitCsvLine(nonEmpty[i], sep), line: i + 1 });
  }
  return { parsed: { headers, rows, sep }, error: null };
}

/* ------------------------- İçe aktarma: plan ------------------------- */

const STATUS_ALIASES: Record<string, ProductIORecord["status"]> = {
  taslak: "taslak",
  draft: "taslak",
  satista: "satista",
  satis: "satista",
  aktif: "satista",
  active: "satista",
  arsiv: "arsiv",
  pasif: "arsiv",
  archived: "arsiv",
};

function textToJsonList(text: string, sep: RegExp): string | null {
  const items = text
    .split(sep)
    .map(s => s.trim())
    .filter(Boolean);
  return items.length ? JSON.stringify(items) : null;
}

export type FieldChange = { header: string; old: string; new: string };

export type PlannedUpdate = {
  line: number;
  id: number;
  name: string;
  changes: FieldChange[];
  data: Record<string, unknown>;
};

export type PlannedCreate = {
  line: number;
  name: string;
  data: Record<string, unknown>;
  parentRef: string | null;
  warnings: string[];
};

export type ImportPlan = {
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
  unchanged: Array<{ line: number; id: number; name: string }>;
  errors: Array<{ line: number; message: string }>;
  /** Dosyada bulunan ve güncellenecek düzenlenebilir sütun başlıkları. */
  presentFields: string[];
};

export type PlanOptions = {
  matchBy: MatchBy;
  /** Boş hücre alanı temizlesin mi? Kapalıysa (varsayılan) boş hücre atlanır. */
  clearEmpty?: boolean;
};

/** Ham hücre değerini alan tipine göre DB değerine çevirir. null = "değiştirme". */
function parseCell(
  rawValue: string,
  type: FieldType,
  clearEmpty: boolean,
): { ok: true; value: unknown; skip: boolean } | { ok: false; message: string } {
  const v = rawValue.trim();
  const empty = v === "";

  if (type === "number" || type === "int") {
    if (empty) return { ok: true, value: null, skip: true }; // sayıda boş = asla dokunma
    const n = parsePriceNumber(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: `sayı okunamadı ("${rawValue}")` };
    return { ok: true, value: type === "int" ? Math.round(n) : +n.toFixed(2), skip: false };
  }

  if (empty && !clearEmpty) return { ok: true, value: null, skip: true };

  switch (type) {
    case "status": {
      if (empty) return { ok: true, value: null, skip: true };
      const s = STATUS_ALIASES[norm(v)];
      if (!s) return { ok: false, message: `geçersiz durum ("${rawValue}") — taslak/satista/arsiv` };
      return { ok: true, value: s, skip: false };
    }
    case "list-comma":
      return { ok: true, value: empty ? null : textToJsonList(v, /[\n,]/), skip: false };
    case "list-pipe":
      return { ok: true, value: empty ? null : textToJsonList(v, /[\n|]/), skip: false };
    default:
      return { ok: true, value: empty ? null : v, skip: false };
  }
}

/** Mevcut değerin dışa aktarım gösterimi (diff karşılaştırması için). */
function currentDisplay(p: ProductIORecord, f: FieldDef): string {
  return cellFor(p, f, ".");
}

/**
 * Parse edilmiş CSV'yi mevcut ürünlerle eşleştirip oluştur/güncelle planı çıkarır.
 * Yalnız dosyada bulunan düzenlenebilir sütunlar dikkate alınır.
 */
export function planImport(
  products: ProductIORecord[],
  parsed: ParsedCsv,
  opts: PlanOptions,
): ImportPlan {
  const clearEmpty = opts.clearEmpty ?? false;
  const normHeaders = parsed.headers.map(norm);

  // Başlık → alan eşlemesi (yalnız dosyada bulunan düzenlenebilir sütunlar).
  const fieldCols: Array<{ idx: number; field: FieldDef }> = [];
  for (const field of IO_FIELDS) {
    const idx = normHeaders.indexOf(norm(field.header));
    if (idx >= 0) fieldCols.push({ idx, field });
  }
  const idIdx = normHeaders.indexOf(norm("ID"));
  const barcodeIdx = fieldCols.find(c => c.field.key === "barcode")?.idx ?? -1;
  const skuIdx = fieldCols.find(c => c.field.key === "sku")?.idx ?? -1;
  const parentIdx = normHeaders.indexOf(norm("Üst Ürün Barkodu"));

  const plan: ImportPlan = {
    creates: [],
    updates: [],
    unchanged: [],
    errors: [],
    presentFields: fieldCols.map(c => c.field.header),
  };

  // Eşleştirme sütunu dosyada yoksa erken hata.
  const matchIdx = opts.matchBy === "id" ? idIdx : opts.matchBy === "barkod" ? barcodeIdx : skuIdx;
  if (matchIdx < 0) {
    plan.errors.push({
      line: 1,
      message: `Eşleştirme sütunu bulunamadı: ${opts.matchBy === "id" ? "ID" : opts.matchBy === "barkod" ? "Barkod" : "SKU"}`,
    });
    return plan;
  }
  if (fieldCols.length === 0) {
    plan.errors.push({ line: 1, message: "Güncellenebilir sütun yok — en az bir alan başlığı olmalı." });
    return plan;
  }

  const byId = new Map(products.map(p => [p.id, p]));
  const byBarcode = new Map<string, ProductIORecord>();
  const bySku = new Map<string, ProductIORecord>();
  for (const p of products) {
    if (p.barcode?.trim()) byBarcode.set(p.barcode.trim(), p);
    if (p.sku?.trim()) bySku.set(p.sku.trim(), p);
  }

  // Batch içi çift barkod/SKU'yu yakalamak için görülenler.
  const usedBarcodes = new Set(byBarcode.keys());
  const usedSkus = new Set(bySku.keys());
  const matchedIds = new Set<number>();

  for (const { cells, line } of parsed.rows) {
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? "").trim() : "");
    const matchKey = cell(matchIdx);

    // Alan değerlerini çöz (hata olursa satırı komple reddet).
    const parsedFields: Array<{ field: FieldDef; value: unknown; skip: boolean; raw: string }> = [];
    let rowError: string | null = null;
    for (const { idx, field } of fieldCols) {
      const raw = cells[idx] ?? "";
      const res = parseCell(raw, field.type, clearEmpty);
      if (!res.ok) {
        rowError = `${field.header}: ${res.message}`;
        break;
      }
      parsedFields.push({ field, value: res.value, skip: res.skip, raw });
    }
    if (rowError) {
      plan.errors.push({ line, message: rowError });
      continue;
    }

    // Eşleşen ürünü bul.
    let match: ProductIORecord | undefined;
    if (matchKey) {
      if (opts.matchBy === "id" && /^\d+$/.test(matchKey)) match = byId.get(Number(matchKey));
      else if (opts.matchBy === "barkod") match = byBarcode.get(matchKey);
      else if (opts.matchBy === "sku") match = bySku.get(matchKey);
    }

    if (match) {
      if (matchedIds.has(match.id)) {
        plan.errors.push({ line, message: `"${match.name}" aynı içe aktarımda birden çok satırda — atlandı.` });
        continue;
      }
      matchedIds.add(match.id);
      const changes: FieldChange[] = [];
      const data: Record<string, unknown> = {};
      for (const pf of parsedFields) {
        if (pf.skip) continue;
        const oldDisplay = currentDisplay(match, pf.field);
        const isNumeric = pf.field.type === "number" || pf.field.type === "int";
        const newDisplay =
          pf.value === null
            ? ""
            : isNumeric
              ? String(pf.value)
              : pf.field.type.startsWith("list")
                ? jsonListToText(pf.value as string, pf.field.type === "list-comma" ? ", " : " | ")
                : String(pf.value);
        // Sayısal alanlarda "100.00" ile "100" farkı gerçek değişiklik sayılmaz.
        const changed = isNumeric
          ? (parsePriceNumber(oldDisplay) || 0) !== (pf.value === null ? 0 : (pf.value as number))
          : oldDisplay !== newDisplay;
        if (changed) {
          changes.push({ header: pf.field.header, old: oldDisplay, new: newDisplay });
          data[pf.field.key] = pf.value;
        }
      }
      if (changes.length === 0) {
        plan.unchanged.push({ line, id: match.id, name: match.name });
      } else {
        plan.updates.push({ line, id: match.id, name: match.name, changes, data });
      }
      continue;
    }

    // Eşleşme yok → yeni ürün adayı.
    const data: Record<string, unknown> = {};
    for (const pf of parsedFields) {
      if (pf.value !== null) data[pf.field.key] = pf.value;
    }
    const name = String(data.name ?? "").trim();
    if (!name) {
      plan.errors.push({
        line,
        message: `Eşleşme yok ve Ürün Adı boş — yeni ürün oluşturulamıyor (eşleştirme: ${matchKey || "boş"}).`,
      });
      continue;
    }

    const warnings: string[] = [];
    const newBarcode = String(data.barcode ?? "").trim();
    const newSku = String(data.sku ?? "").trim();
    if (newBarcode && usedBarcodes.has(newBarcode)) {
      plan.errors.push({ line, message: `Barkod "${newBarcode}" zaten kullanımda — atlandı.` });
      continue;
    }
    if (newSku && usedSkus.has(newSku)) {
      plan.errors.push({ line, message: `SKU "${newSku}" zaten kullanımda — atlandı.` });
      continue;
    }
    if (newBarcode) usedBarcodes.add(newBarcode);
    if (newSku) usedSkus.add(newSku);

    const parentRef = parentIdx >= 0 ? cell(parentIdx) : "";
    if (parentRef && !byBarcode.has(parentRef) && !bySku.has(parentRef)) {
      warnings.push(`Üst ürün "${parentRef}" bulunamadı — ana ürün olarak eklenecek.`);
    }

    plan.creates.push({ line, name, data, parentRef: parentRef || null, warnings });
  }

  return plan;
}

/** Plan özeti (UI başlığı için). */
export function summarizePlan(plan: ImportPlan): string {
  return `${plan.creates.length} yeni · ${plan.updates.length} güncelleme · ${plan.unchanged.length} değişiklik yok · ${plan.errors.length} hata`;
}
