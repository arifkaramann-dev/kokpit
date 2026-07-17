import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  ChevronsUpDown,
  ClipboardList,
  Factory,
  History,
  ListPlus,
  PackageSearch,
  Search,
  Undo2,
  Warehouse,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import type { ProductRow } from "./Products";

/**
 * Üretim sayfası — dört bölüm:
 * 1. Özet şerit: bu ay / son 30 gün üretim, kuyruk durumu, kritik hammadde.
 * 2. Üretim Kuyruğu: eksi stok / kritik eşik altındaki mamuller + önerilen adet
 *    + hammadde hazırlık durumu (tıklayınca planlayıcıya dolar).
 * 3. Planlayıcı: aranabilir ürün seçici → reçeteden hammadde ihtiyacı, darboğaz,
 *    maliyet/marj özeti, eksikleri alınacaklara ekleme, parti notu.
 * 4. Üretim Geçmişi: arama + "daha fazla" ile son emirler, yanlış emri geri alma.
 */
export default function Production() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const plannerRef = useRef<HTMLDivElement>(null);

  const { data: products } = trpc.products.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const { data: formulaAll } = trpc.formula.all.useQuery();

  const [historyLimit, setHistoryLimit] = useState(50);
  const [historySearch, setHistorySearch] = useState("");
  const { data: runs } = trpc.production.runs.useQuery({ limit: historyLimit });

  const [productId, setProductId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qtyText, setQtyText] = useState("10");
  const [note, setNote] = useState("");
  const [queueExpanded, setQueueExpanded] = useState(false);
  const qty = Math.max(0, num(qtyText));

  const { data: formula } = trpc.formula.list.useQuery(
    { productId: Number(productId) },
    { enabled: !!productId },
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
      setNote("");
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

  const matById = useMemo(
    () => new Map((materials ?? []).map(m => [m.id, m])),
    [materials],
  );
  const supplierNameById = useMemo(
    () => new Map((suppliers ?? []).map(s => [s.id, s.name])),
    [suppliers],
  );

  // Ürün başına reçete kalemleri: "mevcut hammaddeyle kaç adet üretilebilir"
  // hesabı hem kuyrukta hem planlayıcıda kullanılır.
  const formulasByProduct = useMemo(() => {
    const map = new Map<number, { materialId: number; perUnit: number }[]>();
    for (const f of formulaAll ?? []) {
      const arr = map.get(f.productId) ?? [];
      arr.push({ materialId: f.materialId, perUnit: num(f.qty) });
      map.set(f.productId, arr);
    }
    return map;
  }, [formulaAll]);

  function maxProducibleOf(pid: number): number | null {
    const items = (formulasByProduct.get(pid) ?? []).filter(i => i.perUnit > 0);
    if (items.length === 0) return null;
    return Math.max(
      0,
      Math.floor(
        Math.min(...items.map(i => num(matById.get(i.materialId)?.stockQty) / i.perUnit)),
      ),
    );
  }

  // Ürün seçici: yalnız aktif ürünler, ana ürün → türev hiyerarşisiyle.
  const sortedProducts = useMemo(() => {
    const list = ((products as ProductRow[]) ?? []).filter(p => p.isActive !== 0);
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
  const labelById = useMemo(
    () => new Map(sortedProducts.map(({ p, label }) => [p.id, label])),
    [sortedProducts],
  );

  // Üretim kuyruğu: eksi stok = üretilecek; kritik eşik tanımlıysa eşik altı da
  // (Stok Nöbetçisi'yle aynı kural). Önerilen adet stoku eşiğe tamamlar.
  const queue = useMemo(() => {
    return sortedProducts
      .filter(({ p }) => p.stockQty < 0 || (p.criticalQty > 0 && p.stockQty <= p.criticalQty))
      .map(({ p, label }) => ({
        p,
        label,
        suggested: Math.max(1, (p.criticalQty > 0 ? p.criticalQty : 0) - p.stockQty),
        maxNow: maxProducibleOf(p.id),
      }))
      .sort((a, b) => a.p.stockQty - b.p.stockQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedProducts, formulasByProduct, matById]);
  const queueReady = queue.filter(q => q.maxNow !== null && q.maxNow >= q.suggested);
  const visibleQueue = queueExpanded ? queue : queue.slice(0, 8);

  // Özet şerit: geri alınan emirler sayılmaz.
  const stats = useMemo(() => {
    const active = (runs ?? []).filter(r => !(r.note?.startsWith("⛔") ?? false));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const inMonth = active.filter(r => new Date(r.createdAt) >= monthStart);
    const in30 = active.filter(r => new Date(r.createdAt) >= d30);
    return {
      monthQty: inMonth.reduce((s, r) => s + r.qty, 0),
      monthCount: inMonth.length,
      d30Qty: in30.reduce((s, r) => s + r.qty, 0),
      d30Count: in30.length,
    };
  }, [runs]);
  const criticalMaterials = useMemo(
    () =>
      (materials ?? []).filter(
        m => num(m.stockQty) < 0 || (num(m.criticalQty) > 0 && num(m.stockQty) <= num(m.criticalQty)),
      ),
    [materials],
  );

  // Planlayıcı hesapları.
  const selected = sortedProducts.find(({ p }) => String(p.id) === productId)?.p;
  const selectedLabel = selected ? (labelById.get(selected.id) ?? selected.name) : "";
  const selectedQueueItem = queue.find(q => String(q.p.id) === productId);

  const rows = (formula ?? []).map(f => {
    const m = matById.get(f.materialId);
    const perUnit = num(f.qty);
    const need = perUnit * qty;
    const stock = m ? num(m.stockQty) : 0;
    const ok = stock >= need;
    return {
      id: f.id,
      materialId: f.materialId,
      name: f.materialName ?? "?",
      unit: f.materialUnit ?? "",
      perUnit,
      need,
      stock,
      ok,
      missing: ok ? 0 : need - stock,
      cost: need * num(f.materialUnitCost),
      supplierId: m?.supplierId ?? null,
    };
  });
  const allOk = rows.length > 0 && rows.every(r => r.ok);
  const missingRows = rows.filter(r => !r.ok);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const unitCost = qty > 0 ? totalCost / qty : 0;
  const salePrice = selected ? num(selected.salePrice) : 0;
  const unitMargin = salePrice > 0 ? salePrice - unitCost : null;

  // Mevcut hammadde stokuyla üretilebilecek azami adet + darboğaz hammadde.
  const maxProducible = selected ? maxProducibleOf(selected.id) : null;
  const bottleneckId = useMemo(() => {
    const candidates = rows.filter(r => r.perUnit > 0);
    if (candidates.length < 2) return null;
    let best: { id: number; ratio: number } | null = null;
    for (const r of candidates) {
      const ratio = r.stock / r.perUnit;
      if (!best || ratio < best.ratio) best = { id: r.id, ratio };
    }
    return best?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, materials, qty]);

  function planFromQueue(id: number, suggested: number) {
    setProductId(String(id));
    setQtyText(String(suggested));
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filteredRuns = (runs ?? []).filter(r => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLocaleLowerCase("tr");
    return (
      (r.productName ?? "").toLocaleLowerCase("tr").includes(q) ||
      (r.note ?? "").toLocaleLowerCase("tr").includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Üretim</h1>
        <p className="text-sm text-muted-foreground">
          Kuyruktaki düşük stoklu mamulleri gör, üretimi planla — hammadde ihtiyacı, maliyet ve
          darboğaz otomatik hesaplanır. Kaydedince hammaddeler düşülür, mamul stok artar.
        </p>
      </div>

      {/* Özet şerit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Factory className="h-3.5 w-3.5" /> Bu Ay Üretim
          </div>
          <p className="mt-1 text-xl font-bold">{stats.monthQty} adet</p>
          <p className="text-xs text-muted-foreground">{stats.monthCount} emir</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Son 30 Gün
          </div>
          <p className="mt-1 text-xl font-bold">{stats.d30Qty} adet</p>
          <p className="text-xs text-muted-foreground">{stats.d30Count} emir</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" /> Üretim Kuyruğu
          </div>
          <p className={`mt-1 text-xl font-bold ${queue.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {queue.length} ürün
          </p>
          <p className="text-xs text-muted-foreground">
            {queue.length === 0
              ? "kuyruk boş"
              : `${queueReady.length} tanesi hemen üretilebilir`}
          </p>
        </Card>
        <Link href="/stok">
          <Card className="p-3 h-full cursor-pointer transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Warehouse className="h-3.5 w-3.5" /> Kritik Hammadde
            </div>
            <p className={`mt-1 text-xl font-bold ${criticalMaterials.length > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {criticalMaterials.length} kalem
            </p>
            <p className="text-xs text-muted-foreground">Stok &amp; Hammadde&apos;ye git →</p>
          </Card>
        </Link>
      </div>

      {/* Üretim kuyruğu */}
      {queue.length > 0 ? (
        <Card className="p-4 space-y-3 border-amber-300 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold text-sm">
              Üretim Kuyruğu — {queue.length} ürün düşük stokta
            </h2>
          </div>
          <div className="space-y-1.5">
            {visibleQueue.map(({ p, label, suggested, maxNow }) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <span
                  className="h-6 w-6 rounded-md border shadow-inner shrink-0"
                  style={{ backgroundColor: p.colorHex ?? "#888" }}
                  title={p.colorCode ?? ""}
                />
                <span className="font-medium flex-1 min-w-0 truncate" title={label}>
                  {label}
                </span>
                <span className={`whitespace-nowrap text-xs ${p.stockQty < 0 ? "text-rose-600 font-semibold" : "text-amber-600"}`}>
                  Stok: {p.stockQty}
                  {p.criticalQty > 0 && <span className="text-muted-foreground"> / eşik {p.criticalQty}</span>}
                </span>
                {maxNow === null ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    reçete yok
                  </Badge>
                ) : maxNow >= suggested ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> hammadde hazır
                  </Badge>
                ) : maxNow > 0 ? (
                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-800">
                    en fazla {maxNow} adet
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 dark:border-rose-800">
                    hammadde yok
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => planFromQueue(p.id, suggested)}>
                  <Factory className="h-3.5 w-3.5 mr-1" /> {suggested} adet planla
                </Button>
              </div>
            ))}
          </div>
          {queue.length > visibleQueue.length && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setQueueExpanded(true)}
            >
              {queue.length - visibleQueue.length} ürün daha göster
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Üretim kuyruğu boş — tüm mamul stoklar eşiğin üstünde.
        </div>
      )}

      {/* Planlayıcı */}
      <Card ref={plannerRef} className="p-5 space-y-4 scroll-mt-4">
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Üretim Planla</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ürün</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal"
                >
                  {selected ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-4 w-4 rounded border shadow-inner shrink-0"
                        style={{ backgroundColor: selected.colorHex ?? "#888" }}
                      />
                      <span className="truncate">{selectedLabel}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Ürün seç ya da ara...</span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="İsim, seri veya renk kodu ara..." />
                  <CommandList>
                    <CommandEmpty>Ürün bulunamadı.</CommandEmpty>
                    <CommandGroup>
                      {sortedProducts.map(({ p, label }) => (
                        <CommandItem
                          key={p.id}
                          value={`${label} ${p.series ?? ""} ${p.colorCode ?? ""} #${p.id}`}
                          onSelect={() => {
                            setProductId(String(p.id));
                            setPickerOpen(false);
                          }}
                        >
                          <span
                            className="h-4 w-4 rounded border shadow-inner shrink-0"
                            style={{ backgroundColor: p.colorHex ?? "#888" }}
                          />
                          <span className={`truncate ${p.parentId !== null ? "" : "font-medium"}`}>
                            {label}
                          </span>
                          <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            {!formulasByProduct.has(p.id) && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                reçete yok
                              </Badge>
                            )}
                            <span className={`text-xs ${p.stockQty < 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                              stok {p.stockQty}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Üretilecek Adet</Label>
            <Input
              type="number"
              min="1"
              value={qtyText}
              onChange={e => setQtyText(e.target.value)}
            />
            {selected && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {selectedQueueItem && selectedQueueItem.suggested !== qty && (
                  <button
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                    onClick={() => setQtyText(String(selectedQueueItem.suggested))}
                  >
                    Eşiğe tamamla: {selectedQueueItem.suggested}
                  </button>
                )}
                {maxProducible !== null && maxProducible > 0 && maxProducible !== qty && (
                  <button
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                    onClick={() => setQtyText(String(maxProducible))}
                  >
                    Azami: {maxProducible}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {!selected && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            <PackageSearch className="h-8 w-8 opacity-40" />
            <p>
              Kuyruktan bir ürüne <span className="font-medium">"planla"</span> de ya da yukarıdan
              ürün ara — hammadde ihtiyacı ve maliyet burada hesaplanır.
            </p>
          </div>
        )}

        {selected && (formula ?? []).length === 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <Beaker className="h-4 w-4 shrink-0" />
            Bu ürünün reçetesi yok — önce hammaddelerini tanımla.
            <Link href="/formuller" className="ml-auto">
              <Button size="sm" variant="outline">
                Formül Defteri&apos;ne git
              </Button>
            </Link>
          </div>
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
                      <TableCell className="font-medium">
                        {r.name}
                        {r.id === bottleneckId && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] text-amber-600 border-amber-300 dark:border-amber-800">
                            darboğaz
                          </Badge>
                        )}
                      </TableCell>
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

            {missingRows.length > 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-1">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Eksik hammaddeler — sipariş için tedarikçiler:
                </p>
                {missingRows.map(r => (
                  <p key={r.id} className="text-xs text-muted-foreground">
                    • {r.name}: {formatQty(r.missing)} {r.unit} eksik
                    {r.supplierId !== null && supplierNameById.has(r.supplierId) && (
                      <span> · tedarikçi: {supplierNameById.get(r.supplierId)}</span>
                    )}
                  </p>
                ))}
              </div>
            )}

            {/* Maliyet & marj özeti */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Hammadde Maliyeti</p>
                <p className="font-semibold">{formatTL(totalCost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Adet Başı Maliyet</p>
                <p className="font-semibold">{formatTL(unitCost)}</p>
              </div>
              {salePrice > 0 && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Satış Değeri ({qty} adet)</p>
                    <p className="font-semibold">{formatTL(salePrice * qty)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Birim Kâr (hammadde üstü)</p>
                    <p className={`font-semibold ${(unitMargin ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatTL(unitMargin ?? 0)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        · %{Math.round(((unitMargin ?? 0) / salePrice) * 100)}
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={200}
                placeholder="Parti / lot notu (isteğe bağlı) — örn. LOT-2607, sipariş için"
                className="flex-1 min-w-52"
              />
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
                  produce.mutate({
                    productId: Number(productId),
                    qty,
                    force: !allOk,
                    note: note.trim() || undefined,
                  });
                }}
              >
                <Factory className="h-4 w-4 mr-1" /> Üretimi Kaydet (stoktan düş)
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Üretim geçmişi */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Üretim Geçmişi</h2>
          {(runs ?? []).length > 0 && (
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Ürün veya not ara..."
                className="h-8 w-56 pl-8 text-sm"
              />
            </div>
          )}
        </div>
        {(runs ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Factory className="h-8 w-8 opacity-40" />
            <p>Henüz üretim kaydı yok — ilk üretimini yukarıdaki planlayıcıdan kaydet.</p>
          </div>
        ) : filteredRuns.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-sm text-muted-foreground">
            "{historySearch}" ile eşleşen üretim kaydı yok.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
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
                  {filteredRuns.map(run => {
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
            </div>
            {(runs ?? []).length >= historyLimit && historyLimit < 500 && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setHistoryLimit(l => Math.min(500, l + 100))}
                >
                  Daha eski kayıtları göster
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
