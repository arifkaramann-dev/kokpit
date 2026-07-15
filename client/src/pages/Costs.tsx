import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatTL, num } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { calcChannelProfit } from "@shared/pricing";
import { Calculator, Save, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProductRow } from "./Products";

/**
 * Kar marjı hesaplama mantığı (saf fonksiyon — testlerde de kullanılır):
 * netPrice = salePrice * (1 - discount/100)
 * totalCost = materialCost + packagingCost + shippingCost
 * profit = netPrice - totalCost
 * margin = netPrice > 0 ? profit / netPrice * 100 : 0
 */
export function calcProfit(input: {
  salePrice: number;
  discountPercent: number;
  materialCost: number;
  packagingCost: number;
  shippingCost: number;
}) {
  const netPrice = input.salePrice * (1 - input.discountPercent / 100);
  const totalCost = input.materialCost + input.packagingCost + input.shippingCost;
  const profit = netPrice - totalCost;
  const margin = netPrice > 0 ? (profit / netPrice) * 100 : 0;
  return { netPrice, totalCost, profit, margin };
}

/* Pazaryeri/kanal net kâr hesabı artık shared/pricing.ts'teki calcChannelProfit'te
 * (KDV indirimi, komisyon KDV'si, ödeme bedeli ve stopaj dahil — finans onaylı model). */

