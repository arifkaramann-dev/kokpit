import { runCapacityRecompute, runFormulaBinding } from "./catalogJobs";
import { syncAllChannels } from "./channelSyncWorker";
import * as db from "./db";
import { overdueCheques, overdueReceivables } from "./financeUtils";
import { isHepsiburadaConfigured } from "./hepsiburada";
import { isTrendyolConfigured } from "./trendyol";
import { syncAllMarketplaces } from "./marketplace";
import { runQuestionSyncAndNotify } from "./marketplaceQuestions";
import { notifyOwner } from "./notify";
import { planSocialPosts } from "./socialQueue";
import { POST_KIND_LABEL } from "@shared/socialPlan";
import { pollMarketplaceBatches } from "./jobs/pollMarketplaceBatches";

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
 *  - Çek/Senet Nöbetçisi (her gün 09:00 İstanbul): portföyde olup vadesi geçmiş
 *    çek/senetleri (alınan=tahsil, verilen=ödeme) toplar → bildirim
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
const CHEQUE_HOUR_TR = 9; // İstanbul saatiyle (çek/senet vade nöbeti)
/*
 * Sosyal kuyruk sabah dolar: kullanıcı kareyi gün içinde uygun bir anda
 * paylaşıyor, saatini kendi seçiyor. Brifingden bir saat sonra çalışıyor ki
 * iki bildirim aynı dakikaya düşmesin.
 */
const SOCIAL_HOUR_TR = 9;

const KEY_LAST_TICK = "scheduler.lastTickAt";
const TICK_TRACE_INTERVAL_MS = 5 * 60 * 1000; // iz her turda değil, 5 dk'da bir yazılır (DB yükü)
const KEY_LAST_SYNC = "scheduler.lastSyncAt";
const KEY_LAST_QUESTIONS = "scheduler.lastQuestionsSyncAt";
const KEY_LAST_STOCK = "scheduler.lastStockCheckAt";
const KEY_LAST_BRIEFING = "scheduler.lastBriefingDate";
const KEY_LAST_COLLECTION = "scheduler.lastCollectionDate";
const KEY_LAST_CHEQUE = "scheduler.lastChequeCheckDate";
const KEY_LAST_SOCIAL = "scheduler.lastSocialPlanDate";
const KEY_LAST_CATALOG = "scheduler.lastCatalogJobAt";
// Kapasite hammadde hareketine bağlı; 30 dk yeterince taze, sürekli hesap
// gereksiz DB yükü. Reçete bağlama aynı turda koşar (ikisi de idempotent).
const CATALOG_INTERVAL_MS = 30 * 60 * 1000;

let ticking = false;

export function startScheduler() {
  if (process.env.SCHEDULER_DISABLED === "1") {
    console.log("[scheduler] SCHEDULER_DISABLED=1 — zamanlayıcı kapalı");
    return;
  }
  setInterval(() => {
    void tick();
  }, 60 * 1000);
  console.log("[scheduler] başladı (sipariş+soru senkron 15dk, batch polling 1dk, stok nöbeti 60dk, katalog 30dk, brifing 08:00 TR, tahsilat takibi 09:00 TR)");
}

