import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Bot, Loader2, Mic, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; text: string; at: number };

const STORAGE_KEY = "aoc-assistant-history";

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  function startMic() {
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return toast.error("Bu tarayıcı sesli girişi desteklemiyor (Chrome kullan).");
    const rec = new (SR as new () => {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
    })();
    rec.lang = "tr-TR";
    rec.interimResults = false;
    rec.onresult = e => send(e.results[0][0].transcript);
    rec.onerror = e => {
      setListening(false);
      if (e.error === "not-allowed") toast.error("Mikrofon izni gerekli.");
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] max-w-3xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Asistan
        </h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp asistanının uygulama içi hali — satış ekle, stok işle, soru sor. Aynı komutlar
          burada da geçerli.
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
            variant={listening ? "destructive" : "outline"}
            size="icon"
            onClick={startMic}
            title="Sesle söyle"
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
