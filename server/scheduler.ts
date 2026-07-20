import * as db from "./db";
import { overdueReceivables } from "./financeUtils";
import { daysUntilExpiry, filterExpiringLots } from "./lotUtils";
import { isHepsiburadaConfigured } from "./hepsiburada";
import { isTrendyolConfigured } from "./trendyol";
import { syncAllMarketplaces } from "./marketplace";
import { runQuestionSyncAndNotify } from "./marketplaceQuestions";
import { notifyOwner } from "./notify";
import {
  dailySalesComparison,
  findLossProducts,
  staleQuestions,
  upcomingCheques,
} from "./sentryUtils";

/**
 * Uygulama içi zamanlayıcı (Faz 1): sunucu ayaktayken dakikada bir uyanır ve
 * sırası gelen işleri çalıştırır. Son çalışma izleri settings tablosunda
 * tutulur ki yeniden başlatmalarda işler tekrarlanmasın / kaçmasın.
 *
 * İşler:
 *  - Pazaryeri oto-senkron (15 dk): yeni sipariş → bildirim + WhatsApp
 *  - Soru-Cevap oto-çekme (15 dk): pazaryeri müşteri soruları → kuyruk; oto-cevap
 *    açıksa AI güvenilir cevapları otomatik gönderir, gerisi taslakla bekler
 *  - Stok Nöbetçisi (60 dk): kritik hammadde + eksi/eşik altı mamul stoğu →
 *    bildirim, kritik hammaddeler eksik listesine otomatik eklenir
 *  - Sabah Brifingi (her gün 08:00 İstanbul): işletme özeti → bildirim + WhatsApp
 *  - Tahsilat Takipçisi (her gün 09:00 İstanbul): 30+ gündür ödenmemiş
 *    siparişleri müşteri bazında toplar → bildirim + WhatsApp
 *  - SKT Nöbetçisi (her gün 09:00 İstanbul): SKT'si geçmiş/yaklaşan (30 gün)
 *    hammadde ve mamul partileri → bildirim + WhatsApp
 *  - Çek/Senet Vade Nöbetçisi (her gün 10:00): vadesi geçmiş/yaklaşan (7 gün)
 *    portföy çek-senetleri → bildirim + WhatsApp
 *  - Marj Nöbetçisi (her gün 10:00): maliyetin altında satılan ürünler → uyarı
 *  - Soru SLA Nöbetçisi (her gün 10:00): 12+ saattir cevapsız pazaryeri soruları
 *
 * Not: Render ücretsiz planda süreç uykuya dalarsa zamanlayıcı da durur;
 * /api/health'e bağlı bir uptime monitörü süreci ayakta tutar.
 * SCHEDULER_DISABLED=1 ile tamamen kapatılabilir.
 */

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const QUESTION_INTERVAL_MS = 15 * 60 * 1000;
const STOCK_INTERVAL_MS = 60 * 60 * 1000;
const BRIEFING_HOUR_TR = 8; // İstanbul saatiyle
const COLLECTION_HOUR_TR = 9; // İstanbul saatiyle
const COLLECTION_MIN_DAYS = 30; // bu kadar gündür ödenmemişse hatırlat
const EXPIRY_HOUR_TR = 9; // İstanbul saatiyle — günde bir SKT taraması
const EXPIRY_SOON_DAYS = 30; // bu kadar gün içinde dolacak SKT "yaklaşan" sayılır
const SENTRY_HOUR_TR = 10; // çek/senet, marj, soru-SLA nöbetleri (İstanbul saati)
const CHEQUE_SOON_DAYS = 7; // bu kadar gün içinde vadesi dolan çek/senet "yaklaşan"
const QUESTION_SLA_HOURS = 12; // bu kadar saattir cevapsız pazaryeri sorusu = SLA ihlali

const KEY_LAST_SYNC = "scheduler.lastSyncAt";
const KEY_LAST_QUESTIONS = "scheduler.lastQuestionsSyncAt";
const KEY_LAST_STOCK = "scheduler.lastStockCheckAt";
const KEY_LAST_BRIEFING = "scheduler.lastBriefingDate";
const KEY_LAST_COLLECTION = "scheduler.lastCollectionDate";
const KEY_LAST_EXPIRY = "scheduler.lastExpiryDate";
const KEY_LAST_CHEQUE = "scheduler.lastChequeDate";
const KEY_LAST_MARGIN = "scheduler.lastMarginDate";
const KEY_LAST_QSLA = "scheduler.lastQSlaDate";

