import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTL, num } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  calcChannelProfit,
  DEFAULT_CHANNEL_PROFILES,
  matchPriceRows,
  normalizeChannelProfile,
  parsePriceCsv,
  suggestPrice,
  type ChannelProfile,
  type PriceMatch,
  type PriceMode,
  type Rounding,
} from "@shared/pricing";
import {
  AlertTriangle,
  BadgePercent,
  Calculator,
  FileSpreadsheet,
  Search,
  Send,
  Settings2,
  TrendingDown,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProductRow } from "./Products";

/** Tablo satırı: ürün + hesaplanmış maliyet/kâr değerleri. */
type PricedRow = {
  p: ProductRow;
  materialCost: number;
  totalCost: number;
  netPrice: number;
  channelNet: number;
  channelMargin: number;
};

const MODE_LABELS: Record<PriceMode, string> = {
  percent: "% Zam / İndirim",
  targetMargin: "Hedef Kâr Marjı %",
  multiplier: "Maliyet × Çarpan",
  fixed: "Sabit Tutar Ekle (₺)",
};

const ROUNDING_LABELS: Record<Rounding, string> = {
  none: "Yuvarlama yok",
  whole: "Tam sayıya (129 ₺)",
  ninety: "x,90'a (129,90 ₺)",
  ninetynine: "x,99'a (129,99 ₺)",
};

function marginBadge(margin: number, hasPrice: boolean) {
  if (!hasPrice) return <Badge variant="outline">fiyat yok</Badge>;
  if (margin < 0) return <Badge variant="destructive">%{margin.toFixed(1)}</Badge>;
  if (margin < 15)
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        %{margin.toFixed(1)}
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-emerald-500 text-emerald-600">
      %{margin.toFixed(1)}
    </Badge>
  );
}

