import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  buildExportMatrix,
  matrixToParsed,
  parseCatalogCsv,
  planImport,
  summarizePlan,
  type ImportPlan,
  type MatchBy,
  type ParsedCsv,
  type ProductIORecord,
} from "@shared/productIO";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const MATCH_LABELS: Record<MatchBy, string> = {
  id: "ID (satır boşsa yeni ürün)",
  barkod: "Barkod (bulunamazsa yeni ürün)",
  sku: "SKU (bulunamazsa yeni ürün)",
};

export default function ProductImport() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery();
  const { data: imageRefs } = trpc.products.allImageRefs.useQuery();

  const [matchBy, setMatchBy] = useState<MatchBy>("barkod");
  const [clearEmpty, setClearEmpty] = useState(false);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState<string>("");
  // bulkImport'tan dönen başarısız satırlar (uygula sonrası gösterilir).
  const [serverFailures, setServerFailures] = useState<Array<{ ref: string; reason: string }>>([]);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const imageKinds = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const r of imageRefs ?? []) map.set(r.productId, [...(map.get(r.productId) ?? []), r.kind]);
    return map;
  }, [imageRefs]);

  // Plan yalnız parse edilmiş dosya + seçeneklerden türetilir (dosya bir kez okunur).
  const plan: ImportPlan | null = useMemo(() => {
    if (!parsed) return null;
    return planImport((products as ProductIORecord[]) ?? [], parsed, { matchBy, clearEmpty });
  }, [parsed, matchBy, clearEmpty, products]);

  // Seçenek değişince önceki uygulama sonuçları geçersizleşir.
  useEffect(() => setServerFailures([]), [parsed, matchBy, clearEmpty]);

  const bulkImport = trpc.products.bulkImport.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      const base = `${r.created} yeni, ${r.updated} güncellendi`;
      if (r.failed.length > 0) toast.warning(`${base} · ${r.failed.length} satır başarısız`, { duration: 9000 });
      else toast.success(base, { duration: 6000 });
      setServerFailures(r.failed);
      // Başarıyla işlenenleri listeden düşür: dosyayı temizle, yalnız hatalar kalsın.
      if (r.failed.length === 0) {
        setParsed(null);
        setFileName("");
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  async function exportCatalog() {
    const rows = (products as ProductIORecord[] | undefined) ?? [];
    if (rows.length === 0) return toast.error("Dışa aktarılacak ürün yok");
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const matrix = buildExportMatrix(rows, {
        numeric: true, // sayısal alanlar gerçek sayı hücresi olsun (Excel yerele göre biçimler)
        imageKinds,
        imageBaseUrl: window.location.origin,
      });
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      // Okunur sütun genişlikleri (başlık uzunluğuna göre, sınırlı).
      ws["!cols"] = (matrix[0] as string[]).map(h => ({ wch: Math.min(Math.max(h.length + 2, 10), 40) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Katalog");
      XLSX.writeFile(wb, `artofcolour-katalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${rows.length} ürün Excel'e aktarıldı`);
    } catch {
      toast.error("Excel oluşturulamadı");
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const isXlsx = /\.xls[xmb]?$/i.test(file.name);
    try {
      if (isXlsx) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
          header: 1,
          raw: false,
          defval: "",
        });
        const { parsed: p, error } = matrixToParsed(aoa);
        if (error || !p) return toast.error(error ?? "Excel okunamadı");
        setParsed(p);
      } else {
        const text = await file.text();
        const { parsed: p, error } = parseCatalogCsv(text);
        if (error || !p) return toast.error(error ?? "Dosya okunamadı");
        setParsed(p);
      }
    } catch {
      toast.error("Dosya okunamadı");
      setParsed(null);
    }
  }

  const canApply = plan && (plan.creates.length > 0 || plan.updates.length > 0);
  // Görüntülenecek hatalar: plan hataları + sunucudan dönen başarısız satırlar.
  const shownErrors = plan
    ? [
        ...plan.errors,
        ...serverFailures.map((f, i) => ({ line: -1 - i, message: `${f.ref}: ${f.reason}` })),
      ]
    : [];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-1" onClick={() => setLocation("/urunler")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Excel/CSV İçe – Dışa Aktar</h1>
          <p className="text-sm text-muted-foreground">
            Tüm kataloğu Excel'de düzenleyip geri yükleyin. Eşleştirme sütunuyla eşleşen satır
            güncellenir, eşleşmeyen (adı olan) satır yeni ürün olur. Dosyada olmayan sütunlar
            değişmez.
          </p>
        </div>
      </div>

      {/* Dışa aktarma */}
      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" /> Katalog Dışa Aktar
        </h2>
        <p className="text-sm text-muted-foreground">
          Ana ürünler + türevler tek Excel dosyasında; ID, üst ürün barkodu ve görsel linkleri bilgi
          amaçlı eklenir (içe aktarmada değiştirilmez). Excel'de düzenleyip aynı dosyayı geri
          yükleyin. Fiyat/stok gerçek sayı hücresidir; Excel yerel biçime göre gösterir.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={exportCatalog} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" /> {exporting ? "Hazırlanıyor..." : "Excel'e Aktar (.xlsx)"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {(products?.length ?? 0)} ürün · Excel'de aç, düzenle, aşağıdan geri yükle.
          </span>
        </div>
      </Card>

      {/* İçe aktarma */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Excel/CSV İçe Aktar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Eşleştirme Sütunu</label>
            <Select value={matchBy} onValueChange={v => setMatchBy(v as MatchBy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="barkod">{MATCH_LABELS.barkod}</SelectItem>
                <SelectItem value="sku">{MATCH_LABELS.sku}</SelectItem>
                <SelectItem value="id">{MATCH_LABELS.id}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Boş Hücre Davranışı</label>
            <Select
              value={clearEmpty ? "clear" : "skip"}
              onValueChange={v => setClearEmpty(v === "clear")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Boş hücreyi atla (güvenli)</SelectItem>
                <SelectItem value="clear">Boş hücre alanı temizlesin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,.txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4 mr-1" /> Dosya Seç
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {plan && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="font-medium">{summarizePlan(plan)}</span>
              {plan.presentFields.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  · Güncellenecek sütunlar: {plan.presentFields.join(", ")}
                </span>
              )}
            </div>

            {shownErrors.length > 0 && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-800 dark:bg-rose-950/30">
                <p className="flex items-center gap-1 font-medium text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4" /> {shownErrors.length} sorunlu satır
                </p>
                <ul className="mt-1 max-h-40 overflow-auto list-disc pl-5 text-xs text-rose-700 dark:text-rose-400">
                  {shownErrors.slice(0, 40).map((e, i) => (
                    <li key={i}>
                      {e.line > 0 ? `Satır ${e.line}: ` : ""}
                      {e.message}
                    </li>
                  ))}
                  {shownErrors.length > 40 && <li>… ve {shownErrors.length - 40} satır daha</li>}
                </ul>
              </div>
            )}

            {plan.creates.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1 text-emerald-700 dark:text-emerald-400">
                  {plan.creates.length} yeni ürün
                </p>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="p-2 pl-3">Ürün Adı</th>
                        <th className="p-2">Barkod</th>
                        <th className="p-2">Üst Ürün</th>
                        <th className="p-2">Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.creates.slice(0, 30).map(c => (
                        <tr key={c.line} className="border-b last:border-0">
                          <td className="p-2 pl-3 font-medium">{c.name}</td>
                          <td className="p-2 font-mono text-xs">{String(c.data.barcode ?? "—")}</td>
                          <td className="p-2 text-xs">{c.parentRef ?? "— (ana ürün)"}</td>
                          <td className="p-2 text-xs text-amber-600">{c.warnings.join(" ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.creates.length > 30 && (
                    <p className="p-2 text-xs text-muted-foreground">… ve {plan.creates.length - 30} ürün daha</p>
                  )}
                </div>
              </div>
            )}

            {plan.updates.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">{plan.updates.length} güncelleme</p>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="p-2 pl-3">Ürün</th>
                        <th className="p-2">Değişiklikler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.updates.slice(0, 40).map(u => (
                        <tr key={u.line} className="border-b last:border-0 align-top">
                          <td className="p-2 pl-3 font-medium whitespace-nowrap">{u.name}</td>
                          <td className="p-2 text-xs">
                            {u.changes.map((ch, i) => (
                              <span key={i} className="inline-block mr-3">
                                <span className="text-muted-foreground">{ch.header}:</span>{" "}
                                <span className="text-rose-600 line-through">{ch.old || "—"}</span>{" "}
                                →{" "}
                                <span className="text-emerald-600">{ch.new || "—"}</span>
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.updates.length > 40 && (
                    <p className="p-2 text-xs text-muted-foreground">… ve {plan.updates.length - 40} güncelleme daha</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                disabled={!canApply || bulkImport.isPending}
                onClick={() =>
                  plan &&
                  bulkImport.mutate({
                    creates: plan.creates.map(c => ({ data: c.data as never, parentRef: c.parentRef })),
                    updates: plan.updates.map(u => ({ id: u.id, data: u.data as never })),
                  })
                }
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {bulkImport.isPending
                  ? "Uygulanıyor..."
                  : `Uygula (${plan.creates.length + plan.updates.length} satır)`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setParsed(null);
                  setFileName("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Temizle
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
