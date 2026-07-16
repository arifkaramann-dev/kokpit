import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTL } from "@/lib/format";
import { printQuote, whatsappQuoteLink } from "@/lib/quote";
import { trpc } from "@/lib/trpc";
import {
  ArrowRightCircle,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

type QuoteRow = {
  id: number;
  quoteNo: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  status: QuoteStatus;
  validUntil: Date | null;
  totalAmount: string;
  itemsSummary: string | null;
  notes: string | null;
  orderId: number | null;
  createdAt: Date;
};

const STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Gönderildi", cls: "bg-blue-500/15 text-blue-600" },
  accepted: { label: "Kabul edildi", cls: "bg-emerald-500/15 text-emerald-600" },
  rejected: { label: "Reddedildi", cls: "bg-rose-500/15 text-rose-600" },
  expired: { label: "Süresi doldu", cls: "bg-amber-500/15 text-amber-600" },
  converted: { label: "Siparişe dönüştü", cls: "bg-violet-500/15 text-violet-600" },
};

type ItemRow = { productName: string; quantity: string; unitPrice: string };

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
    .filter(r => r.productName.trim())
    .map(r => ({
      productName: r.productName.trim(),
      quantity: parseFloat(r.quantity) || 1,
      unitPrice: parseFloat(r.unitPrice) || 0,
    }));
}

