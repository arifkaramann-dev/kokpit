/**
 * Üretim brifingi — "bu siparişler için ne üreteceğim, neyim eksik?"
 *
 * Bugün sipariş gelince sistem hiçbir şey söylemiyor: içerik dökümü yalnız
 * ürün adı ve adet basıyor. Oysa elde reçete ve hammadde stoğu var; sipariş
 * satırından üretim emri ve eksik listesi ÇIKARILABİLİR.
 *
 * Bu dosya iki işi yapar:
 *   1) Sipariş satırlarını master ürüne bağlar (pazaryeri kodu → ad eşleşmesi)
 *   2) Gereken hammaddeyi çok seviyeli reçeteden patlatır ve eksikleri bulur
 *
 * Saf fonksiyon — veritabanı gerektirmez, tamamen test edilebilir.
 */

import type { CapacityFormula, CapacityMaterial, CapacityPackaging } from "./capacity";
import { materialAtp } from "./capacity";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------- Sipariş satırı çözümleme ------------------------ */

export type OrderLine = {
  id: number;
  orderId: number;
  productName: string;
  quantity: number;
  /** Pazaryerinden gelen satıcı kodu / barkod (varsa). */
  channelRef?: string | null;
  /**
   * Sipariş düşerken kesin olarak çözülüp SAKLANMIŞ master bağı.
   * Doluysa tahmin yürütülmez — bu alan bulanık eşleştirmeyi kritik yoldan
   * çıkarmak için vardır.
   */
  masterId?: number | null;
};

export type ResolvableListing = {
  masterId: number;
  listingId: number;
  title: string;
  /** Bu ilanın kanal kodları — pazaryeri SKU'su ve barkodu. */
  channelRefs: string[];
};

export type ResolvedLine = {
  line: OrderLine;
  masterId: number | null;
  /** Nasıl eşleşti — teşhis ve güven seviyesi için. */
  via: "kayitli" | "kanal_kodu" | "baslik" | "yaklasik" | "eslesmedi";
};

/** Başlık karşılaştırması: Türkçe harf, boşluk ve noktalama farkını yok sayar. */
function normalizeTitle(s: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i",
  };
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıiöşüâî]/g, ch => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kelime kümesi örtüşmesi (Jaccard) — pazaryeri başlıkları birebir tutmaz. */
function similarity(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter(w => w.length > 2));
  const wb = new Set(b.split(" ").filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let hit = 0;
  for (const w of Array.from(wa)) if (wb.has(w)) hit++;
  return hit / (wa.size + wb.size - hit);
}

/**
 * Sipariş satırlarını master'a bağlar. Dört yol, güvenden zayıfa:
 *   0) Kayıtlı bağ (`orderItems.masterId`) — sipariş düşerken bir kez çözüldü
 *   1) Pazaryeri kodu (kesin) — ilan yayınlanmışsa bu çalışır
 *   2) Başlık birebir
 *   3) Kelime örtüşmesi ≥ eşik — pazaryeri başlıkları düzenlenebildiği için
 *
 * 0 ve 1 kesindir; 2 ve 3 tahmindir ve YEDEK yoldur. Normal işleyişte her
 * satır 0 ile biter: kanal kodu sipariş anında saklanıp çözülür. 2-3 yalnız
 * elden girilen ya da ilanı silinmiş kalemler için kalır.
 *
 * Eşleşmeyen satır sessizce düşmez; çağıran onu kullanıcıya gösterir.
 * Yanlış eşleşme, eşleşmemekten kötüdür — eşik bilinçli olarak yüksek.
 */
