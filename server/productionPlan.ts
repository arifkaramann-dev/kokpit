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
  /** Siparişin geldiği kanal — "trendyol", "hepsiburada", "web"… */
  channel?: string | null;
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

/* ------------------- Eşleşmeyen satırların okunur hale gelmesi ------------- */

export type ColorHint = {
  /** Renk kodu — "RAL9016", "AOC-12" gibi. */
  code: string;
  name: string;
  hex: string | null;
};

export type UnmatchedGroup = {
  /** Gruplama anahtarı — kanal kodu varsa o, yoksa normalize başlık. */
  key: string;
  productName: string;
  /**
   * Pazaryeri stok kodu / barkod — hangi varyant olduğunu söyleyen tek alan.
   * BİZİM stok kodumuz DEĞİL: pazaryerinin kendi kodu, kanaldan kanala değişir.
   */
  channelRef: string | null;
  /**
   * Gruptaki her kanalın kendi kodu.
   *
   * Aynı ürünün Hepsiburada'daki kodu ile Trendyol'daki kodu farklıdır; tek
   * bir "stok kodu" göstermek yanlış, çünkü hiçbiri bizim kodumuz değil.
   */
  codes: { channel: string | null; ref: string }[];
  /** Gruptaki satırların toplam adedi. */
  quantity: number;
  /** Kaç ayrı sipariş satırı toplandı — "2 satır" diye göstermek için. */
  lineCount: number;
  lineIds: number[];
  orderIds: number[];
  colorName: string | null;
  colorHex: string | null;
  /** Renk nereden okundu — güven seviyesi görünür olmalı. */
  colorVia: "kod" | "baslik" | null;
};

/** Kod karşılaştırması: "RAL 9016" ile "ral9016" aynı sayılmalı. */
function squash(s: string): string {
  return normalizeTitle(s).replace(/\s+/g, "");
}

/**
 * Başlıktan/stok kodundan rengi okumaya çalışır.
 *
 * Eşleşmeyen satırda master yok, dolayısıyla renk ilişkisi de yok — ama renk
 * bilgisi çoğu zaman başlığın içinde ("... Ral 9016 Beyaz 400 Ml") ya da stok
 * kodunda duruyor. Kod eşleşmesi başlık eşleşmesinden güvenlidir: başlıkta
 * "beyaz" kelimesi ürün adının parçası da olabilir.
 *
 * Uzun renk adı önce denenir — "Beyaz İnci" varken "Beyaz"a düşmemeli.
 */
function guessColor(
  productName: string,
  channelRef: string | null,
  colors: ColorHint[],
): { name: string; hex: string | null; via: "kod" | "baslik" } | null {
  if (colors.length === 0) return null;

  const haystack = squash(productName) + " " + squash(channelRef ?? "");
  const byCodeLength = colors
    .filter(c => squash(c.code).length >= 3)
    .sort((a, b) => squash(b.code).length - squash(a.code).length);
  for (const c of byCodeLength) {
    if (haystack.includes(squash(c.code))) {
      return { name: c.name, hex: c.hex, via: "kod" };
    }
  }

  // Başlıkta ad araması kelime sınırıyla yapılır: "gri" kelimesi
  // "grinbaz" içinde geçtiği için ham `includes` yanlış renk verir.
  const title = ` ${normalizeTitle(productName)} `;
  const byNameLength = colors
    .filter(c => normalizeTitle(c.name).length >= 3)
    .sort((a, b) => normalizeTitle(b.name).length - normalizeTitle(a.name).length);
  for (const c of byNameLength) {
    if (title.includes(` ${normalizeTitle(c.name)} `)) {
      return { name: c.name, hex: c.hex, via: "baslik" };
    }
  }
  return null;
}

/**
 * Katalogla eşleşmeyen sipariş satırlarını tek satırda toplar.
 *
 * İki sorun vardı: (1) aynı üründen iki sipariş gelince liste aynı metni alt
 * alta iki kez basıyordu — okunmuyordu; (2) satırda yalnız başlık vardı, oysa
 * "Sprey Astar 400 Ml" hangi renk olduğunu söylemiyor. Stok kodu siparişle
 * birlikte zaten geliyor ve saklanıyor (`orderItems.channelRef`), sadece bu
 * listeye taşınmıyordu.
 *
 * Gruplama anahtarı önce KANAL KODU'dur: pazaryerinde başlık düzenlense bile
 * aynı stok kodu aynı varyanttır. Kod yoksa normalize başlığa düşülür. Farklı
 * kodlu satırlar başlıkları aynı olsa da BİRLEŞTİRİLMEZ — farklı kod çoğunlukla
 * farklı renk demektir ve yanlış toplama, ayrı yazmaktan kötüdür.
 */
