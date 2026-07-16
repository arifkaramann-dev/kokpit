import { answerBusinessQuestion, isClaudeConfigured, parseVoiceCommand } from "./_core/claude";
import {
  answerWithTools,
  clearPendingConfirmation,
  computeDebtors,
  executeTool,
  getPendingConfirmation,
  parseConfirmationReply,
  requestToolConfirmation,
} from "./assistantTools";
import * as db from "./db";
import { itemsTotal, summarizeItems, toItemRows } from "./orderUtils";

/**
 * Sesli komut / WhatsApp asistanının ortak beyni: serbest Türkçe metni
 * (uygulamadaki mikrofon veya WhatsApp mesajı) çözer ve uygular.
 * Elden satış, sipariş, stok girişi/çıkışı, not alma ve işletme verisi
 * hakkında soru-cevap destekler.
 */

export function generateOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AOC-${ymd}-${rand}`;
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
  const debtors = computeDebtors(active);
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

export type AssistantResult = { message: string; needsConfirmation?: boolean };

/**
 * Komutu çözer ve uygular; kullanıcıya dönecek Türkçe mesajı döndürür.
 *
 * Onay katmanı: yazma yapan araçlar (gider, tahsilat, görev ekleme) önce
 * bekleyen onaya yazılır; kullanıcı "evet/hayır" yanıtıyla tamamlar.
 * userKey: bekleyen onayın sahibi (WhatsApp'ta telefon no, uygulamada "app").
 */
export async function executeAssistantCommand(
  transcript: string,
  opts: { userKey?: string } = {}
): Promise<AssistantResult> {
  const userKey = opts.userKey ?? "app";

  // 1) Bekleyen onay varsa önce onu çözümle (LLM çağrısı gerekmez).
  const pending = getPendingConfirmation(userKey);
  if (pending) {
    const reply = parseConfirmationReply(transcript);
    if (reply === "yes") {
      clearPendingConfirmation(userKey);
      const message = await executeTool(pending.toolName, pending.input, { confirmed: true });
      return { message };
    }
    if (reply === "no") {
      clearPendingConfirmation(userKey);
      return { message: "Tamam, işlemi iptal ettim ❌" };
    }
    // Evet/hayır dışında bir mesaj geldi: bekleyen işlemi iptal edip yeni komutu işle.
    clearPendingConfirmation(userKey);
  }

  const cmd = await parseVoiceCommand(transcript);

  if (cmd.intent === "sale" || cmd.intent === "order") {
    const items = (cmd.items ?? []).map(i => ({
      productName: i.name,
      quantity: i.quantity ?? 1,
      unitPrice: i.unitPrice ?? 0,
    }));
    const total = itemsTotal(items);
    const id = await db.createOrder({
      orderNo: generateOrderNo(),
      customerName: cmd.customerName || (cmd.intent === "sale" ? "Elden Satış" : "Müşteri"),
      channel: cmd.intent === "sale" ? "elden" : (cmd.channel ?? "whatsapp"),
      status: cmd.intent === "sale" ? "done" : "new",
      totalAmount: String(total),
      itemsSummary: items.length ? summarizeItems(items) : (cmd.noteText ?? null),
      notes: cmd.noteText ?? null,
    } as never);
    if (items.length) await db.replaceOrderItems(Number(id), toItemRows(items));
    return {
      message:
        cmd.reply ||
        `${cmd.intent === "sale" ? "Elden satış" : "Sipariş"} eklendi: ${formatCmdItems(items)} — ${total} TL`,
    };
  }

  if (cmd.intent === "stock_in" || cmd.intent === "stock_out") {
    if (!cmd.materialName || !cmd.quantity) {
      throw new Error("Malzeme adı ve miktar anlaşılamadı, tekrar söyler misin?");
    }
    const mats = await db.listMaterials();
    const needle = cmd.materialName.trim().toLowerCase();
    const found =
      mats.find(m => m.name.trim().toLowerCase() === needle) ??
      mats.find(m => m.name.toLowerCase().includes(needle));
    if (!found) {
      if (cmd.intent === "stock_in") {
        await db.createMaterial({
          name: cmd.materialName.trim(),
          category: "diğer",
          unit: cmd.unit ?? "adet",
          stockQty: String(cmd.quantity),
          criticalQty: "0",
          unitCost: "0",
        } as never);
        return { message: `Yeni hammadde açıldı: ${cmd.materialName} (${cmd.quantity} ${cmd.unit ?? "adet"})` };
      }
      throw new Error(`"${cmd.materialName}" adında hammadde bulamadım.`);
    }
    await db.adjustStock(found.id, cmd.intent === "stock_in" ? "in" : "out", cmd.quantity, "Asistan komutu");
    const oldQty = parseFloat(String(found.stockQty)) || 0;
    const newQty = cmd.intent === "stock_in" ? oldQty + cmd.quantity : Math.max(0, oldQty - cmd.quantity);
    const critical = parseFloat(String(found.criticalQty)) || 0;
    let message = `${found.name}: ${cmd.quantity} ${found.unit} ${cmd.intent === "stock_in" ? "girişi" : "çıkışı"} yapıldı. Kalan: ${newQty} ${found.unit}`;
    if (critical > 0 && newQty <= critical) {
      message += `\n⚠️ Dikkat: kritik seviyenin altında (eşik ${critical} ${found.unit}). Eksik listesine ekleyeyim mi dersen "eksik listesine ekle: ${found.name}" yaz.`;
    }
    return { message };
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
    const kind = cmd.taskKind ?? "gorev";
    const titles = (cmd.taskItems ?? []).map(t => t.trim()).filter(Boolean);
    if (titles.length === 0 && cmd.noteText) titles.push(cmd.noteText);
    if (titles.length === 0) throw new Error("Ne ekleyeceğimi anlayamadım, tekrar söyler misin?");
    // Yazma işlemi: onay iste (gorev_ekle aracı onaylanınca çalışır).
    const message = requestToolConfirmation(userKey, "gorev_ekle", { kind, titles });
    return { message, needsConfirmation: true };
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

  if (cmd.intent === "order_status") {
    if (!cmd.orderStatus) throw new Error("Siparişi hangi duruma alacağımı anlayamadım (yeni/üretimde/hazır/tamamlandı).");
    const orders = await db.listOrders();
    if (orders.length === 0) throw new Error("Kayıtlı sipariş yok.");
    const ref = (cmd.orderRef ?? "son").trim().toLowerCase();
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
    if (!target) throw new Error(`"${cmd.orderRef}" ile eşleşen sipariş bulamadım. Sipariş no veya müşteri adı söyleyebilirsin.`);
    await db.updateOrder(target.id, { status: cmd.orderStatus });
    return {
      message: `${target.orderNo} (${target.customerName}) → ${STATUS_LABELS[cmd.orderStatus]} olarak güncellendi ✅`,
    };
  }

  if (cmd.intent === "expense_add") {
    const amount = cmd.amount ?? 0;
    if (amount <= 0) {
      throw new Error('Gider tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "kargoya 250 lira gider ekle")');
    }
    const category = cmd.expenseCategory ?? "diğer";
    // Yazma işlemi: onay iste (gider_ekle aracı onaylanınca çalışır).
    const message = requestToolConfirmation(userKey, "gider_ekle", {
      amount,
      category,
      description: (cmd.noteText ?? transcript).slice(0, 255),
    });
    return { message, needsConfirmation: true };
  }

  if (cmd.intent === "collection_add") {
    const amount = cmd.amount ?? 0;
    if (amount <= 0) {
      throw new Error('Tahsilat tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "Ahmet 500 lira ödedi")');
    }
    if (!cmd.customerName?.trim()) {
      throw new Error("Kimden tahsilat aldığını anlayamadım, müşteri adını da söyler misin?");
    }
    // Yazma işlemi: onay iste. Müşteri/sipariş eşleme (findOpenOrderForCollection
    // dahil) onay anında tahsilat_ekle aracının içinde yapılır.
    const message = requestToolConfirmation(userKey, "tahsilat_ekle", {
      customerName: cmd.customerName.trim(),
      amount,
      orderRef: cmd.orderRef ?? null,
      note: cmd.noteText ?? null,
    });
    return { message, needsConfirmation: true };
  }

  if (cmd.intent === "help") {
    return { message: HELP_TEXT };
  }

  if (cmd.intent === "query") {
    const question = cmd.noteText ?? transcript;
    // Tool-use döngüsü: LLM güvenli (salt-okur) araçlarla veriyi kendisi çeker.
    if (isClaudeConfigured()) {
      try {
        const result = await answerWithTools(question, userKey);
        return { message: result.message, needsConfirmation: result.needsConfirmation };
      } catch (error) {
        console.warn(
          "[assistant] tool-use döngüsü başarısız, snapshot yoluna düşülüyor:",
          error instanceof Error ? error.message : error
        );
      }
    }
    // Geri düşüş: mevcut davranış (tam veri özeti + tek LLM yanıtı).
    const snapshot = await buildBusinessSnapshot();
    const answer = await answerBusinessQuestion(question, snapshot);
    return { message: answer };
  }

  return {
    message:
      cmd.reply ||
      'Bunu anlayamadım. "yardım" yazarsan yapabildiğim her şeyi tek mesajda gönderirim.',
  };
}