export function resolveOrderLines(
  lines: OrderLine[],
  listings: ResolvableListing[],
  minSimilarity = 0.6,
): ResolvedLine[] {
  const byRef = new Map<string, number>();
  const byTitle = new Map<string, number>();
  const normalized: { masterId: number; title: string }[] = [];

  for (const l of listings) {
    for (const ref of l.channelRefs) {
      const key = ref.trim().toLowerCase();
      if (key) byRef.set(key, l.masterId);
    }
    const t = normalizeTitle(l.title);
    if (t && !byTitle.has(t)) byTitle.set(t, l.masterId);
    normalized.push({ masterId: l.masterId, title: t });
  }

  return lines.map((line): ResolvedLine => {
    // Kayıtlı bağ her şeyi ezer: elle düzeltilmiş bir bağ tahminle bozulmamalı.
    if (line.masterId != null) return { line, masterId: line.masterId, via: "kayitli" };

    const ref = line.channelRef?.trim().toLowerCase();
    if (ref && byRef.has(ref)) {
      return { line, masterId: byRef.get(ref)!, via: "kanal_kodu" };
    }
    const t = normalizeTitle(line.productName);
    if (byTitle.has(t)) return { line, masterId: byTitle.get(t)!, via: "baslik" };

    let best: { masterId: number; score: number } | null = null;
    for (const n of normalized) {
      const score = similarity(t, n.title);
      if (!best || score > best.score) best = { masterId: n.masterId, score };
    }
    if (best && best.score >= minSimilarity) {
      return { line, masterId: best.masterId, via: "yaklasik" };
    }
    return { line, masterId: null, via: "eslesmedi" };
  });
}

/* ------------------------- Malzeme ihtiyacı patlatma ----------------------- */

export type PlanMaster = {
  id: number;
  formulaId: number | null;
  formulaScale: number;
  packagingId: number | null;
};

export type MaterialNeed = {
  materialId: number;
  name: string;
  type: CapacityMaterial["type"];
  /** Toplam ihtiyaç (yarı mamul üretimi dahil). */
  needed: number;
  /** Satılabilir stok (stok − rezerve − emniyet). */
  available: number;
  /** Eksik miktar — 0 ise yeterli. */
  missing: number;
};

/** Yarı mamul üretim emri: önce bunu üretmeden mamul yapılamaz. */
export type ProductionStep = {
  materialId: number;
  name: string;
  produceQty: number;
};

export type ProductionPlan = {
  /** Kalem bazında ihtiyaç/eksik dökümü — hammadde ve ambalaj dahil. */
  needs: MaterialNeed[];
  /** Eksik kalemler (needs'in filtrelenmiş hali, alım listesi). */
  shortages: MaterialNeed[];
  /** Üretilmesi gereken yarı mamuller — sırayla. */
  steps: ProductionStep[];
  /** Reçetesi olmayan master'lar — plan eksik kalır, sessizce geçilmez. */
  missingFormula: number[];
  canProduce: boolean;
};

/**
 * Sipariş edilen master'lar için malzeme ihtiyacını çok seviyeli reçeteden
 * patlatır.
 *
 * Yarı mamullerde ELDEKİ STOK önce düşülür: 4.000 gr harç gerekiyorsa ve
 * 1.200 gr varsa yalnız 2.800 gr üretilir, hammadde ihtiyacı ona göre çıkar.
 * Aksi halde depoda duran yarı mamul yok sayılır ve gereksiz alım önerilir.
 *
 * İşlem sırası: mamul → yarı mamul → hammadde. Yarı mamuller tüketen taraf
 * hesaplandıktan SONRA patlatılır, yoksa iç içe ihtiyaçlar eksik çıkar.
 */
