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
import { formatQty, formatTL, num } from "@/lib/format";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { Beaker, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import type { ProductRow } from "./Products";

export default function Formulas() {
  const search = useSearch();
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: products } = trpc.products.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();

  const [selectedId, setSelectedId] = useState<string>("");

  // URL'den ürün seçimi (?urun=ID)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const urun = params.get("urun");
    if (urun) setSelectedId(urun);
  }, [search]);

  const productId = selectedId ? Number(selectedId) : null;
  const { data: formulaItems, isLoading } = trpc.formula.list.useQuery(
    { productId: productId ?? 0 },
    { enabled: !!productId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: number; qty: string; note: string; materialName: string } | null>(null);
  const [formMaterialId, setFormMaterialId] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formNote, setFormNote] = useState("");

  const addItem = trpc.formula.add.useMutation({
    onSuccess: () => {
      utils.formula.list.invalidate();
      toast.success("Formüle hammadde eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const updateItem = trpc.formula.update.useMutation({
    onSuccess: () => {
      utils.formula.list.invalidate();
      toast.success("Formül kalemi güncellendi");
      setDialogOpen(false);
      setEditingItem(null);
    },
    onError: e => toast.error(e.message),
  });

  const deleteItem = trpc.formula.delete.useMutation({
    onSuccess: () => {
      utils.formula.list.invalidate();
      toast.success("Formül kalemi silindi");
    },
    onError: e => toast.error(e.message),
  });

  // Başka üründen reçete kopyalama (mevcut kalemler değiştirilir).
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [copyMultiplier, setCopyMultiplier] = useState("1");
  const copyFrom = trpc.formula.copyFrom.useMutation({
    onSuccess: r => {
      utils.formula.list.invalidate();
      toast.success(`${r.copied} kalem kopyalandı`);
      setCopyOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const sortedProducts = useMemo(() => {
    const list = (products as ProductRow[]) ?? [];
    const mains = list.filter(p => p.parentId === null);
    const result: { p: ProductRow; label: string }[] = [];
    for (const m of mains) {
      result.push({ p: m, label: m.name });
      for (const v of list.filter(x => x.parentId === m.id)) {
        result.push({ p: v, label: `${m.name} → ${v.name}${v.surfaceType ? ` (${v.surfaceType})` : ""}` });
      }
    }
    return result;
  }, [products]);

  const selectedProduct = useMemo(
    () => ((products as ProductRow[]) ?? []).find(p => p.id === productId),
    [products, productId],
  );

  const totalCost = useMemo(
    () =>
      (formulaItems ?? []).reduce(
        (sum, item) => sum + num(item.qty) * num(item.materialUnitCost),
        0,
      ),
    [formulaItems],
  );

  function openAdd() {
    setEditingItem(null);
    setFormMaterialId("");
    setFormQty("");
    setFormNote("");
    setDialogOpen(true);
  }

  function openEdit(item: { id: number; qty: string; note: string | null; materialName: string | null }) {
    setEditingItem({ id: item.id, qty: item.qty, note: item.note ?? "", materialName: item.materialName ?? "" });
    setFormQty(item.qty);
    setFormNote(item.note ?? "");
    setDialogOpen(true);
  }

  function submit() {
    const qty = parseFloat(formQty);
    if (!qty || qty <= 0) {
      toast.error("Geçerli bir miktar girin");
      return;
    }
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, qty, note: formNote || undefined });
    } else {
      if (!formMaterialId) {
        toast.error("Hammadde seçin");
        return;
      }
      if (!productId) return;
      addItem.mutate({ productId, materialId: Number(formMaterialId), qty, note: formNote || undefined });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Formül Defteri</h1>
        <p className="text-sm text-muted-foreground">
          Her ürün (ana veya türev) için hammadde miktarlarını ve karışım formülünü kaydedin.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-96">
            <SelectValue placeholder="Ürün seçin..." />
          </SelectTrigger>
          <SelectContent>
            {sortedProducts.length === 0 && (
              <SelectItem value="none" disabled>
                Önce Ürünler sayfasından ürün ekleyin
              </SelectItem>
            )}
            {sortedProducts.map(({ p, label }) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {productId && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Hammadde Ekle
          </Button>
        )}
        {productId && (
          <Button
            variant="outline"
            onClick={() => {
              setCopySourceId("");
              setCopyMultiplier("1");
              setCopyOpen(true);
            }}
            title="Başka ürünün reçetesini bu ürüne kopyala"
          >
            <Copy className="h-4 w-4 mr-1" /> Reçete Kopyala
          </Button>
        )}
      </div>

      {!productId && (
        <Card className="p-10 text-center space-y-2">
          <Beaker className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Formülünü görmek istediğiniz ürünü seçin</p>
          <p className="text-sm text-muted-foreground">
            Ana ürünler ve türevleri listede hiyerarşik olarak gösterilir; her biri bağımsız formül taşır.
          </p>
        </Card>
      )}

      {productId && selectedProduct && (
        <>
          <Card className="p-4 flex items-center gap-3 flex-wrap">
            <span
              className="h-8 w-8 rounded-lg border shadow-inner"
              style={{ backgroundColor: selectedProduct.colorHex ?? "#888" }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{selectedProduct.name}</p>
              <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
                {selectedProduct.parentId === null ? (
                  <Badge variant="secondary">Ana Ürün</Badge>
                ) : (
                  <Badge className="bg-accent text-accent-foreground border-0">
                    Türev{selectedProduct.surfaceType ? ` · ${selectedProduct.surfaceType}` : ""}
                  </Badge>
                )}
                {selectedProduct.additives && <span>Katkı: {selectedProduct.additives}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Formül Hammadde Maliyeti</p>
              <p className="text-lg font-bold text-primary">{formatTL(totalCost)}</p>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hammadde</TableHead>
                  <TableHead className="text-right">Miktar</TableHead>
                  <TableHead className="text-right">Birim Maliyet</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Not</TableHead>
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
                {!isLoading && (formulaItems ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Bu ürünün formülü henüz boş. "Hammadde Ekle" ile başlayın.
                    </TableCell>
                  </TableRow>
                )}
                {(formulaItems ?? []).map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.materialName ?? "Silinmiş hammadde"}</div>
                      <div className="text-xs text-muted-foreground">{item.materialCategory}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatQty(item.qty)} {item.materialUnit}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatTL(item.materialUnitCost)}/{item.materialUnit}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatTL(num(item.qty) * num(item.materialUnitCost))}
                      {totalCost > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          %{(((num(item.qty) * num(item.materialUnitCost)) / totalCost) * 100).toFixed(0)} pay
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-40 truncate">
                      {item.note ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Formül kalemini sil",
                                description: "Bu formül kalemi silinsin mi?",
                                confirmText: "Sil",
                                destructive: true,
                              })
                            )
                              deleteItem.mutate({ id: item.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? `Kalemi Düzenle — ${editingItem.materialName}` : "Formüle Hammadde Ekle"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingItem && (
              <div className="space-y-1.5">
                <Label>Hammadde *</Label>
                <Select value={formMaterialId} onValueChange={setFormMaterialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Hammadde seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(materials ?? []).length === 0 && (
                      <SelectItem value="none" disabled>
                        Önce Stok sayfasından hammadde ekleyin
                      </SelectItem>
                    )}
                    {(materials ?? []).map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name} ({m.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Miktar *</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={formQty}
                onChange={e => setFormQty(e.target.value)}
                placeholder="Örn. 50"
                autoFocus={!!editingItem}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Input
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
                placeholder="Örn. yavaş karıştırarak ekle"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={addItem.isPending || updateItem.isPending}>
              {editingItem ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reçete kopyalama dialogu */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reçete Kopyala — {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Seçtiğin ürünün reçetesi bu ürüne kopyalanır.
              {(formulaItems ?? []).length > 0 && (
                <span className="text-amber-600 font-medium">
                  {" "}
                  Bu ürünün mevcut {formulaItems?.length} kalemi silinip yenisiyle değiştirilir.
                </span>
              )}
            </p>
            <div className="space-y-1.5">
              <Label>Kaynak Ürün *</Label>
              <Select value={copySourceId} onValueChange={setCopySourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Reçetesi kopyalanacak ürünü seç..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedProducts
                    .filter(({ p }) => p.id !== productId)
                    .map(({ p, label }) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Çarpan</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={copyMultiplier}
                onChange={e => setCopyMultiplier(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Miktarlar bu sayıyla çarpılır. Örn. 2'li set için 2, yarım boy için 0,5.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={copyFrom.isPending}
              onClick={() => {
                if (!copySourceId) return toast.error("Kaynak ürün seç");
                const mult = parseFloat(copyMultiplier.replace(",", "."));
                if (!mult || mult <= 0) return toast.error("Geçerli bir çarpan gir");
                if (!productId) return;
                copyFrom.mutate({
                  fromProductId: Number(copySourceId),
                  toProductId: productId,
                  multiplier: mult,
                });
              }}
            >
              Kopyala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
