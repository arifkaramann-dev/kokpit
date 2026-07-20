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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatQty, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronsUpDown,
  ClipboardCheck,
  FlaskConical,
  Layers,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/** Boya renk toleransı: ΔE ≤ 2 gözle fark edilmez (server DEFAULT_DELTAE_MAX ile aynı). */
const DELTAE_MAX = 2;
const SOON_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

type SktState = "expired" | "soon" | "ok" | "none";

function sktState(expiry: string | Date | null | undefined, now = Date.now()): SktState {
  if (!expiry) return "none";
  const t = new Date(expiry).getTime();
  if (!Number.isFinite(t)) return "none";
  if (t < now) return "expired";
  if (t <= now + SOON_DAYS * DAY) return "soon";
  return "ok";
}

function daysLeft(expiry: string | Date | null | undefined, now = Date.now()): number | null {
  if (!expiry) return null;
  const t = new Date(expiry).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now) / DAY);
}

function SktBadge({ expiry }: { expiry: string | Date | null | undefined }) {
  const state = sktState(expiry);
  if (state === "none")
    return <span className="text-xs text-muted-foreground">SKT yok</span>;
  const d = daysLeft(expiry);
  const label = formatDate(expiry);
  if (state === "expired")
    return (
      <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 dark:border-rose-800">
        {label} · {Math.abs(d ?? 0)}g geçti
      </Badge>
    );
  if (state === "soon")
    return (
      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-800">
        {label} · {d}g kaldı
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800">
      {label}
    </Badge>
  );
}

const QC_LABEL: Record<string, string> = { gecti: "Geçti", kaldi: "Kaldı", beklemede: "Beklemede" };

function QcResultBadge({ result }: { result: string }) {
  if (result === "gecti")
    return (
      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800">
        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Geçti
      </Badge>
    );
  if (result === "kaldi")
    return (
      <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 dark:border-rose-800">
        <XCircle className="h-3 w-3 mr-0.5" /> Kaldı
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Beklemede
    </Badge>
  );
}

const emptyQc = { ph: "", viscosity: "", opacity: "", deltaE: "", result: "beklemede", testedBy: "", note: "" };

