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
import { formatDate, formatQty, formatTL, MATERIAL_CATEGORIES, num, UNITS } from "@/lib/format";
import { useConfirm } from "@/components/ConfirmDialog";
import MaterialImport from "@/components/MaterialImport";
import { trpc } from "@/lib/trpc";
import { normalizeUnit } from "@shared/units";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileSpreadsheet,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

/**
 * Birim seçeneği — kullanıcı "gr mı ml mi" diye düşünmesin diye ne işe
 * yaradığı yazılı. Yanlış birim en pahalı hammadde hatası: kg fiyatlı kaleme
 * gram miktarı girilince maliyet 1000 katına çıkıyor.
 */
const UNIT_HINTS: Record<string, string> = {
  gr: "gram — pigment, toz katkı",
  kg: "kilogram — çuvalla alınan",
  ml: "mililitre — küçük hacim",
  lt: "litre — boya, solvent, tiner",
  adet: "adet — şişe, kapak, etiket",
};

/**
 * Kalem türü. `type` reçete motorunun temel ayrımı; hammadde formunda
 * görünmüyordu ve herkes "hammadde" olarak kalıyordu — ambalaj kalemleri de
 * dahil, ki bu maliyeti bozan hataların en sık kaynağı.
 */
const MATERIAL_TYPES = [
  { value: "hammadde", label: "Hammadde", desc: "Satın alınır, reçeteye girer" },
  { value: "ambalaj", label: "Ambalaj", desc: "Şişe, kapak, etiket, koli — hacimle ölçeklenmez" },
  { value: "yari_mamul", label: "Yarı mamul", desc: "Kendi reçetesi olan ara ürün" },
  { value: "masraf", label: "Masraf", desc: "Kapasiteyi kısıtlamaz" },
] as const;

type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  type?: "hammadde" | "yari_mamul" | "ambalaj" | "masraf";
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
  type: "hammadde" as MaterialRow["type"],
  stockQty: "",
  criticalQty: "",
  unitCost: "",
  supplierId: "",
  notes: "",
};

