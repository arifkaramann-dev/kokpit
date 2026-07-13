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
import { Mail, Pencil, Phone, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type SupplierRow = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  suppliesText: string | null;
  lastOrderDate: Date | null;
  priceNotes: string | null;
};

const emptyForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  suppliesText: "",
  lastOrderDate: "",
  priceNotes: "",
};

export default function Suppliers() {
  const utils = trpc.useUtils();
  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery();
  const { data: balances } = trpc.suppliers.balances.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [detail, setDetail] = useState<SupplierRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [form, setForm] = useState(emptyForm);
  const balanceOf = (name: string) => (balances ?? {})[name.trim().toLocaleLowerCase("tr-TR")] ?? 0;

  const ledgerQ = trpc.suppliers.ledger.useQuery({ name: detail?.name ?? "" }, { enabled: !!detail });
  const pay = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.suppliers.ledger.invalidate();
      utils.suppliers.balances.invalidate();
      utils.accounts.invalidate();
      utils.transactions.invalidate();
      utils.dashboard.summary.invalidate();
      setPayAmount("");
      toast.success("Ödeme kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const createSupplier = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      utils.suppliers.invalidate();
      toast.success("Tedarikçi eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateSupplier = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      utils.suppliers.invalidate();
      toast.success("Tedarikçi güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteSupplier = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      utils.suppliers.invalidate();
      toast.success("Tedarikçi silindi");
    },
    onError: e => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(s: SupplierRow) {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      suppliesText: s.suppliesText ?? "",
      lastOrderDate: s.lastOrderDate
        ? new Date(s.lastOrderDate).toISOString().slice(0, 10)
        : "",
      priceNotes: s.priceNotes ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Firma adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      contactPerson: form.contactPerson || null,
      phone: form.phone || null,
      email: form.email || null,
      suppliesText: form.suppliesText || null,
      lastOrderDate: form.lastOrderDate ? new Date(form.lastOrderDate + "T12:00:00") : null,
      priceNotes: form.priceNotes || null,
    };
    if (editing) {
      updateSupplier.mutate({ id: editing.id, data: payload });
    } else {
      createSupplier.mutate(payload);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tedarikçi Rehberi</h1>
          <p className="text-sm text-muted-foreground">
            Tedarikçi bilgileri, son sipariş tarihleri ve fiyat notları.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Tedarikçi
        </Button>
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && ((suppliers as SupplierRow[]) ?? []).length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Henüz tedarikçi eklenmedi</p>
          <p className="text-sm text-muted-foreground">
            Pigment, ambalaj, etiket tedarikçilerinizi kaydedin; son sipariş ve fiyat notlarını takip edin.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {((suppliers as SupplierRow[]) ?? []).map(s => (
          <Card key={s.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{s.name}</p>
                {s.contactPerson && (
                  <p className="text-xs text-muted-foreground">{s.contactPerson}</p>
                )}
              </div>
              <div className="flex gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (confirm(`"${s.name}" silinsin mi?`)) deleteSupplier.mutate({ id: s.id });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {s.suppliesText && (
              <p className="text-sm text-muted-foreground line-clamp-2">{s.suppliesText}</p>
            )}
            <div className="space-y-1 text-xs">
              {s.phone && (
                <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-primary hover:underline">
                  <Phone className="h-3 w-3" /> {s.phone}
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
                  <Mail className="h-3 w-3" /> {s.email}
                </a>
              )}
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>Son sipariş: {formatDate(s.lastOrderDate)}</span>
            </div>
            <button
              onClick={() => setDetail(s)}
              className="flex w-full items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs hover:bg-muted transition-colors"
              title="Cari ekstre & ödeme"
            >
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Cari bakiye</span>
              <span className={`ml-auto font-semibold ${balanceOf(s.name) > 0.01 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatTL(balanceOf(s.name))}
                {balanceOf(s.name) > 0.01 ? " borç" : ""}
              </span>
            </button>
            {s.priceNotes && (
              <p className="text-xs rounded-md bg-muted p-2 line-clamp-3">{s.priceNotes}</p>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name} — Cari Ekstre</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Bakiye (bizim borcumuz)</span>
                <span className={`text-lg font-bold ${(ledgerQ.data?.balance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {formatTL(ledgerQ.data?.balance ?? 0)}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Ödeme tutarı</Label>
                  <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Ödenen tutar" />
                </div>
                <Button
                  onClick={() => {
                    const amount = parseFloat(payAmount);
                    if (!amount || amount <= 0) return toast.error("Geçerli tutar girin");
                    pay.mutate({ direction: "out", category: "odeme", amount, supplierName: detail.name });
                  }}
                  disabled={pay.isPending}
                >
                  Ödeme Ekle
                </Button>
              </div>
              <div className="space-y-1 max-h-[45vh] overflow-y-auto">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[11px] text-muted-foreground px-1">
                  <span>İşlem</span>
                  <span className="text-right w-20">Tutar</span>
                  <span className="text-right w-24">Bakiye</span>
                </div>
                {(ledgerQ.data?.rows ?? []).map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center border-b py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">
                        {r.label}
                        {r.ref ? <span className="text-muted-foreground"> · {r.ref}</span> : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(r.date)}</p>
                    </div>
                    <span className={`text-right w-20 ${r.debit > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {r.debit > 0 ? formatTL(r.debit) : `−${formatTL(r.credit)}`}
                    </span>
                    <span className="text-right w-24 font-medium">{formatTL(r.balance)}</span>
                  </div>
                ))}
                {(ledgerQ.data?.rows ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Bu tedarikçiye ait hareket yok.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Tedarikçiyi Düzenle" : "Yeni Tedarikçi"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Firma Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. ABC Kimya Ltd."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>İlgili Kişi</Label>
                <Input
                  value={form.contactPerson}
                  onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05xx xxx xx xx"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-posta</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Son Sipariş Tarihi</Label>
                <Input
                  type="date"
                  value={form.lastOrderDate}
                  onChange={e => setForm(f => ({ ...f, lastOrderDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tedarik Ettiği Malzemeler</Label>
              <Input
                value={form.suppliesText}
                onChange={e => setForm(f => ({ ...f, suppliesText: e.target.value }))}
                placeholder="Örn. pigmentler, 100ml şişe, etiket"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fiyat Notları</Label>
              <Textarea
                value={form.priceNotes}
                onChange={e => setForm(f => ({ ...f, priceNotes: e.target.value }))}
                rows={2}
                placeholder="Örn. Siyah pigment 450₺/kg (Haziran 2026), 10kg üzeri %5 iskonto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createSupplier.isPending || updateSupplier.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
