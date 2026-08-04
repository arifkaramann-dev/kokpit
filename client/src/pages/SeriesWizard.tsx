import { Badge } from "@/components/ui/badge";
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
import CatalogAudit from "@/components/CatalogAudit";
import SeriesMatrix from "@/components/SeriesMatrix";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

/**
 * Yeni Seri Sihirbazı — tek akış, görünür aşama.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Satılabilir tek bir ürün çıkarmak için altı ayrı ekrana uğramak gerekiyordu:
 * Tanımlar → Ürün Geliştirme → Reçeteler → Hammadde → Fiyat → Yayın. Sistem
 * önce bütün kombinasyonu üretiyor, sonra "şimdi git altı ekranda bunları
 * gerçek yap" diyordu. Sıra tersti: bir boya yapıldığında elde 72 boş kutu
 * oluyordu ve hangisinin neden satılamadığı ancak katalogda görülüyordu.
 *
 * Sihirbaz mevcut ekranların YERİNE GEÇMEZ, üstlerine biner: aynı uçları
 * çağırır, ama sırayı dayatır ve her adımda ürünün hangi aşamada olduğunu
 * gösterir. Toplu iş hâlâ eski ekranlardan yapılabilir.
 */

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { title: "Seri ve kapsam", desc: "Hangi seri, hangi renkler" },
  { title: "Önizleme", desc: "Ne çıkacağını üretmeden gör" },
  { title: "Üret", desc: "Varyantları oluştur" },
  { title: "Satılabilir yap", desc: "Reçete · maliyet · fiyat" },
] as const;

