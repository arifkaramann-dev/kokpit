import { useConfirm } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ALL_ORDER_STATUSES, CANCELLED_STATUS, CHANNELS, formatDate, formatTL, ORDER_STATUSES, OrderStatus } from "@/lib/format";
import { printInvoice } from "@/lib/invoice";
import { printOrderContents } from "@/lib/orderContents";
import { printShippingLabel } from "@/lib/shippingLabel";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Truck,
  Trash2,
  Undo2,
  XCircle,
  Zap,
} from "lucide-react";
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
  customerPhone: string | null;
  customerAddress: string | null;
  paymentStatus: "unpaid" | "partial" | "paid";
  paidAmount: string;
  paymentMethod: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingLink: string | null;
  createdAt: Date;
};

type ItemRow = { productName: string; quantity: string; unitPrice: string };

/** Pazaryeri kanalları: durumları senkronla otomatik yönetilir, elle taşınmaz. */
const MARKETPLACE_CHANNELS = new Set(["trendyol", "hepsiburada", "pazaryeri"]);
function isAutoOrder(o: OrderRow): boolean {
  return MARKETPLACE_CHANNELS.has((o.channel ?? "").toLocaleLowerCase("tr-TR"));
}

function num(v: string): number {
  return parseFloat(v) || 0;
}

function waLink(order: OrderRow): string {
  return `https://wa.me/${(order.customerPhone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(
    `Merhaba ${order.customerName}, ${order.orderNo} numaralı siparişiniz hakkında bilgi vermek istedik.`,
  )}`;
}

