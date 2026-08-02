import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { Loader2, Plus, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Katalog yeniden yapılandırma ekranı.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Katalog 300 varyanta şişmişti ve yarısı aynı şeyin kopyasıydı. Tek bir
 * kavram (R2U) üç yerde birden yaşıyordu: master'daki `readiness` bayrağı,
 * "(ReadyToUse)" adlı ayrı bir ambalaj kaydı, ve ürün tipinde hiç.
 *
 * Doğru model:
 *   R2U        → ürün TİPİ  (farklı sıvı, farklı reçete)
 *   Airbrush   → pazarlama KİMLİĞİ (aynı sıvı, farklı satış adı)
 *   Rötuş      → AMBALAJ (aynı sıvı, kapağında fırça olan şişe)
 *
 * Ekran hedef modeli önceden dolu getirir ama düzenlenebilir bırakır: bu bir
 * kerelik bir düzeltme değil, ürün yelpazesi değiştikçe tekrar çalıştırılacak
 * bir araç. Kuru çalıştırma zorunlu — 165 kaydı arşivleyen bir işlem
 * önizlemesiz çalışmamalı.
 */

type TypeRow = { name: string; skuSegment: string; packagings: string };
type RestructureResult = inferRouterOutputs<AppRouter>["katalog"]["restructureCatalog"];

/** Konuşmada netleşen hedef model — başlangıç değeri, kilit değil. */
const DEFAULT_TYPES: TypeRow[] = [
  { name: "Boya", skuSegment: "by", packagings: "30 ML, 100 ml, 250 ml, 500 ML" },
  { name: "R2U Boya", skuSegment: "r2u", packagings: "30 ML, 100 ml, 250 ml, 500 ML" },
  { name: "Sprey Boya", skuSegment: "sp", packagings: "SPREY 400ML" },
];

export default function CatalogRestructure() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [types, setTypes] = useState<TypeRow[]>(DEFAULT_TYPES);
  const [plan, setPlan] = useState<RestructureResult | null>(null);

  const restructure = trpc.katalog.restructureCatalog.useMutation({
    onSuccess: r => {
      setPlan(r);
      if (r.dryRun) return;
      utils.katalog.invalidate();
      toast.success(`${r.applied} varyant arşivlendi · ${r.rulesWritten ?? 0} kural yazıldı`, {
        duration: 9000,
      });
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });
  const payload = () => ({
    types: types
      .filter(t => t.name.trim())
      .map(t => ({
        name: t.name.trim(),
        skuSegment: t.skuSegment.trim() || "x",
        packagingNames: t.packagings
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
      })),
  });

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Wand2 className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-sm font-semibold">Ürün tipi eksenini düzelt</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Ürün tipi = şişenin içindeki sıvı farklıysa. <strong>R2U</strong> ayrı tiptir (seyreltilmiş,
          ayrı reçete). <strong>Airbrush</strong> aynı sıvıdır → ürün tipi değil, pazarlama kimliği.{" "}
          <strong>Rötuş</strong> aynı sıvıdır → ürün tipi değil, ambalaj.
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label>Hedef ürün tipleri</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setTypes(t => [...t, { name: "", skuSegment: "", packagings: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Tip
          </Button>
        </div>

        {types.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_2fr_28px] items-center gap-1.5">
            <Input
              value={t.name}
              placeholder="Ürün tipi adı"
              onChange={e =>
                setTypes(ts => ts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <Input
              value={t.skuSegment}
              placeholder="SKU eki"
              className="text-xs"
              onChange={e =>
                setTypes(ts => ts.map((x, j) => (j === i ? { ...x, skuSegment: e.target.value } : x)))
              }
            />
            <Input
              value={t.packagings}
              placeholder="Ambalajlar, virgülle: 30 ML, 100 ml…"
              className="text-xs"
              onChange={e =>
                setTypes(ts => ts.map((x, j) => (j === i ? { ...x, packagings: e.target.value } : x)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setTypes(ts => ts.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        <p className="text-[11px] text-muted-foreground">
          Ambalaj adları katalogdaki adlarla birebir eşleşmeli. Eşleşmeyenler önizlemede bildirilir.
          Burada adı geçmeyen ürün tipleri pasife alınır.
        </p>

        <Button
          disabled={restructure.isPending}
          onClick={() => restructure.mutate({ ...payload(), dryRun: true })}
        >
          {restructure.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Ne olacağını göster
        </Button>
      </Card>

      {plan && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {plan.summary.skuPerColor} SKU / renk
            </Badge>
            <span className="text-sm">
              <strong>{plan.summary.mastersKept}</strong> varyant kalıyor ·{" "}
              <strong>{plan.summary.mastersArchived}</strong> arşivleniyor
            </span>
            <span className="text-xs text-muted-foreground">
              (şu an {plan.summary.mastersTotal})
            </span>
          </div>

          {plan.missingPackagingNames.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                Katalogda bulunamayan ambalaj adları:{" "}
                <strong>{plan.missingPackagingNames.join(", ")}</strong>. Adı düzeltin ya da önce
                Tanımlar'dan bu ambalajı açın — aksi halde o satır boş kalır.
              </span>
            </div>
          )}

          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <PlanBox
              title="Açılacak ürün tipi"
              items={plan.familiesToCreate.map(f => f.name)}
            />
            <PlanBox
              title="Pasife alınacak tip"
              items={plan.familiesToRetire.map(f => f.name)}
            />
            <PlanBox
              title="Pasife alınacak ambalaj"
              items={plan.packagingsToRetire.map(p => p.name)}
            />
          </div>

          {plan.mastersToArchive.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Arşivlenecek varyantlar ({plan.mastersToArchive.length})
              </summary>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {plan.mastersToArchive.slice(0, 200).map(m => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{m.internalSku}</span>
                    <span className="text-muted-foreground">{m.reason}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {plan.dryRun && (
            <Button
              variant="destructive"
              disabled={restructure.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Katalog yeniden yapılandırılsın mı?",
                  description: `${plan.summary.mastersArchived} varyant arşivlenecek, ${plan.familiesToRetire.length} ürün tipi ve ${plan.packagingsToRetire.length} ambalaj pasife alınacak. Arşivleme geri alınabilir — hiçbir kayıt silinmez.`,
                  confirmText: "Uygula",
                  destructive: true,
                });
                if (!ok) return;
                restructure.mutate({ ...payload(), dryRun: false });
              }}
            >
              {restructure.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Uygula
            </Button>
          )}

          {!plan.dryRun && (
            <p className="text-xs text-emerald-600">
              Uygulandı. Sırada: sihirbazdan yeni modele göre varyantları üret.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function PlanBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        items.map(i => (
          <p key={i} className="font-medium">
            {i}
          </p>
        ))
      )}
    </div>
  );
}
