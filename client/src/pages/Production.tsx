import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQty, formatTL, num } from "@/lib/format";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Factory, History, ListPlus, Undo2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProductRow } from "./Products";

/**
 * Üretim Planlayıcı: üç bölüm —
 * 1. Üretim Kuyruğu: eksi stok / kritik eşik altındaki mamuller + önerilen adet
 *    (tıklayınca planlayıcıya dolar).
 * 2. Planlayıcı: ürün + adet seç → reçeteden hammadde ihtiyacı, stok kontrolü,
 *    mevcut hammaddeyle üretilebilecek azami adet, eksikleri alınacaklara ekleme.
 * 3. Üretim Geçmişi: son üretim emirleri + yanlış girilen emri geri alma.
 */
export default function Production() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: products } = trpc.products.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: costSummary } = trpc.products.costSummary.useQuery();
  const { data: runs } = trpc.production.runs.useQuery();
  const [productId, setProductId] = useState<string>("");
  const [qtyText, setQtyText] = useState("10");
  const qty = Math.max(0, num(qtyText));

  const { data: formula } = trpc.formula.list.useQuery(
    { productId: Number(productId) },
    { enabled: !!productId },
  );

  // Reçetesi olan ürünler (costSummary yalnızca formüllü ürünleri döner).
  const hasFormulaSet = useMemo(
    () => new Set((costSummary ?? []).map(c => c.productId)),
    [costSummary],
  );

  const invalidateAll = () => {
    utils.materials.invalidate();
    utils.products.invalidate();
    utils.production.runs.invalidate();
    utils.dashboard.summary.invalidate();
  };

  const produce = trpc.production.produce.useMutation({
    onSuccess: (r, vars) => {
      invalidateAll();
      toast.success(
        `Üretim kaydedildi — ${r.deducted} hammadde düşüldü, mamul stok +${vars.qty}`,
      );
    },
    onError: e => toast.error(e.message),
  });
  const undoRun = trpc.production.undo.useMutation({
    onSuccess: r => {
      invalidateAll();
      toast.success(`Üretim geri alındı — ${r.restoredMaterials} hammadde stoğa iade edildi`);
    },
    onError: e => toast.error(e.message),
  });
  const addTask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
  });

  // Ürün seçici: ana ürün → türev hiyerarşisi + reçetesi olmayanlara işaret.
  const sortedProducts = useMemo(() => {
    const list = (products as ProductRow[]) ?? [];
    const mains = list.filter(p => p.parentId === null);
    const result: { p: ProductRow; label: string }[] = [];
    for (const m of mains) {
      result.push({ p: m, label: m.name });
      for (const v of list.filter(x => x.parentId === m.id)) {
        result.push({ p: v, label: `${m.name} → ${v.name}` });
      }
    }
    return result;
  }, [products]);

  // Üretim kuyruğu: eksi stok = üretilecek; kritik eşik tanımlıysa eşik altı da
  // (Stok Nöbetçisi'yle aynı kural). Önerilen adet stoku eşiğe tamamlar.
  const queue = useMemo(() => {
    const list = (products as ProductRow[]) ?? [];
    return list
      .filter(p => p.stockQty < 0 || (p.criticalQty > 0 && p.stockQty <= p.criticalQty))
      .map(p => ({
        p,
        suggested: Math.max(1, (p.criticalQty > 0 ? p.criticalQty : 0) - p.stockQty),
        hasFormula: hasFormulaSet.has(p.id),
      }))
      .sort((a, b) => a.p.stockQty - b.p.stockQty);
  }, [products, hasFormulaSet]);

  const matById = new Map((materials ?? []).map(m => [m.id, m]));
  const rows = (formula ?? []).map(f => {
    const m = matById.get(f.materialId);
    const perUnit = num(f.qty);
    const need = perUnit * qty;
    const stock = m ? num(m.stockQty) : 0;
    const ok = stock >= need;
    return {
      id: f.id,
      name: f.materialName ?? "?",
      unit: f.materialUnit ?? "",
      perUnit,
      need,
      stock,
      ok,
      missing: ok ? 0 : need - stock,
      cost: need * num(f.materialUnitCost),
    };
  });
  const allOk = rows.length > 0 && rows.every(r => r.ok);
  const missingRows = rows.filter(r => !r.ok);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const selected = (products ?? []).find(p => String(p.id) === productId);

  // Mevcut hammadde stokuyla üretilebilecek azami adet (darboğaz hammaddeye göre).
  const maxProducible = useMemo(() => {
    const perUnitRows = (formula ?? [])
      .map(f => {
        const m = matById.get(f.materialId);
        return { perUnit: num(f.qty), stock: m ? num(m.stockQty) : 0 };
      })
      .filter(r => r.perUnit > 0);
    if (perUnitRows.length === 0) return null;
    return Math.max(0, Math.floor(Math.min(...perUnitRows.map(r => r.stock / r.perUnit))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, materials]);

  function planFromQueue(id: number, suggested: number) {
    setProductId(String(id));
    setQtyText(String(suggested));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Üretim Planlayıcı</h1>
        <p className="text-sm text-muted-foreground">
          Kaç adet üreteceğini yaz — hangi hammaddeden ne kadar gerektiğini, stokun yetip
          yetmediğini gör. Üretimi kaydedince hammaddeler düşülür, mamul stok artar.
        </p>
      </div>

      {queue.length > 0 && (
        <Card className="p-4 space-y-3 border-amber-300 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold text-sm">
              Üretim Kuyruğu — {queue.length} ürün düşük stokta
            </h2>
          </div>
          <div className="space-y-1.5">
            {queue.map(({ p, suggested, hasFormula }) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium flex-1 min-w-0 truncate">{p.name}</span>
                <span className={`whitespace-nowrap text-xs ${p.stockQty < 0 ? "text-rose-600 font-semibold" : "text-amber-600"}`}>
                  Stok: {p.stockQty}
                  {p.criticalQty > 0 && <span className="text-muted-foreground"> / eşik {p.criticalQty}</span>}
                </span>
                {!hasFormula && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    reçete yok
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => planFromQueue(p.id, suggested)}>
                  <Factory className="h-3.5 w-3.5 mr-1" /> {suggested} adet planla
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ürün (reçetesi olanlar hesaplanır)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Ürün seç..." />
              </SelectTrigger>
              <SelectContent>
                {sortedProducts.map(({ p, label }) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {label}
                    {!hasFormulaSet.has(p.id) ? " · (reçete yok)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Üretilecek Adet</Label>
            <Input
              type="number"
              min="1"
              value={qtyText}
              onChange={e => setQtyText(e.target.value)}
            />
          </div>
        </div>

        {productId && (formula ?? []).length === 0 && (
          <p className="text-sm text-amber-600">
            Bu ürünün reçetesi yok — önce Formül Defteri'nden hammaddelerini ekle.
          </p>
        )}

        {rows.length > 0 && qty > 0 && (
          <>
            {maxProducible !== null && (
              <p className="text-xs text-muted-foreground">
                Mevcut hammadde stokuyla en fazla{" "}
                <span className={`font-semibold ${maxProducible >= qty ? "text-emerald-600" : "text-rose-600"}`}>
                  {maxProducible} adet
                </span>{" "}
                üretilebilir.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hammadde</TableHead>
                    <TableHead className="text-right">Birim Reçete</TableHead>
                    <TableHead className="text-right">Gereken ({qty} adet)</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(r.perUnit)} {r.unit}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatQty(r.need)} {r.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatQty(r.stock)} {r.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yeterli
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-medium">
                            <XCircle className="h-3.5 w-3.5" /> {formatQty(r.missing)} {r.unit} eksik
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <p className="text-sm">
                Tahmini hammadde maliyeti:{" "}
                <span className="font-semibold">{formatTL(totalCost)}</span>
                {qty > 0 && (
                  <span className="text-muted-foreground"> · adet başı {formatTL(totalCost / qty)}</span>
                )}
                {selected && num(selected.salePrice) > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · satış değeri {formatTL(num(selected.salePrice) * qty)}
                  </span>
                )}
              </p>
              <div className="ml-auto flex gap-2">
                {missingRows.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      for (const r of missingRows) {
                        addTask.mutate({
                          kind: "eksik",
                          title: `${r.name} — ${formatQty(r.missing)} ${r.unit} (üretim: ${qty}× ${selected?.name ?? ""})`,
                        });
                      }
                      toast.success(`${missingRows.length} eksik alınacaklara eklendi`);
                    }}
                  >
                    <ListPlus className="h-4 w-4 mr-1" /> Eksikleri Listeye Ekle
                  </Button>
                )}
                <Button
                  disabled={produce.isPending}
                  variant={allOk ? "default" : "destructive"}
                  onClick={async () => {
                    if (
                      !allOk &&
                      !(await confirm({
                        title: "Stok yetersiz",
                        description:
                          "Bazı hammaddeler yetersiz. Yine de üretimi kaydedip stokları düşeyim mi? (Stok 0'ın altına inmez)",
                        confirmText: "Yine de üret",
                        destructive: true,
                      }))
                    )
                      return;
                    produce.mutate({ productId: Number(productId), qty, force: !allOk });
                  }}
                >
                  <Factory className="h-4 w-4 mr-1" /> Üretimi Kaydet (stoktan düş)
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {(runs ?? []).length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Üretim Geçmişi</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Adet</TableHead>
                <TableHead>Not</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs ?? []).map(run => {
                const undone = run.note?.startsWith("⛔") ?? false;
                return (
                  <TableRow key={run.id} className={undone ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(run.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {run.productName ?? "Silinmiş ürün"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{run.qty}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64 truncate">
                      {undone && (
                        <Badge variant="outline" className="mr-1 text-[10px] text-rose-600 border-rose-300">
                          Geri alındı
                        </Badge>
                      )}
                      {run.note?.replace(/^⛔\s*/, "") ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        title="Üretimi geri al"
                        disabled={undone || undoRun.isPending}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Üretimi geri al",
                              description: `${run.qty}× ${run.productName ?? "?"} üretimi geri alınsın mı? Hammaddeler güncel reçeteye göre stoğa iade edilir, mamul stok düşülür.`,
                              confirmText: "Geri al",
                              destructive: true,
                            })
                          )
                            undoRun.mutate({ id: run.id });
                        }}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