export default function Pricing() {
  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery();
  const { data: costSummary } = trpc.products.costSummary.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();

  /* ------------------------- Kanal profilleri (F5) ------------------------- */
  const profiles = useMemo<ChannelProfile[]>(() => {
    try {
      const parsed = JSON.parse(settings?.channelProfiles ?? "");
      // Eski kayıtlarda ödeme bedeli/stopaj alanları yok — normalize ederek taşı.
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeChannelProfile);
    } catch {
      /* ayar yoksa varsayılanlar */
    }
    return DEFAULT_CHANNEL_PROFILES;
  }, [settings]);

  const [profileIdx, setProfileIdx] = useState(0);
  const profile = profiles[Math.min(profileIdx, profiles.length - 1)];

  const saveSettings = trpc.settings.save.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      toast.success("Kanal profilleri kaydedildi");
      setProfilesOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  /* ------------------------- Filtre & sıralama ------------------------- */
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("__all__");
  const [onlyLoss, setOnlyLoss] = useState(false);
  const [sort, setSort] = useState("marginAsc");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const seriesList = useMemo(() => {
    const set = new Set<string>();
    for (const p of (products as ProductRow[]) ?? []) if (p.series) set.add(p.series);
    return Array.from(set).sort();
  }, [products]);

  const costByProduct = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of costSummary ?? []) map.set(r.productId, r.materialCost);
    return map;
  }, [costSummary]);

  const rows = useMemo<PricedRow[]>(() => {
    const list = ((products as ProductRow[]) ?? []).map(p => {
      const materialCost = costByProduct.get(p.id) ?? 0;
      const packaging = num(p.packagingCost);
      const totalCost = materialCost + packaging + num(p.shippingCost);
      const netPrice = num(p.salePrice) * (1 - num(p.discountPercent) / 100);
      const mp = calcChannelProfit({
        salePrice: netPrice,
        productCost: materialCost + packaging,
        profile,
        shippingOverride: num(p.shippingCost),
      });
      return { p, materialCost, totalCost, netPrice, channelNet: mp.net, channelMargin: mp.margin };
    });

    const q = search.trim().toLocaleLowerCase("tr-TR");
    const filtered = list.filter(r => {
      if (seriesFilter !== "__all__" && r.p.series !== seriesFilter) return false;
      if (onlyLoss && !(r.netPrice > 0 && r.channelNet < 0)) return false;
      if (!q) return true;
      return (
        r.p.name.toLocaleLowerCase("tr-TR").includes(q) ||
        (r.p.barcode ?? "").toLocaleLowerCase("tr-TR").includes(q) ||
        (r.p.series ?? "").toLocaleLowerCase("tr-TR").includes(q)
      );
    });

    switch (sort) {
      case "marginAsc":
        filtered.sort((a, b) => a.channelMargin - b.channelMargin);
        break;
      case "marginDesc":
        filtered.sort((a, b) => b.channelMargin - a.channelMargin);
        break;
      case "priceDesc":
        filtered.sort((a, b) => num(b.p.salePrice) - num(a.p.salePrice));
        break;
      default:
        filtered.sort((a, b) => a.p.name.localeCompare(b.p.name, "tr-TR"));
    }
    return filtered;
  }, [products, costByProduct, profile, search, seriesFilter, onlyLoss, sort]);

  const lossCount = useMemo(
    () => rows.filter(r => r.netPrice > 0 && r.channelNet < 0).length,
    [rows],
  );
  const avgMargin = useMemo(() => {
    const withPrice = rows.filter(r => r.netPrice > 0);
    if (withPrice.length === 0) return 0;
    return withPrice.reduce((s, r) => s + r.channelMargin, 0) / withPrice.length;
  }, [rows]);

  /** Toplu işlemin hedefi: işaretli satırlar varsa onlar, yoksa filtrelenmiş liste. */
  const targetRows = useMemo(
    () => (selected.size > 0 ? rows.filter(r => selected.has(r.p.id)) : rows),
    [rows, selected],
  );

  /* ------------------------- Fiyat uygulama ------------------------- */
  const applyPrices = trpc.products.applyPrices.useMutation({
    onSuccess: r => {
      utils.products.invalidate();
      toast.success(`${r.affected} ürünün fiyatı güncellendi`);
      setBulkOpen(false);
      setCsvOpen(false);
      setPreview(null);
      setCsvResult(null);
      setSelected(new Set());
    },
    onError: e => toast.error(e.message),
  });

  // Satır içi fiyat düzenleme: değişen değerler burada tutulur, Enter/odak kaybında kaydedilir.
  const [edits, setEdits] = useState<Record<number, string>>({});
  function commitEdit(id: number, oldPrice: number) {
    const raw = edits[id];
    if (raw === undefined) return;
    const value = parseFloat(raw.replace(",", "."));
    setEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (!Number.isFinite(value) || value < 0 || +value.toFixed(2) === +oldPrice.toFixed(2)) return;
    applyPrices.mutate({ updates: [{ id, salePrice: +value.toFixed(2) }] });
  }

  /* ------------------------- Toplu fiyatlama (F2) ------------------------- */
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mode, setMode] = useState<PriceMode>("percent");
  const [modeValue, setModeValue] = useState("10");
  const [rounding, setRounding] = useState<Rounding>("ninety");
  const [preview, setPreview] = useState<PriceMatch[] | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  function buildPreview() {
    const value = parseFloat(modeValue.replace(",", "."));
    if (!Number.isFinite(value)) return toast.error("Geçerli bir değer girin");
    const out: PriceMatch[] = [];
    let skipped = 0;
    for (const r of targetRows) {
      const suggested = suggestPrice({
        currentPrice: num(r.p.salePrice),
        totalCost: r.totalCost,
        mode,
        value,
        profile,
        productCost: r.materialCost + num(r.p.packagingCost),
        shippingOverride: num(r.p.shippingCost),
        rounding,
      });
      if (suggested === null || suggested <= 0) {
        skipped++;
        continue;
      }
      if (+suggested.toFixed(2) === num(r.p.salePrice)) continue;
      out.push({
        productId: r.p.id,
        productName: r.p.name,
        oldPrice: num(r.p.salePrice),
        newPrice: suggested,
        line: 0,
      });
    }
    if (out.length === 0) {
      return toast.error(
        skipped > 0
          ? `Hiçbir fiyat hesaplanamadı (${skipped} ürün atlandı — maliyet 0 veya hedef marj imkânsız)`
          : "Değişecek fiyat yok",
      );
    }
    setSkippedCount(skipped);
    setPreview(out);
  }

  /* ------------------------- CSV içe aktarma (F3) ------------------------- */
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<{
    matches: PriceMatch[];
    unmatchedCount: number;
    errors: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCsvFile(file: File) {
    const text = await file.text();
    const { rows: csvRows, errors } = parsePriceCsv(text);
    const { matches, unmatched } = matchPriceRows(
      ((products as ProductRow[]) ?? []).map(p => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        salePrice: p.salePrice,
      })),
      csvRows,
    );
    const changed = matches.filter(m => +m.newPrice.toFixed(2) !== +m.oldPrice.toFixed(2));
    setCsvResult({
      matches: changed,
      unmatchedCount: unmatched.length + (matches.length - changed.length),
      errors,
    });
    if (errors.length > 0 && csvRows.length === 0) toast.error(errors[0]);
  }

  /* ------------------------- Pazaryerine gönderme (F4) ------------------------- */
  const pushTrendyol = trpc.products.pushToTrendyol.useMutation({
    onSuccess: r => toast.success(`Trendyol'a ${r.sent} ürünün stok/fiyatı gönderildi`, { duration: 8000 }),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const pushHepsiburada = trpc.products.pushToHepsiburada.useMutation({
    onSuccess: r => toast.success(`Hepsiburada'ya ${r.sent} ürünün stok/fiyatı gönderildi`, { duration: 8000 }),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const pushIds = selected.size > 0 ? Array.from(selected) : undefined;

  /* ------------------------- Profil düzenleme ------------------------- */
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ChannelProfile[]>([]);

  function openProfiles() {
    setProfileDraft(profiles.map(p => ({ ...p })));
    setProfilesOpen(true);
  }
  function setDraftField(i: number, field: keyof ChannelProfile, value: string) {
    setProfileDraft(prev =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        if (field === "kind") {
          // Tür değişince stopaj yasal varsayılana çekilir (pazaryeri %1, diğerleri 0) — elle değiştirilebilir.
          const kind = value as ChannelProfile["kind"];
          return { ...p, kind, stopajPercent: kind === "pazaryeri" ? 1 : 0 };
        }
        return { ...p, [field]: field === "name" ? value : parseFloat(value.replace(",", ".")) || 0 };
      }),
    );
  }

  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.p.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fiyat &amp; Kâr Motoru</h1>
          <p className="text-sm text-muted-foreground">
            Tüm ürünlerin maliyeti, kanal bazlı net kârı ve marjı tek tabloda; formülle veya Excel'le toplu güncelle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openProfiles}>
            <Settings2 className="h-4 w-4 mr-1" /> Kanal Profilleri
          </Button>
          <Button variant="outline" onClick={() => { setCsvResult(null); setCsvOpen(true); }}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel/CSV ile Güncelle
          </Button>
          <Button onClick={() => { setPreview(null); setBulkOpen(true); }}>
            <Calculator className="h-4 w-4 mr-1" /> Toplu Fiyatla
          </Button>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Listelenen Ürün</p>
          <p className="text-xl font-bold">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Kanal: {profile?.name}</p>
          <p className="text-xl font-bold">
            %{profile?.commissionPercent ?? 0} <span className="text-sm font-normal">komisyon</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Ortalama Marj</p>
          <p className={`text-xl font-bold ${avgMargin < 0 ? "text-destructive" : ""}`}>%{avgMargin.toFixed(1)}</p>
        </Card>
        <Card className={`p-4 ${lossCount > 0 ? "border-destructive/50" : ""}`}>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Zararına Satılan
          </p>
          <p className={`text-xl font-bold ${lossCount > 0 ? "text-destructive" : ""}`}>{lossCount}</p>
        </Card>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8 w-56"
            placeholder="Ürün / barkod ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={seriesFilter} onValueChange={setSeriesFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tüm seriler</SelectItem>
            {seriesList.map(s => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(profileIdx)} onValueChange={v => setProfileIdx(Number(v))}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p, i) => (
              <SelectItem key={i} value={String(i)}>
                Kanal: {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="marginAsc">Marj (düşük → yüksek)</SelectItem>
            <SelectItem value="marginDesc">Marj (yüksek → düşük)</SelectItem>
            <SelectItem value="priceDesc">Fiyat (yüksek → düşük)</SelectItem>
            <SelectItem value="name">İsme göre</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={onlyLoss ? "destructive" : "outline"}
          size="sm"
          onClick={() => setOnlyLoss(v => !v)}
        >
          <AlertTriangle className="h-4 w-4 mr-1" /> Sadece zarardakiler
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pushTrendyol.isPending}
            onClick={() => pushTrendyol.mutate({ ids: pushIds })}
          >
            <Send className="h-4 w-4 mr-1" /> Trendyol'a Gönder{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pushHepsiburada.isPending}
            onClick={() => pushHepsiburada.mutate({ ids: pushIds })}
          >
            <Send className="h-4 w-4 mr-1" /> Hepsiburada'ya Gönder{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      </div>

      {/* Ana tablo */}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={v =>
                    setSelected(v === true ? new Set(rows.map(r => r.p.id)) : new Set())
                  }
                />
              </TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Maliyet</TableHead>
              <TableHead className="text-right w-32">Satış Fiyatı</TableHead>
              <TableHead className="text-right">İndirimli Net</TableHead>
              <TableHead className="text-right">Net Kâr ({profile?.name})</TableHead>
              <TableHead className="text-right">Marj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Ürün bulunamadı — filtreleri temizleyin veya Ürünler sayfasından ürün ekleyin.
                </TableCell>
              </TableRow>
            )}
            {rows.map(r => {
              const hasPrice = num(r.p.salePrice) > 0;
              return (
                <TableRow key={r.p.id} className={r.channelNet < 0 && hasPrice ? "bg-destructive/5" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.p.id)}
                      onCheckedChange={v =>
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (v === true) next.add(r.p.id);
                          else next.delete(r.p.id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium leading-tight">{r.p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[r.p.series, r.p.barcode].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{r.p.stockQty}</TableCell>
                  <TableCell
                    className="text-right"
                    title={`Hammadde ${formatTL(r.materialCost)} + Ambalaj ${formatTL(r.p.packagingCost)} + Kargo ${formatTL(r.p.shippingCost)}`}
                  >
                    {formatTL(r.totalCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="h-8 w-28 text-right ml-auto"
                      value={edits[r.p.id] ?? num(r.p.salePrice).toFixed(2)}
                      onChange={e => setEdits(prev => ({ ...prev, [r.p.id]: e.target.value }))}
                      onBlur={() => commitEdit(r.p.id, num(r.p.salePrice))}
                      onKeyDown={e => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape")
                          setEdits(prev => {
                            const next = { ...prev };
                            delete next[r.p.id];
                            return next;
                          });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTL(r.netPrice)}
                    {num(r.p.discountPercent) > 0 && (
                      <span className="text-xs text-muted-foreground"> (−%{num(r.p.discountPercent)})</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${r.channelNet < 0 && hasPrice ? "text-destructive" : ""}`}
                  >
                    {hasPrice ? formatTL(r.channelNet) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{marginBadge(r.channelMargin, hasPrice)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Toplu fiyatlama dialogu (F2) */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgePercent className="h-5 w-5" /> Toplu Fiyatlama
            </DialogTitle>
          </DialogHeader>
          {!preview && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Hedef: <b>{targetRows.length}</b> ürün ({selected.size > 0 ? "işaretli satırlar" : "filtrelenmiş liste"}).
                Hedef marj modu, seçili kanal profilinin (<b>{profile?.name}</b>) tüm kesintilerini
                (komisyon, ödeme/işlem bedeli, kargo, stopaj, KDV) düşerek hesaplar; marj KDV hariç
                satışa göredir.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Yöntem</Label>
                  <Select value={mode} onValueChange={v => setMode(v as PriceMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODE_LABELS) as PriceMode[]).map(m => (
                        <SelectItem key={m} value={m}>
                          {MODE_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>
                    {mode === "percent" && "Yüzde (− indirim)"}
                    {mode === "targetMargin" && "Hedef marj %"}
                    {mode === "multiplier" && "Çarpan"}
                    {mode === "fixed" && "Tutar ₺ (− indirim)"}
                  </Label>
                  <Input value={modeValue} onChange={e => setModeValue(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Yuvarlama</Label>
                  <Select value={rounding} onValueChange={v => setRounding(v as Rounding)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROUNDING_LABELS) as Rounding[]).map(r => (
                        <SelectItem key={r} value={r}>
                          {ROUNDING_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {mode !== "percent" && mode !== "fixed" && (
                <p className="text-xs text-muted-foreground">
                  Maliyet = formüldeki hammadde + ambalaj + kargo. Maliyeti 0 olan ürünler atlanır — önce Formül
                  Defteri'nden reçete girin.
                </p>
              )}
            </div>
          )}
          {preview && (
            <div className="space-y-2">
              <p className="text-sm">
                <b>{preview.length}</b> ürünün fiyatı değişecek
                {skippedCount > 0 && (
                  <span className="text-muted-foreground"> · {skippedCount} ürün hesaplanamadığı için atlandı</span>
                )}
                :
              </p>
              <div className="max-h-72 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ürün</TableHead>
                      <TableHead className="text-right">Eski</TableHead>
                      <TableHead className="text-right">Yeni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map(m => (
                      <TableRow key={m.productId}>
                        <TableCell className="py-1.5">{m.productName}</TableCell>
                        <TableCell className="py-1.5 text-right text-muted-foreground line-through">
                          {formatTL(m.oldPrice)}
                        </TableCell>
                        <TableCell
                          className={`py-1.5 text-right font-medium ${m.newPrice < m.oldPrice ? "text-destructive" : "text-emerald-600"}`}
                        >
                          {formatTL(m.newPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            {!preview && (
              <>
                <Button variant="outline" onClick={() => setBulkOpen(false)}>
                  Vazgeç
                </Button>
                <Button onClick={buildPreview}>Önizle</Button>
              </>
            )}
            {preview && (
              <>
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Geri
                </Button>
                <Button
                  disabled={applyPrices.isPending}
                  onClick={() =>
                    applyPrices.mutate({
                      updates: preview.map(m => ({ id: m.productId, salePrice: m.newPrice })),
                    })
                  }
                >
                  {preview.length} Fiyatı Uygula
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel/CSV içe aktarma dialogu (F3) */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" /> Excel/CSV ile Fiyat Güncelleme
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ürünler sayfasındaki "Dışa Aktar" dosyasını Excel'de açıp fiyat sütununu düzenleyin ve CSV olarak
              kaydedip buraya yükleyin. Gerekli sütunlar: <b>Barkod</b> (veya ID/SKU) ve <b>Satış Fiyatı</b>{" "}
              (veya "Yeni Fiyat"/"Fiyat"). Eşleşme önce barkodla, sonra ID ile yapılır.
            </p>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
            />
            {csvResult && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                    {csvResult.matches.length} fiyat değişecek
                  </Badge>
                  {csvResult.unmatchedCount > 0 && (
                    <Badge variant="outline">{csvResult.unmatchedCount} satır eşleşmedi/değişmedi</Badge>
                  )}
                  {csvResult.errors.length > 0 && (
                    <Badge variant="destructive">{csvResult.errors.length} hatalı satır</Badge>
                  )}
                </div>
                {csvResult.errors.length > 0 && (
                  <div className="text-xs text-destructive max-h-20 overflow-y-auto space-y-0.5">
                    {csvResult.errors.slice(0, 10).map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
                {csvResult.matches.length > 0 && (
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ürün</TableHead>
                          <TableHead className="text-right">Eski</TableHead>
                          <TableHead className="text-right">Yeni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvResult.matches.map(m => (
                          <TableRow key={m.productId}>
                            <TableCell className="py-1.5">{m.productName}</TableCell>
                            <TableCell className="py-1.5 text-right text-muted-foreground line-through">
                              {formatTL(m.oldPrice)}
                            </TableCell>
                            <TableCell className="py-1.5 text-right font-medium">{formatTL(m.newPrice)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>
              Vazgeç
            </Button>
            <Button
              disabled={!csvResult || csvResult.matches.length === 0 || applyPrices.isPending}
              onClick={() =>
                csvResult &&
                applyPrices.mutate({
                  updates: csvResult.matches.map(m => ({ id: m.productId, salePrice: m.newPrice })),
                })
              }
            >
              {csvResult?.matches.length ?? 0} Fiyatı Uygula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kanal profilleri dialogu (F5) */}
      <Dialog open={profilesOpen} onOpenChange={setProfilesOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> Kanal Profilleri
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Net kâr hesabında kullanılan kanal kesintileri. İşlem bedeli ve kargo KDV dahil girilir;
            kargo 0 ise ürünün kendi kargo maliyeti kullanılır. Stopaj yalnızca pazaryeri satışlarında
            (%1) uygulanır. POS türü "Banka" ise komisyon BSMV'li olduğu için KDV indirimi yapılmaz.
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_92px_64px_64px_64px_64px_64px_88px_32px] gap-2 text-xs text-muted-foreground px-1">
              <span>Kanal</span>
              <span>Tür</span>
              <span>Kom. %</span>
              <span>Ödeme %</span>
              <span>İşlem ₺</span>
              <span>Stopaj %</span>
              <span>KDV %</span>
              <span>Kargo ₺ / POS</span>
              <span />
            </div>
            {profileDraft.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_92px_64px_64px_64px_64px_64px_88px_32px] gap-2 items-center">
                <Input value={p.name} onChange={e => setDraftField(i, "name", e.target.value)} />
                <Select value={p.kind} onValueChange={v => setDraftField(i, "kind", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pazaryeri">Pazaryeri</SelectItem>
                    <SelectItem value="website">Web Sitesi</SelectItem>
                    <SelectItem value="elden">Elden</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={String(p.commissionPercent)} onChange={e => setDraftField(i, "commissionPercent", e.target.value)} />
                <Input value={String(p.paymentFeePercent)} onChange={e => setDraftField(i, "paymentFeePercent", e.target.value)} />
                <Input value={String(p.fixedFee)} onChange={e => setDraftField(i, "fixedFee", e.target.value)} />
                <Input value={String(p.stopajPercent)} onChange={e => setDraftField(i, "stopajPercent", e.target.value)} />
                <Input value={String(p.vatPercent)} onChange={e => setDraftField(i, "vatPercent", e.target.value)} />
                <div className="flex flex-col gap-1">
                  <Input value={String(p.shippingCost)} onChange={e => setDraftField(i, "shippingCost", e.target.value)} />
                  {p.kind === "website" && (
                    <Select
                      value={p.paymentFeeVatDeductible ? "kurulus" : "banka"}
                      onValueChange={v => setProfileDraft(prev => prev.map((x, idx) => (idx === i ? { ...x, paymentFeeVatDeductible: v === "kurulus" } : x)))}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kurulus">Ödeme kuruluşu</SelectItem>
                        <SelectItem value="banka">Banka POS'u</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setProfileDraft(prev => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setProfileDraft(prev => [
                  ...prev,
                  {
                    name: "Yeni Kanal",
                    kind: "pazaryeri" as const,
                    commissionPercent: 0,
                    paymentFeePercent: 0,
                    paymentFeeVatDeductible: true,
                    fixedFee: 0,
                    stopajPercent: 1,
                    vatPercent: 20,
                    shippingCost: 0,
                  },
                ])
              }
            >
              + Kanal Ekle
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfilesOpen(false)}>
              Vazgeç
            </Button>
            <Button
              disabled={saveSettings.isPending || profileDraft.length === 0}
              onClick={() => {
                setProfileIdx(0);
                saveSettings.mutate({ channelProfiles: JSON.stringify(profileDraft) });
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
