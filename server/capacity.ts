/**
 * Kapasite motoru — çok seviyeli reçeteden (BOM) üretilebilir adet hesabı.
 *
 * Siparişe göre üretim yapıldığı için "satılabilir miktar" mamul stoğu değil,
 * ELDEKİ HAMMADDEYLE ÜRETİLEBİLİR ADET'tir. Zincir çok seviyelidir:
 *
 *     hammadde ─► yarı mamul (harç) ─► yarı mamul (r2u) ─► mamul (master)
 *     ambalaj  ─────────────────────────────────────────►
 *
 * Saf fonksiyon: veritabanı bağlantısı gerektirmez, tamamen test edilebilir.
 * Router yalnızca veriyi okuyup buraya besler.
 *
 * ── Bilinçli yaklaşıklık ──────────────────────────────────────────────────
 * Paylaşılan girdiler (her renkte kullanılan bağlayıcı gibi) yüzünden her
 * master'ı bağımsız hesaplamak kapasiteyi ABARTIR: iki renk de "25 yapabilirim"
 * der ama ikisini birden yapamazsınız. Bunu tam çözmek doğrusal programlama
 * (MRP netlemesi) ister ve bu ölçekte aşırı mühendisliktir.
 *
 * Abartı zararsızdır çünkü ilana yazılan sayı min(buildable, virtualStockCap)
 * ve tavan ~10'dur: 25 de 40 da 10 olarak yazılır. Hesabın hassas olması
 * gereken tek yer sıfıra yakın bölgedir, orada da sipariş rezervasyonu
 * (materials.reservedQty) gerçeği söyler. Yani hesap "tam kaç tane" sorusunda
 * değil, "hiç yapabilir miyim" sorusunda doğrudur — kritik olan da odur.
 */

import { qtyInMaterialUnit } from "@shared/units";

export type MaterialType = "hammadde" | "yari_mamul" | "ambalaj" | "masraf";

type Num = number | string | null | undefined;

export type CapacityMaterial = {
  id: number;
  name: string;
  type: MaterialType;
  stockQty: Num;
  reservedQty?: Num;
  safetyQty?: Num;
  /** Stok ve fiyatın hangi birimde tutulduğu (gr, kg, ml, lt, adet). */
  unit?: string | null;
};

export type CapacityFormula = {
  id: number;
  outputType: "yari_mamul" | "mamul";
  /** Yarı mamul üretiyorsa çıktının materials kimliği. */
  outputMaterialId: number | null;
  /** Reçete kaç birim çıktı için yazıldı (ölçeklemenin paydası). */
  baseQty: Num;
  /** `baseQty`nin birimi — çıktı kaleminin biriminden farklı olabilir. */
  baseUnit?: string | null;
  wastePercent?: Num;
  /** `unit` boşsa miktar kalemin kendi biriminde kabul edilir (eski kayıtlar). */
  inputs: { inputMaterialId: number; qtyPerBase: Num; unit?: string | null }[];
};

export type CapacityPackaging = {
  id: number;
  /** Ana kap (şişe/kutu) — adet başına 1. */
  materialId: number | null;
  /** Kapak, etiket, koli — hacimle ölçeklenmeyen sabit kalemler. */
  inputs?: { materialId: number; qtyPerUnit: Num; unit?: string | null }[];
};

export type CapacityMaster = {
  id: number;
  formulaId: number | null;
  /** Ambalaj hacmi / reçete baz hacmi. */
  formulaScale: Num;
  packagingId: number | null;
};

/** Kapasiteyi kısıtlayan kalem — darboğaz raporunun ham verisi. */
export type Bottleneck = {
  materialId: number;
  materialName: string;
  /** Bu kalemden kullanılabilir miktar (stok + üretilebilir). */
  available: number;
  /** Bir adet mamul için gereken miktar. */
  needPerUnit: number;
};

export type BuildableReason =
  | "ok"
  | "recete_yok"
  | "recete_bos"
  | "girdi_bulunamadi"
  | "dongu";