export function groupUnmatchedLines(
  lines: OrderLine[],
  colors: ColorHint[] = [],
): UnmatchedGroup[] {
  const groups = new Map<string, UnmatchedGroup>();

  for (const line of lines) {
    const ref = line.channelRef?.trim() || null;
    const key = ref ? `ref:${ref.toLowerCase()}` : `ad:${normalizeTitle(line.productName)}`;

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.lineCount += 1;
      existing.lineIds.push(line.id);
      if (!existing.orderIds.includes(line.orderId)) existing.orderIds.push(line.orderId);
      continue;
    }

    const color = guessColor(line.productName, ref, colors);
    groups.set(key, {
      key,
      productName: line.productName,
      channelRef: ref,
      codes: ref ? [{ channel: line.channel ?? null, ref }] : [],
      quantity: line.quantity,
      lineCount: 1,
      lineIds: [line.id],
      orderIds: [line.orderId],
      colorName: color?.name ?? null,
      colorHex: color?.hex ?? null,
      colorVia: color?.via ?? null,
    });
  }

  /*
   * Kodsuz satırı kodlu gruba yedir.
   *
   * Aynı ürünün biri pazaryerinden (kodlu), biri elden girilmiş (kodsuz) iki
   * satırı yukarıdaki anahtarla ayrı düşer ve liste yine aynı metni iki kez
   * basar. Kodsuz satırın çelişecek bir kodu YOK, o yüzden başlığı birebir
   * tutan tek bir kodlu grup varsa ona katılır. Birden fazla kodlu grup aynı
   * başlığı taşıyorsa hangisine ait olduğu bilinemez — ayrı bırakılır.
   */
  const absorb = (target: UnmatchedGroup, g: UnmatchedGroup) => {
    target.quantity += g.quantity;
    target.lineCount += g.lineCount;
    target.lineIds.push(...g.lineIds);
    for (const id of g.orderIds) if (!target.orderIds.includes(id)) target.orderIds.push(id);
    for (const c of g.codes) {
      if (!target.codes.some(x => x.ref === c.ref && x.channel === c.channel)) target.codes.push(c);
    }
    // Renk yalnız hiç okunamamışsa devralınır — okunan renk ezilmemeli.
    if (!target.colorName && g.colorName) {
      target.colorName = g.colorName;
      target.colorHex = g.colorHex;
      target.colorVia = g.colorVia;
    }
  };

  const titleIndex = () => {
    const byTitle = new Map<string, UnmatchedGroup[]>();
    for (const g of Array.from(groups.values())) {
      if (!g.channelRef) continue;
      const t = normalizeTitle(g.productName);
      byTitle.set(t, [...(byTitle.get(t) ?? []), g]);
    }
    return byTitle;
  };

  let refGroupsByTitle = titleIndex();
  for (const [key, g] of Array.from(groups.entries())) {
    if (g.channelRef) continue;
    const candidates = refGroupsByTitle.get(normalizeTitle(g.productName)) ?? [];
    if (candidates.length !== 1) continue;
    absorb(candidates[0], g);
    groups.delete(key);
  }

  /*
   * Aynı ürünün kanaldan kanala değişen kodunu tek satırda topla.
   *
   * Pazaryeri kodu BİZİM stok kodumuz değil: aynı ürün Hepsiburada'da başka,
   * Trendyol'da başka kod taşır. Yalnız koda bakan gruplama bu yüzden tek
   * ürünü iki satıra bölerdi — asıl şikâyet buydu.
   *
   * Kural: aynı başlık için HER KANAL TEK BİR kod getirmişse bunlar aynı
   * ürünün kanal karşılıklarıdır, birleşir. Bir kanal aynı başlıkla iki farklı
   * kod getirmişse orada gerçek bir varyant ayrımı var (aynı isimle iki ayrı
   * ürün satılıyor) — hiçbiri birleştirilmez, çünkü hangisinin hangisiyle
   * eşleştiği bilinemez ve yanlış toplama ayrı yazmaktan kötüdür.
   */
  refGroupsByTitle = titleIndex();
  for (const candidates of Array.from(refGroupsByTitle.values())) {
    if (candidates.length < 2) continue;
    const channels = candidates.map(g => (g.codes[0]?.channel ?? "").toLowerCase());
    const distinct = new Set(channels);
    // Kanalı bilinmeyen ya da aynı kanaldan birden çok kod varsa dokunma.
    if (distinct.size !== candidates.length || distinct.has("")) continue;

    const [target, ...rest] = candidates;
    for (const g of rest) {
      absorb(target, g);
      groups.delete(g.key);
    }
  }

  // Çok adetli olan üstte: elle açılacak ilk ürün o.
  return Array.from(groups.values()).sort(
    (a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, "tr"),
  );
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

