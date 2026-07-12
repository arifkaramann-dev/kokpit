import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
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
import { trpc } from "@/lib/trpc";
import { CHANNELS, formatDate, formatTL, ORDER_STATUSES, OrderStatus } from "@/lib/format";
import { printInvoice } from "@/lib/invoice";
import { AlertCircle, CheckCircle2, FileText, GripVertical, Pencil, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type OrderRow = {
  id: number;
  orderNo: string;
  customerName: string;
  channel: string | null;
  status: OrderStatus;
  totalAmount: string;
  itemsSummary: string | null;
  notes: string | null;
  createdAt: Date;
};

type ItemRow = { productName: string; quantity: string; unitPrice: string };

const emptyForm = {
  customerName: "",
  channel: "web",
  totalAmount: "",
  itemsSummary: "",
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

export default function Orders() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: orders, isLoading } = trpc.orders.list.useQuery();
  const { data: products } = trpc.products.list.useQuery();
  const { data: mpStatus } = trpc.orders.marketplaceStatus.useQuery();
  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [manualSale, setManualSale] = useState(false);
  const autoSynced = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const setStatus = trpc.orders.setStatus.useMutation({
    onMutate: async input => {
      await utils.orders.list.cancel();
      const prev = utils.orders.list.getData();
      utils.orders.list.setData(undefined, old =>
        old?.map(o => (o.id === input.id ? { ...o, status: input.status } : o)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.orders.list.setData(undefined, ctx.prev);
      toast.error("Durum güncellenemedi");
    },
    onSettled: () => utils.orders.list.invalidate(),
  });

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Sipariş eklendi");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: e => toast.error(e.message),
  });

  const updateOrder = trpc.orders.update.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      toast.success("Sipariş güncellendi");
      setDialogOpen(false);
      setEditOrder(null);
      setForm(emptyForm);
    },
    onError: e => toast.error(e.message),
  });

  // Sayfa açılınca ve açık kaldıkça 10 dk'da bir tüm pazaryerlerini sessizce çek.
  useEffect(() => {
    const quietSync = () => {
      utils.client.orders.syncAll
        .mutate()
        .then(results => {
          const total = results.reduce((s, r) => s + r.imported, 0);
          if (total > 0) {
            utils.orders.list.invalidate();
            utils.dashboard.summary.invalidate();
            const parts = results.filter(r => r.imported > 0).map(r => `${r.label}: ${r.imported}`);
            toast.success(`Yeni sipariş: ${parts.join(", ")}`);
          }
        })
        .catch(() => {
          /* yapılandırılmamışsa sessiz geç */
        });
    };
    if (!autoSynced.current) {
      autoSynced.current = true;
      quietSync();
    }
    const timer = setInterval(quietSync, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [utils]);

  const syncAll = trpc.orders.syncAll.useMutation({
    onSuccess: results => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      const imported = results.reduce((s, r) => s + r.imported, 0);
      const errors = results.filter(r => r.error);
      const configured = results.filter(r => r.skippedReason !== "not_configured");
      if (configured.length === 0) {
        toast.error("Hiçbir pazaryeri bağlı değil. Ayarlar'dan API bilgilerini girin.");
        return;
      }
      if (errors.length > 0) {
        errors.forEach(e => toast.error(`${e.label}: ${e.error}`, { duration: 8000 }));
      }
      const okParts = configured
        .filter(r => !r.error)
        .map(r => `${r.label}: ${r.imported > 0 ? `${r.imported} yeni` : "yeni yok"}`);
      if (okParts.length > 0) {
        toast.success(imported > 0 ? `Çekildi — ${okParts.join(", ")}` : okParts.join(", "));
      }
    },
    onError: e => toast.error(e.message),
  });

  // Fatura kes: kalemleri + şirket bilgisini + sıra numarasını al, yazdır.
  async function handleInvoice(order: OrderRow) {
    try {
      const [items, company] = await Promise.all([
        utils.client.orders.items.query({ orderId: order.id }),
        utils.client.settings.get.query(),
      ]);
      if (!company.companyName) {
        toast.info("Önce Ayarlar'dan şirket/fatura bilgilerini girin (fatura başlığı için).");
      }
      const seq = await utils.client.settings.nextInvoiceNo.mutate();
      const year = new Date().getFullYear();
      const invoiceNo = `${year}-${String(seq).padStart(5, "0")}`;
      printInvoice(
        {
          orderNo: order.orderNo,
          customerName: order.customerName,
          channel: order.channel ?? "web",
          createdAt: order.createdAt,
          notes: order.notes,
        },
        items.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
        company,
        invoiceNo,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fatura oluşturulamadı");
    }
  }

  const deleteOrder = trpc.orders.delete.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Sipariş silindi");
    },
    onError: e => toast.error(e.message),
  });

  function handleDragStart(event: DragStartEvent) {
    const order = orders?.find(o => o.id === event.active.id);
    if (order) setActiveOrder(order as OrderRow);
    document.body.classList.add("dragging-active");
  }

  function handleDragEnd(event: DragEndEvent) {
    document.body.classList.remove("dragging-active");
    setActiveOrder(null);
    const { active, over } = event;
    if (!over) return;
    const orderId = Number(active.id);
    const newStatus = String(over.id) as OrderStatus;
    const order = orders?.find(o => o.id === orderId);
    if (order && order.status !== newStatus) {
      setStatus.mutate({ id: orderId, status: newStatus });
    }
  }

  function openCreate() {
    setEditOrder(null);
    setManualSale(false);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openManualSale() {
    setEditOrder(null);
    setManualSale(true);
    setForm({ ...emptyForm, channel: "elden", customerName: "Elden Satış" });
    setDialogOpen(true);
  }

  async function openEdit(order: OrderRow) {
    setEditOrder(order);
    setForm({
      customerName: order.customerName,
      channel: order.channel ?? "web",
      totalAmount: order.totalAmount,
      itemsSummary: order.itemsSummary ?? "",
      notes: order.notes ?? "",
      items: [],
    });
    setDialogOpen(true);
    try {
      const items = await utils.orders.items.fetch({ orderId: order.id });
      setForm(f => ({
        ...f,
        items: items.map(i => ({
          productName: i.productName,
          quantity: String(parseFloat(i.quantity)),
          unitPrice: String(parseFloat(i.unitPrice)),
        })),
      }));
    } catch {
      // Kalemler yüklenemezse eski usül (özet metin) düzenleme yeterli.
    }
  }

  function submit() {
    if (!form.customerName.trim()) {
      toast.error("Müşteri adı gerekli");
      return;
    }
    const itemRows = parseItemRows(form.items);
    const payload = {
      customerName: form.customerName.trim(),
      channel: form.channel,
      totalAmount: parseFloat(form.totalAmount) || 0,
      itemsSummary: form.itemsSummary || null,
      notes: form.notes || null,
      // Kalem girildiyse toplam ve özet sunucuda satırlardan hesaplanır.
      ...(itemRows.length > 0 ? { items: itemRows } : {}),
      // Elden satışlar doğrudan "Tamamlandı" sütununa düşer.
      ...(manualSale && !editOrder ? { status: "done" as const } : {}),
    };
    if (editOrder) {
      updateOrder.mutate({ id: editOrder.id, data: payload });
    } else {
      createOrder.mutate(payload);
    }
  }

  const itemsTotal = parseItemRows(form.items).reduce(
    (sum, r) => sum + r.quantity * r.unitPrice,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sipariş Panosu</h1>
          <p className="text-sm text-muted-foreground">
            Siparişleri sürükleyip bırakarak aşamalar arasında taşıyın.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncAll.isPending ? "animate-spin" : ""}`} />
            Pazaryerlerinden Çek
          </Button>
          <Button variant="outline" onClick={openManualSale}>
            <Plus className="h-4 w-4 mr-1" /> Elden Satış
          </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Yeni Sipariş
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editOrder ? "Siparişi Düzenle" : manualSale ? "Elden Satış Ekle" : "Yeni Sipariş"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Müşteri Adı *</Label>
                <Input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Örn. Mehmet Yılmaz"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kanal</Label>
                  <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tutar (₺)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.items.length > 0 ? itemsTotal.toFixed(2) : form.totalAmount}
                    onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                    placeholder="0,00"
                    disabled={form.items.length > 0}
                  />
                  {form.items.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Kalemlerden otomatik hesaplanır.
                    </p>
                  )}
                </div>
              </div>

              {/* Kalem satırları */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Sipariş Kalemleri</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setForm(f => ({
                        ...f,
                        items: [...f.items, { productName: "", quantity: "1", unitPrice: "" }],
                      }))
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
                          list="order-product-options"
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
                                // Ürün listesinden seçilirse satış fiyatını otomatik doldur.
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
                          onClick={() =>
                            setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <datalist id="order-product-options">
                      {products?.map(p => (
                        <option key={p.id} value={p.name} />
                      ))}
                    </datalist>
                    <p className="text-sm font-medium text-right">
                      Toplam: {formatTL(itemsTotal)}
                    </p>
                  </div>
                )}
              </div>

              {form.items.length === 0 && (
                <div className="space-y-1.5">
                  <Label>Sipariş İçeriği</Label>
                  <Textarea
                    value={form.itemsSummary}
                    onChange={e => setForm(f => ({ ...f, itemsSummary: e.target.value }))}
                    placeholder="Örn. 2x Meteor M1128 Nemesis, 1x Gloss Sprey Vernik"
                    rows={2}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Özel istekler, kargo notu vb."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                İptal
              </Button>
              <Button onClick={submit} disabled={createOrder.isPending || updateOrder.isPending}>
                {editOrder ? "Kaydet" : "Ekle"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {mpStatus && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Pazaryeri bağlantıları:</span>
          {mpStatus.map(m => (
            <span
              key={m.key}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                m.configured
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400"
              }`}
              title={m.configured ? "Bağlı" : `Eksik: ${m.missing.join(", ")}`}
            >
              {m.configured ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {m.label} — {m.configured ? "bağlı" : "bağlı değil"}
            </span>
          ))}
          {mpStatus.some(m => !m.configured) && (
            <button
              onClick={() => setLocation("/ayarlar")}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Settings className="h-3.5 w-3.5" /> Bağlantı ayarları
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ORDER_STATUSES.map(s => (
            <div key={s.value} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {ORDER_STATUSES.map(status => (
              <KanbanColumn
                key={status.value}
                status={status}
                orders={(orders as OrderRow[])?.filter(o => o.status === status.value) ?? []}
                onEdit={openEdit}
                onDelete={id => deleteOrder.mutate({ id })}
                onInvoice={handleInvoice}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOrder ? <OrderCard order={activeOrder} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  orders,
  onEdit,
  onDelete,
  onInvoice,
}: {
  status: (typeof ORDER_STATUSES)[number];
  orders: OrderRow[];
  onEdit: (o: OrderRow) => void;
  onDelete: (id: number) => void;
  onInvoice: (o: OrderRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-card p-3 flex flex-col gap-2 min-h-[300px] transition-colors ${
        isOver ? "ring-2 ring-primary/60 bg-accent/40" : ""
      }`}
    >
      <div className="flex items-center gap-2 pb-1">
        <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
        <span className="font-semibold text-sm">{status.label}</span>
        <Badge variant="secondary" className="ml-auto">
          {orders.length}
        </Badge>
      </div>
      {orders.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg py-8">
          Sipariş yok
        </div>
      )}
      {orders.map(order => (
        <DraggableOrderCard key={order.id} order={order} onEdit={onEdit} onDelete={onDelete} onInvoice={onInvoice} />
      ))}
    </div>
  );
}

function DraggableOrderCard({
  order,
  onEdit,
  onDelete,
  onInvoice,
}: {
  order: OrderRow;
  onEdit: (o: OrderRow) => void;
  onDelete: (id: number) => void;
  onInvoice: (o: OrderRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <OrderCard
        order={order}
        onEdit={onEdit}
        onDelete={onDelete}
        onInvoice={onInvoice}
        dragHandle={{ attributes: attributes as unknown as React.HTMLAttributes<HTMLButtonElement>, listeners }}
      />
    </div>
  );
}

function OrderCard({
  order,
  onEdit,
  onDelete,
  onInvoice,
  overlay,
  dragHandle,
}: {
  order: OrderRow;
  onEdit?: (o: OrderRow) => void;
  onDelete?: (id: number) => void;
  onInvoice?: (o: OrderRow) => void;
  overlay?: boolean;
  dragHandle?: { attributes: React.HTMLAttributes<HTMLButtonElement>; listeners: Record<string, unknown> | undefined };
}) {
  return (
    <Card className={`p-3 space-y-1.5 ${overlay ? "shadow-xl rotate-2" : "shadow-sm"}`}>
      <div className="flex items-start gap-1.5">
        <button
          className="mt-0.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...(dragHandle?.attributes ?? {})}
          {...(dragHandle?.listeners ?? {})}
          aria-label="Taşı"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{order.customerName}</p>
          <p className="text-[11px] text-muted-foreground">{order.orderNo}</p>
        </div>
        <span className="font-semibold text-sm whitespace-nowrap">{formatTL(order.totalAmount)}</span>
      </div>
      {order.itemsSummary && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">{order.itemsSummary}</p>
      )}
      <div className="flex items-center justify-between pl-5">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {order.channel}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</span>
        </div>
        {!overlay && (
          <div className="flex gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Fatura kes / yazdır"
              onClick={() => onInvoice?.(order)}
            >
              <FileText className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit?.(order)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Bu siparişi silmek istediğinize emin misiniz?")) onDelete?.(order.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