export type MasterCapacity = {
  masterId: number;
  buildable: number;
  reason: BuildableReason;
  bottleneck: Bottleneck | null;
};

export type CapacityReport = {
  masters: MasterCapacity[];
  /** materialId → kullanılabilir miktar (stok + üretilebilir). */
  available: Map<number, number>;
  /** materialId → kaç master'ın darboğazı olduğu (alım önceliği). */
  bottleneckCounts: Map<number, number>;
  /** Reçetelerde döngü varsa zincirler (veri girişi hatası). */
  cycles: number[][];
};

const num = (v: Num): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Satılabilir hammadde: stok − açık sipariş rezervi − emniyet payı. */
export function materialAtp(m: CapacityMaterial): number {
  return Math.max(0, num(m.stockQty) - num(m.reservedQty) - num(m.safetyQty));
}

/**
 * Yarı mamul üretim grafiğini topolojik sıraya dizer (Kahn).
 * Kenar: girdi kalemi → çıktı kalemi. Sırada kalan düğümler döngüdedir.
 */
function topoOrder(
  formulaByOutput: Map<number, CapacityFormula>,
): { order: number[]; cycles: number[][] } {
  const nodes = Array.from(formulaByOutput.keys());
  const nodeSet = new Set(nodes);
  // Yalnız üretilebilir (formülü olan) girdiler bağımlılık sayılır; hammadde
  // ve ambalaj yaprak düğümdür, sıralamaya girmez.
  const deps = new Map<number, Set<number>>();
  const dependents = new Map<number, number[]>();
  for (const out of nodes) {
    const f = formulaByOutput.get(out)!;
    const d = new Set<number>();
    for (const inp of f.inputs) {
      if (nodeSet.has(inp.inputMaterialId) && inp.inputMaterialId !== out) {
        d.add(inp.inputMaterialId);
      }
    }
    deps.set(out, d);
    for (const from of Array.from(d)) {
      dependents.set(from, [...(dependents.get(from) ?? []), out]);
    }
  }

  const order: number[] = [];
  const queue = nodes.filter(n => (deps.get(n)?.size ?? 0) === 0);
  while (queue.length > 0) {
    const n = queue.shift()!;
    order.push(n);
    for (const dep of dependents.get(n) ?? []) {
      const set = deps.get(dep)!;
      set.delete(n);
      if (set.size === 0) queue.push(dep);
    }
  }

  // Sırada yer bulamayanlar döngüdedir (A → B → A gibi veri hatası).
  const placed = new Set(order);
  const cycles: number[][] = [];
  const stuck = nodes.filter(n => !placed.has(n));
  if (stuck.length > 0) cycles.push(stuck);
  return { order, cycles };
}

/**
 * Tüm master'ların üretilebilir adedini tek geçişte hesaplar.
 *
 * Her master'ı ayrı ayrı özyinelemeli çözmek alt ağaçları defalarca hesaplar;
 * bunun yerine yarı mamuller topolojik sırada bir kez çözülür, master'lar
 * hazır sonuçları okur. 5.000 kalemde milisaniyeler sürer.
 */
