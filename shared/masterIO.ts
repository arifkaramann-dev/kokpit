/**
 * Master ürün (v3 küp kataloğu) Excel/CSV içe-dışa aktarma — saf modül.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Katalog bugüne kadar yalnız KÜP'ten doğuyordu: seri × renk × form × ambalaj
 * çarpılıp master üretiliyordu. Ama kullanıcı seriyi Excel'de kuruyor ve
 * Excel'deki her satır gerçek bir ürün. İki ayrı "doğru liste" olunca hiçbiri
 * güvenilmiyordu; küpün ürettiği liste kullanıcının kendi listesi değildi.
 *
 * Bu modül Excel'i katalogun kaynağı yapar; küp "bunlar olabilir" öneren
 * taraf olarak kalır.
 *
 * NOT: `shared/productIO.ts` bambaşka bir şeydir — emekli `products` tablosu
 * (düz model) içindir ve arayüzde bağlı değildir. Bu modül `masterProducts`
 * içindir. İkisi karıştırılmamalı.
 *
 * ── Sözleşme ──────────────────────────────────────────────────────────────
 * "Oluştur-veya-güncelle": Kod (ya da ID) ile eşleşen satır GÜNCELLENİR,
 * eşleşmeyen satır YENİ ürün olur.
 *
 * 1. BOŞ HÜCRE = DOKUNMA. Yalnız "Kod" + "Fiyat" sütunlu bir zam listesi
 *    yüklendiğinde stok, barkod ve ad olduğu gibi kalır. Boşu 0 saymak,
 *    kullanıcının asla istemeyeceği ama sessizce olan türden hasardır.
 *
 * 2. KOORDİNAT DEĞİŞMEZ. Seri/Renk/Form/Ambalaj sütunları yalnız YENİ ürün
 *    açarken okunur, mevcut üründe yok sayılır. Bir ürünün koordinatını
 *    değiştirmek onu başka bir ürün yapardı — SKU'su, stoğu ve geçmişi o
 *    koordinata bağlı.
 *
 * 3. MÜKERRER AÇILMAZ. Koordinatı dolu bir satır yeni ürün olarak gelirse
 *    açılmaz, çakışma olarak raporlanır. Küp tekilliği (masterProducts_cube_uq)
 *    zaten buna izin vermez; kullanıcı sebebini önizlemede görsün.
 *
 * 4. TANINMAYAN EKSEN AÇILMAZ. Dosyadaki renk/ambalaj kayıtlı değilse satır
 *    reddedilir. Yeni eksen açmak Tanımlar'ın işi; Excel'in yan etkisi olarak
 *    renk paleti büyümemeli.
 */

import { norm, parsePriceNumber, splitCsvLine } from "./pricing";

export type MasterReadiness = "konsantre" | "r2u";
export type MasterStatus = "taslak" | "aktif" | "arsiv";

export type MasterIORecord = {
  id: number;
  internalSku: string;
  name: string | null;
  gtin: string | null;
  basePrice: number | string;
  stockQty: number | string;
  status: MasterStatus;
  // Küp koordinatı — dışa aktarmada yazılır, içe aktarmada yalnız yeni üründe.
  seriesId: number;
  colorId: number;
  familyId: number;
  packagingId: number;
  readiness: MasterReadiness;
  series: string | null;
  colorName: string | null;
  family: string | null;
  packaging: string | null;
};

/** İçe aktarmada eksen adından id çözmek için gereken listeler. */
export type MasterDimensions = {
  series: { id: number; name: string }[];
  colors: { id: number; name: string }[];
  families: { id: number; name: string }[];
  packagings: { id: number; name: string }[];
};

type FieldType = "text" | "number" | "int" | "barcode" | "status";

type FieldDef = {
  header: string;
  key: "name" | "gtin" | "basePrice" | "stockQty" | "status";
  type: FieldType;
};

/**
 * Excel'den düzenlenebilen alanlar. Sıra dosyadaki sütun sırasıdır; en sık
 * düzenlenen (ad, fiyat, stok) başta durur ki kullanıcı sağa kaydırmasın.
 *
 * Maliyet ve kâr burada YOK: ikisi de reçeteden hesaplanır, elle yazılan bir
 * maliyet bir sonraki hesapta sessizce ezilirdi.
 */
export const MASTER_IO_FIELDS: FieldDef[] = [
  { header: "Satış Adı", key: "name", type: "text" },
  { header: "Fiyat", key: "basePrice", type: "number" },
  { header: "Stok", key: "stockQty", type: "int" },
  { header: "Barkod", key: "gtin", type: "barcode" },
  { header: "Durum", key: "status", type: "status" },
];

