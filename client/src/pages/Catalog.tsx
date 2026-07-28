import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Boxes,
  Layers,
  Loader2,
  PackagePlus,
  Play,
  RefreshCw,
  Sparkles,
  Store,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Katalog v3 — Master / Listing mimarisinin kurulum ve izleme ekranı.
 *
 * Üretim adımları bilerek "önce göster, sonra uygula" (dry run) çalışır:
 * seyrek küpün kesişimi yanlış tanımlanırsa binlerce anlamsız kayıt açılır,
 * geri almak açmaktan pahalıdır.
 */
export default function Catalog() {
  const utils = trpc.useUtils();
  const { data: dims, isLoading } = trpc.katalog.dimensions.useQuery();
  const { data: masters } = trpc.katalog.masters.useQuery();
  const { data: listings } = trpc.katalog.listings.useQuery();
  const { data: bottlenecks } = trpc.katalog.bottlenecks.useQuery();
  const { data: series } = trpc.series.list.useQuery();

  const [selectedSeries, setSelectedSeries] = useState<Set<number>>(new Set());
  const [withR2u, setWithR2u] = useState(false);
  const [preview, setPreview] = useState<{ kind: string; willCreate: number; sample: string[] } | null>(
    null,
  );

  const seed = trpc.katalog.seedDimensions.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(
        `Boyutlar hazır — ${r.colors} renk, ${r.families} form, ${r.packagings} ambalaj, ${r.useCases} kullanım alanı, ${r.channels} kanal, ${r.seriesLinks} seri eşlemesi`,
        { duration: 8000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const genMasters = trpc.katalog.generateMasters.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setPreview({ kind: "master", willCreate: r.willCreate, sample: r.sample });
        if (r.willCreate === 0) toast.info("Üretilecek yeni master yok — hepsi zaten var.");
        return;
      }
      setPreview(null);
      utils.katalog.invalidate();
      toast.success(`${r.created} master ürün oluşturuldu`);
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const genListings = trpc.katalog.generateListings.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setPreview({ kind: "listing", willCreate: r.willCreate, sample: r.sample });
        if (r.willCreate === 0) toast.info("Üretilecek yeni ilan yok.");
        return;
      }
      setPreview(null);
      utils.katalog.invalidate();
      toast.success(`${r.created} ilan oluşturuldu`);
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const recompute = trpc.katalog.recomputeCapacity.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      if (r.cycles.length > 0) {
        toast.error(
          `Reçetede döngü var (${r.cycles[0].join(" → ")}) — o zincirin kapasitesi hesaplanamıyor.`,
          { duration: 12000 },
        );
        return;
      }
      toast.success(
        `${r.masters} master hesaplandı · ${r.written} güncellendi · ${r.dirtied} yayın senkron kuyruğuna girdi${
          r.zeroed > 0 ? ` · ${r.zeroed} ürün üretilemiyor` : ""
        }`,
        { duration: 9000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const dimReady = (dims?.colors.length ?? 0) > 0 && (dims?.packagings.length ?? 0) > 0;
  const seriesLinked = new Set((dims?.seriesPackagings ?? []).map(r => r.seriesId));

  function toggleSeries(id: number) {
    setSelectedSeries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ürünler</h1>
        <p className="text-sm text-muted-foreground">
          Master ürün = fiziksel gerçeklik (stok, reçete, kapasite). İlan = aynı ürünün farklı
          pazarlama açısı. Tek şişe, çok ilan — stok bölünmez.
        </p>
      </div>

      {/* Durum şeridi */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Layers className="h-4 w-4" />} label="Boyut" value={`${dims?.colors.length ?? 0} renk · ${dims?.packagings.length ?? 0} ambalaj`} />
        <Stat icon={<Boxes className="h-4 w-4" />} label="Master ürün" value={String(masters?.length ?? 0)} />
        <Stat icon={<Store className="h-4 w-4" />} label="İlan" value={String(listings?.length ?? 0)} />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Üretilemeyen"
          value={String((masters ?? []).filter(m => m.buildableQty <= 0).length)}
        />
      </div>

      {isLoading && <div className="h-32 animate-pulse rounded-xl bg-muted" />}

      {/* 1 — Boyutlar */}
      <Card className="space-y-3 p-5">
        <StepHeader n={1} title="Boyutları tohumla" done={dimReady} />
        <p className="text-sm text-muted-foreground">
          Renk, form, ambalaj ve kullanım alanları şirketin mevcut sözlüğünden kurulur (seriler,
          şablonlar, hammadde kayıtları). Tekrar çalıştırmak zarar vermez — var olana dokunmaz.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => seed.mutate()} disabled={seed.isPending}>
            {seed.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Boyutları Tohumla
          </Button>
          {dimReady && (
            <span className="text-xs text-muted-foreground">
              {dims?.families.length} form · {dims?.useCases.length} kullanım alanı · {dims?.channels.length} kanal
            </span>
          )}
        </div>
      </Card>

      {/* 2 — Master üretimi */}
      <Card className="space-y-3 p-5">
        <StepHeader n={2} title="Master ürünleri üret" done={(masters?.length ?? 0) > 0} />
        <p className="text-sm text-muted-foreground">
          Master'lar seri × renk × form × ambalaj × hazırlık kesişiminden üretilir — kartezyen
          çarpımdan değil. Serinin ambalaj/form uyumluluğu tanımlı değilse o seri atlanır.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(series ?? []).map(s => {
            const linked = seriesLinked.has(s.id);
            const active = selectedSeries.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => linked && toggleSeries(s.id)}
                disabled={!linked}
                title={linked ? "" : "Bu serinin ambalaj/form eşlemesi yok — tohumlamayı çalıştırın"}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : linked
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed border-dashed text-muted-foreground/40"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={withR2u} onCheckedChange={c => setWithR2u(c === true)} />
          Kullanıma hazır (r2u) sürümleri de üret
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={genMasters.isPending || !dimReady}
            onClick={() =>
              genMasters.mutate({
                seriesIds: Array.from(selectedSeries),
                readiness: withR2u ? ["konsantre", "r2u"] : ["konsantre"],
                dryRun: true,
              })
            }
          >
            <Play className="mr-1 h-4 w-4" /> Önce Göster
          </Button>
          {preview?.kind === "master" && preview.willCreate > 0 && (
            <Button
              disabled={genMasters.isPending}
              onClick={() =>
                genMasters.mutate({
                  seriesIds: Array.from(selectedSeries),
                  readiness: withR2u ? ["konsantre", "r2u"] : ["konsantre"],
                  dryRun: false,
                })
              }
            >
              <PackagePlus className="mr-1 h-4 w-4" /> {preview.willCreate} master'ı oluştur
            </Button>
          )}
        </div>
      </Card>

      {/* 3 — İlan üretimi */}
      <Card className="space-y-3 p-5">
        <StepHeader n={3} title="İlanları üret" done={(listings?.length ?? 0) > 0} />
        <p className="text-sm text-muted-foreground">
          Her master için bir jenerik ilan + seçtiğiniz kullanım alanları kadar ilan açılır. Kimlik
          (master + kullanım alanı) olduğu için yeniden üretmek mükerrer kayıt açmaz.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={genListings.isPending || (masters?.length ?? 0) === 0}
            onClick={() => genListings.mutate({ dryRun: true })}
          >
            <Play className="mr-1 h-4 w-4" /> Önce Göster
          </Button>
          {preview?.kind === "listing" && preview.willCreate > 0 && (
            <Button disabled={genListings.isPending} onClick={() => genListings.mutate({ dryRun: false })}>
              <PackagePlus className="mr-1 h-4 w-4" /> {preview.willCreate} ilanı oluştur
            </Button>
          )}
        </div>
      </Card>

      {/* Önizleme */}
      {preview && preview.willCreate > 0 && (
        <Card className="space-y-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">
            {preview.willCreate} {preview.kind === "master" ? "master ürün" : "ilan"} oluşturulacak — ilk
            {" "}
            {preview.sample.length} tanesi:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.sample.map(s => (
              <Badge key={s} variant="secondary" className="font-mono text-[10px]">
                {s}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* 4 — Kapasite */}
      <Card className="space-y-3 p-5">
        <StepHeader n={4} title="Kapasiteyi hesapla" done={(bottlenecks?.length ?? 0) > 0} />
        <p className="text-sm text-muted-foreground">
          Siparişe göre üretimde satılabilir miktar mamul stoğu değil, eldeki hammaddeyle
          üretilebilir adettir. Hesap çok seviyeli reçeteyi çözer: hammadde → yarı mamul → mamul.
          Ambalaj da kısıttır — boya bol olsa da şişe yoksa üretim yapılamaz.
        </p>
        <Button
          variant="outline"
          disabled={recompute.isPending || (masters?.length ?? 0) === 0}
          onClick={() => recompute.mutate({ persist: true })}
        >
          {recompute.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Kapasiteyi Yeniden Hesapla
        </Button>
      </Card>

      {/* Darboğaz raporu */}
      {(bottlenecks?.length ?? 0) > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b p-4">
            <p className="font-semibold">Darboğaz Raporu</p>
            <p className="text-sm text-muted-foreground">
              Hangi kalemi almazsan kaç ürünün önü tıkalı kalıyor. En üsttekiler kapasiteyi tamamen
              sıfırlayanlar — alım önceliği burada.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Kalem</th>
                  <th className="p-2 text-right">Kalan</th>
                  <th className="p-2 text-right">Kısıtladığı ürün</th>
                  <th className="p-2 text-right">Üretilemeyen</th>
                  <th className="p-2 text-right">Birim maliyet</th>
                </tr>
              </thead>
              <tbody>
                {(bottlenecks ?? []).map(b => (
                  <tr key={b.materialId} className="border-t">
                    <td className="p-2 font-medium">{b.materialName}</td>
                    <td className="p-2 text-right tabular-nums">
                      {Number.isFinite(b.available) ? b.available.toLocaleString("tr-TR") : "∞"}
                    </td>
                    <td className="p-2 text-right tabular-nums">{b.blockedMasters}</td>
                    <td className="p-2 text-right">
                      {b.zeroedMasters > 0 ? (
                        <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          {b.zeroedMasters}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatTL(b.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </Card>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-primary/10 text-primary"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <p className="font-semibold">{title}</p>
    </div>
  );
}
