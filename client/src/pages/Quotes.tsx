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
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { printQuote } from "@/lib/quote";
import { trpc } from "@/lib/trpc";
import { ArrowRight, FileText, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ItemRow = { productName: string; quantity: string; unitPrice: string };

type QuoteRow = {
  id: number;
  quoteNo: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  validUntil: string | Date | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "converted";
  totalAmount: string;
  itemsSummary: string | null;
  notes: string | null;
  convertedOrderId: number | null;
  createdAt: string | Date;
};

const STATUS: Record<QuoteRow["status"], { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Gönderildi", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  accepted: { label: "Kabul", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Red", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  converted: { label: "Siparişe Döndü", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
};

const emptyForm = {
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  validUntil: "",
  notes: "",
  items: [] as ItemRow[],
};

function parseItemRows(items: ItemRow[]) {
  return items
    .map(i => ({
      productName: i.productName.trim(),
      quantity: parseFloat(i.quantity) || 0,
      unitPrice: parseFloat(i.unitPrice) || 0,
    }))
    .filter(i => i.productName && i.quantity > 0);
}

export default function Quotes() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: quotes, isLoading } = trpc.quotes.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuoteRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => utils.quotes.list.invalidate();
  const create = trpc.quotes.create.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Teklif oluşturuldu");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.quotes.update.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Teklif güncellendi");
    },
    onError: e => toast.error(e.message),
  });
  const setStatus = trpc.quotes.setStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const remove = trpc.quotes.delete.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const convert = trpc.quotes.convert.useMutation({
    onSuccess: r => {
      invalidate();
      utils.orders.list.invalidate();
      toast.success("Teklif siparişe dönüştürüldü");
      setLocation("/siparisler");
      void r;
    },
    onError: e => toast.error(e.message),
  });

  const list = (quotes as QuoteRow[]) ?? [];
  const totalItems = form.items.reduce(
    (s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0),
    0,
  );

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function openEdit(q: QuoteRow) {
    setEditing(q);
    const items = await utils.quotes.items.fetch({ quoteId: q.id });
    setForm({
      customerName: q.customerName,
      customerPhone: q.customerPhone ?? "",
      customerAddress: q.customerAddress ?? "",
      validUntil: q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : "",
      notes: q.notes ?? "",
      items: items.map(i => ({
        productName: i.productName,
        quantity: String(parseFloat(i.quantity)),
        unitPrice: String(parseFloat(i.unitPrice)),
      })),
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.customerName.trim()) {
      toast.error("Müşteri adı gerekli");
      return;
    }
    const items = parseItemRows(form.items);
    const payload = {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim() || null,
      customerAddress: form.customerAddress.trim() || null,
      validUntil: form.validUntil || null,
      notes: form.notes.trim() || null,
      items,
    };
    if (editing) update.mutate({ id: editing.id, data: payload });
    else create.mutate(payload);
  }

  async function doPrint(q: QuoteRow) {
    const [items, company] = await Promise.all([
      utils.client.quotes.items.query({ quoteId: q.id }),
      utils.client.settings.get.query(),
    ]);
    printQuote(
      {
        quoteNo: q.quoteNo,
        date: q.createdAt,
        validUntil: q.validUntil,
        customerName: q.customerName,
        customerPhone: q.customerPhone,
        customerAddress: q.customerAddress,
        items,
        total: q.totalAmount,
        notes: q.notes,
      },
      company as Record<string, string>,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teklifler</h1>
          <p className="text-sm text-muted-foreground">
            Müşteriye fiyat teklifi ver, kabul edilince tek tıkla siparişe dönüştür.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Yeni Teklif
        </Button>
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && list.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Henüz teklif yok. "Yeni Teklif" ile başla.</p>
        </Card>
      )}

      <div className="space-y-2">
        {list.map(q => {
          const st = STATUS[q.status];
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{q.customerName}</span>
                    <Badge className={st.cls} variant="secondary">
                      {st.label}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">{q.quoteNo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {q.itemsSummary || "Kalemsiz"} · {formatTL(q.totalAmount)}
                    {q.validUntil && (
                      <> · Geçerlilik: {new Date(q.validUntil).toLocaleDateString("tr-TR")}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {q.status !== "converted" && (
                    <select
                      value={q.status}
                      onChange={e => setStatus.mutate({ id: q.id, status: e.target.value as QuoteRow["status"] })}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="draft">Taslak</option>
                      <option value="sent">Gönderildi</option>
                      <option value="accepted">Kabul</option>
                      <option value="rejected">Red</option>
                    </select>
                  )}
                  <Button variant="outline" size="sm" className="h-8" onClick={() => doPrint(q)}>
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  {q.status !== "converted" ? (
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={convert.isPending}
                      onClick={() => convert.mutate({ id: q.id })}
                    >
                      Siparişe Dönüştür <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => setLocation("/siparisler")}
                    >
                      Siparişi Gör <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                  {q.status !== "converted" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Teklif silinsin mi?")) remove.mutate({ id: q.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Teklifi Düzenle" : "Yeni Teklif"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Müşteri</Label>
              <Input
                list="quote-customer-names"
                value={form.customerName}
                onChange={e => {
                  const name = e.target.value;
                  const match = (
                    (customersList as { name: string; phone: string | null; address: string | null }[]) ?? []
                  ).find(c => c.name === name);
                  setForm(f => ({
                    ...f,
                    customerName: name,
                    customerPhone: match?.phone ?? f.customerPhone,
                    customerAddress: match?.address ?? f.customerAddress,
                  }));
                }}
                placeholder="Müşteri adı"
              />
              <datalist id="quote-customer-names">
                {((customersList as { id: number; name: string }[]) ?? []).map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input
                  value={form.customerPhone}
                  onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="05.."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Geçerlilik Tarihi</Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Input
                value={form.customerAddress}
                onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))}
                placeholder="Teslimat adresi"
              />
            </div>

            {/* Kalem satırları */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Teklif Kalemleri</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setForm(f => ({ ...f, items: [...f.items, { productName: "", quantity: "1", unitPrice: "" }] }))
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Satır Ekle
                </Button>
              </div>
              {form.items.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_64px_88px_28px] gap-1.5 text-[11px] text-muted-foreground px-0.5">
                    <span>Ürün / Hizmet</span>
                    <span>Adet</span>
                    <span>Birim ₺</span>
                    <span />
                  </div>
                  {form.items.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_64px_88px_28px] gap-1.5 items-center">
                      <Input
                        list="quote-product-options"
                        value={row.productName}
                        placeholder="Ürün/hizmet adı"
                        onChange={e => {
                          const name = e.target.value;
                          setForm(f => {
                            const items = [...f.items];
                            const matched = products?.find(p => p.name === name);
                            items[idx] = {
                              ...items[idx],
                              productName: name,
                              unitPrice:
                                matched && !items[idx].unitPrice
                                  ? String(parseFloat(matched.salePrice))
                                  : items[idx].unitPrice,
                            };
                            return { ...f, items };
                          });
                        }}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.quantity}
                        onChange={e =>
                          setForm(f => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], quantity: e.target.value };
                            return { ...f, items };
                          })
                        }
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={row.unitPrice}
                        onChange={e =>
                          setForm(f => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], unitPrice: e.target.value };
                            return { ...f, items };
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <datalist id="quote-product-options">
                    {(products ?? []).map(p => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                  <p className="text-right text-sm font-medium pt-1">Toplam: {formatTL(totalItems)}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Teklife eklenecek not (opsiyonel)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? "Kaydet" : "Teklif Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
