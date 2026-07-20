import type { VoiceCommand } from "./_core/claude";

/**
 * Asistan onay katmanı — SAF mantık (DB/LLM yok, birim testlenir).
 *
 * Asistanın yazma komutları riske göre sınıflandırılır:
 *  - güvenli  : otomatik uygulanır (soru-cevap, liste, yardım, not).
 *  - onaylı   : önce önizleme gösterilir, kullanıcı "evet" deyince uygulanır
 *               (stok, görev, sipariş durumu — geri alınabilir ama yanlış olabilir).
 *  - kritik   : para/kayıt işlemi; güçlü onay ister (satış, sipariş, gider, tahsilat).
 *
 * Onay tespiti kalıp tabanlıdır — EKSTRA LLM çağrısı yapılmaz (token disiplini).
 */

export type IntentClass = "safe" | "confirm" | "critical";

/** Sipariş durumu etiketleri (asistan cevaplarında ve önizlemede kullanılır). */
export const STATUS_LABELS: Record<string, string> = {
  new: "Yeni",
  production: "Üretimde",
  ready: "Kargoya Hazır",
  done: "Tamamlandı",
  cancelled: "İptal/İade",
};

const CRITICAL_INTENTS = new Set<VoiceCommand["intent"]>([
  "sale",
  "order",
  "expense_add",
  "collection_add",
]);

const CONFIRM_INTENTS = new Set<VoiceCommand["intent"]>([
  "stock_in",
  "stock_out",
  "task_add",
  "task_done",
  "order_status",
]);

/**
 * Bir intent'i onay sınıfına eşler. Listelenmeyen tüm intent'ler (query,
 * task_list, help, note, unknown) güvenli sayılır — ya okuma ya düşük riskli.
 */
export function classifyIntent(intent: VoiceCommand["intent"]): IntentClass {
  if (CRITICAL_INTENTS.has(intent)) return "critical";
  if (CONFIRM_INTENTS.has(intent)) return "confirm";
  return "safe";
}

export type Preflight = { ok: true } | { ok: false; message: string };

/**
 * Onay öncesi SAF alan kontrolü (DB'siz): komut, uygulanabilir alanları taşıyor
 * mu? Taşımıyorsa dostça hata mesajı döner ve onay akışı hiç başlamaz (bekleyen
 * eylem saklanmaz). Mesajlar assistant.applyCommand'daki koruma cümleleriyle
 * birebir aynıdır ki önizleme ile uygulama tutarlı kalsın.
 */
