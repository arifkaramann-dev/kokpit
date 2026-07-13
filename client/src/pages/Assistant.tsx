import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { WakeWord } from "@/lib/wakeword";
import { Bot, Ear, Loader2, Mic, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; text: string; at: number };

const STORAGE_KEY = "aoc-assistant-history";
const WAKE_KEY = "aoc-assistant-wake";

// "Hey Kokpit" gibi uyandırma kelimeleri (Türkçe STT'nin yazabileceği varyantlarla).
const WAKE_PHRASES = ["hey kokpit", "hey kokpît", "hey kabin", "kokpit", "kokpît", "hey asistan", "asistan"];

/** Porcupine için tarayıcı desteği (ağır modülü yüklemeden kontrol). */
function wakeSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Tarayıcının SpeechRecognition sınıfını döner (yoksa null). */
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null) ?? null;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

/** Metinde en erken geçen uyandırma kelimesini bulup sonrasındaki komutu çıkarır. */
export function parseWake(transcript: string): { matched: boolean; command: string } {
  const raw = transcript.trim();
  const lower = raw.toLocaleLowerCase("tr-TR");
  const hit = WAKE_PHRASES.map(p => ({ p, i: lower.indexOf(p) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0];
  if (!hit) return { matched: false, command: "" };
  const command = raw.slice(hit.i + hit.p.length).replace(/^[\s,.:!?-]+/, "").trim();
  return { matched: true, command };
}

const SUGGESTIONS = [
  "Bugün kaç sipariş var?",
  "Eksik listesi",
  "Görevlerim neler?",
  "Stok durumu nasıl?",
  "Projeler ne durumda?",
  "Yardım",
];

/**
 * Uygulama içi sohbet asistanı: WhatsApp asistanıyla aynı beyin.
 * Yazarak veya mikrofonla komut ver; geçmiş bu tarayıcıda saklanır.
 */
export default function Assistant() {
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  // Sesli uyandırma ("Hey Kokpit"): opt-in, tercih tarayıcıda saklanır.
  const [wake, setWake] = useState(() => localStorage.getItem(WAKE_KEY) === "1");
  const [armed, setArmed] = useState(false); // uyandırıldı, komut bekleniyor
  const endRef = useRef<HTMLDivElement>(null);
  const wakeRecRef = useRef<SpeechRecognitionLike | null>(null);
  const porcupineRef = useRef<WakeWord | null>(null);

  // Picovoice yapılandırması (AccessKey vb.) sunucudan; varsa Porcupine kullanılır.
  const { data: wakeCfg } = trpc.assistant.wakeConfig.useQuery(undefined, { staleTime: Infinity });
  const usePorcupine = !!wakeCfg?.accessKey && wakeSupported();
  const wakePhrase = usePorcupine
    ? wakeCfg?.keywordPath
      ? wakeCfg.keywordLabel || "Hey Kokpit"
      : "Jarvis"
    : "Hey Kokpit";

  // Callback'lerin bayat closure yakalamaması için son değerleri ref'te tut.
  const sendRef = useRef<(t: string) => void>(() => {});
  const captureRef = useRef<() => Promise<void>>(async () => {});
  const busyRef = useRef(busy);
  const wakeRef = useRef(wake);
  const armedRef = useRef(armed);
  busyRef.current = busy;
  wakeRef.current = wake;
  armedRef.current = armed;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(WAKE_KEY, wake ? "1" : "0");
  }, [wake]);

  // Porcupine (Picovoice) uyandırma: AccessKey varsa cihaz-üstü, güvenilir tetikleme.
  // Kelime algılanınca mikrofonu bırakıp tek-seferlik komut tanımayı çalıştırır.
  useEffect(() => {
    if (!wake || !usePorcupine || !wakeCfg) return;
    let disposed = false;
    // Ağır Picovoice modülünü yalnızca uyandırma açılınca yükle (tembel import).
    import("@/lib/wakeword")
      .then(async ({ WakeWord }) => {
        if (disposed) return;
        const ww = new WakeWord();
        porcupineRef.current = ww;
        await ww.start(
          {
            accessKey: wakeCfg.accessKey,
            keywordPath: wakeCfg.keywordPath,
            keywordLabel: wakeCfg.keywordLabel,
            modelPath: wakeCfg.modelPath,
          },
          async () => {
            if (disposed || busyRef.current || armedRef.current) return;
            setArmed(true);
            try {
              await ww.pause();
              await captureRef.current();
            } finally {
              setArmed(false);
              if (!disposed) await ww.resume().catch(() => {});
            }
          },
        );
      })
      .catch(err => {
        toast.error(`Sesli uyandırma başlatılamadı: ${err?.message ?? err}`);
        setWake(false);
      });
    return () => {
      disposed = true;
      const ww = porcupineRef.current;
      porcupineRef.current = null;
      setArmed(false);
      ww?.stop().catch(() => {});
    };
  }, [wake, usePorcupine, wakeCfg]);

  // Web Speech uyandırma (Porcupine yoksa yedek): açıkken sürekli dinler, "Hey Kokpit"
  // duyunca aynı cümledeki komutu gönderir; komut yoksa bir sonraki cümleyi komut sayar.
  useEffect(() => {
    if (!wake || usePorcupine) return;
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error("Bu tarayıcı sesli uyandırmayı desteklemiyor (Chrome kullan).");
      setWake(false);
      return;
    }
    let stopped = false;
    const rec = new SR();
    rec.lang = "tr-TR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = e => {
      const res = e.results[e.results.length - 1];
      if (!res.isFinal) return;
      const raw = res[0].transcript.trim();
      if (!raw || busyRef.current) return;
      if (armedRef.current) {
        setArmed(false);
        sendRef.current(raw);
        return;
      }
      const { matched, command } = parseWake(raw);
      if (!matched) return;
      if (command) sendRef.current(command);
      else setArmed(true); // uyandı ama komut yok — sıradaki cümleyi bekle
    };
    rec.onerror = ev => {
      if (ev.error === "not-allowed") {
        toast.error("Mikrofon izni gerekli — sesli uyandırma kapatıldı.");
        setWake(false);
      }
      // "no-speech"/"aborted" gibi durumları onend yeniden başlatır.
    };
    rec.onend = () => {
      // Chrome bir süre sonra durur; açıksa yeniden başlat.
      if (!stopped && wakeRef.current) {
        try {
          rec.start();
        } catch {
          /* zaten çalışıyor olabilir */
        }
      }
    };
    wakeRecRef.current = rec;
    try {
      rec.start();
    } catch {
      /* yoksay */
    }
    return () => {
      stopped = true;
      setArmed(false);
      wakeRecRef.current = null;
      try {
        rec.stop();
      } catch {
        /* yoksay */
      }
    };
  }, [wake, usePorcupine]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: t, at: Date.now() }]);
    setBusy(true);
    utils.client.assistant.command
      .mutate({ transcript: t })
      .then(r => {
        setMessages(m => [...m, { role: "assistant", text: r.message, at: Date.now() }]);
        utils.invalidate();
      })
      .catch(err => {
        setMessages(m => [
          ...m,
          { role: "assistant", text: `⚠️ ${err.message ?? "Komut işlenemedi"}`, at: Date.now() },
        ]);
      })
      .finally(() => setBusy(false));
  }
  sendRef.current = send;

  // Tek seferlik komut tanıma (Web Speech): mikrofonla bir cümle alıp gönderir.
  // Hem elle mikrofon butonu hem de Porcupine uyandırması sonrası kullanılır.
  function runOneShot(): Promise<void> {
    return new Promise(resolve => {
      const SR = getSpeechRecognition();
      if (!SR) {
        toast.error("Bu tarayıcı sesli girişi desteklemiyor (Chrome kullan).");
        return resolve();
      }
      const rec = new SR();
      rec.lang = "tr-TR";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = e => {
        const r = e.results[e.results.length - 1];
        if (r?.isFinal) sendRef.current(r[0].transcript);
      };
      rec.onerror = ev => {
        if (ev.error === "not-allowed") toast.error("Mikrofon izni gerekli.");
      };
      rec.onend = () => {
        setListening(false);
        resolve();
      };
      setListening(true);
      try {
        rec.start();
      } catch {
        setListening(false);
        resolve();
      }
    });
  }
  captureRef.current = runOneShot;

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] max-w-3xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Asistan
        </h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp asistanının uygulama içi hali — satış ekle, stok işle, soru sor. Aynı komutlar
          burada da geçerli. Kulak simgesiyle “Hey Kokpit” sesli uyandırmayı açıp el değmeden konuşabilirsin.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-muted/30 p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <Bot className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Merhaba! Ne yapmamı istersin? Örneklerden seç veya kendin yaz:
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-2xl rounded-bl-sm px-3.5 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-3 space-y-2">
        {wake && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`relative flex h-2 w-2`}>
              <span className={`absolute inline-flex h-full w-full rounded-full ${armed ? "bg-primary animate-ping" : "bg-emerald-500"} opacity-75`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${armed ? "bg-primary" : "bg-emerald-500"}`} />
            </span>
            {armed
              ? "Dinliyorum — komutu söyle…"
              : `Sesli uyandırma açık — “${wakePhrase}” de, sonra komutunu söyle.`}
          </div>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            send(input);
          }}
        >
          <Button
            type="button"
            variant={wake ? "default" : "outline"}
            size="icon"
            onClick={() => setWake(w => !w)}
            title={wake ? "Sesli uyandırmayı kapat" : `Sesli uyandırmayı aç (“${wakePhrase}”)`}
          >
            <Ear className={`h-4 w-4 ${wake ? "animate-pulse" : ""}`} />
          </Button>
          <Button
            type="button"
            variant={listening ? "destructive" : "outline"}
            size="icon"
            onClick={() => runOneShot()}
            disabled={wake}
            title={wake ? "Uyandırma açıkken elle mikrofon kapalı" : "Sesle söyle"}
          >
            <Mic className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
          </Button>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='Örn: "Elden satış ekle, 2 adet sprey vernik, tanesi 250 lira"'
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
