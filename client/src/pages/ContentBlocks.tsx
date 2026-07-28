import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FileText, Loader2, Pencil, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Block = inferRouterOutputs<AppRouter>["katalog"]["contentBlocks"][number];

/**
 * İçerik Blokları — ilan metinlerinin kaynağı.
 *
 * İçerik seriye ve kullanım alanına göre değişir; renge göre değişen tek şey
 * metinde geçen renk adıdır. Bu yüzden metin blok başına bir kez yazılır,
 * {{renk}}/{{ambalaj}} değişkenleriyle her ilana uyarlanır.
 *
 * Pratik sonuç: 9 seri × 7 kullanım alanı = 63 blok, binlerce ilanı doldurur.
 */
export default function ContentBlocks() {
  const utils = trpc.useUtils();
  const { data: blocks, isLoading } = trpc.katalog.contentBlocks.useQuery();
  const { data: series } = trpc.series.list.useQuery();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [useAi, setUseAi] = useState(true);
  const [perFamily, setPerFamily] = useState(false);
  const [regenerate, setRegenerate] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [edit, setEdit] = useState<Block | null>(null);

  const generate = trpc.katalog.generateContentBlocks.useMutation({
    onSuccess: r => {
      if (r.dryRun) {
        setPreview(r.willGenerate);
        if (r.willGenerate === 0) toast.info("Üretilecek yeni blok yok — hepsi dolu.");
        return;
      }
      setPreview(null);
      utils.katalog.contentBlocks.invalidate();
      toast.success(
        `${r.generated} blok hazır${r.aiFailed > 0 ? ` · ${r.aiFailed} tanesi AI yerine şablonla dolduruldu` : ""}`,
        { duration: 9000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const save = trpc.katalog.saveContentBlock.useMutation({
    onSuccess: () => {
      utils.katalog.contentBlocks.invalidate();
      setEdit(null);
      toast.success("Blok kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const args = {
    seriesIds: Array.from(selected),
    useAi,
    perFamily,
    regenerate,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">İçerik Blokları</h1>
        <p className="text-sm text-muted-foreground">
          İlan metinleri buradan gelir. Metin seri ve kullanım alanına göre yazılır; renk ve
          ambalaj değişkenle geçer, her ilana kendi bilgisiyle uyarlanır.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <p className="font-semibold">Blok üret</p>
        <p className="text-sm text-muted-foreground">
          AI, <strong>seri × kullanım alanı</strong> başına bir kez çağrılır — renk başına değil.
          Böylece birkaç düzine çağrı binlerce ilanı doldurur.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {(series ?? []).map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected.has(s.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
          {selected.size === 0 && (
            <span className="self-center text-xs text-muted-foreground">
              seçim yoksa tüm seriler
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={useAi} onCheckedChange={c => setUseAi(c === true)} />
            AI ile yaz (kapalıysa şablon metni kullanılır)
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={perFamily} onCheckedChange={c => setPerFamily(c === true)} />
            Form başına ayrı blok (airbrush ile spreyin uygulama metni farklı olsun)
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={regenerate} onCheckedChange={c => setRegenerate(c === true)} />
            Dolu blokları da yeniden üret
            <span className="text-xs text-muted-foreground">— elle düzelttikleriniz kaybolur</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ ...args, dryRun: true })}
          >
            <Play className="mr-1 h-4 w-4" /> Önce Göster
          </Button>
          {preview !== null && preview > 0 && (
            <Button
              disabled={generate.isPending}
              onClick={() => generate.mutate({ ...args, dryRun: false })}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              {preview} bloğu üret
            </Button>
          )}
        </div>
        {preview !== null && preview > 0 && useAi && (
          <p className="text-xs text-muted-foreground">
            {preview} AI çağrısı yapılacak. Başarısız olanlar şablon metinle doldurulur, ilan boş
            kalmaz.
          </p>
        )}
      </Card>

      {isLoading && <div className="h-32 animate-pulse rounded-xl bg-muted" />}

      {!isLoading && (blocks ?? []).length === 0 && (
        <Card className="space-y-2 p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium">Henüz içerik bloğu yok</p>
          <p className="text-sm text-muted-foreground">
            Blok yoksa ilanlar seri şablonundaki metinle açılır; o da yoksa gövdeleri boş kalır ve
            pazaryerine gönderilemezler.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {(blocks ?? []).map(b => (
          <Card key={b.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                {b.seriesName} · {b.useCaseName}
                {b.familyName && <span className="text-muted-foreground"> · {b.familyName}</span>}
              </p>
              <Badge variant={b.source === "ai" ? "default" : "secondary"} className="text-[10px]">
                {b.source === "ai" ? "AI" : b.source === "elle" ? "Elle" : "Şablon"}
              </Badge>
              <span className="flex-1" />
              <Button variant="outline" size="sm" className="h-8" onClick={() => setEdit(b)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Düzenle
              </Button>
            </div>
            {b.shortDescription ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{b.shortDescription}</p>
            ) : (
              <p className="text-sm text-amber-600">Kısa açıklama boş</p>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={edit !== null} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {edit?.seriesName} · {edit?.useCaseName}
              {edit?.familyName ? ` · ${edit.familyName}` : ""}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <BlockForm
              block={edit}
              onSave={data =>
                save.mutate({
                  seriesId: edit.seriesId,
                  useCaseId: edit.useCaseId,
                  familyId: edit.familyId,
                  ...data,
                })
              }
              saving={save.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockForm({
  block,
  onSave,
  saving,
}: {
  block: Block;
  onSave: (data: {
    titlePattern: string | null;
    shortDescription: string | null;
    longDescription: string | null;
    applicationText: string | null;
    labelText: string | null;
  }) => void;
  saving: boolean;
}) {
  const [f, setF] = useState({
    titlePattern: block.titlePattern ?? "",
    shortDescription: block.shortDescription ?? "",
    longDescription: block.longDescription ?? "",
    applicationText: block.applicationText ?? "",
    labelText: block.labelText ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
        Kullanılabilir değişkenler:{" "}
        <code className="font-mono">
          {"{{renk}} {{ambalaj}} {{seri}} {{form}} {{kullanim}} {{marka}}"}
        </code>
        <br />
        Somut renk veya hacim yazmayın — metin bu seri ve kullanım alanındaki tüm renk/ambalaj
        varyantlarında kullanılacak.
      </p>

      <div className="space-y-1.5">
        <Label>Başlık şablonu</Label>
        <Input value={f.titlePattern} onChange={e => set("titlePattern")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Kısa açıklama</Label>
        <Textarea rows={2} value={f.shortDescription} onChange={e => set("shortDescription")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Uzun açıklama (HTML)</Label>
        <Textarea rows={6} value={f.longDescription} onChange={e => set("longDescription")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Uygulama metni</Label>
        <Textarea rows={4} value={f.applicationText} onChange={e => set("applicationText")(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Etiket metni</Label>
        <Textarea rows={3} value={f.labelText} onChange={e => set("labelText")(e.target.value)} />
      </div>

      <DialogFooter>
        <Button
          disabled={saving}
          onClick={() =>
            onSave({
              titlePattern: f.titlePattern.trim() || null,
              shortDescription: f.shortDescription.trim() || null,
              longDescription: f.longDescription.trim() || null,
              applicationText: f.applicationText.trim() || null,
              labelText: f.labelText.trim() || null,
            })
          }
        >
          Kaydet
        </Button>
      </DialogFooter>
    </div>
  );
}
