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
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDate, formatQty, formatTL } from "@/lib/format";
import { jsonListHasItems, productHealth, type ProductHealth } from "@shared/productHealth";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { Beaker, Boxes, ChevronDown, ChevronRight, CopyCheck, Download, Eraser, Layers, Package, Pencil, Percent, Plus, Printer, Search, Sparkles, Store, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import TemplatePicker from "@/components/TemplatePicker";
import { toast } from "sonner";
import { useLocation } from "wouter";

export type ProductRow = {
  id: number;
  parentId: number | null;
  name: string;
  series: string | null;
  colorCode: string | null;
  colorHex: string | null;
  surfaceType: string | null;
  additives: string | null;
  description: string | null;
  salePrice: string;
  discountPercent: string;
  packagingCost: string;
  shippingCost: string;
  packaging: string | null;
  barcode: string | null;
  stockQty: number;
  criticalQty: number;
  labelSize: string | null;
  labelText: string | null;
  usageGuide: string | null;
  safetyNotes: string | null;
  extraInfo: string | null;
  sku: string | null;
  category: string | null;
  profitMargin: string | null;
  vatRate: string | null;
  desi: string | null;
  paintType: string | null;
  features: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  applicationText: string | null;
  imageUrls: string | null;
  videoUrl: string | null;
  mockupUrl: string | null;
  labelWarnings: string | null;
  isActive: number;
  status: "taslak" | "satista" | "arsiv";
};

const emptyForm = {
  name: "",
  series: "",
  colorCode: "",
  colorHex: "#1a1a1a",
  surfaceType: "",
  additives: "",
  description: "",
  salePrice: "",
  discountPercent: "",
  packagingCost: "",
  shippingCost: "",
  packaging: "",
  barcode: "",
  stockQty: "",
  criticalQty: "",
  labelSize: "",
  labelText: "",
  usageGuide: "",
  safetyNotes: "",
  extraInfo: "",
  sku: "",
  category: "",
  profitMargin: "",
  vatRate: "",
  desi: "",
  paintType: "",
  featuresText: "",
  shortDescription: "",
  longDescription: "",
  applicationText: "",
  imageUrlsText: "",
  videoUrl: "",
  mockupUrl: "",
  labelWarnings: "",
  status: "satista" as "taslak" | "satista" | "arsiv",
};

/** DB'de JSON dizi olarak duran alanı (features/imageUrls) form metnine çevirir. */
function jsonListToText(value: string | null): string {
  if (!value) return "";
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr.join(", ") : String(value);
  } catch {
    return String(value);
  }
}

/** Virgül/yeni satır ayrılmış form metnini JSON dizi string'ine çevirir. */
function textToJsonList(text: string): string | null {
  const items = text
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
  return items.length ? JSON.stringify(items) : null;
}

/** "Türevlere Uygula" diyaloğundaki alan grupları (sunucudaki enum ile birebir). */
const PROPAGATE_GROUPS = [
  { key: "aciklamalar", label: "Açıklamalar", desc: "Açıklama, kısa/uzun açıklama, uygulama metni" },
  { key: "etiket", label: "Etiket & Kılavuz", desc: "Etiket yazısı, kullanım kılavuzu, güvenlik, uyarılar, etiket boyutu, ek bilgiler" },
  { key: "pazaryeri", label: "Pazaryeri Künyesi", desc: "Kategori, ürün türü, özellikler" },
  { key: "medya", label: "Medya Linkleri", desc: "Görsel linkleri, video ve mockup linki" },
  { key: "maliyet", label: "Maliyet Parametreleri", desc: "Kâr oranı, KDV, desi, indirim, kargo maliyeti" },
] as const;
type PropagateGroupKey = (typeof PROPAGATE_GROUPS)[number]["key"];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  taslak: { label: "Taslak", cls: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  arsiv: { label: "Arşiv", cls: "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300" },
};

/** Sağlık skoru rozeti (Faz A5): kartın pazaryerine hazırlık yüzdesi. */
function HealthBadge({ health }: { health: ProductHealth }) {
  const cls =
    health.score >= 90
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
      : health.score >= 60
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
      title={
        health.missing.length
          ? `Eksik alanlar: ${health.missing.join(", ")}${health.missingRequired.length ? ` · Pazaryeri için zorunlu eksik: ${health.missingRequired.join(", ")}` : ""}`
          : "Ürün kartı tam — pazaryerine hazır"
      }
    >
      %{health.score}
    </span>
  );
}

/** Alan HTML etiketi veya entity içeriyor mu? (pazaryerinden yapıştırılan metinler) */
function looksLikeHtml(value: string): boolean {
  return /<[a-z][^>]*>|&[a-z]+\d*;|&#\d+;/i.test(value);
}

/** Pazaryerinden gelen inline-stilli HTML'i satır yapısını koruyarak düz metne çevirir. */
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent ?? "")
    .replace(/ /g, " ")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Alan HTML içeriyorsa görünen, tek tıkla düz metne çeviren küçük buton. */
function HtmlCleanButton({ value, onClean }: { value: string; onClean: (clean: string) => void }) {
  if (!looksLikeHtml(value)) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-[11px] text-muted-foreground"
      title="HTML etiketlerini ve stillerini temizleyip okunur düz metne çevirir"
      onClick={() => {
        onClean(htmlToPlainText(value));
        toast.success("HTML temizlendi, düz metne çevrildi");
      }}
    >
      <Eraser className="h-3 w-3 mr-1" /> HTML'i Temizle
    </Button>
  );
}

