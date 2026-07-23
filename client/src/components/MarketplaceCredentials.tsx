import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Pazaryeri kimlik bilgilerini uygulama içinden düzenleme.
 * Her pazaryeri ayrı bir kart: gerekli alanlar (Satıcı ID, API Key/Secret vb.),
 * kaynak rozeti (Render env / uygulama içi), kaydet ve bağlantı testi.
 * Sırlar maskeli gösterilir; boş bırakılan sır alanı mevcut değeri korur.
 */

type FieldState = Record<string, string>;

function SourceBadge({ source, isSet }: { source: "db" | "env" | "empty"; isSet: boolean }) {
  if (source === "db")
    return (
      <span className="text-[10px] rounded-full border border-primary/40 text-primary px-1.5 py-0.5">
        uygulama içi
      </span>
    );
  if (source === "env")
    return (
      <span className="text-[10px] rounded-full border border-emerald-500/40 text-emerald-600 px-1.5 py-0.5">
        Render env
      </span>
    );
  return (
    <span className="text-[10px] rounded-full border border-amber-500/40 text-amber-600 px-1.5 py-0.5">
      {isSet ? "" : "boş"}
    </span>
  );
}

export function MarketplaceCredentials() {
  const utils = trpc.useUtils();
  const { data: creds, isLoading } = trpc.settings.marketplaceCredentials.useQuery();
  const { data: mpStatus } = trpc.orders.marketplaceStatus.useQuery();
  const [form, setForm] = useState<FieldState>({});
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; status: number; body: string }>
  >({});

  const save = trpc.settings.saveMarketplaceCredentials.useMutation({
    onSuccess: () => {
      utils.settings.marketplaceCredentials.invalidate();
      utils.orders.marketplaceStatus.invalidate();
      utils.settings.integrationStatus.invalidate();
      setForm({});
      toast.success("Pazaryeri bilgileri kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const testConn = trpc.orders.testConnection.useMutation({
    onSuccess: (r, vars) => setTestResult(s => ({ ...s, [vars.key]: r })),
    onError: (e, vars) =>
      setTestResult(s => ({ ...s, [vars.key]: { ok: false, status: 0, body: e.message } })),
  });

  const statusByKey = new Map((mpStatus ?? []).map(m => [m.key, m]));

  const setField = (k: string, v: string) => setForm(s => ({ ...s, [k]: v }));

  const saveMarketplace = (mpKey: string, fields: { field: string; secret: boolean; value?: string }[]) => {
    const payload: FieldState = {};
    for (const f of fields) {
      const key = `${mpKey}:${f.field}`;
      if (key in form) {
        payload[key] = form[key];
      } else if (!f.secret && f.value !== undefined) {
        // Sır olmayan alanlar dokunulmasa da mevcut değeriyle gönderilir (kayıp olmaz).
        payload[key] = f.value;
      }
    }
    save.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        API bilgilerini buradan girebilirsin. Girilen değerler güvenli şekilde veritabanında
        saklanır ve Render ortam değişkenlerinin <b>üzerine</b> geçer — canlıda anahtar değiştirmek
        için Render paneline girmene gerek kalmaz. Sırlar maskeli gösterilir; bir sır alanını{" "}
        <b>boş bırakırsan</b> mevcut değer korunur.
      </p>

      {(creds ?? []).map(mp => {
        const st = statusByKey.get(mp.key as never);
        const configured = st?.configured ?? mp.fields.filter(f => !f.help?.includes("opsiyonel")).every(f => f.isSet);
        const tr = testResult[mp.key];
        return (
          <Card key={mp.key} className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {configured ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
              <span className="font-semibold">{mp.label}</span>
              {mp.testMode && (
                <span className="text-[10px] rounded-full border border-amber-500/50 text-amber-600 px-1.5 py-0.5">
                  TEST (SIT) — senkron kapalı
                </span>
              )}
              <span className={`text-xs ml-auto ${configured ? "text-emerald-600" : "text-amber-600"}`}>
                {configured ? "Bağlı" : "Eksik"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{mp.docHint}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mp.fields.map(f => {
                const key = `${mp.key}:${f.field}`;
                const draft = form[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">{f.label}</Label>
                      <SourceBadge source={f.source} isSet={f.isSet} />
                    </div>
                    {f.type === "select" ? (
                      <Select
                        value={draft ?? f.value ?? ""}
                        onValueChange={v => setField(key, v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map(o => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.secret ? (
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={draft ?? ""}
                        onChange={e => setField(key, e.target.value)}
                        placeholder={f.isSet ? `Kayıtlı: ${f.masked} — değiştirmek için yaz` : "Girilmedi"}
                      />
                    ) : (
                      <Input
                        value={draft ?? f.value ?? ""}
                        onChange={e => setField(key, e.target.value)}
                        placeholder={f.placeholder}
                      />
                    )}
                    {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => saveMarketplace(mp.key, mp.fields)} disabled={save.isPending}>
                {save.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!configured || testConn.isPending}
                onClick={() => testConn.mutate({ key: mp.key as never })}
              >
                <PlugZap className="h-3.5 w-3.5 mr-1" />
                Bağlantıyı Test Et
              </Button>
            </div>

            {tr && (
              <div
                className={`text-xs rounded-md border p-2 font-mono break-all ${
                  tr.ok
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    : "border-rose-500/40 text-rose-700 dark:text-rose-400"
                }`}
              >
                HTTP {tr.status} {tr.ok ? "✓ Başarılı" : "✗ Hata"}
                {tr.body && <div className="mt-1 opacity-80">{tr.body}</div>}
              </div>
            )}
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground border-t pt-3">
        Bağlantı testi ve senkron canlı pazaryeri API'lerine bağlanır — yalnızca canlı ortamda
        (Render) gerçek sonuç döner. Test ortamında ağ erişimi olmayabilir.
      </p>
    </div>
  );
}
