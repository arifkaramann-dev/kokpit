import { answerBusinessQuestion, parseVoiceCommand } from "./_core/claude";
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

/** Soru-cevap için işletmenin güncel verilerinden kompakt Türkçe özet üretir. */
export async function buildBusinessSnapshot(): Promise<string> {
  const [statusCounts, today, critical, materials, products, orders] = await Promise.all([
    db.orderStatusCounts(),
    db.countOrdersToday(),
    db.listCriticalMaterials(),
    db.listMaterials(),
    db.listProducts(),
    db.listOrders(),
  ]);
  const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = orders.filter(o => new Date(o.createdAt as unknown as string).getTime() >= since30);
  const revenue30 = last30.reduce((s, o) => s + (parseFloat(String(o.totalAmount)) || 0), 0);
  const recent = orders.slice(0, 15).map(o => {
    const date = o.createdAt instanceof Date ? o.createdAt.toISOString().slice(0, 10) : String(o.createdAt).slice(0, 10);
    return `- ${date} ${o.orderNo} | ${o.customerName} | ${o.channel} | ${o.status} | ${o.totalAmount} TL | ${o.itemsSummary ?? ""}`;
  });
  const lines = [
    `Bugünkü sipariş: ${today?.count ?? 0} adet, ${today?.total ?? 0} TL`,
    `Sipariş durumları: ${statusCounts.map(s => `${s.status}: ${s.count}`).join(", ") || "yok"}`,
    `Son 30 gün ciro: ${revenue30.toFixed(2)} TL (${last30.length} sipariş)`,
    `Ürün sayısı: ${products.length}`,
    `Hammadde sayısı: ${materials.length}`,
    `Kritik stok altındaki hammaddeler: ${critical.map(m => `${m.name} (${m.stockQty} ${m.unit})`).join(", ") || "yok"}`,
    `Stok listesi (ad | miktar | birim maliyet): ${materials
      .slice(0, 40)
      .map(m => `${m.name} | ${m.stockQty} ${m.unit} | ${m.unitCost} TL`)
      .join("; ")}`,
    `Son siparişler:`,
    ...recent,
  ];
  return lines.join("\n");
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
    return {
      message:
        cmd.reply ||
        `${found.name}: ${cmd.quantity} ${found.unit} ${cmd.intent === "stock_in" ? "girişi" : "çıkışı"} yapıldı`,
    };
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

  if (cmd.intent === "query") {
    const snapshot = await buildBusinessSnapshot();
    const answer = await answerBusinessQuestion(cmd.noteText ?? transcript, snapshot);
    return { message: answer };
  }

  return {
    message:
      cmd.reply ||
      "Bunu anlayamadım. 'Elden satış ekle', 'stok girişi', 'not al' diyebilir veya işletmenle ilgili soru sorabilirsin.",
  };
}