export default function Costs() {
  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery();
  const [selectedId, setSelectedId] = useState<string>("");

  const productId = selectedId ? Number(selectedId) : null;
  const { data: formulaItems } = trpc.formula.list.useQuery(
    { productId: productId ?? 0 },
    { enabled: !!productId },
  );

  const [salePrice, setSalePrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [packagingCost, setPackagingCost] = useState("");
  const [shippingCost, setShippingCost] = useState("");

  const selectedProduct = useMemo(
    () => ((products as ProductRow[]) ?? []).find(p => p.id === productId),
    [products, productId],
  );

  // Ürün seçilince formu doldur
  useEffect(() => {
    if (selectedProduct) {
      setSalePrice(selectedProduct.salePrice);
      setDiscountPercent(selectedProduct.discountPercent);
      setPackagingCost(selectedProduct.packagingCost);
      setShippingCost(selectedProduct.shippingCost);
    }
  }, [selectedProduct]);

  const [mpVat, setMpVat] = useState("20");
  const [mpCom, setMpCom] = useState("20");
  const [mpFee, setMpFee] = useState("10");
  const [mpShip, setMpShip] = useState("");
  const [mpPay, setMpPay] = useState("0.96");
  const [mpStopaj, setMpStopaj] = useState("1");

  const materialCost = useMemo(
    () =>
      (formulaItems ?? []).reduce(
        (sum, item) => sum + num(item.qty) * num(item.materialUnitCost),
        0,
      ),
    [formulaItems],
  );

  const result = useMemo(
    () =>
      calcProfit({
        salePrice: parseFloat(salePrice) || 0,
        discountPercent: parseFloat(discountPercent) || 0,
        materialCost,
        packagingCost: parseFloat(packagingCost) || 0,
        shippingCost: parseFloat(shippingCost) || 0,
      }),
    [salePrice, discountPercent, materialCost, packagingCost, shippingCost],
  );

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.invalidate();
      toast.success("Fiyat ve maliyet bilgileri ürüne kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const sortedProducts = useMemo(() => {
    const list = (products as ProductRow[]) ?? [];
    const mains = list.filter(p => p.parentId === null);
    const result: { p: ProductRow; label: string }[] = [];
    for (const m of mains) {
      result.push({ p: m, label: m.name });
      for (const v of list.filter(x => x.parentId === m.id)) {
        result.push({ p: v, label: `${m.name} → ${v.name}` });
      }
    }
    return result;
  }, [products]);

  function save() {
    if (!productId) return;
    updateProduct.mutate({
      id: productId,
      data: {
        salePrice: parseFloat(salePrice) || 0,
        discountPercent: parseFloat(discountPercent) || 0,
        packagingCost: parseFloat(packagingCost) || 0,
        shippingCost: parseFloat(shippingCost) || 0,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Maliyet &amp; Kar Marjı</h1>
        <p className="text-sm text-muted-foreground">
          Hammadde maliyeti formülden otomatik gelir; satış fiyatı ve indirimle net kar marjınızı görün.
        </p>
      </div>

      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger className="w-full sm:w-96">
          <SelectValue placeholder="Ürün seçin..." />
        </SelectTrigger>
        <SelectContent>
          {sortedProducts.length === 0 && (
            <SelectItem value="none" disabled>
              Önce Ürünler sayfasından ürün ekleyin
            </SelectItem>
          )}
          {sortedProducts.map(({ p, label }) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!productId && (
        <Card className="p-10 text-center space-y-2">
          <Calculator className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Maliyet analizi için bir ürün seçin</p>
          <p className="text-sm text-muted-foreground">
            Formül defterine hammadde girdiyseniz maliyet otomatik hesaplanır.
          </p>
        </Card>
      )}

      {productId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" /> Girdiler
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <span className="text-sm">Hammadde Maliyeti (formülden)</span>
                <span className="font-semibold">{formatTL(materialCost)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ambalaj Maliyeti (₺)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packagingCost}
                    onChange={e => setPackagingCost(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Kargo Maliyeti (₺)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingCost}
                    onChange={e => setShippingCost(e.target.value)}
                  />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Satış Fiyatı (₺)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>İndirim Oranı (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={e => setDiscountPercent(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={save} disabled={updateProduct.isPending} className="w-full">
                <Save className="h-4 w-4 mr-1" /> Ürüne Kaydet
              </Button>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="font-semibold">Sonuç</h2>
            <div className="space-y-2">
              <ResultRow label="İndirimli Satış Fiyatı" value={formatTL(result.netPrice)} />
              <ResultRow label="Toplam Maliyet" value={formatTL(result.totalCost)} muted />
              <Separator />
              <div className="flex items-center justify-between py-1">
                <span className="font-medium">Net Kar (adet başı)</span>
                <span
                  className={`text-xl font-bold ${result.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {formatTL(result.profit)}
                </span>
              </div>
              <div
                className={`rounded-xl p-4 flex items-center gap-3 ${
                  result.margin >= 30
                    ? "bg-emerald-50 dark:bg-emerald-950/30"
                    : result.margin >= 0
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : "bg-rose-50 dark:bg-rose-950/30"
                }`}
              >
                {result.profit >= 0 ? (
                  <TrendingUp className="h-8 w-8 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-8 w-8 text-rose-600" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Kar Marjı</p>
                  <p className="text-2xl font-bold">%{result.margin.toFixed(1)}</p>
                </div>
                <Badge
                  variant="secondary"
                  className="ml-auto"
                >
                  {result.margin >= 30 ? "Sağlıklı" : result.margin >= 0 ? "Düşük marj" : "Zarar!"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                İpucu: 1750 ₺ üzeri ücretsiz kargo verdiğiniz siparişlerde kargo maliyetini bu hesaba
                eklemeyi unutmayın.
              </p>
            </div>
          </Card>

          <Card className="p-5 space-y-3 lg:col-span-2">
            <h2 className="font-semibold">Pazaryeri & KDV Analizi</h2>
            <p className="text-xs text-muted-foreground">
              Komisyon, ödeme/işlem bedeli, kargo ve stopajı düşerek gerçek net kârı gösterir.
              Komisyon/işlem/kargo KDV'leri indirilecek KDV olduğu için gider sayılmaz — hesap
              KDV hariç baza indirgenir (Trendyol resmi hesaplayıcısıyla aynı sonuç).
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>KDV Oranı (%)</Label>
                <Input type="number" min="0" value={mpVat} onChange={e => setMpVat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Komisyon (%)</Label>
                <Input type="number" min="0" value={mpCom} onChange={e => setMpCom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ödeme Bedeli (%)</Label>
                <Input type="number" min="0" step="0.01" value={mpPay} onChange={e => setMpPay(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>İşlem Bedeli (₺, KDV dahil)</Label>
                <Input type="number" min="0" value={mpFee} onChange={e => setMpFee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Stopaj (%)</Label>
                <Input type="number" min="0" step="0.1" value={mpStopaj} onChange={e => setMpStopaj(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Kargo (₺, KDV dahil)</Label>
                <Input
                  type="number"
                  min="0"
                  value={mpShip}
                  onChange={e => setMpShip(e.target.value)}
                  placeholder={shippingCost || "0"}
                />
              </div>
            </div>
            {(() => {
              const price = parseFloat(salePrice) || 0;
              const productCost = materialCost + (parseFloat(packagingCost) || 0);
              const mp = calcChannelProfit({
                salePrice: price,
                productCost,
                profile: {
                  name: "Pazaryeri",
                  kind: "pazaryeri",
                  commissionPercent: parseFloat(mpCom) || 0,
                  paymentFeePercent: parseFloat(mpPay) || 0,
                  paymentFeeVatDeductible: true,
                  fixedFee: parseFloat(mpFee) || 0,
                  stopajPercent: parseFloat(mpStopaj) || 0,
                  vatPercent: parseFloat(mpVat) || 0,
                  shippingCost: parseFloat(mpShip || shippingCost) || 0,
                },
              });
              return (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <Row label="Satış fiyatı (KDV dahil)" value={formatTL(price)} />
                  <Row label={`Satış (KDV hariç hasılat)`} value={formatTL(mp.saleEx)} />
                  <Row label={`Komisyon (%${mpCom}, KDV'si indirilmiş)`} value={`− ${formatTL(mp.commission)}`} />
                  <Row label={`Ödeme + işlem bedeli (net)`} value={`− ${formatTL(mp.paymentFee + mp.transactionFee)}`} />
                  <Row label="Kargo (KDV'si indirilmiş)" value={`− ${formatTL(mp.shipping)}`} />
                  <Row label={`Stopaj (%${mpStopaj})`} value={`− ${formatTL(mp.stopaj)}`} />
                  <Row label="Ürün maliyeti (hammadde + ambalaj, KDV hariç)" value={`− ${formatTL(productCost)}`} />
                  <div className="flex justify-between border-t pt-1.5 font-semibold">
                    <span>Net kâr</span>
                    <span className={mp.net >= 0 ? "text-emerald-600" : "text-rose-600"}>
                      {formatTL(mp.net)} (marj %{mp.margin.toFixed(1)} · ROI %{mp.roi.toFixed(1)})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Stopaj, yıllık gelir/kurumlar vergisinden mahsup edilebilen peşin vergidir;
                    birim kârlılıkta maliyet gibi gösterilir.
                  </p>
                </div>
              );
            })()}
          </Card>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`font-medium ${muted ? "text-muted-foreground" : ""}`}>{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