export default function Products() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: products, isLoading } = trpc.products.list.useQuery();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [parentForNew, setParentForNew] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deriveFor, setDeriveFor] = useState<ProductRow | null>(null);
  const [deriveTypes, setDeriveTypes] = useState<Set<string>>(new Set());
  const [customType, setCustomType] = useState("");
  const [derivePacks, setDerivePacks] = useState<Set<string>>(new Set());
  const [deriveColors, setDeriveColors] = useState<Set<string>>(new Set());
  const [customPack, setCustomPack] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [deriveSets, setDeriveSets] = useState<Set<string>>(new Set());
  const [customSet, setCustomSet] = useState("");
  const [propagateFor, setPropagateFor] = useState<ProductRow | null>(null);
  const [propagateGroups, setPropagateGroups] = useState<Set<PropagateGroupKey>>(
    new Set<PropagateGroupKey>(["aciklamalar", "etiket"]),
  );
  const { data: templateList } = trpc.templates.list.useQuery();
  const { data: seriesRecords } = trpc.series.list.useQuery();
  const { data: imageRefs } = trpc.products.allImageRefs.useQuery();
  const packOptions = (templateList ?? []).filter(t => t.kind === "ambalaj").map(t => t.name);
  const colorOptions = (templateList ?? []).filter(t => t.kind === "renk").map(t => t.name);
  const setOptions = (templateList ?? []).filter(t => t.kind === "set_paket").map(t => t.name);
  const { data: productImages } = trpc.products.images.useQuery(
    { productId: editing?.id ?? 0 },
    { enabled: !!editing },
  );
  const setImage = trpc.products.setImage.useMutation({
    onSuccess: () => {
      utils.products.images.invalidate();
      toast.success("Görsel kaydedildi");
    },
    onError: e => toast.error(e.message),
  });
  const deleteImage = trpc.products.deleteImage.useMutation({
    onSuccess: () => utils.products.images.invalidate(),
  });

  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "satista" | "taslak" | "arsiv">("all");
  const { data: imageIdList } = trpc.products.idsWithImages.useQuery();
  const { data: identityDupes } = trpc.products.duplicateIdentity.useQuery();
  const imageIds = useMemo(() => new Set(imageIdList ?? []), [imageIdList]);
  const healthOf = (p: ProductRow) =>
    productHealth({ ...p, hasImage: imageIds.has(p.id) || jsonListHasItems(p.imageUrls) });

  // Düşük stok: sıfır/eksi her zaman; kritik eşik tanımlıysa eşiğin altı da.
  const isLowStock = (p: ProductRow) =>
    p.stockQty <= 0 || (p.criticalQty > 0 && p.stockQty <= p.criticalQty);
  const stockCls = (p: ProductRow) =>
    p.stockQty <= 0
      ? "text-rose-600 font-medium"
      : p.criticalQty > 0 && p.stockQty <= p.criticalQty
        ? "text-amber-600 font-medium"
        : "";

  const childrenOf = useMemo(() => {
    const map = new Map<number, ProductRow[]>();
    for (const p of (products as ProductRow[]) ?? []) {
      if (p.parentId !== null) {
        const arr = map.get(p.parentId) ?? [];
        arr.push(p);
        map.set(p.parentId, arr);
      }
    }
    return map;
  }, [products]);

  // Arama: ana ürünün kendisi ya da türevlerinden biri eşleşirse göster.
  const mains = useMemo(() => {
    let all = ((products as ProductRow[]) ?? []).filter(p => p.parentId === null);
    if (statusFilter !== "all") {
      all = all.filter(
        p => p.status === statusFilter || (childrenOf.get(p.id) ?? []).some(v => v.status === statusFilter),
      );
    }
    if (lowStockOnly) {
      all = all.filter(p => isLowStock(p) || (childrenOf.get(p.id) ?? []).some(isLowStock));
    }
    const q = search.trim().toLowerCase();
    if (!q) return all;
    // Ad, seri, barkod ve renk kodu üzerinden eşleşir (ana ürün veya türevlerinden biri).
    const matches = (p: ProductRow) =>
      p.name.toLowerCase().includes(q) ||
      (p.series ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q) ||
      (p.colorCode ?? "").toLowerCase().includes(q);
    return all.filter(p => matches(p) || (childrenOf.get(p.id) ?? []).some(matches));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, childrenOf, lowStockOnly, statusFilter]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState("10");
  const [bulkSeries, setBulkSeries] = useState<string>("__all__");
  const seriesList = useMemo(
    () =>
      Array.from(
        new Set(((products as ProductRow[]) ?? []).map(p => p.series).filter((s): s is string => Boolean(s))),
      ),
    [products],
  );
  const bulkPrice = trpc.products.bulkPrice.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      setBulkOpen(false);
      toast.success(`${r.affected} ürünün fiyatı güncellendi`);
    },
    onError: e => toast.error(e.message),
  });

  const pushTrendyol = trpc.products.pushToTrendyol.useMutation({
    onSuccess: r =>
      toast.success(
        `Trendyol'a ${r.sent} ürünün stok/fiyatı gönderildi${r.batchRequestId ? ` (parti: ${r.batchRequestId})` : ""}`,
        { duration: 8000 },
      ),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const pushHepsiburada = trpc.products.pushToHepsiburada.useMutation({
    onSuccess: r =>
      toast.success(`Hepsiburada'ya ${r.sent} ürünün stok/fiyatı gönderildi`, { duration: 8000 }),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // Mamul stok hareketi: giriş/çıkış + hareket geçmişi dialogu.
  const [stockFor, setStockFor] = useState<ProductRow | null>(null);
  const [stockType, setStockType] = useState<"in" | "out">("in");
  const [stockQtyText, setStockQtyText] = useState("");
  const [stockNote, setStockNote] = useState("");
  const { data: productMovementList } = trpc.products.movements.useQuery(
    { productId: stockFor?.id ?? 0 },
    { enabled: !!stockFor },
  );
  const adjustProductStock = trpc.products.adjustStock.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Mamul stok güncellendi");
      setStockQtyText("");
      setStockNote("");
    },
    onError: e => toast.error(e.message),
  });

  function openStockDialog(p: ProductRow) {
    setStockFor(p);
    setStockType("in");
    setStockQtyText("");
    setStockNote("");
  }

  // Satışa hazır katalog dosyası: Excel/pazaryeri şablonlarına yapıştırılabilir.
  function exportCsv() {
    const rows = (products as ProductRow[]) ?? [];
    if (rows.length === 0) return toast.error("Dışa aktarılacak ürün yok");
    // Görselleri herkese açık link olarak ekle (web sitesi/pazaryeri kullanabilsin).
    const origin = window.location.origin;
    const imgSet = new Set((imageRefs ?? []).map(r => `${r.productId}:${r.kind}`));
    const imgUrl = (id: number, kind: "main" | "packaging" | "usage") =>
      imgSet.has(`${id}:${kind}`) ? `${origin}/api/img/${id}/${kind}` : "";
    const cols = [
      "Ürün Adı", "Tür", "Barkod", "Seri", "Renk Kodu", "Kullanım/Yüzey", "Ambalaj",
      "Stok", "Satış Fiyatı", "İndirim %", "Açıklama", "Etiket Boyutu", "Etiket Yazısı",
      "Kullanım Kılavuzu", "Güvenlik", "Ek Bilgi",
      "Ana Görsel", "Ambalaj Görseli", "Kullanım Görseli", "Tüm Görseller",
    ];
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map(p => {
      const main = imgUrl(p.id, "main");
      const pack = imgUrl(p.id, "packaging");
      const usage = imgUrl(p.id, "usage");
      const all = [main, pack, usage].filter(Boolean).join(" | ");
      return [
        p.name, p.parentId === null ? "Ana Ürün" : "Türev", p.barcode, p.series, p.colorCode,
        p.surfaceType, p.packaging, p.stockQty, p.salePrice, p.discountPercent, p.description,
        p.labelSize, p.labelText, p.usageGuide, p.safetyNotes, p.extraInfo,
        main, pack, usage, all,
      ].map(esc).join(";");
    });
    // BOM: Türkçe karakterler Excel'de doğru açılsın.
    const blob = new Blob(["﻿" + [cols.join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `artofcolour-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${rows.length} ürün dışa aktarıldı`);
  }

  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success(parentForNew ? "Türev ürün eklendi" : "Ana ürün eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Ürün güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const deriveMany = trpc.products.deriveMany.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      toast.success(`${r.count} türev oluşturuldu`);
      setDeriveFor(null);
      setDeriveTypes(new Set());
    },
    onError: e => toast.error(e.message),
  });

  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Ürün silindi");
    },
    onError: e => toast.error(e.message),
  });

  const propagateToVariants = trpc.products.propagateToVariants.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      toast.success(`${r.count} türev ana üründen güncellendi`);
      setPropagateFor(null);
    },
    onError: e => toast.error(e.message),
  });

  // Otomatik doldurma: reçete maliyeti + seri kâr oranı → fiyat; seri
  // şablonlarından açıklamalar; SKU/barkod önerisi. Ayrıca türev ekleniyorsa
  // ana üründen, değilse aynı serideki en dolu ürün kartından etiket, kılavuz,
  // güvenlik, desi, maliyet gibi alanlar kopyalanır. Boş alanları doldurur,
  // elle girilen değerlerin üzerine yazmaz.
  const [autofilling, setAutofilling] = useState(false);
  async function runAutofill() {
    if (!form.name.trim()) return toast.error("Önce ürün adını gir");
    setAutofilling(true);
    try {
      const r = await utils.client.products.autofill.query({
        name: form.name.trim(),
        series: form.series || null,
        packaging: form.packaging || null,
        recipeProductId: editing?.id ?? parentForNew?.id ?? null,
        parentProductId: parentForNew?.id ?? null,
        excludeProductId: editing?.id ?? null,
      });
      const ref = r.reference;
      setForm(f => ({
        ...f,
        sku: f.sku || r.sku,
        barcode: f.barcode || r.barcode,
        category: f.category || (r.category ?? ""),
        profitMargin: f.profitMargin || String(r.profitMargin),
        vatRate: f.vatRate || String(r.vatRate),
        salePrice: parseFloat(f.salePrice) > 0 ? f.salePrice : r.salePrice > 0 ? String(r.salePrice) : f.salePrice,
        shortDescription: f.shortDescription || (r.shortDescription ?? ""),
        longDescription: f.longDescription || (r.longDescription ?? ""),
        applicationText: f.applicationText || (r.applicationText ?? ""),
        packaging: f.packaging || (ref?.packaging ?? ""),
        labelSize: f.labelSize || (ref?.labelSize ?? ""),
        labelText: f.labelText || (ref?.labelText ?? ""),
        usageGuide: f.usageGuide || (ref?.usageGuide ?? ""),
        safetyNotes: f.safetyNotes || (ref?.safetyNotes ?? ""),
        extraInfo: f.extraInfo || (ref?.extraInfo ?? ""),
        labelWarnings: f.labelWarnings || (ref?.labelWarnings ?? ""),
        paintType: f.paintType || (ref?.paintType ?? ""),
        featuresText: f.featuresText || (ref?.features.length ? ref.features.join(", ") : ""),
        desi: f.desi || (ref?.desi != null ? String(ref.desi) : ""),
        criticalQty: f.criticalQty || (ref?.criticalQty != null ? String(ref.criticalQty) : ""),
        packagingCost:
          parseFloat(f.packagingCost) > 0
            ? f.packagingCost
            : ref?.packagingCost != null
              ? String(ref.packagingCost)
              : f.packagingCost,
        shippingCost:
          parseFloat(f.shippingCost) > 0
            ? f.shippingCost
            : ref?.shippingCost != null
              ? String(ref.shippingCost)
              : f.shippingCost,
      }));
      const refNote = ref ? ` "${ref.name}" kartı referans alındı.` : "";
      if (r.hasRecipe) {
        toast.success(
          `Maliyet ₺${r.cost.toFixed(2)} → önerilen satış ₺${r.salePrice.toFixed(2)} (KDV dahil ₺${r.priceWithVat.toFixed(2)}).${refNote}`,
          { duration: 8000 },
        );
      } else if (r.seriesFound || ref) {
        toast.success(
          `Seri bilgileri dolduruldu.${refNote} Fiyat önerisi için ürüne reçete ekleyin.`,
          { duration: 6000 },
        );
      } else {
        toast.success("SKU/barkod önerildi. Seri kaydı bulunamadı — Şablonlar > Seriler'den ekleyebilirsiniz.", { duration: 6000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Otomatik doldurma başarısız");
    } finally {
      setAutofilling(false);
    }
  }

  // AI içerik üretimi: açıklamalar, etiket yazısı/uyarıları ve özellikler.
  // Kullanıcı bilerek tıkladığı için mevcut metinlerin üzerine yazar.
  const aiFill = trpc.products.aiFill.useMutation({
    onSuccess: r => {
      setForm(f => ({
        ...f,
        shortDescription: r.shortDescription ?? f.shortDescription,
        longDescription: r.longDescription ?? f.longDescription,
        applicationText: r.applicationText ?? f.applicationText,
        labelText: r.labelText ?? f.labelText,
        labelWarnings: r.labelWarnings ?? f.labelWarnings,
        featuresText: r.features.length ? r.features.join(", ") : f.featuresText,
      }));
      toast.success("AI içerikleri yazdı — kontrol edip kaydedin", { duration: 6000 });
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateMain() {
    setEditing(null);
    setParentForNew(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openCreateVariant(parent: ProductRow) {
    setEditing(null);
    setParentForNew(parent);
    setForm({
      ...emptyForm,
      series: parent.series ?? "",
      colorCode: parent.colorCode ?? "",
      colorHex: parent.colorHex ?? "#1a1a1a",
      salePrice: parent.salePrice,
    });
    setDialogOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setParentForNew(null);
    setForm({
      name: p.name,
      series: p.series ?? "",
      colorCode: p.colorCode ?? "",
      colorHex: p.colorHex ?? "#1a1a1a",
      surfaceType: p.surfaceType ?? "",
      additives: p.additives ?? "",
      description: p.description ?? "",
      salePrice: p.salePrice,
      discountPercent: p.discountPercent,
      packagingCost: p.packagingCost,
      shippingCost: p.shippingCost,
      packaging: p.packaging ?? "",
      barcode: p.barcode ?? "",
      stockQty: p.stockQty != null ? String(p.stockQty) : "",
      criticalQty: p.criticalQty ? String(p.criticalQty) : "",
      labelSize: p.labelSize ?? "",
      labelText: p.labelText ?? "",
      usageGuide: p.usageGuide ?? "",
      safetyNotes: p.safetyNotes ?? "",
      extraInfo: p.extraInfo ?? "",
      sku: p.sku ?? "",
      category: p.category ?? "",
      profitMargin: p.profitMargin ?? "",
      vatRate: p.vatRate ?? "",
      desi: p.desi ?? "",
      paintType: p.paintType ?? "",
      featuresText: jsonListToText(p.features),
      shortDescription: p.shortDescription ?? "",
      longDescription: p.longDescription ?? "",
      applicationText: p.applicationText ?? "",
      imageUrlsText: jsonListToText(p.imageUrls),
      videoUrl: p.videoUrl ?? "",
      mockupUrl: p.mockupUrl ?? "",
      labelWarnings: p.labelWarnings ?? "",
      status: p.status ?? "satista",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Ürün adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      series: form.series || null,
      colorCode: form.colorCode || null,
      colorHex: form.colorHex || null,
      surfaceType: form.surfaceType || null,
      additives: form.additives || null,
      description: form.description || null,
      salePrice: parseFloat(form.salePrice) || 0,
      discountPercent: parseFloat(form.discountPercent) || 0,
      packagingCost: parseFloat(form.packagingCost) || 0,
      shippingCost: parseFloat(form.shippingCost) || 0,
      packaging: form.packaging || null,
      barcode: form.barcode.trim() || null,
      stockQty: parseInt(form.stockQty, 10) || 0,
      criticalQty: parseInt(form.criticalQty, 10) || 0,
      labelSize: form.labelSize || null,
      labelText: form.labelText || null,
      usageGuide: form.usageGuide || null,
      safetyNotes: form.safetyNotes || null,
      extraInfo: form.extraInfo || null,
      sku: form.sku.trim() || null,
      category: form.category || null,
      profitMargin: form.profitMargin ? parseFloat(form.profitMargin.replace(",", ".")) : null,
      vatRate: form.vatRate ? parseFloat(form.vatRate.replace(",", ".")) : null,
      desi: form.desi ? parseFloat(form.desi.replace(",", ".")) : null,
      paintType: form.paintType || null,
      features: textToJsonList(form.featuresText),
      shortDescription: form.shortDescription || null,
      longDescription: form.longDescription || null,
      applicationText: form.applicationText || null,
      imageUrls: textToJsonList(form.imageUrlsText),
      videoUrl: form.videoUrl.trim() || null,
      mockupUrl: form.mockupUrl.trim() || null,
      labelWarnings: form.labelWarnings || null,
      status: form.status,
    };
    if (editing) {
      updateProduct.mutate({ id: editing.id, data: payload });
    } else {
      createProduct.mutate({ ...payload, parentId: parentForNew?.id ?? null });
    }
  }

  const isVariantForm = !!parentForNew || (editing !== null && editing.parentId !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ürünler &amp; Türevler</h1>
          <p className="text-sm text-muted-foreground">
            Önce ana boyayı tanımlayın, ardından istediğiniz yüzey veya kullanım alanı için sınırsız türev ekleyin.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => pushTrendyol.mutate({})}
            disabled={pushTrendyol.isPending}
            title="Barkodlu ürünlerin stok ve fiyatını Trendyol'a gönder"
          >
            <Store className="h-4 w-4 mr-1" /> Trendyol'a Gönder
          </Button>
          <Button
            variant="outline"
            onClick={() => pushHepsiburada.mutate({})}
            disabled={pushHepsiburada.isPending}
            title="Barkodlu ürünlerin stok ve fiyatını Hepsiburada'ya gönder"
          >
            <Store className="h-4 w-4 mr-1" /> HB'ye Gönder
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Percent className="h-4 w-4 mr-1" /> Toplu Fiyat
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Dışa Aktar
          </Button>
          <Button onClick={openCreateMain}>
            <Plus className="h-4 w-4 mr-1" /> Yeni Ana Ürün
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ürün veya türev ara..."
            className="pl-8"
          />
        </div>
        <Button
          variant={lowStockOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setLowStockOnly(v => !v)}
          title="Sıfır/eksi stok veya kritik eşiğin altındakiler"
        >
          Düşük Stok
        </Button>
        <div className="flex items-center rounded-lg border p-0.5">
          {(
            [
              ["all", "Tümü"],
              ["satista", "Satışta"],
              ["taslak", "Taslak"],
              ["arsiv", "Arşiv"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={statusFilter === value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {(identityDupes?.length ?? 0) > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            ⚠ Çift barkod/SKU tespit edildi — pazaryeri eşleşmesi yanlış ürüne gidebilir:
          </p>
          <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-400">
            {identityDupes!.slice(0, 5).map(d => (
              <li key={`${d.kind}-${d.value}`}>
                {d.kind === "barkod" ? "Barkod" : "SKU"} <span className="font-mono">{d.value}</span>:{" "}
                {d.names.join(" · ")}
              </li>
            ))}
            {identityDupes!.length > 5 && <li>… ve {identityDupes!.length - 5} grup daha</li>}
          </ul>
        </Card>
      )}

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && mains.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">{search ? "Aramayla eşleşen ürün yok" : "Henüz ürün yok"}</p>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Farklı bir kelime dene veya aramayı temizle."
              : '"Yeni Ana Ürün" ile ilk boyanızı (örn. Siyah Boya) tanımlayın; sonra jant, araba, 3D baskı, ahşap gibi istediğiniz türevleri ekleyin.'}
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {mains.map(main => {
          const variants = childrenOf.get(main.id) ?? [];
          const isOpen = expanded.has(main.id);
          return (
            <Card key={main.id} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggleExpand(main.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Kapat" : "Aç"}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span
                  className="h-8 w-8 rounded-lg border shadow-inner shrink-0"
                  style={{ backgroundColor: main.colorHex ?? "#888" }}
                  title={main.colorCode ?? ""}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{main.name}</span>
                    {main.series && <Badge variant="secondary">{main.series}</Badge>}
                    {main.colorCode && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {main.colorCode}
                      </Badge>
                    )}
                    <HealthBadge health={healthOf(main)} />
                    {STATUS_META[main.status] && (
                      <Badge className={`border-0 text-[10px] ${STATUS_META[main.status].cls}`}>
                        {STATUS_META[main.status].label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {variants.length} türev · Satış: {formatTL(main.salePrice)} · Stok:{" "}
                    <span className={stockCls(main)}>{main.stockQty}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeriveFor(main);
                      setDeriveTypes(new Set());
                      setCustomType("");
                    }}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1" /> Hızlı Türet
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCreateVariant(main)}>
                    <Layers className="h-3.5 w-3.5 mr-1" /> Türev Ekle
                  </Button>
                  {variants.length > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Türevlere uygula: ana üründeki seçili alanları tüm türevlere kopyala"
                      onClick={() => setPropagateFor(main)}
                    >
                      <CopyCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Formül defteri"
                    onClick={() => setLocation(`/formuller?urun=${main.id}`)}
                  >
                    <Beaker className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Mamul stok: giriş/çıkış + hareket geçmişi"
                    onClick={() => openStockDialog(main)}
                  >
                    <Boxes className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Etiket yazdır"
                    onClick={() => printLabel(main)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(main)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Ürünü sil",
                          description: `"${main.name}" ve tüm türevleri silinsin mi?`,
                          confirmText: "Sil",
                          destructive: true,
                        })
                      )
                        deleteProduct.mutate({ id: main.id });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t bg-muted/40 px-4 py-3 space-y-2">
                  {variants.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">
                      Bu ana ürünün henüz türevi yok. "Türev Ekle" ile jant boyası, 3D baskı boyası, ahşap boyası gibi
                      istediğiniz kullanım alanı için türev oluşturun.
                    </p>
                  )}
                  {variants.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3"
                    >
                      <span
                        className="h-6 w-6 rounded-md border shadow-inner shrink-0"
                        style={{ backgroundColor: v.colorHex ?? "#888" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{v.name}</span>
                          {v.surfaceType && (
                            <Badge className="bg-accent text-accent-foreground border-0 text-[10px]">
                              {v.surfaceType}
                            </Badge>
                          )}
                          <HealthBadge health={healthOf(v)} />
                          {STATUS_META[v.status] && (
                            <Badge className={`border-0 text-[10px] ${STATUS_META[v.status].cls}`}>
                              {STATUS_META[v.status].label}
                            </Badge>
                          )}
                        </div>
                        {v.additives && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            Katkı: {v.additives}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs whitespace-nowrap ${stockCls(v) || "text-muted-foreground"}`}>
                        Stok: {v.stockQty}
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap">{formatTL(v.salePrice)}</span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Etiket yazdır"
                          onClick={() => printLabel(v)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Formül defteri"
                          onClick={() => setLocation(`/formuller?urun=${v.id}`)}
                        >
                          <Beaker className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Mamul stok: giriş/çıkış + hareket geçmişi"
                          onClick={() => openStockDialog(v)}
                        >
                          <Boxes className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Türevi sil",
                                description: `"${v.name}" türevi silinsin mi?`,
                                confirmText: "Sil",
                                destructive: true,
                              })
                            )
                              deleteProduct.mutate({ id: v.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Sabit yükseklik: sekmeler arasında geçişte diyalog boyutu değişmez,
            yalnızca sekme içeriği kayar; başlık, sekme çubuğu ve butonlar hep görünür. */}
        <DialogContent className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[85vh] sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {editing
                ? editing.parentId
                  ? "Türev Ürünü Düzenle"
                  : "Ana Ürünü Düzenle"
                : parentForNew
                  ? `Türev Ekle — ${parentForNew.name}`
                  : "Yeni Ana Ürün"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 pt-3">
            <div className="space-y-1.5">
              <Label>Ürün Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={parentForNew ? "Örn. Siyah Jant Boyası" : "Örn. Siyah Boya"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Seri</Label>
                <Input
                  value={form.series}
                  onChange={e => setForm(f => ({ ...f, series: e.target.value }))}
                  placeholder="Örn. Meteor, Vivid, RAL"
                  list="series-options"
                />
                <datalist id="series-options">
                  {(seriesRecords ?? []).map(s => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Renk Kodu</Label>
                <Input
                  value={form.colorCode}
                  onChange={e => setForm(f => ({ ...f, colorCode: e.target.value }))}
                  placeholder="Örn. RAL 9005, M1128"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={autofilling}
                onClick={runAutofill}
                title="Fiyat, SKU/barkod, seri açıklamaları + aynı serideki en dolu ürün kartından etiket, kılavuz, güvenlik, desi ve maliyet alanlarını doldurur"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Otomatik Doldur
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={aiFill.isPending}
                onClick={() => {
                  if (!form.name.trim()) return toast.error("Önce ürün adını gir");
                  aiFill.mutate({
                    name: form.name.trim(),
                    series: form.series || null,
                    packaging: form.packaging || null,
                    color: form.colorCode || null,
                    surfaceType: form.surfaceType || null,
                    paintType: form.paintType || null,
                  });
                }}
                title="Claude ile açıklama, uygulama metni, etiket yazısı ve özellikleri üretir"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> {aiFill.isPending ? "AI yazıyor..." : "AI ile Yaz"}
              </Button>
              <p className="text-[11px] text-muted-foreground flex-1">
                Ad + seriyi girin; fiyat, SKU ve tüm kart alanları serideki benzer üründen otomatik dolsun.
              </p>
            </div>

          </div>

          <Tabs defaultValue="temel" className="flex min-h-0 flex-1 flex-col">
            <div className="px-6 pt-3">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="temel">Temel</TabsTrigger>
                <TabsTrigger value="etiket">Etiket &amp; İçerik</TabsTrigger>
                <TabsTrigger value="pazaryeri">Pazaryeri</TabsTrigger>
                <TabsTrigger value="maliyet">Maliyet</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-3">
              <TabsContent value="temel" className="space-y-3 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Durum</Label>
                <Select
                  value={form.status}
                  onValueChange={v =>
                    setForm(f => ({ ...f, status: v as "taslak" | "satista" | "arsiv" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taslak">Taslak — kart hazırlanıyor</SelectItem>
                    <SelectItem value="satista">Satışta — pazaryerine gönderilir</SelectItem>
                    <SelectItem value="arsiv">Arşiv — satıştan kalktı</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Stok/fiyat gönderimi yalnızca "Satışta" ürünler için yapılır.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Renk Önizleme</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="h-9 w-14 rounded-md border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={form.colorHex}
                    onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Satış Fiyatı (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Stok Adedi</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stockQty}
                  onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kritik Stok Eşiği</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.criticalQty}
                  onChange={e => setForm(f => ({ ...f, criticalQty: e.target.value }))}
                  placeholder="0 = takip yok"
                />
                <p className="text-[11px] text-muted-foreground">
                  Stok bu adede inince düşük stok uyarısı verilir (Stok Nöbetçisi bildirir).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Barkod (pazaryeri eşleştirme)</Label>
                <Input
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="Trendyol/HB barkodu"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Ambalaj</Label>
                  <TemplatePicker kind="ambalaj" onPick={t => setForm(f => ({ ...f, packaging: t.name }))} />
                </div>
                <Input
                  value={form.packaging}
                  onChange={e => setForm(f => ({ ...f, packaging: e.target.value }))}
                  placeholder="Örn. 400 ml Sprey"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Etiket Boyutu</Label>
                  <TemplatePicker kind="etiket_boyutu" onPick={t => setForm(f => ({ ...f, labelSize: t.name }))} />
                </div>
                <Input
                  value={form.labelSize}
                  onChange={e => setForm(f => ({ ...f, labelSize: e.target.value }))}
                  placeholder="Örn. 6x9 cm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ek Bilgiler</Label>
              <Input
                value={form.extraInfo}
                onChange={e => setForm(f => ({ ...f, extraInfo: e.target.value }))}
                placeholder="Turnusol/pH testi, barkod vb."
              />
            </div>

            {isVariantForm && (
              <>
                <div className="space-y-1.5">
                  <Label>Yüzey / Kullanım Alanı</Label>
                  <Input
                    value={form.surfaceType}
                    onChange={e => setForm(f => ({ ...f, surfaceType: e.target.value }))}
                    placeholder="Serbest girin: jant, araba, 3D baskı, ahşap, plastik, metal, cam..."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sabit liste yok — boyanın kullanılacağı her yüzey/alan için istediğiniz tanımı yazabilirsiniz.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Katkı Maddeleri ve Oran Farkları</Label>
                  <Textarea
                    value={form.additives}
                    onChange={e => setForm(f => ({ ...f, additives: e.target.value }))}
                    rows={2}
                    placeholder="Örn. %5 elastikiyet katkısı, %2 UV koruyucu; solvent oranı %10 azaltıldı"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Ürün hakkında notlar"
              />
            </div>
              </TabsContent>

              <TabsContent value="etiket" className="space-y-3 mt-0">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Etiket Yazısı</Label>
                <TemplatePicker kind="etiket_yazisi" onPick={t => setForm(f => ({ ...f, labelText: t.content ?? t.name }))} />
              </div>
              <Textarea
                rows={2}
                value={form.labelText}
                onChange={e => setForm(f => ({ ...f, labelText: e.target.value }))}
                placeholder="Etiketin üzerinde yazan metin"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Kullanım Kılavuzu</Label>
                <div className="flex items-center gap-1">
                  <HtmlCleanButton value={form.usageGuide} onClean={v => setForm(f => ({ ...f, usageGuide: v }))} />
                  <TemplatePicker kind="kilavuz" onPick={t => setForm(f => ({ ...f, usageGuide: t.content ?? t.name }))} />
                </div>
              </div>
              <Textarea
                rows={3}
                value={form.usageGuide}
                onChange={e => setForm(f => ({ ...f, usageGuide: e.target.value }))}
                placeholder="Uygulama adımları, karışım oranı, kuruma süresi..."
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Güvenlik / Uyarılar</Label>
                <TemplatePicker kind="guvenlik" onPick={t => setForm(f => ({ ...f, safetyNotes: t.content ?? t.name }))} />
              </div>
              <Textarea
                rows={2}
                value={form.safetyNotes}
                onChange={e => setForm(f => ({ ...f, safetyNotes: e.target.value }))}
                placeholder="Saklama koşulları, güvenlik uyarıları..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Etiket Uyarıları</Label>
              <Textarea
                rows={2}
                value={form.labelWarnings}
                onChange={e => setForm(f => ({ ...f, labelWarnings: e.target.value }))}
                placeholder="Isı/güneşten koruyun, çocuklardan uzak tutun..."
              />
            </div>

            {editing && (
              <div className="space-y-1.5">
                <Label>Görseller</Label>
                <div className="grid grid-cols-3 gap-2">
                  <ImageSlot
                    label="1. Ana / Pazarlama"
                    kind="main"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                  <ImageSlot
                    label="2. Ambalaj"
                    kind="packaging"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                  <ImageSlot
                    label="3. Kullanım"
                    kind="usage"
                    productId={editing.id}
                    images={productImages}
                    onUpload={(kind, data) => setImage.mutate({ productId: editing.id, kind, data })}
                    onDelete={kind => deleteImage.mutate({ productId: editing.id, kind })}
                  />
                </div>
              </div>
            )}
            {!editing && (
              <p className="text-[11px] text-muted-foreground">
                Görselleri eklemek için ürünü kaydettikten sonra düzenle penceresini aç.
              </p>
            )}
              </TabsContent>

              <TabsContent value="pazaryeri" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Satıcı Stok Kodu (SKU)</Label>
                  <Input
                    value={form.sku}
                    onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                    placeholder="Örn. aocairx30ml"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Kategori</Label>
                    <TemplatePicker kind="kategori" onPick={t => setForm(f => ({ ...f, category: t.name }))} />
                  </div>
                  <Input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Boya, Sprey, Yardımcı Ürünler"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Ürün Türü</Label>
                    <TemplatePicker kind="urun_turu" onPick={t => setForm(f => ({ ...f, paintType: t.name }))} />
                  </div>
                  <Input
                    value={form.paintType}
                    onChange={e => setForm(f => ({ ...f, paintType: e.target.value }))}
                    placeholder="Akrilik 2k, Astar, Bazkat..."
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Özellikler (en fazla 5)</Label>
                    <TemplatePicker
                      kind="ozellik"
                      onPick={t =>
                        setForm(f => ({
                          ...f,
                          featuresText: f.featuresText ? `${f.featuresText}, ${t.name}` : t.name,
                        }))
                      }
                    />
                  </div>
                  <Input
                    value={form.featuresText}
                    onChange={e => setForm(f => ({ ...f, featuresText: e.target.value }))}
                    placeholder="Hızlı Kuruma, Parlak, Opak"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Kısa Açıklama</Label>
                  <HtmlCleanButton value={form.shortDescription} onClean={v => setForm(f => ({ ...f, shortDescription: v }))} />
                </div>
                <Textarea
                  rows={2}
                  value={form.shortDescription}
                  onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                  placeholder="Pazaryeri kısa açıklaması (1-2 cümle)"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Uzun Açıklama</Label>
                  <HtmlCleanButton value={form.longDescription} onClean={v => setForm(f => ({ ...f, longDescription: v }))} />
                </div>
                <Textarea
                  rows={4}
                  value={form.longDescription}
                  onChange={e => setForm(f => ({ ...f, longDescription: e.target.value }))}
                  placeholder="Detaylı ürün açıklaması (HTML destekler)"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Uygulama Metni</Label>
                  <HtmlCleanButton value={form.applicationText} onClean={v => setForm(f => ({ ...f, applicationText: v }))} />
                </div>
                <Textarea
                  rows={3}
                  value={form.applicationText}
                  onChange={e => setForm(f => ({ ...f, applicationText: e.target.value }))}
                  placeholder="Adım adım uygulama talimatı"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Görsel Linkleri (virgül veya satırla ayır)</Label>
                <Textarea
                  rows={2}
                  value={form.imageUrlsText}
                  onChange={e => setForm(f => ({ ...f, imageUrlsText: e.target.value }))}
                  placeholder="https://... , https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Video Linki</Label>
                  <Input
                    value={form.videoUrl}
                    onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mockup Görsel Linki</Label>
                  <Input
                    value={form.mockupUrl}
                    onChange={e => setForm(f => ({ ...f, mockupUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
              </div>
              </TabsContent>

              <TabsContent value="maliyet" className="space-y-3 mt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Kâr Oranı %</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.profitMargin}
                  onChange={e => setForm(f => ({ ...f, profitMargin: e.target.value }))}
                  placeholder="Seriden"
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
                  placeholder="20"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desi</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.desi}
                  onChange={e => setForm(f => ({ ...f, desi: e.target.value }))}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>İndirim %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercent}
                  onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ambalaj Maliyeti (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.packagingCost}
                  onChange={e => setForm(f => ({ ...f, packagingCost: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kargo Maliyeti (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shippingCost}
                  onChange={e => setForm(f => ({ ...f, shippingCost: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createProduct.isPending || updateProduct.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deriveFor !== null} onOpenChange={o => !o && setDeriveFor(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hızlı Türet — {deriveFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Seçtiğin kullanım × ambalaj × renk kombinasyonları için satışa hazır başlıklarla
              türevler oluşturulur. Örn: "Artofcolour Jant {deriveFor?.name} 400 ml Sprey Antrasit Gri"
            </p>
            <ChipGroup
              title="Kullanım / Yüzey"
              options={["Ahşap", "Metal", "Plastik", "Cam", "Seramik", "Jant", "3D Baskı", "Rapala / Yem", "Duvar / İç Mekan", "Airbrush"]}
              selected={deriveTypes}
              setSelected={setDeriveTypes}
              custom={customType}
              setCustom={setCustomType}
            />
            <ChipGroup
              title="Ambalaj (Şablonlar sayfasından yönetilir)"
              options={packOptions.length ? packOptions : ["400 ml Sprey", "1 L Teneke", "250 ml Şişe"]}
              selected={derivePacks}
              setSelected={setDerivePacks}
              custom={customPack}
              setCustom={setCustomPack}
            />
            <ChipGroup
              title="Renk (Şablonlar sayfasından yönetilir)"
              options={colorOptions.length ? colorOptions : ["Açık Gri", "Antrasit Gri", "Siyah", "Beyaz"]}
              selected={deriveColors}
              setSelected={setDeriveColors}
              custom={customColor}
              setCustom={setCustomColor}
            />
            <ChipGroup
              title="Set / Paket (fiyat ve ambalaj maliyeti adetle çarpılır)"
              options={setOptions.length ? setOptions : ["2'li Set", "3'lü Set", "5'li Paket"]}
              selected={deriveSets}
              setSelected={setDeriveSets}
              custom={customSet}
              setCustom={setCustomSet}
            />
            {(() => {
              const total =
                Math.max(deriveTypes.size, 1) *
                Math.max(derivePacks.size, 1) *
                Math.max(deriveColors.size, 1) *
                Math.max(deriveSets.size, 1);
              const any = deriveTypes.size + derivePacks.size + deriveColors.size + deriveSets.size > 0;
              return any ? (
                <p className="text-xs font-medium">
                  {total} türev oluşturulacak
                  {total > 60 ? " — çok fazla, seçimleri azalt (en fazla 60)" : ""}
                </p>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeriveFor(null)}>
              İptal
            </Button>
            <Button
              disabled={
                deriveMany.isPending ||
                deriveTypes.size + derivePacks.size + deriveColors.size + deriveSets.size === 0
              }
              onClick={() =>
                deriveFor &&
                deriveMany.mutate({
                  parentId: deriveFor.id,
                  uses: Array.from(deriveTypes),
                  packagings: Array.from(derivePacks),
                  colors: Array.from(deriveColors),
                  sets: Array.from(deriveSets),
                })
              }
            >
              Türevleri Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={propagateFor !== null} onOpenChange={o => !o && setPropagateFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Türevlere Uygula — {propagateFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ana üründeki seçili alan grupları{" "}
              <span className="font-medium text-foreground">
                {(products ?? []).filter(p => p.parentId === propagateFor?.id).length} türevin
              </span>{" "}
              tümüne kopyalanır. Türeve özgü alanlara (ad, fiyat, ambalaj, barkod, SKU, stok, renk)
              dokunulmaz; türevlerdeki mevcut değerlerin üzerine yazılır.
            </p>
            <div className="space-y-2">
              {PROPAGATE_GROUPS.map(g => (
                <label
                  key={g.key}
                  className="flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={propagateGroups.has(g.key)}
                    onCheckedChange={checked => {
                      setPropagateGroups(prev => {
                        const next = new Set(prev);
                        if (checked) next.add(g.key);
                        else next.delete(g.key);
                        return next;
                      });
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{g.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{g.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropagateFor(null)}>
              İptal
            </Button>
            <Button
              disabled={propagateGroups.size === 0 || propagateToVariants.isPending}
              onClick={() =>
                propagateFor &&
                propagateToVariants.mutate({
                  parentId: propagateFor.id,
                  groups: Array.from(propagateGroups),
                })
              }
            >
              {propagateToVariants.isPending ? "Uygulanıyor..." : "Türevlere Uygula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Fiyat Güncelleme</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tüm ürünlerin (veya bir serinin) satış fiyatını yüzdeyle artır ya da azalt.
              Örn. %10 zam için 10, %5 indirim için -5 yaz.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Yüzde (%)</Label>
                <Input
                  type="number"
                  value={bulkPercent}
                  onChange={e => setBulkPercent(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kapsam</Label>
                <Select value={bulkSeries} onValueChange={setBulkSeries}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tüm ürünler</SelectItem>
                    {seriesList.map(s => (
                      <SelectItem key={s} value={s}>
                        Seri: {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(() => {
              const pct = parseFloat(bulkPercent.replace(",", "."));
              if (isNaN(pct) || pct === 0) return null;
              const count =
                bulkSeries === "__all__"
                  ? ((products as ProductRow[]) ?? []).length
                  : ((products as ProductRow[]) ?? []).filter(p => p.series === bulkSeries).length;
              return (
                <p className="text-xs font-medium">
                  {count} ürünün fiyatı {pct > 0 ? `%${pct} artacak` : `%${Math.abs(pct)} düşecek`}.
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={bulkPrice.isPending}
              onClick={() => {
                const pct = parseFloat(bulkPercent.replace(",", "."));
                if (isNaN(pct) || pct === 0) return toast.error("Geçerli bir yüzde gir");
                if (pct < -90 || pct > 500) return toast.error("Yüzde -90 ile 500 arasında olmalı");
                bulkPrice.mutate({
                  percent: pct,
                  series: bulkSeries === "__all__" ? null : bulkSeries,
                });
              }}
            >
              Uygula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockFor} onOpenChange={o => !o && setStockFor(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mamul Stok — {stockFor?.name}</DialogTitle>
          </DialogHeader>
          {stockFor && (() => {
            // Güncel stok değeri listeden okunur (hareket sonrası tazelenir).
            const fresh = ((products as ProductRow[]) ?? []).find(p => p.id === stockFor.id) ?? stockFor;
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Mevcut stok:{" "}
                  <span className={`font-semibold ${stockCls(fresh) || "text-foreground"}`}>
                    {fresh.stockQty} adet
                  </span>
                  {fresh.criticalQty > 0 && ` · kritik eşik ${fresh.criticalQty}`}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>İşlem</Label>
                    <Select value={stockType} onValueChange={v => setStockType(v as "in" | "out")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">Giriş (+)</SelectItem>
                        <SelectItem value="out">Çıkış (−)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Adet</Label>
                    <Input
                      type="number"
                      min="1"
                      value={stockQtyText}
                      onChange={e => setStockQtyText(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Not</Label>
                    <Input
                      value={stockNote}
                      onChange={e => setStockNote(e.target.value)}
                      placeholder="Sayım farkı, fire, numune..."
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={adjustProductStock.isPending}
                  onClick={() => {
                    const q = parseFloat(stockQtyText.replace(",", "."));
                    if (!q || q <= 0) return toast.error("Geçerli bir adet gir");
                    adjustProductStock.mutate({
                      productId: stockFor.id,
                      type: stockType,
                      qty: q,
                      note: stockNote || undefined,
                    });
                  }}
                >
                  {stockType === "in" ? "Stok Girişi Yap" : "Stok Çıkışı Yap"}
                </Button>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Hareket Geçmişi (üretim, satış, iade, düzeltme)
                  </p>
                  {(productMovementList ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">Henüz hareket kaydı yok.</p>
                  )}
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {(productMovementList ?? []).map(mv => (
                      <div
                        key={mv.id}
                        className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                      >
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatDate(mv.createdAt)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${mv.type === "in" ? "text-emerald-600 border-emerald-300" : "text-rose-600 border-rose-300"}`}
                        >
                          {mv.type === "in" ? "+" : "−"}
                          {formatQty(mv.qty)}
                        </Badge>
                        <span className="text-muted-foreground truncate">{mv.note ?? "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Ürün etiketini yazdırma penceresinde açar; boyutu etiket boyutundan (örn. "6x9 cm") alır. */
function printLabel(p: ProductRow) {
  const dims = (p.labelSize ?? "").match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  const w = dims ? dims[1].replace(",", ".") : "6";
  const h = dims ? dims[2].replace(",", ".") : "9";
  const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>");
  const win = window.open("", "_blank", "width=640,height=800");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Etiket — ${esc(p.name)}</title>
<style>
  @page { size: ${w}cm ${h}cm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  .label { width: ${w}cm; height: ${h}cm; padding: 0.25cm; display: flex; flex-direction: column; border: 1px dashed #bbb; overflow: hidden; }
  @media print { .label { border: none; } }
  .brand { font-size: 0.32cm; font-weight: 800; letter-spacing: 0.06cm; text-transform: uppercase; }
  .name { font-size: 0.42cm; font-weight: 700; margin-top: 0.12cm; line-height: 1.15; }
  .pack { font-size: 0.28cm; color: #333; margin-top: 0.06cm; }
  .text { font-size: 0.24cm; margin-top: 0.15cm; line-height: 1.3; flex: 1; overflow: hidden; }
  .safety { font-size: 0.19cm; color: #444; margin-top: 0.12cm; border-top: 0.5px solid #999; padding-top: 0.08cm; line-height: 1.25; }
</style></head><body>
<div class="label">
  <div class="brand">Art of Colour</div>
  <div class="name">${esc(p.name)}</div>
  ${p.packaging || p.colorCode ? `<div class="pack">${esc([p.packaging, p.colorCode].filter(Boolean).join(" · "))}</div>` : ""}
  ${p.labelText ? `<div class="text">${esc(p.labelText)}</div>` : ""}
  ${p.safetyNotes ? `<div class="safety">${esc(p.safetyNotes)}</div>` : ""}
</div>
<script>window.onload = () => window.print();</script>
</body></html>`);
  win.document.close();
}

function ChipGroup({
  title,
  options,
  selected,
  setSelected,
  custom,
  setCustom,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  setSelected: (fn: (prev: Set<string>) => Set<string>) => void;
  custom: string;
  setCustom: (v: string) => void;
}) {
  const all = Array.from(new Set([...options, ...Array.from(selected)]));
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {all.map(t => (
          <button
            key={t}
            onClick={() =>
              setSelected(prev => {
                const next = new Set(prev);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                return next;
              })
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected.has(t) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Kendi değerini ekle..." className="h-8 text-xs" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            const t = custom.trim();
            if (!t) return;
            setSelected(prev => new Set(prev).add(t));
            setCustom("");
          }}
        >
          Ekle
        </Button>
      </div>
    </div>
  );
}

function ImageSlot({
  label,
  kind,
  images,
  onUpload,
  onDelete,
}: {
  label: string;
  kind: "main" | "packaging" | "usage";
  productId: number;
  images: { kind: string; data: string }[] | undefined;
  onUpload: (kind: "main" | "packaging" | "usage", data: string) => void;
  onDelete: (kind: "main" | "packaging" | "usage") => void;
}) {
  const existing = images?.find(i => i.kind === kind);
  function handleFile(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      onUpload(kind, canvas.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <label className="block cursor-pointer">
        {existing ? (
          <img src={existing.data} alt={label} className="h-20 w-full rounded-md border object-cover" />
        ) : (
          <div className="flex h-20 w-full items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
            + Yükle
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {existing && (
        <button type="button" onClick={() => onDelete(kind)} className="text-[10px] text-destructive hover:underline">
          Kaldır
        </button>
      )}
    </div>
  );
}