async function tick() {
  if (ticking) return; // önceki tur sürüyor
  ticking = true;
  try {
    const cfg = await db.getSettings();
    const now = Date.now();

    // Canlılık izi: Kokpit'te "zamanlayıcı çalışıyor mu?" rozeti bunu okur.
    // Render free uykuya dalınca iz eskir ve kullanıcı durumu görür.
    if (isIntervalDue(num(cfg[KEY_LAST_TICK]), now, TICK_TRACE_INTERVAL_MS)) {
      await db.setSettings({ [KEY_LAST_TICK]: String(now) });
    }

    if (
      (isTrendyolConfigured() || isHepsiburadaConfigured()) &&
      isIntervalDue(num(cfg[KEY_LAST_SYNC]), now, SYNC_INTERVAL_MS)
    ) {
      await db.setSettings({ [KEY_LAST_SYNC]: String(now) });
      await runMarketplaceSync();
    }

    if (isTrendyolConfigured() && isIntervalDue(num(cfg[KEY_LAST_QUESTIONS]), now, QUESTION_INTERVAL_MS)) {
      await db.setSettings({ [KEY_LAST_QUESTIONS]: String(now) });
      await runQuestionSyncAndNotify();
    }

    if (isIntervalDue(num(cfg[KEY_LAST_STOCK]), now, STOCK_INTERVAL_MS)) {
      await db.setSettings({ [KEY_LAST_STOCK]: String(now) });
      await runStockSentry();
    }

    const todayTR = istanbulDateString(new Date());
    if (isDailyDue(cfg[KEY_LAST_BRIEFING], todayTR, istanbulHour(new Date()), BRIEFING_HOUR_TR)) {
      await db.setSettings({ [KEY_LAST_BRIEFING]: todayTR });
      await runMorningBriefing();
    }

    if (isDailyDue(cfg[KEY_LAST_COLLECTION], todayTR, istanbulHour(new Date()), COLLECTION_HOUR_TR)) {
      await db.setSettings({ [KEY_LAST_COLLECTION]: todayTR });
      await runCollectionChaser();
    }

    if (isDailyDue(cfg[KEY_LAST_CHEQUE], todayTR, istanbulHour(new Date()), CHEQUE_HOUR_TR)) {
      await db.setSettings({ [KEY_LAST_CHEQUE]: todayTR });
      await runChequeWatch();
    }

    if (isDailyDue(cfg[KEY_LAST_SOCIAL], todayTR, istanbulHour(new Date()), SOCIAL_HOUR_TR)) {
      await db.setSettings({ [KEY_LAST_SOCIAL]: todayTR });
      await runSocialPlanner();
    }

    // Katalog otomasyonu: reçete bağlama önce (yeni bağlanan master'ın
    // kapasitesi aynı turda hesaplansın), sonra kapasite.
    if (isIntervalDue(num(cfg[KEY_LAST_CATALOG]), now, CATALOG_INTERVAL_MS)) {
      await db.setSettings({ [KEY_LAST_CATALOG]: String(now) });
      await runCatalogJobs();
    }

    // Pazaryeri batch status polling: her turda pending batch'leri kontrol et
    try {
      await pollMarketplaceBatches();
    } catch (error) {
      console.error("[scheduler] batch polling hatası:", error);
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

/**
 * Katalog işleri. Hata tek işte kalsın diye ayrı ayrı sarılır: reçete
 * bağlama patlarsa kapasite yine de hesaplanır.
 */
async function runCatalogJobs() {
  // Sipariş↔ürün bağı ilk sırada: bağsız satır üretim planına ve getiri
  // raporuna girmiyor. İlan sonradan yayınlandığında eski siparişler de
  // bağlanabilir hale gelir, o yüzden her turda tekrar denenir.
  try {
    const bound = await db.backfillOrderBinding();
    if (bound.bound > 0) console.log(`[scheduler] ${bound.bound} sipariş satırı ürüne bağlandı`);
  } catch (error) {
    console.error("[scheduler] sipariş bağlama hatası:", error);
  }
  try {
    const bind = await runFormulaBinding();
    if (bind.bound > 0) console.log(`[scheduler] ${bind.bound} master reçeteye bağlandı`);
  } catch (error) {
    console.error("[scheduler] reçete bağlama hatası:", error);
  }
  try {
    const cap = await runCapacityRecompute();
    if (cap.written > 0 || cap.dirtied > 0) {
      console.log(
        `[scheduler] kapasite: ${cap.written} güncellendi, ${cap.dirtied} yayın senkron kuyruğunda` +
          (cap.cycles > 0 ? `, ${cap.cycles} reçete döngüsü` : ""),
      );
    }
  } catch (error) {
    console.error("[scheduler] kapasite hesabı hatası:", error);
  }
  // Kirli kuyruğu boşalt. Kapasiteden SONRA koşar ki aynı turda kirlenen
  // yayınlar hemen gitsin, bir tur beklemesin.
  try {
    const results = await syncAllChannels();
    for (const r of results) {
      if (r.sent > 0 || r.failed > 0) {
        console.log(
          `[scheduler] ${r.channel}: ${r.sent} gönderildi` +
            (r.failed > 0 ? `, ${r.failed} hata (sonraki turda yeniden denenecek)` : ""),
        );
      }
    }
  } catch (error) {
    console.error("[scheduler] kanal senkron hatası:", error);
  }
}

const num = (v: string | undefined) => parseInt(v ?? "0", 10) || 0;

export function istanbulDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }); // YYYY-MM-DD
}

