import AttributeMapping from "@/components/AttributeMapping";
import CategoryMapping from "@/components/CategoryMapping";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Loader2, Play, Send, Store, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Toplu Yayın — ilanları kanala açar.
 *
 * Tek tek açmak 500 master × 3 ilan × 2 kanal = 3.000 tıklama demekti.
 * Üretim adımlarındaki gibi "önce göster / sonra uygula": atlananların
 * sebebi önden görünür, toplu işlem ortasında sürprize düşülmez.
 */
export default function Publish() {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: categories } = trpc.katalog.channelCategories.useQuery();
  const { data: published } = trpc.katalog.channelListings.useQuery();

  const [channelId, setChannelId] = useState<string>("");
  const [selectedSeries, setSelectedSeries] = useState<Set<number>>(new Set());
  const [includeUnbuildable, setIncludeUnbuildable] = useState(false);
  const [preview, setPreview] = useState<{
    willPublish: number;
    skipped: { reason: string; count: number }[];
  } | null>(null);

  const channels = dims?.channels ?? [];
  const useCases = dims?.useCases ?? [];
  const activeChannel = Number(channelId) || channels[0]?.id || 0;

  const bulk = trpc.katalog.bulkPublish.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setPreview({ willPublish: r.willPublish, skipped: r.skipped });
        if (r.willPublish === 0) toast.info("Yayınlanacak ilan yok — sebepler aşağıda.");
        return;
      }
      setPreview(null);
      utils.katalog.invalidate();
      toast.success(`${r.published} ilan kanala açıldı — senkron kuyruğuna girdi`, { duration: 8000 });
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const { data: status } = trpc.katalog.syncStatus.useQuery();
  const [cardProblems, setCardProblems] = useState<string[]>([]);

  const syncNow = trpc.katalog.syncChannel.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      if (r.error) return toast.error(r.error, { duration: 9000 });
      toast.success(
        `${r.sent} yayın gönderildi` +
          (r.failed > 0 ? ` · ${r.failed} hata` : "") +
          (r.skipped > 0 ? ` · ${r.skipped} atlandı` : ""),
        { duration: 9000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const pushCards = trpc.katalog.pushCardsToTrendyol.useMutation({
    onSuccess: r => {
      setCardProblems(r.problems);
      utils.katalog.invalidate();
      if (r.dryRun) {
        toast.info(`${r.willSend} kart gönderilecek${r.problems.length ? ` · ${r.problems.length} sorun` : ""}`, {
          duration: 9000,
        });
        return;
      }
      toast.success(
        `${r.sent} kart gönderildi${r.batchRequestId ? ` (parti: ${r.batchRequestId})` : ""}`,
        { duration: 12000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  const publishedCount = (published ?? []).filter(p => p.channelId === activeChannel).length;
  const mappedCount = (categories ?? []).filter(c => c.channelId === activeChannel).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Toplu Yayın</h1>
        <p className="text-sm text-muted-foreground">
          İlanları pazaryeri kanallarına toplu açar. Pazaryeri kodu ve barkodu burada bir kez
          üretilip saklanır — sonradan yeniden hesaplanmaz.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Kanal</Label>
          <Select value={String(activeChannel)} onValueChange={setChannelId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Kanal seçin" />
            </SelectTrigger>
            <SelectContent>
              {channels.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="pb-2 text-xs text-muted-foreground">
          {publishedCount} yayında · {mappedCount}/{useCases.length} kullanım alanı eşlenmiş
        </span>
      </div>

      <Tabs defaultValue="yayin">
        <TabsList>
          <TabsTrigger value="yayin">Yayınla</TabsTrigger>
          <TabsTrigger value="gonder">Pazaryerine Gönder</TabsTrigger>
          <TabsTrigger value="kategori">Kategori Eşlemesi</TabsTrigger>
          <TabsTrigger value="ozellik">Özellik Eşlemesi</TabsTrigger>
        </TabsList>

        <TabsContent value="yayin" className="space-y-3 pt-3">
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap gap-1.5">
              {(series ?? []).map(s => (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelectedSeries(prev => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedSeries.has(s.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
              {selectedSeries.size === 0 && (
                <span className="self-center text-xs text-muted-foreground">
                  seçim yoksa tüm seriler
                </span>
              )}
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={includeUnbuildable}
                onCheckedChange={c => setIncludeUnbuildable(c === true)}
              />
              Üretilemeyen ürünlerin ilanını da aç
              <span className="text-xs text-muted-foreground">
                — stok 0 gider, pazaryeri sıralamasına zarar verebilir
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={bulk.isPending || !activeChannel}
                onClick={() =>
                  bulk.mutate({
                    channelId: activeChannel,
                    seriesIds: Array.from(selectedSeries),
                    includeUnbuildable,
                    dryRun: true,
                  })
                }
              >
                <Play className="mr-1 h-4 w-4" /> Önce Göster
              </Button>
              {preview && preview.willPublish > 0 && (
                <Button
                  disabled={bulk.isPending}
                  onClick={() =>
                    bulk.mutate({
                      channelId: activeChannel,
                      seriesIds: Array.from(selectedSeries),
                      includeUnbuildable,
                      dryRun: false,
                    })
                  }
                >
                  {bulk.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  {preview.willPublish} ilanı yayına al
                </Button>
              )}
            </div>
          </Card>

          {preview && (
            <Card className="space-y-3 p-4">
              <p className="font-semibold">
                {preview.willPublish} ilan yayına alınacak
                {preview.skipped.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {preview.skipped.reduce((s, x) => s + x.count, 0)} atlandı
                  </span>
                )}
              </p>
              {preview.skipped.length > 0 && (
                <div className="space-y-1">
                  {preview.skipped.map(s => (
                    <div key={s.reason} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="tabular-nums">
                        {s.count}
                      </Badge>
                      <span className="text-muted-foreground">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* Gönderim: stok/fiyat senkronu ve sıfırdan ürün kartı açma */}
        <TabsContent value="gonder" className="space-y-3 pt-3">
          <Card className="space-y-3 p-5">
            <p className="font-semibold">Stok &amp; fiyat gönderimi</p>
            <p className="text-sm text-muted-foreground">
              Kapasite veya fiyat değişen yayınlar kuyruğa girer. Zamanlayıcı 30 dakikada bir
              boşaltır; buradan elle de tetikleyebilirsiniz. Hata alan satır kuyrukta kalır ve
              yeniden denenir.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={syncNow.isPending || !activeChannel}
                onClick={() => syncNow.mutate({ channelId: activeChannel, dryRun: true })}
              >
                <Play className="mr-1 h-4 w-4" /> Önce Göster
              </Button>
              <Button
                disabled={syncNow.isPending || !activeChannel}
                onClick={() => syncNow.mutate({ channelId: activeChannel, dryRun: false })}
              >
                {syncNow.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Şimdi Gönder
              </Button>
              {(status ?? [])
                .filter(s => s.channelId === activeChannel && s.kirli + s.hata > 0)
                .map(s => (
                  <span key={s.channelId} className="flex items-center gap-1.5 text-xs">
                    {s.kirli > 0 && <Badge variant="secondary">{s.kirli} bekliyor</Badge>}
                    {s.hata > 0 && (
                      <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        {s.hata} hata
                      </Badge>
                    )}
                  </span>
                ))}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <p className="font-semibold">Trendyol&apos;da ürün kartı aç</p>
            <p className="text-sm text-muted-foreground">
              Sıfırdan ilan açar (stok/fiyat güncellemesinden farklı). Aynı ürün ailesinin
              kalemleri tek ilan altında varyant olarak toplanır. Sonuç asenkron gelir.
            </p>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={includeUnbuildable}
                onCheckedChange={c => setIncludeUnbuildable(c === true)}
              />
              Üretilemeyenleri de gönder
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pushCards.isPending || !activeChannel}
                onClick={() =>
                  pushCards.mutate({
                    channelId: activeChannel,
                    seriesIds: Array.from(selectedSeries),
                    includeUnbuildable,
                    dryRun: true,
                  })
                }
              >
                <Play className="mr-1 h-4 w-4" /> Önce Göster
              </Button>
              <Button
                disabled={pushCards.isPending || !activeChannel}
                onClick={() =>
                  pushCards.mutate({
                    channelId: activeChannel,
                    seriesIds: Array.from(selectedSeries),
                    includeUnbuildable,
                    dryRun: false,
                  })
                }
              >
                {pushCards.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-4 w-4" />
                )}
                Kartları Gönder
              </Button>
            </div>
            {cardProblems.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {cardProblems.length} kalem gönderilemedi:
                </p>
                {cardProblems.slice(0, 8).map((p, i) => (
                  <p key={i} className="text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="kategori" className="pt-3">
          <CategoryMapping
            channelId={activeChannel}
            channelName={channels.find(c => c.id === activeChannel)?.name ?? ""}
            useCases={useCases}
            categories={categories ?? []}
          />
        </TabsContent>

        <TabsContent value="ozellik" className="pt-3">
          <AttributeMapping channelId={activeChannel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