export function computeCapacity(input: {
  materials: CapacityMaterial[];
  formulas: CapacityFormula[];
  packagings: CapacityPackaging[];
  masters: CapacityMaster[];
}): CapacityReport {
  const materialById = new Map(input.materials.map(m => [m.id, m]));
  const formulaById = new Map(input.formulas.map(f => [f.id, f]));
  const packagingById = new Map(input.packagings.map(p => [p.id, p]));

  // Yarı mamul üreten reçeteler: çıktı kalemi → reçete.
  const formulaByOutput = new Map<number, CapacityFormula>();
  for (const f of input.formulas) {
    if (f.outputType === "yari_mamul" && f.outputMaterialId != null) {
      formulaByOutput.set(f.outputMaterialId, f);
    }
  }

  const { order, cycles } = topoOrder(formulaByOutput);
  const cycleNodes = new Set(cycles.flat());

  // 1) Yaprak kalemler: satın alınan her şey yalnızca stoğu kadar.
  const available = new Map<number, number>();
  for (const m of input.materials) {
    // Masraf kalemleri (SET, MASRAF vb.) fiziksel kısıt değildir.
    available.set(m.id, m.type === "masraf" ? Number.POSITIVE_INFINITY : materialAtp(m));
  }

  /** Bir reçeteden kaç birim çıktı üretilebileceğini bulur. */
  const producibleFrom = (f: CapacityFormula, scale: number): { qty: number; neck: Bottleneck | null } => {
    const waste = Math.min(Math.max(num(f.wastePercent), 0), 99);
    const yieldRatio = 1 - waste / 100;
    const base = num(f.baseQty);
    if (base <= 0 || yieldRatio <= 0) return { qty: 0, neck: null };

    let best = Number.POSITIVE_INFINITY;
    let neck: Bottleneck | null = null;
    let sawInput = false;

    for (const inp of f.inputs) {
      // Stok kalemin biriminde tutulur; satır başka birimde yazılmış olabilir.
      // Çevirmeden bölmek kapasiteyi 1000 kat yanlış gösterir.
      const lineQty = qtyInMaterialUnit(
        num(inp.qtyPerBase),
        inp.unit,
        materialById.get(inp.inputMaterialId)?.unit,
      ).qty;
      const needPerUnit = (lineQty * scale) / yieldRatio;
      if (needPerUnit <= 0) continue; // sıfır miktarlı satır kısıt değil
      sawInput = true;
      const have = available.get(inp.inputMaterialId);
      if (have === undefined) {
        // Reçetede olmayan kaleme atıf — üretilemez, sebebi açıkça bildirilir.
        return {
          qty: 0,
          neck: {
            materialId: inp.inputMaterialId,
            materialName: `#${inp.inputMaterialId} (kalem bulunamadı)`,
            available: 0,
            needPerUnit,
          },
        };
      }
      const canMake = have / needPerUnit;
      if (canMake < best) {
        best = canMake;
        neck = {
          materialId: inp.inputMaterialId,
          materialName: materialById.get(inp.inputMaterialId)?.name ?? `#${inp.inputMaterialId}`,
          available: have,
          needPerUnit,
        };
      }
    }

    if (!sawInput) return { qty: 0, neck: null }; // girdisiz reçete = veri hatası
    if (!Number.isFinite(best)) return { qty: Number.POSITIVE_INFINITY, neck: null };
    return { qty: Math.max(0, Math.floor(best)), neck };
  };

  // 2) Yarı mamuller topolojik sırada: kullanılabilir = stok + üretilebilir.
  for (const materialId of order) {
    const f = formulaByOutput.get(materialId)!;
    // Çıktının 1 birimi için ölçek = 1/baseQty (reçete baseQty birim üretir).
    const perOutputUnit = producibleFrom(f, 1 / Math.max(num(f.baseQty), 1e-9));
    const stock = available.get(materialId) ?? 0;
    available.set(materialId, stock + (Number.isFinite(perOutputUnit.qty) ? perOutputUnit.qty : 0));
  }

  // 3) Master'lar: boya kapasitesi ve ambalaj kapasitesinin küçüğü.
  const masters: MasterCapacity[] = [];
  const bottleneckCounts = new Map<number, number>();

  for (const master of input.masters) {
    const result = computeMaster(master);
    masters.push(result);
    if (result.bottleneck) {
      bottleneckCounts.set(
        result.bottleneck.materialId,
        (bottleneckCounts.get(result.bottleneck.materialId) ?? 0) + 1,
      );
    }
  }

  function computeMaster(master: CapacityMaster): MasterCapacity {
    if (master.formulaId == null) {
      return { masterId: master.id, buildable: 0, reason: "recete_yok", bottleneck: null };
    }
    const f = formulaById.get(master.formulaId);
    if (!f) {
      return { masterId: master.id, buildable: 0, reason: "recete_yok", bottleneck: null };
    }
    if (f.inputs.length === 0) {
      return { masterId: master.id, buildable: 0, reason: "recete_bos", bottleneck: null };
    }
    // Reçetesi döngüye giren bir yarı mamule dayanıyorsa sayı üretme.
    if (f.inputs.some(i => cycleNodes.has(i.inputMaterialId))) {
      return { masterId: master.id, buildable: 0, reason: "dongu", bottleneck: null };
    }

    const scale = num(master.formulaScale) || 1;
    const paint = producibleFrom(f, scale);
    if (paint.neck && paint.qty === 0 && paint.neck.available === 0 && !materialById.has(paint.neck.materialId)) {
      return { masterId: master.id, buildable: 0, reason: "girdi_bulunamadi", bottleneck: paint.neck };
    }

    let best = paint.qty;
    let neck = paint.neck;

    // Ambalaj: şişe/kapak/etiket hacimle ölçeklenmez, adet başına sabittir.
    const pack = master.packagingId != null ? packagingById.get(master.packagingId) : undefined;
    if (pack) {
      const packItems: { materialId: number; qtyPerUnit: Num; unit?: string | null }[] = [
        ...(pack.materialId != null ? [{ materialId: pack.materialId, qtyPerUnit: 1 }] : []),
        ...(pack.inputs ?? []),
      ];
      for (const item of packItems) {
        const per = qtyInMaterialUnit(
          num(item.qtyPerUnit),
          item.unit,
          materialById.get(item.materialId)?.unit,
        ).qty;
        if (per <= 0) continue;
        const have = available.get(item.materialId) ?? 0;
        const canMake = Math.max(0, Math.floor(have / per));
        if (canMake < best) {
          best = canMake;
          neck = {
            materialId: item.materialId,
            materialName: materialById.get(item.materialId)?.name ?? `#${item.materialId}`,
            available: have,
            needPerUnit: per,
          };
        }
      }
    }

    const buildable = Number.isFinite(best) ? Math.max(0, best) : 0;
    return { masterId: master.id, buildable, reason: "ok", bottleneck: neck };
  }

  return { masters, available, bottleneckCounts, cycles };
}