export function istanbulHour(d: Date): number {
  // hourCycle "h23": hour12:false bazı ortamlarda gece yarısını "24" döndürür
  // (h24 çevrimi) — bu da 24 >= 8 sayılıp brifingi gece 00:00'da tetiklerdi.
  return parseInt(d.toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }), 10);
}

/** Aralıklı iş vadesi: son çalışmadan bu yana aralık dolmuş mu? (saf, testli) */
export function isIntervalDue(lastRunMs: number, nowMs: number, intervalMs: number): boolean {
  return nowMs - lastRunMs >= intervalMs;
}

/** Günlük iş vadesi: bugün henüz koşmadıysa ve saat geldiyse. (saf, testli) */
export function isDailyDue(lastRunDate: string | undefined, todayStr: string, hourNow: number, dueHour: number): boolean {
  return hourNow >= dueHour && lastRunDate !== todayStr;
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
    db.listMasterProducts(),
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
            ? `• ${p.name ?? p.internalSku}: ${p.stockQty} adet (eksi stok)`
            : `• ${p.name ?? p.internalSku}: ${p.stockQty} adet (eşik ${p.criticalQty})`,
        )
        .join("\n"),
      link: "/uretim",
    });
  }
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

/**
 * Çek/Senet Nöbetçisi: portföyde olup vadesi geçmiş çek/senetleri (alınan =
 * tahsil edilecek, verilen = ödenecek) tek bildirimde toplar. Vadesi geçen yoksa
 * sessiz kalır (spam yok).
 */
async function runChequeWatch() {
  const cheques = await db.listCheques();
  const { incoming, outgoing, totalIncoming, totalOutgoing } = overdueCheques(cheques);
  const count = incoming.length + outgoing.length;
  if (count === 0) return;
  const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
  const lines: string[] = [];
  if (incoming.length > 0) {
    lines.push(`📥 Tahsil edilecek (alınan) — ${tl(totalIncoming)}:`);
    for (const c of incoming.slice(0, 8)) lines.push(`• ${c.partyName}: ${tl(c.amount)} (${c.daysOverdue} gün geçti)`);
  }
  if (outgoing.length > 0) {
    if (lines.length) lines.push("");
    lines.push(`📤 Ödenecek (verilen) — ${tl(totalOutgoing)}:`);
    for (const c of outgoing.slice(0, 8)) lines.push(`• ${c.partyName}: ${tl(c.amount)} (${c.daysOverdue} gün geçti)`);
  }
  await notifyOwner({
    kind: "cek-senet-vade",
    title: `📄 ${count} çek/senet vadesi geçti`,
    body: lines.join("\n"),
    link: "/cek-senet",
  });
}