export default function SeriesWizard() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [step, setStep] = useState<Step>(0);
  const [seriesId, setSeriesId] = useState<string>("");
  /*
   * readiness ARTIK BİR EKSEN DEĞİL.
   *
   * R2U ürünün tipidir ("R2U Boya" ile "Boya" farklı sıvılar, farklı
   * reçeteler), master üzerinde taşınan bir bayrak değil. Bayrak olarak
   * kaldığında her form×ambalaj çiftini ikiye katlıyordu ve katalogdaki
   * 300 varyantın yarısının sebebi buydu. Sabit tek değer geçilir; kolon
   * geriye dönük uyum için şemada durur.
   */
  const readiness: ("konsantre" | "r2u")[] = ["konsantre"];

  const { data: series } = trpc.series.list.useQuery();
  const { data: track } = trpc.katalog.trackList.useQuery();

  const [preview, setPreview] = useState<{
    willCreate: number;
    alreadyExists: number;
    pairs: { familyName: string; packagingName: string }[];
    suspects: { familyName: string; packagingName: string; reason: string }[];
    unconstrainedFamilies: { familyName: string; packagingCount: number }[];
  } | null>(null);

  const generate = trpc.katalog.generateMasters.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setPreview({
          willCreate: r.willCreate,
          alreadyExists: r.alreadyExists,
          pairs: r.pairs ?? [],
          suspects: r.suspects ?? [],
          unconstrainedFamilies: r.unconstrainedFamilies ?? [],
        });
        setStep(1);
        return;
      }
      utils.katalog.invalidate();
      toast.success(`${r.created} varyant oluşturuldu`);
      setStep(3);
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const suggestRules = trpc.katalog.suggestFamilyPackagings.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      if (r.applied) {
        toast.success(`${r.count} form için ambalaj kuralı yazıldı`);
        // Kural değişti: önizlemeyi tazele ki etkisi görünsün.
        generate.mutate({ seriesIds: selectedIds, readiness, dryRun: true });
      }
    },
    onError: e => toast.error(e.message),
  });

  const bind = trpc.katalog.bindFormulas.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(
        `${r.bound} varyant reçeteye bağlandı${r.unmatched > 0 ? ` · ${r.unmatched} hâlâ reçetesiz` : ""}`,
        { duration: 8000 },
      );
    },
    onError: e => toast.error(e.message),
  });

  const selectedIds = seriesId ? [Number(seriesId)] : [];

  /**
   * Seçilen serinin aşama durumu — sihirbazın kalbi.
   *
   * Kullanıcının istediği tam olarak buydu: "her adımda ürünün hangi aşamada
   * olduğunu görebileyim". Sayılar katalogla aynı kaynaktan (trackList)
   * gelir, yani burada gösterilen şey gerçek durumdur, ayrı bir tahmin değil.
   */
  const stage = useMemo(() => {
    const rows = (track?.rows ?? []).filter(
      r => !seriesId || r.seriesId === Number(seriesId),
    );
    const total = rows.length;
    const withRecipe = rows.filter(r => !r.health.missing.includes("Reçete bağlı değil")).length;
    const withCost = rows.filter(r => r.cost > 0).length;
    const withPrice = rows.filter(r => r.price > 0).length;
    const sellable = rows.filter(r => r.listingQty > 0 && r.price > 0).length;
    const live = rows.filter(r => r.health.liveCount > 0).length;
    return { total, withRecipe, withCost, withPrice, sellable, live };
  }, [track, seriesId]);

  const canNext = step === 0 ? selectedIds.length > 0 : true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yeni Seri Sihirbazı</h1>
          <p className="text-sm text-muted-foreground">
            Tanımdan satılabilir ürüne tek akış. Her adımda serinin hangi aşamada olduğu altta
            görünür.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/katalog")}>
          Kataloğa dön
        </Button>
      </div>

      {/* Adım çubuğu */}
      <Card className="flex flex-wrap gap-2 p-3">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => i <= step && setStep(i as Step)}
            disabled={i > step}
            className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
              i === step
                ? "border-primary bg-primary/5"
                : i < step
                  ? "text-muted-foreground hover:bg-accent/40"
                  : "opacity-50"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < step ? "bg-emerald-600 text-white" : "bg-muted"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{s.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{s.desc}</span>
            </span>
          </button>
        ))}
      </Card>

      {/* ── Adım 0: seri ve kapsam ─────────────────────────────────────── */}
      {step === 0 && (
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Seri *</Label>
            <Select value={seriesId} onValueChange={setSeriesId}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Seri seçin" />
              </SelectTrigger>
              <SelectContent>
                {(series ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Serinin renk, form ve ambalaj bağları Tanımlar'dan gelir. Burada yalnız hangi serinin
              üretileceğini seçiyorsunuz.
            </p>
          </div>

        </Card>
      )}

      {/* Seri kurulumu burada, akışın içinde. Ayrı sayfaya gidip geri dönmek
          bu sihirbazın çözmeye çalıştığı sorunun ta kendisiydi. */}
      {step === 0 && seriesId && (
        <SeriesMatrix seriesId={Number(seriesId)} />
      )}

      {/* ── Adım 1: önizleme ───────────────────────────────────────────── */}
      {step === 1 && preview && (
        <div className="space-y-3">
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm">
              <strong className="text-lg">{preview.willCreate}</strong> yeni varyant çıkacak
            </span>
            {preview.alreadyExists > 0 && (
              <Badge variant="secondary">{preview.alreadyExists} zaten var</Badge>
            )}
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {preview.pairs.length} form × ambalaj çifti
            </span>
          </Card>

          {preview.suspects.length > 0 && (
            <Card className="space-y-3 border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="text-sm font-medium">
                  {preview.suspects.length} çift yanlış görünüyor
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Kuralı girilmemiş bir form, serinin <strong>bütün</strong> ambalajlarıyla eşleşir.
                Sprey formu için kural yoksa sprey 30/100/250 ml de üretilir — hiç satılmayacak
                varyantlar katalogu, raporları ve iş listesini kirletir.
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {preview.suspects.slice(0, 30).map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s.familyName} · {s.packagingName}
                    </Badge>
                    <span className="text-muted-foreground">{s.reason}</span>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                disabled={suggestRules.isPending}
                onClick={() => suggestRules.mutate({ apply: true })}
              >
                {suggestRules.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                )}
                Form × ambalaj kuralını otomatik yaz
              </Button>
            </Card>
          )}

          {preview.unconstrainedFamilies.length > 0 && preview.suspects.length === 0 && (
            <Card className="p-4 text-xs text-muted-foreground">
              {preview.unconstrainedFamilies.map(f => f.familyName).join(", ")} formları için ambalaj
              kuralı tanımlı değil — serinin tüm ambalajlarıyla eşleşiyorlar. Şüpheli bir çift
              görünmüyor, sorun yok.
            </Card>
          )}

          {/*
            Kuralı düzeltmek YETMİYOR: generateMasters yalnız üretir, hiç
            silmez. Daha önce kuralsızken açılmış "Rötuş · SPREY 400ML" gibi
            varyantlar yerinde kalır. Temizlik aracı Katalog'un ayrı bir
            sekmesindeydi; kullanıcı kuralı düzeltip geri dönünce hataların
            durduğunu görüp "düzelmedi" diyordu. Araç artık burada.
          */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Kuralı değiştirmek yalnız <strong>bundan sonra</strong> üretilecekleri etkiler. Daha
              önce kuralsızken açılmış varyantlar katalogda durmaya devam eder — aşağıdan
              temizleyin.
            </p>
            <CatalogAudit hideWhenClean />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="p-2 text-left">Form</th>
                    <th className="p-2 text-left">Ambalaj</th>
                    <th className="p-2 text-left">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.pairs.map((p, i) => {
                    const bad = preview.suspects.some(
                      s => s.familyName === p.familyName && s.packagingName === p.packagingName,
                    );
                    return (
                      <tr key={i} className={`border-t ${bad ? "bg-amber-500/10" : ""}`}>
                        <td className="p-2 font-medium">{p.familyName}</td>
                        <td className="p-2">{p.packagingName}</td>
                        <td className="p-2 text-xs">
                          {bad ? (
                            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-500">
                              <CircleAlert className="h-3.5 w-3.5" /> şüpheli
                            </span>
                          ) : (
                            <span className="text-muted-foreground">uygun</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Adım 2: üret ───────────────────────────────────────────────── */}
      {step === 2 && (
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm">
            <strong className="text-lg">{preview?.willCreate ?? 0}</strong> varyant oluşturulacak.
          </p>
          {(preview?.suspects.length ?? 0) > 0 && (
            <p className="text-xs text-amber-600">
              {preview?.suspects.length} şüpheli çift hâlâ duruyor — önce kuralı yazmak isterseniz
              geri dönün.
            </p>
          )}
          <Button
            size="lg"
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate({ seriesIds: selectedIds, readiness, dryRun: false })
            }
          >
            {generate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Varyantları oluştur
          </Button>
        </Card>
      )}

      {/* ── Adım 3: satılabilir yap ────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-3">
          <Card className="space-y-2 p-4">
            <p className="text-sm font-medium">Kalan işler</p>
            <p className="text-xs text-muted-foreground">
              Varyant oluştu ama satılabilir olması için reçetesi, maliyeti ve fiyatı gerekir.
              Aşağıdaki sayılar aşağıdaki durum çubuğuyla aynı kaynaktan gelir.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" disabled={bind.isPending} onClick={() => bind.mutate({ dryRun: false })}>
                {bind.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Reçeteleri otomatik bağla
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/recete")}>
                Reçete yaz
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/katalog?sekme=tanimlar")}>
                Ambalaj maliyeti
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/fiyat")}>
                Fiyat gir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLocation("/katalog")}>
                Katalogda gör
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Aşama çubuğu: her adımda görünür ───────────────────────────── */}
      {seriesId && (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {series?.find(s => String(s.id) === seriesId)?.name} — durum
            </p>
            <Badge variant="secondary">{stage.total} varyant</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            <StageCell label="Reçetesi var" done={stage.withRecipe} total={stage.total} />
            <StageCell label="Maliyeti var" done={stage.withCost} total={stage.total} />
            <StageCell label="Fiyatı var" done={stage.withPrice} total={stage.total} />
            <StageCell label="Satılabilir" done={stage.sellable} total={stage.total} />
            <StageCell label="İlanda canlı" done={stage.live} total={stage.total} />
          </div>
          {stage.total > 0 && stage.sellable === 0 && (
            <p className="text-xs text-amber-600">
              Hiçbir varyant satılabilir değil. En sık sebep: reçete bağlı değil ya da fiyat
              girilmemiş. Satış modunu "tedarikli" yaparsanız hammadde beklemeden ilan açılır.
            </p>
          )}
        </Card>
      )}

      {/* Gezinme */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((step - 1) as Step)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Geri
        </Button>
        {step === 0 && (
          <Button
            disabled={!canNext || generate.isPending}
            onClick={() => generate.mutate({ seriesIds: selectedIds, readiness, dryRun: true })}
          >
            {generate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Ne çıkacağını göster <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 1 && (
          <Button onClick={() => setStep(2)}>
            Devam <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Aşama hücresi — oran ve renk, "kaçı hazır" sorusunun tek bakışta cevabı. */
function StageCell({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const tone =
    total === 0
      ? "text-muted-foreground"
      : pct === 100
        ? "text-emerald-600"
        : pct === 0
          ? "text-destructive"
          : "text-amber-600";
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone}`}>
        {done}/{total}
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={
            pct === 100 ? "h-full bg-emerald-600" : pct === 0 ? "h-full bg-destructive" : "h-full bg-amber-500"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