export default function Traceability() {
  const utils = trpc.useUtils();
  const { data: lots } = trpc.traceability.lots.useQuery();
  const { data: batches } = trpc.traceability.batches.useQuery();
  const { data: expiring } = trpc.traceability.expiring.useQuery({ soonDays: SOON_DAYS });
  const { data: qcTests } = trpc.traceability.qc.list.useQuery({ limit: 100 });

  const [targetKind, setTargetKind] = useState<"batch" | "lot">("batch");
  const [targetId, setTargetId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qc, setQc] = useState(emptyQc);

  const createQc = trpc.traceability.qc.create.useMutation({
    onSuccess: () => {
      utils.traceability.qc.list.invalidate();
      setQc(emptyQc);
      setTargetId("");
      toast.success("Kalite kontrol testi kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  // Mamul partisi → en son QC sonucu (parti tablosunda durum rozeti için).
  const qcByBatch = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of qcTests ?? []) {
      if (t.productBatchId != null && !map.has(t.productBatchId)) map.set(t.productBatchId, t.result);
    }
    return map;
  }, [qcTests]);

  const summary = useMemo(() => {
    const expiredCount = (expiring?.lots.expired.length ?? 0) + (expiring?.batches.expired.length ?? 0);
    const soonCount = (expiring?.lots.soon.length ?? 0) + (expiring?.batches.soon.length ?? 0);
    const openLots = (lots ?? []).filter(l => Number(l.remainingQty) > 0).length;
    const graded = (qcTests ?? []).filter(t => t.result !== "beklemede");
    const passed = graded.filter(t => t.result === "gecti").length;
    const passRate = graded.length > 0 ? Math.round((passed / graded.length) * 100) : null;
    return { expiredCount, soonCount, openLots, batchCount: (batches ?? []).length, passRate, gradedCount: graded.length };
  }, [expiring, lots, batches, qcTests]);

  // QC hedef seçici: mamul partileri ya da hammadde partileri.
  const targetOptions = useMemo(() => {
    if (targetKind === "batch") {
      return (batches ?? []).map(b => ({
        id: b.id,
        label: `${b.batchNo} — ${b.productName ?? "?"}`,
        sub: `${formatQty(b.qty)} adet · ${formatDate(b.producedDate)}`,
      }));
    }
    return (lots ?? []).map(l => ({
      id: l.id,
      label: `${l.lotNo} — ${l.materialName ?? "?"}`,
      sub: `kalan ${formatQty(l.remainingQty)} ${l.materialUnit ?? ""} · ${formatDate(l.receivedDate)}`,
    }));
  }, [targetKind, batches, lots]);
  const selectedTarget = targetOptions.find(o => String(o.id) === targetId);

  // ΔE'ye göre canlı sonuç önerisi (server evaluateQc ile aynı eşik).
  const deltaeNum = qc.deltaE.trim() ? parseFloat(qc.deltaE.replace(",", ".")) : null;
  const deltaeHint =
    deltaeNum != null && Number.isFinite(deltaeNum)
      ? deltaeNum > DELTAE_MAX
        ? ("kaldi" as const)
        : ("gecti" as const)
      : null;

  function submitQc() {
    if (!targetId) {
      toast.error("Test için bir parti seçin");
      return;
    }
    const parse = (s: string) => {
      const v = s.trim();
      if (!v) return null;
      const n = parseFloat(v.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    createQc.mutate({
      productBatchId: targetKind === "batch" ? Number(targetId) : null,
      materialLotId: targetKind === "lot" ? Number(targetId) : null,
      ph: parse(qc.ph),
      viscosity: parse(qc.viscosity),
      opacity: parse(qc.opacity),
      deltaE: parse(qc.deltaE),
      result: qc.result as "gecti" | "kaldi" | "beklemede",
      testedBy: qc.testedBy.trim() || null,
      note: qc.note.trim() || null,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parti İzleme &amp; Kalite</h1>
        <p className="text-sm text-muted-foreground">
          Hammadde ve mamul partilerini, son kullanma tarihlerini ve kalite kontrol testlerini
          tek yerden izle. Parti katmanı izlenebilirlik içindir; stok miktarı otoriter kalır.
        </p>
      </div>

      {/* Özet şerit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={`p-3 ${summary.expiredCount > 0 ? "border-rose-300 dark:border-rose-800" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> SKT Geçmiş
          </div>
          <p className={`mt-1 text-xl font-bold ${summary.expiredCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {summary.expiredCount} parti
          </p>
          <p className="text-xs text-muted-foreground">kullanmadan önce kontrol et</p>
        </Card>
        <Card className={`p-3 ${summary.soonCount > 0 ? "border-amber-300 dark:border-amber-800" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> SKT Yaklaşan
          </div>
          <p className={`mt-1 text-xl font-bold ${summary.soonCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {summary.soonCount} parti
          </p>
          <p className="text-xs text-muted-foreground">{SOON_DAYS} gün içinde dolacak</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Açık Hammadde Partisi
          </div>
          <p className="mt-1 text-xl font-bold">{summary.openLots}</p>
          <p className="text-xs text-muted-foreground">{summary.batchCount} mamul partisi</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> QC Geçme Oranı
          </div>
          <p className={`mt-1 text-xl font-bold ${summary.passRate == null ? "" : summary.passRate >= 80 ? "text-emerald-600" : "text-amber-600"}`}>
            {summary.passRate == null ? "—" : `%${summary.passRate}`}
          </p>
          <p className="text-xs text-muted-foreground">{summary.gradedCount} sonuçlanmış test</p>
        </Card>
      </div>

      {(summary.expiredCount > 0 || summary.soonCount > 0) && (
        <Card className="p-3 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {summary.expiredCount > 0 && (
              <>
                <strong>{summary.expiredCount}</strong> partinin SKT'si geçmiş.{" "}
              </>
            )}
            {summary.soonCount > 0 && (
              <>
                <strong>{summary.soonCount}</strong> partinin SKT'si {SOON_DAYS} gün içinde dolacak.
              </>
            )}{" "}
            Aşağıdaki listelerde kırmızı/sarı rozetlerle işaretli.
          </p>
        </Card>
      )}

      <Tabs defaultValue="partiler">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="partiler">
            <Boxes className="h-3.5 w-3.5 mr-1" /> Partiler &amp; SKT
          </TabsTrigger>
          <TabsTrigger value="kalite">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Kalite Kontrol
          </TabsTrigger>
        </TabsList>

        {/* --- Partiler & SKT --- */}
        <TabsContent value="partiler" className="mt-3 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Hammadde Partileri (Lot)</h2>
              <span className="text-xs text-muted-foreground">— alış girişleriyle oluşur</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parti No</TableHead>
                    <TableHead>Hammadde</TableHead>
                    <TableHead>Giriş</TableHead>
                    <TableHead>SKT</TableHead>
                    <TableHead className="text-right">Kalan / Toplam</TableHead>
                    <TableHead className="text-right">Birim Maliyet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lots ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Henüz parti yok — alış faturası girince otomatik oluşur.
                      </TableCell>
                    </TableRow>
                  )}
                  {(lots ?? []).map(l => {
                    const depleted = Number(l.remainingQty) <= 0;
                    return (
                      <TableRow key={l.id} className={depleted ? "opacity-50" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">{l.lotNo}</TableCell>
                        <TableCell>
                          {l.materialName ?? "?"}
                          <span className="block text-xs text-muted-foreground">{l.materialCategory}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(l.receivedDate)}
                        </TableCell>
                        <TableCell>
                          <SktBadge expiry={l.expiryDate} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className={depleted ? "" : "font-semibold"}>
                            {formatQty(l.remainingQty)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            / {formatQty(l.qty)} {l.materialUnit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatTL(l.unitCost)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Mamul Partileri (Üretim)</h2>
              <span className="text-xs text-muted-foreground">— üretim emirleriyle oluşur</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parti No</TableHead>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Üretim</TableHead>
                    <TableHead>SKT</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead>Kalite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batches ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Henüz mamul partisi yok — üretim kaydedince otomatik oluşur.
                      </TableCell>
                    </TableRow>
                  )}
                  {(batches ?? []).map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium whitespace-nowrap">{b.batchNo}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded border shadow-inner shrink-0"
                            style={{ backgroundColor: b.colorHex ?? "#888" }}
                          />
                          <span className="truncate">{b.productName ?? "?"}</span>
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(b.producedDate)}
                      </TableCell>
                      <TableCell>
                        <SktBadge expiry={b.expiryDate} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatQty(b.qty)}</TableCell>
                      <TableCell>
                        {qcByBatch.has(b.id) ? (
                          <QcResultBadge result={qcByBatch.get(b.id)!} />
                        ) : (
                          <span className="text-xs text-muted-foreground">test yok</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* --- Kalite Kontrol --- */}
        <TabsContent value="kalite" className="mt-3 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Kalite Kontrol Testi Kaydet</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Hedef Tür</Label>
                <Select
                  value={targetKind}
                  onValueChange={v => {
                    setTargetKind(v as "batch" | "lot");
                    setTargetId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="batch">Mamul Partisi</SelectItem>
                    <SelectItem value="lot">Hammadde Partisi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Parti</Label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selectedTarget ? (
                        <span className="truncate">{selectedTarget.label}</span>
                      ) : (
                        <span className="text-muted-foreground">Parti seç ya da ara...</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Parti no, ürün veya hammadde ara..." />
                      <CommandList>
                        <CommandEmpty>Parti bulunamadı.</CommandEmpty>
                        <CommandGroup>
                          {targetOptions.map(o => (
                            <CommandItem
                              key={o.id}
                              value={`${o.label} ${o.sub} #${o.id}`}
                              onSelect={() => {
                                setTargetId(String(o.id));
                                setPickerOpen(false);
                              }}
                            >
                              <span className="flex flex-col min-w-0">
                                <span className="truncate">{o.label}</span>
                                <span className="text-xs text-muted-foreground truncate">{o.sub}</span>
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>pH</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={qc.ph}
                  onChange={e => setQc(f => ({ ...f, ph: e.target.value }))}
                  placeholder="7,0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Viskozite (cP)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={qc.viscosity}
                  onChange={e => setQc(f => ({ ...f, viscosity: e.target.value }))}
                  placeholder="90"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Örtücülük (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={qc.opacity}
                  onChange={e => setQc(f => ({ ...f, opacity: e.target.value }))}
                  placeholder="98"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ΔE (renk sapması)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={qc.deltaE}
                  onChange={e => setQc(f => ({ ...f, deltaE: e.target.value }))}
                  placeholder="≤ 2 hedef"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>Sonuç</Label>
                <Select value={qc.result} onValueChange={v => setQc(f => ({ ...f, result: v }))}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gecti">Geçti</SelectItem>
                    <SelectItem value="kaldi">Kaldı</SelectItem>
                    <SelectItem value="beklemede">Beklemede</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {deltaeHint && deltaeHint !== qc.result && (
                <button
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    deltaeHint === "kaldi"
                      ? "text-rose-600 border-rose-300 dark:border-rose-800"
                      : "text-emerald-600 border-emerald-300 dark:border-emerald-800"
                  }`}
                  onClick={() => setQc(f => ({ ...f, result: deltaeHint }))}
                  title={`ΔE ${deltaeNum} · sınır ${DELTAE_MAX}`}
                >
                  ΔE önerisi: {QC_LABEL[deltaeHint]} (uygula)
                </button>
              )}
              <div className="space-y-1.5">
                <Label>Test Eden</Label>
                <Input
                  value={qc.testedBy}
                  onChange={e => setQc(f => ({ ...f, testedBy: e.target.value }))}
                  placeholder="Ad (opsiyonel)"
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5 flex-1 min-w-52">
                <Label>Not</Label>
                <Input
                  value={qc.note}
                  onChange={e => setQc(f => ({ ...f, note: e.target.value }))}
                  placeholder="Gözlem / açıklama (opsiyonel)"
                />
              </div>
              <Button onClick={submitQc} disabled={createQc.isPending}>
                <ClipboardCheck className="h-4 w-4 mr-1" /> Testi Kaydet
              </Button>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Kalite Kontrol Geçmişi</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Hedef</TableHead>
                    <TableHead className="text-right">pH</TableHead>
                    <TableHead className="text-right">Visk.</TableHead>
                    <TableHead className="text-right">Ört.%</TableHead>
                    <TableHead className="text-right">ΔE</TableHead>
                    <TableHead>Sonuç</TableHead>
                    <TableHead>Test Eden</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(qcTests ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Henüz kalite kontrol testi kaydedilmedi.
                      </TableCell>
                    </TableRow>
                  )}
                  {(qcTests ?? []).map(t => {
                    const target = t.batchNo
                      ? `${t.batchNo}${t.batchProductName ? ` · ${t.batchProductName}` : ""}`
                      : t.lotNo
                        ? `${t.lotNo} (hammadde)`
                        : t.productionRunId
                          ? `Üretim #${t.productionRunId}`
                          : "—";
                    const dash = (v: string | null) => (v == null ? "—" : formatQty(v));
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(t.testedAt)}
                        </TableCell>
                        <TableCell className="max-w-56 truncate" title={target}>
                          {target}
                        </TableCell>
                        <TableCell className="text-right">{dash(t.ph)}</TableCell>
                        <TableCell className="text-right">{dash(t.viscosity)}</TableCell>
                        <TableCell className="text-right">{dash(t.opacity)}</TableCell>
                        <TableCell className="text-right">{dash(t.deltaE)}</TableCell>
                        <TableCell>
                          <QcResultBadge result={t.result} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.testedBy ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
