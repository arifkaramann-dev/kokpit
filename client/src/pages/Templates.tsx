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
  const usesContent = !["ambalaj", "renk", "set_paket", "etiket_boyutu", "hammadde_kategori", "kuruma_suresi", "kat_sayisi", "uygulama_yontemi"].includes(kind);

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
