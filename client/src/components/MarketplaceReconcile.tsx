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
import { trpc } from "@/lib/trpc";
import { Download, Link2, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Pazaryeri ↔ Kokpit ürün mutabakatı.
 *
 * "Trendyol'daki ürünleri sisteme çekebilir miyim, güncelleyebilir miyim?"
 * sorusunun ekrandaki cevabı. Güncelleme yalnız iki tarafta da kaydı olan
 * ürün için mümkün; bu ekran hangilerinin öyle olduğunu ve kalanların neden
 * olmadığını gösterir.
 *
 * Bağlama otomatik YAPILMAZ: yanlış bağlanan ürün, sonraki güncellemede başka
 * bir ürünün başlığını ve görselini ezer. Stok kodu tutan adaylar önerilir,
 * kararı kullanıcı verir.
 */
/**
 * Pazaryeri ürününden Kokpit ürünü üretme.
 *
 * Kataloğumuz küp (seri × renk × ambalaj × form); pazaryeri kaydı yalnız
 * başlık taşıyor. Renk/ambalaj/form başlıktan çözülür, SERİ başlıkta genelde
 * geçmediği için parti başına burada seçilir — uydurmak yerine sormak doğru.
 *
 * Çözülemeyen ürün oluşturulmaz: eksik eksen, ürünün küpte yanlış yerde
 * doğması ve kapasite/reçete bağlarının tutmaması demek.
 */
function ImportPanel({ channelId, onDone }: { channelId: number; onDone: () => void }) {
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const [seriesId, setSeriesId] = useState("");
  const [useCaseId, setUseCaseId] = useState("");

  const runImport = trpc.katalog.importFromMarketplace.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        toast.info(
          `${r.readyCount} ürün oluşturulabilir` +
            (r.blockedCount > 0 ? ` · ${r.blockedCount} tanesi çözülemedi` : ""),
          { duration: 10000 },
        );
        return;
      }
      toast.success(
        `${r.created} ürün Kokpit'e eklendi` +
          (r.createdDefinitions ? ` · ${r.createdDefinitions} yeni tanım` : ""),
        { duration: 10000 },
      );
      if (r.failures?.length) {
        toast.error(`${r.failures.length} kalem yazılamadı: ${r.failures[0]}`, { duration: 12000 });
      }
      onDone();
    },
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  const ready = runImport.data?.dryRun ? runImport.data.ready : [];
  const blocked = runImport.data?.blocked ?? [];
  const missingDefs = runImport.data?.missingDefinitions ?? [];
  const canRun = seriesId !== "" && useCaseId !== "";
  const [createDefs, setCreateDefs] = useState(false);

  const axisLabel: Record<string, string> = {
    renk: "Renk",
    ambalaj: "Ambalaj",
    form: "Form",
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-medium">Pazaryeri ürünlerinden Kokpit ürünü oluştur</p>
      <p className="text-xs text-muted-foreground">
        Renk, ambalaj ve form önce ürünün pazaryerindeki <em>kendi özelliklerinden</em> okunur,
        bulunamazsa ürün adından çözülür. Tanımlar&apos;da karşılığı olmayan değerler aşağıda
        listelenir ve istenirse eklenir. Seri ürün adında geçmediği için burada seçilir.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Seri</Label>
          <Select value={seriesId} onValueChange={setSeriesId}>
            <SelectTrigger className="h-9 w-48 text-xs">
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
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kullanım alanı</Label>
          <Select value={useCaseId} onValueChange={setUseCaseId}>
            <SelectTrigger className="h-9 w-48 text-xs">
              <SelectValue placeholder="Kullanım alanı seçin" />
            </SelectTrigger>
            <SelectContent>
              {(dims?.useCases ?? []).map(u => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="h-9"
          disabled={!canRun || runImport.isPending}
          onClick={() =>
            runImport.mutate({
              channelId,
              seriesId: Number(seriesId),
              useCaseId: Number(useCaseId),
              dryRun: true,
            })
          }
        >
          {runImport.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          Önce Göster
        </Button>
        {(ready.length > 0 || (createDefs && missingDefs.length > 0)) && (
          <Button
            className="h-9"
            disabled={runImport.isPending}
            onClick={() =>
              runImport.mutate({
                channelId,
                seriesId: Number(seriesId),
                useCaseId: Number(useCaseId),
                createMissingDefinitions: createDefs,
                dryRun: false,
              })
            }
          >
            {ready.length > 0 ? `${ready.length} ürünü oluştur` : "Tanımları ekle ve oluştur"}
          </Button>
        )}
      </div>

      {ready.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
          {ready.map(r => (
            <div key={r.candidate.barcode} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="max-w-72 truncate">{r.candidate.title}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {r.colorName} · {r.packagingName} · {r.familyName}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pazaryerinden okunan ama bizde tanımı olmayan değerler. */}
      {missingDefs.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-medium">
            Pazaryerinde olup Tanımlar&apos;da olmayan {missingDefs.length} değer
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingDefs.map(d => (
              <Badge key={`${d.axis}-${d.name}`} variant="outline">
                {axisLabel[d.axis] ?? d.axis}: {d.name}
                {d.count > 1 && <span className="ml-1 opacity-60">×{d.count}</span>}
              </Badge>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs">
            <Checkbox checked={createDefs} onCheckedChange={c => setCreateDefs(c === true)} />
            Bu tanımları Kokpit&apos;e ekle
            <span className="text-muted-foreground">
              — eklenince bu ürünler de oluşturulabilir hâle gelir
            </span>
          </label>
        </div>
      )}

      {blocked.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {blocked.length} ürün çözülemedi — eksik boyutu Tanımlar&apos;dan ekleyin
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {blocked.slice(0, 20).map(b => (
              <div key={b.candidate.barcode} className="flex flex-wrap items-center gap-2">
                <span className="max-w-72 truncate">{b.candidate.title}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  eksik: {b.missing.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function MarketplaceReconcile({
  channelId,
  channelCode,
}: {
  channelId: number;
  channelCode: string;
}) {
  const utils = trpc.useUtils();
  const [ran, setRan] = useState(false);

  const reconcile = trpc.katalog.reconcileMarketplace.useMutation({
    onSuccess: () => setRan(true),
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  const link = trpc.katalog.linkMarketplaceProduct.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Ürün bağlandı — bundan sonraki gönderimler bu ürünü günceller", {
        duration: 9000,
      });
      reconcile.mutate({ channelId });
    },
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  if (channelCode !== "trendyol") {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Ürün listesi çekme şimdilik yalnız Trendyol için var.
      </Card>
    );
  }

  const data = reconcile.data;

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-5">
        <p className="font-semibold">Pazaryerindeki ürünleri karşılaştır</p>
        <p className="text-sm text-muted-foreground">
          Trendyol&apos;daki ürün listesi çekilip Kokpit ile karşılaştırılır. Bir ürünü
          güncelleyebilmek için iki tarafta da kaydı olması gerekir; eşleşme barkod üzerinden
          kurulur.
        </p>
        <div>
          <Button
            disabled={reconcile.isPending || !channelId}
            onClick={() => reconcile.mutate({ channelId })}
          >
            {reconcile.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Pazaryerinden Çek ve Karşılaştır
          </Button>
        </div>

        {data && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="secondary">{data.summary.matched} eşleşti · güncellenebilir</Badge>
            <Badge variant={data.summary.onlyRemote > 0 ? "destructive" : "outline"}>
              {data.summary.onlyRemote} yalnız pazaryerinde
            </Badge>
            <Badge variant="outline">{data.summary.onlyLocal} yalnız Kokpit&apos;te</Badge>
            {data.summary.linkable > 0 && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {data.summary.linkable} tanesi stok koduyla bağlanabilir
              </Badge>
            )}
          </div>
        )}
      </Card>

      {ran && data && data.summary.onlyRemote > 0 && (
        <ImportPanel channelId={channelId} onDone={() => reconcile.mutate({ channelId })} />
      )}

      {ran && data && data.onlyRemote.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">Yalnız pazaryerinde ({data.onlyRemote.length})</p>
          <p className="text-xs text-muted-foreground">
            Bu ürünlerin Kokpit&apos;te karşılığı yok, bu yüzden güncellenemiyorlar. Stok kodu
            tutan bir ilan bulunduysa tek tıkla bağlayabilirsiniz — bağlantı sonrası
            güncellemeler o ürüne gider.
          </p>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Pazaryeri ürünü</th>
                  <th className="p-2 text-left">Barkod</th>
                  <th className="p-2 text-left">Durum</th>
                  <th className="p-2 text-left">Kokpit karşılığı</th>
                </tr>
              </thead>
              <tbody>
                {data.onlyRemote.map(row => (
                  <tr key={row.remote.barcode} className="border-t align-top">
                    <td className="p-2">
                      <div className="max-w-72 truncate">{row.remote.title}</div>
                      {row.remote.stockCode && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.remote.stockCode}
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">{row.remote.barcode}</td>
                    <td className="p-2">
                      <Badge variant={row.remote.approved ? "secondary" : "outline"}>
                        {row.remote.approved ? "onaylı" : "onay bekliyor"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {row.skuCandidate ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="max-w-52 truncate text-xs">
                            {row.skuCandidate.title}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={link.isPending}
                            onClick={() =>
                              link.mutate({
                                channelListingId: row.skuCandidate!.channelListingId,
                                barcode: row.remote.barcode,
                              })
                            }
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                            Bağla
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          eşleşen ilan yok — Kokpit&apos;te ürünü oluşturup barkodunu bu
                          barkoda çevirin
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {ran && data && data.onlyLocal.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">Yalnız Kokpit&apos;te ({data.onlyLocal.length})</p>
          <p className="text-xs text-muted-foreground">
            Bunlar pazaryerinde yok — &quot;Kartları Gönder&quot; ile açılabilir.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {data.onlyLocal.map(l => (
              <div key={l.channelListingId} className="flex items-center gap-2 text-xs">
                <span className="max-w-96 truncate">{l.title}</span>
                <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                  {l.barcode || "barkodsuz"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {ran && data && data.summary.onlyRemote === 0 && data.summary.onlyLocal === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          İki taraf birebir örtüşüyor — tüm ürünler eşleşmiş durumda.
        </Card>
      )}
    </div>
  );
}