/**
 * İlana yazılacak miktar. Kapasite abartılı olsa bile tavan sayesinde
 * pazaryerine makul bir sayı gider; kritik bölgede gerçek sayı görünür.
 */
export function listingQty(buildable: number, cap: number): number {
  if (buildable <= 0) return 0;
  return Math.max(0, Math.min(buildable, Math.max(0, cap)));
}

export type BottleneckRow = {
  materialId: number;
  materialName: string;
  available: number;
  /** Kaç master'ın kapasitesini bu kalem belirliyor. */
  blockedMasters: number;
  /** Kapasitesi tamamen sıfırlanan master sayısı — en acil alım. */
  zeroedMasters: number;
};

/**
 * Darboğaz raporu: hangi kalemi almazsan kaç ürünün önü tıkalı kalıyor.
 * Alım kararını tahminden çıkarıp hesaba bağlayan çıktı budur.
 */
export function bottleneckReport(report: CapacityReport): BottleneckRow[] {
  const rows = new Map<number, BottleneckRow>();
  for (const m of report.masters) {
    if (!m.bottleneck) continue;
    const b = m.bottleneck;
    const row = rows.get(b.materialId) ?? {
      materialId: b.materialId,
      materialName: b.materialName,
      available: b.available,
      blockedMasters: 0,
      zeroedMasters: 0,
    };
    row.blockedMasters++;
    if (m.buildable <= 0) row.zeroedMasters++;
    rows.set(b.materialId, row);
  }
  return Array.from(rows.values()).sort(
    (a, b) => b.zeroedMasters - a.zeroedMasters || b.blockedMasters - a.blockedMasters,
  );
}
