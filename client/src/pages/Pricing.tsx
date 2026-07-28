import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Loader2, Percent, Play, RefreshCw, Send, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * Fiyat & Kâr — v3 maliyetiyle.
 *
 * Eski sürüm `products.costSummary`'yi okuyordu: tek seviyeli, fire ve ambalaj
 * hariç. Ürün kartı ise çok seviyeli motoru kullanıyordu; aynı ürün iki
 * ekranda farklı maliyet gösteriyordu. Artık tek kaynak var.
 */
export default function Pricing() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: rows, isLoading } = trpc.katalog.priceTable.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: syncStatus } = trpc.katalog.syncStatus.useQuery();

  const [search, setSearch] = useState("");
  const [onlyLoss, setOnlyLoss] = useState(false);
  const [percent, setPercent] = useState("10");
  const [bulkSeries, setBulkSeries] = useState<Set<number>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<number | null>(null);

  const bulkPrice = trpc.katalog.bulkPrice.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setBulkPreview(r.affected);
        if (r.affected === 0) toast.info("Fiyatı olan ürün yok.");
        return;
      }
      setBulkPreview(null);
      utils.katalog.invalidate();
      toast.success(`${r.updated} ürünün fiyatı güncellendi — senkron kuyruğuna girdi`);
    },
    onError: e => toast.error(e.message),
  });

  const sync = trpc.katalog.syncAllChannels.useMutation({
    onSuccess: results => {
      utils.katalog.invalidate();
      const sent = results.reduce((s, r) => s + r.sent, 0);
      const failed = results.reduce((s, r) => s + r.failed, 0);
      if (sent === 0 && failed === 0) {
        toast.info("Gönderilecek değişiklik yok ya da kanal yapılandırılmamış.");
        return;
      }
      toast.success(
        `${sent} yayın gönderildi${failed > 0 ? ` · ${failed} hata (sonraki turda yeniden denenecek)` : ""}`,
        { duration: 9000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return (rows ?? []).filter(r => {
      if (onlyLoss && !(r.basePrice > 0 && r.profit <= 0)) return false;
      if (!q) return true;
      return [r.internalSku, r.colorName, r.series, r.packaging]
        .filter(Boolean)
        .some(v => String(v).toLocaleLowerCase("tr").includes(q));
    });
  }, [rows, search, onlyLoss]);

  const zarar = (rows ?? []).filter(r => r.basePrice > 0 && r.profit <= 0).length;
  const fiyatsiz = (rows ?? []).filter(r => r.basePrice <= 0).length;
  const bekleyen = (syncStatus ?? []).reduce((s, c) => s + c.kirli + c.hata, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fiyat &amp; Kâr</h1>
          <p className="text-sm text-muted-foreground">
            Maliyet reçeteden türer — çok seviyeli, fire ve ambalaj dahil. Elle girilen bir sayı
            değil.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={sync.isPending || bekleyen === 0}
          onClick={() => sync.mutate({})}
        >
          {sync.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1 h-4 w-4" />
          )}
          Pazaryerine Gönder{bekleyen > 0 ? ` (${bekleyen})` : ""}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ürün" value={String(rows?.length ?? 0)} />
        <Stat label="Zararına satılan" value={String(zarar)} tone={zarar > 0 ? "bad" : undefined} />
        <Stat label="Fiyatsız" value={String(fiyatsiz)} tone={fiyatsiz > 0 ? "warn" : undefined} />
        <Stat
          label="Gönderim bekleyen"
          value={String(bekleyen)}
          tone={bekleyen > 0 ? "warn" : undefined}
        />
      </div>

      <Tabs defaultValue="tablo">
        <TabsList>
          <TabsTrigger value="tablo">Fiyat Tablosu</TabsTrigger>
          <TabsTrigger value="toplu">Toplu Zam / İndirim</TabsTrigger>
        </TabsList>

        <TabsContent value="tablo" className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Kod, renk, seri, ambalaj ara..."
              className="max-w-sm"
            />
            <Button
              variant={onlyLoss ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyLoss(v => !v)}
            >
              <TrendingDown className="mr-1 h-3.5 w-3.5" /> Sadece zarar edenler
            </Button>
            <span className="text-xs text-muted-foreground">{filtered.length} ürün</span>
          </div>

          {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}

          {!isLoading && filtered.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {(rows?.length ?? 0) === 0
                ? "Henüz master ürün yok — Ürünler sayfasından üretin."
                : "Aramayla eşleşen ürün yok."}
            </Card>
          )}

          {filtered.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Ürün</th>
                      <th className="p-2 text-right">Hammadde</th>
                      <th className="p-2 text-right">Ambalaj</th>
                      <th className="p-2 text-right">Maliyet</th>
                      <th className="p-2 text-right">Fiyat</th>
                      <th className="p-2 text-right">Kâr</th>
                      <th className="p-2 text-right">Marj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr
                        key={r.masterId}
                        className="cursor-pointer border-t hover:bg-accent/40"
                        onClick={() => setLocation(`/urun/${r.masterId}`)}
                      >
                        <td className="p-2">
                          <span className="block truncate font-medium">
                            {r.colorName ?? "—"} · {r.family ?? "—"} · {r.packaging ?? "—"}
                          </span>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {r.internalSku}
                          </span>
                          {r.unknownInputs.length > 0 && (
                            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              Fiyatsız kalem: {r.unknownInputs.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {formatTL(r.materialCost)}
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {formatTL(r.packagingCost)}
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {formatTL(r.cost)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {r.basePrice > 0 ? (
                            formatTL(r.netPrice)
                          ) : (
                            <span className="text-amber-600">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {r.basePrice > 0 ? (
                            <span
                              className={
                                r.profit > 0 ? "text-emerald-600" : "font-semibold text-rose-600"
                              }
                            >
                              {formatTL(r.profit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {r.basePrice > 0 ? (
                            <Badge
                              variant="outline"
                              className={
                                r.marginPercent >= 30
                                  ? "text-emerald-600"
                                  : r.marginPercent > 0
                                    ? "text-amber-600"
                                    : "text-rose-600"
                              }
                            >
                              %{r.marginPercent}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="toplu" className="space-y-3 pt-3">
          <Card className="space-y-3 p-5">
            <p className="text-sm text-muted-foreground">
              Taban fiyatı yüzdeyle değiştirir. Zam için pozitif, indirim için negatif yazın.
              Güncellenen ürünlerin yayınları senkron kuyruğuna girer.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(series ?? []).map(s => (
                <button
                  key={s.id}
                  onClick={() =>
                    setBulkSeries(prev => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    bulkSeries.has(s.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
              {bulkSeries.size === 0 && (
                <span className="self-center text-xs text-muted-foreground">
                  seçim yoksa tüm ürünler
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>Yüzde (%)</Label>
                <Input
                  type="number"
                  value={percent}
                  onChange={e => setPercent(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button
                variant="outline"
                disabled={bulkPrice.isPending}
                onClick={() =>
                  bulkPrice.mutate({
                    percent: parseFloat(percent.replace(",", ".")) || 0,
                    seriesIds: Array.from(bulkSeries),
                    dryRun: true,
                  })
                }
              >
                <Play className="mr-1 h-4 w-4" /> Önce Göster
              </Button>
              {bulkPreview !== null && bulkPreview > 0 && (
                <Button
                  disabled={bulkPrice.isPending}
                  onClick={() =>
                    bulkPrice.mutate({
                      percent: parseFloat(percent.replace(",", ".")) || 0,
                      seriesIds: Array.from(bulkSeries),
                      dryRun: false,
                    })
                  }
                >
                  <Percent className="mr-1 h-4 w-4" /> {bulkPreview} ürüne uygula
                </Button>
              )}
            </div>
          </Card>

          {(syncStatus ?? []).some(c => c.kirli + c.hata > 0) && (
            <Card className="space-y-2 p-4">
              <p className="font-semibold">Senkron kuyruğu</p>
              {(syncStatus ?? [])
                .filter(c => c.kirli + c.hata > 0)
                .map(c => (
                  <div key={c.channelId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{c.name}</span>
                    {c.kirli > 0 && <Badge variant="secondary">{c.kirli} bekliyor</Badge>}
                    {c.hata > 0 && (
                      <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        {c.hata} hata
                      </Badge>
                    )}
                  </div>
                ))}
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={sync.isPending}
                onClick={() => sync.mutate({})}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Şimdi gönder
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "bad";
}) {
  const cls = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${cls}`}>{value}</p>
    </Card>
  );
}
