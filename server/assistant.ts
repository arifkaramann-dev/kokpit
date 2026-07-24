import { answerBusinessQuestion, parseVoiceCommand } from "./_core/claude";
import * as db from "./db";
import { canonicalPartyName } from "./financeUtils";
import { findOpenOrderForCollection, itemsTotal, summarizeItems, toItemRows } from "./orderUtils";

/**
 * Sesli komut / WhatsApp asistanının ortak beyni: serbest Türkçe metni
 * (uygulamadaki mikrofon veya WhatsApp mesajı) çözer ve uygular.
 * Elden satış, sipariş, stok girişi/çıkışı, not alma ve işletme verisi
 * hakkında soru-cevap destekler.
 */

function generateDocNo(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

export function generateOrderNo() {
  return generateDocNo("AOC");
}

export function generateQuoteNo() {
  return generateDocNo("TKF");
}

function formatCmdItems(items: { productName: string; quantity: number }[]) {
  return items.map(i => `${i.quantity}× ${i.productName}`).join(", ") || "kalemsiz";
}

const STATUS_LABELS: Record<string, string> = {
  new: "Yeni",
  production: "Üretimde",
  ready: "Kargoya Hazır",
  done: "Tamamlandı",
  cancelled: "İptal/İade",
};

const HELP_TEXT = [
  "Yapabildiklerim 👇",
  "",
  "🛒 *Satış / Sipariş*",
  '• "Elden satış ekle, 2 adet sprey vernik, tanesi 250 lira"',
  '• "Sipariş geldi: Ahmet, 3 kutu jant astarı, tanesi 400"',
  '• "Son siparişi kargoya hazır yap" / "AOC-... tamamlandı"',
  "",
  "📦 *Stok*",
  '• "10 kg beyaz pigment geldi, stok girişi"',
  '• "2 litre tiner kullandım, stoktan düş"',
  "",
  "💸 *Gider & Tahsilat*",
  '• "Gider ekle: kargoya 250 lira" · "Kira ödedim, 5000 TL"',
  '• "Ahmet 500 lira ödedi" / "Ayşe\'den tahsilat aldım, 300"',
  "",
  "📝 *Eksikler & Görevler*",
  '• "Eksik listesine ekle: etiket, 400 ml kutu"',
  '• "Bugün neler alınacaktı?" · "Etiket aldım"',
  '• "Görev ekle: kargocuyu ara" · "Görevlerim neler?"',
  "",
  "📊 *Soru-Cevap*",
  '• "Bugün kaç sipariş var? Ciro ne kadar?"',
  '• "Ne kadar tahsilat bekliyor? Kim borçlu?"',
  '• "Bu ay ne kadar kâr ettim?" · "Bu ayki giderler ne?"',
  '• "Stok durumu nasıl?" · "Projeler ne durumda?"',
  "",
  '🗒️ "Not al: ..." ile hızlı not bırakabilirsin.',
].join("\n");

/** Soru-cevap için işletmenin güncel verilerinden kompakt Türkçe özet üretir. */
export async function buildBusinessSnapshot(): Promise<string> {
  const [statusCounts, today, critical, materials, products, orders, openTasks, finance, expenses] = await Promise.all([
    db.orderStatusCounts(),
    db.countOrdersToday(),
    db.listCriticalMaterials(),
    db.listMaterials(),
    db.listProducts(),
    db.listOrders(),
    db.listTasks(undefined, "open"),
    db.financeSummary(),
    db.listExpenses(50),
  ]);
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const active = orders.filter(o => o.status !== "cancelled"); // iptal/iade ciro-alacak dışı
  const last30 = active.filter(o => new Date(o.createdAt as unknown as string).getTime() >= since30);
  const revenue30 = last30.reduce((s, o) => s + (parseFloat(String(o.totalAmount)) || 0), 0);

  // Alacaklar (ödenmemiş siparişler) — "kim borçlu / ne kadar tahsilat" için.
  const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
  const debtors = active
    .filter(o => o.paymentStatus !== "paid")
    .map(o => ({ name: o.customerName, due: Math.max(0, num(o.totalAmount) - num(o.paidAmount)), orderNo: o.orderNo }))
    .filter(d => d.due > 0)
    .sort((a, b) => b.due - a.due);
  // Bu ayki giderleri kategoriye göre topla.
  const startMonth = new Date();
  startMonth.setDate(1);
  startMonth.setHours(0, 0, 0, 0);
  const monthExpenses = expenses.filter(e => new Date(e.expenseDate as never).getTime() >= startMonth.getTime());
  const byCategory = new Map<string, number>();
  for (const e of monthExpenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + num(e.amount));
  const recent = orders.slice(0, 15).map(o => {
    const date = o.createdAt instanceof Date ? o.createdAt.toISOString().slice(0, 10) : String(o.createdAt).slice(0, 10);
    return `- ${date} ${o.orderNo} | ${o.customerName} | ${o.channel} | ${o.status} | ${o.totalAmount} TL | ${o.itemsSummary ?? ""}`;
  });
  const lines = [
    `Bugünkü sipariş: ${today?.count ?? 0} adet, ${today?.total ?? 0} TL`,
    `Sipariş durumları: ${statusCounts.map(s => `${s.status}: ${s.count}`).join(", ") || "yok"}`,
    `Son 30 gün ciro: ${revenue30.toFixed(2)} TL (${last30.length} sipariş)`,
    `Bu ay: ciro ${finance.monthRevenue.toFixed(2)} TL, gider ${finance.monthExpense.toFixed(2)} TL, net kâr ${finance.monthNet.toFixed(2)} TL`,
    `Toplam tahsil edilecek (alacak): ${finance.receivables.toFixed(2)} TL`,
    `Kasa/banka toplam bakiye: ${finance.cashTotal.toFixed(2)} TL`,
    `Borçlu müşteriler (ad | kalan): ${debtors.slice(0, 15).map(d => `${d.name} | ${d.due.toFixed(2)} TL`).join("; ") || "yok"}`,
    `Bu ay giderler (kategori | tutar): ${Array.from(byCategory.entries()).map(([k, v]) => `${k} | ${v.toFixed(2)} TL`).join("; ") || "yok"}`,
    `Ürünler (ad | satış fiyatı): ${products
      .slice(0, 40)
      .map(p => `${p.name} | ${p.salePrice} TL`)
      .join("; ") || "yok"}`,
    `Hammadde sayısı: ${materials.length}`,
    `Kritik stok altındaki hammaddeler: ${critical.map(m => `${m.name} (${m.stockQty} ${m.unit})`).join(", ") || "yok"}`,
    `Stok listesi (ad | miktar | birim maliyet): ${materials
      .slice(0, 40)
      .map(m => `${m.name} | ${m.stockQty} ${m.unit} | ${m.unitCost} TL`)
      .join("; ")}`,
    `Eksik listesi (alınacaklar): ${openTasks.filter(t => t.kind === "eksik").map(t => t.title).join(", ") || "boş"}`,
    `Açık görevler: ${openTasks.filter(t => t.kind === "gorev").map(t => t.title).join(", ") || "yok"}`,
    `Son siparişler:`,
    ...recent,
  ];
  return lines.join("\n");
}

/* --------------------- Eylem fonksiyonları (intent + ajan ortak) --------------------- */
/* Hem parseVoiceCommand intent akışı hem tool-use ajanı (assistantAgent.ts) aynı
 * fonksiyonları çağırır — davranış tek yerde yaşar, iki beyin ayrışamaz. */

export async function actionCreateOrder(input: {
  kind: "sale" | "order";
  customerName?: string | null;
  channel?: string | null;
  items: { productName: string; quantity: number; unitPrice: number }[];
  noteText?: string | null;
}): Promise<{ message: string }> {
  const total = itemsTotal(input.items);
  const id = await db.createOrder({
    orderNo: generateOrderNo(),
    customerName: input.customerName || (input.kind === "sale" ? "Elden Satış" : "Müşteri"),
    channel: input.kind === "sale" ? "elden" : (input.channel ?? "whatsapp"),
    status: input.kind === "sale" ? "done" : "new",
    totalAmount: String(total),
    itemsSummary: input.items.length ? summarizeItems(input.items) : (input.noteText ?? null),
    notes: input.noteText ?? null,
  } as never);
  if (input.items.length) await db.replaceOrderItems(Number(id), toItemRows(input.items));
  return {
    message: `${input.kind === "sale" ? "Elden satış" : "Sipariş"} eklendi: ${formatCmdItems(input.items)} — ${total} TL`,
  };
}

export async function actionStockMove(input: {
  materialName: string;
  direction: "in" | "out";
  quantity: number;
  unit?: string | null;
}): Promise<{ message: string }> {
  const mats = await db.listMaterials();
  const needle = input.materialName.trim().toLowerCase();
  const found =
    mats.find(m => m.name.trim().toLowerCase() === needle) ??
    mats.find(m => m.name.toLowerCase().includes(needle));
  if (!found) {
    if (input.direction === "in") {
      await db.createMaterial({
        name: input.materialName.trim(),
        category: "diğer",
        unit: input.unit ?? "adet",
        stockQty: String(input.quantity),
        criticalQty: "0",
        unitCost: "0",
      } as never);
      return { message: `Yeni hammadde açıldı: ${input.materialName} (${input.quantity} ${input.unit ?? "adet"})` };
    }
    throw new Error(`"${input.materialName}" adında hammadde bulamadım.`);
  }
  await db.adjustStock(found.id, input.direction, input.quantity, "Asistan komutu");
  const oldQty = parseFloat(String(found.stockQty)) || 0;
  const newQty = input.direction === "in" ? oldQty + input.quantity : Math.max(0, oldQty - input.quantity);
  const critical = parseFloat(String(found.criticalQty)) || 0;
  let message = `${found.name}: ${input.quantity} ${found.unit} ${input.direction === "in" ? "girişi" : "çıkışı"} yapıldı. Kalan: ${newQty} ${found.unit}`;
  if (critical > 0 && newQty <= critical) {
    message += `\n⚠️ Dikkat: kritik seviyenin altında (eşik ${critical} ${found.unit}). Eksik listesine ekleyeyim mi dersen "eksik listesine ekle: ${found.name}" yaz.`;
  }
  return { message };
}

export async function actionAddTasks(input: {
  kind: "gorev" | "eksik";
  titles: string[];
}): Promise<{ message: string }> {
  const titles = input.titles.map(t => t.trim()).filter(Boolean);
  if (titles.length === 0) throw new Error("Ne ekleyeceğimi anlayamadım, tekrar söyler misin?");
  for (const title of titles) await db.createTask({ kind: input.kind, title });
  const label = input.kind === "eksik" ? "eksik listesine" : "görevlere";
  return { message: `${titles.map(t => `"${t}"`).join(", ")} ${label} eklendi ✅ (${titles.length} madde)` };
}

export async function actionCompleteTasks(input: { names: string[] }): Promise<{ message: string }> {
  const names = input.names.map(t => t.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("Hangi maddeyi kapatacağımı anlayamadım.");
  const open = await db.listTasks(undefined, "open");
  const closed: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const needle = name.toLowerCase();
    const hit =
      open.find(t => t.title.trim().toLowerCase() === needle) ??
      open.find(t => t.title.toLowerCase().includes(needle)) ??
      open.find(t => needle.includes(t.title.trim().toLowerCase()));
    if (hit) {
      await db.setTaskStatus(hit.id, "done");
      closed.push(hit.title);
    } else {
      missing.push(name);
    }
  }
  const parts = [];
  if (closed.length) parts.push(`Tamamlandı: ${closed.join(", ")} ✅`);
  if (missing.length) parts.push(`Listede bulamadım: ${missing.join(", ")}`);
  return { message: parts.join("\n") || "Listede eşleşen madde bulamadım." };
}

export async function actionSetOrderStatus(input: {
  orderRef?: string | null;
  status: "new" | "production" | "ready" | "done" | "cancelled";
}): Promise<{ message: string }> {
  const orders = await db.listOrders();
  if (orders.length === 0) throw new Error("Kayıtlı sipariş yok.");
  const ref = (input.orderRef ?? "son").trim().toLowerCase();
  let target;
  if (ref === "son" || ref === "") {
    // "Son sipariş" = en yeni kayıt.
    target = [...orders].sort((a, b) => new Date(b.createdAt as never).getTime() - new Date(a.createdAt as never).getTime())[0];
  } else {
    target =
      orders.find(o => o.orderNo.toLowerCase() === ref) ??
      orders.find(o => o.orderNo.toLowerCase().includes(ref)) ??
      orders.find(o => o.customerName.toLowerCase().includes(ref));
  }
  if (!target) throw new Error(`"${input.orderRef}" ile eşleşen sipariş bulamadım. Sipariş no veya müşteri adı söyleyebilirsin.`);
  await db.updateOrder(target.id, { status: input.status });
  return {
    message: `${target.orderNo} (${target.customerName}) → ${STATUS_LABELS[input.status]} olarak güncellendi ✅`,
  };
}

export async function actionAddExpense(input: {
  category?: string | null;
  amount: number;
  description: string;
}): Promise<{ message: string }> {
  if (input.amount <= 0) {
    throw new Error('Gider tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "kargoya 250 lira gider ekle")');
  }
  const category = input.category ?? "diğer";
  await db.createExpense({
    category,
    description: input.description.slice(0, 255),
    amount: String(input.amount),
  } as never);
  return { message: `Gider eklendi: ${category} — ${input.amount.toFixed(2)} TL ✅ (Giderler sayfasında)` };
}

/**
 * Tedarikçiden gelen ALIŞ faturasını tedarikçinin cari hesabına (borç) işler.
 * Gider'den farkı: bu, belirli bir tedarikçiye olan borcumuzu artırır ve
 * Tedarikçi > Cari Ekstre'de "Alış Faturası" olarak görünür. Kullanıcı sadece
 * tutarı söylediğinde kalemsiz (toplu) fatura kaydı yapılır — stok değişmez.
 */
export async function actionAddPurchaseInvoice(input: {
  supplierName: string;
  amount: number;
  note?: string | null;
}): Promise<{ message: string }> {
  if (input.amount <= 0) {
    throw new Error(
      'Fatura tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "Erdem Boya\'ya 2415 liralık alış faturası gir")',
    );
  }
  if (!input.supplierName.trim()) {
    throw new Error("Hangi tedarikçinin faturası olduğunu anlayamadım, tedarikçi adını da söyler misin?");
  }
  const suppliersList = await db.listSuppliers();
  // Cari ekstre ada/ID'ye göre bağlandığı için kayıtlı adı esas al.
  const canonical = canonicalPartyName(suppliersList, input.supplierName);
  await db.createPurchaseInvoice({
    supplierName: canonical,
    amount: input.amount,
    invoiceNo: null,
    invoiceDate: null,
    note: input.note?.slice(0, 255) ?? null,
  });
  return {
    message: `Alış faturası eklendi: ${canonical} — ${input.amount.toFixed(2)} TL ✅ (Tedarikçi cari ekstresine işlendi)`,
  };
}

export async function actionAddCollection(input: {
  customerName: string;
  amount: number;
  orderRef?: string | null;
  note?: string | null;
}): Promise<{ message: string }> {
  if (input.amount <= 0) {
    throw new Error('Tahsilat tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "Ahmet 500 lira ödedi")');
  }
  if (!input.customerName.trim()) {
    throw new Error("Kimden tahsilat aldığını anlayamadım, müşteri adını da söyler misin?");
  }
  const [customersList, orders, accountList] = await Promise.all([
    db.listCustomers(),
    db.listOrders(),
    db.listAccounts(),
  ]);
  // Cari ekstre ada göre bağlandığı için kayıtlı adı esas al.
  const needle = input.customerName.trim().toLowerCase();
  const canonical =
    customersList.find(c => c.name.trim().toLowerCase() === needle)?.name ??
    customersList.find(c => c.name.toLowerCase().includes(needle))?.name ??
    orders.find(o => o.customerName.toLowerCase().includes(needle))?.customerName ??
    input.customerName.trim();
  const target = findOpenOrderForCollection(orders, canonical, input.orderRef);
  const account = accountList.find(a => a.kind === "kasa") ?? accountList[0];
  await db.createTransaction({
    accountId: account?.id ?? null,
    direction: "in",
    category: "tahsilat",
    amount: String(input.amount),
    customerName: canonical,
    orderId: target?.id ?? null,
    orderNo: target?.orderNo ?? null,
    description: "Asistan tahsilatı",
    note: input.note,
  } as never);
  const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
  let message = `Tahsilat kaydedildi: ${canonical} — ${input.amount.toFixed(2)} TL ✅`;
  if (target) {
    const remaining = Math.max(0, num(target.totalAmount) - num(target.paidAmount) - input.amount);
    message += `\n${target.orderNo} siparişine işlendi${remaining > 0.001 ? `, kalan ${remaining.toFixed(2)} TL` : ", sipariş tamamen ödendi 🎉"}`;
  }
  if (account) message += `\nHesap: ${account.name}`;
  return { message };
}

/** Komutu çözer ve uygular; kullanıcıya dönecek Türkçe mesajı döndürür. */
export async function executeAssistantCommand(transcript: string): Promise<{ message: string }> {
  const cmd = await parseVoiceCommand(transcript);

  if (cmd.intent === "sale" || cmd.intent === "order") {
    const items = (cmd.items ?? []).map(i => ({
      productName: i.name,
      quantity: i.quantity ?? 1,
      unitPrice: i.unitPrice ?? 0,
    }));
    const res = await actionCreateOrder({
      kind: cmd.intent === "sale" ? "sale" : "order",
      customerName: cmd.customerName,
      channel: cmd.channel,
      items,
      noteText: cmd.noteText,
    });
    return { message: cmd.reply || res.message };
  }

  if (cmd.intent === "stock_in" || cmd.intent === "stock_out") {
    if (!cmd.materialName || !cmd.quantity) {
      throw new Error("Malzeme adı ve miktar anlaşılamadı, tekrar söyler misin?");
    }
    return actionStockMove({
      materialName: cmd.materialName,
      direction: cmd.intent === "stock_in" ? "in" : "out",
      quantity: cmd.quantity,
      unit: cmd.unit,
    });
  }

  if (cmd.intent === "note") {
    await db.saveMarketingText({
      contentType: "not",
      productName: null,
      prompt: null,
      content: cmd.noteText ?? transcript,
    });
    return { message: "Not kaydedildi (Pazarlama > Arşiv)" };
  }

  if (cmd.intent === "task_add") {
    const titles = (cmd.taskItems ?? []).map(t => t.trim()).filter(Boolean);
    if (titles.length === 0 && cmd.noteText) titles.push(cmd.noteText);
    return actionAddTasks({ kind: cmd.taskKind ?? "gorev", titles });
  }

  if (cmd.intent === "task_list") {
    if (cmd.listKind === "proje") {
      const projects = await db.listDevProjects();
      const active = projects.filter(p => p.status === "active");
      if (active.length === 0) return { message: "Aktif geliştirme projesi yok." };
      const lines = active.map(p => `• ${p.name} — adım ${p.currentStep}/5${p.targetUse ? ` (${p.targetUse})` : ""}`);
      return { message: `Aktif projeler (${active.length}):\n${lines.join("\n")}` };
    }
    const kind = cmd.listKind === "gorev" ? "gorev" : "eksik";
    const open = await db.listTasks(kind, "open");
    if (open.length === 0) {
      return { message: kind === "eksik" ? "Eksik listesi boş, alınacak bir şey yok 🎉" : "Açık görev yok 🎉" };
    }
    const lines = open.map(t => `☐ ${t.title}${t.note ? ` — ${t.note}` : ""}`);
    return {
      message: `${kind === "eksik" ? "Alınacaklar" : "Görevler"} (${open.length}):\n${lines.join("\n")}`,
    };
  }

  if (cmd.intent === "task_done") {
    const names = (cmd.taskItems ?? []).map(t => t.trim()).filter(Boolean);
    if (names.length === 0 && cmd.noteText) names.push(cmd.noteText);
    return actionCompleteTasks({ names });
  }

  if (cmd.intent === "order_status") {
    if (!cmd.orderStatus) throw new Error("Siparişi hangi duruma alacağımı anlayamadım (yeni/üretimde/hazır/tamamlandı).");
    return actionSetOrderStatus({ orderRef: cmd.orderRef, status: cmd.orderStatus });
  }

  if (cmd.intent === "expense_add") {
    return actionAddExpense({
      category: cmd.expenseCategory,
      amount: cmd.amount ?? 0,
      description: (cmd.noteText ?? transcript).slice(0, 255),
    });
  }

  if (cmd.intent === "collection_add") {
    return actionAddCollection({
      customerName: cmd.customerName ?? "",
      amount: cmd.amount ?? 0,
      orderRef: cmd.orderRef,
      note: cmd.noteText,
    });
  }

  if (cmd.intent === "help") {
    return { message: HELP_TEXT };
  }

  if (cmd.intent === "query") {
    const snapshot = await buildBusinessSnapshot();
    const answer = await answerBusinessQuestion(cmd.noteText ?? transcript, snapshot);
    return { message: answer };
  }

  return {
    message:
      cmd.reply ||
      'Bunu anlayamadım. "yardım" yazarsan yapabildiğim her şeyi tek mesajda gönderirim.',
  };
}