let ticking = false;

export function startScheduler() {
  if (process.env.SCHEDULER_DISABLED === "1") {
    console.log("[scheduler] SCHEDULER_DISABLED=1 — zamanlayıcı kapalı");
    return;
  }
  setInterval(() => {
    void tick();
  }, 60 * 1000);
  console.log("[scheduler] başladı (sipariş+soru senkron 15dk, stok nöbeti 60dk, brifing 08:00 TR, tahsilat+SKT 09:00 TR, çek/marj/soru-SLA 10:00 TR)");
}

async function tick() {
  if (ticking) return; // önceki tur sürüyor
  ticking = true;
  try {
    const cfg = await db.getSettings();
    const now = Date.now();

    if (
      (isTrendyolConfigured() || isHepsiburadaConfigured()) &&
      now - num(cfg[KEY_LAST_SYNC]) >= SYNC_INTERVAL_MS
    ) {
      await db.setSettings({ [KEY_LAST_SYNC]: String(now) });
      await runMarketplaceSync();
    }

    if (isTrendyolConfigured() && now - num(cfg[KEY_LAST_QUESTIONS]) >= QUESTION_INTERVAL_MS) {
      await db.setSettings({ [KEY_LAST_QUESTIONS]: String(now) });
      await runQuestionSyncAndNotify();
    }

    if (now - num(cfg[KEY_LAST_STOCK]) >= STOCK_INTERVAL_MS) {
      await db.setSettings({ [KEY_LAST_STOCK]: String(now) });
      await runStockSentry();
    }

    const todayTR = istanbulDateString(new Date());
    if (istanbulHour(new Date()) >= BRIEFING_HOUR_TR && cfg[KEY_LAST_BRIEFING] !== todayTR) {
      await db.setSettings({ [KEY_LAST_BRIEFING]: todayTR });
      await runMorningBriefing();
    }

    if (istanbulHour(new Date()) >= COLLECTION_HOUR_TR && cfg[KEY_LAST_COLLECTION] !== todayTR) {
      await db.setSettings({ [KEY_LAST_COLLECTION]: todayTR });
      await runCollectionChaser();
    }

    if (istanbulHour(new Date()) >= EXPIRY_HOUR_TR && cfg[KEY_LAST_EXPIRY] !== todayTR) {
      await db.setSettings({ [KEY_LAST_EXPIRY]: todayTR });
      await runExpirySentry();
    }

    // Günde bir (10:00 TR) proaktif nöbetler. Her biri KEY_LAST'ı ÇALIŞMADAN
    // ÖNCE yazar → bir nöbet hata verse bile o gün tekrar denenmez ve diğer
    // nöbetler bir sonraki turda çalışır (kilitlenme olmaz).
    if (istanbulHour(new Date()) >= SENTRY_HOUR_TR && cfg[KEY_LAST_CHEQUE] !== todayTR) {
      await db.setSettings({ [KEY_LAST_CHEQUE]: todayTR });
      await runChequeSentry();
    }

    if (istanbulHour(new Date()) >= SENTRY_HOUR_TR && cfg[KEY_LAST_MARGIN] !== todayTR) {
      await db.setSettings({ [KEY_LAST_MARGIN]: todayTR });
      await runMarginSentry();
    }

    if (istanbulHour(new Date()) >= SENTRY_HOUR_TR && cfg[KEY_LAST_QSLA] !== todayTR) {
      await db.setSettings({ [KEY_LAST_QSLA]: todayTR });
      await runQuestionSlaSentry();
    }
  } catch (error) {
    // DB yoksa (yerel araç çalıştırma) sessizce geç; diğer hataları logla.
    if (!(error instanceof Error && error.message.includes("Database not available"))) {
      console.error("[scheduler] tur hatası:", error);
    }
  } finally {
    ticking = false;
  }
}

const num = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;

function istanbulDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }); // YYYY-MM-DD
}

