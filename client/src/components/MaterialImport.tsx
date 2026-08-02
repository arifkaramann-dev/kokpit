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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  buildMaterialExportMatrix,
  buildMaterialTemplateMatrix,
  materialMatrixToCsv,
  materialMatrixToParsed,
  parseMaterialCsv,
  planMaterialImport,
  type MaterialImportPlan,
  type MaterialIORecord,
} from "@shared/materialIO";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Hammadde Excel/CSV toplu yükleme.
 *
 * ── Neden önizlemeli ──────────────────────────────────────────────────────
 * Toplu içe aktarma sessiz hasarın en kolay yoludur: yanlış sütun eşleşmesi
 * 60 kalemin stoğunu sıfırlayabilir ve bunu ancak haftalar sonra fark
 * edersiniz. Bu yüzden akış iki adımlıdır — önce SATIR SATIR ne değişeceği
 * gösterilir (eski → yeni), sonra yazılır. Plan hem burada hem sunucuda
 * aynı saf fonksiyonla kurulur; onayladığınız şeyden başkası yazılamaz.
 *
 * .xlsx okuma `xlsx` paketiyle ve DİNAMİK import ile yapılır: kütüphane ~1 MB
 * ve yalnız bu diyalog açıldığında gerekiyor — ana pakete girmesi her sayfa
 * açılışını yavaşlatırdı.
 */
