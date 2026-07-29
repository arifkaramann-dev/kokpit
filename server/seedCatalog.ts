/**
 * Ürün mimarisi v3 boyut tohumlaması.
 *
 * Sözlük sıfırdan uydurulmaz — şirketin gerçek verisi zaten sistemde:
 *   · seriler        → productSeries tablosu (METEOR, CANDY, PRİMER…)
 *   · ambalajlar     → templates(kind="ambalaj") + materials(category="ambalaj")
 *   · renkler        → templates(kind="renk")
 *   · kullanım alanı → templates(kind="zemin") (3D baskı, Ahşap, Metal…)
 *
 * Idempotent: koda göre eşleşen kayda dokunmaz, yalnız eksikleri ekler.
 */

import * as db from "./db";
import {
  codeSegment,
  looksLikeSpray,
  parseVolumeMl,
  uniqueSkuSegments,
} from "./catalogCodes";

/** Renksiz kalemlerin (tiner, bazı vernikler) bağlandığı sabit renk. */
export const NOTR_COLOR_CODE = "notr";
/** Kullanım alanı belirtilmeyen jenerik ilanın kullandığı sabit kayıt. */
export const GENERIC_USE_CASE_CODE = "genel";

/**
 * Fiziksel formlar. "r2u" burada YOK — o bir form değil, masterProducts
 * .readiness bayrağı (aynı formun kullanıma hazır hali).
 */
const DEFAULT_FAMILIES = [
  { code: "airbrush", name: "Airbrush", skuSegment: "ab", sortOrder: 1 },
  { code: "paint", name: "Boya", skuSegment: "pt", sortOrder: 2 },
  { code: "sprey", name: "Sprey", skuSegment: "sp", sortOrder: 3 },
  { code: "rotus", name: "Rötuş", skuSegment: "rt", sortOrder: 4 },
];

const DEFAULT_CHANNELS = [
  { code: "trendyol", name: "Trendyol" },
  { code: "hepsiburada", name: "Hepsiburada" },
  { code: "n11", name: "N11" },
  { code: "ciceksepeti", name: "Çiçeksepeti" },
  { code: "web", name: "Web Mağazası" },
];

/** Kullanıcının belirttiği pazarlama eksenleri + mevcut "zemin" şablonları. */
const EXTRA_USE_CASES = [
  { code: "3d_baski", name: "3D Baskı" },
  { code: "rapala", name: "Rapala / Olta" },
  { code: "otomotiv", name: "Otomotiv" },
  { code: "bisiklet", name: "Bisiklet" },
  { code: "maket", name: "Maket & Figür" },
  { code: "rc", name: "RC Araba" },
];

export type SeedCounts = {
  colors: number;
  families: number;
  packagings: number;
  useCases: number;
  channels: number;
  seriesLinks: number;
};

