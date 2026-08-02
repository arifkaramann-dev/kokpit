import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Katalog denetimi ve temizliği.
 *
 * Uyumluluk kuralları sonradan sıkılaştı: form × ambalaj kısıtı, seri × renk
 * bağı, pasif boyut. Kural değişince ÖNCE üretilmiş master'lar yerinde
 * kalıyordu — "Sprey · 100 ml" gibi hiç var olmayan bir ürün katalogda
 * duruyor, listeyi ve raporları kirletiyordu.
 *
 * Geçmişi olan (ilanı ya da satışı bulunan) master SİLİNMEZ, arşivlenir:
 * silmek ciro raporunu ve pazaryeri eşleşmesini koparırdı.
 */
export default function CatalogAudit({ hideWhenClean = false }: { hideWhenClean?: boolean } = {}) {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data, isLoading } = trpc.katalog.auditMasters.useQuery();

  const cleanup = trpc.katalog.cleanupMasters.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      if (r.dryRun) return;
      toast.success(`${r.deleted} ürün silindi · ${r.archived} ürün arşivlendi`, {
        duration: 9000,
      });
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  if (isLoading) return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
  if (!data) return null;

  if (data.invalid === 0) {
    /*
     * Sihirbaz içinde "Katalog temiz" yeşil onayı YANILTICI olur: bu denetim
     * yalnız seri/form/ambalaj bağlarını bilir, ürün TİPİ modelini bilmez.
     * Kurallar hiç girilmemişken her kayıt kuralları "geçer" ve ekran her şey
     * yolundaymış gibi görünür — oysa katalog eski modelde durmaktadır.
     */
    if (hideWhenClean) return null;
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        Katalog temiz — {data.total} ürünün hepsi bugünkü uyumluluk kurallarına uyuyor.
      </Card>
    );
  }

  return (
    <Card className="space-y-3 border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="text-sm font-medium">
          {data.invalid} ürün bugünkü kurallara uymuyor
        </span>
        <Badge variant="outline">{data.total} toplam</Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Bu ürünler kurallar sıkılaşmadan önce üretilmiş. Örneğin sprey formu artık yalnız sprey
        ambalajıyla eşleşiyor; "Sprey · 100 ml" gibi kalemler geçersiz kaldı.
      </p>

      <div className="space-y-1">
        {data.byReason.map(r => (
          <div key={r.reason} className="flex items-center gap-2 text-xs">
            <Badge variant="secondary" className="shrink-0">
              {r.count}
            </Badge>
            <span>{r.reason}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 text-sm">
        <span>
          <strong>{data.deletable}</strong> ürün silinecek (ilanı/satışı yok)
        </span>
        {data.archivable > 0 && (
          <span className="text-muted-foreground">
            · <strong>{data.archivable}</strong> ürün arşivlenecek (geçmişi var, silinmez)
          </span>
        )}
      </div>

      {data.sample.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Örnek kalemler ({data.sample.length})
          </summary>
          <div className="mt-2 space-y-1">
            {data.sample.map(v => (
              <div key={v.masterId} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{v.internalSku}</span>
                <span className="text-muted-foreground">{v.reasons.join(" · ")}</span>
                {v.hasHistory && <Badge variant="outline">geçmişi var</Badge>}
              </div>
            ))}
          </div>
        </details>
      )}

      <Button
        variant="destructive"
        disabled={cleanup.isPending}
        onClick={async () => {
          const ok = await confirm({
            title: "Geçersiz ürünler temizlensin mi?",
            description: `${data.deletable} ürün silinecek, ${data.archivable} ürün arşivlenecek. Geçmişi olan ürünler silinmez. Bu işlem geri alınamaz.`,
            confirmText: "Temizle",
          });
          if (!ok) return;
          cleanup.mutate({ dryRun: false });
        }}
      >
        {cleanup.isPending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="mr-1 h-4 w-4" />
        )}
        Geçersizleri temizle
      </Button>
    </Card>
  );
}
