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
import { trpc } from "@/lib/trpc";
import { LibraryBig, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const KINDS = [
  { key: "ambalaj", label: "Ambalaj", hint: "Örn. 400 ml Sprey, 1 L Teneke — türetmede kullanılır" },
  { key: "renk", label: "Renk", hint: "Örn. Açık Gri, Antrasit Gri — türetmede kullanılır" },
  { key: "set_paket", label: "Set / Paket", hint: "Örn. 2'li Set, 5'li Paket — türev fiyatı adetle çarpılır" },
  { key: "etiket_boyutu", label: "Etiket Boyutu", hint: "Örn. 6x9 cm" },
  { key: "etiket_yazisi", label: "Etiket Yazısı", hint: "Etiket üzerindeki tam metin" },
  { key: "kilavuz", label: "Kullanım Kılavuzu", hint: "Uygulama adımları" },
  { key: "guvenlik", label: "Güvenlik / Uyarı", hint: "Saklama koşulları, uyarılar" },
  { key: "hammadde_kategori", label: "Hammadde Kategorisi", hint: "Örn. Selülozik Boya, Mix Boya, Akrilik Boya" },
  { key: "uygulama_yontemi", label: "Uygulama Yöntemi", hint: "Örn. Fırça / rulo, 2 kat" },
  { key: "kuruma_suresi", label: "Kuruma Süresi", hint: "Örn. Dokunma 30 dk, tam 24 saat" },
  { key: "kat_sayisi", label: "Kat Sayısı", hint: "Örn. 2-3 kat" },
  { key: "test_sonucu", label: "Test Sonucu", hint: "Örn. Örtücülük yüksek, akma yok" },
  { key: "ozellik", label: "Özellik", hint: "Örn. Hızlı Kuruma, Parlak, Renk Değiştiren — ürün kartı özellikleri" },
  { key: "urun_turu", label: "Ürün Türü", hint: "Örn. Akrilik 2k, Astar, Bazkat, Selülozik" },
  { key: "zemin", label: "Zemin / Yüzey", hint: "Örn. Metal, Plastik, 3D Baskı, Tüm Yüzeylere" },
  { key: "kategori", label: "Kategori", hint: "Örn. Boya, Sprey, Yardımcı Ürünler — pazaryeri kategorisi" },
] as const;

type Kind = (typeof KINDS)[number]["key"];

export default function Templates() {
  const utils = trpc.useUtils();
  const { data: templates } = trpc.templates.list.useQuery();
  const [kind, setKind] = useState<Kind>("ambalaj");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const invalidate = () => utils.templates.list.invalidate();
  const create = trpc.templates.create.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Şablon eklendi");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.templates.update.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Şablon güncellendi");
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.templates.delete.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });

  const active = KINDS.find(k => k.key === kind)!;
  const list = (templates ?? []).filter(t => t.kind === kind);
  const usesContent = !["ambalaj", "renk", "set_paket", "etiket_boyutu", "hammadde_kategori", "kuruma_suresi", "kat_sayisi", "uygulama_yontemi", "ozellik", "urun_turu", "zemin", "kategori"].includes(kind);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Şablonlar</h1>
        <p className="text-sm text-muted-foreground">
          Etiket, kılavuz, ambalaj, renk ve kategori gibi tekrar kullanılan bilgileri bir kez
          tanımla — ürünlere ve türetmeye tek tıkla eklensin.
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {KINDS.map(k => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              kind === k.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <LibraryBig className="h-4 w-4 text-primary" /> {active.label}
            </h2>
            <p className="text-xs text-muted-foreground">{active.hint}</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setName("");
              setContent("");
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Yeni
          </Button>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Bu türde şablon yok — "Yeni" ile ekle.
          </p>
        ) : (
          <div className="space-y-1.5">
            {list.map(t => (
              <div key={t.id} className="flex items-start gap-2 rounded-lg border p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.content && (
                    <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                      {t.content}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(t.id);
                    setName(t.name);
                    setContent(t.content ?? "");
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate({ id: t.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SeriesManager />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Şablonu Düzenle" : "Yeni Şablon"} — {active.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ad / Kısa Değer *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={active.hint} />
            </div>
            {usesContent && (
              <div className="space-y-1.5">
                <Label>İçerik</Label>
                <Textarea
                  rows={5}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Tam metin (ürüne bu içerik doldurulur)"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={create.isPending || update.isPending}
              onClick={() => {
                if (!name.trim()) return toast.error("Ad gerekli");
                if (editingId) update.mutate({ id: editingId, name: name.trim(), content: content.trim() || null });
                else create.mutate({ kind, name: name.trim(), content: content.trim() || null });
              }}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const emptySeriesForm = {
  name: "",
  profitMargin: "35",
  vatRate: "20",
  category: "",
  shortDescription: "",
  longDescription: "",
  applicationText: "",
};

/**
 * Ürün serileri yönetimi: seri bazlı kâr oranı, KDV ve hazır açıklamalar.
 * Ürün formundaki "Otomatik Doldur" bu kayıtlardan beslenir.
 */
function SeriesManager() {
  const utils = trpc.useUtils();
  const { data: seriesList } = trpc.series.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySeriesForm);

  const invalidate = () => utils.series.list.invalidate();
  const create = trpc.series.create.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Seri eklendi");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.series.update.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Seri güncellendi");
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.series.delete.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });

  function submit() {
    if (!form.name.trim()) return toast.error("Seri adı gerekli");
    const payload = {
      name: form.name.trim(),
      profitMargin: parseFloat(form.profitMargin.replace(",", ".")) || 0,
      vatRate: parseFloat(form.vatRate.replace(",", ".")) || 0,
      category: form.category || null,
      shortDescription: form.shortDescription || null,
      longDescription: form.longDescription || null,
      applicationText: form.applicationText || null,
    };
    if (editingId) update.mutate({ id: editingId, data: payload });
    else create.mutate(payload);
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <LibraryBig className="h-4 w-4 text-primary" /> Ürün Serileri
          </h2>
          <p className="text-xs text-muted-foreground">
            Seri bazlı kâr oranı, KDV ve hazır açıklamalar — ürün formundaki "Otomatik Doldur" buradan beslenir.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm(emptySeriesForm);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Yeni Seri
        </Button>
      </div>
      {(seriesList ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Henüz seri yok — "Yeni Seri" ile ekle (örn. CANDY %35 kâr, %20 KDV).
        </p>
      ) : (
        <div className="space-y-1.5">
          {(seriesList ?? []).map(s => (
            <div key={s.id} className="flex items-start gap-2 rounded-lg border p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {s.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Kâr %{parseFloat(String(s.profitMargin))} · KDV %{parseFloat(String(s.vatRate))}
                    {s.category ? ` · ${s.category}` : ""}
                  </span>
                </p>
                {s.longDescription && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{s.longDescription}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditingId(s.id);
                  setForm({
                    name: s.name,
                    profitMargin: String(parseFloat(String(s.profitMargin)) || 0),
                    vatRate: String(parseFloat(String(s.vatRate)) || 0),
                    category: s.category ?? "",
                    shortDescription: s.shortDescription ?? "",
                    longDescription: s.longDescription ?? "",
                    applicationText: s.applicationText ?? "",
                  });
                  setOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate({ id: s.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Seriyi Düzenle" : "Yeni Seri"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Seri Adı *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Örn. CANDY, METEOR"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Boya, Sprey, Yardımcı Ürünler"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kâr Oranı %</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.profitMargin}
                  onChange={e => setForm(f => ({ ...f, profitMargin: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>KDV %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.vatRate}
                  onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Kısa Açıklama</Label>
              <Textarea
                rows={2}
                value={form.shortDescription}
                onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                placeholder="Bu serinin ürünlerine önerilecek kısa açıklama"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Uzun Açıklama</Label>
              <Textarea
                rows={5}
                value={form.longDescription}
                onChange={e => setForm(f => ({ ...f, longDescription: e.target.value }))}
                placeholder="Bu serinin ürünlerine önerilecek detaylı pazarlama metni"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Uygulama Metni</Label>
              <Textarea
                rows={4}
                value={form.applicationText}
                onChange={e => setForm(f => ({ ...f, applicationText: e.target.value }))}
                placeholder="Bu serinin ürünlerine önerilecek uygulama talimatı"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button disabled={create.isPending || update.isPending} onClick={submit}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
