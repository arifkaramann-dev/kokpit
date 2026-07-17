import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { jsonListHasItems, productHealth } from "@shared/productHealth";
import {
  ArrowLeft,
  Beaker,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Pencil,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import type { ProductRow } from "./Products";

const STATUS_LABELS: Record<string, string> = {
  taslak: "Taslak",
  satista: "Satışta",
  arsiv: "Arşiv",
};

/** Boş görünmesin diye: değer yoksa soluk bir tire. */
function Val({ children }: { children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return <>{children}</>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">
        <Val>{children}</Val>
      </p>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <p className="text-sm whitespace-pre-wrap rounded-lg border bg-muted/30 p-3">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground/60">—</p>
      )}
    </div>
  );
}

/** Odak kaybında değişmişse kaydeden hafif satır içi giriş (türev tablosu). */
function InlineEdit({
  value,
  onSave,
  type = "text",
  className = "",
  align = "left",
}: {
  value: string;
  onSave: (next: string) => void;
  type?: string;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <Input
      type={type}
      defaultValue={value}
      key={value}
      className={`h-8 text-sm ${align === "right" ? "text-right" : ""} ${className}`}
      onBlur={e => {
        const next = e.target.value.trim();
        if (next !== value.trim()) onSave(next);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function ProductDetail() {
  const [, params] = useRoute("/urun/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id ?? 0);
  const utils = trpc.useUtils();

  const { data: products, isLoading } = trpc.products.list.useQuery();
  const { data: images } = trpc.products.images.useQuery({ productId: id }, { enabled: id > 0 });
  const { data: formulaItems } = trpc.formula.list.useQuery({ productId: id }, { enabled: id > 0 });
  const { data: movements } = trpc.products.movements.useQuery({ productId: id }, { enabled: id > 0 });
  const { data: imageIdList } = trpc.products.idsWithImages.useQuery();

  const all = (products as ProductRow[] | undefined) ?? [];
  const product = all.find(p => p.id === id);
  const parent = product?.parentId ? all.find(p => p.id === product.parentId) : null;
  const variants = useMemo(() => all.filter(p => p.parentId === id), [all, id]);
  const imageIds = useMemo(() => new Set(imageIdList ?? []), [imageIdList]);

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <div className="h-60 rounded-xl bg-muted animate-pulse" />;
  if (!product) {
    return (
      <Card className="p-10 text-center space-y-3">
        <p className="font-medium">Ürün bulunamadı</p>
        <Button variant="outline" onClick={() => setLocation("/urunler")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Ürünler &amp; Türevler
        </Button>
      </Card>
    );
  }

  const health = productHealth({
    ...product,
    hasImage: imageIds.has(product.id) || jsonListHasItems(product.imageUrls),
  });
  const mainImage = (images ?? []).find(i => i.kind === "main") ?? (images ?? [])[0];

  const materialCost = (formulaItems ?? []).reduce(
    (sum, item) =>
      sum + (parseFloat(String(item.qty)) || 0) * (parseFloat(String(item.materialUnitCost)) || 0),
    0,
  );
  const packagingCost = parseFloat(product.packagingCost) || 0;
  const shippingCost = parseFloat(product.shippingCost) || 0;
  const totalCost = materialCost + packagingCost + shippingCost;
  const listPrice = parseFloat(product.salePrice) || 0;
  const discount = parseFloat(product.discountPercent) || 0;
  const netPrice = listPrice * (1 - discount / 100);
  const grossProfit = netPrice - totalCost;
  const grossMargin = netPrice > 0 ? (grossProfit / netPrice) * 100 : 0;

  const features: string[] = (() => {
    try {
      const arr = JSON.parse(product.features ?? "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-4">
      {/* Üst şerit: kimlik + hızlı aksiyonlar */}
      <div className="flex items-start gap-4 flex-wrap">
        <Button variant="ghost" size="icon" className="mt-1" onClick={() => setLocation("/urunler")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {mainImage ? (
          <img
            src={mainImage.data}
            alt={product.name}
            className="h-20 w-20 rounded-xl border object-cover shrink-0"
          />
        ) : (
          <span
            className="h-20 w-20 rounded-xl border shadow-inner shrink-0"
            style={{ backgroundColor: product.colorHex ?? "#888" }}
          />
        )}
        <div className="flex-1 min-w-[220px]">
          {parent && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              onClick={() => setLocation(`/urun/${parent.id}`)}
            >
              {parent.name} <ChevronRight className="h-3 w-3" /> türev
            </button>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {product.series && <Badge variant="secondary">{product.series}</Badge>}
            {product.colorCode && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {product.colorCode}
              </Badge>
            )}
            {product.surfaceType && (
              <Badge className="bg-accent text-accent-foreground border-0 text-[10px]">
                {product.surfaceType}
              </Badge>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                health.score >= 90
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                  : health.score >= 60
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
              }`}
            >
              Kart %{health.score}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={product.status}
            onValueChange={v => updateProduct.mutate({ id, data: { status: v as never } })}
          >
            <SelectTrigger className="w-32">
              <SelectValue>{STATUS_LABELS[product.status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="taslak">Taslak</SelectItem>
              <SelectItem value="satista">Satışta</SelectItem>
              <SelectItem value="arsiv">Arşiv</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setLocation(`/formuller?urun=${id}`)}>
            <Beaker className="h-4 w-4 mr-1" /> Formül
          </Button>
          <Button onClick={() => setLocation(`/urunler?duzenle=${id}`)}>
            <Pencil className="h-4 w-4 mr-1" /> Kartı Düzenle
          </Button>
        </div>
      </div>

      {/* Sağlık: eksik alanlar */}
      {health.missing.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-amber-800 dark:text-amber-300">
            <span className="font-medium">Eksik alanlar:</span> {health.missing.join(", ")}
            {health.missingRequired.length > 0 && (
              <span className="block text-xs mt-0.5">
                Pazaryerine ürün kartı açmak için zorunlu: {health.missingRequired.join(", ")}
              </span>
            )}
          </p>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Ürün kartı eksiksiz — pazaryerine hazır.
        </Card>
      )}

      {/* KPI şeridi */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Satış Fiyatı</p>
          <p className="text-lg font-semibold">{formatTL(product.salePrice)}</p>
          {discount > 0 && (
            <p className="text-xs text-muted-foreground">%{discount} indirimli: {formatTL(netPrice)}</p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stok</p>
          <p className={`text-lg font-semibold ${product.stockQty <= 0 ? "text-rose-600" : ""}`}>
            {product.stockQty}
          </p>
          {product.criticalQty > 0 && (
            <p className="text-xs text-muted-foreground">Kritik eşik: {product.criticalQty}</p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Toplam Maliyet</p>
          <p className="text-lg font-semibold">{formatTL(totalCost)}</p>
          <p className="text-xs text-muted-foreground">
            Hammadde {formatTL(materialCost)}
            {formulaItems?.length === 0 && " (reçete yok)"}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Brüt Kâr</p>
          <p
            className={`text-lg font-semibold ${grossProfit < 0 ? "text-rose-600" : "text-emerald-600"}`}
          >
            {formatTL(grossProfit)}
          </p>
          <p className="text-xs text-muted-foreground">Marj %{grossMargin.toFixed(1)}</p>
        </Card>
      </div>

      <Tabs defaultValue={variants.length > 0 ? "turevler" : "genel"}>
        <TabsList className="flex w-full flex-wrap">
          {variants.length > 0 && (
            <TabsTrigger value="turevler">Türevler ({variants.length})</TabsTrigger>
          )}
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="icerik">İçerik &amp; Etiket</TabsTrigger>
          <TabsTrigger value="pazaryeri">Pazaryeri</TabsTrigger>
          <TabsTrigger value="recete">Reçete ({formulaItems?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="stok">Stok Hareketleri</TabsTrigger>
        </TabsList>

        {/* Türevler: satır içi düzenlenebilir tablo (Faz B2) */}
        {variants.length > 0 && (
          <TabsContent value="turevler" className="mt-3">
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-2 pl-3">Türev</th>
                    <th className="p-2 w-28">Fiyat (₺)</th>
                    <th className="p-2 w-20">Stok</th>
                    <th className="p-2 w-44">Barkod</th>
                    <th className="p-2 w-28">Durum</th>
                    <th className="p-2 w-16">Kart</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map(v => {
                    const vh = productHealth({
                      ...v,
                      hasImage: imageIds.has(v.id) || jsonListHasItems(v.imageUrls),
                    });
                    return (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 pl-3">
                          <button
                            className="flex items-center gap-2 text-left hover:underline"
                            onClick={() => setLocation(`/urun/${v.id}`)}
                          >
                            <span
                              className="h-4 w-4 rounded border shrink-0"
                              style={{ backgroundColor: v.colorHex ?? "#888" }}
                            />
                            <span className="font-medium">{v.name}</span>
                          </button>
                        </td>
                        <td className="p-2">
                          <InlineEdit
                            type="number"
                            align="right"
                            value={String(parseFloat(v.salePrice) || 0)}
                            onSave={next =>
                              updateProduct.mutate({
                                id: v.id,
                                data: { salePrice: parseFloat(next) || 0 },
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <InlineEdit
                            type="number"
                            align="right"
                            value={String(v.stockQty)}
                            onSave={next =>
                              updateProduct.mutate({
                                id: v.id,
                                data: { stockQty: parseInt(next, 10) || 0 },
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <InlineEdit
                            value={v.barcode ?? ""}
                            className="font-mono"
                            onSave={next =>
                              updateProduct.mutate({ id: v.id, data: { barcode: next || null } })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={v.status}
                            onValueChange={s =>
                              updateProduct.mutate({ id: v.id, data: { status: s as never } })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue>{STATUS_LABELS[v.status]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="taslak">Taslak</SelectItem>
                              <SelectItem value="satista">Satışta</SelectItem>
                              <SelectItem value="arsiv">Arşiv</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <span
                            className={`text-xs font-medium ${
                              vh.score >= 90
                                ? "text-emerald-600"
                                : vh.score >= 60
                                  ? "text-amber-600"
                                  : "text-rose-600"
                            }`}
                            title={vh.missing.length ? `Eksik: ${vh.missing.join(", ")}` : "Tam"}
                          >
                            %{vh.score}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <p className="mt-2 text-xs text-muted-foreground">
              Fiyat, stok ve barkod hücreleri doğrudan düzenlenir; Enter veya odak kaybıyla kaydedilir.
            </p>
          </TabsContent>
        )}

        <TabsContent value="genel" className="mt-3">
          <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            <Field label="Barkod">{product.barcode}</Field>
            <Field label="SKU">{product.sku}</Field>
            <Field label="Kategori">{product.category}</Field>
            <Field label="Ambalaj">{product.packaging}</Field>
            <Field label="Desi">{product.desi}</Field>
            <Field label="Ürün Türü">{product.paintType}</Field>
            <Field label="Kâr Oranı %">{product.profitMargin}</Field>
            <Field label="KDV %">{product.vatRate}</Field>
            <Field label="Etiket Boyutu">{product.labelSize}</Field>
            {product.additives && <Field label="Katkılar">{product.additives}</Field>}
            {product.extraInfo && <Field label="Ek Bilgiler">{product.extraInfo}</Field>}
          </Card>
          {product.description && (
            <div className="mt-3">
              <TextBlock label="Açıklama" value={product.description} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Kanal bazlı net kâr (komisyon/kargo/KDV sonrası) için Fiyat &amp; Kâr sayfasına bakın.
          </p>
        </TabsContent>

        <TabsContent value="icerik" className="mt-3 space-y-3">
          <TextBlock label="Etiket Yazısı" value={product.labelText} />
          <TextBlock label="Kullanım Kılavuzu" value={product.usageGuide} />
          <TextBlock label="Güvenlik / Uyarılar" value={product.safetyNotes} />
          <TextBlock label="Etiket Uyarıları" value={product.labelWarnings} />
        </TabsContent>

        <TabsContent value="pazaryeri" className="mt-3 space-y-3">
          {features.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {features.map(f => (
                <Badge key={f} variant="secondary">
                  {f}
                </Badge>
              ))}
            </div>
          )}
          <TextBlock label="Kısa Açıklama" value={product.shortDescription} />
          <TextBlock label="Uzun Açıklama" value={product.longDescription} />
          <TextBlock label="Uygulama Metni" value={product.applicationText} />
        </TabsContent>

        <TabsContent value="recete" className="mt-3">
          {(formulaItems ?? []).length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Reçete tanımlı değil.{" "}
              <button className="underline" onClick={() => setLocation(`/formuller?urun=${id}`)}>
                Formül Defteri'nde oluştur
              </button>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-2 pl-3">Hammadde</th>
                    <th className="p-2 text-right">Miktar</th>
                    <th className="p-2 text-right">Birim Maliyet</th>
                    <th className="p-2 text-right">Tutar</th>
                    <th className="p-2 text-right">Pay %</th>
                  </tr>
                </thead>
                <tbody>
                  {(formulaItems ?? []).map(item => {
                    const qty = parseFloat(String(item.qty)) || 0;
                    const unitCost = parseFloat(String(item.materialUnitCost)) || 0;
                    const line = qty * unitCost;
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2 pl-3 font-medium">{item.materialName}</td>
                        <td className="p-2 text-right">
                          {qty} {item.materialUnit}
                        </td>
                        <td className="p-2 text-right">{formatTL(unitCost)}</td>
                        <td className="p-2 text-right">{formatTL(line)}</td>
                        <td className="p-2 text-right text-muted-foreground">
                          {materialCost > 0 ? ((line / materialCost) * 100).toFixed(1) : "0"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/30 font-medium">
                    <td className="p-2 pl-3">Toplam hammadde</td>
                    <td />
                    <td />
                    <td className="p-2 text-right">{formatTL(materialCost)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stok" className="mt-3">
          {(movements ?? []).length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Henüz stok hareketi yok. Üretim, satış ve elle düzeltmeler burada listelenir.
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-2 pl-3">Tarih</th>
                    <th className="p-2">Tür</th>
                    <th className="p-2 text-right">Miktar</th>
                    <th className="p-2">Not</th>
                  </tr>
                </thead>
                <tbody>
                  {(movements ?? []).map(m => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="p-2 pl-3 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className={
                            m.type === "in"
                              ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                              : "border-rose-300 text-rose-700 dark:text-rose-300"
                          }
                        >
                          {m.type === "in" ? "Giriş" : "Çıkış"}
                        </Badge>
                      </td>
                      <td className="p-2 text-right font-medium">
                        {m.type === "in" ? "+" : "−"}
                        {parseFloat(String(m.qty)) || 0}
                      </td>
                      <td className="p-2 text-muted-foreground">{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
            <Boxes className="h-3.5 w-3.5" /> Elle stok giriş/çıkışı için Ürünler sayfasındaki kutu
            ikonunu kullanın.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