export default function MaterialImport({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [matchBy, setMatchBy] = useState<"ad" | "id">("ad");
  const [plan, setPlan] = useState<MaterialImportPlan | null>(null);
  const [parsing, setParsing] = useState(false);

  const records: MaterialIORecord[] = ((materials as Record<string, unknown>[]) ?? []).map(m => ({
    id: m.id as number,
    name: String(m.name ?? ""),
    category: String(m.category ?? ""),
    unit: String(m.unit ?? ""),
    type: (m.type as MaterialIORecord["type"]) ?? "hammadde",
    stockQty: (m.stockQty as string) ?? "0",
    criticalQty: (m.criticalQty as string) ?? "0",
    unitCost: (m.unitCost as string) ?? "0",
    supplierId: (m.supplierId as number | null) ?? null,
    notes: (m.notes as string | null) ?? null,
  }));
  const supplierRows = ((suppliers as { id: number; name: string }[]) ?? []).map(s => ({
    id: s.id,
    name: s.name,
  }));

  const apply = trpc.materials.bulkImport.useMutation({
    onSuccess: r => {
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      utils.suppliers.list.invalidate();
      utils.katalog.invalidate();
      toast.success(
        `${r.created} yeni kalem eklendi · ${r.updated} kalem güncellendi`,
        { duration: 8000 },
      );
      reset();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  function reset() {
    setFileName("");
    setMatrix(null);
    setPlan(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function download(matrixToSave: (string | number)[][], name: string) {
    const blob = new Blob([materialMatrixToCsv(matrixToSave)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Dosyayı hücre matrisine çevirir (.xlsx dinamik import, .csv yerinde). */
  async function readFile(file: File) {
    setParsing(true);
    try {
      let cells: string[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error("Dosyada sayfa bulunamadı.");
        const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
          header: 1,
          raw: false,
          defval: "",
        });
        cells = raw.map(r => (r ?? []).map(c => (c == null ? "" : String(c))));
      } else {
        const { parsed, error } = parseMaterialCsv(await file.text());
        if (!parsed) throw new Error(error ?? "Dosya okunamadı.");
        cells = [parsed.headers, ...parsed.rows.map(r => r.cells)];
      }

      const { parsed, error } = materialMatrixToParsed(cells);
      if (!parsed) throw new Error(error ?? "Dosya okunamadı.");

      // Dışa aktarılan dosya ID taşır: kullanıcı seçmeden doğru eşleştirmeye geç.
      const hasId = parsed.headers.some(h => h.trim().toLocaleUpperCase("tr-TR") === "ID");
      const nextMatch = hasId ? "id" : "ad";
      setMatchBy(nextMatch);
      setMatrix(cells);
      setFileName(file.name);
      setPlan(planMaterialImport(records, parsed, { matchBy: nextMatch, suppliers: supplierRows }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dosya okunamadı.", { duration: 8000 });
      reset();
    } finally {
      setParsing(false);
    }
  }

  /** Eşleştirme sütunu değişince planı aynı dosyadan yeniden kur. */
  function reMatch(next: "ad" | "id") {
    setMatchBy(next);
    if (!matrix) return;
    const { parsed } = materialMatrixToParsed(matrix);
    if (parsed) {
      setPlan(planMaterialImport(records, parsed, { matchBy: next, suppliers: supplierRows }));
    }
  }

  const willWrite = (plan?.creates.length ?? 0) + (plan?.updates.length ?? 0);

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Excel ile toplu hammadde
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="space-y-2 p-4 text-sm text-muted-foreground">
            <p>
              Dosyadaki her satır <strong className="text-foreground">eşleşirse günceller,
              eşleşmezse yeni kalem açar</strong>. Dosyada olmayan sütuna dokunulmaz — yalnız
              "Malzeme Adı" ve "Birim Maliyet" sütunlu bir zam listesi yükleyebilirsiniz.
            </p>
            <p className="text-xs">
              Sayı hücresi <strong className="text-foreground">boşsa o alan değiştirilmez</strong>;
              stoğu sıfırlamak için 0 yazmalısınız. Yazmadan önce ne değişeceğini satır satır
              göreceksiniz.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => download(buildMaterialTemplateMatrix(), "hammadde-sablon.csv")}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Boş şablon indir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  download(
                    buildMaterialExportMatrix(records, { suppliers: supplierRows }),
                    `hammaddeler-${new Date().toISOString().slice(0, 10)}.csv`,
                  )
                }
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Mevcut listeyi indir ({records.length})
              </Button>
            </div>
            <p className="text-[11px]">
              En güvenli yol: mevcut listeyi indirin, Excel'de düzenleyin, geri yükleyin —
              ID sütunu sayesinde ad değişse bile doğru kaleme yazılır.
            </p>
          </Card>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Dosya (.xlsx / .csv)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="block w-72 text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Eşleştirme</Label>
              <Select value={matchBy} onValueChange={v => reMatch(v as "ad" | "id")}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ad">Malzeme adına göre</SelectItem>
                  <SelectItem value="id">ID sütununa göre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {parsing && (
              <span className="flex items-center gap-1.5 pb-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…
              </span>
            )}
          </div>

          {plan && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{fileName}</span>
                <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                  {plan.creates.length} yeni
                </Badge>
                <Badge variant="outline" className="text-blue-700 dark:text-blue-400">
                  {plan.updates.length} güncellenecek
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  {plan.unchanged.length} değişmiyor
                </Badge>
                {plan.errors.length > 0 && (
                  <Badge variant="outline" className="text-destructive">
                    {plan.errors.length} hatalı satır
                  </Badge>
                )}
              </div>

              {plan.presentFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Dokunulacak sütunlar: <strong>{plan.presentFields.join(", ")}</strong>. Diğer tüm
                  alanlar olduğu gibi kalır.
                </p>
              )}

              {plan.newSuppliers.length > 0 && (
                <Card className="flex items-start gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    Kayıtlı olmayan tedarikçiler açılacak:{" "}
                    <strong>{plan.newSuppliers.join(", ")}</strong>
                  </span>
                </Card>
              )}

              {plan.errors.length > 0 && (
                <Card className="space-y-1 border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">
                    Bu satırlar atlanacak — düzeltip tekrar yükleyebilirsiniz
                  </p>
                  <div className="max-h-32 space-y-0.5 overflow-y-auto">
                    {plan.errors.slice(0, 40).map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        <span className="font-mono">satır {e.line}</span> — {e.message}
                      </p>
                    ))}
                  </div>
                </Card>
              )}

              {plan.updates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Güncellenecekler</p>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {plan.updates.map(u => (
                      <div key={u.id} className="text-xs">
                        <span className="font-medium">{u.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {u.changes.map((c, i) => (
                            <span key={i} className="mr-2">
                              {c.header}: <span className="line-through">{c.old || "—"}</span> →{" "}
                              <strong className="text-foreground">{c.new}</strong>
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.creates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Yeni açılacaklar</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {plan.creates.map((c, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {String(c.data.category ?? "")} · {String(c.data.unit ?? "")} ·{" "}
                          {String(c.data.unitCost ?? 0)} ₺
                        </span>
                        {c.warnings.length > 0 && (
                          <span className="ml-2 text-amber-600">({c.warnings.join(", ")})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {willWrite === 0 && plan.errors.length === 0 && (
                <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Dosyadaki her şey zaten güncel — yazılacak bir değişiklik yok.
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
          <Button
            disabled={!matrix || willWrite === 0 || apply.isPending}
            onClick={() =>
              matrix && apply.mutate({ matrix, matchBy, createSuppliers: true, dryRun: false })
            }
          >
            {apply.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {willWrite > 0 ? `${willWrite} satırı uygula` : "Uygula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