/* ------------------------- Tezgâh formülasyonu ---------------------------- */

export type FormulationLine = {
  materialId: number;
  name: string;
  type: CapacityMaterial["type"];
  /** Reçetede yazan miktar (baz için). */
  perBase: number;
  /** Bir adet ürün için — ambalaj hacmine ölçeklenmiş. */
  perUnit: number;
  /** Sipariş adedi için toplam. */
  total: number;
  unit: string | null;
};

export type MasterFormulation = {
  masterId: number;
  qty: number;
  formulaId: number | null;
  formulaName: string | null;
  /** Reçete bazının kaçta kaçı bir ürüne giriyor (250 ml / 1 lt = 0,25). */
  scale: number;
  wastePercent: number;
  lines: FormulationLine[];
  /** Şişe, kapak, etiket — hacimle ölçeklenmez, adet başına sabit. */
  packagingLines: FormulationLine[];
};

/**
 * Tezgâhta okunacak formülasyon: "bu üründen 12 adet için neyi kaç gram tart".
 *
 * `planProduction` toplam malzeme ihtiyacını verir — satın alma için doğru
 * ama boya yapan kişi için işe yaramaz: 8 farklı rengin pigmenti tek satırda
 * toplanmış olur. Üretim brifingi ÜRÜN BAZINDA reçete ister; bu fonksiyon onu
 * verir ve yarı mamulleri patlatMAZ (tezgâhta harç zaten hazır alınır,
 * hazır değilse `planProduction.steps` onu ayrıca söyler).
 */
export function buildFormulation(input: {
  demand: { masterId: number; qty: number }[];
  masters: PlanMaster[];
  formulas: CapacityFormula[];
  packagings: CapacityPackaging[];
  materials: CapacityMaterial[];
  formulaNames?: Map<number, string>;
}): MasterFormulation[] {
  const masterById = new Map(input.masters.map(m => [m.id, m]));
  const formulaById = new Map(input.formulas.map(f => [f.id, f]));
  const packById = new Map(input.packagings.map(p => [p.id, p]));
  const materialById = new Map(input.materials.map(m => [m.id, m]));

  return input.demand.map(d => {
    const master = masterById.get(d.masterId);
    const f = master?.formulaId != null ? formulaById.get(master.formulaId) : undefined;
    const scale = num(master?.formulaScale) || 1;
    const wastePercent = f ? Math.min(Math.max(num(f.wastePercent), 0), 99) : 0;
    const yieldRatio = 1 - wastePercent / 100;

    const round = (n: number) => Math.round(n * 10000) / 10000;
    const lines: FormulationLine[] = (f?.inputs ?? []).map(inp => {
      const mat = materialById.get(inp.inputMaterialId);
      const perBase = num(inp.qtyPerBase);
      const perUnit = yieldRatio > 0 ? (perBase * scale) / yieldRatio : perBase * scale;
      return {
        materialId: inp.inputMaterialId,
        name: mat?.name ?? `#${inp.inputMaterialId}`,
        type: mat?.type ?? "hammadde",
        perBase: round(perBase),
        perUnit: round(perUnit),
        total: round(perUnit * d.qty),
        // Satır birimi yoksa kalemin kendi birimi geçerlidir (eski kayıtlar).
        unit: inp.unit ?? mat?.unit ?? null,
      };
    });

    const pack = master?.packagingId != null ? packById.get(master.packagingId) : undefined;
    const packagingItems = [
      ...(pack?.materialId != null ? [{ materialId: pack.materialId, qtyPerUnit: 1, unit: null }] : []),
      ...(pack?.inputs ?? []),
    ];
    const packagingLines: FormulationLine[] = packagingItems.map(item => {
      const mat = materialById.get(item.materialId);
      const perUnit = num(item.qtyPerUnit);
      return {
        materialId: item.materialId,
        name: mat?.name ?? `#${item.materialId}`,
        type: mat?.type ?? "ambalaj",
        perBase: perUnit,
        perUnit: round(perUnit),
        total: round(perUnit * d.qty),
        unit: item.unit ?? mat?.unit ?? null,
      };
    });

    return {
      masterId: d.masterId,
      qty: d.qty,
      formulaId: master?.formulaId ?? null,
      formulaName: f ? (input.formulaNames?.get(f.id) ?? null) : null,
      scale,
      wastePercent,
      lines,
      packagingLines,
    };
  });
}
