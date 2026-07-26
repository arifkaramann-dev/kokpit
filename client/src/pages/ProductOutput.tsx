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
  ArrowLeft,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  Save,
  Store,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  useEffect(() => {
    if (generations && generations.length > 0 && !active) {
      setActive(String(generations[0].id));
    }
  }, [generations, active]);

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

      {generations && generations.length > 0 && (
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="flex-wrap h-auto">
            {generations.map(g => (
              <TabsTrigger key={g.id} value={String(g.id)} className="gap-1">
                {g.colorHex && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border"
                    style={{ backgroundColor: g.colorHex }}
                  />
                )}
                {g.color ? `${g.color} · ` : ""}
                {g.packaging}
                {g.status === "listed" && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    listelendi
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {generations.map(g => (
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={onDeleted}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Sil
        </Button>
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