function istanbulHour(d: Date): number {
  // hourCycle "h23": hour12:false bazı ortamlarda gece yarısını "24" döndürür
  // (h24 çevrimi) — bu da 24 >= 8 sayılıp brifingi gece 00:00'da tetiklerdi.
  return parseInt(d.toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }), 10);
}

/** Pazaryeri oto-senkronu: içe alınan sipariş varsa haber verir, hata varsa uyarır. */
async function runMarketplaceSync() {
  const results = await syncAllMarketplaces();
  const imported = results.reduce((s, r) => s + r.imported, 0);
  if (imported > 0) {
    const parts = results
      .filter(r => r.imported > 0)
      .map(r => `${r.label}: ${r.imported} yeni`);
    await notifyOwner({
      kind: "siparis",
      title: `📦 ${imported} yeni pazaryeri siparişi`,
      body: `${parts.join(" · ")}\nSipariş panosuna düştü.`,
      link: "/siparisler",
    });
  }
  for (const r of results) {
    if (r.error) {
      await notifyOwner({
        kind: "senkron-hata",
        title: `⚠️ ${r.label} senkron hatası`,
        body: r.error,
        link: "/ayarlar",
      });
    }
  }
}

/**
 * Stok Nöbetçisi: kritik eşik altındaki hammaddeleri eksik listesine ekler ve
 * bildirir; eksi stoktaki mamulleri "üretilecek" diye bildirir.
 */
async function runStockSentry() {
  const [critical, products, openTasks] = await Promise.all([
    db.listCriticalMaterials(),
    db.listProducts(),
    db.listTasks("eksik", "open"),
  ]);

  if (critical.length > 0) {
    const openTitles = new Set(openTasks.map(t => t.title.trim().toLocaleLowerCase("tr-TR")));
    const added: string[] = [];
    for (const m of critical) {
      if (!openTitles.has(m.name.trim().toLocaleLowerCase("tr-TR"))) {
        await db.createTask({ kind: "eksik", title: m.name, note: `Stok Nöbetçisi: ${m.stockQty} ${m.unit} kaldı (eşik ${m.criticalQty})` });
        added.push(m.name);
      }
    }
    await notifyOwner({
      kind: "stok-kritik",
      title: `🧯 ${critical.length} hammadde kritik seviyede`,
      body:
        critical.map(m => `• ${m.name}: ${m.stockQty} ${m.unit} (eşik ${m.criticalQty})`).join("\n") +
        (added.length ? `\n\nEksik listesine eklendi: ${added.join(", ")}` : ""),
      link: "/stok",
    });
  }

  // Eksi stok = üretilecek sinyali; kritik eşik tanımlıysa eşiğin altı da uyarılır.
  const lowProducts = products.filter(
    p => (p.stockQty ?? 0) < 0 || ((p.criticalQty ?? 0) > 0 && (p.stockQty ?? 0) <= (p.criticalQty ?? 0)),
  );
  if (lowProducts.length > 0) {
    await notifyOwner({
      kind: "uretim-gerekli",
      title: `🏭 ${lowProducts.length} ürün düşük stokta — üretim gerekli`,
      body: lowProducts
        .slice(0, 15)
        .map(p =>
          (p.stockQty ?? 0) < 0
            ? `• ${p.name}: ${p.stockQty} adet (eksi stok)`
            : `• ${p.name}: ${p.stockQty} adet (eşik ${p.criticalQty})`,
        )
        .join("\n"),
      link: "/uretim",
    });
  }
}

/**
 * SKT Nöbetçisi (günde bir): SKT'si geçmiş ve yaklaşan (30 gün) hammadde
 * partileri + mamul partilerini toplar, tek bildirimde özetler. SKT'li parti
 * yoksa sessiz kalır. materialLots/productBatches izlenebilirlik katmanından
 * beslenir — stockQty otoritesine dokunmaz.
 */
