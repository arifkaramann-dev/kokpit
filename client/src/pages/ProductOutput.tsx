import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  PackagePlus,
  RefreshCw,
  Save,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

// Pazaryeri karakter sınırları (başlık / açıklama).
const LIMITS = {
  tyTitle: 100,
  tyDesc: 2000,
  hbTitle: 80,
  hbDesc: 1500,
};

/** Ürün Çıktısı sayfası: bir geliştirme projesinin üretilen varyantlarını
 * (ambalaj bazlı) düzenlenebilir sekmeler halinde gösterir; pazaryeri metinleri,
 * etiket, kılavuz ve fiyatları elle düzeltip kaydetmeyi sağlar. */
export default function ProductOutput() {
  const [, params] = useRoute("/urun-ciktisi/:id");
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const id = Number(params?.id ?? 0);

  const { data, isLoading } = trpc.dev.get.useQuery({ id }, { enabled: id > 0 });
  const { data: generations } = trpc.dev.generations.useQuery(
    { projectId: id },
    { enabled: id > 0 },
  );
  const utils = trpc.useUtils();

  const project = data?.project;
  const chosen = (data?.trials ?? []).find(t => t.isChosen === 1) ?? null;

  const [active, setActive] = useState<string>("");

  // Varyantları renge göre grupla (1. seviye sekme = renk, 2. seviye = ambalaj).
  const colorGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; hex: string | null; gens: Gen[] }>();
    for (const g of generations ?? []) {
      const key = g.color ?? "__none__";
      if (!map.has(key)) {
        map.set(key, { key, label: g.color ?? "Renksiz", hex: g.colorHex ?? null, gens: [] });
      }
      map.get(key)!.gens.push(g);
    }
    return Array.from(map.values());
  }, [generations]);

  // Aktif varyanttan aktif rengi türet; yoksa ilk grup.
  const activeGen = (generations ?? []).find(g => String(g.id) === active) ?? null;
  const activeColorKey = activeGen ? (activeGen.color ?? "__none__") : (colorGroups[0]?.key ?? "");
  const activeGroup = colorGroups.find(gr => gr.key === activeColorKey) ?? colorGroups[0] ?? null;

  useEffect(() => {
    if (generations && generations.length > 0 && !active) {
      setActive(String(generations[0].id));
    }
  }, [generations, active]);

  // Aktif renk grubu içindeki ilk varyanta geçiş (renk sekmesi değişince).
  function selectColor(key: string) {
    const grp = colorGroups.find(gr => gr.key === key);
    if (grp && grp.gens.length) setActive(String(grp.gens[0].id));
  }

  // ---- AI içerik zenginleştirme (varyant başına, sırayla) ----
  // Yeni üretilen varyantlar status "generating" ile gelir; her biri ayrı bir
  // istekle zenginleştirilir. Böylece tek dev istek yerine küçük istekler olur
  // (timeout/"unexpected token" yaşanmaz) ve hatalar tek varyanta izole kalır.
  const enrichStarted = useRef(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);

  const pendingCount = (generations ?? []).filter(g => g.status === "generating").length;
  const errorCount = (generations ?? []).filter(g => g.status === "error").length;

  async function runEnrichment(ids: number[]) {
    if (ids.length === 0) return;
    setEnrichProgress({ done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await utils.client.dev.enrichVariant.mutate({ generationId: ids[i] });
      } catch {
        failed++;
      }
      setEnrichProgress({ done: i + 1, total: ids.length });
      await utils.dev.generations.invalidate({ projectId: id });
    }
    setEnrichProgress(null);
    if (failed === 0) toast.success("AI metinleri hazır 🎉");
    else toast.warning(`${ids.length - failed} varyant hazır, ${failed} varyant başarısız — 'AI ile Yenile' ile tekrar deneyin.`);
  }

  // İlk yüklemede bekleyen (generating) varyantları otomatik zenginleştir.
  useEffect(() => {
    if (!generations || generations.length === 0 || enrichStarted.current) return;
    const pending = generations.filter(g => g.status === "generating").map(g => g.id);
    if (pending.length === 0) return;
    enrichStarted.current = true;
    void runEnrichment(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations]);

  // Ürünlere aktarım durumu.
  const publishedCount = (generations ?? []).filter(g => g.productId).length;
  const totalCount = generations?.length ?? 0;
  const publishToProducts = trpc.dev.publishToProducts.useMutation({
    onSuccess: r => {
      const parts: string[] = [];
      if (r.created) parts.push(`${r.created} yeni varyant`);
      if (r.updated) parts.push(`${r.updated} güncellendi`);
      toast.success(
        `Ürünlere aktarıldı${parts.length ? " — " + parts.join(", ") : ""} 🎉`,
      );
      utils.dev.generations.invalidate({ projectId: id });
    },
    onError: e => toast.error(e.message),
  });

  async function exportExcel() {
    try {
      const res = await utils.series.exportToExcel.fetch({ projectId: id });
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(res.matrix);
      ws["!cols"] = (res.matrix[0] as string[]).map(h => ({
        wch: Math.min(Math.max(String(h).length + 2, 12), 50),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Varyantlar");
      XLSX.writeFile(
        wb,
        `${project?.autoCode || "urun"}-varyantlar-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("Excel'e aktarıldı");
    } catch {
      toast.error("Excel oluşturulamadı");
    }
  }

  if (isLoading || !project) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Yükleniyor…</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      {/* Üst bar */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setLocation("/gelistirme")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Geliştirmeye Dön
        </Button>
        <Button size="sm" variant="outline" onClick={exportExcel}>
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel'e Aktar
        </Button>
      </div>

      {/* Ürün bilgi kartı */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> {project.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Info label="Ürün Kodu" value={project.autoCode || project.colorCode || "—"} />
          <Info label="Seri" value={project.series || "—"} />
          <Info
            label="Renk"
            value={
              <span className="flex items-center gap-1.5">
                {project.colorHex && (
                  <span
                    className="inline-block h-4 w-4 rounded-full border"
                    style={{ backgroundColor: project.colorHex }}
                  />
                )}
                {project.colorHex || "—"}
              </span>
            }
          />
          <Info
            label="Seçili Reçete"
            value={chosen ? `Deneme #${chosen.trialNo} · ${chosen.items.length} hammadde` : "—"}
          />
          <Info label="Satış Fiyatı" value={formatTL(project.salePrice)} />
          <Info label="Varyant Sayısı" value={String(generations?.length ?? 0)} />
        </CardContent>
      </Card>

      {(!generations || generations.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Henüz varyant üretilmemiş. Geliştirme sayfasında 5. adımdan
            "Varyantları Oluştur" deyin.
          </CardContent>
        </Card>
      )}

      {/* AI içerik durumu bandı */}
      {generations && generations.length > 0 && enrichProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary shrink-0" />
            <div className="flex-1 space-y-1.5">
              <p className="text-sm font-medium">
                AI metinleri hazırlanıyor… {enrichProgress.done}/{enrichProgress.total}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((enrichProgress.done / Math.max(enrichProgress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI hata / yeniden deneme bandı */}
      {generations && generations.length > 0 && !enrichProgress && (errorCount > 0 || pendingCount > 0) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <p className="text-sm">
                {errorCount > 0
                  ? `${errorCount} varyant için AI metni üretilemedi (şablon metin kullanılıyor).`
                  : `${pendingCount} varyant henüz AI ile zenginleştirilmedi.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runEnrichment(
                  (generations ?? [])
                    .filter(g => g.status === "generating" || g.status === "error")
                    .map(g => g.id),
                )
              }
            >
              <RefreshCw className="h-4 w-4 mr-1" /> AI Metinleri Yeniden Üret
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ürünlere aktarım kartı */}
      {generations && generations.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              {publishedCount === totalCount ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
              ) : (
                <PackagePlus className="h-8 w-8 text-primary shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {publishedCount === totalCount
                    ? "Tüm varyantlar ürünlere aktarıldı"
                    : "Varyantları ürünlere aktarın"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {publishedCount > 0
                    ? `${publishedCount}/${totalCount} varyant aktarıldı. `
                    : ""}
                  Varyantlar ayrı ürün değil, <span className="font-medium">"{project.name}"</span> ana ürününün altında tek çatı altında listelenir.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {publishedCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => setLocation("/urunler")}>
                  <Store className="h-4 w-4 mr-1" /> Ürünleri Gör
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => publishToProducts.mutate({ projectId: id })}
                disabled={publishToProducts.isPending}
              >
                <PackagePlus className="h-4 w-4 mr-1" />
                {publishToProducts.isPending
                  ? "Aktarılıyor…"
                  : publishedCount > 0
                    ? "Güncelle / Yenilerini Aktar"
                    : "Ürünlere Aktar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {generations && generations.length > 0 && activeGroup && (
        <div className="space-y-3">
          {/* 1. seviye: Renk sekmeleri */}
          {colorGroups.length > 1 && (
            <Tabs value={activeColorKey} onValueChange={selectColor}>
              <TabsList className="flex-wrap h-auto">
                {colorGroups.map(grp => (
                  <TabsTrigger key={grp.key} value={grp.key} className="gap-1.5">
                    {grp.hex && (
                      <span
                        className="inline-block h-3 w-3 rounded-full border"
                        style={{ backgroundColor: grp.hex }}
                      />
                    )}
                    {grp.label}
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      {grp.gens.length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* 2. seviye: seçili rengin ambalaj sekmeleri */}
          <Tabs value={active} onValueChange={setActive}>
            <TabsList className="flex-wrap h-auto">
              {activeGroup.gens.map(g => (
                <TabsTrigger key={g.id} value={String(g.id)} className="gap-1">
                  <Package className="h-3 w-3" />
                  {g.packaging}
                  {g.status === "generating" && (
                    <Loader2 className="ml-0.5 h-3 w-3 animate-spin text-primary" />
                  )}
                  {g.status === "error" && (
                    <AlertTriangle className="ml-0.5 h-3 w-3 text-amber-500" />
                  )}
                  {g.productId && (
                    <CheckCircle2 className="ml-0.5 h-3 w-3 text-emerald-500" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {activeGroup.gens.map(g => (
              <TabsContent key={g.id} value={String(g.id)}>
                <VariantEditor
                  gen={g}
                  onSaved={() => utils.dev.generations.invalidate({ projectId: id })}
                  onDeleted={async () => {
                    const ok = await confirm({
                      title: "Varyant silinsin mi?",
                      description: `${g.variantCode} · ${g.packaging} çıktısı kalıcı olarak silinecek.`,
                    });
                    if (!ok) return;
                    await utils.client.dev.deleteGeneration.mutate({ id: g.id });
                    toast.success("Varyant silindi");
                    setActive("");
                    utils.dev.generations.invalidate({ projectId: id });
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

type Gen = inferRouterOutputs<AppRouter>["dev"]["generations"][number];

/** Tek bir varyantın düzenleme formu. Alanlar yerel state'te tutulur, Kaydet
 * ile updateGeneration çağrılır. */
function VariantEditor({
  gen,
  onSaved,
  onDeleted,
}: {
  gen: Gen;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [tyTitle, setTyTitle] = useState(gen.trendyolTitle ?? "");
  const [tyDesc, setTyDesc] = useState(gen.trendyolDescription ?? "");
  const [hbTitle, setHbTitle] = useState(gen.hepsiburadaTitle ?? "");
  const [hbDesc, setHbDesc] = useState(gen.hepsiburadaDescription ?? "");
  const [label, setLabel] = useState(gen.labelContent ?? "");
  const [guide, setGuide] = useState(gen.guideContent ?? "");
  const [notes, setNotes] = useState(gen.applicationNotes ?? "");
  const [price, setPrice] = useState(String(parseFloat(String(gen.suggestedPrice)) || 0));

  // Kayıt sonrası prop güncellenince alanları senkronize et.
  useEffect(() => {
    setTyTitle(gen.trendyolTitle ?? "");
    setTyDesc(gen.trendyolDescription ?? "");
    setHbTitle(gen.hepsiburadaTitle ?? "");
    setHbDesc(gen.hepsiburadaDescription ?? "");
    setLabel(gen.labelContent ?? "");
    setGuide(gen.guideContent ?? "");
    setNotes(gen.applicationNotes ?? "");
    setPrice(String(parseFloat(String(gen.suggestedPrice)) || 0));
  }, [gen]);

  const save = trpc.dev.updateGeneration.useMutation({
    onSuccess: () => {
      toast.success("Varyant kaydedildi");
      onSaved();
    },
  });

  const utils = trpc.useUtils();
  const generateImages = trpc.dev.generateVariantImages.useMutation({
    onSuccess: () => {
      toast.success("Görseller üretildi 🎨");
      utils.dev.generations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Bu varyantın AI metnini tek başına yeniden üret.
  const enrichOne = trpc.dev.enrichVariant.useMutation({
    onSuccess: () => {
      toast.success("AI metni güncellendi ✨");
      utils.dev.generations.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const listMut = trpc.dev.updateGeneration.useMutation({
    onSuccess: () => {
      toast.success("Varyant listelendi olarak işaretlendi");
      onSaved();
    },
    onError: e => toast.error(e.message),
  });

  function handleSave() {
    save.mutate({
      id: gen.id,
      data: {
        trendyolTitle: tyTitle,
        trendyolDescription: tyDesc,
        hepsiburadaTitle: hbTitle,
        hepsiburadaDescription: hbDesc,
        labelContent: label,
        guideContent: guide,
        applicationNotes: notes,
        suggestedPrice: parseFloat(price) || 0,
        status: "ready",
      },
    });
  }

  async function copyLabel() {
    try {
      await navigator.clipboard.writeText(label);
      toast.success("Etiket içeriği kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  function downloadLabelTxt() {
    const blob = new Blob([label], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${gen.variantCode}-etiket.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadGuidePdf() {
    // Basit yaklaşım: kılavuzu biçimli bir pencerede açıp yazdır (PDF olarak kaydet).
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Açılır pencere engellendi");
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
      <title>${gen.variantCode} — Kullanım Kılavuzu</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.6;color:#111}
        h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}
        pre{white-space:pre-wrap;font-family:inherit;font-size:14px}
      </style></head><body>
      <h1>${gen.variantCode} — Kullanım Kılavuzu</h1>
      <pre>${guide.replace(/</g, "&lt;")}</pre>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function markListed(channel: string) {
    listMut.mutate({ id: gen.id, data: { status: "listed" } });
    toast.message(`${channel} listeleme akışı başlatıldı`, {
      description:
        "Varyant 'listelendi' olarak işaretlendi. Pazaryeri API bağlantısı ayrıca yapılandırılmalıdır.",
    });
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className="gap-1">
            <Package className="h-3 w-3" /> {gen.variantCode}
          </Badge>
          {gen.color && (
            <Badge variant="outline" className="gap-1">
              {gen.colorHex && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border"
                  style={{ backgroundColor: gen.colorHex }}
                />
              )}
              {gen.color}
            </Badge>
          )}
          <Badge variant="outline">{gen.packaging}</Badge>
          {gen.status === "generating" && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> AI hazırlanıyor
            </Badge>
          )}
          {gen.status === "error" && (
            <Badge className="gap-1 bg-amber-500 hover:bg-amber-500">
              <AlertTriangle className="h-3 w-3" /> AI başarısız — şablon metin
            </Badge>
          )}
          {gen.productId && (
            <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-500">
              <CheckCircle2 className="h-3 w-3" /> Ürüne aktarıldı
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => enrichOne.mutate({ generationId: gen.id })}
            disabled={enrichOne.isPending || gen.status === "generating"}
          >
            {enrichOne.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            AI ile Yenile
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onDeleted}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Sil
          </Button>
        </div>
      </div>

      {/* Trendyol */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trendyol İlanı</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Başlık"
            value={tyTitle}
            onChange={setTyTitle}
            limit={LIMITS.tyTitle}
          />
          <Field
            label="Açıklama"
            value={tyDesc}
            onChange={setTyDesc}
            limit={LIMITS.tyDesc}
            textarea
            rows={5}
          />
        </CardContent>
      </Card>

      {/* Hepsiburada */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hepsiburada İlanı</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Başlık"
            value={hbTitle}
            onChange={setHbTitle}
            limit={LIMITS.hbTitle}
          />
          <Field
            label="Açıklama"
            value={hbDesc}
            onChange={setHbDesc}
            limit={LIMITS.hbDesc}
            textarea
            rows={5}
          />
        </CardContent>
      </Card>

      {/* Etiket */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Etiket İçeriği</CardTitle>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={copyLabel}>
              <Copy className="h-4 w-4 mr-1" /> Kopyala
            </Button>
            <Button size="sm" variant="outline" onClick={downloadLabelTxt}>
              <Download className="h-4 w-4 mr-1" /> .txt İndir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={label}
            onChange={e => setLabel(e.target.value)}
            rows={5}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Kılavuz */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Kullanım Kılavuzu</CardTitle>
          <Button size="sm" variant="outline" onClick={downloadGuidePdf}>
            <FileText className="h-4 w-4 mr-1" /> PDF İndir
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={guide}
            onChange={e => setGuide(e.target.value)}
            rows={6}
          />
        </CardContent>
      </Card>

      {/* Uygulama notları + fiyat */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Uygulama Notları & Fiyat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Uygulama Notları</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Önerilen Fiyat (₺)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maliyet</Label>
              <Input value={formatTL(gen.costPrice)} disabled readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Görseller */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">AI Görseller</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateImages.mutate({ generationId: gen.id })}
            disabled={generateImages.isPending}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {generateImages.isPending ? "Üretiliyor…" : "Görselleri Üret"}
          </Button>
        </CardHeader>
        <CardContent>
          {!gen.beforeAfterImageUrl && !gen.packagingImageUrl && !gen.marketingImageUrl ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Henüz görsel üretilmedi. "Görselleri Üret" butonu ile bu varyant için before/after, ambalaj ve pazarlama görselleri üretebilirsiniz.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {gen.beforeAfterImageUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Before/After</p>
                  <a href={gen.beforeAfterImageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={gen.beforeAfterImageUrl}
                      alt="Before/After"
                      className="rounded-lg border w-full h-auto hover:opacity-90 transition-opacity cursor-pointer"
                    />
                  </a>
                </div>
              )}
              {gen.packagingImageUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Ambalaj</p>
                  <a href={gen.packagingImageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={gen.packagingImageUrl}
                      alt="Ambalaj"
                      className="rounded-lg border w-full h-auto hover:opacity-90 transition-opacity cursor-pointer"
                    />
                  </a>
                </div>
              )}
              {gen.marketingImageUrl && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Pazarlama</p>
                  <a href={gen.marketingImageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={gen.marketingImageUrl}
                      alt="Pazarlama"
                      className="rounded-lg border w-full h-auto hover:opacity-90 transition-opacity cursor-pointer"
                    />
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aksiyon çubuğu */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={save.isPending}>
          <Save className="h-4 w-4 mr-1" />
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Button variant="outline" onClick={() => markListed("Trendyol")}>
          <Store className="h-4 w-4 mr-1" /> Trendyol'a Listele
        </Button>
        <Button variant="outline" onClick={() => markListed("Hepsiburada")}>
          <Store className="h-4 w-4 mr-1" /> Hepsiburada'ya Listele
        </Button>
      </div>
    </div>
  );
}

/** Karakter sayaçlı düzenlenebilir alan. */
function Field({
  label,
  value,
  onChange,
  limit,
  textarea,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  limit: number;
  textarea?: boolean;
  rows?: number;
}) {
  const over = value.length > limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span
          className={`text-xs ${over ? "text-destructive font-medium" : "text-muted-foreground"}`}
        >
          {value.length}/{limit}
        </span>
      </div>
      {textarea ? (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows ?? 4}
        />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}