export default function Quotes() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
  const { data: quotes, isLoading } = trpc.quotes.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<QuoteRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const create = trpc.quotes.create.useMutation({
    onSuccess: () => {
      utils.quotes.invalidate();
      toast.success("Teklif oluşturuldu");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.quotes.update.useMutation({
    onSuccess: () => {
      utils.quotes.invalidate();
      toast.success("Teklif güncellendi");
      setDialogOpen(false);
      setEditQuote(null);
      setForm(emptyForm);
    },
    onError: e => toast.error(e.message),
  });
  const setStatus = trpc.quotes.setStatus.useMutation({
    onSuccess: () => utils.quotes.invalidate(),
    onError: e => toast.error(e.message),
  });
  const remove = trpc.quotes.delete.useMutation({
    onSuccess: () => {
      utils.quotes.invalidate();
      toast.success("Teklif silindi");
    },
    onError: e => toast.error(e.message),
  });
  const convert = trpc.quotes.convert.useMutation({
    onSuccess: res => {
      utils.quotes.invalidate();
      utils.orders.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success(`Sipariş oluşturuldu: ${res.orderNo}`, {
        action: { label: "Panoya git", onClick: () => setLocation("/siparisler") },
      });
    },
    onError: e => toast.error(e.message),
  });

  const rows = (quotes as QuoteRow[]) ?? [];
  const num = (v: string) => parseFloat(v) || 0;
  const openTotal = rows
    .filter(q => q.status === "draft" || q.status === "sent" || q.status === "accepted")
    .reduce((s, q) => s + num(q.totalAmount), 0);
  const acceptedCount = rows.filter(q => q.status === "accepted").length;
  const isExpired = (q: QuoteRow) =>
    (q.status === "draft" || q.status === "sent") &&
    q.validUntil != null &&
    new Date(q.validUntil).getTime() < Date.now();

  function openCreate() {
    setEditQuote(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function openEdit(q: QuoteRow) {
    setEditQuote(q);
    setForm({
      customerName: q.customerName,
      customerPhone: q.customerPhone ?? "",
      customerAddress: q.customerAddress ?? "",
      validUntil: q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : "",
      notes: q.notes ?? "",
      items: [],
    });
    setDialogOpen(true);
    try {
      const items = await utils.quotes.items.fetch({ quoteId: q.id });
      setForm(f => ({
        ...f,
        items: items.map(i => ({
          productName: i.productName,
          quantity: String(parseFloat(String(i.quantity))),
          unitPrice: String(parseFloat(String(i.unitPrice))),
        })),
      }));
    } catch {
      /* kalemler yüklenemezse boş satırlarla düzenlenebilir */
    }
  }

  // Müşteri datalist'ten seçilirse telefon/adres otomatik dolar (sipariş formuyla aynı).
  function onCustomerName(name: string) {
    const match = ((customersList as { name: string; phone: string | null; address: string | null }[]) ?? []).find(
      c => c.name === name,
    );
    setForm(f =>
      match
        ? { ...f, customerName: name, customerPhone: match.phone ?? f.customerPhone, customerAddress: match.address ?? f.customerAddress }
        : { ...f, customerName: name },
    );
  }

  function submit() {
    if (!form.customerName.trim()) {
      toast.error("Müşteri adı gerekli");
      return;
    }
    const payload = {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone || null,
      customerAddress: form.customerAddress || null,
      validUntil: form.validUntil || null,
      notes: form.notes || null,
      items: parseItemRows(form.items),
    };
    if (editQuote) update.mutate({ id: editQuote.id, data: payload });
    else create.mutate(payload);
  }

  async function print(q: QuoteRow) {
    const [items, company] = await Promise.all([
      utils.client.quotes.items.query({ quoteId: q.id }),
      utils.client.settings.get.query(),
    ]);
    printQuote(
      {
        quoteNo: q.quoteNo,
        customerName: q.customerName,
        createdAt: q.createdAt,
        validUntil: q.validUntil,
        notes: q.notes,
        phone: q.customerPhone,
        address: q.customerAddress,
      },
      items.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
      company as Record<string, string>,
    );
  }

  async function share(q: QuoteRow) {
    const company = await utils.client.settings.get.query();
    window.open(
      whatsappQuoteLink(
        { quoteNo: q.quoteNo, customerName: q.customerName, createdAt: q.createdAt, validUntil: q.validUntil, phone: q.customerPhone },
        q.totalAmount,
        company as Record<string, string>,
      ),
      "_blank",
    );
  }

  async function onConvert(q: QuoteRow) {
    const ok = await confirm({
      title: "Siparişe dönüştürülsün mü?",
      description: `${q.quoteNo} — ${q.customerName} (${formatTL(q.totalAmount)}) için yeni sipariş oluşturulacak ve ürün bağlı kalemler stoktan düşülecek.`,
      confirmText: "Siparişe Dönüştür",
    });
    if (ok) convert.mutate({ id: q.id });
  }

  async function onDelete(q: QuoteRow) {
    const ok = await confirm({
      title: "Teklif silinsin mi?",
      description: `${q.quoteNo} — ${q.customerName}. Bu işlem geri alınamaz.`,
      confirmText: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate({ id: q.id });
  }

  const itemsTotal = parseItemRows(form.items).reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teklifler</h1>
          <p className="text-sm text-muted-foreground">
            Fiyat teklifi hazırla, yazdır/gönder; kabul edilince tek tıkla siparişe dönüştür.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-4 py-2">
            <p className="text-[11px] text-muted-foreground leading-none">Açık teklif toplamı</p>
            <p className="text-lg font-bold">{formatTL(openTotal)}</p>
          </Card>
          {acceptedCount > 0 && (
            <Card className="px-4 py-2">
              <p className="text-[11px] text-muted-foreground leading-none">Dönüştürülmeyi bekleyen</p>
              <p className="text-lg font-bold text-emerald-600">{acceptedCount}</p>
            </Card>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Yeni Teklif
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editQuote ? "Teklifi Düzenle" : "Yeni Teklif"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Müşteri</Label>
                  <Input
                    list="quote-customer-names"
                    value={form.customerName}
                    onChange={e => onCustomerName(e.target.value)}
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
                      placeholder="05xx"
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
                        <span>Ürün</span>
                        <span>Adet</span>
                        <span>Birim ₺</span>
                        <span />
                      </div>
                      {form.items.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_64px_88px_28px] gap-1.5 items-center">
                          <Input
                            list="quote-product-options"
                            value={row.productName}
                            placeholder="Ürün adı"
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
                        {products?.map(p => (
                          <option key={p.id} value={p.name} />
                        ))}
                      </datalist>
                      <p className="text-sm font-medium text-right">Toplam: {formatTL(itemsTotal)}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Teslimat Adresi</Label>
                  <Textarea
                    value={form.customerAddress}
                    onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))}
                    placeholder="Siparişe dönüşünce kargo etiketine yazılır"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notlar</Label>
                  <Textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Teklif çıktısında görünür (ödeme koşulları, teslim süresi vb.)"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={create.isPending || update.isPending}>
                  {editQuote ? "Kaydet" : "Teklif Oluştur"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && rows.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Henüz teklif yok</p>
          <p className="text-sm text-muted-foreground">
            "Yeni Teklif" ile ilk fiyat teklifini hazırla; kabul edilince tek tıkla siparişe dönüşür.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="divide-y">
          {rows.map(q => (
            <div key={q.id} className={`flex items-center gap-3 px-4 py-2.5 flex-wrap ${isExpired(q) ? "bg-amber-500/5" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {q.customerName}
                  <span className="text-muted-foreground font-normal"> · {q.quoteNo}</span>
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatDate(q.createdAt)}
                  {q.validUntil ? ` · geçerlilik ${formatDate(q.validUntil)}${isExpired(q) ? " (geçti)" : ""}` : ""}
                  {q.itemsSummary ? ` · ${q.itemsSummary}` : ""}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap">{formatTL(q.totalAmount)}</span>
              {q.status === "converted" ? (
                <span className={`text-xs px-2 py-1 rounded-md whitespace-nowrap ${STATUS.converted.cls}`}>
                  {STATUS.converted.label}
                </span>
              ) : (
                <Select value={q.status} onValueChange={v => setStatus.mutate({ id: q.id, status: v as Exclude<QuoteStatus, "converted"> })}>
                  <SelectTrigger className={`h-7 w-[130px] text-xs border-0 ${STATUS[q.status].cls}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["draft", "sent", "accepted", "rejected", "expired"] as const).map(s => (
                      <SelectItem key={s} value={s}>
                        {STATUS[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                {q.status !== "converted" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-emerald-600"
                    title="Siparişe dönüştür"
                    onClick={() => onConvert(q)}
                    disabled={convert.isPending}
                  >
                    <ArrowRightCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Yazdır / PDF" onClick={() => print(q)}>
                  <Printer className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="WhatsApp ile gönder" onClick={() => share(q)}>
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
                {q.status !== "converted" && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Düzenle" onClick={() => openEdit(q)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Sil" onClick={() => onDelete(q)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
