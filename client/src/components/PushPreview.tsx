import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Image, Loader2, Pencil, Tag, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type PushItem = {
  mode: string;
  barcode: string;
  stockCode: string;
  title: string;
  description: string;
  listPrice: number;
  salePrice: number;
  imageCount: number;
  attributeCount: number;
  categoryId: number | null;
  listingId: number | null;
  channelListingId: number | null;
};

/**
 * Gönderim önizlemesi — pazaryerine ne gideceği, gitmeden önce.
 *
 * Önizleme bir bildirimdi: "1 yeni kart · 0 güncelleme gönderilecek". Ne
 * gideceğini söylemiyordu; başlık, açıklama ve fiyat ancak pazaryerine
 * düştükten sonra görülüyordu ve yanlışsa ürün yayına yanlış çıkıyordu.
 * Düzeltmek için de ilan ekranını ayrıca açmak gerekiyordu.
 *
 * Burada her kalem açılıp düzeltilebilir. Düzeltme o ilana özeldir: içerik
 * bloğunu değiştirmek aynı bloğu paylaşan bütün ilanları etkilerdi.
 */
export default function PushPreview({
  items,
  problems,
  sending,
  onSend,
  onRefresh,
}: {
  items: PushItem[];
  problems: string[];
  sending: boolean;
  onSend: () => void;
  onRefresh: () => void;
}) {
  const yeni = items.filter(i => i.mode === "yeni").length;
  const guncelleme = items.filter(i => i.mode === "guncelleme").length;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Gönderilecekler</p>
        <Badge variant="secondary">{yeni} yeni kart</Badge>
        <Badge variant="outline">{guncelleme} güncelleme</Badge>
        <Button className="ml-auto" disabled={sending || items.length === 0} onClick={onSend}>
          {sending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-1 h-4 w-4" />
          )}
          {items.length} kalemi gönder
        </Button>
      </div>

      {problems.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {problems.length} uyarı
          </p>
          {problems.slice(0, 8).map((p, i) => (
            <p key={i} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Gönderilecek kalem yok — yukarıdaki uyarılar sebebini söylüyor.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <PushRow key={item.barcode || item.stockCode} item={item} onSaved={onRefresh} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Tek kalem: özet satır, açılınca düzeltme alanları. */
function PushRow({ item, onSaved }: { item: PushItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(String(item.salePrice ?? 0));

  const dirty =
    title !== item.title ||
    description !== item.description ||
    Number(price) !== Number(item.salePrice);

  const save = trpc.katalog.saveListingForPush.useMutation({
    onSuccess: () => {
      toast.success("Kaydedildi — önizleme yenileniyor");
      onSaved();
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  /*
   * Görselsiz ya da özelliksiz kalem pazaryerinde reddedilir. Gönderdikten
   * sonra hata okumaktansa burada görmek daha ucuz.
   */
  const warnings: string[] = [];
  if (item.imageCount === 0) warnings.push("görsel yok");
  if (item.attributeCount === 0) warnings.push("özellik yok");
  if (!item.categoryId) warnings.push("kategori yok");
  if (Number(item.salePrice) <= 0) warnings.push("fiyat 0");

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-muted/40"
      >
        <Badge variant={item.mode === "yeni" ? "secondary" : "outline"} className="shrink-0">
          {item.mode === "yeni" ? "yeni" : "güncelleme"}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {Number(price).toLocaleString("tr-TR")} ₺
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Image className="h-3 w-3" aria-hidden />
            {item.imageCount}
          </span>
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3" aria-hidden />
            {item.attributeCount}
          </span>
        </span>
        {warnings.length > 0 && (
          <Badge className="shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {warnings.join(" · ")}
          </Badge>
        )}
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label className="text-xs">Başlık</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} className="text-sm" />
            </div>
            <div className="w-36 space-y-1.5">
              <Label className="text-xs">Satış fiyatı (₺)</Label>
              <Input
                value={price}
                onChange={e => setPrice(e.target.value)}
                inputMode="decimal"
                className="text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Açıklama (HTML)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="font-mono">barkod: {item.barcode || "—"}</span>
            <span className="font-mono">stok kodu: {item.stockCode || "—"}</span>
            <span className="font-mono">kategori: {item.categoryId ?? "—"}</span>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!dirty || save.isPending || !item.listingId}
              onClick={() =>
                save.mutate({
                  listingId: item.listingId!,
                  channelListingId: item.channelListingId ?? undefined,
                  title,
                  longDescription: description,
                  price: Number(price) || 0,
                })
              }
            >
              {save.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Kaydet
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTitle(item.title);
                  setDescription(item.description);
                  setPrice(String(item.salePrice ?? 0));
                }}
              >
                Geri al
              </Button>
            )}
            {!item.listingId && (
              <span className="self-center text-xs text-muted-foreground">
                bu kalem bir ilana bağlı değil — düzenlenemiyor
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
