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
  Factory,
  History,
  ListPlus,
  Loader2,
  PackageSearch,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

/**
 * Üretim sayfası — v3 kataloğu üzerine.
 *
 * Eski sayfa `products` ağacını okuyordu ve kuyruğu MAMUL STOĞUNA bakarak
 * kuruyordu (eksi stok = üret). Siparişe göre üretimde mamul stok tutulmadığı
 * için o kuyruk pratikte hep boştu. Yeni kuyruk AÇIK SİPARİŞ TALEBİNDEN gelir;
 * tampon tutulan ürünler için kritik eşik ikinci sırada durur.
 *
 * Hammadde düşümü de değişti: eski uç tek seviyeli reçete okuyordu, yarı mamul
 * içeren reçetelerde eksik düşüyordu. Yeni uç (`produceMaster`) çok seviyeli
 * BOM'u hammaddeye kadar patlatır.
 *
 * Üç bölüm — her bölümde tek iş:
 * 1. Kuyruk: ne üretilmeli, neden, ne kadar
 * 2. Planlayıcı: seçilen ürün için hammadde ihtiyacı ve eksikler → üret
 * 3. Geçmiş: son üretim emirleri
 */
export default function Production() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const plannerRef = useRef<HTMLDivElement>(null);

  const { data: catalog } = trpc.katalog.sellableList.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: queue } = trpc.katalog.productionQueue.useQuery();

  const [historyLimit, setHistoryLimit] = useState(50);
  const { data: runs } = trpc.katalog.productionRuns.useQuery({ limit: historyLimit });

  const [masterId, setMasterId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qtyText, setQtyText] = useState("10");
  const [note, setNote] = useState("");
  const [queueExpanded, setQueueExpanded] = useState(false);
  const qty = Math.max(0, num(qtyText));

  const { data: preview } = trpc.katalog.productionPreview.useQuery(
    { masterId: masterId ?? 0, qty: qty || 1 },
    { enabled: masterId != null && qty > 0 },
  );

  const invalidateAll = () => {
    utils.materials.invalidate();
    utils.katalog.invalidate();
    utils.dashboard.summary.invalidate();
  };

  const produce = trpc.katalog.produceMaster.useMutation({
    onSuccess: (r, vars) => {
      invalidateAll();
      setNote("");
      toast.success(
        `Üretim kaydedildi — ${r.deducted} kalem düşüldü, mamul stok +${vars.qty}` +
          (r.shortages.length > 0 ? ` · eksikle zorlandı: ${r.shortages.join(", ")}` : ""),
        { duration: r.shortages.length > 0 ? 12000 : 6000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const addTask = trpc.tasks.create.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
  });

  /*
   * "Üretmediğini satamama" durumunu kaldıran düğme.
   *
   * İlan miktarı varsayılan olarak hammaddeden üretilebilir adetten gelir;
   * reçetesi bağlanmamış ya da hammaddesi biten ürün ilanda 0 yazıp satışa
   * kapanıyor. İş modeli sipariş üzerine üretim olduğu için bu doğrudan
   * sipariş kaybı — kaç ürünün böyle kapandığını görmek bile mümkün değildi.
   */
  const { data: closedPreview } = trpc.katalog.masters.useQuery(undefined, {
    select: rows =>
      (rows ?? []).filter(
        m =>
          m.status !== "arsiv" &&
          Number(m.buildableQty ?? 0) <= 0 &&
          m.salesMode !== "tedarikli" &&
          m.salesMode !== "stoktan",
      ).length,
  });

  const keepSellable = trpc.katalog.keepSellable.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(
        `${r.updated} ürün satışta tutuldu — hammadde bitse de ilan kapanmayacak (termin süresiyle satılır).`,
        { duration: 10000 },
      );
    },
    onError: e => toast.error(e.message),
  });

  const produceQueue = trpc.katalog.produceBriefing.useMutation({
    onSuccess: r => {
      invalidateAll();
      toast.success(
        `${r.produced} üründe ${r.units} adet üretim işlendi` +
          (r.shortages.length > 0 ? ` · eksik stokla: ${r.shortages.slice(0, 4).join(", ")}` : ""),
        { duration: 12000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const catalogById = useMemo(
    () => new Map((catalog ?? []).map(c => [c.masterId, c])),
    [catalog],
  );
  const selected = masterId != null ? catalogById.get(masterId) : undefined;

  const criticalMaterials = useMemo(
    () =>
      (materials ?? []).filter(
        m => num(m.criticalQty) > 0 && num(m.stockQty) <= num(m.criticalQty),
      ),
    [materials],
  );

  const pick = (id: number) => {
    setMasterId(id);
    setPickerOpen(false);
    plannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const queueRows = queue?.rows ?? [];
  const shown = queueExpanded ? queueRows : queueRows.slice(0, 8);
  const shortages = preview?.shortages ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Üretim</h1>
        <p className="text-sm text-muted-foreground">
          Açık siparişlerden üretim kuyruğu, çok seviyeli reçeteden hammadde düşümü.
        </p>
      </div>

      {/* Özet şerit */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Kuyrukta" value={String(queueRows.length)} icon={<Factory className="h-4 w-4" />} />
        <Summary
          label="Sipariş kaynaklı"
          value={String(queueRows.filter(r => r.reason === "siparis").length)}
          icon={<PackageSearch className="h-4 w-4" />}
        />
        <Summary
          label="Kritik hammadde"
          value={String(criticalMaterials.length)}
          tone={criticalMaterials.length > 0 ? "bad" : "ok"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Summary
          label="Bağlanmamış satır"
          value={String(queue?.unmatchedLines ?? 0)}
          tone={(queue?.unmatchedLines ?? 0) > 0 ? "warn" : "ok"}
          icon={<Beaker className="h-4 w-4" />}
        />
      </div>

      {(queue?.unmatchedLines ?? 0) > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {queue?.unmatchedLines} sipariş satırı bir ürüne bağlanamadı — bu satırlar üretim
            planına girmiyor.
          </span>
          <Link href="/katalog?sekme=baglar" className="font-medium underline">
            Bağla
          </Link>
        </Card>
      )}

      {/* Satışa kapanan ürünler — iş modeli sipariş üzerine üretim olduğu için
          hammadde yokluğu ilanı kapatmamalı. */}
      {(closedPreview ?? 0) > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-56 flex-1">
            <strong>{closedPreview} ürün</strong> hammadde kapasitesi 0 olduğu için ilanda 0 adet
            yazıyor ve fiilen satışa kapalı. Sipariş üzerine üretiyorsanız bunları termin süresiyle
            satışta tutabilirsiniz.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={keepSellable.isPending}
            onClick={() => keepSellable.mutate({ dryRun: false, leadTimeDays: 3 })}
          >
            {keepSellable.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Satışta tut (3 gün termin)
          </Button>
        </Card>
      )}

      {/* 1. Üretim kuyruğu */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Üretim Kuyruğu</h2>
          {queueRows.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                Tek tek üretmek zorunda değilsiniz — kuyruğun tamamını bir kerede işleyebilirsiniz.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7"
                disabled={produceQueue.isPending}
                onClick={async () => {
                  const items = queueRows
                    .map(r => ({ masterId: r.masterId, qty: Math.ceil(r.suggested) }))
                    .filter(i => i.qty > 0);
                  const units = items.reduce((s, i) => s + i.qty, 0);
                  const ok = await confirm({
                    title: "Kuyruğun tamamını üret",
                    description: `${items.length} üründe toplam ${units} adet üretim kaydedilecek ve reçeteye göre hammadde düşülecek. Hammaddesi yetmeyen kalemler eksiye düşer.`,
                    confirmText: "Tümünü üret",
                  });
                  if (ok) produceQueue.mutate({ items });
                }}
              >
                {produceQueue.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Factory className="mr-1 h-3.5 w-3.5" />
                )}
                Kuyruğun tamamını üret
              </Button>
            </>
          )}
        </div>
        {queueRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Kuyruk boş — açık siparişlerin tamamı stoktan karşılanabiliyor.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Sipariş</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Üretilebilir</TableHead>
                  <TableHead className="text-right">Önerilen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(r => (
                  <TableRow key={r.masterId}>
                    <TableCell>
                      <div className="font-medium">{r.label || r.internalSku}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {r.internalSku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatQty(r.ordered)}</TableCell>
                    <TableCell className="text-right">{formatQty(r.stockQty)}</TableCell>
                    <TableCell className="text-right">
                      <span className={r.buildableQty <= 0 ? "text-destructive" : undefined}>
                        {formatQty(r.buildableQty)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatQty(r.suggested)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant={r.reason === "siparis" ? "default" : "outline"}>
                          {r.reason === "siparis" ? "sipariş" : "tampon"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => {
                            setQtyText(String(Math.ceil(r.suggested)));
                            pick(r.masterId);
                          }}
                        >
                          Planla
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {queueRows.length > 8 && (
              <Button variant="ghost" size="sm" onClick={() => setQueueExpanded(v => !v)}>
                {queueExpanded ? "Daralt" : `Tümünü göster (${queueRows.length})`}
              </Button>
            )}
          </>
        )}
      </Card>

      {/* 2. Planlayıcı */}
      <Card ref={plannerRef} className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Üretim Planla</h2>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Ürün</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-72 justify-between font-normal">
                  <span className="truncate">{selected?.name ?? "Ürün seçin"}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Renk, ambalaj ya da kod ara…" />
                  <CommandList>
                    <CommandEmpty>Ürün bulunamadı.</CommandEmpty>
                    <CommandGroup>
                      {(catalog ?? []).map(c => (
                        <CommandItem
                          key={c.masterId}
                          value={`${c.name} ${c.internalSku}`}
                          onSelect={() => pick(c.masterId)}
                        >
                          {c.hex && (
                            <span
                              className="mr-2 inline-block h-3.5 w-3.5 shrink-0 rounded border"
                              style={{ backgroundColor: c.hex }}
                            />
                          )}
                          <span className="truncate">{c.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {c.buildableQty} adet
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
            <Label>Adet</Label>
            <Input
              type="number"
              min="1"
              value={qtyText}
              onChange={e => setQtyText(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label>Parti notu</Label>
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="opsiyonel"
            />
          </div>
        </div>

        {masterId == null ? (
          <p className="text-sm text-muted-foreground">
            Kuyruktan "Planla" deyin ya da yukarıdan ürün seçin.
          </p>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">Hesaplanıyor…</p>
        ) : (
          <>
            {preview.missingFormula.length > 0 && (
              <Card className="flex items-center gap-2 border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                Bu ürünün reçetesi bağlı değil — hammadde ihtiyacı hesaplanamıyor.
                <Link href="/recete" className="font-medium underline">
                  Reçeteler
                </Link>
              </Card>
            )}

            {preview.steps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Önce üretilecek yarı mamuller
                </p>
                {preview.steps.map(s => (
                  <div key={s.materialId} className="flex items-center gap-2 text-sm">
                    <Beaker className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{s.name}</span>
                    <span className="ml-auto font-mono text-xs">{formatQty(s.produceQty)}</span>
                  </div>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kalem</TableHead>
                  <TableHead className="text-right">Gereken</TableHead>
                  <TableHead className="text-right">Kullanılabilir</TableHead>
                  <TableHead className="text-right">Eksik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.needs.map(n => (
                  <TableRow key={n.materialId}>
                    <TableCell>
                      {n.name}
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {n.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatQty(n.needed)}</TableCell>
                    <TableCell className="text-right font-mono">{formatQty(n.available)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {n.missing > 0 ? (
                        <span className="text-destructive">{formatQty(n.missing)}</span>
                      ) : (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Birim maliyet {formatTL(preview.unitCost)} · toplam{" "}
                {formatTL(preview.unitCost * qty)}
              </span>
              {shortages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    for (const s of shortages) {
                      addTask.mutate({
                        kind: "eksik",
                        title: `${s.name} — ${Math.ceil(s.missing)} eksik`,
                      });
                    }
                    toast.success(`${shortages.length} kalem alınacaklara eklendi`);
                  }}
                >
                  <ListPlus className="mr-2 h-4 w-4" />
                  Eksikleri listeye ekle
                </Button>
              )}
              <Button
                className="ml-auto"
                disabled={qty <= 0 || produce.isPending}
                onClick={async () => {
                  if (shortages.length > 0) {
                    const ok = await confirm({
                      title: "Hammadde yetersiz",
                      description: `${shortages
                        .map(s => s.name)
                        .join(", ")} eksik. Yine de üretim kaydedilsin mi? Stok eksiye düşecek.`,
                      confirmText: "Yine de üret",
                    });
                    if (!ok) return;
                  }
                  produce.mutate({
                    masterId,
                    qty,
                    force: shortages.length > 0,
                    note: note.trim() || null,
                  });
                }}
              >
                <Factory className="mr-2 h-4 w-4" />
                {qty} adet üret
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* 3. Geçmiş */}
      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" /> Üretim Geçmişi
        </h2>
        {(runs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz üretim kaydı yok.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Adet</TableHead>
                  <TableHead>Not</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      {r.masterId != null
                        ? catalogById.get(r.masterId)?.name ?? `#${r.masterId}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.qty}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.note ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(runs ?? []).length >= historyLimit && (
              <Button variant="ghost" size="sm" onClick={() => setHistoryLimit(l => l + 50)}>
                Daha fazla
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-destructive"
          : "";
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`shrink-0 ${color}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
    </Card>
  );
}
