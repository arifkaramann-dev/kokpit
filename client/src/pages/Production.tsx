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
import { formatQty, formatTL, num } from "@/lib/format";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Factory, ListPlus, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Üretim Planlayıcı: ürün + adet seç → reçeteden hammadde ihtiyacı çıkar,
 * stokla karşılaştır, eksikleri tek tıkla alınacaklara ekle,
 * üretimi kaydedince hammaddeler stoktan düşülür.
 */
export default function Production() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: products } = trpc.products.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const [productId, setProductId] = useState<string>("");
  const [qtyText, setQtyText] = useState("10");
  const qty = Math.max(0, num(qtyText));

  const { data: formula } = trpc.formula.list.useQuery(
    { productId: Number(productId) },
    { enabled: !!productId },
  );

  const produce = trpc.production.produce.useMutation({
    onSuccess: r => {
      utils.materials.invalidate();
      toast.success(`Üretim kaydedildi — ${r.deducted} hammadde stoktan düşüldü`);
    },
    onError: e => toast.error(e.message),
  });
  const addTask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
  });

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Üretim Planlayıcı</h1>
        <p className="text-sm text-muted-foreground">
          Kaç adet üreteceğini yaz — hangi hammaddeden ne kadar gerektiğini, stokun yetip
          yetmediğini gör. Üretimi kaydedince stoktan otomatik düşülür.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ürün (reçetesi olanlar hesaplanır)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Ürün seç..." />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
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
    </div>
  );
}
