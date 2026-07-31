import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { compatibleUnits, normalizeUnit } from "@shared/units";
import { Loader2, Package, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Row = { materialId: string; qtyPerUnit: string; unit: string };

/**
 * Ambalaj maliyeti — şişe, kapak, etiket, koli.
 *
 * ── Neden ayrı ekran ──────────────────────────────────────────────────────
 * Ambalaj kalemleri hacimle ÖLÇEKLENMEZ. 400 ml sprey kutusu, 30 ml şişenin
 * 13 katı değildir; her ambalajın kendi sabit maliyeti vardır. Bu yüzden bu
 * kalemler reçetede değil ambalaj tanımında durur — reçeteye konsalar hacimle
 * çarpılır ve büyük ambalajların maliyeti uçar.
 *
 * `packagingInputs` tablosu ve onu okuyan motorlar baştan beri vardı; eksik
 * olan tek şey veriyi girecek ekrandı. O yüzden ambalaj maliyeti bugüne kadar
 * fiilen sıfır sayılıyordu ve kâr hesabı ambalajı hiç görmüyordu.
 */
export default function PackagingCost() {
  const utils = trpc.useUtils();
  const { data: packagings, isLoading } = trpc.katalog.packagingCosts.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();

  const [editId, setEditId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const save = trpc.katalog.savePackagingInputs.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      setEditId(null);
      toast.success("Ambalaj maliyeti güncellendi");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // Ambalaj kalemleri: şişe, kapak, etiket, koli. Masraf kalemleri kapasiteyi
  // kısıtlamaz ama maliyete girebilir, o yüzden onlar da listelenir.
  const options = (materials ?? []).filter(m => m.type === "ambalaj" || m.type === "masraf");
  const editing = (packagings ?? []).find(p => p.id === editId) ?? null;

  function openEdit(p: NonNullable<typeof packagings>[number]) {
    setEditId(p.id);
    setRows(
      p.inputs.map(i => ({
        materialId: String(i.materialId),
        qtyPerUnit: String(i.qtyPerUnit),
        unit: i.unit ?? "",
      })),
    );
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const withoutCost = (packagings ?? []).filter(p => p.isActive && p.unitCost <= 0);

  return (
    <div className="space-y-3">
      <Card className="space-y-1 p-4 text-sm text-muted-foreground">
        Her ambalajın <strong className="text-foreground">kendi sabit maliyeti</strong> vardır ve
        hacimle ölçeklenmez — 400 ml sprey kutusu, 30 ml şişenin 13 katı değildir. Şişe/kutu ana
        kaptır (Ambalajlar sekmesindeki "stok kalemi"); kapak, etiket ve koli buraya eklenir.
        {withoutCost.length > 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-amber-600">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            {withoutCost.length} ambalajın maliyeti sıfır — kâr hesabı ambalajı görmüyor.
          </span>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Ambalaj</th>
                <th className="p-2 text-right">Hacim</th>
                <th className="p-2 text-left">Ana kap</th>
                <th className="p-2 text-left">Ek kalemler</th>
                <th className="p-2 text-right">Adet maliyeti</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {(packagings ?? []).map(p => (
                <tr key={p.id} className={`border-t ${p.isActive ? "" : "opacity-50"}`}>
                  <td className="p-2">
                    <span className="font-medium">{p.name}</span>
                    {!p.isActive && (
                      <Badge variant="outline" className="ml-1.5 text-[10px]">
                        pasif
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {p.volumeMl > 0 ? `${p.volumeMl} ml` : "—"}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {p.containerName ?? <span className="text-amber-600">bağlı değil</span>}
                    {p.containerCost > 0 && ` · ${formatTL(p.containerCost)}`}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {p.inputs.length > 0 ? `${p.inputs.length} kalem` : "—"}
                    {p.unitMismatches.length > 0 && (
                      <span className="ml-1 text-amber-600" title="Birim çevrilemiyor">
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {p.unitCost > 0 ? (
                      <span className="font-medium">{formatTL(p.unitCost)}</span>
                    ) : (
                      <span className="text-amber-600">₺0,00</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => openEdit(p)}>
                      <Package className="mr-1 h-3.5 w-3.5" /> Kalemler
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={editId != null} onOpenChange={o => !o && setEditId(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.name} — ambalaj kalemleri</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ana kap (Ambalajlar sekmesinden)</span>
                <span className="tabular-nums">
                  {editing?.containerName ?? "bağlı değil"}
                  {editing && editing.containerCost > 0 && ` · ${formatTL(editing.containerCost)}`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Ek kalemler — kapak, etiket, koli</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setRows(r => [...r, { materialId: "", qtyPerUnit: "1", unit: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Satır
              </Button>
            </div>

            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Henüz ek kalem yok. Kapak, etiket ve koliyi eklerseniz ambalaj maliyeti gerçeği
                yansıtır.
              </p>
            )}

            {rows.map((row, idx) => {
              const mat = options.find(m => String(m.id) === row.materialId);
              const unitChoices = mat ? compatibleUnits(mat.unit) : [];
              return (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px_28px] items-center gap-1.5">
                  <Select
                    value={row.materialId}
                    onValueChange={v =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, materialId: v } : r)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kalem seç (kapak, etiket, koli…)" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name} ({m.unit}) · {formatTL(m.unitCost)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={row.qtyPerUnit}
                    onChange={e =>
                      setRows(rs =>
                        rs.map((r, i) => (i === idx ? { ...r, qtyPerUnit: e.target.value } : r)),
                      )
                    }
                  />
                  <Select
                    value={row.unit || (mat ? normalizeUnit(mat.unit) : "")}
                    onValueChange={v =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, unit: v } : r)))
                    }
                    disabled={!mat}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="birim" />
                    </SelectTrigger>
                    <SelectContent>
                      {unitChoices.map(u => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}

            {/* Canlı toplam: kaydetmeden önce rakamı görmek, yanlış kalemi
                seçtiğini anlamanın en hızlı yolu. */}
            <div className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm">
              <span className="text-muted-foreground">Bu ambalajın adet maliyeti</span>
              <span className="font-semibold tabular-nums">
                {formatTL(
                  (editing?.containerCost ?? 0) +
                    rows.reduce((sum, r) => {
                      const m = options.find(x => String(x.id) === r.materialId);
                      if (!m) return sum;
                      const qty = parseFloat(r.qtyPerUnit) || 0;
                      return sum + qty * (parseFloat(String(m.unitCost)) || 0);
                    }, 0),
                )}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              İptal
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                editId != null &&
                save.mutate({
                  packagingId: editId,
                  inputs: rows
                    .filter(r => r.materialId && parseFloat(r.qtyPerUnit) > 0)
                    .map(r => ({
                      materialId: Number(r.materialId),
                      qtyPerUnit: parseFloat(r.qtyPerUnit),
                      unit: r.unit || null,
                    })),
                })
              }
            >
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
