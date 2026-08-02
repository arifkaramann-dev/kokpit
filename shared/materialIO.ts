/**
 * Hammadde Excel/CSV içe-dışa aktarma (saf modül).
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Hammadde tek tek diyalogdan giriliyordu. Tedarikçi zam listesi geldiğinde
 * 60 kalemin birim maliyetini elle güncellemek yarım gün sürüyor ve yarısı
 * eksik kalıyor — sonra da maliyet/kâr hesabı eski fiyatla çalışıyor.
 *
 * ── Sözleşme ──────────────────────────────────────────────────────────────
 * "Oluştur-veya-güncelle": ad (ya da ID) ile eşleşen satır GÜNCELLENİR,
 * eşleşmeyen satır YENİ kalem olur. Dosyada olmayan sütuna hiç dokunulmaz;
 * dolayısıyla yalnız "Ad" + "Birim Maliyet" sütunlu bir zam listesi
 * yüklendiğinde stok, eşik ve tedarikçi olduğu gibi kalır.
 *
 * Sayı hücresinde BOŞ = "dokunma". Zam listesinde fiyatı yazılmayan kalemin
 * stoğunun sıfırlanması, kullanıcının asla istemeyeceği ama sessizce olan
 * türden bir hasardır.
 *
 * Aynı dışa aktarma dosyası düzenlenip geri yüklenince birebir round-trip
 * olur: tek alan kataloğu (`MATERIAL_IO_FIELDS`) hem yazmayı hem okumayı
 * besler, ikisi ayrışamaz.
 */

import { norm, parsePriceNumber, splitCsvLine } from "./pricing";
import { normalizeUnit } from "./units";

export type MaterialIORecord = {
  id: number;
  name: string;
  category: string;
  unit: string;
  type: "hammadde" | "yari_mamul" | "ambalaj" | "masraf";
  stockQty: number | string;
  criticalQty: number | string;
  unitCost: number | string;
  supplierId: number | null;
  notes: string | null;
};

type FieldType = "text" | "number" | "unit" | "type";

type FieldDef = {
  header: string;
  key: keyof MaterialIORecord | "supplierName";
  type: FieldType;
};

/**
 * Düzenlenebilir alanlar. Sıra dosyadaki sütun sırasıdır; en sık düzenlenen
 * (ad, birim, maliyet) başta durur ki kullanıcı sağa kaydırmadan çalışsın.
 */
export const MATERIAL_IO_FIELDS: FieldDef[] = [
  { header: "Malzeme Adı", key: "name", type: "text" },
  { header: "Kategori", key: "category", type: "text" },
  { header: "Birim", key: "unit", type: "unit" },
  { header: "Birim Maliyet", key: "unitCost", type: "number" },
  { header: "Stok", key: "stockQty", type: "number" },
  { header: "Kritik Eşik", key: "criticalQty", type: "number" },
  { header: "Tedarikçi", key: "supplierName", type: "text" },
  { header: "Tür", key: "type", type: "type" },
  { header: "Notlar", key: "notes", type: "text" },
];

export const MATERIAL_EXPORT_HEADER = ["ID", ...MATERIAL_IO_FIELDS.map(f => f.header)];

export type MaterialMatchBy = "ad" | "id";

/* ------------------------- Dışa aktarma ------------------------- */

function cellFor(
  m: MaterialIORecord,
  f: FieldDef,
  supplierName: (id: number | null) => string,
  numeric: boolean,
): string | number {
  if (f.key === "supplierName") return supplierName(m.supplierId);
  const raw = m[f.key as keyof MaterialIORecord];
  if (f.type === "number") {
    if (raw === null || raw === undefined || raw === "") return numeric ? 0 : "0";
    const n = Number(raw);
    if (!Number.isFinite(n)) return numeric ? 0 : String(raw);
    // Ondalık sıfırları at: "0,200" değil "0,2" — insan gözü için.
    return numeric ? n : String(n);
  }
  return raw === null || raw === undefined ? "" : String(raw);
}