export function preflightCheck(cmd: VoiceCommand): Preflight {
  switch (cmd.intent) {
    case "stock_in":
    case "stock_out":
      if (!cmd.materialName || !cmd.quantity) {
        return { ok: false, message: "Malzeme adı ve miktar anlaşılamadı, tekrar söyler misin?" };
      }
      return { ok: true };
    case "task_add": {
      const titles = deriveList(cmd);
      if (titles.length === 0) {
        return { ok: false, message: "Ne ekleyeceğimi anlayamadım, tekrar söyler misin?" };
      }
      return { ok: true };
    }
    case "task_done": {
      const names = deriveList(cmd);
      if (names.length === 0) {
        return { ok: false, message: "Hangi maddeyi kapatacağımı anlayamadım." };
      }
      return { ok: true };
    }
    case "order_status":
      if (!cmd.orderStatus) {
        return {
          ok: false,
          message: "Siparişi hangi duruma alacağımı anlayamadım (yeni/üretimde/hazır/tamamlandı).",
        };
      }
      return { ok: true };
    case "expense_add":
      if ((cmd.amount ?? 0) <= 0) {
        return {
          ok: false,
          message: 'Gider tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "kargoya 250 lira gider ekle")',
        };
      }
      return { ok: true };
    case "collection_add":
      if ((cmd.amount ?? 0) <= 0) {
        return {
          ok: false,
          message: 'Tahsilat tutarını anlayamadım, tutarla birlikte söyler misin? (örn. "Ahmet 500 lira ödedi")',
        };
      }
      if (!cmd.customerName?.trim()) {
        return { ok: false, message: "Kimden tahsilat aldığını anlayamadım, müşteri adını da söyler misin?" };
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}

/** task_add / task_done için başlık listesini komuttan üretir (applyCommand ile aynı). */
function deriveList(cmd: VoiceCommand): string[] {
  const items = (cmd.taskItems ?? []).map(t => t.trim()).filter(Boolean);
  if (items.length === 0 && cmd.noteText) items.push(cmd.noteText.trim());
  return items.filter(Boolean);
}

const tl = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;

/** Komutu tek satırlık, insan okur önizlemeye çevirir (onay ekranı için). */
export function describeCommand(cmd: VoiceCommand): string {
  switch (cmd.intent) {
    case "sale":
    case "order": {
      const items = (cmd.items ?? []);
      const label = items.map(i => `${i.quantity ?? 1}× ${i.name}`).join(", ") || "kalemsiz";
      const total = items.reduce((s, i) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0), 0);
      const who = cmd.customerName || (cmd.intent === "sale" ? "Elden Satış" : "Müşteri");
      return `🛒 ${cmd.intent === "sale" ? "Elden satış" : "Sipariş"} — ${who}: ${label} = ${tl(total)}`;
    }
    case "stock_in":
    case "stock_out":
      return `📦 Stok ${cmd.intent === "stock_in" ? "girişi" : "çıkışı"}: ${cmd.quantity ?? "?"} ${cmd.unit ?? ""} ${cmd.materialName ?? ""}`.replace(/\s+/g, " ").trim();
    case "task_add": {
      const titles = deriveList(cmd);
      const label = (cmd.taskKind ?? "gorev") === "eksik" ? "Eksik listesine" : "Görevlere";
      return `📝 ${label} eklenecek: ${titles.join(", ")}`;
    }
    case "task_done":
      return `✅ Kapatılacak: ${deriveList(cmd).join(", ")}`;
    case "order_status":
      return `🔄 Sipariş "${cmd.orderRef ?? "son"}" → ${STATUS_LABELS[cmd.orderStatus ?? "new"] ?? cmd.orderStatus}`;
    case "expense_add":
      return `💸 Gider: ${cmd.expenseCategory ?? "diğer"} — ${tl(cmd.amount ?? 0)}`;
    case "collection_add":
      return `💰 Tahsilat: ${cmd.customerName ?? ""} — ${tl(cmd.amount ?? 0)}${cmd.orderRef ? ` (${cmd.orderRef})` : ""}`;
    default:
      return cmd.reply || "İşlem";
  }
}

export const CONFIRM_HINT = 'Onaylıyor musun? "evet" yaz · iptal için "hayır".';

/** Onay bekleyen komut için kullanıcıya gösterilecek tam önizleme metni. */
export function buildConfirmPreview(cmd: VoiceCommand, klass: IntentClass): string {
  const head = klass === "critical" ? "⚠️ *Onay gerekiyor* (para/kayıt işlemi)" : "❔ *Onay gerekiyor*";
  return `${head}\n${describeCommand(cmd)}\n\n${CONFIRM_HINT}`;
}

/* ------------------- Onay / iptal kelime tanıma (kalıp tabanlı) ------------------- */

const AFFIRM = new Set([
  "evet", "e", "ee", "eevet", "evt", "tamam", "tmm", "tamamdır", "tamamdir",
  "olur", "olsun", "onayla", "onaylıyorum", "onayliyorum", "onaylandı", "onaylandi",
  "onay", "aynen", "tabii", "tabi", "ok", "okey", "okay", "oldu", "peki",
  "uygundur", "uygun", "kabul", "doğru", "dogru", "he", "hee", "hıhı", "hihi", "onaylıyor",
]);

const NEGATE = new Set([
  "hayır", "hayir", "yok", "iptal", "vazgeç", "vazgec", "vazgeçtim", "vazgectim",
  "olmaz", "dur", "boşver", "bosver", "istemiyorum", "istemem", "yanlış", "yanlis",
  "yapma", "gerekmez", "hayirr",
]);

/** Anlam taşımayan dolgu kelimeleri ("iptal et", "onayla lütfen" gibi). */
const FILLER = new Set([
  "et", "lütfen", "lutfen", "bunu", "onu", "şunu", "sunu", "artık", "artik", "hadi", "ya", "be",
]);

/** Serbest metni sadeleştirir: küçük harf (tr), noktalama/emoji at, kelimelere böl. */
function tokenizeConfirm(text: string): string[] {
  return text
    .toLocaleLowerCase("tr-TR")
    // Türkçe harf + rakam + boşluk dışını (noktalama, emoji) boşluğa çevir.
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Onay/iptal kararı için dolgu kelimeleri atılmış çekirdek kelimeler. */
function coreTokens(text: string): string[] {
  return tokenizeConfirm(text).filter(t => !FILLER.has(t));
}

/**
 * Metin bir onay mı? Dolgu atıldıktan sonra ≤3 kelime VE tüm kelimeler onay
 * sözcüğü olmalı ("iptal et"→onay değil; "evet ama sonra"→onay değil). Böylece
 * yeni bir komut yanlışlıkla onay sayılmaz.
 */
export function isAffirmation(text: string): boolean {
  const toks = coreTokens(text);
  if (toks.length === 0 || toks.length > 3) return false;
  return toks.every(t => AFFIRM.has(t));
}

/** Metin bir iptal mi? Onay ile aynı katı kural (dolgu at, ≤3 kelime, hepsi iptal). */
export function isNegation(text: string): boolean {
  const toks = coreTokens(text);
  if (toks.length === 0 || toks.length > 3) return false;
  return toks.every(t => NEGATE.has(t));
}
