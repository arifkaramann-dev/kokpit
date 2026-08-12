import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";
import { downscaleToDataUrl } from "@/lib/renkStudyo";
import { trpc } from "@/lib/trpc";
import { packagingImageUrl } from "@shared/color/packagingImage";
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Bir ambalajın ÜRÜN ÇEKİMLERİ — Tanımlar → Ambalajlar satırından açılır.
 *
 * ── Neden seri kırılımı ───────────────────────────────────────────────────
 * Aynı kutu her seride aynı görünmüyor: 400 ml sprey VIVID'de bir etiketle,
 * METEOR'da başka etiketle basılıyor. Serisiz çekim tüm serilerin
 * varsayılanı; bir seriye özel çekim yüklenirse o seride o geçerli olur.
 *
 * Renk Stüdyosu şablonları bu çekimleri kullanıyor — eskiden koda gömülü
 * altı dosyaydı, yeni ambalaj eklendiğinde kutu ya eksik çiziliyordu ya
 * yanlış hattın kutusu basılıyordu.
 */
export default function PackagingImages({
  packagingId,
  packagingName,
}: {
  packagingId: number;
  packagingName: string;
}) {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: series } = trpc.series.list.useQuery();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: images, isLoading } = trpc.katalog.packagingImages.useQuery();
  const [busySeries, setBusySeries] = useState<number | null | undefined>(undefined);

  const save = trpc.katalog.savePackagingImage.useMutation({
    onSuccess: () => {
      toast.success("Çekim kaydedildi");
      void utils.katalog.packagingImages.invalidate();
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
    onSettled: () => setBusySeries(undefined),
  });

  const remove = trpc.katalog.deletePackagingImage.useMutation({
    onSuccess: () => {
      toast.success("Silindi");
      void utils.katalog.packagingImages.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const mine = (images ?? []).filter(i => i.packagingId === packagingId);

  // Bu ambalaj hangi serilerde kullanılıyor? Bağ tanımlıysa yalnız onları
  // göster: 20 serilik bir listede kullanıcıyı gezdirmek yerine, gerçekten bu
  // kutunun basıldığı serileri sunmak doğru olan.
  const linked = new Set(
    (dims?.seriesPackagings ?? [])
      .filter(sp => sp.packagingId === packagingId)
      .map(sp => sp.seriesId),
  );
  const seriesRows = (series ?? []).filter(s => (linked.size ? linked.has(s.id) : true));

  const rows: Array<{ seriesId: number | null; label: string; hint?: string }> = [
    { seriesId: null, label: "Tüm seriler", hint: "varsayılan çekim" },
    ...seriesRows.map(s => ({ seriesId: s.id as number, label: s.name })),
  ];

  const upload = async (seriesId: number | null, file: File) => {
    setBusySeries(seriesId);
    try {
      // Saydam PNG geldiyse saydamlık korunuyor: fonu silinmiş bir şişe
      // JPEG'e çevrilince kutunun arkasında beyaz bir dikdörtgen kalıyor ve
      // renkli zeminli şablonlarda o dikdörtgen görünüyor.
      const alpha = file.type === "image/png";
      const data = await downscaleToDataUrl(file, alpha ? 900 : 1200, 0.9, { alpha });
      await save.mutateAsync({ packagingId, seriesId, data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel okunamadı");
      setBusySeries(undefined);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{packagingName}</strong> çekimleri. Renk Stüdyosu
        pazarlama görsellerinde bu kutuyu basıyor. Serisiz çekim tüm serilerde geçerli; bir
        seriye özel çekim yüklersen o seride bu kullanılır. Fonu silinmiş PNG en iyi sonucu
        verir.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Yükleniyor…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const img = mine.find(i => (i.seriesId ?? null) === row.seriesId);
            const uploading = save.isPending && busySeries === row.seriesId;
            return (
              <PackagingImageRow
                key={row.seriesId ?? "default"}
                label={row.label}
                hint={row.hint}
                /** Adres güncelleme zamanıyla: aynı kimliğe yeni görsel yazılınca
                    tarayıcı önbellekteki eski kareyi göstermesin. */
                src={img ? `${packagingImageUrl(img.id)}?v=${new Date(img.updatedAt).getTime()}` : null}
                uploading={uploading}
                onPick={file => void upload(row.seriesId, file)}
                onDelete={
                  img
                    ? async () => {
                        if (
                          await confirm({
                            title: "Çekimi sil",
                            description: `"${row.label}" için yüklenen ambalaj görseli silinsin mi?`,
                            confirmText: "Sil",
                            destructive: true,
                          })
                        )
                          remove.mutate({ id: img.id });
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PackagingImageRow({
  label,
  hint,
  src,
  uploading,
  onPick,
  onDelete,
}: {
  label: string;
  hint?: string;
  src: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onDelete?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 rounded border p-2">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
        {src ? (
          <img src={src} alt={label} className="size-full object-contain" />
        ) : (
          <ImageOff className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {hint ? `${hint} · ` : ""}
          {src ? "çekim yüklü" : "çekim yok"}
        </div>
      </div>
      {!src && !hint && <Badge variant="secondary">varsayılanı kullanır</Badge>}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? (
          <Loader2 className="mr-1 size-4 animate-spin" />
        ) : (
          <Upload className="mr-1 size-4" />
        )}
        {src ? "Değiştir" : "Yükle"}
      </Button>
      {onDelete && (
        <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