/**
 * Hammaddeleri başlık + satır matrisine çevirir (ilk satır başlık).
 * `numeric` açıksa sayısal hücreler gerçek sayı döner (XLSX için).
 */
export function buildMaterialExportMatrix(
  materials: MaterialIORecord[],
  opts: { suppliers?: { id: number; name: string }[]; numeric?: boolean } = {},
): (string | number)[][] {
  const byId = new Map((opts.suppliers ?? []).map(s => [s.id, s.name]));
  const supplierName = (id: number | null) => (id != null ? (byId.get(id) ?? "") : "");
  const numeric = opts.numeric ?? false;
  const rows = materials.map(m => [
    String(m.id),
    ...MATERIAL_IO_FIELDS.map(f => cellFor(m, f, supplierName, numeric)),
  ]);
  return [MATERIAL_EXPORT_HEADER, ...rows];
}

/** Boş şablon: başlık + kullanıcıya ne yazacağını gösteren tek örnek satır. */
export function buildMaterialTemplateMatrix(): (string | number)[][] {
  return [
    MATERIAL_EXPORT_HEADER,
    ["", "Örnek: Siyah Pigment", "pigment", "gr", "1,9", "1000", "200", "Erdem Boya", "hammadde", "parti 2026-01"],
  ];
}

/** Matrisi CSV metnine çevirir (BOM + ; ayraç, Excel TR uyumlu). */
export function materialMatrixToCsv(matrix: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + matrix.map(row => row.map(esc).join(";")).join("\r\n");
}

/* ------------------------- İçe aktarma: parse ------------------------- */

export type ParsedSheet = {
  headers: string[];
  rows: Array<{ cells: string[]; line: number }>;
};

