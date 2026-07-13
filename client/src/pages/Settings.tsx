import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Building2, CheckCircle2, FileCheck, Percent, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Şirket/fatura bilgileri ve pazaryeri bağlantı durumu. */
const FIELDS: { key: string; label: string; placeholder?: string; textarea?: boolean }[] = [
  { key: "companyName", label: "Ünvan / Firma Adı", placeholder: "Art of Colour ..." },
  { key: "companyAddress", label: "Adres", placeholder: "Mah. Cad. No, İlçe / İl", textarea: true },
  { key: "taxOffice", label: "Vergi Dairesi", placeholder: "Örn. Kadıköy" },
  { key: "taxNumber", label: "Vergi No / TC Kimlik No", placeholder: "1234567890" },
  { key: "companyPhone", label: "Telefon", placeholder: "0555 555 55 55" },
  { key: "companyEmail", label: "E-posta", placeholder: "info@..." },
  { key: "companyWeb", label: "Web Sitesi", placeholder: "www.artofcolour..." },
  { key: "iban", label: "IBAN", placeholder: "TR.." },
  { key: "bankName", label: "Banka", placeholder: "Örn. Ziraat Bankası" },
  { key: "vatRate", label: "KDV Oranı (%)", placeholder: "20" },
  { key: "invoiceNote", label: "Fatura Alt Notu", placeholder: "Teşekkür / iade koşulları vb.", textarea: true },
];

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: mpStatus } = trpc.orders.marketplaceStatus.useQuery();
  const [form, setForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; status: number; body: string }>>({});

  const testConn = trpc.orders.testConnection.useMutation({
    onSuccess: (r, vars) => setTestResult(s => ({ ...s, [vars.key]: r })),
    onError: (e, vars) =>
      setTestResult(s => ({ ...s, [vars.key]: { ok: false, status: 0, body: e.message } })),
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const save = trpc.settings.save.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      toast.success("Ayarlar kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Fatura başlığında görünecek şirket bilgileri ve pazaryeri bağlantı durumu.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Şirket / Fatura Bilgileri
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={`space-y-1.5 ${f.textarea ? "sm:col-span-2" : ""}`}>
              <Label>{f.label}</Label>
              {f.textarea ? (
                <Textarea
                  rows={2}
                  value={form[f.key] ?? ""}
                  onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  value={form[f.key] ?? ""}
                  onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            Kaydet
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-primary" /> e-Fatura / e-Arşiv Entegratörü
        </h2>
        <p className="text-sm text-muted-foreground">
          e-Arşiv/e-Fatura göndermek için GİB onaylı bir entegratörle (İzibiz, Uyumsoft, Foriba) sözleşme
          ve API bilgisi gerekir. Bilgileri girince siparişlerden "e-Arşiv Gönder" çalışır.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Entegratör</Label>
            <select
              value={form.einvoice_provider ?? ""}
              onChange={e => setForm(s => ({ ...s, einvoice_provider: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— Seçilmedi —</option>
              <option value="izibiz">İzibiz</option>
              <option value="uyumsoft">Uyumsoft</option>
              <option value="foriba">Foriba</option>
              <option value="custom">Diğer (REST)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>API Adresi (Gateway URL)</Label>
            <Input
              value={form.einvoice_api_url ?? ""}
              onChange={e => setForm(s => ({ ...s, einvoice_api_url: e.target.value }))}
              placeholder="https://.../einvoice"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kullanıcı Adı</Label>
            <Input
              value={form.einvoice_username ?? ""}
              onChange={e => setForm(s => ({ ...s, einvoice_username: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Şifre / API Anahtarı</Label>
            <Input
              type="password"
              value={form.einvoice_password ?? ""}
              onChange={e => setForm(s => ({ ...s, einvoice_password: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ortam</Label>
            <select
              value={form.einvoice_test_mode ?? "true"}
              onChange={e => setForm(s => ({ ...s, einvoice_test_mode: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="true">Test</option>
              <option value="false">Canlı (Gerçek fatura)</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            Kaydet
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" /> Pazaryeri Komisyon Oranları
        </h2>
        <p className="text-sm text-muted-foreground">
          Her pazaryerinin ortalama komisyon oranını (%) girin. Satış Analizi'ndeki net kâr raporu,
          bu oranı satış tutarından düşerek pazaryeri bazında net kârı hesaplar.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(mpStatus ?? []).map(m => (
            <div key={m.key} className="space-y-1.5">
              <Label>{m.label} komisyonu (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form[`commission_${m.key}`] ?? ""}
                onChange={e => setForm(s => ({ ...s, [`commission_${m.key}`]: e.target.value }))}
                placeholder="Örn. 15"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            Kaydet
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" /> Pazaryeri Bağlantıları
        </h2>
        <p className="text-sm text-muted-foreground">
          API bilgileri güvenlik için Render panelinden (Environment) girilir, uygulamada saklanmaz.
          Aşağıda hangi pazaryerinin bağlı olduğunu görürsün.
        </p>
        <div className="space-y-3">
          {(mpStatus ?? []).map(m => (
            <div key={m.key} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {m.configured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                )}
                <span className="font-medium">{m.label}</span>
                <span
                  className={`text-xs ml-auto ${m.configured ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {m.configured ? "Bağlı" : "Bağlı değil"}
                </span>
              </div>
              {!m.configured && (
                <p className="text-xs text-muted-foreground mt-2">
                  Render → Environment'a şu değişkenleri ekleyin:{" "}
                  <span className="font-mono">{m.missing.join(", ")}</span>
                </p>
              )}
              {m.configured && (
                <div className="mt-2 space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testConn.isPending}
                    onClick={() => testConn.mutate({ key: m.key })}
                  >
                    Bağlantıyı Test Et
                  </Button>
                  {testResult[m.key] && (
                    <div
                      className={`text-xs rounded-md border p-2 font-mono break-all ${
                        testResult[m.key].ok
                          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                          : "border-rose-500/40 text-rose-700 dark:text-rose-400"
                      }`}
                    >
                      HTTP {testResult[m.key].status} {testResult[m.key].ok ? "✓ Başarılı" : "✗ Hata"}
                      {testResult[m.key].body && (
                        <div className="mt-1 opacity-80">{testResult[m.key].body}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
          <p>
            <b>Trendyol:</b> Satıcı Paneli → Entegrasyon Bilgileri'nden Satıcı ID, API Key ve API
            Secret alınır.
          </p>
          <p>
            <b>Hepsiburada:</b> Merchant paneli → Entegrasyon/OMS bilgilerinden Merchant ID,
            kullanıcı adı ve şifre alınır.
          </p>
        </div>
      </Card>
    </div>
  );
}
