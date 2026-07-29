import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Eksik görsel iş listesi — RENGE göre.
 *
 * Pazaryeri kartı görselsiz açılamaz; bugüne kadar bu, kart açmanın önündeki
 * tek fiziksel engeldi. Liste ürün ürün değil renk renk verilir: bir rengin
 * 30/100/250/500 ml'si aynı fotoğrafı kullanır, tek yükleme dördünü birden
 * kapatır.
 */
export default function MissingImages() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.katalog.missingImages.useQuery();

  const assign = trpc.katalog.assignImageToColor.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(`${r.added} ürüne eklendi${r.skipped > 0 ? ` · ${r.skipped} zaten vardı` : ""}`);
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-muted-foreground">
        Görseli olmayan ürün pazaryerinde açılamaz. Liste{" "}
        <strong className="text-foreground">renk bazında</strong> verilir — bir yükleme o rengin
        tüm ambalajlarına gider.
      </Card>

      {groups.length === 0 ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Bütün ürünlerin görseli var.
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data?.totalMasters} ürün · {groups.length} renk
          </p>
          <div className="space-y-2">
            {groups.map(g => (
              <ColorRow
                key={`${g.seriesId}-${g.colorId}`}
                group={g}
                busy={assign.isPending}
                onAssign={payload =>
                  assign.mutate({ colorId: g.colorId, seriesId: g.seriesId, ...payload })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ColorRow({
  group,
  busy,
  onAssign,
}: {
  group: {
    colorId: number;
    seriesId: number;
    colorName: string;
    hex: string | null;
    seriesName: string;
    count: number;
  };
  busy: boolean;
  onAssign: (payload: { url?: string; data?: string }) => void;
}) {
  const [url, setUrl] = useState("");

  return (
    <Card className="flex flex-wrap items-end gap-3 p-3">
      <div className="flex min-w-48 items-center gap-2">
        <span
          className="h-8 w-8 shrink-0 rounded border shadow-inner"
          style={{ backgroundColor: group.hex ?? "#ccc" }}
        />
        <div className="min-w-0">
          <div className="truncate font-medium">{group.colorName}</div>
          <div className="text-[11px] text-muted-foreground">{group.seriesName}</div>
        </div>
        <Badge variant="secondary">{group.count}</Badge>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Dosya</Label>
        <Input
          type="file"
          accept="image/*"
          disabled={busy}
          className="h-8 w-52 text-xs"
          onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              onAssign({ data: await readAsDataUrl(file) });
            } catch {
              toast.error("Dosya okunamadı");
            }
          }}
        />
      </div>

      <div className="min-w-48 flex-1 space-y-1.5">
        <Label className="text-xs">ya da adres</Label>
        <Input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…/urun.jpg"
          className="h-8 text-xs"
        />
      </div>

      <Button
        size="sm"
        className="h-8"
        disabled={!url.trim() || busy}
        onClick={() => {
          onAssign({ url: url.trim() });
          setUrl("");
        }}
      >
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1 h-3.5 w-3.5" />}
        Ata
      </Button>
    </Card>
  );
}

/** Dosyayı data URL'e çevirir — sunucuya base64 olarak gider. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("okunamadı"));
    reader.readAsDataURL(file);
  });
}
