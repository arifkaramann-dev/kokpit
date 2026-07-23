import { HbTestPanel } from "@/components/HbTestPanel";
import { MarketplaceCredentials } from "@/components/MarketplaceCredentials";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { deriveUnitLaborOverhead } from "@shared/pricing";
import { Activity, AlertCircle, Building2, Calculator, CheckCircle2, DatabaseZap, Store } from "lucide-react";
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
  { key: "devCommissionPercent", label: "Varsayılan Komisyon/Ödeme (%)", placeholder: "Örn. 3.9 (PAYTR)" },
  { key: "invoiceNote", label: "Fatura Alt Notu", placeholder: "Teşekkür / iade koşulları vb.", textarea: true },
];

/** Maliyet parametreleri (patron rakamları 21.07.2026 varsayılan gelir). */
const COST_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "laborHourlyRate", label: "İşçilik Saat Ücreti (₺/saat)", placeholder: "150" },
  { key: "monthlyOverhead", label: "Aylık Genel Gider (₺)", placeholder: "15000" },
  { key: "monthlyAvgProduction", label: "Aylık Ortalama Üretim (adet)", placeholder: "150" },
  { key: "laborMinutesPerUnit", label: "Adet Başı İşçilik (dakika)", placeholder: "0 (bilinmiyorsa boş)" },
  { key: "unitLaborOverhead", label: "Elle Değer (₺/adet — boş = otomatik)", placeholder: "Boş bırak: otomatik hesaplanır" },
];

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: intStatus } = trpc.settings.integrationStatus.useQuery();
  const [form, setForm] = useState<Record<string, string>>({});

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

  // Trendyol ürün açma keşif araçları (Faz C): marka ID + kategori özellikleri.
  const [brandQuery, setBrandQuery] = useState("");
  const [categoryIdQuery, setCategoryIdQuery] = useState("");
  const [discovery, setDiscovery] = useState<unknown>(null);
  const brandSearch = trpc.products.trendyolBrandSearch.useMutation({
    onSuccess: r => setDiscovery(r),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const catAttrs = trpc.products.trendyolCategoryAttributes.useMutation({
    onSuccess: r => setDiscovery(r),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // ÜRÜN KAYIT Excel verilerini tek tuşla yükleme (Shell gerektirmez).
  const [importResult, setImportResult] = useState<{
    series: number;
    materials: number;
    templates: number;
    products: number;
  } | null>(null);
  const logoutAll = trpc.auth.logoutAll.useMutation({
    onSuccess: () => {
      toast.success("Tüm oturumlar kapatıldı");
      setTimeout(() => window.location.reload(), 600);
    },
    onError: e => toast.error(e.message),
  });

  const importSeed = trpc.settings.importUrunKayit.useMutation({
    onSuccess: r => {
      setImportResult(r);
      utils.invalidate();
      toast.success("İçe aktarma tamamlandı");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const field = (f: (typeof FIELDS)[number]) => (
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
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Pazaryeri bağlantıları, şirket/fatura bilgileri, maliyet parametreleri ve sistem araçları.
        </p>
      </div>

      <Tabs defaultValue="marketplaces" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="marketplaces">
            <Store className="h-4 w-4 mr-1.5" /> Pazaryerleri
          </TabsTrigger>
          <TabsTrigger value="company">
            <Building2 className="h-4 w-4 mr-1.5" /> Şirket / Fatura
          </TabsTrigger>
          <TabsTrigger value="cost">
            <Calculator className="h-4 w-4 mr-1.5" /> Maliyet
          </TabsTrigger>
          <TabsTrigger value="system">
            <Activity className="h-4 w-4 mr-1.5" /> Sistem
          </TabsTrigger>
        </TabsList>

        {/* ───────────────── PAZARYERLERİ ───────────────── */}
        <TabsContent value="marketplaces" className="space-y-4 mt-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" /> Pazaryeri Bağlantıları
            </h2>
            <MarketplaceCredentials />
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" /> Trendyol Ürün Açma (varyant gruplu)
            </h2>
            <p className="text-sm text-muted-foreground">
              Ürün detay sayfasındaki "Trendyol'da Ürün Aç" butonu bu ayarları kullanır. Aynı ana
              ürünün türevleri ortak <span className="font-mono text-xs">productMainId</span> ile tek
              ilan (varyant seçicili) olarak gönderilir. Marka ID ve kategori ID'lerini aşağıdaki
              keşif araçlarıyla bulabilirsiniz.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Trendyol Marka ID</Label>
                <Input
                  value={form.trendyolBrandId ?? ""}
                  onChange={e => setForm(s => ({ ...s, trendyolBrandId: e.target.value }))}
                  placeholder="Örn. 123456"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Anlaşmalı Kargo ID</Label>
                <Input
                  value={form.trendyolCargoCompanyId ?? ""}
                  onChange={e => setForm(s => ({ ...s, trendyolCargoCompanyId: e.target.value }))}
                  placeholder="Örn. 17 (TEX), 10 (MNG)..."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Site Adresi (görsel linkleri için)</Label>
                <Input
                  value={form.publicBaseUrl ?? ""}
                  onChange={e => setForm(s => ({ ...s, publicBaseUrl: e.target.value }))}
                  placeholder="https://artofcolour-kokpit.onrender.com"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Kategori Eşlemesi (JSON: üründeki kategori adı → Trendyol categoryId)</Label>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  value={form.trendyolCategoryMap ?? ""}
                  onChange={e => setForm(s => ({ ...s, trendyolCategoryMap: e.target.value }))}
                  placeholder='{"Boya": 1234, "Sprey": 5678}'
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Özellik Varsayılanları (JSON: categoryId → zorunlu özellik listesi, opsiyonel)</Label>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  value={form.trendyolAttributeDefaults ?? ""}
                  onChange={e => setForm(s => ({ ...s, trendyolAttributeDefaults: e.target.value }))}
                  placeholder='{"1234": [{"attributeId": 338, "attributeValueId": 6980}]}'
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  className="w-40"
                  value={brandQuery}
                  onChange={e => setBrandQuery(e.target.value)}
                  placeholder="Marka adı ara..."
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={brandSearch.isPending || brandQuery.trim().length < 2}
                  onClick={() => brandSearch.mutate({ name: brandQuery.trim() })}
                >
                  Marka ID Bul
                </Button>
                <Input
                  className="w-36"
                  value={categoryIdQuery}
                  onChange={e => setCategoryIdQuery(e.target.value)}
                  placeholder="Kategori ID"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={catAttrs.isPending || !parseInt(categoryIdQuery, 10)}
                  onClick={() => catAttrs.mutate({ categoryId: parseInt(categoryIdQuery, 10) })}
                >
                  Kategori Özelliklerini Getir
                </Button>
              </div>
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Kaydet
              </Button>
            </div>
            {discovery !== null && (
              <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-2 text-[11px]">
                {JSON.stringify(discovery, null, 2)}
              </pre>
            )}
            <p className="text-xs text-muted-foreground">
              Keşif araçları canlı Trendyol API'sine bağlanır — yalnızca canlı ortamda (Render)
              çalışır.
            </p>
          </Card>
        </TabsContent>

        {/* ───────────────── ŞİRKET / FATURA ───────────────── */}
        <TabsContent value="company" className="space-y-4 mt-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Şirket / Fatura Bilgileri
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{FIELDS.map(field)}</div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Kaydet
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ───────────────── MALİYET ───────────────── */}
        <TabsContent value="cost" className="space-y-4 mt-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" /> Maliyet Parametreleri (işçilik + genel
              gider)
            </h2>
            <p className="text-sm text-muted-foreground">
              Net kârın GERÇEK olması için hammaddeye ek olarak adet başına genel gider payı düşülür:
              aylık genel gider ÷ aylık ortalama adet (+ işçilik dakikası × saat ücreti). Fiyat &amp;
              Kâr Motoru, Maliyet ve Kanal Kârlılığı hesapları bu değeri otomatik kullanır.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {COST_FIELDS.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Input
                    value={form[f.key] ?? ""}
                    onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>
            {(() => {
              const d = deriveUnitLaborOverhead(form);
              return (
                <p className="text-sm rounded-md border border-emerald-500/40 p-2.5">
                  Hesaba katılan pay: <b>{d.value.toFixed(2)} ₺/adet</b>{" "}
                  {d.source === "manual" ? (
                    <span className="text-muted-foreground">(elle girilen değer)</span>
                  ) : (
                    <span className="text-muted-foreground">
                      (otomatik: genel gider {d.overheadShare.toFixed(2)} ₺
                      {d.laborShare > 0 ? ` + işçilik ${d.laborShare.toFixed(2)} ₺` : ""})
                    </span>
                  )}
                </p>
              );
            })()}
            <div className="flex justify-end">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Kaydet
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ───────────────── SİSTEM ───────────────── */}
        <TabsContent value="system" className="space-y-4 mt-4">
          {/* Bağlantı Durumu: tüm entegrasyonlar + zamanlayıcı tek bakışta. */}
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Bağlantı Durumu
            </h2>
            {(() => {
              const s = intStatus?.scheduler;
              const ageMin = s && s.lastTickAt > 0 ? Math.round((Date.now() - s.lastTickAt) / 60000) : null;
              const stale = s && !s.disabled && (ageMin === null || ageMin > 30);
              return (
                <p
                  className={`text-sm rounded-md border p-2.5 ${
                    s?.disabled
                      ? "text-muted-foreground"
                      : stale
                        ? "border-rose-500/40 text-rose-700 dark:text-rose-400"
                        : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {s?.disabled
                    ? "Zamanlayıcı bilinçli kapalı (SCHEDULER_DISABLED=1)."
                    : stale
                      ? `Zamanlayıcı ${ageMin === null ? "hiç iz bırakmamış" : `${ageMin} dk'dır sessiz`} — Render uyumuş olabilir. cron-job.org'dan /api/health adresine 10 dakikada bir istek atan ücretsiz bir monitör kurun.`
                      : `Zamanlayıcı çalışıyor (son iz ${ageMin} dk önce). Oto-senkron, nöbetçiler ve brifing aktif.`}
                </p>
              );
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(intStatus?.integrations ?? []).map(i => (
                <div key={i.key} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                  {i.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span className="font-medium">{i.label}</span>
                  <span className={`ml-auto text-xs ${i.ok ? "text-emerald-600" : "text-amber-600"}`} title={i.hint}>
                    {i.ok ? "Bağlı" : "Eksik"}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pazaryeri API bilgilerini "Pazaryerleri" sekmesinden girebilir; diğer entegrasyonlar
              (AI, e-Fatura, kargo, PayTR) Render → Environment'tan tanımlanır.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-primary" /> ÜRÜN KAYIT Verilerini İçe Aktar
            </h2>
            <p className="text-sm text-muted-foreground">
              Excel'den taşınan başlangıç verilerini yükler: 9 ürün serisi (açıklama metinleri ve kâr
              oranlarıyla), hammadde/ambalaj fiyat listesi, renk-özellik-tür listeleri ve örnek
              ürünler. Tekrar basmak güvenlidir — var olan kayıtlara dokunmaz, yalnızca eksikleri
              ekler.
            </p>
            {importResult && (
              <p className="text-sm font-medium text-emerald-600">
                Eklendi → seri: {importResult.series}, hammadde: {importResult.materials}, şablon:{" "}
                {importResult.templates}, ürün: {importResult.products}
                {importResult.series + importResult.materials + importResult.templates + importResult.products === 0 &&
                  " (her şey zaten yüklüymüş)"}
              </p>
            )}
            <Button onClick={() => importSeed.mutate()} disabled={importSeed.isPending}>
              {importSeed.isPending ? "Aktarılıyor..." : "Verileri İçe Aktar"}
            </Button>
          </Card>

          <HbTestPanel />

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" /> Güvenlik
            </h2>
            <p className="text-sm text-muted-foreground">
              Oturumlar 30 gün geçerlidir. Telefon/bilgisayar kaybolduysa veya şifrenin sızdığından
              şüpheleniyorsan aşağıdaki buton TÜM cihazlardaki oturumları anında geçersiz kılar (bu
              cihaz dahil — yeniden giriş yaparsın).
            </p>
            <Button variant="destructive" disabled={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
              {logoutAll.isPending ? "Kapatılıyor..." : "Tüm Oturumları Kapat"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
