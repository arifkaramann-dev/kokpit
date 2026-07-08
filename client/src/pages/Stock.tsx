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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatQty, formatTL, MATERIAL_CATEGORIES, num, UNITS } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  stockQty: string;
  criticalQty: string;
  unitCost: string;
  supplierId: number | null;
  notes: string | null;
};

const emptyForm = {
  name: "",
  category: "pigment",
  unit: "gr",
  stockQty: "",
  criticalQty: "",
  unitCost: "",
  notes: "",
};

export default function Stock() {
  const utils = trpc.useUtils();
  const { data: materials, isLoading } = trpc.materials.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockDialog, setStockDialog] = useState<{ material: MaterialRow; type: "in" | "out" } | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [filter, setFilter] = useState("all");

  const createMaterial = trpc.materials.create.useMutation({
    onSuccess: () => {
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hammadde eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const updateMaterial = trpc.materials.update.useMutation({
    onSuccess: () => {
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hammadde güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const deleteMaterial = trpc.materials.delete.useMutation({
    onSuccess: () => {
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hammadde silindi");
    },
    onError: e => toast.error(e.message),
  });

  const adjustStock = trpc.materials.adjustStock.useMutation({
    onSuccess: () => {
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Stok güncellendi");
      setStockDialog(null);
      setStockQty("");
      setStockNote("");
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = (materials as MaterialRow[]) ?? [];
    if (filter === "all") return list;
    if (filter === "critical") return list.filter(m => num(m.stockQty) <= num(m.criticalQty));
    return list.filter(m => m.category === filter);
  }, [materials, filter]);

  const criticalCount = useMemo(
    () => ((materials as MaterialRow[]) ?? []).filter(m => num(m.stockQty) <= num(m.criticalQty)).length,
    [materials],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(m: MaterialRow) {
    setEditing(m);
    setForm({
      name: m.name,
      category: m.category,
      unit: m.unit,
      stockQty: m.stockQty,
      criticalQty: m.criticalQty,
      unitCost: m.unitCost,
      notes: m.notes ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Malzeme adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      stockQty: parseFloat(form.stockQty) || 0,
      criticalQty: parseFloat(form.criticalQty) || 0,
      unitCost: parseFloat(form.unitCost) || 0,
      notes: form.notes || null,
    };
    if (editing) {
      updateMaterial.mutate({ id: editing.id, data: payload });
    } else {
      createMaterial.mutate(payload);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stok &amp; Hammadde</h1>
          <p className="text-sm text-muted-foreground">
            Pigment, solvent, ambalaj ve diğer malzemelerinizi takip edin.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Hammadde
        </Button>
      </div>

      {criticalCount > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{criticalCount}</strong> malzeme kritik stok seviyesinin altında. Tedarik siparişi vermeyi düşünün.
          </p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFilter("critical")}>
            Göster
          </Button>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Kategoriler</SelectItem>
            <SelectItem value="critical">⚠ Kritik Stok</SelectItem>
            {MATERIAL_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} malzeme</span>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Malzeme</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Kritik Eşik</TableHead>
              <TableHead className="text-right">Birim Maliyet</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Yükleniyor...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Henüz hammadde eklenmemiş. "Yeni Hammadde" ile başlayın.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(m => {
              const isCritical = num(m.stockQty) <= num(m.criticalQty);
              return (
                <TableRow key={m.id} className={isCritical ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                  <TableCell>
                    <div className="font-medium">{m.name}</div>
                    {m.notes && <div className="text-xs text-muted-foreground line-clamp-1">{m.notes}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={isCritical ? "font-semibold text-amber-600" : ""}>
                      {formatQty(m.stockQty)} {m.unit}
                    </span>
                    {isCritical && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline ml-1" />}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatQty(m.criticalQty)} {m.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTL(m.unitCost)}/{m.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-emerald-600"
                        title="Stok girişi"
                        onClick={() => setStockDialog({ material: m, type: "in" })}
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600"
                        title="Stok çıkışı"
                        onClick={() => setStockDialog({ material: m, type: "out" })}
                      >
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (confirm(`"${m.name}" silinsin mi? Formüllerdeki kayıtları da silinir.`))
                            deleteMaterial.mutate({ id: m.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Hammadde ekleme/düzenleme dialogu */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Hammaddeyi Düzenle" : "Yeni Hammadde"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Malzeme Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. Siyah Pigment, 100ml Cam Şişe"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Birim</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Mevcut Stok</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.stockQty}
                  onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kritik Eşik</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.criticalQty}
                  onChange={e => setForm(f => ({ ...f, criticalQty: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Birim Maliyet (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.unitCost}
                  onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notlar</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Tedarikçi bilgisi, ürün kodu vb."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createMaterial.isPending || updateMaterial.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stok giriş/çıkış dialogu */}
      <Dialog open={!!stockDialog} onOpenChange={open => !open && setStockDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {stockDialog?.type === "in" ? "Stok Girişi" : "Stok Çıkışı"} — {stockDialog?.material.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Mevcut stok: {formatQty(stockDialog?.material.stockQty)} {stockDialog?.material.unit}
            </p>
            <div className="space-y-1.5">
              <Label>Miktar ({stockDialog?.material.unit})</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Not (opsiyonel)</Label>
              <Input
                value={stockNote}
                onChange={e => setStockNote(e.target.value)}
                placeholder="Örn. yeni parti alımı, üretim kullanımı"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>
              İptal
            </Button>
            <Button
              onClick={() => {
                const qty = parseFloat(stockQty);
                if (!qty || qty <= 0) {
                  toast.error("Geçerli bir miktar girin");
                  return;
                }
                if (stockDialog) {
                  adjustStock.mutate({
                    materialId: stockDialog.material.id,
                    type: stockDialog.type,
                    qty,
                    note: stockNote || undefined,
                  });
                }
              }}
              disabled={adjustStock.isPending}
            >
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