async function runExpirySentry() {
  const [lots, batches] = await Promise.all([
    db.listMaterialLots({ onlyOpen: true, limit: 1000 }),
    db.listProductBatches({ limit: 1000 }),
  ]);
  const now = new Date();
  const lotB = filterExpiringLots(lots, EXPIRY_SOON_DAYS, now);
  // Mamul partide "kalan" ayrı tutulmaz; üretilen qty'yi eldeki gibi değerlendir.
  const batchB = filterExpiringLots(
    batches.map(b => ({ ...b, remainingQty: b.qty })),
    EXPIRY_SOON_DAYS,
    now,
  );
  const totalExpired = lotB.expired.length + batchB.expired.length;
  const totalSoon = lotB.soon.length + batchB.soon.length;
  if (totalExpired + totalSoon === 0) return; // SKT'li parti yok → sessiz

  const lines: string[] = [];
  const lotLine = (l: (typeof lotB.expired)[number], past: boolean) => {
    const d = daysUntilExpiry(l.expiryDate, now) ?? 0;
    const when = past ? `${Math.abs(d)} gün önce doldu` : `${d} gün kaldı`;
    return `• ${l.materialName ?? "?"} — ${l.lotNo} (${when}, kalan ${l.remainingQty} ${l.materialUnit ?? ""})`;
  };
  const batchLine = (b: (typeof batchB.expired)[number], past: boolean) => {
    const d = daysUntilExpiry(b.expiryDate, now) ?? 0;
    const when = past ? `${Math.abs(d)} gün önce doldu` : `${d} gün kaldı`;
    return `• ${b.productName ?? "?"} — ${b.batchNo} (${when}, ${b.qty} adet)`;
  };

  if (lotB.expired.length || batchB.expired.length) {
    lines.push("⛔ SKT geçmiş:");
    lotB.expired.slice(0, 8).forEach(l => lines.push(lotLine(l, true)));
    batchB.expired.slice(0, 8).forEach(b => lines.push(batchLine(b, true)));
  }
  if (lotB.soon.length || batchB.soon.length) {
    if (lines.length) lines.push("");
    lines.push(`⏳ ${EXPIRY_SOON_DAYS} gün içinde dolacak:`);
    lotB.soon.slice(0, 8).forEach(l => lines.push(lotLine(l, false)));
    batchB.soon.slice(0, 8).forEach(b => lines.push(batchLine(b, false)));
  }

  await notifyOwner({
    kind: "skt-uyari",
    title:
      totalExpired > 0
        ? `🧪 ${totalExpired} parti SKT geçmiş${totalSoon ? ` · ${totalSoon} yaklaşan` : ""}`
        : `🧪 ${totalSoon} parti SKT'si yaklaşıyor`,
    body: lines.join("\n"),
    link: "/izlenebilirlik",
  });
}

/**
 * Çek/Senet Vade Nöbetçisi (günde bir): portföydeki çek-senetlerden vadesi
 * geçmiş + yaklaşan (7 gün) olanları tek bildirimde toplar. Portföyde çek yoksa
 * ya da vadesi uzaksa sessiz kalır. Alınan çek = tahsil, verilen çek = ödeme.
 */
