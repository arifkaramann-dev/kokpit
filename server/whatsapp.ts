import { runAssistant } from "./assistantAgent";
import * as db from "./db";

/**
 * WhatsApp bağlı-cihaz köprüsü (Baileys — resmi olmayan WhatsApp Web istemcisi).
 *
 * NEDEN BÖYLE: Patron kendi numarasını kullanmaya + telefonundan WhatsApp'ı
 * normal kullanmaya devam etmek istedi. Meta/Twilio Business API numarayı ele
 * geçirir ve normal uygulamada kullandırmaz; oysa bu köprü telefondaki WhatsApp'a
 * "Bağlı Cihazlar"dan eklenen bir cihaz gibi davranır — numara değişmez, telefon
 * normal çalışır. (Ödünleşim: resmi değil, düşük de olsa ban riski var.)
 *
 * KONTROL YÜZEYİ = "Kendine mesaj" (note-to-self) sohbeti. Patron kendi WhatsApp'ında
 * kendine "Bülent'e 900 elden satış, 225 astar 300 primex..." yazar → köprü aynı
 * sohbette taslağı + "onaylıyor musun?" diye cevaplar → "evet" → sipariş açılır.
 * Müşteri hiçbir şey görmez. İstenirse WHATSAPP_CONTROL_JID ile başka bir sohbet
 * kontrol yüzeyi yapılabilir.
 *
 * BEYİN ORTAK: gelen metin doğrudan runAssistant'a gider — uygulama içi asistanla
 * BİREBİR aynı taslak+onay katmanı (server/assistantAgent.ts). conversationKey
 * sohbet başına olduğu için bekleyen onay doğal olarak izole olur.
 *
 * WHATSAPP_ENABLED=1 değilse köprü hiç başlamaz (varsayılan: kapalı). Baileys yüklü
 * değilse veya bağlantı hata verirse sessizce devre dışı kalır — web sunucusu asla
 * bu yüzden çökmez.
 */

export type WaConfig = {
  enabled: boolean;
  /** Oturum (giriş) durumunun saklandığı klasör. Render'da kalıcı disk gerekir. */
  authDir: string;
  /** Kontrol sohbeti JID'i. Boşsa bağlanınca "kendine mesaj" (self-chat) kullanılır. */
  controlJid: string;
};

export function readWaConfig(env: NodeJS.ProcessEnv = process.env): WaConfig {
  return {
    enabled: env.WHATSAPP_ENABLED === "1",
    authDir: env.WHATSAPP_AUTH_DIR || ".wa-auth",
    controlJid: (env.WHATSAPP_CONTROL_JID || "").trim(),
  };
}

/**
 * Bir WhatsApp JID'ini karşılaştırma için sadeleştirir: cihaz/agent ekini
 * (":12"), sunucu ekini ve süsleri atıp yalın kullanıcı kısmını döndürür.
 * "905321234567:12@s.whatsapp.net" → "905321234567"
 */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return "";
  const user = String(jid).split("@")[0] ?? "";
  return user.split(":")[0]!.replace(/\D/g, "") || user.split(":")[0]!;
}

/** İki JID aynı WhatsApp hesabını/sohbetini mi gösteriyor? */
export function sameJid(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeJid(a);
  const nb = normalizeJid(b);
  return na !== "" && na === nb;
}

/**
 * Gelen mesaj işlenecek kontrol sohbetinde mi? controlJid tanımlıysa ona,
 * değilse köprünün kendi hesabına (self-chat) bakar.
 */
