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
import { Check, Download, Link2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Pazaryeri ↔ Kokpit ürün mutabakatı ve içe aktarma.
 *
 * Ekran önce iki ayrı adımdı: karşılaştırma metin listeleri üretiyor, ürün
 * oluşturmak için ayrı bir panel açıp İKİNCİ bir önizleme çalıştırmak
 * gerekiyordu. Ortada yalnız yazı görünüyor, "pazaryerindeki ürün nasıl ürün
 * olacak" sorusunun cevabı hiçbir yerde yazmıyordu.
 *
 * Artık tek tablo: her pazaryeri ürünü bir satır; satırda ya "şu olacak:
 * renk · ambalaj · form" ya da "şu eksik" yazıyor, düğmesi de yanında.
 *
 * Oluşturma ve bağlama otomatik YAPILMAZ: yanlış bağlanan ürün sonraki
 * güncellemede başka bir ürünün başlığını ezer, koordinatı yanlış çözülen
 * ürün küpte yanlış yerde doğar.
 */
export default function MarketplaceReconcile({
  channelId,
  channelCode,
}: {
  channelId: number;
  channelCode: string;
}) {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();

  const [seriesId, setSeriesId] = useState("");
  const [useCaseId, setUseCaseId] = useState("");
  const [createDefs, setCreateDefs] = useState(false);

  const reconcile = trpc.katalog.reconcileMarketplace.useMutation({
    onError: e => toast.error(e.message, { duration: 12000 }),
  });
  const refresh = () => reconcile.mutate({ channelId });

  const link = trpc.katalog.linkMarketplaceProduct.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Bağlandı — bundan sonraki gönderimler bu ürünü günceller", { duration: 9000 });
      refresh();
    },
    onError: e => toast.error(e.message, { duration: 12000 }),
  });

  const runImport = trpc.katalog.importFromMarketplace.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(
        `${r.created} ürün Kokpit'e eklendi` +
          (r.createdDefinitions ? ` · ${r.createdDefinitions} yeni tanım` : ""),
        { duration: 10000 },
      );
      if (r.failures?.length) {
        toast.error(`${r.failures.length} kalem yazılamadı: ${r.failures[0]}`, { duration: 12000 });
      }
      refresh();
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
  const canCreate = seriesId !== "" && useCaseId !== "";
  const busy = reconcile.isPending || runImport.isPending || link.isPending;

  const create = (barcodes: string[]) =>
    runImport.mutate({
      channelId,
      seriesId: Number(seriesId),
      useCaseId: Number(useCaseId),
      barcodes,
      createMissingDefinitions: createDefs,
      dryRun: false,
    });

  const axisLabel: Record<string, string> = { renk: "Renk", ambalaj: "Ambalaj", form: "Form" };

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-5">
        <p className="font-semibold">Pazaryerindeki ürünler</p>
        <p className="text-sm text-muted-foreground">
          Trendyol&apos;daki ürünler çekilip Kokpit ile barkod üzerinden karşılaştırılır.
          Kokpit&apos;te karşılığı olmayanlar buradan ürün olarak oluşturulabilir — renk, ambalaj
          ve form ürünün pazaryerindeki özelliklerinden okunur.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Seri</Label>
            <Select value={seriesId} onValueChange={setSeriesId}>
              <SelectTrigger className="h-9 w-44 text-xs">
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
              <SelectTrigger className="h-9 w-44 text-xs">
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
          <Button className="h-9" disabled={busy || !channelId} onClick={refresh}>
            {reconcile.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1 h-4 w-4" />
            )}
            Pazaryerinden Çek
          </Button>
        </div>

        {!canCreate && (
          <p className="text-xs text-muted-foreground">
            Ürün oluşturabilmek için seri ve kullanım alanı seçin — ikisi ürün adında geçmediği
            için tahmin edilmiyor.
          </p>
        )}

        {data && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary">{data.summary.matched} eşleşti</Badge>
            <Badge variant={data.summary.onlyRemote > 0 ? "destructive" : "outline"}>
              {data.summary.onlyRemote} Kokpit&apos;te yok
            </Badge>
            <Badge variant="outline">{data.summary.onlyLocal} yalnız Kokpit&apos;te</Badge>
            {data.summary.creatable > 0 && canCreate && (
              <Button size="sm" className="ml-auto h-8" disabled={busy} onClick={() => create([])}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {data.summary.creatable} ürünü toplu oluştur
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Pazaryerinden okunan ama Tanımlar'da olmayan değerler. */}
      {data && data.missingDefinitions.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">
            Tanımlar&apos;da olmayan {data.missingDefinitions.length} değer
          </p>
          <p className="text-xs text-muted-foreground">
            Bu değerler pazaryerinde var, Kokpit&apos;te yok. Eklenmeden o ürünler oluşturulamıyor.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.missingDefinitions.map(d => (
              <Badge key={`${d.axis}-${d.name}`} variant="outline">
                {axisLabel[d.axis] ?? d.axis}: {d.name}
                {d.count > 1 && <span className="ml-1 opacity-60">×{d.count}</span>}
              </Badge>
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs">
            <Checkbox checked={createDefs} onCheckedChange={c => setCreateDefs(c === true)} />
            Oluştururken bu tanımları da ekle
          </label>
        </Card>
      )}

      {data && data.onlyRemote.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b p-3">
            <p className="text-sm font-medium">
              Kokpit&apos;te karşılığı olmayanlar ({data.onlyRemote.length})
            </p>
            <p className="text-xs text-muted-foreground">
              Her satır ne olacağını söylüyor: koordinatı çözülenler oluşturulabilir, çözülemeyenin
              eksiği yazıyor.
            </p>
          </div>
          <div className="max-h-[32rem] overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="p-2 text-left">Pazaryeri ürünü</th>
                  <th className="p-2 text-left">Kokpit&apos;te ne olacak</th>
                  <th className="p-2 text-left">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.onlyRemote.map(row => {
                  const ready = row.missing.length === 0;
                  return (
                    <tr key={row.remote.barcode} className="border-t align-top">
                      <td className="p-2">
                        <div className="max-w-80 truncate">{row.remote.title}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.remote.barcode}
                          {row.remote.stockCode ? ` · ${row.remote.stockCode}` : ""}
                        </div>
                      </td>
                      <td className="p-2">
                        {ready ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span>
                              {row.colorName} · {row.packagingName} · {row.familyName}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            çözülemedi — eksik: {row.missing.join(", ")}
                            {row.suggested.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                (pazaryerinde:{" "}
                                {row.suggested
                                  .map(s => `${axisLabel[s.axis] ?? s.axis} ${s.name}`)
                                  .join(", ")}
                                )
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {ready && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={busy || !canCreate}
                              title={canCreate ? undefined : "Önce seri ve kullanım alanı seçin"}
                              onClick={() => create([row.remote.barcode])}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Ürün oluştur
                            </Button>
                          )}
                          {row.skuCandidate && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              disabled={busy}
                              onClick={() =>
                                link.mutate({
                                  channelListingId: row.skuCandidate!.channelListingId,
                                  barcode: row.remote.barcode,
                                })
                              }
                            >
                              <Link2 className="mr-1 h-3.5 w-3.5" />
                              Mevcut ilana bağla
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && data.onlyLocal.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-medium">Yalnız Kokpit&apos;te ({data.onlyLocal.length})</p>
          <p className="text-xs text-muted-foreground">
            Pazaryerinde yok — &quot;Pazaryerine Gönder&quot; sekmesinden kart açılabilir.
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

      {data && data.summary.onlyRemote === 0 && data.summary.onlyLocal === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          İki taraf birebir örtüşüyor — tüm ürünler eşleşmiş durumda.
        </Card>
      )}
    </div>
  );
}