/** Yalnız yeni ürün açarken okunan koordinat sütunları. */
export const MASTER_COORD_HEADERS = ["Seri", "Renk", "Form", "Ambalaj", "Hazırlık"] as const;

export const MASTER_EXPORT_HEADER = [
  "ID",
  "Kod",
  ...MASTER_IO_FIELDS.map(f => f.header),
  ...MASTER_COORD_HEADERS,
];

export type MasterMatchBy = "kod" | "id";

/* ------------------------- Dışa aktarma ------------------------- */

function cellFor(p: MasterIORecord, f: FieldDef, numeric: boolean): string | number {
  const raw = p[f.key];
  if (f.type === "number" || f.type === "int") {
    if (raw === null || raw === undefined || raw === "") return numeric ? 0 : "0";
    const n = Number(raw);
    if (!Number.isFinite(n)) return numeric ? 0 : String(raw);
    // Ondalık sıfırları at: "190,00" değil "190" — insan gözü için.
    return numeric ? n : String(n);
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

/**
 * Ürünleri başlık + satır matrisine çevirir (ilk satır başlık).
 *
 * Adı olmayan ürünün "Satış Adı" hücresi BOŞ bırakılır. Türetilmiş adı
 * yazmak, dosya geri yüklendiğinde 88 ürüne sessizce elle girilmiş ad
 * atamak olurdu; kullanıcı boş hücreyi görüp kendi adını yazsın.
 */
export function buildMasterExportMatrix(
  masters: MasterIORecord[],
  opts: { numeric?: boolean } = {},
): (string | number)[][] {
  const numeric = opts.numeric ?? false;
  const rows = masters.map(p => [
    String(p.id),
    p.internalSku,
    ...MASTER_IO_FIELDS.map(f => cellFor(p, f, numeric)),
    p.series ?? "",
    p.colorName ?? "",
    p.family ?? "",
    p.packaging ?? "",
    p.readiness,
  ]);
  return [MASTER_EXPORT_HEADER, ...rows];
}

/** Boş şablon: başlık + ne yazılacağını gösteren tek örnek satır. */
export function buildMasterTemplateMatrix(): (string | number)[][] {
  return [
    MASTER_EXPORT_HEADER,
    [
      "", "", "Art of Colour Candy Kırmızı 100 ml", "190", "12", "8691960000015", "aktif",
      "CANDY", "Kırmızı", "1K Şeffaf", "100 ml", "r2u",
    ],
  ];
}

/** Matrisi CSV metnine çevirir (BOM + ; ayraç, Excel TR uyumlu). */
export function masterMatrixToCsv(matrix: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + matrix.map(row => row.map(esc).join(";")).join("\r\n");
}

/* ------------------------- İçe aktarma: parse ------------------------- */

export type ParsedSheet = {
  headers: string[];
  rows: Array<{ cells: string[]; line: number }>;
};

/** CSV metnini başlık + satırlara ayırır; ayraç ilk satırdan tahmin edilir. */
export function parseMasterCsv(text: string): {
  parsed: ParsedSheet | null;
  error: string | null;
} {
  const lines = text.split(/\r?\n/).filter((l, i) => l.trim().length > 0 || i === 0);
  if (lines.length < 2) {
    return { parsed: null, error: "Dosyada başlık + en az bir veri satırı olmalı." };
  }
  const first = lines[0];
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitCsvLine(first, sep).map(h => h.replace(/^﻿/, "").trim());
  const rows: ParsedSheet["rows"] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push({ cells: splitCsvLine(lines[i], sep), line: i + 1 });
  }
  return { parsed: { headers, rows }, error: null };
}

/** XLSX/CSV'den okunan hücre matrisini başlık + satırlara ayırır. */
export function masterMatrixToParsed(
  matrix: (string | number | null | undefined)[][],
): { parsed: ParsedSheet | null; error: string | null } {
  const toStr = (c: string | number | null | undefined) => (c == null ? "" : String(c));
  const rowsRaw = matrix.filter(r => r.some(c => toStr(c).trim() !== ""));
  if (rowsRaw.length < 2) {
    return { parsed: null, error: "Dosyada başlık + en az bir veri satırı olmalı." };
  }
  const headers = rowsRaw[0].map(c => toStr(c).replace(/^﻿/, "").trim());
  const rows: ParsedSheet["rows"] = [];
  for (let i = 1; i < rowsRaw.length; i++) rows.push({ cells: rowsRaw[i].map(toStr), line: i + 1 });
  return { parsed: { headers, rows }, error: null };
}

/* ------------------------- İçe aktarma: plan ------------------------- */

const STATUS_ALIASES: Record<string, MasterStatus> = {
  aktif: "aktif",
  satista: "aktif",
  acik: "aktif",
  taslak: "taslak",
  pasif: "arsiv",
  arsiv: "arsiv",
  kapali: "arsiv",
};

const READINESS_ALIASES: Record<string, MasterReadiness> = {
  r2u: "r2u",
  hazir: "r2u",
  kullanimahazir: "r2u",
  konsantre: "konsantre",
};

export type MasterFieldChange = { header: string; old: string; new: string };

export type PlannedMasterUpdate = {
  line: number;
  id: number;
  sku: string;
  label: string;
  changes: MasterFieldChange[];
  data: Record<string, unknown>;
};

export type PlannedMasterCreate = {
  line: number;
  label: string;
  coord: {
    seriesId: number;
    colorId: number;
    familyId: number;
    packagingId: number;
    readiness: MasterReadiness;
  };
  data: Record<string, unknown>;
};

export type MasterImportPlan = {
  creates: PlannedMasterCreate[];
  updates: PlannedMasterUpdate[];
  unchanged: Array<{ line: number; id: number; label: string }>;
  errors: Array<{ line: number; message: string }>;
  /** Dosyada bulunan düzenlenebilir sütunlar — "neye dokunulacak" özeti. */
  presentFields: string[];
};

const skuKey = (s: string) => norm(s).replace(/\s+/g, "");
/** Eksen adı eşleşmesi: "100 ml" ile "100ml" aynı sayılmalı. */
const dimKey = (s: string) => norm(s).replace(/\s+/g, "");

function parseCell(
  raw: string,
  type: FieldType,
): { ok: true; value: unknown; skip: boolean } | { ok: false; message: string } {
  const v = raw.trim();
  // Her tipte boş hücre = dokunma. Bu modülün en önemli kuralı.
  if (v === "") return { ok: true, value: null, skip: true };

  if (type === "number" || type === "int") {
    const n = parsePriceNumber(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: `sayı okunamadı ("${raw}")` };
    if (type === "int") {
      if (!Number.isInteger(n)) return { ok: false, message: `tam sayı olmalı ("${raw}")` };
      return { ok: true, value: n, skip: false };
    }
    return { ok: true, value: Math.round(n * 100) / 100, skip: false };
  }

  if (type === "barcode") {
    // "-" ile barkod silinebilsin: boş hücre "dokunma" demek olduğu için
    // silmenin ayrı bir işareti olmak zorunda.
    if (v === "-") return { ok: true, value: "", skip: false };
    if (!/^\d{8,14}$/.test(v)) {
      return { ok: false, message: `barkod 8-14 haneli rakam olmalı ("${raw}")` };
    }
    return { ok: true, value: v, skip: false };
  }

  if (type === "status") {
    const s = STATUS_ALIASES[dimKey(v)];
    if (!s) return { ok: false, message: `durum tanınmadı ("${raw}") — aktif/taslak/arşiv` };
    return { ok: true, value: s, skip: false };
  }

  return { ok: true, value: v, skip: false };
}

/** Mevcut değerin dosya gösterimi — diff karşılaştırması için. */
function currentDisplay(p: MasterIORecord, f: FieldDef): string {
  return String(cellFor(p, f, false));
}

const cubeKeyOf = (c: PlannedMasterCreate["coord"]) =>
  `${c.seriesId}/${c.colorId}/${c.familyId}/${c.packagingId}/${c.readiness}`;

/**
 * Dosyayı mevcut ürünlerle eşleştirip oluştur/güncelle planı çıkarır.
 *
 * Değişmeyen satırlar `unchanged`e düşer: 300 satırlık dosyada gerçekten
 * neyin değiştiğini görmek, "300 satır güncellenecek" demekten çok daha
 * kullanışlı ve yanlış dosyayı yüklediğini anlamanın tek yolu.
 */
export function planMasterImport(
  masters: MasterIORecord[],
  parsed: ParsedSheet,
  opts: { matchBy: MasterMatchBy; dims: MasterDimensions },
): MasterImportPlan {
  const normHeaders = parsed.headers.map(norm);
  const col = (header: string) => normHeaders.indexOf(norm(header));

  const fieldCols: Array<{ idx: number; field: FieldDef }> = [];
  for (const field of MASTER_IO_FIELDS) {
    const idx = col(field.header);
    if (idx >= 0) fieldCols.push({ idx, field });
  }
  const idIdx = col("ID");
  const skuIdx = col("Kod");
  const coordIdx = {
    series: col("Seri"),
    color: col("Renk"),
    family: col("Form"),
    packaging: col("Ambalaj"),
    readiness: col("Hazırlık"),
  };

  const plan: MasterImportPlan = {
    creates: [],
    updates: [],
    unchanged: [],
    errors: [],
    presentFields: fieldCols.map(c => c.field.header),
  };

  const matchIdx = opts.matchBy === "id" ? idIdx : skuIdx;
  if (matchIdx < 0) {
    plan.errors.push({
      line: 1,
      message:
        opts.matchBy === "id"
          ? '"ID" sütunu bulunamadı — koda göre eşleştirmeyi seçin ya da dışa aktarılan dosyayı kullanın.'
          : '"Kod" sütunu bulunamadı — dışa aktarılan dosyayı kullanın.',
    });
    return plan;
  }
  // Yalnız koordinat sütunu olan dosya geçerlidir: adsız/fiyatsız ürün açmak
  // (önce iskeleti kur, sonra doldur) yasak değil. Sadece düzenlenebilir alan
  // aranırsa böyle bir dosya "tanınan sütun yok" diye reddedilirdi.
  const hasCoordCols = Object.values(coordIdx).some(i => i >= 0);
  if (fieldCols.length === 0 && !hasCoordCols) {
    plan.errors.push({ line: 1, message: "Tanınan sütun yok — başlık satırını kontrol edin." });
    return plan;
  }

  const byId = new Map(masters.map(p => [p.id, p]));
  const bySku = new Map(masters.map(p => [skuKey(p.internalSku), p]));
  /** Koordinat → o koordinatı tutan ürünün kodu (ya da dosyadaki satır). */
  const takenCubes = new Map<string, string>(
    masters.map(p => [
      cubeKeyOf({
        seriesId: p.seriesId,
        colorId: p.colorId,
        familyId: p.familyId,
        packagingId: p.packagingId,
        readiness: p.readiness,
      }),
      p.internalSku,
    ]),
  );

  const dimIndex = {
    series: new Map(opts.dims.series.map(d => [dimKey(d.name), d.id])),
    colors: new Map(opts.dims.colors.map(d => [dimKey(d.name), d.id])),
    families: new Map(opts.dims.families.map(d => [dimKey(d.name), d.id])),
    packagings: new Map(opts.dims.packagings.map(d => [dimKey(d.name), d.id])),
  };

  const seenIds = new Set<number>();
  const nameIdx = fieldCols.find(c => c.field.key === "name")?.idx ?? -1;

  for (const row of parsed.rows) {
    const cell = (i: number) => (i >= 0 ? (row.cells[i] ?? "").trim() : "");
    if (row.cells.every(c => c.trim() === "")) continue;

    const matchValue = cell(matchIdx);
    const nameCell = cell(nameIdx);

    let existing: MasterIORecord | undefined;
    if (opts.matchBy === "id") {
      const id = parseInt(matchValue, 10);
      if (matchValue && !Number.isFinite(id)) {
        plan.errors.push({ line: row.line, message: `ID sayı değil ("${matchValue}")` });
        continue;
      }
      existing = Number.isFinite(id) ? byId.get(id) : undefined;
      if (matchValue && !existing) {
        plan.errors.push({ line: row.line, message: `ID ${matchValue} bulunamadı` });
        continue;
      }
    } else {
      existing = matchValue ? bySku.get(skuKey(matchValue)) : undefined;
    }

    // Aynı ürünün dosyada iki kez geçmesi: ikinci satır ilkini sessizce ezerdi.
    // Hangisinin kazandığı belirsiz olduğu için ikisi de reddedilir.
    if (existing) {
      if (seenIds.has(existing.id)) {
        plan.errors.push({
          line: row.line,
          message: `"${existing.internalSku}" dosyada birden fazla kez geçiyor — tek satır bırakın`,
        });
        continue;
      }
      seenIds.add(existing.id);
    }

    const data: Record<string, unknown> = {};
    const changes: MasterFieldChange[] = [];
    let rowFailed = false;

    for (const { idx, field } of fieldCols) {
      const parsedCell = parseCell(row.cells[idx] ?? "", field.type);
      if (!parsedCell.ok) {
        plan.errors.push({ line: row.line, message: `${field.header}: ${parsedCell.message}` });
        rowFailed = true;
        break;
      }
      if (parsedCell.skip) continue;

      if (existing) {
        // Yalnız DEĞİŞEN alan yazılır: aynı değeri geri yazmak gereksiz UPDATE
        // ve gürültülü bir "değişiklikler" listesi demek.
        const old = currentDisplay(existing, field);
        const next = String(parsedCell.value);
        if (old !== next) {
          data[field.key] = parsedCell.value;
          changes.push({ header: field.header, old, new: next });
        }
      } else {
        data[field.key] = parsedCell.value;
      }
    }
    if (rowFailed) continue;

    if (existing) {
      const label = existing.name?.trim() || existing.internalSku;
      if (changes.length === 0) {
        plan.unchanged.push({ line: row.line, id: existing.id, label });
        continue;
      }
      plan.updates.push({
        line: row.line,
        id: existing.id,
        sku: existing.internalSku,
        label,
        changes,
        data,
      });
      continue;
    }

    /* ---- Yeni ürün: koordinat çözülmeli ---- */

    if (matchValue) {
      // Eşleştirme sütunu dolu ama eşleşmedi: kullanıcı büyük ihtimalle mevcut
      // bir ürünü güncellemek istiyordu ve kodu yanlış yazdı. Sessizce yeni
      // ürün açmak tam da "mükerrer açmasın" kuralının ihlali olurdu.
      plan.errors.push({
        line: row.line,
        message: `"${matchValue}" kodlu ürün bulunamadı — yeni ürün için Kod sütununu boş bırakın`,
      });
      continue;
    }

    const missingCoord = (
      [
        ["Seri", coordIdx.series],
        ["Renk", coordIdx.color],
        ["Form", coordIdx.family],
        ["Ambalaj", coordIdx.packaging],
      ] as const
    ).filter(([, idx]) => !cell(idx));
    if (missingCoord.length > 0) {
      plan.errors.push({
        line: row.line,
        message: `yeni ürün için ${missingCoord.map(([h]) => h).join(", ")} sütunu dolu olmalı`,
      });
      continue;
    }

    const resolve = (label: string, value: string, index: Map<string, number>): number | null => {
      const id = index.get(dimKey(value));
      if (id == null) {
        // Tanınmayan eksen açılmaz: Excel'in yan etkisi olarak renk paleti
        // büyümemeli, yeni eksen Tanımlar'ın işi.
        plan.errors.push({
          line: row.line,
          message: `${label} tanınmadı ("${value}") — önce Tanımlar'dan ekleyin`,
        });
        return null;
      }
      return id;
    };

    const seriesId = resolve("Seri", cell(coordIdx.series), dimIndex.series);
    const colorId = resolve("Renk", cell(coordIdx.color), dimIndex.colors);
    const familyId = resolve("Form", cell(coordIdx.family), dimIndex.families);
    const packagingId = resolve("Ambalaj", cell(coordIdx.packaging), dimIndex.packagings);
    if (seriesId == null || colorId == null || familyId == null || packagingId == null) continue;

    const readinessRaw = cell(coordIdx.readiness);
    const readiness: MasterReadiness | undefined = readinessRaw
      ? READINESS_ALIASES[dimKey(readinessRaw)]
      : "konsantre";
    if (!readiness) {
      plan.errors.push({
        line: row.line,
        message: `Hazırlık tanınmadı ("${readinessRaw}") — konsantre ya da r2u`,
      });
      continue;
    }

    const coord = { seriesId, colorId, familyId, packagingId, readiness };
    const clash = takenCubes.get(cubeKeyOf(coord));
    if (clash) {
      plan.errors.push({
        line: row.line,
        message: `bu koordinatta ürün zaten var (${clash}) — mükerrer açılmaz, güncellemek için Kod sütununa o kodu yazın`,
      });
      continue;
    }

    const label =
      nameCell ||
      [cell(coordIdx.series), cell(coordIdx.color), cell(coordIdx.family), cell(coordIdx.packaging)]
        .filter(Boolean)
        .join(" · ");
    plan.creates.push({ line: row.line, label, coord, data });
    // Aynı dosyada aynı koordinatın iki kez açılmasını da engelle.
    takenCubes.set(cubeKeyOf(coord), `satır ${row.line}`);
  }

  return plan;
}
