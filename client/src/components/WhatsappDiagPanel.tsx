import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, MessageCircle, RefreshCw, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * "WhatsApp'a yazdım, cevap gelmedi" için tanı kartı (Ayarlar sayfası).
 * Yapılandırma kontrol listesi + son olaylar + test mesajı gönderme.
 * Olay listesi sunucu belleğindedir; yeniden başlatmada sıfırlanır.
 */
export function WhatsappDiagPanel() {
  const { data, refetch, isFetching } = trpc.whatsapp.diagnostics.useQuery();
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; detail: string; to: string } | null>(null);

  const sendTest = trpc.whatsapp.sendTest.useMutation({
    onSuccess: r => {
      setTestResult(r);
      if (r.ok) toast.success(`Test mesajı gönderildi (${r.to}) — telefona düştü mü?`);
      else toast.error(`Gönderim başarısız (HTTP ${r.status}) — ayrıntı aşağıda`, { duration: 8000 });
      refetch();
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const checks: { label: string; ok: boolean; hint: string }[] = data
    ? [
        { label: "Erişim anahtarı (WHATSAPP_ACCESS_TOKEN)", ok: data.accessToken, hint: "Meta System User kalıcı token'ı — geçici token 24 saatte ölür (WHATSAPP.md adım 2)." },
        { label: "Telefon numarası ID (WHATSAPP_PHONE_NUMBER_ID)", ok: data.phoneNumberId, hint: "Meta → WhatsApp → API Setup sayfasındaki Phone number ID." },
        { label: "Webhook doğrulama kelimesi (WHATSAPP_VERIFY_TOKEN)", ok: data.verifyToken, hint: "Meta webhook kurulumunda yazdığın kelimenin aynısı." },
        { label: "İmza anahtarı (WHATSAPP_APP_SECRET)", ok: data.appSecret, hint: "Önerilir: Meta → Settings → Basic → App Secret." },
        { label: "Asistan beyni (ANTHROPIC_API_KEY)", ok: data.anthropicKey, hint: "Cevapları üreten Claude anahtarı." },
        { label: `İzinli numaralar (${data.allowedNumbers.length})`, ok: data.allowedNumbers.length > 0, hint: "WHATSAPP_ALLOWED_NUMBERS boşsa güvenlik gereği KİMSEYE cevap verilmez." },
      ]
    : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" /> WhatsApp Tanı
        </h2>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Yenile
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        "Mesaj attım, cevap gelmiyor" sorusunun cevabı bu kart: önce kontrol listesi yeşil mi bak,
        sonra test mesajı gönder, en son WhatsApp'tan bir mesaj atıp <b>Yenile</b>'ye bas — mesajın
        "mesaj alındı" olarak düşmesi gerekir.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map(c => (
          <div key={c.label} className="flex items-start gap-2 rounded-lg border p-2.5">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{c.label}</p>
              {!c.ok && <p className="text-xs text-muted-foreground mt-0.5">{c.hint}</p>}
            </div>
          </div>
        ))}
      </div>

      {data && data.allowedNumbers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          İzinli numaralar: <span className="font-mono">{data.allowedNumbers.join(", ")}</span> —
          eşleşme artık son 10 hane üzerinden yapılır (başındaki 90/0 farkı sorun çıkarmaz).
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          className="w-56"
          value={testTo}
          onChange={e => setTestTo(e.target.value)}
          placeholder="Numara (boş = ilk izinli numara)"
        />
        <Button
          size="sm"
          onClick={() => sendTest.mutate(testTo.trim() ? { to: testTo.trim() } : undefined)}
          disabled={sendTest.isPending}
        >
          <Send className="h-3.5 w-3.5 mr-1" /> Test Mesajı Gönder
        </Button>
      </div>
      {testResult && !testResult.ok && (
        <div className="text-xs rounded-md border border-rose-500/40 p-2 font-mono break-all text-rose-700 dark:text-rose-400">
          HTTP {testResult.status}: {testResult.detail || "ayrıntı yok"}
          <p className="mt-1 font-sans">
            En sık sebepler: token süresi dolmuş (Meta'dan kalıcı System User token'ı al) veya numara
            Meta test listesine ekli değil.
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-1.5">Son olaylar</p>
        {!data || data.events.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
            Henüz olay yok (sunucu yeniden başlayınca liste sıfırlanır). WhatsApp'tan bir mesaj atıp
            <b> Yenile</b>'ye bas: hiçbir kayıt düşmüyorsa Meta webhook bağlantısı kopuk demektir —
            WHATSAPP.md 4. adımı (Callback URL + messages aboneliği) yeniden yap. Render ücretsiz
            planda servis uyuyorsa ilk mesaj işlenmeyebilir; siteyi açıp tekrar dene.
          </p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-md border divide-y">
            {data.events.map((e, i) => (
              <div key={i} className="flex items-start gap-2 p-2 text-xs">
                {e.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(e.at).toLocaleTimeString("tr-TR")}
                </span>
                <span className="font-medium whitespace-nowrap">{e.kind}</span>
                <span className="break-words min-w-0">{e.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
