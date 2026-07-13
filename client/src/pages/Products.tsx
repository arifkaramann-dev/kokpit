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
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Beaker, ChevronDown, ChevronRight, Download, Layers, Package, Pencil, Percent, Plus, Printer, Search, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import TemplatePicker from "@/components/TemplatePicker";
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
  packaging: string | null;
  barcode: string | null;
  stockQty: number;
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
  packaging: "",
  barcode: "",
  stockQty: "",
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
  const [derivePacks, setDerivePacks] = useState<Set<string>>(new Set());
  const [deriveColors, setDeriveColors] = useState<Set<string>>(new Set());
  const [customPack, setCustomPack] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [deriveSets, setDeriveSets] = useState<Set<string>>(new Set());
  const [customSet, setCustomSet] = useState("");
  const { data: templateList } = trpc.templates.list.useQuery();
  const { data: imageRefs } = trpc.products.allImageRefs.useQuery();
  const packOptions = (templateList ?? []).filter(t => t.kind === "ambalaj").map(t => t.name);
  const colorOptions = (templateList ?? []).filter(t => t.kind === "renk").map(t => t.name);
  const setOptions = (templateList ?? []).filter(t => t.kind === "set_paket").map(t => t.name);
  const { data: productImages } = trpc.products.images.useQuery(
    { productId: editing?.id ?? 0 },
    { enabled: !!editing },
  );
  const setImage = trpc.products.setImage.useMutation({
    onSuccess: () => {
      utils.products.images.invalidate();
      toast.success("Görsel kaydedildi");
    },
    onError: e => toast.error(e.message),
  });
  const deleteImage = trpc.products.deleteImage.useMutation({
    onSuccess: () => utils.products.images.invalidate(),
  });

  const [search, setSearch] = useState("");

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

  // Arama: ana ürünün kendisi ya da türevlerinden biri eşleşirse göster.
  const mains = useMemo(() => {
    const all = ((products as ProductRow[]) ?? []).filter(p => p.parentId === null);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.series ?? "").toLowerCase().includes(q) ||
        (childrenOf.get(p.id) ?? []).some(c => c.name.toLowerCase().includes(q)),
    );
  }, [products, search, childrenOf]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("10");
  const [bulkSeries, setBulkSeries] = useState<string>("__all__");
  const seriesList = useMemo(
    () =>
      Array.from(
        new Set(((products as ProductRow[]) ?? []).map(p => p.series).filter((s): s is string => Boolean(s))),
      ),
    [products],
  );
  const bulkPrice = trpc.products.bulkPrice.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      setBulkOpen(false);
      toast.success(`${r.affected} ürünün fiyatı güncellendi`);
    },
    onError: e => toast.error(e.message),
  });

  const pushTrendyol = trpc.products.pushToTrendyol.useMutation({
    onSuccess: r =>
      toast.success(
        `Trendyol'a ${r.sent} ürünün stok/fiyatı gönderildi${r.batchRequestId ? ` (parti: ${r.batchRequestId})` : ""}`,
        { duration: 8000 },
      ),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // Satışa hazır katalog dosyası: Excel/pazaryeri şablonlarına yapıştırılabilir.
  function exportCsv() {
    const rows = (products as ProductRow[]) ?? [];
    if (rows.length === 0) return toast.error("Dışa aktarılacak ürün yok");
    // Görselleri herkese açık link olarak ekle (web sitesi/pazaryeri kullanabilsin).
    const origin = window.location.origin;
    const imgSet = new Set((imageRefs ?? []).map(r => `${r.productId}:${r.kind}`));
    const imgUrl = (id: number, kind: "main" | "packaging" | "usage") =>
      imgSet.has(`${id}:${kind}`) ? `${origin}/api/img/${id}/${kind}` : "";
    const cols = [
      "Ürün Adı", "Tür", "Barkod", "Seri", "Renk Kodu", "Kullanım/Yüzey", "Ambalaj",
      "Stok", "Satış Fiyatı", "İndirim %", "Açıklama", "Etiket Boyutu", "Etiket Yazısı",
      "Kullanım Kılavuzu", "Güvenlik", "Ek Bilgi",
      "Ana Görsel", "Ambalaj Görseli", "Kullanım Görseli", "Tüm Görseller",
    ];
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map(p => {
      const main = imgUrl(p.id, "main");
      const pack = imgUrl(p.id, "packaging");
      const usage = imgUrl(p.id, "usage");
      const all = [main, pack, usage].filter(Boolean).join(" | ");
      return [
        p.name, p.parentId === null ? "Ana Ürün" : "Türev", p.barcode, p.series, p.colorCode,
        p.surfaceType, p.packaging, p.stockQty, p.salePrice, p.discountPercent, p.description,
        p.labelSize, p.labelText, p.usageGuide, p.safetyNotes, p.extraInfo,
        main, pack, usage, all,
      ].map(esc).join(";");
    });
    // BOM: Türkçe karakterler Excel'de doğru açılsın.
    const blob = new Blob(["﻿" + [cols.join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `artofcolour-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${rows.length} ürün dışa aktarıldı`);
  }

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
      packaging: p.packaging ?? "",
      barcode: p.barcode ?? "",
      stockQty: p.stockQty != null ? String(p.stockQty) : "",
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
      packaging: form.packaging || null,
      barcode: form.barcode.trim() || null,
      stockQty: parseInt(form.stockQty, 10) || 0,
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => pushTrendyol.mutate({})}
            disabled={pushTrendyol.isPending}
            title="Barkodlu ürünlerin stok ve fiyatını Trendyol'a gönder"
          >
            <Store className="h-4 w-4 mr-1" /> Trendyol'a Gönder
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Percent className="h-4 w-4 mr-1" /> Toplu Fiyat
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Dışa Aktar
          </Button>
          <Button onClick={openCreateMain}>
            <Plus className="h-4 w-4 mr-1" /> Yeni Ana Ürün
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ürün veya türev ara..."
          className="pl-8"
        />
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && mains.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">{search ? "Aramayla eşleşen ürün yok" : "Henüz ürün yok"}</p>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Farklı bir kelime dene veya aramayı temizle."
              : '"Yeni Ana Ürün" ile ilk boyanızı (örn. Siyah Boya) tanımlayın; sonra jant, araba, 3D baskı, ahşap gibi istediğiniz türevleri ekleyin.'}
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
                    {variants.length} türev · Satış: {formatTL(main.salePrice)} · Stok:{" "}
                    <span className={main.stockQty <= 0 ? "text-rose-600 font-medium" : main.stockQty < 5 ? "text-amber-600 font-medium" : ""}>
                      {main.stockQty}
                    </span>
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Etiket yazdır"
                    onClick={() => printLabel(main)}
                  >
                    <Printer className="h-3.5 w-3.5" />
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
                          title="Etiket yazdır"
                          onClick={() => printLabel(v)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
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
                <Label>Barkod (pazaryeri eşleştirme)</Label>
                <Input
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="Trendyol/HB barkodu"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Stok Adedi</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stockQty}
                  onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Ambalaj</Label>
                  <TemplatePicker kind="ambalaj" onPick={t => setForm(f => ({ ...f, packaging: t.name }))} />
                </div>
                <Input
                  value={form.packaging}
                  onChange={e => setForm(f => ({ ...f, packaging: e.target.value }))}
                  placeholder="Örn. 400 ml Sprey"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Etiket Boyutu</Label>
                  <TemplatePicker kind="etiket_boyutu" onPick={t => setForm(f => ({ ...f, labelSize: t.name }))} />
                </div>
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
              <div className="flex items-center justify-between">
                <Label>Etiket Yazısı</Label>
                <TemplatePicker kind="etiket_yazisi" onPick={t => setForm(f => ({ ...f, labelText: t.content ?? t.name }))} />
              </div>
              <Textarea
                rows={2}
                value={form.labelText}
                onChange={e => setForm(f => ({ ...f, labelText: e.target.value }))}
                placeholder="Etiketin üzerinde yazan metin"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Kullanım Kılavuzu</Label>
                <TemplatePicker kind="kilavuz" onPick={t => setForm(f => ({ ...f, usageGuide: t.content ?? t.name }))} />
              </div>
              <Textarea
                rows={3}
                value={form.usageGuide}
                onChange={e => setForm(f => ({ ...f, usageGuide: e.target.value }))}
                placeholder="Uygulama adımları, karışım oranı, kuruma süresi..."
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Güvenlik / Uyarılar</Label>
                <TemplatePicker kind="guvenlik" onPick={t => setForm(f => ({ ...f, safetyNotes: t.content ?? t.name }))} />
              </div>
              <Textarea
                rows={2}
                value={form.safetyNotes}
                onChange={e => setForm(f => ({ ...f, safetyNotes: e.target.value }))}
                placeholder="Saklama koşulları, güvenlik uyarıları..."
              />
            </div>

            {editing && (
              <div className="space-y-1.5">
                <Label>Görseller</Label>
                <div className="grid grid-cols-3 gap-2">
                  <ImageSlot
                    label="1. Ana / Pazarlama"
                    kind="main"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                  <ImageSlot
                    label="2. Ambalaj"
                    kind="packaging"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                  <ImageSlot
                    label="3. Kullanım"
                    kind="usage"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                </div>
              </div>
            )}
            {!editing && (
              <p className="text-[11px] text-muted-foreground">
                Görselleri eklemek için ürünü kaydettikten sonra düzenle penceresini aç.
              </p>
            )}

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
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hızlı Türet — {deriveFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Seçtiğin kullanım × ambalaj × renk kombinasyonları için satışa hazır başlıklarla
              türevler oluşturulur. Örn: "Artofcolour Jant {deriveFor?.name} 400 ml Sprey Antrasit Gri"
            </p>
            <ChipGroup
              title="Kullanım / Yüzey"
              options={["Ahşap", "Metal", "Plastik", "Cam", "Seramik", "Jant", "3D Baskı", "Rapala / Yem", "Duvar / İç Mekan", "Airbrush"]}
              selected={deriveTypes}
              setSelected={setDeriveTypes}
              custom={customType}
              setCustom={setCustomType}
            />
            <ChipGroup
              title="Ambalaj (Şablonlar sayfasından yönetilir)"
              options={packOptions.length ? packOptions : ["400 ml Sprey", "1 L Teneke", "250 ml Şişe"]}
              selected={derivePacks}
              setSelected={setDerivePacks}
              custom={customPack}
              setCustom={setCustomPack}
            />
            <ChipGroup
              title="Renk (Şablonlar sayfasından yönetilir)"
              options={colorOptions.length ? colorOptions : ["Açık Gri", "Antrasit Gri", "Siyah", "Beyaz"]}
              selected={deriveColors}
              setSelected={setDeriveColors}
              custom={customColor}
              setCustom={setCustomColor}
            />
            <ChipGroup
              title="Set / Paket (fiyat ve ambalaj maliyeti adetle çarpılır)"
              options={setOptions.length ? setOptions : ["2'li Set", "3'lü Set", "5'li Paket"]}
              selected={deriveSets}
              setSelected={setDeriveSets}
              custom={customSet}
              setCustom={setCustomSet}
            />
            {(() => {
              const total =
                Math.max(deriveTypes.size, 1) *
                Math.max(derivePacks.size, 1) *
                Math.max(deriveColors.size, 1) *
                Math.max(deriveSets.size, 1);
              const any = deriveTypes.size + derivePacks.size + deriveColors.size + deriveSets.size > 0;
              return any ? (
                <p className="text-xs font-medium">
                  {total} türev oluşturulacak
                  {total > 60 ? " — çok fazla, seçimleri azalt (en fazla 60)" : ""}
                </p>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeriveFor(null)}>
              İptal
            </Button>
            <Button
              disabled={
                deriveMany.isPending ||
                deriveTypes.size + derivePacks.size + deriveColors.size + deriveSets.size === 0
              }
              onClick={() =>
                deriveFor &&
                deriveMany.mutate({
                  parentId: deriveFor.id,
                  uses: Array.from(deriveTypes),
                  packagings: Array.from(derivePacks),
                  colors: Array.from(deriveColors),
                  sets: Array.from(deriveSets),
                })
              }
            >
              Türevleri Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Fiyat Güncelleme</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tüm ürünlerin (veya bir serinin) satış fiyatını yüzdeyle artır ya da azalt.
              Örn. %10 zam için 10, %5 indirim için -5 yaz.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Yüzde (%)</Label>
                <Input
                  type="number"
                  value={bulkPercent}
                  onChange={e => setBulkPercent(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kapsam</Label>
                <Select value={bulkSeries} onValueChange={setBulkSeries}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tüm ürünler</SelectItem>
                    {seriesList.map(s => (
                      <SelectItem key={s} value={s}>
                        Seri: {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(() => {
              const pct = parseFloat(bulkPercent.replace(",", "."));
              if (isNaN(pct) || pct === 0) return null;
              const count =
                bulkSeries === "__all__"
                  ? ((products as ProductRow[]) ?? []).length
                  : ((products as ProductRow[]) ?? []).filter(p => p.series === bulkSeries).length;
              return (
                <p className="text-xs font-medium">
                  {count} ürünün fiyatı {pct > 0 ? `%${pct} artacak` : `%${Math.abs(pct)} düşecek`}.
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={bulkPrice.isPending}
              onClick={() => {
                const pct = parseFloat(bulkPercent.replace(",", "."));
                if (isNaN(pct) || pct === 0) return toast.error("Geçerli bir yüzde gir");
                if (pct < -90 || pct > 500) return toast.error("Yüzde -90 ile 500 arasında olmalı");
                bulkPrice.mutate({
                  percent: pct,
                  series: bulkSeries === "__all__" ? null : bulkSeries,
                });
              }}
            >
              Uygula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ürün etiketini yazdırma penceresinde açar; boyutu etiket boyutundan (örn. "6x9 cm") alır. */
function printLabel(p: ProductRow) {
  const dims = (p.labelSize ?? "").match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  const w = dims ? dims[1].replace(",", ".") : "6";
  const h = dims ? dims[2].replace(",", ".") : "9";
  const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>");
  const win = window.open("", "_blank", "width=640,height=800");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Etiket — ${esc(p.name)}</title>
<style>
  @page { size: ${w}cm ${h}cm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  .label { width: ${w}cm; height: ${h}cm; padding: 0.25cm; display: flex; flex-direction: column; border: 1px dashed #bbb; overflow: hidden; }
  @media print { .label { border: none; } }
  .brand { font-size: 0.32cm; font-weight: 800; letter-spacing: 0.06cm; text-transform: uppercase; }
  .name { font-size: 0.42cm; font-weight: 700; margin-top: 0.12cm; line-height: 1.15; }
  .pack { font-size: 0.28cm; color: #333; margin-top: 0.06cm; }
  .text { font-size: 0.24cm; margin-top: 0.15cm; line-height: 1.3; flex: 1; overflow: hidden; }
  .safety { font-size: 0.19cm; color: #444; margin-top: 0.12cm; border-top: 0.5px solid #999; padding-top: 0.08cm; line-height: 1.25; }
</style></head><body>
<div class="label">
  <div class="brand">Art of Colour</div>
  <div class="name">${esc(p.name)}</div>
  ${p.packaging || p.colorCode ? `<div class="pack">${esc([p.packaging, p.colorCode].filter(Boolean).join(" · "))}</div>` : ""}
  ${p.labelText ? `<div class="text">${esc(p.labelText)}</div>` : ""}
  ${p.safetyNotes ? `<div class="safety">${esc(p.safetyNotes)}</div>` : ""}
</div>
<script>window.onload = () => window.print();</script>
</body></html>`);
  win.document.close();
}

function ChipGroup({
  title,
  options,
  selected,
  setSelected,
  custom,
  setCustom,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  setSelected: (fn: (prev: Set<string>) => Set<string>) => void;
  custom: string;
  setCustom: (v: string) => void;
}) {
  const all = Array.from(new Set([...options, ...Array.from(selected)]));
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {all.map(t => (
          <button
            key={t}
            onClick={() =>
              setSelected(prev => {
                const next = new Set(prev);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                return next;
              })
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected.has(t) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Kendi değerini ekle..." className="h-8 text-xs" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const t = custom.trim();
            if (!t) return;
            setSelected(prev => new Set(prev).add(t));
            setCustom("");
          }}
        >
          Ekle
        </Button>
      </div>
    </div>
  );
}

function ImageSlot({
  label,
  kind,
  images,
  onUpload,
  onDelete,
}: {
  label: string;
  kind: "main" | "packaging" | "usage";
  productId: number;
  images: { kind: string; data: string }[] | undefined;
  onUpload: (kind: "main" | "packaging" | "usage", data: string) => void;
  onDelete: (kind: "main" | "packaging" | "usage") => void;
}) {
  const existing = images?.find(i => i.kind === kind);
  function handleFile(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      onUpload(kind, canvas.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <label className="block cursor-pointer">
        {existing ? (
          <img src={existing.data} alt={label} className="h-20 w-full rounded-md border object-cover" />
        ) : (
          <div className="flex h-20 w-full items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
            + Yükle
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {existing && (
        <button type="button" onClick={() => onDelete(kind)} className="text-[10px] text-destructive hover:underline">
          Kaldır
        </button>
      )}
    </div>
  );
}