/** Base64 PDF'i tarayıcıda blob olarak açar ve yazdırma penceresini tetikler. */
function openPdfBase64(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.document.title = filename;
    win.addEventListener("load", () => {
      try {
        win.print();
      } catch {
        /* kullanıcı elle yazdırabilir */
      }
    });
  }
  // Belleği bir süre sonra bırak (sekme açılmış olmalı).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const emptyForm = {
  customerName: "",
  channel: "web",
  totalAmount: "",
  itemsSummary: "",
  notes: "",
  customerPhone: "",
  customerAddress: "",
  paymentStatus: "unpaid" as "unpaid" | "partial" | "paid",
  paidAmount: "",
  paymentMethod: "",
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
  // Pano tam tabloyu çekmez: son N sipariş yeter, gerekirse "daha eski" ile büyür.
  const [orderLimit, setOrderLimit] = useState(400);
  const { data: orders, isLoading } = trpc.orders.list.useQuery({ limit: orderLimit });
  const { data: products } = trpc.products.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery();
  const { data: mpStatus } = trpc.orders.marketplaceStatus.useQuery();
  const { data: kargoCfg } = trpc.kargo.configured.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [manualSale, setManualSale] = useState(false);
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  // Tamamlanan siparişler varsayılan olarak katlı — güncel iş üstte kalsın.
  const [collapsed, setCollapsed] = useState<Set<OrderStatus>>(new Set<OrderStatus>(["done", "cancelled"]));
  // Çoklu seçim: toplu yazdırma/durum/ödeme için işaretlenen sipariş id'leri.
  const [selected, setSelected] = useState<Set<number>>(new Set<number>());
  // Detay & zaman çizgisi panelinde açık olan sipariş.
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null);
  const autoSynced = useRef(false);

  const toggleSelect = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set<number>());

  function toggleSection(status: OrderStatus) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

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
  // Yeni sipariş gelir + mevcutların durumu (kargolandı/teslim) otomatik güncellenir.
  useEffect(() => {
    const quietSync = () => {
      utils.client.orders.syncAll
        .mutate()
        .then(results => {
          const imported = results.reduce((s, r) => s + r.imported, 0);
          const updated = results.reduce((s, r) => s + (r.updated ?? 0), 0);
          if (imported + updated > 0) {
            utils.orders.list.invalidate();
            utils.dashboard.summary.invalidate();
            const parts: string[] = [];
            if (imported > 0) parts.push(`${imported} yeni sipariş`);
            if (updated > 0) parts.push(`${updated} durum güncellendi`);
            toast.success(`Pazaryeri: ${parts.join(", ")}`);
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
      const updated = results.reduce((s, r) => s + (r.updated ?? 0), 0);
      const errors = results.filter(r => r.error);
      // Test (SIT) modundaki pazaryeri senkrona girmez; sonuç mesajına da katılmaz.
      const configured = results.filter(r => !r.skippedReason);
      if (configured.length === 0) {
        toast.error("Hiçbir pazaryeri bağlı değil. Ayarlar'dan API bilgilerini girin.");
        return;
      }
      if (errors.length > 0) {
        errors.forEach(e => toast.error(`${e.label}: ${e.error}`, { duration: 8000 }));
      }
      const okParts = configured
        .filter(r => !r.error)
        .map(r => {
          const bits: string[] = [];
          if (r.imported > 0) bits.push(`${r.imported} yeni`);
          if ((r.updated ?? 0) > 0) bits.push(`${r.updated} güncel`);
          return `${r.label}: ${bits.length > 0 ? bits.join(" + ") : "değişiklik yok"}`;
        });
      if (okParts.length > 0) {
        toast.success(imported + updated > 0 ? `Senkron — ${okParts.join(", ")}` : okParts.join(", "));
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
          address: order.customerAddress,
          phone: order.customerPhone,
        },
        items.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
        company,
        invoiceNo,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fatura oluşturulamadı");
    }
  }

  // Kendi (uygulama) kargo etiketimizi yazdırır — pazaryeri etiketi yoksa/başarısızsa.
  async function printOwnLabel(order: OrderRow) {
    const [items, company] = await Promise.all([
      utils.client.orders.items.query({ orderId: order.id }),
      utils.client.settings.get.query(),
    ]);
    printShippingLabel(
      {
        orderNo: order.orderNo,
        customerName: order.customerName,
        channel: order.channel ?? "web",
        createdAt: order.createdAt,
        totalAmount: order.totalAmount,
        itemsSummary: order.itemsSummary,
        notes: order.notes,
        address: order.customerAddress,
        phone: order.customerPhone,
      },
      items.map(i => ({ productName: i.productName, quantity: i.quantity })),
      company,
    );
  }

  // Elden/manuel siparişte kargo etiketi basıldıysa akışı otomatik ilerlet:
  // etiket basmak "kargoya hazır" demektir. Pazaryeri siparişleri hariç (onları senkron yönetir).
  function maybeAdvanceOnLabel(order: OrderRow) {
    if (isAutoOrder(order)) return;
    const idx = ORDER_STATUSES.findIndex(s => s.value === order.status);
    const readyIdx = ORDER_STATUSES.findIndex(s => s.value === "ready");
    if (idx >= 0 && idx < readyIdx) {
      setStatus.mutate({ id: order.id, status: "ready" });
      toast.success("Sipariş “Kargoya Hazır”a taşındı");
    }
  }

  // Kargo etiketi: Trendyol siparişinde takip no varsa resmi etiketi (PDF) çeker;
  // yoksa/başarısızsa kendi barkodlu etiketimizi yazdırır.
  async function handleShippingLabel(order: OrderRow) {
    // Trendyol: takip no gerekir. Hepsiburada: paket no (orderNo) yeterli.
    const canOfficial =
      (order.channel === "trendyol" && !!order.cargoTrackingNumber) || order.channel === "hepsiburada";
    if (canOfficial) {
      const channelLabel = order.channel === "hepsiburada" ? "Hepsiburada" : "Trendyol";
      const t = toast.loading(`${channelLabel} resmi kargo etiketi alınıyor…`);
      try {
        const res = await utils.client.orders.shippingLabel.mutate({ orderId: order.id });
        if (res.pdfBase64) {
          openPdfBase64(res.pdfBase64, `kargo-${order.orderNo}.pdf`);
          toast.success("Resmi kargo etiketi hazır", { id: t });
          return;
        }
        // Ortak etiket bu hesapta yetkili değil — hata değil, bilinen durum:
        // sessizce kendi etiketimize düş, sebebini bir kez bilgi olarak göster.
        toast.info(res.message ?? "Ortak etiket kapalı — kendi etiketimiz açılıyor.", {
          id: t,
          duration: 8000,
        });
      } catch (e) {
        toast.error(
          `${e instanceof Error ? e.message : "Resmi etiket alınamadı"} — kendi etiketimiz açılıyor.`,
          { id: t },
        );
      }
    }
    try {
      await printOwnLabel(order);
      maybeAdvanceOnLabel(order);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kargo etiketi oluşturulamadı");
    }
  }

  // Geliver gönderisi: kendi mağaza/elden siparişine kargo kaydı açar, en ucuz
  // teklifi satın alır; takip no siparişe işlenir, etiket varsa yeni sekmede açılır.
  const createShipmentMut = trpc.kargo.createShipment.useMutation({
    onSuccess: r => {
      utils.orders.list.invalidate();
      if (r.created && r.trackingNumber) {
        toast.success(`Geliver gönderisi hazır — takip no: ${r.trackingNumber}`);
        if (r.labelUrl) window.open(r.labelUrl, "_blank");
      } else if (r.created) {
        toast.info(r.reason ?? "Gönderi oluştu — etiket Geliver panelinden alınabilir", { duration: 10000 });
      } else {
        toast.error(r.reason ?? "Gönderi oluşturulamadı", { duration: 10000 });
      }
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // Sipariş içeriği dökümü (kalem kalem): tek veya toplu; kalemler tek sorguda
  // çekilir, sipariş başına bir A4 "toplama fişi" olarak yazdırılır/PDF olur.
  async function handlePrintContents(list: OrderRow[]) {
    if (list.length === 0) {
      toast.info("Bu seçimde yazdırılacak sipariş yok");
      return;
    }
    const capped = list.slice(0, 300);
    if (list.length > 300) toast.info("En fazla 300 sipariş tek seferde yazdırılır — ilk 300 alındı");
    try {
      const items = await utils.client.orders.itemsBulk.query({ orderIds: capped.map(o => o.id) });
      printOrderContents(
        capped,
        items.map(i => ({
          orderId: i.orderId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İçerik dökümü hazırlanamadı");
    }
  }

  const dedupe = trpc.orders.dedupe.useMutation({
    onSuccess: r => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success(r.removed > 0 ? `${r.removed} mükerrer sipariş temizlendi` : "Mükerrer sipariş yok");
    },
    onError: e => toast.error(e.message),
  });

  const deleteOrder = trpc.orders.delete.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Sipariş silindi");
    },
    onError: e => toast.error(e.message),
  });

  const setPayment = trpc.orders.setPayment.useMutation({
    onSuccess: () => {
      utils.orders.list.invalidate();
      utils.dashboard.summary.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Kart üzerinden hızlı tahsilat: bekleyen → ödendi (tam tutar), ödendi → bekliyor.
  function handleTogglePaid(order: OrderRow) {
    const paid = order.paymentStatus === "paid";
    setPayment.mutate({
      id: order.id,
      paymentStatus: paid ? "unpaid" : "paid",
      paidAmount: paid ? 0 : parseFloat(order.totalAmount) || 0,
      paymentMethod: order.paymentMethod,
    });
  }

  // İptal/İade: mamul stok iadesi sunucuda otomatik yapılır; geri alınca tekrar düşülür.
  function handleSetCancelled(order: OrderRow, cancelled: boolean) {
    setStatus.mutate({ id: order.id, status: cancelled ? "cancelled" : "new" });
  }

  // Elden/manuel siparişi bir aşama ileri/geri taşı (dir: +1 ileri, -1 geri).
  function handleAdvance(order: OrderRow, dir: 1 | -1) {
    const idx = ORDER_STATUSES.findIndex(s => s.value === order.status);
    const target = ORDER_STATUSES[idx + dir];
    if (!target) return;
    setStatus.mutate({ id: order.id, status: target.value });
  }

  // Seçilenleri toplu bir sonraki aşamaya taşı (pazaryeri siparişleri otomatik yönetildiğinden atlanır).
  function bulkAdvance(list: OrderRow[]) {
    const manual = list.filter(o => !isAutoOrder(o) && o.status !== "done" && o.status !== "cancelled");
    if (manual.length === 0) {
      toast.info("İlerletilecek elle sipariş yok (pazaryeri siparişleri otomatik yönetilir)");
      return;
    }
    manual.forEach(o => handleAdvance(o, 1));
    toast.success(`${manual.length} sipariş bir sonraki aşamaya taşındı`);
    clearSelection();
  }

  // Seçilenleri toplu "ödendi" işaretle (zaten ödenmiş olanlar atlanır).
  function bulkMarkPaid(list: OrderRow[]) {
    const unpaid = list.filter(o => o.paymentStatus !== "paid");
    if (unpaid.length === 0) {
      toast.info("Seçilenlerin hepsi zaten ödenmiş");
      return;
    }
    unpaid.forEach(o =>
      setPayment.mutate({
        id: o.id,
        paymentStatus: "paid",
        paidAmount: parseFloat(o.totalAmount) || 0,
        paymentMethod: o.paymentMethod,
      }),
    );
    toast.success(`${unpaid.length} sipariş ödendi olarak işaretlendi`);
    clearSelection();
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
    // Elden satış genelde peşin → ödendi varsayılır.
    setForm({ ...emptyForm, channel: "elden", customerName: "Elden Satış", paymentStatus: "paid" });
    setDialogOpen(true);
  }

  // Müşteri adı yazıldıkça kayıtlı müşteriyle eşleşirse telefon/adresi otomatik doldur.
  function applyCustomerByName(name: string) {
    const match = ((customersList as { name: string; phone: string | null; address: string | null }[]) ?? []).find(
      c => c.name.trim().toLocaleLowerCase("tr-TR") === name.trim().toLocaleLowerCase("tr-TR"),
    );
    if (match) {
      setForm(f => ({
        ...f,
        customerPhone: match.phone ?? f.customerPhone,
        customerAddress: match.address ?? f.customerAddress,
      }));
    }
  }

  async function openEdit(order: OrderRow) {
    setEditOrder(order);
    setForm({
      customerName: order.customerName,
      channel: order.channel ?? "web",
      totalAmount: order.totalAmount,
      itemsSummary: order.itemsSummary ?? "",
      notes: order.notes ?? "",
      customerPhone: order.customerPhone ?? "",
      customerAddress: order.customerAddress ?? "",
      paymentStatus: order.paymentStatus ?? "unpaid",
      paidAmount: parseFloat(order.paidAmount) > 0 ? String(parseFloat(order.paidAmount)) : "",
      paymentMethod: order.paymentMethod ?? "",
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
    const total = itemRows.length > 0 ? itemsTotal : parseFloat(form.totalAmount) || 0;
    const payload = {
      customerName: form.customerName.trim(),
      channel: form.channel,
      totalAmount: parseFloat(form.totalAmount) || 0,
      itemsSummary: form.itemsSummary || null,
      notes: form.notes || null,
      customerPhone: form.customerPhone || null,
      customerAddress: form.customerAddress || null,
      paymentStatus: form.paymentStatus,
      // Ödendi → toplam; Kısmi → girilen tutar; Bekliyor → 0.
      paidAmount:
        form.paymentStatus === "paid"
          ? total
          : form.paymentStatus === "partial"
            ? parseFloat(form.paidAmount) || 0
            : 0,
      paymentMethod: form.paymentMethod || null,
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

  // Arama + ödeme/kanal filtresi uygulanmış sipariş listesi.
  const allOrders = (orders as OrderRow[]) ?? [];
  const channels = Array.from(new Set(allOrders.map(o => o.channel ?? "diğer")));
  const q = search.trim().toLocaleLowerCase("tr-TR");
  const filteredOrders = allOrders.filter(o => {
    if (payFilter === "unpaid" && o.paymentStatus === "paid") return false;
    if (payFilter === "paid" && o.paymentStatus !== "paid") return false;
    if (channelFilter !== "all" && (o.channel ?? "diğer") !== channelFilter) return false;
    if (q) {
      const hay = [o.customerName, o.orderNo, o.customerPhone, o.itemsSummary]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const filterActive = q !== "" || payFilter !== "all" || channelFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Siparişler</h1>
          <p className="text-sm text-muted-foreground">
            Pazaryeri siparişleri durumunu kendi akıtır; elden siparişleri tek dokunuşla ilerletin.
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Printer className="h-4 w-4 mr-1" /> İçerik Dökümü
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem
                onClick={() => handlePrintContents(filteredOrders.filter(o => o.status === "new"))}
              >
                <Printer className="mr-2 h-4 w-4" /> Yeni siparişler (
                {filteredOrders.filter(o => o.status === "new").length})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handlePrintContents(
                    filteredOrders.filter(o => ["new", "production", "ready"].includes(o.status)),
                  )
                }
              >
                <Printer className="mr-2 h-4 w-4" /> Aktif siparişler (
                {filteredOrders.filter(o => ["new", "production", "ready"].includes(o.status)).length})
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handlePrintContents(filteredOrders.filter(o => o.status !== "cancelled"))}
              >
                <Printer className="mr-2 h-4 w-4" /> Filtrelenen tümü (
                {filteredOrders.filter(o => o.status !== "cancelled").length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                  list="customer-names"
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  onBlur={e => applyCustomerByName(e.target.value)}
                  placeholder="Örn. Mehmet Yılmaz (kayıtlıysa seç)"
                />
                <datalist id="customer-names">
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
                    placeholder="05xx xxx xx xx"
                  />
                </div>
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
                          title={
                            row.productName.trim() && !products?.some(p => p.name === row.productName.trim())
                              ? "Katalogla eşleşmedi — serbest kalem olarak kaydedilir (stok düşümü ve ürün raporu dışında kalır)"
                              : undefined
                          }
                          className={
                            row.productName.trim() && !products?.some(p => p.name === row.productName.trim())
                              ? "border-amber-400 focus-visible:ring-amber-400"
                              : undefined
                          }
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
                <Label>Teslimat Adresi</Label>
                <Textarea
                  value={form.customerAddress}
                  onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))}
                  placeholder="Kargo etiketi ve faturaya yazılır"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ödeme Durumu</Label>
                  <Select
                    value={form.paymentStatus}
                    onValueChange={v => setForm(f => ({ ...f, paymentStatus: v as typeof f.paymentStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Bekliyor</SelectItem>
                      <SelectItem value="partial">Kısmi</SelectItem>
                      <SelectItem value="paid">Ödendi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ödeme Yöntemi</Label>
                  <Input
                    value={form.paymentMethod}
                    onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    placeholder="Nakit / Havale / Kart"
                  />
                </div>
              </div>
              {form.paymentStatus === "partial" && (
                <div className="space-y-1.5">
                  <Label>Ödenen Tutar (₺)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.paidAmount}
                    onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                    placeholder="Şimdiye kadar alınan tutar"
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
          <button
            onClick={() => dedupe.mutate()}
            disabled={dedupe.isPending}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-auto"
            title="Aynı sipariş numaralı mükerrer kayıtları sil"
          >
            <Trash2 className="h-3.5 w-3.5" /> Mükerrerleri temizle
          </button>
        </div>
      )}

      {!isLoading && allOrders.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Müşteri, sipariş no, telefon ara…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={payFilter} onValueChange={v => setPayFilter(v as typeof payFilter)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm ödemeler</SelectItem>
              <SelectItem value="unpaid">Ödenmemiş</SelectItem>
              <SelectItem value="paid">Ödenmiş</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kanallar</SelectItem>
              {channels.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterActive && (
            <>
              <span className="text-xs text-muted-foreground">{filteredOrders.length} sonuç</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearch("");
                  setPayFilter("all");
                  setChannelFilter("all");
                }}
              >
                Temizle
              </Button>
            </>
          )}
        </div>
      )}

      {/* Toplu aksiyon çubuğu: bir veya daha fazla sipariş seçilince yapışkan görünür. */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2.5 shadow-lg backdrop-blur">
          <span className="text-sm font-semibold px-1">{selected.size} seçili</span>
          {(() => {
            const chosen = allOrders.filter(o => selected.has(o.id));
            return (
              <>
                <Button size="sm" variant="outline" onClick={() => handlePrintContents(chosen)}>
                  <Printer className="h-4 w-4 mr-1" /> İçerik dökümü yazdır
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkAdvance(chosen)}>
                  <ArrowRight className="h-4 w-4 mr-1" /> Sonraki aşamaya taşı
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkMarkPaid(chosen)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Ödendi işaretle
                </Button>
              </>
            );
          })()}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            <XCircle className="h-4 w-4 mr-1" /> Seçimi temizle
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {ORDER_STATUSES.map(s => (
            <div key={s.value} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : allOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Henüz sipariş yok. Pazaryerlerinden çekin ya da elle ekleyin.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncAll.isPending ? "animate-spin" : ""}`} />
              Pazaryerlerinden Çek
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Yeni Sipariş
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {ALL_ORDER_STATUSES.map(status => {
            const list = filteredOrders.filter(o => o.status === status.value);
            if (filterActive && list.length === 0) return null;
            if (status.value === CANCELLED_STATUS.value && list.length === 0) return null;
            const isCollapsed = collapsed.has(status.value);
            const total = list.reduce((s, o) => s + num(o.totalAmount), 0);
            const due = list
              .filter(o => o.paymentStatus !== "paid")
              .reduce((s, o) => s + Math.max(0, num(o.totalAmount) - num(o.paidAmount)), 0);
            return (
              <div key={status.value} className="rounded-xl border bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection(status.value)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={`h-2.5 w-2.5 rounded-full ${status.color} shrink-0`} />
                  <span className="font-semibold text-sm">{status.label}</span>
                  <Badge variant="secondary">{list.length}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                    {formatTL(total)}
                    {due > 0 && (
                      <span className="text-destructive font-medium ml-2">{formatTL(due)} bekliyor</span>
                    )}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y border-t">
                    {list.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        Bu aşamada sipariş yok
                      </div>
                    ) : (
                      list.map(order => (
                        <OrderRowItem
                          key={order.id}
                          selected={selected.has(order.id)}
                          onToggleSelect={toggleSelect}
                          onDetail={setDetailOrder}
                          order={order}
                          onEdit={openEdit}
                          onDelete={id => deleteOrder.mutate({ id })}
                          onInvoice={handleInvoice}
                          onShippingLabel={handleShippingLabel}
                          onPrintContents={o => handlePrintContents([o])}
                          kargoEnabled={Boolean(kargoCfg?.kargo)}
                          onCreateShipment={o => createShipmentMut.mutate({ orderId: o.id })}
                          onTogglePaid={handleTogglePaid}
                          onAdvance={handleAdvance}
                          onSetCancelled={handleSetCancelled}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {(orders?.length ?? 0) >= orderLimit && (
            <div className="pt-1 text-center">
              <Button variant="outline" size="sm" onClick={() => setOrderLimit(l => Math.min(l + 400, 5000))}>
                Daha eski siparişleri yükle (son {orderLimit} gösteriliyor)
              </Button>
            </div>
          )}
        </div>
      )}

      <OrderDetailDialog order={detailOrder} onClose={() => setDetailOrder(null)} />
    </div>
  );
}

/** Sipariş detay + zaman çizgisi paneli: kalemler, iletişim, kargo, olay defteri, not. */
function OrderDetailDialog({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const events = trpc.orders.events.useQuery(
    { orderId: order?.id ?? 0 },
    { enabled: !!order },
  );
  const itemsQ = trpc.orders.itemsBulk.useQuery(
    { orderIds: order ? [order.id] : [] },
    { enabled: !!order },
  );
  const addNote = trpc.orders.addNote.useMutation({
    onSuccess: () => {
      setNote("");
      utils.orders.events.invalidate();
      toast.success("Not eklendi");
    },
    onError: e => toast.error(e.message),
  });

  const EVENT_ICON: Record<string, { icon: typeof History; cls: string }> = {
    created: { icon: Plus, cls: "text-blue-600 bg-blue-500/10" },
    synced: { icon: RefreshCw, cls: "text-violet-600 bg-violet-500/10" },
    status: { icon: ArrowRight, cls: "text-amber-600 bg-amber-500/10" },
    payment: { icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10" },
    cargo: { icon: Truck, cls: "text-sky-600 bg-sky-500/10" },
    note: { icon: MessageCircle, cls: "text-muted-foreground bg-muted" },
  };

  return (
    <Dialog open={!!order} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {order.customerName}
                <Badge variant="outline" className="text-[10px]">{order.channel}</Badge>
                <span className="text-xs font-normal text-muted-foreground">{order.orderNo}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Sol: özet + kalemler */}
              <div className="space-y-3">
                <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tutar</span>
                    <span className="font-semibold">{formatTL(order.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ödeme</span>
                    <span className={order.paymentStatus === "paid" ? "text-emerald-600" : "text-amber-600"}>
                      {order.paymentStatus === "paid" ? "Ödendi" : order.paymentStatus === "partial" ? "Kısmi" : "Bekliyor"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tarih</span>
                    <span>{formatDate(order.createdAt)}</span>
                  </div>
                  {order.customerPhone && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">Telefon</span>
                      <a href={waLink(order)} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" /> {order.customerPhone}
                      </a>
                    </div>
                  )}
                  {order.customerAddress && (
                    <div className="pt-1 text-xs text-muted-foreground flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {order.customerAddress}
                    </div>
                  )}
                  {order.cargoTrackingNumber && (
                    <div className="flex justify-between items-center gap-2 pt-1">
                      <span className="text-muted-foreground">Kargo</span>
                      {order.cargoTrackingLink ? (
                        <a href={order.cargoTrackingLink} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" /> {order.cargoTrackingNumber}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> {order.cargoTrackingNumber}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">Kalemler</div>
                  {itemsQ.isLoading ? (
                    <div className="p-3 text-xs text-muted-foreground">Yükleniyor…</div>
                  ) : (itemsQ.data ?? []).length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">{order.itemsSummary || "Kalem kaydı yok"}</div>
                  ) : (
                    <div className="divide-y">
                      {(itemsQ.data ?? []).map((it, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                          <span className="flex-1 truncate">{it.productName}</span>
                          <span className="text-muted-foreground text-xs">{it.quantity}×</span>
                          <span className="font-medium whitespace-nowrap">{formatTL(parseFloat(String(it.unitPrice)) * parseFloat(String(it.quantity)))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sağ: zaman çizgisi + not */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4 text-primary" /> Zaman Çizgisi
                </div>
                <div className="flex gap-2">
                  <Input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Not ekle (ör. müşteri aradı)…"
                    onKeyDown={e => {
                      if (e.key === "Enter" && note.trim()) addNote.mutate({ orderId: order.id, note: note.trim() });
                    }}
                  />
                  <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate({ orderId: order.id, note: note.trim() })}>
                    Ekle
                  </Button>
                </div>
                <div className="relative space-y-3 pl-1 pt-1">
                  {events.isLoading ? (
                    <p className="text-xs text-muted-foreground">Yükleniyor…</p>
                  ) : (events.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Henüz olay yok.</p>
                  ) : (
                    (events.data ?? []).map(ev => {
                      const cfg = EVENT_ICON[ev.type] ?? EVENT_ICON.note;
                      const Icon = cfg.icon;
                      return (
                        <div key={ev.id} className="flex gap-2.5">
                          <div className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center ${cfg.cls}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 pb-1">
                            <p className="text-sm leading-tight">{ev.message}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(ev.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OrderRowItem({
  order,
  selected,
  onToggleSelect,
  onDetail,
  onEdit,
  onDelete,
  onInvoice,
  onShippingLabel,
  onPrintContents,
  kargoEnabled,
  onCreateShipment,
  onTogglePaid,
  onAdvance,
  onSetCancelled,
}: {
  order: OrderRow;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onDetail: (o: OrderRow) => void;
  onEdit: (o: OrderRow) => void;
  onDelete: (id: number) => void;
  onInvoice: (o: OrderRow) => void;
  onShippingLabel: (o: OrderRow) => void;
  onPrintContents: (o: OrderRow) => void;
  kargoEnabled: boolean;
  onCreateShipment: (o: OrderRow) => void;
  onTogglePaid: (o: OrderRow) => void;
  onAdvance: (o: OrderRow, dir: 1 | -1) => void;
  onSetCancelled: (o: OrderRow, cancelled: boolean) => void;
}) {
  const confirm = useConfirm();
  const paid = order.paymentStatus === "paid";
  const auto = isAutoOrder(order);
  const idx = ORDER_STATUSES.findIndex(s => s.value === order.status);
  const next = ORDER_STATUSES[idx + 1];
  const prev = ORDER_STATUSES[idx - 1];

  return (
    <div className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center ${selected ? "bg-primary/5" : ""}`}>
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggleSelect(order.id)}
        aria-label="Siparişi seç"
        className="mt-1 self-start sm:mt-0 sm:self-auto shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="font-medium text-sm truncate hover:text-primary hover:underline text-left"
            onClick={() => onDetail(order)}
            title="Detay & zaman çizgisi"
          >
            {order.customerName}
          </button>
          {order.customerAddress && <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <button
            onClick={() => onTogglePaid(order)}
            title={paid ? "Ödendi (bekliyor yap)" : "Ödendi olarak işaretle"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              paid
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : order.paymentStatus === "partial"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20"
            }`}
          >
            {paid ? "Ödendi" : order.paymentStatus === "partial" ? "Kısmi" : "Bekliyor"}
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
          <span>{order.orderNo}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {order.channel}
          </Badge>
          <span>{formatDate(order.createdAt)}</span>
        </div>
        {order.itemsSummary && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{order.itemsSummary}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        <span className="font-semibold text-sm whitespace-nowrap">{formatTL(order.totalAmount)}</span>

        {order.status !== "done" &&
          (auto ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground"
              title="Pazaryeri siparişi — durumu her senkronda otomatik güncellenir"
            >
              <Zap className="h-3.5 w-3.5" /> Otomatik
            </span>
          ) : next ? (
            <Button size="sm" className="h-9" onClick={() => onAdvance(order, 1)}>
              {next.label} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : null)}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="İşlemler">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onDetail(order)}>
              <History className="mr-2 h-4 w-4" /> Detay &amp; zaman çizgisi
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {order.customerPhone && (
              <DropdownMenuItem asChild>
                <a href={waLink(order)} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" /> WhatsApp'tan yaz
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onShippingLabel(order)}>
              <Truck className="mr-2 h-4 w-4" /> Kargo etiketi
            </DropdownMenuItem>
            {kargoEnabled && !auto && (
              <DropdownMenuItem
                onSelect={async () => {
                  if (
                    await confirm({
                      title: "Geliver gönderisi oluştur",
                      description: `${order.orderNo} için Geliver'de kargo kaydı açılıp en uygun teklif satın alınsın mı? (Test modu açıksa ücret yansımaz.)`,
                      confirmText: "Gönderi Oluştur",
                    })
                  )
                    onCreateShipment(order);
                }}
              >
                <Truck className="mr-2 h-4 w-4 text-sky-600" /> Geliver gönderisi
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onPrintContents(order)}>
              <Printer className="mr-2 h-4 w-4" /> İçerik dökümü
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInvoice(order)}>
              <FileText className="mr-2 h-4 w-4" /> Fatura kes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(order)}>
              <Pencil className="mr-2 h-4 w-4" /> Düzenle
            </DropdownMenuItem>
            {!auto && prev && (
              <DropdownMenuItem onClick={() => onAdvance(order, -1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Geri: {prev.label}
              </DropdownMenuItem>
            )}
            {order.status !== "cancelled" ? (
              <DropdownMenuItem
                onSelect={async () => {
                  if (
                    await confirm({
                      title: "İptal / İade",
                      description: `${order.orderNo} iptal/iade olarak işaretlensin mi? Ciro ve cariden düşülür, ürün stoğu iade edilir.`,
                      confirmText: "İptal / İade",
                    })
                  )
                    onSetCancelled(order, true);
                }}
              >
                <XCircle className="mr-2 h-4 w-4 text-rose-600" /> İptal / İade et
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onSetCancelled(order, false)}>
                <Undo2 className="mr-2 h-4 w-4" /> İptali geri al (Yeni'ye taşı)
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async () => {
                if (
                  await confirm({
                    title: "Siparişi sil",
                    description: `${order.orderNo} — ${order.customerName} siparişi silinsin mi? Bu işlem geri alınamaz.`,
                    confirmText: "Sil",
                    destructive: true,
                  })
                )
                  onDelete(order.id);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