/**
 * Sosyal kuyruk nöbetçisi: önümüzdeki üç haftanın gönderilerini planlar.
 *
 * ── Neden her gün, neden üç hafta ─────────────────────────────────────────
 * Yalnız o günü planlamak, sunucu uykudayken geçen bir günü telafi edemiyor
 * (Render ücretsiz planda süreç uyuyabiliyor). İleriye planlamak kuyruğu
 * görünür de yapıyor: kullanıcı iki hafta sonra ne paylaşacağını bugünden
 * görüyor. İş idempotent — aynı gün ikinci kez planlanmaz.
 *
 * Bildirim YALNIZ yeni gönderi açıldığında: her sabah "0 gönderi planlandı"
 * demek, bildirimi gürültüye çevirir ve okunmaz hale getirir.
 */
async function runSocialPlanner() {
  const result = await planSocialPosts(21);
  if (result.created === 0) return;
  const list = result.planned
    .slice(0, 5)
    .map(p => `${p.plannedFor} · ${POST_KIND_LABEL[p.kind]}${p.colorLabel ? ` — ${p.colorLabel}` : ""}`)
    .join("\n");
  await notifyOwner({
    kind: "sosyal-kuyruk",
    title: `📸 ${result.created} Instagram gönderisi hazırlandı`,
    body: [
      list,
      result.planned.length > 5 ? `… ve ${result.planned.length - 5} tane daha` : "",
      "",
      "Renk Stüdyosu → Instagram sekmesinden onaylayıp indirebilirsin.",
    ]
      .filter(Boolean)
      .join("\n"),
    link: "/renk-studyo",
  });
}

/** Sabah Brifingi: işletmenin güncel durumunu tek mesajda özetler. */
async function runMorningBriefing() {
  const [finance, statusCounts, critical, unpaid, openTasks, cheques] = await Promise.all([
    db.financeSummary(),
    db.orderStatusCounts(),
    db.listCriticalMaterials(),
    db.listUnpaidOrders(5),
    db.listTasks(undefined, "open"),
    db.listCheques(),
  ]);
  const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
  const statusLabels: Record<string, string> = { new: "Yeni", production: "Üretimde", ready: "Hazır", done: "Tamamlandı", cancelled: "İptal" };
  const active = statusCounts
    .filter(s => s.status !== "done" && s.status !== "cancelled")
    .map(s => `${statusLabels[s.status] ?? s.status}: ${s.count}`)
    .join(" · ");
  const lines = [
    `Günaydın! ☀️ ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" })}`,
    "",
    `💰 Bu ay: ciro ${tl(finance.monthRevenue)} · gider ${tl(finance.monthExpense)} · net ${tl(finance.monthNet)}`,
    `🏦 Kasa/banka: ${tl(finance.cashTotal)} · Tahsil edilecek: ${tl(finance.receivables)}`,
    active ? `📋 Açık siparişler — ${active}` : "📋 Açık sipariş yok",
  ];
  if (unpaid.length > 0) {
    lines.push("", "⏳ En büyük alacaklar:");
    for (const o of unpaid.slice(0, 5)) lines.push(`• ${o.customerName}: ${tl(o.due)} (${o.orderNo})`);
  }
  if (critical.length > 0) {
    lines.push("", `🧯 Kritik stok: ${critical.map(m => m.name).slice(0, 8).join(", ")}`);
  }
  const oc = overdueCheques(cheques);
  if (oc.incoming.length + oc.outgoing.length > 0) {
    lines.push("", `📄 Vadesi geçen çek/senet: ${oc.incoming.length + oc.outgoing.length} (${tl(oc.totalIncoming + oc.totalOutgoing)})`);
  }
  const eksik = openTasks.filter(t => t.kind === "eksik").length;
  const gorev = openTasks.filter(t => t.kind === "gorev").length;
  if (eksik + gorev > 0) lines.push("", `📝 Açık: ${gorev} görev · ${eksik} eksik/alınacak`);

  await notifyOwner({
    kind: "brifing",
    title: `☀️ Sabah Brifingi — ${istanbulDateString(new Date())}`,
    body: lines.join("\n"),
    link: "/",
  });
}
