import { trpc } from "@/lib/trpc";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Sesli komut düğmesi (sağ alt köşe, mobil dostu).
 * Web Speech API ile Türkçe konuşmayı yazıya çevirir, sunucudaki AI
 * komutu çözer ve uygular (elden satış, sipariş, stok girişi/çıkışı, not).
 */
export default function VoiceButton() {
  const utils = trpc.useUtils();
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const SpeechRecognition =
    typeof window !== "undefined" &&
    ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  if (!SpeechRecognition) return null;

  function start() {
    const Rec = SpeechRecognition as new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
      onerror: (e: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    const rec = new Rec();
    rec.lang = "tr-TR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = e => {
      const transcript = e.results[0][0].transcript;
      setProcessing(true);
      utils.client.assistant.command
        .mutate({ transcript })
        .then(r => {
          toast.success(r.message, { duration: 6000 });
          utils.invalidate();
        })
        .catch(err => toast.error(err.message ?? "Komut işlenemedi", { duration: 6000 }))
        .finally(() => setProcessing(false));
    };
    rec.onerror = e => {
      setListening(false);
      if (e.error === "not-allowed") toast.error("Mikrofon izni gerekli — tarayıcı ayarlarından izin ver.");
      else if (e.error !== "aborted" && e.error !== "no-speech") toast.error("Ses algılanamadı, tekrar dene.");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
    toast.info('Dinliyorum... Örn: "Elden satış ekle, 2 adet sprey vernik, tanesi 250 lira"', {
      duration: 4000,
    });
  }

  return (
    <button
      onClick={() => {
        if (listening) {
          recRef.current?.stop();
          setListening(false);
        } else if (!processing) {
          start();
        }
      }}
      aria-label="Sesli komut"
      className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all ${
        listening
          ? "bg-rose-500 text-white animate-pulse scale-110"
          : processing
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground hover:scale-105"
      }`}
    >
      {processing ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : listening ? (
        <MicOff className="h-6 w-6" />
      ) : (
        <Mic className="h-6 w-6" />
      )}
    </button>
  );
}
