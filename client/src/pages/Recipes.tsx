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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Beaker, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Boş eksen "hepsi" demektir — Select boş değer kabul etmediği için sentinel. */
const ANY = "__any__";

const MATERIAL_TYPES = [
  { value: "hammadde", label: "Hammadde", desc: "Satın alınır" },
  { value: "yari_mamul", label: "Yarı Mamul", desc: "Üretilir — kendi reçetesi var" },
  { value: "ambalaj", label: "Ambalaj", desc: "Şişe, kapak, etiket, koli" },
  { value: "masraf", label: "Masraf", desc: "Kapasiteyi kısıtlamaz" },
] as const;

type InputRow = { materialId: string; qtyPerBase: string };

/**
 * Reçete Defteri (v3) — çok seviyeli BOM.
 *
 * Kapasite motoru bu ekrandan beslenir: reçete yoksa üretilebilir adet 0'dır
 * ve ilan kapanır. Yarı mamuller (harç, konsantre) burada hem çıktı hem girdi
 * olarak tanımlanır; zincir hammaddeden mamule kadar çözülür.
 */
export default function Recipes() {
  const utils = trpc.useUtils();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: formulas, isLoading } = trpc.katalog.formulas.useQuery();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    outputType: "mamul" as "mamul" | "yari_mamul",
    outputMaterialId: ANY,
    seriesId: ANY,
    colorId: ANY,
    familyId: ANY,
    readiness: ANY,
    baseQty: "1000",
    baseUnit: "ml",
    wastePercent: "0",
    notes: "",
  });
  const [rows, setRows] = useState<InputRow[]>([{ materialId: "", qtyPerBase: "" }]);

  const setType = trpc.katalog.setMaterialType.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      utils.katalog.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const save = trpc.katalog.saveFormula.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      setOpen(false);
      toast.success(editId ? "Reçete güncellendi" : "Reçete kaydedildi");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const bind = trpc.katalog.bindFormulas.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      if (r.dryRun) {
        toast.info(
          `${r.willBind} master reçeteye bağlanacak${r.unmatched > 0 ? ` · ${r.unmatched} master eşleşmiyor` : ""}`,
          { duration: 8000 },
        );
        return;
      }
      toast.success(
        `${r.bound} master bağlandı${r.unmatched > 0 ? ` · ${r.unmatched} master hâlâ reçetesiz` : ""}`,
        { duration: 8000 },
      );
    },
    onError: e => toast.error(e.message),
  });

  const materialName = new Map((materials ?? []).map(m => [m.id, m.name]));
  const semiFinished = (materials ?? []).filter(m => m.type === "yari_mamul");

  function openNew() {
    setEditId(null);
    setForm({
      name: "",
      outputType: "mamul",
      outputMaterialId: ANY,
      seriesId: ANY,
      colorId: ANY,
      familyId: ANY,
      readiness: ANY,
      baseQty: "1000",
      baseUnit: "ml",
      wastePercent: "0",
      notes: "",
    });
    setRows([{ materialId: "", qtyPerBase: "" }]);
    setOpen(true);
  }

  function openEdit(f: NonNullable<typeof formulas>[number]) {
    setEditId(f.id);
    setForm({
      name: f.name,
      outputType: f.outputType,
      outputMaterialId: f.outputMaterialId != null ? String(f.outputMaterialId) : ANY,
      seriesId: f.seriesId != null ? String(f.seriesId) : ANY,
      colorId: f.colorId != null ? String(f.colorId) : ANY,
      familyId: f.familyId != null ? String(f.familyId) : ANY,
      readiness: f.readiness ?? ANY,
      baseQty: String(parseFloat(String(f.baseQty)) || 1000),
      baseUnit: f.baseUnit,
      wastePercent: String(parseFloat(String(f.wastePercent)) || 0),
      notes: f.notes ?? "",
    });
    setRows(
      f.inputs.length > 0
        ? (f.inputs as { inputMaterialId: number; qtyPerBase: string }[]).map(i => ({
            materialId: String(i.inputMaterialId),
            qtyPerBase: String(parseFloat(i.qtyPerBase)),
          }))
        : [{ materialId: "", qtyPerBase: "" }],
    );
    setOpen(true);
  }

  function submit() {
    if (!form.name.trim()) return toast.error("Reçete adı gerekli");
    const inputs = rows
      .filter(r => r.materialId && parseFloat(r.qtyPerBase) > 0)
      .map(r => ({ inputMaterialId: Number(r.materialId), qtyPerBase: parseFloat(r.qtyPerBase) }));
    if (inputs.length === 0) return toast.error("En az bir girdi satırı gerekli");
    const numOrNull = (v: string) => (v === ANY ? null : Number(v));
    save.mutate({
      id: editId,
      name: form.name.trim(),
      outputType: form.outputType,
      outputMaterialId: numOrNull(form.outputMaterialId),
      seriesId: numOrNull(form.seriesId),
      colorId: numOrNull(form.colorId),
      familyId: numOrNull(form.familyId),
      readiness: form.readiness === ANY ? null : (form.readiness as "konsantre" | "r2u"),
      baseQty: parseFloat(form.baseQty) || 1000,
      baseUnit: form.baseUnit,
      wastePercent: parseFloat(form.wastePercent) || 0,
      notes: form.notes || null,
      inputs,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reçeteler</h1>
          <p className="text-sm text-muted-foreground">
            Reçete baz hacim için yazılır, ambalaj hacmine göre ölçeklenir — tek reçete tüm
            boyutları besler. Kapasite hesabı buradan beslenir.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Yeni Reçete
        </Button>
      </div>

      <Tabs defaultValue="receteler">
        <TabsList>
          <TabsTrigger value="receteler">Reçeteler</TabsTrigger>
          <TabsTrigger value="kalemler">Kalem Türleri</TabsTrigger>
        </TabsList>

        <TabsContent value="receteler" className="space-y-3 pt-3">
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="flex-1 text-sm">
              Master ürünler koordinatına uyan reçeteye otomatik bağlanır — en özel reçete kazanır
              (renk bazlı, seri bazlını yener).
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={bind.isPending}
              onClick={() => bind.mutate({ dryRun: true })}
            >
              Önce Göster
            </Button>
            <Button size="sm" disabled={bind.isPending} onClick={() => bind.mutate({ dryRun: false })}>
              {bind.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Reçeteleri Bağla
            </Button>
          </Card>

          {isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}

          {!isLoading && (formulas ?? []).length === 0 && (
            <Card className="space-y-2 p-10 text-center">
              <Beaker className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium">Henüz reçete yok</p>
              <p className="text-sm text-muted-foreground">
                Reçetesiz master'ın kapasitesi 0 sayılır ve ilanı kapanır. Önce "Kalem Türleri"nden
                yarı mamullerinizi işaretleyin, sonra reçeteleri girin.
              </p>
            </Card>
          )}

          {(formulas ?? []).map(f => (
            <Card key={f.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{f.name}</p>
                <Badge variant={f.outputType === "yari_mamul" ? "secondary" : "default"}>
                  {f.outputType === "yari_mamul"
                    ? `Yarı mamul → ${materialName.get(f.outputMaterialId ?? -1) ?? "?"}`
                    : "Mamul"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {parseFloat(String(f.baseQty))} {f.baseUnit} baz
                  {parseFloat(String(f.wastePercent)) > 0 && ` · fire %${parseFloat(String(f.wastePercent))}`}
                </span>
                {f.outputType === "mamul" && (
                  <Badge variant="outline" className="text-[10px]">
                    {f.masterCount} master
                  </Badge>
                )}
                <span className="flex-1" />
                <Button variant="outline" size="sm" className="h-8" onClick={() => openEdit(f)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Düzenle
                </Button>
              </div>
              <div className="space-y-0.5 text-sm">
                {(f.inputs as { id: number; inputMaterialId: number; qtyPerBase: string }[]).map(i => (
                  <div key={i.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      {materialName.get(i.inputMaterialId) ?? `#${i.inputMaterialId}`}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {parseFloat(i.qtyPerBase)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="kalemler" className="space-y-3 pt-3">
          <Card className="p-4 text-sm text-muted-foreground">
            Çok seviyeli reçete için kalem türü şart. Bugün yarı mamulleriniz (MİX BOYA, BAZKAT
            BOYA, baz binder…) "hammadde" olarak duruyor; işaretlenmeden zincir çözülmez.
            <span className="mt-1 block">
              <strong className="text-foreground">Masraf</strong> kalemleri kapasiteyi kısıtlamaz —
              SET/MASRAF gibi kalemleri oraya alın ki üretimi boşuna engellemesinler.
            </span>
          </Card>
          <Card className="overflow-hidden p-0">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="p-2 text-left">Kalem</th>
                    <th className="p-2 text-left">Kategori</th>
                    <th className="p-2 text-right">Stok</th>
                    <th className="p-2 text-left">Tür</th>
                  </tr>
                </thead>
                <tbody>
                  {(materials ?? []).map(m => (
                    <tr key={m.id} className="border-t">
                      <td className="p-2 font-medium">{m.name}</td>
                      <td className="p-2 text-xs text-muted-foreground">{m.category}</td>
                      <td className="p-2 text-right tabular-nums">
                        {parseFloat(String(m.stockQty))} {m.unit}
                      </td>
                      <td className="p-2">
                        <Select
                          value={m.type ?? "hammadde"}
                          onValueChange={v =>
                            setType.mutate({ materialId: m.id, type: v as never })
                          }
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label} — {t.desc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Reçeteyi Düzenle" : "Yeni Reçete"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reçete Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. Candy Red harcı"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Çıktı Türü</Label>
                <Select
                  value={form.outputType}
                  onValueChange={v => setForm(f => ({ ...f, outputType: v as "mamul" | "yari_mamul" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mamul">Mamul — master ürüne bağlanır</SelectItem>
                    <SelectItem value="yari_mamul">Yarı mamul — başka reçeteye girdi olur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.outputType === "yari_mamul" && (
                <div className="space-y-1.5">
                  <Label>Ürettiği Kalem *</Label>
                  <Select
                    value={form.outputMaterialId}
                    onValueChange={v => setForm(f => ({ ...f, outputMaterialId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Yarı mamul seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {semiFinished.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {semiFinished.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Yarı mamul yok — "Kalem Türleri" sekmesinden işaretleyin.
                    </p>
                  )}
                </div>
              )}
            </div>

            {form.outputType === "mamul" && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Hangi ürünlere uygulanır</p>
                <p className="text-[11px] text-muted-foreground">
                  Boş bırakılan eksen "hepsi" demektir. Genel bir seri reçetesi yazıp yalnız birkaç
                  rengi özelleştirebilirsiniz — en özel reçete kazanır.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <AxisSelect
                    label="Seri"
                    value={form.seriesId}
                    onChange={v => setForm(f => ({ ...f, seriesId: v }))}
                    options={(series ?? []).map(s => ({ value: String(s.id), label: s.name }))}
                  />
                  <AxisSelect
                    label="Renk"
                    value={form.colorId}
                    onChange={v => setForm(f => ({ ...f, colorId: v }))}
                    options={(dims?.colors ?? []).map(c => ({ value: String(c.id), label: c.name }))}
                  />
                  <AxisSelect
                    label="Form"
                    value={form.familyId}
                    onChange={v => setForm(f => ({ ...f, familyId: v }))}
                    options={(dims?.families ?? []).map(x => ({ value: String(x.id), label: x.name }))}
                  />
                  <AxisSelect
                    label="Hazırlık"
                    value={form.readiness}
                    onChange={v => setForm(f => ({ ...f, readiness: v }))}
                    options={[
                      { value: "konsantre", label: "Konsantre" },
                      { value: "r2u", label: "Kullanıma hazır (r2u)" },
                    ]}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Baz Miktar</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.baseQty}
                  onChange={e => setForm(f => ({ ...f, baseQty: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">Bu reçete kaç birim üretir</p>
              </div>
              <div className="space-y-1.5">
                <Label>Birim</Label>
                <Input
                  value={form.baseUnit}
                  onChange={e => setForm(f => ({ ...f, baseUnit: e.target.value }))}
                  placeholder="ml"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fire %</Label>
                <Input
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={form.wastePercent}
                  onChange={e => setForm(f => ({ ...f, wastePercent: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Girdiler</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setRows(r => [...r, { materialId: "", qtyPerBase: "" }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Satır
                </Button>
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_110px_28px] items-center gap-1.5">
                  <Select
                    value={row.materialId}
                    onValueChange={v =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, materialId: v } : r)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Kalem seç (hammadde / yarı mamul / ambalaj)" />
                    </SelectTrigger>
                    <SelectContent>
                      {(materials ?? [])
                        .filter(m => m.type !== "masraf")
                        .map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name} ({m.unit})
                            {m.type === "yari_mamul" ? " · yarı mamul" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="Miktar"
                    value={row.qtyPerBase}
                    onChange={e =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, qtyPerBase: e.target.value } : r)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Miktarlar baz miktar için girilir. Ambalaj kalemlerini (şişe, kapak, etiket) ambalaj
                tanımına ekleyin — hacimle ölçeklenmemeleri gerekir.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AxisSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Hepsi</SelectItem>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
