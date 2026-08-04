import AttributeMapping from "@/components/AttributeMapping";
import CategoryMapping from "@/components/CategoryMapping";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AlertTriangle, Check, Loader2, Play, Send, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Toplu Yayın — ilanları kanala açar.
 *
 * Tek tek açmak 500 master × 3 ilan × 2 kanal = 3.000 tıklama demekti.
 * Üretim adımlarındaki gibi "önce göster / sonra uygula": atlananların
 * sebebi önden görünür, toplu işlem ortasında sürprize düşülmez.
 */
/** Hazırlık rozeti: durumu söyler ve eksik adıma götürür. */
function ReadyChip({
  ok,
  label,
  hint,
  onClick,
}: {
  ok: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      }`}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      <span className="font-medium">{label}</span>
      <span className="opacity-70">· {hint}</span>
    </button>
  );
}

/**
 * Gönderim kayıtları — "gitti mi, açıldı mı, neden açılmadı?"
 *
 * Kart gönderimi asenkron: pazaryeri bir parti kimliği veriyor, sonucu
 * dakikalar sonra belli oluyor. Sonuç veritabanına yazılıyordu ama hiçbir
 * ekran göstermiyordu; kullanıcı gönderip sonrasını göremiyordu.
 */
function BatchLog({ marketplace }: { marketplace: string }) {
  const { data, isLoading } = trpc.katalog.marketplaceBatches.useQuery(
    { marketplace: marketplace || undefined, limit: 50 },
    { enabled: marketplace !== "", refetchInterval: 30_000 },
  );

  if (isLoading) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
      </Card>
    );
  }
  if ((data ?? []).length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Henüz gönderim yok. Kart gönderdiğinizde parti buraya düşer ve sonucu
        (açıldı / hata) burada görünür.
      </Card>
    );
  }

  const tone: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    failed: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  };
  const label: Record<string, string> = {
    success: "açıldı",
    failed: "hata",
    pending: "bekliyor",
  };

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Zaman</th>
            <th className="p-2 text-left">Kalem</th>
            <th className="p-2 text-left">Durum</th>
            <th className="p-2 text-left">Sonuç</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map(b => (
            <tr key={b.batchRequestId} className="border-t align-top">
              <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                {new Date(b.createdAt).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="p-2 tabular-nums">{b.items}</td>
              <td className="p-2">
                <Badge className={tone[b.status] ?? ""}>{label[b.status] ?? b.status}</Badge>
              </td>
              <td className="p-2 text-xs">
                {b.errorMessage ? (
                  <span className="text-rose-700 dark:text-rose-300">{b.errorMessage}</span>
                ) : b.status === "pending" ? (
                  <span className="text-muted-foreground">
                    pazaryeri işliyor — sonuç birkaç dakika içinde
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function Publish() {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: categories } = trpc.katalog.channelCategories.useQuery();
  const { data: published } = trpc.katalog.channelListings.useQuery();

  const [channelId, setChannelId] = useState<string>("");
  const [tab, setTab] = useState("yayin");
  const [selectedSeries, setSelectedSeries] = useState<Set<number>>(new Set());
  const [includeUnbuildable, setIncludeUnbuildable] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [preview, setPreview] = useState<{
    willPublish: number;
    skipped: { reason: string; count: number }[];
  } | null>(null);

  const channels = dims?.channels ?? [];
  const useCases = dims?.useCases ?? [];
  const activeChannel = Number(channelId) || channels[0]?.id || 0;
  const activeChannelName = channels.find(c => c.id === activeChannel)?.name ?? "Pazaryeri";
  /*
   * Sıfırdan kart açmayı yalnız Trendyol destekliyor. Ekran eskiden kanal ne
   * olursa olsun "Trendyol'da ürün kartı aç" yazıp Trendyol ucuna gidiyordu:
   * Hepsiburada seçiliyken Trendyol'a kart gönderiliyordu.
   */
  const cardChannelCode = channels.find(c => c.id === activeChannel)?.code ?? "";
  const supportsCardOpen = cardChannelCode === "trendyol";

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
        toast.info(
          `${r.willSend} yeni kart · ${r.willUpdate} güncelleme gönderilecek` +
            (r.problems.length ? ` · ${r.problems.length} sorun` : ""),
          { duration: 9000 },
        );
        return;
      }
      toast.success(
        `${r.sent} kart açıldı · ${r.updated} kart güncellendi` +
          (r.problems.length ? ` · ${r.problems.length} sorun` : ""),
        { duration: 12000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  const publishedCount = (published ?? []).filter(p => p.channelId === activeChannel).length;
  const mappedCount = (categories ?? []).filter(c => c.channelId === activeChannel).length;

  /*
   * Hazırlık şeridi: kart açmayı ne engelliyor, tek bakışta.
   *
   * Sekmeler arasında dolaşıp "acaba özellik eşlemesi tam mı?" diye kontrol
   * etmek gerekiyordu; eksik olan ancak gönderim hatasında görülüyordu.
   */
  const { data: coverage } = trpc.katalog.attributeCoverage.useQuery(
    { channelId: activeChannel },
    { enabled: activeChannel > 0 },
  );
  const missingValues = (coverage ?? []).reduce((s, c) => s + (c.total - c.mapped), 0);
  const categoryReady = mappedCount >= useCases.length && useCases.length > 0;
  const attributesReady = (coverage ?? []).length > 0 && missingValues === 0;

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
          <Select
            value={String(activeChannel)}
            onValueChange={v => {
              // Önceki kanalın önizleme/sorun kutuları yeni kanalda asılı kalmasın.
              setChannelId(v);
              setCardProblems([]);
              setPreview(null);
            }}
          >
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

      {/* Hazırlık şeridi — eksik adıma tıklayarak gidilir. */}
      <div className="flex flex-wrap items-center gap-2">
        <ReadyChip
          ok={categoryReady}
          label={`Kategori ${mappedCount}/${useCases.length}`}
          hint={categoryReady ? "tamam" : "eksik kategori var"}
          onClick={() => setTab("kategori")}
        />
        <ReadyChip
          ok={attributesReady}
          label={
            (coverage ?? []).length === 0
              ? "Özellik çekilmedi"
              : missingValues === 0
                ? "Özellik eşlemesi tamam"
                : `${missingValues} değer eşlenmedi`
          }
          hint={attributesReady ? "tamam" : "kart açmayı engeller"}
          onClick={() => setTab("ozellik")}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="yayin">Yayınla</TabsTrigger>
          <TabsTrigger value="gonder">Pazaryerine Gönder</TabsTrigger>
          <TabsTrigger value="kategori">Kategori Eşlemesi</TabsTrigger>
          <TabsTrigger value="ozellik">Özellik Eşlemesi</TabsTrigger>
          <TabsTrigger value="kayit">Gönderim Kayıtları</TabsTrigger>
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
            <p className="font-semibold">{activeChannelName}&apos;da ürün kartı aç</p>
            <p className="text-sm text-muted-foreground">
              Sıfırdan ilan açar (stok/fiyat güncellemesinden farklı). Aynı ürün ailesinin
              kalemleri tek ilan altında varyant olarak toplanır. Sonuç asenkron gelir.
            </p>
            {!supportsCardOpen ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {activeChannelName} için sıfırdan kart açma henüz yok.
                </p>
                <p className="text-muted-foreground">
                  Bu kanalda ürünleri panelden açın; stok ve fiyat güncellemeleri yukarıdaki
                  gönderimle çalışır. Kart açma yalnız Trendyol&apos;da destekleniyor.
                </p>
              </div>
            ) : (
              <>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeUnbuildable}
                    onCheckedChange={c => setIncludeUnbuildable(c === true)}
                  />
                  Üretilemeyenleri de gönder
                </label>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={updateExisting}
                    onCheckedChange={c => setUpdateExisting(c === true)}
                  />
                  Pazaryerinde olanları güncelle
                  <span className="text-xs text-muted-foreground">
                    — başlık, açıklama, görsel ve özellikleri yeniler
                  </span>
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
                        updateExisting,
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
                        updateExisting,
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
              </>
            )}
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

        <TabsContent value="kayit" className="pt-3">
          <BatchLog marketplace={cardChannelCode} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
