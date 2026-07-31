import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ImagePlus, Loader2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Eksik görsel iş listesi — RENGE göre.
 *
 * Pazaryeri kartı görselsiz açılamaz; kart açmanın önündeki tek fiziksel
 * engel bu. Liste ürün ürün değil renk renk verilir: bir rengin 30/100/250/500
 * ml'si aynı fotoğrafı kullanır, tek yükleme hepsini birden kapatır.
 *
 * Düzen: her renk TEK SATIR. Önceki hali her rengi ayrı karta yayıyor,
 * dosya ve adres alanlarını alt alta diziyordu; 15 renk ekrana sığmıyordu.
 */
export default function MissingImages() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.katalog.missingImages.useQuery();
  const [search, setSearch] = useState("");
  const [busyColor, setBusyColor] = useState<number | null>(null);

  const assign = trpc.katalog.assignImageToColor.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(`${r.added} ürüne eklendi${r.skipped > 0 ? ` · ${r.skipped} zaten vardı` : ""}`);
    },
    onError: e => toast.error(e.message),
    onSettled: () => setBusyColor(null),
  });

  const groups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const rows = data?.groups ?? [];
    if (!q) return rows;
    return rows.filter(g =>
      `${g.colorName} ${g.seriesName}`.toLocaleLowerCase("tr").includes(q),
    );
  }, [data, search]);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if ((data?.groups.length ?? 0) === 0) {
    return (
      <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Bütün ürünlerin görseli var.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-64 flex-1 text-sm text-muted-foreground">
          Görseli olmayan ürün pazaryerinde açılamaz. Liste{" "}
          <strong className="text-foreground">renk bazında</strong> — bir yükleme o rengin tüm
          ambalajlarına gider.
        </div>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Renk ya da seri ara…"
          className="w-56"
        />
        <Badge variant="secondary">
          {data?.totalMasters} ürün · {data?.groups.length} renk
        </Badge>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Renk</th>
                <th className="p-2 text-left">Seri</th>
                <th className="p-2 text-right">Ürün</th>
                <th className="p-2 text-left">Görsel ata</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <ColorRow
                  key={`${g.seriesId}-${g.colorId}`}
                  group={g}
                  busy={busyColor === g.colorId}
                  onAssign={payload => {
                    setBusyColor(g.colorId);
                    assign.mutate({ colorId: g.colorId, seriesId: g.seriesId, ...payload });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {groups.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Aramayla eşleşen renk yok.
        </Card>
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
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <tr className="border-t">
      <td className="p-2">
        <span className="flex items-center gap-2">
          <span
            className="h-6 w-6 shrink-0 rounded border shadow-inner"
            style={{ backgroundColor: group.hex ?? "#ccc" }}
          />
          <span className="font-medium">{group.colorName}</span>
        </span>
      </td>
      <td className="p-2 text-muted-foreground">{group.seriesName}</td>
      <td className="p-2 text-right">
        <Badge variant="secondary">{group.count}</Badge>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1.5">
          {/* Dosya girişi gizli: tarayıcının "Dosya Seç / Dosya seçilmedi"
              metni satırı şişiriyordu. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
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
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Dosya
          </Button>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="ya da https://…/urun.jpg"
            className="h-8 min-w-40 text-xs"
            onKeyDown={e => {
              if (e.key === "Enter" && url.trim()) {
                onAssign({ url: url.trim() });
                setUrl("");
              }
            }}
          />
          {url.trim() && (
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={busy}
              onClick={() => {
                onAssign({ url: url.trim() });
                setUrl("");
              }}
            >
              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Ata
            </Button>
          )}
        </div>
      </td>
    </tr>
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