export async function seedCatalogDimensions(): Promise<SeedCounts> {
  const [templates, series, materials] = await Promise.all([
    db.listTemplates(),
    db.listProductSeries(),
    db.listMaterials(),
  ]);

  const ofKind = (kind: string) =>
    (templates as { kind: string; name: string }[]).filter(t => t.kind === kind);

  /* --- Renkler ---------------------------------------------------------- */
  // "NOTR" ilk sırada: colorId NOT NULL olduğu için renksiz master'lar buna
  // bağlanır. NULL kullanılsaydı MySQL'de küp tekilliği delinirdi.
  const colorRows = [
    { code: NOTR_COLOR_CODE, name: "Renksiz / Nötr", hex: null, sortOrder: 0 },
    ...ofKind("renk").map((t, i) => ({
      code: codeSegment(t.name, 24) || `renk${i}`,
      name: t.name,
      sortOrder: i + 1,
    })),
  ];
  const colors = await db.seedColors(colorRows as never);

  /* --- Formlar ---------------------------------------------------------- */
  const families = await db.seedFamilies(DEFAULT_FAMILIES as never);

  /* --- Ambalajlar ------------------------------------------------------- */
  // Ambalajın stok kalemi (şişe) materials içinde adıyla eşleşir — kapasite
  // hesabında boya kadar şişe de kısıttır.
  const materialByName = new Map(
    (materials as { id: number; name: string }[]).map(m => [m.name.trim().toLowerCase(), m.id]),
  );
  const packagingNames = new Set<string>([
    ...ofKind("ambalaj").map(t => t.name),
    ...(materials as { name: string; category: string }[])
      .filter(m => m.category === "ambalaj")
      .map(m => m.name),
  ]);
  // SKU eki hacimden gelir ("100 ML PET" → "100") ama HACİM TEKİL DEĞİLDİR:
  // "30 ML PET" ve "30 ML CAM" ikisi de "30" alır ve aynı seri+renk+form
  // altında internal SKU çakışır. Ekler bu yüzden tekilleştirilir → "30pet",
  // "30cam".
  const draftRows = Array.from(packagingNames).map((name, i) => {
    const volumeMl = parseVolumeMl(name);
    return {
      id: i,
      code: codeSegment(name, 24) || `amb${i}`,
      name,
      volumeMl,
      base: volumeMl > 0 ? String(volumeMl).slice(0, 8) : codeSegment(name, 6),
    };
  });
  const segments = uniqueSkuSegments(draftRows);
  const packagingRows = draftRows.map(r => ({
    code: r.code,
    name: r.name,
    volumeMl: String(r.volumeMl),
    skuSegment: segments.get(r.id) ?? r.base,
    materialId: materialByName.get(r.name.trim().toLowerCase()) ?? null,
    sortOrder: r.id,
  }));
  const packagings = await db.seedPackagings(packagingRows as never);

  /* --- Kullanım alanları (LISTING ekseni) -------------------------------- */
  const useCaseNames = new Map<string, string>();
  useCaseNames.set(GENERIC_USE_CASE_CODE, "Genel");
  for (const t of ofKind("zemin")) {
    const code = codeSegment(t.name, 24);
    if (code) useCaseNames.set(code, t.name);
  }
  for (const u of EXTRA_USE_CASES) useCaseNames.set(u.code, u.name);
  const useCaseRows = Array.from(useCaseNames.entries()).map(([code, name], i) => ({
    code,
    name,
    sortOrder: code === GENERIC_USE_CASE_CODE ? 0 : i + 1,
  }));
  const useCases = await db.seedUseCases(useCaseRows as never);

  /* --- Kanallar ---------------------------------------------------------- */
  const channels = await db.seedSalesChannels(DEFAULT_CHANNELS);

  /* --- Seri uyumlulukları ------------------------------------------------ */
  // productSeries.packagingOptions JSON'u varsa ondan; yoksa serinin
  // kategorisinden makul bir varsayılan kurulur. Kullanıcı sonradan daraltır —
  // önemli olan kartezyen çarpımın ASLA kullanılmaması.
  const packagingIdByName = new Map<string, number>();
  for (const [code, id] of Array.from(packagings.map.entries())) {
    const row = packagingRows.find(p => p.code === code);
    if (row) packagingIdByName.set(row.name.trim().toLowerCase(), id);
  }
  const familyIdByCode = families.map;
  // Renk adı → kimlik. Seri colorOptions'ı ada göre eşleşir.
  const colorIdByName = new Map<string, number>();
  for (const [code, id] of Array.from(colors.map.entries())) {
    const row = colorRows.find(c => c.code === code);
    if (row) colorIdByName.set(row.name.trim().toLowerCase(), id);
  }
  const notrColorId = colors.map.get(NOTR_COLOR_CODE) ?? null;

  let seriesLinks = 0;
  for (const s of series as {
    id: number;
    name: string;
    category: string | null;
    packagingOptions: unknown;
    colorOptions: unknown;
  }[]) {
    const fromJson = parseLabels(s.packagingOptions)
      .map(label => packagingIdByName.get(label.trim().toLowerCase()))
      .filter((v): v is number => typeof v === "number");

    const isSprey = (s.category ?? "").toLowerCase().includes("sprey");
    const fallback = Array.from(packagingIdByName.entries())
      .filter(([name]) => (isSprey ? name.includes("sprey") : !name.includes("sprey")))
      .map(([, id]) => id);

    const packagingIds = Array.from(new Set(fromJson.length > 0 ? fromJson : fallback));
    if (packagingIds.length > 0) {
      await db.setSeriesPackagings(s.id, packagingIds);
      seriesLinks++;
    }

    const familyIds = isSprey
      ? [familyIdByCode.get("sprey")]
      : [familyIdByCode.get("airbrush"), familyIdByCode.get("paint")];
    const clean = familyIds.filter((v): v is number => typeof v === "number");
    if (clean.length > 0) await db.setSeriesFamilies(s.id, clean);

    // Seri × renk: ambalajdaki mantığın aynısı. Seride colorOptions tanımlıysa
    // YALNIZ o renkler üretilir. Eskiden bu bağ hiç kurulmuyordu ve renk
    // ekseni "hepsi" kalıyordu: CANDY için 31 rengin tamamı çarpıma girip
    // 744 master çıkıyordu. Renksiz/nötr her seride bulunur (renksiz kalemler
    // ona bağlanır).
    const seriesColorIds = parseLabels(s.colorOptions)
      .map(label => colorIdByName.get(label.trim().toLowerCase()))
      .filter((v): v is number => typeof v === "number");
    if (seriesColorIds.length > 0) {
      const withNotr = new Set(seriesColorIds);
      if (notrColorId) withNotr.add(notrColorId);
      await db.setSeriesColors(s.id, Array.from(withNotr));
    }
  }

  /* --- Form × ambalaj uyumluluğu ----------------------------------------- */
  // Küp seri×ambalaj ve seri×form eksenlerinde seyrekti ama form ile ambalaj
  // arasında kısıt yoktu: "Airbrush · SPREY 400ML" master'ı üretiliyordu.
  // Sprey kutusu yalnız sprey formunda, diğer ambalajlar sprey dışındaki
  // formlarda anlamlıdır.
  const allPackagings = (await db.listPackagings()) as {
    id: number;
    name: string;
    isActive: number;
  }[];
  const sprayPackagingIds = allPackagings.filter(p => looksLikeSpray(p.name)).map(p => p.id);
  const nonSprayPackagingIds = allPackagings.filter(p => !looksLikeSpray(p.name)).map(p => p.id);

  for (const [code, familyId] of Array.from(familyIdByCode.entries())) {
    const isSprayFamily = code === "sprey";
    const ids = isSprayFamily ? sprayPackagingIds : nonSprayPackagingIds;
    if (ids.length > 0) await db.setFamilyPackagings(familyId, ids);
  }

  return {
    colors: colors.created,
    families: families.created,
    packagings: packagings.created,
    useCases: useCases.created,
    channels: channels.created,
    seriesLinks,
  };
}

/** productSeries JSON alanlarındaki {label,value} veya düz metin dizisini çözer. */
function parseLabels(value: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  }
  return arr
    .map(x => {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        return String(o.label ?? o.value ?? "").trim();
      }
      return String(x).trim();
    })
    .filter(Boolean);
}
