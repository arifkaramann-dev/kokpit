import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Seri uyumluluk matrisi — hangi seride hangi RENK, form ve ambalaj üretilir.
 *
 * Eksik olan renk eksenIydi. `colors.seriesId` tek bir seriye işaret eden
 * nullable bir alandı ve tohumlama hiçbir renge seri atamıyordu; sonuçta her
 * renk her seriye düşüyordu. CANDY için master üretince RAL kodları dahil 31
 * rengin tamamı çarpıma girip 744 master çıkıyordu.
 *
 * Renk artık ambalaj ve formla aynı şekilde çoka-çok bağlanır. Seçim yapılmamış
 * seri "tüm renkler" demektir ve bu ekranda açıkça uyarılır — sessizce
 * şişmesin.
 */
export default function SeriesMatrix() {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: links } = trpc.katalog.seriesLinks.useQuery();

  const [seriesId, setSeriesId] = useState<string>("");
  const activeId = Number(seriesId) || series?.[0]?.id || 0;

  const colors = dims?.colors ?? [];
  const families = dims?.families ?? [];
  const packagings = dims?.packagings ?? [];

  const current = useMemo(() => {
    const pick = <T extends { seriesId: number }>(rows: T[] | undefined, key: keyof T) =>
      new Set((rows ?? []).filter(r => r.seriesId === activeId).map(r => Number(r[key])));
    return {
      colors: pick(links?.colors, "colorId" as never),
      families: pick(links?.families, "familyId" as never),
      packagings: pick(links?.packagings, "packagingId" as never),
    };
  }, [links, activeId]);

  const [sel, setSel] = useState(current);
  // Seri değişince seçim o serininkiyle yeniden kurulur.
  useEffect(() => setSel(current), [current]);

  const save = trpc.katalog.seriesCompatibility.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Seri uyumluluğu kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const toggle = (kind: "colors" | "families" | "packagings", id: number) =>
    setSel(prev => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });

  const dirty =
    sel.colors.size !== current.colors.size ||
    sel.families.size !== current.families.size ||
    sel.packagings.size !== current.packagings.size ||
    Array.from(sel.colors).some(id => !current.colors.has(id)) ||
    Array.from(sel.families).some(id => !current.families.has(id)) ||
    Array.from(sel.packagings).some(id => !current.packagings.has(id));

  const readiness = 2; // ekranda en kötü durum gösterilir (r2u işaretliyken)
  const projected =
    (sel.colors.size || colors.length) *
    (sel.families.size || 0) *
    (sel.packagings.size || 0);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Seri Uyumluluğu</h2>
        <Select value={String(activeId)} onValueChange={setSeriesId}>
          <SelectTrigger className="w-48">
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
        {dirty && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                seriesId: activeId,
                colorIds: Array.from(sel.colors),
                familyIds: Array.from(sel.families),
                packagingIds: Array.from(sel.packagings),
              })
            }
          >
            <Save className="mr-1 h-4 w-4" /> Kaydet
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Master sayısı bu üç eksenin çarpımıdır. Renk seçilmezse{" "}
        <strong className="text-foreground">tüm renkler</strong> girer — bir seriye ait olmayan
        renkler de dahil.
      </p>

      {sel.colors.size === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          Bu seride renk sınırı yok: {colors.length} rengin tamamı üretilecek.
        </div>
      )}

      <div className="rounded-lg border p-3 text-sm">
        Tahmini master:{" "}
        <strong>
          {projected} (konsantre) · {projected * readiness} (r2u dahil)
        </strong>
      </div>

      <Axis
        title="Renkler"
        count={sel.colors.size}
        total={colors.length}
        onAll={() => setSel(p => ({ ...p, colors: new Set(colors.map(c => c.id)) }))}
        onNone={() => setSel(p => ({ ...p, colors: new Set<number>() }))}
      >
        {colors.map(c => (
          <Chip
            key={c.id}
            active={sel.colors.has(c.id)}
            onClick={() => toggle("colors", c.id)}
            hex={c.hex}
          >
            {c.name}
          </Chip>
        ))}
      </Axis>

      <Axis
        title="Formlar"
        count={sel.families.size}
        total={families.length}
        onAll={() => setSel(p => ({ ...p, families: new Set(families.map(f => f.id)) }))}
        onNone={() => setSel(p => ({ ...p, families: new Set<number>() }))}
      >
        {families.map(f => (
          <Chip key={f.id} active={sel.families.has(f.id)} onClick={() => toggle("families", f.id)}>
            {f.name}
          </Chip>
        ))}
      </Axis>

      <Axis
        title="Ambalajlar"
        count={sel.packagings.size}
        total={packagings.length}
        onAll={() => setSel(p => ({ ...p, packagings: new Set(packagings.map(x => x.id)) }))}
        onNone={() => setSel(p => ({ ...p, packagings: new Set<number>() }))}
      >
        {packagings.map(p => (
          <Chip
            key={p.id}
            active={sel.packagings.has(p.id)}
            onClick={() => toggle("packagings", p.id)}
          >
            {p.name}
          </Chip>
        ))}
      </Axis>
    </Card>
  );
}

function Axis({
  title,
  count,
  total,
  onAll,
  onNone,
  children,
}: {
  title: string;
  count: number;
  total: number;
  onAll: () => void;
  onNone: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Badge variant={count > 0 ? "secondary" : "outline"}>
          {count}/{total}
        </Badge>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onAll}>
          Tümü
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onNone}>
          Hiçbiri
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  hex,
  children,
}: {
  active: boolean;
  onClick: () => void;
  hex?: string | null;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {hex && (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full border"
          style={{ backgroundColor: hex }}
        />
      )}
      {children}
    </button>
  );
}
