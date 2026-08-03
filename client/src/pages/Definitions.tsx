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
import { useConfirm } from "@/components/ConfirmDialog";
import PackagingCost from "@/components/PackagingCost";
import { trpc } from "@/lib/trpc";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Kind = "colors" | "families" | "packagings" | "useCases";
/** Sekme değeri; KIND_META tablo sekmeleri içindir, bu ayrı bir içerik. */
const PACKAGING_COST_TAB = "packagingCost";
const NONE = "__none__";

const KIND_META: Record<Kind, { title: string; desc: string }> = {
  colors: {
    title: "Renkler",
    desc: "Seriye özel renkler (RAL kodları, candy tonları) o seriye bağlanır; boş bırakılan renk tüm serilerde kullanılır.",
  },
  families: {
    title: "Formlar",
    desc: "Fiziksel form: airbrush · boya · sprey · rötuş. Kullanıma hazır (r2u) bir form değil, ürünün hazırlık bayrağıdır.",
  },
  packagings: {
    title: "Ambalajlar",
    desc: "Hacim, reçete ölçeklemesinin paydasıdır — boş bırakılırsa o ambalajda reçete ölçeklenemez. Stok kalemi şişeyi kapasiteye bağlar.",
  },
  useCases: {
    title: "Kullanım Alanları",
    desc: "İlan ekseni — aynı şişe 3D baskıcıya ve olta yapımcısına ayrı ilanla satılır. Master ekseni değildir.",
  },
};

/**
 * Tanımlar — ürün sözlüğünün TEK kaynağı.
 *
 * Eskiden renk/ambalaj/kullanım alanı hem "Şablonlar" sayfasında (metin
 * şablonu olarak) hem katalog boyutlarında duruyordu; ikisi senkron değildi ve
 * hangisinin doğru olduğu belirsizdi. Artık sözlük burada, metin şablonları
 * (etiket yazısı, kılavuz, güvenlik) ayrı sekmede.
 */