export default function Stock() {
  const { data: templateList } = trpc.templates.list.useQuery();
  const allCategories = useMemo(() => {
    const fromTemplates = (templateList ?? [])
      .filter(t => t.kind === "hammadde_kategori")
      .map(t => t.name);
    return Array.from(new Set([...MATERIAL_CATEGORIES, ...fromTemplates]));
  }, [templateList]);
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: materials, isLoading } = trpc.materials.list.useQuery();
  const { data: supplierList } = trpc.suppliers.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Diyalog içinden tedarikçi açma — akış kesilmesin.
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [stockDialog, setStockDialog] = useState<{ material: MaterialRow; type: "in" | "out" } | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reorderOpen, setReorderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { data: reorder } = trpc.materials.reorderSuggestions.useQuery();
  // Hareket geçmişi + "hangi ürünlerde kullanılıyor" dialogu.
  const [detailFor, setDetailFor] = useState<MaterialRow | null>(null);
  const { data: movementList } = trpc.materials.movements.useQuery(
    { materialId: detailFor?.id ?? 0 },
    { enabled: !!detailFor },
  );
  const { data: usageList } = trpc.materials.usage.useQuery(
    { materialId: detailFor?.id ?? 0 },
    { enabled: !!detailFor },
  );
  const supplierById = useMemo(
    () => new Map((supplierList ?? []).map(s => [s.id, s.name])),
    [supplierList],
  );

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
    let list = (materials as MaterialRow[]) ?? [];
    if (filter === "critical") list = list.filter(m => num(m.stockQty) <= num(m.criticalQty));
    else if (filter !== "all") list = list.filter(m => m.category === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        m => m.name.toLowerCase().includes(q) || (m.notes ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [materials, filter, search]);

  const utilsStock = trpc.useUtils();
  const createSupplier = trpc.suppliers.create.useMutation({
    onSuccess: (_r, vars) => {
      utilsStock.suppliers.list.invalidate().then(() => {
        // Yeni tedarikçi listeye düşer düşmez seçili hale getirilir.
        utilsStock.suppliers.list.fetch().then(list => {
          const hit = (list ?? []).find(x => x.name === vars.name);
          if (hit) setForm(f => ({ ...f, supplierId: String(hit.id) }));
        });
      });
      setNewSupplierOpen(false);
      setNewSupplierName("");
      toast.success("Tedarikçi eklendi ve seçildi");
    },
    onError: e => toast.error(e.message),
  });

  /** Diyalogdaki canlı stok değeri: miktar × birim maliyet. */
  const stockValue = useMemo(() => {
    const qty = parseFloat(form.stockQty) || 0;
    const unitCost = parseFloat(form.unitCost) || 0;
    const critical = parseFloat(form.criticalQty) || 0;
    return {
      qty,
      unitCost,
      total: qty * unitCost,
      criticalTotal: critical * unitCost,
    };
  }, [form.stockQty, form.unitCost, form.criticalQty]);

  /*
   * "Paketten hesapla": fatura "18 kg teneke 34.200 ₺" der, sistem birim
   * maliyet ister. Kullanıcı bunu kafadan bölerken virgül kaydırıyor ve
   * maliyet 10 kat şişiyordu. İki kutu + otomatik bölme o hatayı kapatıyor.
   */
  const [packQty, setPackQty] = useState("");
  const [packPrice, setPackPrice] = useState("");
  const packUnitCost = useMemo(() => {
    const q = parseFloat(packQty.replace(",", ".")) || 0;
    const p = parseFloat(packPrice.replace(",", ".")) || 0;
    return q > 0 && p > 0 ? p / q : 0;
  }, [packQty, packPrice]);

  /** Aynı adda kalem var mı? Mükerrer hammadde reçeteleri sessizce böler. */
  const duplicateName = useMemo(() => {
    const key = form.name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
    if (!key) return null;
    return (
      ((materials as MaterialRow[]) ?? []).find(
        m =>
          m.id !== editing?.id &&
          m.name.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ") === key,
      ) ?? null
    );
  }, [form.name, materials, editing]);

  /** Ad "100 ml şişe" gibiyse birim büyük ihtimalle "adet"tir — sessizce uyar. */
  const unitHint = useMemo(() => {
    const name = form.name.toLocaleLowerCase("tr-TR");
    const looksCountable = /(şişe|sise|kapak|etiket|koli|kutu|tabanca|maske|eldiven|bidon)/.test(name);
    if (looksCountable && normalizeUnit(form.unit) !== "adet") {
      return `"${form.name.trim()}" adetli bir kalem gibi duruyor — birimi "adet" yapmayı düşünün.`;
    }
    return null;
  }, [form.name, form.unit]);

  const criticalCount = useMemo(
    () => ((materials as MaterialRow[]) ?? []).filter(m => num(m.stockQty) <= num(m.criticalQty)).length,
    [materials],
  );

  // Envanter değeri: eldeki hammaddenin toplam maliyet karşılığı.
  const inventoryValue = useMemo(
    () =>
      ((materials as MaterialRow[]) ?? []).reduce(
        (sum, m) => sum + num(m.stockQty) * num(m.unitCost),
        0,
      ),
    [materials],
  );

  function resetPackCalc() {
    setPackQty("");
    setPackPrice("");
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setNewSupplierOpen(false);
    resetPackCalc();
    setDialogOpen(true);
  }

  function openEdit(m: MaterialRow) {
    setEditing(m);
    setForm({
      name: m.name,
      category: m.category,
      unit: m.unit,
      type: m.type ?? "hammadde",
      stockQty: m.stockQty,
      criticalQty: m.criticalQty,
      unitCost: m.unitCost,
      supplierId: m.supplierId ? String(m.supplierId) : "",
      notes: m.notes ?? "",
    });
    setNewSupplierOpen(false);
    resetPackCalc();
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Malzeme adı gerekli");
      return;
    }
    // Mükerrer kalem reçeteleri ikiye böler ve stok iki yerde birikir; yeni
    // kayıtta aynı adı sessizce kabul etmek yerine düzenlemeye yönlendir.
    if (!editing && duplicateName) {
      toast.error(`"${duplicateName.name}" zaten kayıtlı — onu düzenleyin.`, { duration: 7000 });
      return;
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      unit: normalizeUnit(form.unit) || form.unit,
      type: form.type,
      stockQty: parseFloat(form.stockQty) || 0,
      criticalQty: parseFloat(form.criticalQty) || 0,
      unitCost: parseFloat(form.unitCost) || 0,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel ile Yükle
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Yeni Hammadde
          </Button>
        </div>
      </div>

      <MaterialImport open={importOpen} onOpenChange={setImportOpen} />

      {criticalCount > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{criticalCount}</strong> malzeme kritik stok seviyesinin altında. Tedarik siparişi vermeyi düşünün.
          </p>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setReorderOpen(v => !v)}>
            {reorderOpen ? "Öneriyi Gizle" : "Sipariş Önerisi"}
          </Button>
        </Card>
      )}

      {reorderOpen && reorder && reorder.suggestions.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
            <div>
              <p className="font-semibold text-sm">Yeniden Sipariş Önerisi</p>
              <p className="text-xs text-muted-foreground">
                {reorder.summary.count} kalem · tahmini toplam {formatTL(reorder.summary.totalCost)}
                {reorder.summary.withoutSupplier > 0 && ` · ${reorder.summary.withoutSupplier} kalemde tedarikçi yok`}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                  <th className="p-2 pl-4">Hammadde</th>
                  <th className="p-2 text-right">Stok / Eşik</th>
                  <th className="p-2 text-right">Önerilen Alım</th>
                  <th className="p-2">Tedarikçi</th>
                  <th className="p-2 text-right">Tahmini Maliyet</th>
                </tr>
              </thead>
              <tbody>
                {reorder.suggestions.map(s => (
                  <tr key={s.materialId} className="border-b last:border-0">
                    <td className="p-2 pl-4 font-medium">{s.name}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      <span className="text-rose-600 font-medium">{s.stock}</span> / {s.critical} {s.unit}
                    </td>
                    <td className="p-2 text-right font-semibold">
                      {s.suggestedQty} {s.unit}
                    </td>
                    <td className="p-2">
                      {s.supplierName ?? <span className="text-amber-600 text-xs">— tanımsız</span>}
                    </td>
                    <td className="p-2 text-right">{formatTL(s.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2.5">
            <Button size="sm" variant="outline" onClick={() => setLocation("/faturalar")}>
              Alış Faturası Oluştur
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              Öneri = stoğu kritik eşiğin 2 katına tamamlar.
            </span>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hammadde ara..."
            className="pl-8"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Kategoriler</SelectItem>
            <SelectItem value="critical">⚠ Kritik Stok</SelectItem>
            {allCategories.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} malzeme</span>
        <span className="ml-auto text-sm text-muted-foreground">
          Envanter değeri: <span className="font-semibold text-foreground">{formatTL(inventoryValue)}</span>
        </span>
      </div>

      <Card className="overflow-x-auto p-0">
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
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {[m.supplierId ? supplierById.get(m.supplierId) : null, m.notes]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">{m.category}</Badge>
                      {/* Tür yalnız "hammadde" değilse gösterilir: reçete
                          motorunun davranışı buna göre değişiyor, görünmez
                          kalması maliyet hatalarının sık kaynağıydı. */}
                      {m.type && m.type !== "hammadde" && (
                        <Badge variant="outline" className="text-[10px]">
                          {MATERIAL_TYPES.find(t => t.value === m.type)?.label ?? m.type}
                        </Badge>
                      )}
                    </div>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Hareket geçmişi + hangi ürünlerde kullanılıyor"
                        onClick={() => setDetailFor(m)}
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Hammaddeyi sil",
                              description: `"${m.name}" silinsin mi? Formüllerdeki kayıtları da silinir.`,
                              confirmText: "Sil",
                              destructive: true,
                            })
                          )
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Hammaddeyi Düzenle" : "Yeni Hammadde"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Malzeme Adı *</Label>
              <Input
                autoFocus={!editing}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. Siyah Pigment, 100 ml Cam Şişe"
                className={!editing && duplicateName ? "border-destructive" : undefined}
              />
              {!editing && duplicateName && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Bu isimde bir kalem zaten var ({formatQty(duplicateName.stockQty)}{" "}
                  {duplicateName.unit}).
                  <button
                    type="button"
                    className="underline"
                    onClick={() => openEdit(duplicateName)}
                  >
                    Onu düzenle
                  </button>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map(c => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Raporlama/gruplama içindir.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Kalem Türü</Label>
                <Select
                  value={form.type ?? "hammadde"}
                  onValueChange={v => setForm(f => ({ ...f, type: v as MaterialRow["type"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {MATERIAL_TYPES.find(t => t.value === (form.type ?? "hammadde"))?.desc}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Birim *</Label>
              <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => (
                    <SelectItem key={u} value={u}>
                      {UNIT_HINTS[u] ?? u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Birim hem stoğun hem FİYATIN birimidir; ikisinin ayrı olduğunu
                  sanmak en sık yapılan hata (kg alıp gr fiyatı yazmak). */}
              <p className="text-[11px] text-muted-foreground">
                Hem stok hem birim maliyet bu birimden yazılır: <strong>1 {form.unit}</strong> kaça
                mal oluyor?
              </p>
              {unitHint && (
                <p className="flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {unitHint}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Mevcut Stok ({form.unit})</Label>
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
                <Label>Kritik Eşik ({form.unit})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.criticalQty}
                  onChange={e => setForm(f => ({ ...f, criticalQty: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">Altına düşünce uyarır.</p>
              </div>
              <div className="space-y-1.5">
                <Label>1 {form.unit} maliyeti (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.unitCost}
                  onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                  placeholder="0,00"
                />
                <p className="text-[11px] text-muted-foreground">KDV hariç.</p>
              </div>
            </div>

            {/* Paketten hesapla: fatura "18 kg — 34.200 ₺" der, sistem birim
                fiyat ister. Bölmeyi kafadan yaparken virgül kayıyordu. */}
            <details className="rounded-lg border bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-medium">
                Faturadaki paket fiyatından hesapla
              </summary>
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Paket miktarı ({form.unit})</Label>
                  <Input
                    value={packQty}
                    onChange={e => setPackQty(e.target.value)}
                    placeholder="18"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Paket fiyatı (₺)</Label>
                  <Input
                    value={packPrice}
                    onChange={e => setPackPrice(e.target.value)}
                    placeholder="34200"
                    inputMode="decimal"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={packUnitCost <= 0}
                  onClick={() => {
                    setForm(f => ({ ...f, unitCost: String(Math.round(packUnitCost * 10000) / 10000) }));
                    toast.success(`Birim maliyet ${formatTL(packUnitCost)}/${form.unit} yapıldı`);
                  }}
                >
                  Uygula
                </Button>
              </div>
              {packUnitCost > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  = <strong className="text-foreground">{formatTL(packUnitCost)}</strong> / {form.unit}
                </p>
              )}
            </details>

            {/* Stok değeri canlı: "1000 gr × 1,90 ₺ = 1.900 ₺" — rakamı
                girerken tutarı görmek yanlış birim/fiyat hatasını anında
                yakalatıyor. */}
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              {stockValue.qty > 0 && stockValue.unitCost > 0 ? (
                <>
                  <span className="font-mono">
                    {formatQty(stockValue.qty)} {form.unit} × {formatTL(stockValue.unitCost)}/
                    {form.unit}
                  </span>{" "}
                  = <strong>{formatTL(stockValue.total)}</strong>
                  {stockValue.criticalTotal > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      · kritik eşik değeri {formatTL(stockValue.criticalTotal)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Stok ve birim maliyet girilince toplam değer burada görünür.
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label>Tedarikçi</Label>
                {/* Tedarikçi yoksa akış kesiliyordu: kullanıcı diyaloğu
                    kapatıp Tedarikçiler sayfasına gidip geri dönüyordu. */}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => setNewSupplierOpen(v => !v)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {newSupplierOpen ? "Vazgeç" : "Yeni tedarikçi"}
                </Button>
              </div>

              {newSupplierOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    placeholder="Tedarikçi adı"
                    className="min-w-48 flex-1"
                    onKeyDown={e => {
                      if (e.key === "Enter" && newSupplierName.trim()) {
                        e.preventDefault();
                        createSupplier.mutate({ name: newSupplierName.trim() });
                      }
                    }}
                  />
                  <Button
                    type="button"
                    disabled={!newSupplierName.trim() || createSupplier.isPending}
                    onClick={() => createSupplier.mutate({ name: newSupplierName.trim() })}
                  >
                    Ekle ve seç
                  </Button>
                </div>
              ) : (
                <Select
                  value={form.supplierId || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, supplierId: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tedarikçi seç (opsiyonel)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Tedarikçi yok —</SelectItem>
                    {(supplierList ?? []).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(supplierList ?? []).length === 0 && !newSupplierOpen && (
                <p className="text-[11px] text-muted-foreground">
                  Kayıtlı tedarikçi yok — "Yeni tedarikçi" ile buradan ekleyebilirsiniz.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notlar</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Ürün kodu, parti bilgisi vb."
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

      {/* Hareket geçmişi + kullanım dialogu */}
      <Dialog open={!!detailFor} onOpenChange={open => !open && setDetailFor(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailFor?.name} — Hareketler &amp; Kullanım</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Bu hammaddeyi kullanan reçeteler
              </p>
              {(usageList ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground py-1">
                  Hiçbir ürün reçetesinde geçmiyor.
                </p>
              )}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {(usageList ?? []).map((u, i) => (
                  <div
                    key={`${u.productId}-${i}`}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium flex-1 min-w-0 truncate">
                      {u.productName ?? "Silinmiş ürün"}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatQty(u.qty)} {detailFor?.unit}/adet
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Son stok hareketleri
              </p>
              {(movementList ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground py-1">Henüz hareket kaydı yok.</p>
              )}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(movementList ?? []).map(mv => (
                  <div
                    key={mv.id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatDate(mv.createdAt)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${mv.type === "in" ? "text-emerald-600 border-emerald-300" : "text-rose-600 border-rose-300"}`}
                    >
                      {mv.type === "in" ? "+" : "−"}
                      {formatQty(mv.qty)} {detailFor?.unit}
                    </Badge>
                    <span className="text-muted-foreground truncate">{mv.note ?? "-"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