export function isControlChat(
  remoteJid: string | null | undefined,
  controlJid: string,
  selfJid: string | null | undefined,
): boolean {
  if (!remoteJid) return false;
  if (remoteJid === "status@broadcast") return false;
  const target = controlJid || selfJid || "";
  return sameJid(remoteJid, target);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Baileys mesaj içeriğinden düz metni çıkarır (ephemeral/viewOnce sarmalını açar). */
export function extractMessageText(message: any): string | null {
  if (!message) return null;
  // Bazı mesajlar sarmalanmış gelir; iç mesaja in.
  const inner =
    message.ephemeralMessage?.message ??
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.documentWithCaptionMessage?.message ??
    message;
  const text =
    inner.conversation ??
    inner.extendedTextMessage?.text ??
    inner.imageMessage?.caption ??
    inner.videoMessage?.caption ??
    null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed.length ? trimmed : null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------ Çalışma zamanı ------------------------------ */

let started = false;
let guardInstalled = false;
let latestQr: string | null = null;
let connected = false;

/** Köprünün durumu (ileride korumalı bir endpoint'e bağlanabilir). */
export function getWhatsappBridgeState(): { enabled: boolean; connected: boolean; hasQr: boolean } {
  return { enabled: readWaConfig().enabled, connected, hasQr: latestQr != null };
}

/**
 * Tarayıcıda okutulabilir QR görünümü: bağlıysa svg yok, bekliyorsa güncel QR'ı
 * SVG olarak üretir. Render loglarındaki ASCII QR yerine korumalı bir endpoint'ten
 * (bkz. /api/whatsapp/qr) temiz okutmak için.
 */
export async function getWhatsappQrView(): Promise<{ enabled: boolean; connected: boolean; svg: string | null }> {
  const enabled = readWaConfig().enabled;
  if (!latestQr || connected) return { enabled, connected, svg: null };
  try {
    const qrcode = await import("qrcode");
    const svg = await qrcode.toString(latestQr, { type: "svg", margin: 1, width: 320 });
    return { enabled, connected, svg };
  } catch {
    return { enabled, connected, svg: null };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Baileys auth state'ini DB'de saklayan adaptör (useMultiFileAuthState'in DB
 * karşılığı). Render'ın geçici diski sıfırlansa bile oturum kalıcı olur —
 * QR bir kez okutulur. name="creds" + signal anahtarları ("<tür>-<id>").
 */
async function useDbAuthState(baileys: any): Promise<{ state: any; saveCreds: () => Promise<void> }> {
  const { initAuthCreds, BufferJSON, proto } = baileys;
  const keyName = (type: string, id: string) => `${type}-${id}`;

  const write = (name: string, value: any) => db.setWhatsappAuth(name, JSON.stringify(value, BufferJSON.replacer));
  const readCreds = async () => {
    const rows = await db.getWhatsappAuth(["creds"]);
    return rows["creds"] ? JSON.parse(rows["creds"], BufferJSON.reviver) : null;
  };

  const creds = (await readCreds()) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const names = ids.map(id => keyName(type, id));
          const rows = await db.getWhatsappAuth(names);
          const data: Record<string, any> = {};
          ids.forEach((id, i) => {
            let value = rows[names[i]] ? JSON.parse(rows[names[i]], BufferJSON.reviver) : null;
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            if (value) data[id] = value;
          });
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const jobs: Promise<void>[] = [];
          const toDelete: string[] = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              const name = keyName(type, id);
              if (value) jobs.push(write(name, value));
              else toDelete.push(name);
            }
          }
          if (toDelete.length) jobs.push(db.deleteWhatsappAuth(toDelete));
          await Promise.all(jobs);
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Baileys'in beklediği pino-benzeri asgari sessiz logger (ekstra bağımlılık yok).
const silentLogger: any = {
  level: "silent",
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return silentLogger;
  },
};

/**
 * Köprüyü başlatır. WHATSAPP_ENABLED=1 değilse hiçbir şey yapmaz. Tüm hatalar
 * yutulur; bu köprü hiçbir koşulda ana sunucuyu düşürmez.
 */
export async function startWhatsappBridge(): Promise<void> {
  const cfg = readWaConfig();
  if (!cfg.enabled) return;
  if (started) return;
  started = true;

  // Çökme koruması: Baileys'ten gelebilecek yakalanmamış promise reddi Node'u
  // (varsayılan davranışla) düşürmesin — logla, süreç ayakta kalsın. Yalnızca
  // köprü açıkken kurulur; bir kez.
  if (!guardInstalled) {
    guardInstalled = true;
    process.on("unhandledRejection", reason => {
      console.error(
        "[whatsapp] yakalanmamış promise reddi (yutuldu, süreç ayakta):",
        reason instanceof Error ? reason.message : reason,
      );
    });
  }

  try {
    // Ağır Baileys bağımlılığını yalnızca köprü açıkken yükle.
    const baileys: any = await import("baileys");
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { DisconnectReason, fetchLatestBaileysVersion } = baileys;
    const qrcode: any = await import("qrcode-terminal").then(m => m.default ?? m).catch(() => null);

    // Oturum DB'de saklanır → Render diski sıfırlansa da QR bir kez okutulur.
    const { state, saveCreds } = await useDbAuthState(baileys);

    let version: [number, number, number] | undefined;
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch {
      /* sürüm alınamadıysa Baileys gömülü sürümü kullanır */
    }

    // Kendi gönderdiğimiz cevapların echo'sunu atlamak için (self-chat sonsuz döngü koruması).
    const sentIds = new Set<string>();
    // Bağlantı anından ÖNCEki mesajları (geçmiş senkronu) işleme almamak için eşik.
    let readyAtSec = 0;
    const debug = process.env.WHATSAPP_DEBUG === "1";

    const connect = () => {
      const sock = makeWASocket({
        version,
        auth: state,
        logger: silentLogger,
        markOnlineOnConnect: false, // telefonu "çevrimdışı" göstermesin, normal kullanımı bozma
        syncFullHistory: false, // geçmiş mesaj senkronunu çekme (512MB RAM'de OOM riskini düşür)
        shouldSyncHistoryMessage: () => false,
        browser: ["Kokpit", "Chrome", "1.0"],
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (u: any) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr) {
          latestQr = qr;
          console.log(
            "\n[whatsapp] Telefonundan bağla: WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla, sonra bu QR'ı okut:\n",
          );
          qrcode?.generate(qr, { small: true });
        }
        if (connection === "open") {
          connected = true;
          latestQr = null;
          // Bu andan itibaren gelen mesajları işle; öncekiler geçmiş senkronudur.
          readyAtSec = Math.floor(Date.now() / 1000);
          const selfJid = sock.user?.id;
          console.log(
            `[whatsapp] bağlandı ✔  hesap=${normalizeJid(selfJid)}${
              sock.user?.lid ? `/${normalizeJid(sock.user.lid)}` : ""
            }  kontrol sohbeti=${cfg.controlJid ? normalizeJid(cfg.controlJid) : "kendine mesaj (self-chat)"}`,
          );
        }
        if (connection === "close") {
          connected = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          if (loggedOut) {
            console.warn("[whatsapp] oturum kapandı (telefondan bağlantı kaldırıldı). DB oturumu temizleniyor; yeni QR gerekir.");
            void db.clearWhatsappAuth().catch(() => {}); // temiz başlangıç → yeni QR
            return; // yeniden deneme yok; yeni QR gerekir
          }
          console.warn("[whatsapp] bağlantı koptu, 5 sn sonra yeniden bağlanılıyor…");
          setTimeout(connect, 5000);
        }
      });

      sock.ev.on("messages.upsert", async (up: any) => {
        try {
          // NOT: type'a göre eleme YAPMIYORUZ. Kendine (self-chat) yazdığın mesaj
          // köprüye giden-mesaj senkronu olarak gelir ve çoğu zaman type "append"
          // olur; "notify" filtresi bunları yutardı. Geçmiş senkronunu zaman
          // damgasıyla ayıklıyoruz (readyAtSec'ten eski mesajları atla).
          const selfJid = sock.user?.id;
          const selfLid = sock.user?.lid;
          for (const m of up.messages ?? []) {
            const id: string | undefined = m.key?.id;
            const remoteJid: string | undefined = m.key?.remoteJid;
            const ts = Number(m.messageTimestamp ?? 0);
            const isControl =
              isControlChat(remoteJid, cfg.controlJid, selfJid) ||
              (!cfg.controlJid && isControlChat(remoteJid, cfg.controlJid, selfLid));

            if (debug) {
              console.log(
                `[whatsapp] upsert type=${up.type} from=${remoteJid} fromMe=${m.key?.fromMe} ts=${ts} kontrol=${isControl} metin=${JSON.stringify(
                  (extractMessageText(m.message) ?? "").slice(0, 40),
                )}`,
              );
            }

            // Kendi gönderdiğimiz cevabın echo'su → atla (döngü koruması).
            if (id && sentIds.has(id)) {
              sentIds.delete(id);
              continue;
            }
            if (!isControl) continue;
            // Bağlantı öncesi (geçmiş) mesajları atla; ts yoksa canlı say.
            if (readyAtSec && ts && ts < readyAtSec - 5) continue;
            const text = extractMessageText(m.message);
            if (!text) continue;

            const reply = await runAssistant(text, `wa:${normalizeJid(remoteJid)}`);
            const sent = await sock.sendMessage(remoteJid, { text: reply.message });
            const sentId: string | undefined = sent?.key?.id;
            if (sentId) sentIds.add(sentId);
            if (debug) console.log(`[whatsapp] cevap gönderildi → ${remoteJid}`);
          }
        } catch (error) {
          console.error("[whatsapp] mesaj işlenemedi:", error);
        }
      });
    };

    connect();
  } catch (error) {
    console.warn(
      "[whatsapp] köprü başlatılamadı (bağımlılık/oturum sorunu olabilir), devre dışı:",
      error instanceof Error ? error.message : error,
    );
  }
}
