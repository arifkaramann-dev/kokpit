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
import { formatDate, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Contact, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
};

const emptyForm = { name: "", phone: "", email: "", address: "", city: "", notes: "" };

export default function Customers() {
  const utils = trpc.useUtils();
  const { data: customers, isLoading } = trpc.customers.list.useQuery();
  const { data: orders } = trpc.orders.list.useQuery();

  // Müşteri adına göre sipariş özeti (ada göre eşleştirme; FK yok).
  const statsByName = useMemo(() => {
    const m = new Map<string, { count: number; total: number; due: number }>();
    for (const o of orders ?? []) {
      const key = o.customerName.trim().toLocaleLowerCase("tr-TR");
      const cur = m.get(key) ?? { count: 0, total: 0, due: 0 };
      const total = parseFloat(o.totalAmount) || 0;
      const paid = parseFloat(o.paidAmount ?? "0") || 0;
      cur.count += 1;
      cur.total += total;
      if (o.paymentStatus !== "paid") cur.due += Math.max(0, total - paid);
      m.set(key, cur);
    }
    return m;
  }, [orders]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [detail, setDetail] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      toast.success("Müşteri eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateCustomer = trpc.customers.update.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      toast.success("Müşteri güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteCustomer = trpc.customers.delete.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      toast.success("Müşteri silindi");
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = (customers as CustomerRow[]) ?? [];
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return list;
    return list.filter(c =>
      [c.name, c.phone, c.city, c.address].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [customers, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: CustomerRow) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Müşteri adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      notes: form.notes || null,
    };
    if (editing) updateCustomer.mutate({ id: editing.id, data: payload });
    else createCustomer.mutate(payload);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Müşteriler</h1>
          <p className="text-sm text-muted-foreground">
            Ad, telefon ve adres kaydı — sipariş açarken seçince fatura ve kargo etiketine otomatik geçer.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Müşteri
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Ad, telefon, şehir ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {((customers as CustomerRow[]) ?? []).length} müşteri
          {(() => {
            const totalDue = Array.from(statsByName.values()).reduce((s, v) => s + v.due, 0);
            return totalDue > 0 ? ` · ${formatTL(totalDue)} toplam alacak` : "";
          })()}
        </span>
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && filtered.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Contact className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">{search ? "Eşleşen müşteri yok" : "Henüz müşteri eklenmedi"}</p>
          <p className="text-sm text-muted-foreground">
            Müşterilerinizi kaydedin; sipariş açarken adres ve telefon bilgisi tek tıkla gelsin.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(c => (
          <Card key={c.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{c.name}</p>
                {c.city && <p className="text-xs text-muted-foreground">{c.city}</p>}
              </div>
              <div className="flex gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (confirm(`"${c.name}" silinsin mi?`)) deleteCustomer.mutate({ id: c.id });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              {c.phone && (
                <div className="flex items-center gap-2">
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-primary hover:underline">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </a>
                  <a
                    href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-emerald-600 hover:underline"
                    title="WhatsApp'tan yaz"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                </div>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
                  <Mail className="h-3 w-3" /> {c.email}
                </a>
              )}
              {c.address && (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> <span className="line-clamp-2">{c.address}</span>
                </p>
              )}
            </div>
            {(() => {
              const s = statsByName.get(c.name.trim().toLocaleLowerCase("tr-TR"));
              if (!s) return null;
              return (
                <button
                  onClick={() => setDetail(c)}
                  className="flex w-full items-center gap-2 border-t pt-2 text-xs hover:text-primary transition-colors"
                  title="Sipariş geçmişini gör"
                >
                  <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{s.count} sipariş</span>
                  <span className="ml-auto font-medium">{formatTL(s.total)}</span>
                  {s.due > 0 && (
                    <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      {formatTL(s.due)} borç
                    </span>
                  )}
                </button>
              );
            })()}
            {c.notes && <p className="text-xs rounded-md bg-muted p-2 line-clamp-3">{c.notes}</p>}
          </Card>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name} — Sipariş Geçmişi</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(orders ?? [])
                .filter(o => o.customerName.trim().toLocaleLowerCase("tr-TR") === detail.name.trim().toLocaleLowerCase("tr-TR"))
                .map(o => (
                  <div key={o.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{o.orderNo}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(o.createdAt)} · {o.channel}</p>
                    </div>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        o.paymentStatus === "paid"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {o.paymentStatus === "paid" ? "Ödendi" : o.paymentStatus === "partial" ? "Kısmi" : "Bekliyor"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">{formatTL(o.totalAmount)}</span>
                  </div>
                ))}
              {(orders ?? []).filter(o => o.customerName.trim().toLocaleLowerCase("tr-TR") === detail.name.trim().toLocaleLowerCase("tr-TR")).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Bu müşteriye ait sipariş yok.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Müşteriyi Düzenle" : "Yeni Müşteri"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ad Soyad *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. Ayşe Yılmaz"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05xx xxx xx xx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Şehir</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Textarea
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                rows={2}
                placeholder="Kargo/teslimat adresi"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createCustomer.isPending || updateCustomer.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