async function runChequeSentry() {
  const cheques = await db.listCheques();
  const { overdue, soon } = upcomingCheques(cheques, CHEQUE_SOON_DAYS, new Date());
  if (overdue.length + soon.length === 0) return;
  const tl = (n: unknown) => `${(parseFloat(String(n)) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
  const line = (c: (typeof overdue)[number], past: boolean) => {
    const kind = c.type === "cek" ? "Çek" : "Senet";
    const yon = c.direction === "alinan" ? "tahsil" : "ödeme";
    const when = past ? `${Math.abs(c.days)} gün önce doldu` : c.days === 0 ? "bugün" : `${c.days} gün kaldı`;
    return `• ${kind} (${yon}) — ${c.partyName ?? "?"}: ${tl(c.amount)} (${when})`;
  };
  const lines: string[] = [];
  if (overdue.length) {
    lines.push("⛔ Vadesi geçmiş:");
    overdue.slice(0, 8).forEach(c => lines.push(line(c, true)));
  }
  if (soon.length) {
    if (lines.length) lines.push("");
    lines.push(`⏳ ${CHEQUE_SOON_DAYS} gün içinde:`);
    soon.slice(0, 8).forEach(c => lines.push(line(c, false)));
  }
  await notifyOwner({
    kind: "cek-senet-vade",
    title:
      overdue.length > 0
        ? `📄 ${overdue.length} çek/senet vadesi geçti${soon.length ? ` · ${soon.length} yaklaşan` : ""}`
        : `📄 ${soon.length} çek/senet vadesi yaklaşıyor`,
    body: lines.join("\n"),
    link: "/cek-senet",
  });
}

/**
 * Zararına Satış / Marj Nöbetçisi (günde bir): satıştaki ürünlerden KDV-hariç
 * satışı net ürün maliyetinin (hammadde+ambalaj+kargo) altına düşenleri uyarır.
 * Kanal komisyonu hariç tutulur (tutucu "kesin zarar" sinyali; tam kâr /fiyat'ta).
 * Zarar eden ürün yoksa sessiz.
 */
async function runMarginSentry() {
  const [products, costs] = await Promise.all([db.listProducts(), db.listProductMaterialCosts()]);
  const costMap = new Map(costs.map(c => [c.productId, parseFloat(String(c.materialCost)) || 0]));
  const rows = products.map(p => ({
    id: p.id,
    name: p.name,
    salePrice: p.salePrice,
    vatRate: p.vatRate,
    status: p.status,
    materialCost: costMap.get(p.id) ?? 0,
    packagingCost: p.packagingCost,
    shippingCost: p.shippingCost,
  }));
  const loss = findLossProducts(rows, 0);
  if (loss.length === 0) return;
  const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
  const lines = loss
    .slice(0, 12)
    .map(l => `• ${l.name}: satış ${tl(l.saleEx)} < maliyet ${tl(l.costEx)} (marj %${l.margin.toFixed(0)})`);
  await notifyOwner({
    kind: "zarar-satis",
    title: `📉 ${loss.length} ürün maliyetin altında satışta`,
    body:
      "KDV hariç satış, net ürün maliyetinin (hammadde+ambalaj+kargo) altında kalıyor. " +
      "Kanal komisyonu bu hesaba dahil değil — /fiyat'ta tam kâr görülür.\n\n" +
      lines.join("\n"),
    link: "/fiyat",
  });
}

/**
 * Cevapsız Soru SLA Nöbetçisi (günde bir): 12+ saattir "new" durumda bekleyen
 * pazaryeri müşteri sorularını uyarır (pazaryeri puanı + müşteri memnuniyeti).
 * Bekleyen soru yoksa sessiz.
 */
async function runQuestionSlaSentry() {
  const questions = await db.listMarketplaceQuestions("new");
  const stale = staleQuestions(questions, QUESTION_SLA_HOURS, new Date());
  if (stale.length === 0) return;
  const lines = stale.slice(0, 10).map(q => {
    const who = q.customerName ? `${q.customerName} · ` : "";
    const prod = q.productName ? ` [${q.productName}]` : "";
    const text = q.questionText.length > 80 ? `${q.questionText.slice(0, 80)}…` : q.questionText;
    return `• ${who}${q.hours} saattir bekliyor${prod}: ${text}`;
  });
  await notifyOwner({
    kind: "soru-sla",
    title: `💬 ${stale.length} pazaryeri sorusu ${QUESTION_SLA_HOURS}+ saattir cevapsız`,
    body: lines.join("\n"),
    link: "/sorular",
  });
}

/**
 * Tahsilat Takipçisi: 30+ gündür ödenmemiş siparişleri müşteri bazında toplar,
 * hazır bir WhatsApp hatırlatma taslağıyla birlikte bildirir. Alacak yoksa
 * sessiz kalır (spam yok).
 */
async function runCollectionChaser() {
  const orders = await db.listOrders();
  const overdue = overdueReceivables(orders, COLLECTION_MIN_DAYS);
  if (overdue.length === 0) return;
  const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
  const total = overdue.reduce((s, c) => s + c.totalDue, 0);
  const lines = overdue.slice(0, 10).map(c => {
    const refs = c.orders.map(o => o.orderNo).slice(0, 3).join(", ");
    return `• ${c.customerName}: ${tl(c.totalDue)} (${c.oldestDays} gündür açık · ${refs})`;
  });
  const top = overdue[0];
  lines.push(
    "",
    "Hatırlatma taslağı (kopyala-gönder):",
    `"Merhaba ${top.customerName}, ${top.orders[0].orderNo} numaralı siparişinizin ${tl(top.totalDue)} tutarındaki bakiyesi görünüyor. Müsait olduğunuzda ödemenizi rica ederiz. İyi günler! 🎨"`,
  );
  await notifyOwner({
    kind: "tahsilat-takip",
    title: `💰 ${overdue.length} müşteride vadesi geçen alacak — ${tl(total)}`,
    body: lines.join("\n"),
    link: "/cari",
  });
}

/** Sabah Brifingi: işletmenin güncel durumunu tek mesajda özetler. */
async function runMorningBriefing() {
  const [finance, statusCounts, critical, unpaid, openTasks, orders, newQuestions, chequeRows] = await Promise.all([
    db.financeSummary(),
    db.orderStatusCounts(),
    db.listCriticalMaterials(),
    db.listUnpaidOrders(5),
    db.listTasks(undefined, "open"),
    // Zenginleştirme verileri: tekil sorgu hatası brifingi düşürmesin (savunmacı).
    db.listOrders().catch(() => [] as Awaited<ReturnType<typeof db.listOrders>>),
    db.countNewMarketplaceQuestions().catch(() => 0),
    db.listCheques().catch(() => [] as Awaited<ReturnType<typeof db.listCheques>>),
  ]);
  const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
  const statusLabels: Record<string, string> = { new: "Yeni", production: "Üretimde", ready: "Hazır", done: "Tamamlandı", cancelled: "İptal" };
  const active = statusCounts
    .filter(s => s.status !== "done" && s.status !== "cancelled")
    .map(s => `${statusLabels[s.status] ?? s.status}: ${s.count}`)
    .join(" · ");
  const sales = dailySalesComparison(orders, new Date());
  const lines = [
    `Günaydın! ☀️ ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" })}`,
    "",
    `💰 Bu ay: ciro ${tl(finance.monthRevenue)} · gider ${tl(finance.monthExpense)} · net ${tl(finance.monthNet)}`,
    `🏦 Kasa/banka: ${tl(finance.cashTotal)} · Tahsil edilecek: ${tl(finance.receivables)}`,
    `📈 Dün: ${tl(sales.yesterday.total)} (${sales.yesterday.count} sipariş) · Bugün: ${tl(sales.today.total)} (${sales.today.count})`,
    active ? `📋 Açık siparişler — ${active}` : "📋 Açık sipariş yok",
  ];
  if (unpaid.length > 0) {
    lines.push("", "⏳ En büyük alacaklar:");
    for (const o of unpaid.slice(0, 5)) lines.push(`• ${o.customerName}: ${tl(o.due)} (${o.orderNo})`);
  }
  // Vadesi geçmiş/yaklaşan çek-senet (ilk 3) — nakit akışı uyarısı.
  const chequeDue = upcomingCheques(chequeRows, CHEQUE_SOON_DAYS, new Date());
  const chequeAll = [...chequeDue.overdue, ...chequeDue.soon];
  if (chequeAll.length > 0) {
    const parts = chequeAll.slice(0, 3).map(c => {
      const when = c.days < 0 ? `${Math.abs(c.days)}g geçti` : c.days === 0 ? "bugün" : `${c.days}g`;
      return `${c.partyName ?? "?"} ${tl(parseFloat(String(c.amount)) || 0)} (${when})`;
    });
    lines.push("", `📄 Çek/senet: ${parts.join(" · ")}`);
  }
  if (critical.length > 0) {
    lines.push("", `🧯 Kritik stok: ${critical.map(m => m.name).slice(0, 8).join(", ")}`);
  }
  const eksik = openTasks.filter(t => t.kind === "eksik").length;
  const gorev = openTasks.filter(t => t.kind === "gorev").length;
  const bits: string[] = [];
  if (gorev + eksik > 0) bits.push(`${gorev} görev · ${eksik} eksik/alınacak`);
  if (newQuestions > 0) bits.push(`${newQuestions} cevapsız soru`);
  if (bits.length) lines.push("", `📝 Açık: ${bits.join(" · ")}`);

  await notifyOwner({
    kind: "brifing",
    title: `☀️ Sabah Brifingi — ${istanbulDateString(new Date())}`,
    body: lines.join("\n"),
    link: "/",
  });
}
