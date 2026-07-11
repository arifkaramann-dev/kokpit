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
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Beaker, ChevronDown, ChevronRight, Layers, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export type ProductRow = {
  id: number;
  parentId: number | null;
  name: string;
  series: string | null;
  colorCode: string | null;
  colorHex: string | null;
  surfaceType: string | null;
  additives: string | null;
  description: string | null;
  salePrice: string;
  discountPercent: string;
  packagingCost: string;
  shippingCost: string;
  labelSize: string | null;
  labelText: string | null;
  usageGuide: string | null;
  safetyNotes: string | null;
  extraInfo: string | null;
  isActive: number;
};

const emptyForm = {
  name: "",
  series: "",
  colorCode: "",
  colorHex: "#1a1a1a",
  surfaceType: "",
  additives: "",
  description: "",
  salePrice: "",
  discountPercent: "",
  packagingCost: "",
  shippingCost: "",
  labelSize: "",
  labelText: "",
  usageGuide: "",
  safetyNotes: "",
  extraInfo: "",
};

export default function Products() {
  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.products.list.useQuery();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [parentForNew, setParentForNew] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deriveFor, setDeriveFor] = useState<ProductRow | null>(null);
  const [deriveTypes, setDeriveTypes] = useState<Set<string>>(new Set());
  const [customType, setCustomType] = useState("");

  const mains = useMemo(
    () => ((products as ProductRow[]) ?? []).filter(p => p.parentId === null),
    [products],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<number, ProductRow[]>();
    for (const p of (products as ProductRow[]) ?? []) {
      if (p.parentId !== null) {
        const arr = map.get(p.parentId) ?? [];
        arr.push(p);
        map.set(p.parentId, arr);
      }
    }
    return map;
  }, [products]);

  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success(parentForNew ? "Türev ürün eklendi" : "Ana ürün eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Ürün güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const deriveMany = trpc.products.deriveMany.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      toast.success(`${r.count} türev oluşturuldu`);
      setDeriveFor(null);
      setDeriveTypes(new Set());
    },
    onError: e => toast.error(e.message),
  });

  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Ürün silindi");
    },
    onError: e => toast.error(e.message),
  });

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateMain() {
    setEditing(null);
    setParentForNew(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openCreateVariant(parent: ProductRow) {
    setEditing(null);
    setParentForNew(parent);
    setForm({
      ...emptyForm,
      series: parent.series ?? "",
      colorCode: parent.colorCode ?? "",
      colorHex: parent.colorHex ?? "#1a1a1a",
      salePrice: parent.salePrice,
    });
    setDialogOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setParentForNew(null);
    setForm({
      name: p.name,
      series: p.series ?? "",
      colorCode: p.colorCode ?? "",
      colorHex: p.colorHex ?? "#1a1a1a",
      surfaceType: p.surfaceType ?? "",
      additives: p.additives ?? "",
      description: p.description ?? "",
      salePrice: p.salePrice,
      discountPercent: p.discountPercent,
      packagingCost: p.packagingCost,
      shippingCost: p.shippingCost,
      labelSize: p.labelSize ?? "",
      labelText: p.labelText ?? "",
      usageGuide: p.usageGuide ?? "",
      safetyNotes: p.safetyNotes ?? "",
      extraInfo: p.extraInfo ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Ürün adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      series: form.series || null,
      colorCode: form.colorCode || null,
      colorHex: form.colorHex || null,
      surfaceType: form.surfaceType || null,
      additives: form.additives || null,
      description: form.description || null,
      salePrice: parseFloat(form.salePrice) || 0,
      discountPercent: parseFloat(form.discountPercent) || 0,
      packagingCost: parseFloat(form.packagingCost) || 0,
      shippingCost: parseFloat(form.shippingCost) || 0,
      labelSize: form.labelSize || null,
      labelText: form.labelText || null,
      usageGuide: form.usageGuide || null,
      safetyNotes: form.safetyNotes || null,
      extraInfo: form.extraInfo || null,
    };
    if (editing) {
      updateProduct.mutate({ id: editing.id, data: payload });
    } else {
      createProduct.mutate({ ...payload, parentId: parentForNew?.id ?? null });
    }
  }

  const isVariantForm = !!parentForNew || (editing !== null && editing.parentId !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ürünler &amp; Türevler</h1>
          <p className="text-sm text-muted-foreground">
            Önce ana boyayı tanımlayın, ardından istediğiniz yüzey veya kullanım alanı için sınırsız türev ekleyin.
          </p>
        </div>
        <Button onClick={openCreateMain}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Ana Ürün
        </Button>
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && mains.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Henüz ürün yok</p>
          <p className="text-sm text-muted-foreground">
            "Yeni Ana Ürün" ile ilk boyanızı (örn. Siyah Boya) tanımlayın; sonra jant, araba, 3D baskı, ahşap gibi istediğiniz türevleri ekleyin.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {mains.map(main => {
          const variants = childrenOf.get(main.id) ?? [];
          const isOpen = expanded.has(main.id);
          return (
            <Card key={main.id} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggleExpand(main.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Kapat" : "Aç"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span
                  className="h-8 w-8 rounded-lg border shadow-inner shrink-0"
                  style={{ backgroundColor: main.colorHex ?? "#888" }}
                  title={main.colorCode ?? ""}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{main.name}</span>
                    {main.series && <Badge variant="secondary">{main.series}</Badge>}
                    {main.colorCode && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {main.colorCode}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {variants.length} türev · Satış: {formatTL(main.salePrice)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeriveFor(main);
                      setDeriveTypes(new Set());
                      setCustomType("");
                    }}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1" /> Hızlı Türet
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCreateVariant(main)}>
                    <Layers className="h-3.5 w-3.5 mr-1" /> Türev Ekle
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Formül defteri"
                    onClick={() => setLocation(`/formuller?urun=${main.id}`)}
                  >
                    <Beaker className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(main)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => {
                      if (confirm(`"${main.name}" ve tüm türevleri silinsin mi?`))
                        deleteProduct.mutate({ id: main.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t bg-muted/40 px-4 py-3 space-y-2">
                  {variants.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">
                      Bu ana ürünün henüz türevi yok. "Türev Ekle" ile jant boyası, 3D baskı boyası, ahşap boyası gibi
                      istediğiniz kullanım alanı için türev oluşturun.
                    </p>
                  )}
                  {variants.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3"
                    >
                      <span
                        className="h-6 w-6 rounded-md border shadow-inner shrink-0"
                        style={{ backgroundColor: v.colorHex ?? "#888" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{v.name}</span>
                          {v.surfaceType && (
                            <Badge className="bg-accent text-accent-foreground border-0 text-[10px]">
                              {v.surfaceType}
                            </Badge>
                          )}
                        </div>
                        {v.additives && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            Katkı: {v.additives}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-medium whitespace-nowrap">{formatTL(v.salePrice)}</span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Formül defteri"
                          onClick={() => setLocation(`/formuller?urun=${v.id}`)}
                        >
                          <Beaker className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`"${v.name}" türevi silinsin mi?`)) deleteProduct.mutate({ id: v.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? editing.parentId
                  ? "Türev Ürünü Düzenle"
                  : "Ana Ürünü Düzenle"
                : parentForNew
                  ? `Türev Ekle — ${parentForNew.name}`
                  : "Yeni Ana Ürün"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ürün Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={parentForNew ? "Örn. Siyah Jant Boyası" : "Örn. Siyah Boya"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Seri</Label>
                <Input
                  value={form.series}
                  onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                  placeholder="Örn. Meteor, Vivid, RAL"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Renk Kodu</Label>
                <Input
                  value={form.colorCode}
                  onChange={e => setForm(f => ({ ...f, colorCode: e.target.value }))}
                  placeholder="Örn. RAL 9005, M1128"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Renk Önizleme</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="h-9 w-14 rounded-md border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Satış Fiyatı (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Etiket Boyutu</Label>
                <Input
                  value={form.labelSize}
                  onChange={e => setForm(f => ({ ...f, labelSize: e.target.value }))}
                  placeholder="Örn. 6x9 cm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ek Bilgiler</Label>
                <Input
                  value={form.extraInfo}
                  onChange={e => setForm(f => ({ ...f, extraInfo: e.target.value }))}
                  placeholder="Turnusol/pH testi, barkod vb."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Etiket Yazısı</Label>
              <Textarea
                rows={2}
                value={form.labelText}
                onChange={e => setForm(f => ({ ...f, labelText: e.target.value }))}
                placeholder="Etiketin üzerinde yazan metin"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kullanım Kılavuzu</Label>
              <Textarea
                rows={3}
                value={form.usageGuide}
                onChange={e => setForm(f => ({ ...f, usageGuide: e.target.value }))}
                placeholder="Uygulama adımları, karışım oranı, kuruma süresi..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Güvenlik / Uyarılar</Label>
              <Textarea
                rows={2}
                value={form.safetyNotes}
                onChange={e => setForm(f => ({ ...f, safetyNotes: e.target.value }))}
                placeholder="Saklama koşulları, güvenlik uyarıları..."
              />
            </div>

            {isVariantForm && (
              <>
                <div className="space-y-1.5">
                  <Label>Yüzey / Kullanım Alanı</Label>
                  <Input
                    value={form.surfaceType}
                    onChange={e => setForm(f => ({ ...f, surfaceType: e.target.value }))}
                    placeholder="Serbest girin: jant, araba, 3D baskı, ahşap, plastik, metal, cam..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sabit liste yok — boyanın kullanılacağı her yüzey/alan için istediğiniz tanımı yazabilirsiniz.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Katkı Maddeleri ve Oran Farkları</Label>
                  <Textarea
                    value={form.additives}
                    onChange={e => setForm(f => ({ ...f, additives: e.target.value }))}
                    rows={2}
                    placeholder="Örn. %5 elastikiyet katkısı, %2 UV koruyucu; solvent oranı %10 azaltıldı"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Ürün hakkında notlar"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>İndirim %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercent}
                  onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ambalaj Maliyeti (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.packagingCost}
                  onChange={e => setForm(f => ({ ...f, packagingCost: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kargo Maliyeti (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shippingCost}
                  onChange={e => setForm(f => ({ ...f, shippingCost: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createProduct.isPending || updateProduct.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deriveFor !== null} onOpenChange={o => !o && setDeriveFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hızlı Türet — {deriveFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Seçtiğin yüzey tipleri için tek tıkla türev ürünler oluşturulur (fiyat ve renk ana
              üründen kopyalanır).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["Ahşap", "Metal", "Plastik", "Cam", "Seramik", "Jant", "3D Baskı", "Rapala / Yem", "Duvar / İç Mekan", "Airbrush"].map(t => (
                <button
                  key={t}
                  onClick={() =>
                    setDeriveTypes(prev => {
                      const next = new Set(prev);
                      if (next.has(t)) next.delete(t);
                      else next.add(t);
                      return next;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    deriveTypes.has(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customType}
                onChange={e => setCustomType(e.target.value)}
                placeholder="Kendi tipini ekle..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const t = customType.trim();
                  if (!t) return;
                  setDeriveTypes(prev => new Set(prev).add(t));
                  setCustomType("");
                }}
              >
                Ekle
              </Button>
            </div>
            {deriveTypes.size > 0 && (
              <p className="text-xs text-muted-foreground">
                Oluşturulacak: {Array.from(deriveTypes).map(t => `${deriveFor?.name} — ${t}`).join(", ")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeriveFor(null)}>
              İptal
            </Button>
            <Button
              disabled={deriveMany.isPending || deriveTypes.size === 0}
              onClick={() =>
                deriveFor &&
                deriveMany.mutate({ parentId: deriveFor.id, types: Array.from(deriveTypes) })
              }
            >
              {deriveTypes.size} Türev Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