/** CSV metnini başlık + satırlara ayırır; ayraç ilk satırdan tahmin edilir. */
export function parseMaterialCsv(text: string): { parsed: ParsedSheet | null; error: string | null } {
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

/** XLSX'ten okunan hücre matrisini aynı yapıya çevirir. */
export function materialMatrixToParsed(
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

const TYPE_ALIASES: Record<string, MaterialIORecord["type"]> = {
  hammadde: "hammadde",
  raw: "hammadde",
  yarimamul: "yari_mamul",
  yari_mamul: "yari_mamul",
  "yari mamul": "yari_mamul",
  ambalaj: "ambalaj",
  paket: "ambalaj",
  masraf: "masraf",
  gider: "masraf",
};

export type MaterialFieldChange = { header: string; old: string; new: string };

export type PlannedMaterialUpdate = {
  line: number;
  id: number;
  name: string;
  changes: MaterialFieldChange[];
  data: Record<string, unknown>;
  /** Dosyada adı yazılı ama kayıtlı olmayan tedarikçi — içe aktarmada açılır. */
  newSupplier: string | null;
};

export type PlannedMaterialCreate = {
  line: number;
  name: string;
  data: Record<string, unknown>;
  newSupplier: string | null;
  warnings: string[];
};

export type MaterialImportPlan = {
  creates: PlannedMaterialCreate[];
  updates: PlannedMaterialUpdate[];
  unchanged: Array<{ line: number; id: number; name: string }>;
  errors: Array<{ line: number; message: string }>;
  /** Dosyada bulunan düzenlenebilir sütunlar — "neye dokunulacak" özeti. */
  presentFields: string[];
  /** Açılacak yeni tedarikçiler (tekilleştirilmiş). */
  newSuppliers: string[];
};

/** Ad karşılaştırması: Türkçe karakter ve boşluk farkına takılmamalı. */
const nameKey = (s: string) => norm(s).replace(/\s+/g, " ");

function parseMaterialCell(
  raw: string,
  type: FieldType,
): { ok: true; value: unknown; skip: boolean } | { ok: false; message: string } {
  const v = raw.trim();
  if (type === "number") {
    // Sayıda boş hücre = dokunma. Zam listesinde yalnız fiyat sütunu doludur;
    // boşları 0 saymak stokları sessizce sıfırlardı.
    if (v === "") return { ok: true, value: null, skip: true };
    const n = parsePriceNumber(v);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: `sayı okunamadı ("${raw}")` };
    return { ok: true, value: Math.round(n * 10000) / 10000, skip: false };
  }
  if (v === "") return { ok: true, value: null, skip: true };
  if (type === "unit") {
    const code = normalizeUnit(v);
    if (!code) {
      return { ok: false, message: `birim tanınmadı ("${raw}") — gr, kg, ml, lt, adet kullanın` };
    }
    return { ok: true, value: code, skip: false };
  }
  if (type === "type") {
    const t = TYPE_ALIASES[norm(v).replace(/\s+/g, "")] ?? TYPE_ALIASES[norm(v)];
    if (!t) {
      return { ok: false, message: `tür tanınmadı ("${raw}") — hammadde/yari_mamul/ambalaj/masraf` };
    }
    return { ok: true, value: t, skip: false };
  }
  return { ok: true, value: v, skip: false };
}

/** Mevcut değerin dosya gösterimi — diff karşılaştırması için. */
function currentDisplay(
  m: MaterialIORecord,
  f: FieldDef,
  supplierName: (id: number | null) => string,
): string {
  return String(cellFor(m, f, supplierName, false));
}

/**
 * Dosyayı mevcut hammaddelerle eşleştirip oluştur/güncelle planı çıkarır.
 *
 * Değişmeyen satırlar `unchanged`e düşer: 300 satırlık bir dosyada gerçekten
 * neyin değiştiğini görmek, "300 satır güncellenecek" demekten çok daha
 * kullanışlı ve yanlış dosyayı yüklediğini anlamanın tek yolu.
 */
export function planMaterialImport(
  materials: MaterialIORecord[],
  parsed: ParsedSheet,
  opts: { matchBy: MaterialMatchBy; suppliers?: { id: number; name: string }[] },
): MaterialImportPlan {
  const normHeaders = parsed.headers.map(norm);
  const supplierByName = new Map(
    (opts.suppliers ?? []).map(s => [nameKey(s.name), s]),
  );
  const supplierNameById = new Map((opts.suppliers ?? []).map(s => [s.id, s.name]));
  const supplierName = (id: number | null) => (id != null ? (supplierNameById.get(id) ?? "") : "");

  const fieldCols: Array<{ idx: number; field: FieldDef }> = [];
  for (const field of MATERIAL_IO_FIELDS) {
    const idx = normHeaders.indexOf(norm(field.header));
    if (idx >= 0) fieldCols.push({ idx, field });
  }
  const idIdx = normHeaders.indexOf(norm("ID"));
  const nameIdx = fieldCols.find(c => c.field.key === "name")?.idx ?? -1;

  const plan: MaterialImportPlan = {
    creates: [],
    updates: [],
    unchanged: [],
    errors: [],
    presentFields: fieldCols.map(c => c.field.header),
    newSuppliers: [],
  };

  const matchIdx = opts.matchBy === "id" ? idIdx : nameIdx;
  if (matchIdx < 0) {
    plan.errors.push({
      line: 1,
      message:
        opts.matchBy === "id"
          ? '"ID" sütunu bulunamadı — ada göre eşleştirmeyi seçin ya da dışa aktarılan dosyayı kullanın.'
          : '"Malzeme Adı" sütunu bulunamadı.',
    });
    return plan;
  }
  if (fieldCols.length === 0) {
    plan.errors.push({ line: 1, message: "Tanınan sütun yok — başlık satırını kontrol edin." });
    return plan;
  }

  const byId = new Map(materials.map(m => [m.id, m]));
  const byName = new Map(materials.map(m => [nameKey(m.name), m]));
  const seenKeys = new Set<string>();
  const newSuppliers = new Set<string>();

  for (const row of parsed.rows) {
    const cell = (i: number) => (i >= 0 ? (row.cells[i] ?? "").trim() : "");
    const matchValue = cell(matchIdx);
    const rowName = cell(nameIdx);

    if (!matchValue && !rowName) continue; // tamamen boş satır

    let existing: MaterialIORecord | undefined;
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
      existing = byName.get(nameKey(matchValue));
    }

    // Aynı dosyada aynı kalemin iki kez geçmesi: ikinci satır ilkini sessizce
    // ezerdi. Hangi satırın kazandığı belirsiz olduğu için ikisi de reddedilir.
    const dedupeKey = existing ? `id:${existing.id}` : `ad:${nameKey(rowName)}`;
    if (seenKeys.has(dedupeKey)) {
      plan.errors.push({
        line: row.line,
        message: `"${rowName || matchValue}" dosyada birden fazla kez geçiyor — tek satır bırakın`,
      });
      continue;
    }
    seenKeys.add(dedupeKey);

    const data: Record<string, unknown> = {};
    const changes: MaterialFieldChange[] = [];
    const warnings: string[] = [];
    let supplierForRow: string | null = null;
    let rowFailed = false;

    for (const { idx, field } of fieldCols) {
      const rawCell = row.cells[idx] ?? "";
      const parsedCell = parseMaterialCell(rawCell, field.type);
      if (!parsedCell.ok) {
        plan.errors.push({ line: row.line, message: `${field.header}: ${parsedCell.message}` });
        rowFailed = true;
        break;
      }
      if (parsedCell.skip) continue;

      if (field.key === "supplierName") {
        const supplier = supplierByName.get(nameKey(String(parsedCell.value)));
        if (supplier) {
          if (!existing || existing.supplierId !== supplier.id) {
            data.supplierId = supplier.id;
            changes.push({
              header: field.header,
              old: existing ? supplierName(existing.supplierId) : "",
              new: supplier.name,
            });
          }
        } else {
          // Tanınmayan tedarikçi: satırı reddetmek yerine açmayı öner.
          supplierForRow = String(parsedCell.value);
          newSuppliers.add(supplierForRow);
          changes.push({
            header: field.header,
            old: existing ? supplierName(existing.supplierId) : "",
            new: `${supplierForRow} (yeni)`,
          });
        }
        continue;
      }

      if (existing) {
        // Mevcut kayıtta yalnız DEĞİŞEN alan yazılır: aynı değeri geri yazmak
        // gereksiz UPDATE ve gürültülü bir "değişiklikler" listesi demek.
        const old = currentDisplay(existing, field, supplierName);
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
      if (changes.length === 0) {
        plan.unchanged.push({ line: row.line, id: existing.id, name: existing.name });
        continue;
      }
      plan.updates.push({
        line: row.line,
        id: existing.id,
        name: existing.name,
        changes,
        data,
        newSupplier: supplierForRow,
      });
      continue;
    }

    // Yeni kalem.
    const name = String(data.name ?? rowName ?? "").trim();
    if (!name) {
      plan.errors.push({ line: row.line, message: "Malzeme adı boş — yeni kalem açılamaz" });
      continue;
    }
    data.name = name;
    if (!data.unit) {
      data.unit = "gr";
      warnings.push("birim yazılmamış, gr kabul edildi");
    }
    if (!data.category) {
      data.category = "diğer";
      warnings.push("kategori yazılmamış, 'diğer' kabul edildi");
    }
    if (data.unitCost == null) warnings.push("birim maliyet boş — maliyet hesabına 0 girer");
    plan.creates.push({ line: row.line, name, data, newSupplier: supplierForRow, warnings });
  }

  plan.newSuppliers = Array.from(newSuppliers);
  return plan;
}