export default function Definitions() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();

  // Sekme değeri tablo sekmelerinden biri ya da ambalaj maliyeti olabilir;
  // `kind` yalnız tablo sekmelerinde anlamlıdır.
  const [tab, setTab] = useState<string>("colors");
  const kind = (tab === PACKAGING_COST_TAB ? "packagings" : tab) as Kind;
  const setKind = (k: Kind) => setTab(k);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    nameEn: "",
    hex: "#888888",
    seriesId: NONE,
    volumeMl: "",
    materialId: NONE,
    skuSegment: "",
    titlePattern: "",
  });

  const save = trpc.katalog.saveDimension.useMutation({
    onSuccess: () => {
      utils.katalog.dimensions.invalidate();
      setOpen(false);
      toast.success("Kaydedildi");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const remove = trpc.katalog.deleteDimension.useMutation({
    onSuccess: () => {
      utils.katalog.dimensions.invalidate();
      toast.success("Silindi");
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const rows = (k: Kind) => (dims?.[k] ?? []) as Record<string, unknown>[];
  const seriesName = new Map((series ?? []).map(s => [s.id, s.name]));
  const materialName = new Map((materials ?? []).map(m => [m.id, m.name]));

  function openNew(k: Kind) {
    setKind(k);
    setEditId(null);
    setForm({
      code: "",
      name: "",
      nameEn: "",
      hex: "#888888",
      seriesId: NONE,
      volumeMl: "",
      materialId: NONE,
      skuSegment: "",
      titlePattern: "",
    });
    setOpen(true);
  }

  function openEdit(k: Kind, row: Record<string, unknown>) {
    setKind(k);
    setEditId(row.id as number);
    setForm({
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      nameEn: (row.nameEn as string) ?? "",
      hex: (row.hex as string) ?? "#888888",
      seriesId: row.seriesId != null ? String(row.seriesId) : NONE,
      volumeMl: row.volumeMl != null ? String(parseFloat(String(row.volumeMl))) : "",
      materialId: row.materialId != null ? String(row.materialId) : NONE,
      skuSegment: (row.skuSegment as string) ?? "",
      titlePattern: (row.titlePattern as string) ?? "",
    });
    setOpen(true);
  }

  function submit() {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Kod ve ad gerekli");
    save.mutate({
      kind,
      id: editId,
      code: form.code.trim(),
      name: form.name.trim(),
      nameEn: kind === "colors" ? form.nameEn.trim() || null : undefined,
      hex: kind === "colors" ? form.hex : null,
      seriesId: form.seriesId === NONE ? null : Number(form.seriesId),
      volumeMl: kind === "packagings" ? parseFloat(form.volumeMl) || 0 : undefined,
      materialId: form.materialId === NONE ? null : Number(form.materialId),
      skuSegment: form.skuSegment.trim() || null,
      titlePattern: form.titlePattern.trim() || null,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tanımlar</h1>
        <p className="text-sm text-muted-foreground">
          Ürün sözlüğünün tek kaynağı. Buradaki renk, form, ambalaj ve kullanım alanları master
          ürünlerin koordinatını ve ilan başlıklarını oluşturur.
        </p>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="colors">Renkler</TabsTrigger>
          <TabsTrigger value="families">Formlar</TabsTrigger>
          <TabsTrigger value="packagings">Ambalajlar</TabsTrigger>
          <TabsTrigger value={PACKAGING_COST_TAB}>Ambalaj Maliyeti</TabsTrigger>
          <TabsTrigger value="useCases">Kullanım Alanları</TabsTrigger>
        </TabsList>

        <TabsContent value={PACKAGING_COST_TAB} className="pt-3">
          <PackagingCost />
        </TabsContent>

        {(Object.keys(KIND_META) as Kind[]).map(k => (
          <TabsContent key={k} value={k} className="space-y-3 pt-3">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1 text-sm text-muted-foreground">{KIND_META[k].desc}</p>
              <Button size="sm" onClick={() => openNew(k)}>
                <Plus className="mr-1 h-4 w-4" /> Yeni
              </Button>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="p-2 text-left">Ad</th>
                      <th className="p-2 text-left">Kod</th>
                      {k === "colors" && <th className="p-2 text-left">Seri</th>}
                      {k === "packagings" && <th className="p-2 text-right">Hacim (ml)</th>}
                      {k === "packagings" && <th className="p-2 text-left">Stok kalemi</th>}
                      {(k === "families" || k === "packagings") && (
                        <th className="p-2 text-left">SKU eki</th>
                      )}
                      <th className="p-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(k).map(row => (
                      <tr key={row.id as number} className="border-t">
                        <td className="p-2 font-medium">
                          <span className="flex items-center gap-2">
                            {k === "colors" && (
                              <span
                                className="inline-block h-4 w-4 shrink-0 rounded border"
                                style={{ backgroundColor: (row.hex as string) ?? "#ccc" }}
                              />
                            )}
                            {String(row.name)}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {String(row.code)}
                        </td>
                        {k === "colors" && (
                          <td className="p-2 text-xs">
                            {row.seriesId != null ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {seriesName.get(row.seriesId as number) ?? "?"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">tüm seriler</span>
                            )}
                          </td>
                        )}
                        {k === "packagings" && (
                          <td className="p-2 text-right tabular-nums">
                            {parseFloat(String(row.volumeMl)) > 0 ? (
                              parseFloat(String(row.volumeMl))
                            ) : (
                              <span className="text-amber-600" title="Hacimsiz ambalajda reçete ölçeklenemez">
                                —
                              </span>
                            )}
                          </td>
                        )}
                        {k === "packagings" && (
                          <td className="p-2 text-xs text-muted-foreground">
                            {row.materialId != null
                              ? (materialName.get(row.materialId as number) ?? "?")
                              : "bağlı değil"}
                          </td>
                        )}
                        {(k === "families" || k === "packagings") && (
                          <td className="p-2 font-mono text-xs">{(row.skuSegment as string) ?? "—"}</td>
                        )}
                        <td className="p-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(k, row)}
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
                                  title: "Tanımı sil",
                                  description: `"${String(row.name)}" silinsin mi? Kullanımdaysa engellenecek.`,
                                  confirmText: "Sil",
                                  destructive: true,
                                })
                              )
                                remove.mutate({ kind: k, id: row.id as number });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {rows(k).length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                          Henüz tanım yok — Ürünler sayfasındaki "Boyutları Tohumla" ile mevcut
                          sözlüğünüzden otomatik kurabilirsiniz.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <p className="flex-1 text-sm text-muted-foreground">
          <strong className="text-foreground">Metin şablonları</strong> (etiket yazısı, kullanım
          kılavuzu, güvenlik uyarısı) ve seri ayarları ayrı sayfada — orada ikinci kaynak sorunu yok.
        </p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/sablonlar")}>
          Şablonlar & Seriler
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Düzenle" : "Yeni"} — {KIND_META[kind].title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ad *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={kind === "colors" ? "Candy Red" : "100 ML PET"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kod *</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="font-mono"
                  placeholder={kind === "colors" ? "red1822" : "pet100"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ürün kodunda kullanılır — sonradan değiştirmek eşleşmeyi bozar.
                </p>
              </div>
            </div>

            {kind === "colors" && (
              <>
                <div className="space-y-1.5">
                  <Label>Uluslararası ad</Label>
                  <Input
                    value={form.nameEn}
                    onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    placeholder="MAGENTA"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Satış adında Türkçe adın yanına yazılır: MAGENTA (FUŞYA). Boşsa yalnız Türkçe
                    ad kullanılır.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Renk</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.hex}
                      onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
                      className="h-9 w-14 cursor-pointer rounded-md border bg-transparent"
                    />
                    <Input
                      value={form.hex}
                      onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Seri</Label>
                  <Select
                    value={form.seriesId}
                    onValueChange={v => setForm(f => ({ ...f, seriesId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Tüm seriler</SelectItem>
                      {(series ?? []).map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {kind === "packagings" && (
              <>
                <div className="space-y-1.5">
                  <Label>Hacim (ml)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.volumeMl}
                    onChange={e => setForm(f => ({ ...f, volumeMl: e.target.value }))}
                    placeholder="100"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Reçete ölçeklemesinin paydası. Boş bırakılırsa bu ambalajda reçete
                    ölçeklenemez.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Stok kalemi (şişe/kutu)</Label>
                  <Select
                    value={form.materialId}
                    onValueChange={v => setForm(f => ({ ...f, materialId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Bağlı değil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Bağlı değil</SelectItem>
                      {(materials ?? [])
                        .filter(m => m.type === "ambalaj")
                        .map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Bağlanırsa kapasite hesabı şişeyi de kısıt sayar — boya var ama şişe yoksa
                    üretim görünmez.
                  </p>
                </div>
              </>
            )}

            {(kind === "families" || kind === "packagings") && (
              <div className="space-y-1.5">
                <Label>SKU eki</Label>
                <Input
                  value={form.skuSegment}
                  onChange={e => setForm(f => ({ ...f, skuSegment: e.target.value }))}
                  className="font-mono"
                  placeholder={kind === "families" ? "ab" : "100"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ürün kodunda kullanılır: aoccndred1822<strong>ab100</strong>
                </p>
              </div>
            )}

            {kind === "useCases" && (
              <div className="space-y-1.5">
                <Label>Başlık şablonu</Label>
                <Input
                  value={form.titlePattern}
                  onChange={e => setForm(f => ({ ...f, titlePattern: e.target.value }))}
                  placeholder="{{renk}} {{kullanim}} Boyası {{ambalaj}}"
                />
                <p className="text-[11px] text-muted-foreground">
                  Değişkenler: {"{{marka}} {{seri}} {{renk}} {{form}} {{ambalaj}} {{kullanim}}"} —
                  boş bırakılırsa otomatik başlık kurulur.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