export function planProduction(input: {
  demand: { masterId: number; qty: number }[];
  masters: PlanMaster[];
  formulas: CapacityFormula[];
  packagings: CapacityPackaging[];
  materials: CapacityMaterial[];
}): ProductionPlan {
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const formulaById = new Map(input.formulas.map(f => [f.id, f]));
  const packById = new Map(input.packagings.map(p => [p.id, p]));
  const materialById = new Map(input.materials.map(m => [m.id, m]));

  // Yarı mamul üreten reçeteler: çıktı kalemi → reçete.
  const formulaByOutput = new Map<number, CapacityFormula>();
  for (const f of input.formulas) {
    if (f.outputType === "yari_mamul" && f.outputMaterialId != null) {
      formulaByOutput.set(f.outputMaterialId, f);
    }
  }

  const need = new Map<number, number>();
  const addNeed = (materialId: number, qty: number) => {
    if (qty > 0) need.set(materialId, (need.get(materialId) ?? 0) + qty);
  };

  const missingFormula: number[] = [];

  // 1) Mamul seviyesi: reçete girdileri (hacimle ölçeklenir) + ambalaj (sabit).
  for (const d of input.demand) {
    if (d.qty <= 0) continue;
    const master = masterById.get(d.masterId);
    if (!master?.formulaId) {
      missingFormula.push(d.masterId);
      continue;
    }
    const f = formulaById.get(master.formulaId);
    if (!f) {
      missingFormula.push(d.masterId);
      continue;
    }
    const yieldRatio = 1 - Math.min(Math.max(num(f.wastePercent), 0), 99) / 100;
    const scale = num(master.formulaScale) || 1;
    for (const inp of f.inputs) {
      addNeed(inp.inputMaterialId, (num(inp.qtyPerBase) * scale * d.qty) / yieldRatio);
    }
    const pack = master.packagingId != null ? packById.get(master.packagingId) : undefined;
    if (pack?.materialId != null) addNeed(pack.materialId, d.qty);
    for (const pi of pack?.inputs ?? []) addNeed(pi.materialId, num(pi.qtyPerUnit) * d.qty);
  }

  // 2) Yarı mamulleri patlat. Tüketen taraf tamamen hesaplandıktan sonra
  //    işlenmeli; iç içe yarı mamuller için döngü tekrar tarar.
  const steps: ProductionStep[] = [];
  const expanded = new Set<number>();
  // Derinlik sınırı: reçete döngüsü varsa sonsuza gitmesin (capacity.ts
  // döngüyü ayrıca raporlar; burada güvenlik freni).
  for (let depth = 0; depth < 20; depth++) {
    const pending = Array.from(need.keys()).filter(
      id => formulaByOutput.has(id) && !expanded.has(id),
    );
    if (pending.length === 0) break;

    for (const materialId of pending) {
      expanded.add(materialId);
      const total = need.get(materialId) ?? 0;
      const stock = materialAtp(materialById.get(materialId) ?? { id: materialId, name: "", type: "hammadde", stockQty: 0 });
      // Elde duran yarı mamul düşülür — yalnız eksik kısmı üretilir.
      const produce = Math.max(0, total - stock);
      if (produce <= 0) continue;

      const f = formulaByOutput.get(materialId)!;
      const base = num(f.baseQty);
      const yieldRatio = 1 - Math.min(Math.max(num(f.wastePercent), 0), 99) / 100;
      if (base <= 0 || yieldRatio <= 0) continue;

      steps.push({
        materialId,
        name: materialById.get(materialId)?.name ?? `#${materialId}`,
        produceQty: produce,
      });
      // Bir birim çıktı için girdi = qtyPerBase / (baz × verim)
      for (const inp of f.inputs) {
        addNeed(inp.inputMaterialId, (num(inp.qtyPerBase) * produce) / (base * yieldRatio));
      }
    }
  }

  // 3) Karşılaştırma. Yarı mamullerde ihtiyacın stoktan fazlası ÜRETİLDİĞİ
  //    için eksik sayılmaz — eksik, satın alınması gereken kalemdir.
  const needs: MaterialNeed[] = [];
  for (const [materialId, needed] of Array.from(need.entries())) {
    const mat = materialById.get(materialId);
    const type = mat?.type ?? "hammadde";
    // Masraf kalemleri fiziksel kısıt değildir.
    if (type === "masraf") continue;
    const available = mat ? materialAtp(mat) : 0;
    const producible = formulaByOutput.has(materialId);
    const missing = producible ? 0 : Math.max(0, needed - available);
    needs.push({
      materialId,
      name: mat?.name ?? `#${materialId}`,
      type,
      needed: Math.round(needed * 1000) / 1000,
      available,
      missing: Math.round(missing * 1000) / 1000,
    });
  }

  needs.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, "tr"));
  const shortages = needs.filter(n => n.missing > 0);

  return {
    needs,
    shortages,
    steps,
    missingFormula,
    canProduce: shortages.length === 0 && missingFormula.length === 0,
  };
}
