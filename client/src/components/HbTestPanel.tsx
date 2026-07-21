import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Copy, FlaskConical } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Hepsiburada CANLIYA GEÇİŞ test paneli (Ayarlar sayfası).
 *
 * HB'nin canlı onayı için istediği 3 kanıt burada üretilir:
 *  1) Katalog: test ürünü gönder → trackingId
 *  2) Listing: HB'nin yüklediği envantere stok/fiyat gönder → uploadId'ler
 *  3) Sipariş: test siparişi oluştur → listele → paketle (packageNumber)
 *
 * Panel panoya/veritabanına VERİ YAZMAZ; ham API yanıtları gösterilir.
 * Kimlikler kopyalanıp HB ticket'ına yapıştırılır.
 */

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Kopyalandı"))
    .catch(() => toast.error("Kopyalanamadı"));
}

function ResultBox({ data }: { data: unknown }) {
  if (data == null) return null;
  return (
    <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-2 text-[11px] whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function IdChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <button
      onClick={() => copy(value)}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
      title="Kopyala — HB ticket'ına yapıştır"
    >
      <Copy className="h-3 w-3" /> {label}: <span className="font-mono">{value}</span>
    </button>
  );
}

export function HbTestPanel() {
  const { data: info } = trpc.hbTest.info.useQuery();

  // 1) Katalog
  const [cat, setCat] = useState({ categoryId: "", merchantSku: "AOC-TEST-1", name: "Art of Colour Test Boya 50ml", brand: "Art of Colour", price: "150", imageUrl: "" });
  const [catResult, setCatResult] = useState<unknown>(null);
  const [trackingId, setTrackingId] = useState("");
  const sendProduct = trpc.hbTest.sendProduct.useMutation({
    onSuccess: r => {
      setCatResult(r);
      if (r.trackingId) {
        setTrackingId(r.trackingId);
        toast.success("Ürün gönderildi — trackingId alındı");
      } else {
        toast.info("Gönderim cevabı geldi ama trackingId bulunamadı — ham yanıtı incele");
      }
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const productStatus = trpc.hbTest.productStatus.useMutation({
    onSuccess: r => setCatResult(r),
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // 2) Listing
  const [listResult, setListResult] = useState<unknown>(null);
  const [listItems, setListItems] = useState<{ merchantSku: string; hbSku: string | null; price: number | null; stock: number | null }[]>([]);
  const [push, setPush] = useState({ merchantSku: "", price: "100", stock: "10" });
  const [pushResult, setPushResult] = useState<{ priceUploadId: string | null; stockUploadId: string | null } | null>(null);
  const listings = trpc.hbTest.listings.useMutation({
    onSuccess: r => {
      setListResult(r);
      setListItems(r.items);
      if (r.items.length > 0) {
        setPush(p => ({ ...p, merchantSku: p.merchantSku || r.items[0].merchantSku }));
        setOrder(o => ({ ...o, hbSku: o.hbSku || String(r.items[0].hbSku ?? r.items[0].merchantSku) }));
        toast.success(`${r.items.length} envanter ürünü geldi`);
      } else {
        toast.info("Envanter listesi boş görünüyor — ham yanıtı incele");
      }
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const pushListing = trpc.hbTest.pushListing.useMutation({
    onSuccess: r => {
      setPushResult(r);
      toast.success("Stok/fiyat gönderildi — uploadId'leri HB'ye ilet");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  // 3) Sipariş & paketleme
  const [order, setOrder] = useState({ hbSku: "", merchantSku: "", quantity: "1", price: "100" });
  const [orderResult, setOrderResult] = useState<unknown>(null);
  const [createdOrderNo, setCreatedOrderNo] = useState("");
  const createOrder = trpc.hbTest.createOrder.useMutation({
    onSuccess: r => {
      setOrderResult(r);
      if (r.orderNumber) setCreatedOrderNo(r.orderNumber);
      toast[r.ok ? "success" : "info"](r.ok ? `Test siparişi oluşturuldu: ${r.orderNumber ?? ""}` : "Cevap geldi — ham yanıtı incele");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const listOrders = trpc.hbTest.listOrders.useMutation({
    onSuccess: r => {
      setOrderResult(r);
      toast.success(`${r.orders.length} sipariş listelendi`);
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });
  const [packageNo, setPackageNo] = useState<string | null>(null);
  const packageOrder = trpc.hbTest.packageOrder.useMutation({
    onSuccess: r => {
      setOrderResult(r);
      setPackageNo(r.packageNumber);
      toast[r.ok ? "success" : "info"](r.packageNumber ? `Paketlendi: ${r.packageNumber}` : "Cevap geldi — ham yanıtı incele");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const busy =
    sendProduct.isPending || productStatus.isPending || listings.isPending || pushListing.isPending ||
    createOrder.isPending || listOrders.isPending || packageOrder.isPending;

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" /> Hepsiburada Test Ortamı (canlıya geçiş)
      </h2>
      {info && (
        <div className="text-xs rounded-md border p-2.5 space-y-1">
          <p>
            Ortam:{" "}
            {info.testEnv ? (
              <b className="text-amber-600">TEST (SIT) — otomatik sipariş senkronu kapalı</b>
            ) : (
              <b className="text-emerald-600">CANLI</b>
            )}{" "}
            · Bilgiler: {info.configured ? "girilmiş ✓" : "eksik ✗"} · Merchant: <span className="font-mono">{info.merchantId}</span>
          </p>
          <p className="text-muted-foreground">
            Test bilgileri e-postayla gelince Render → Environment'a gir:{" "}
            <span className="font-mono">HEPSIBURADA_ENV=sit</span> +{" "}
            <span className="font-mono">HEPSIBURADA_MERCHANT_ID / USERNAME / PASSWORD / SERVICE_KEY</span>.
            Testler bitip HB canlı bilgileri verince <span className="font-mono">HEPSIBURADA_ENV</span> silinir,
            canlı bilgiler girilir. Adım adım rehber: PAZARYERI.md.
          </p>
        </div>
      )}

      {/* 1) Katalog */}
      <div className="rounded-lg border p-3 space-y-2.5">
        <p className="font-medium text-sm">1) Katalog testi — ürün gönder, trackingId al</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Kategori ID *</Label>
            <Input value={cat.categoryId} onChange={e => setCat(s => ({ ...s, categoryId: e.target.value }))} placeholder="örn. 18021982" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Satıcı SKU</Label>
            <Input value={cat.merchantSku} onChange={e => setCat(s => ({ ...s, merchantSku: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Marka</Label>
            <Input value={cat.brand} onChange={e => setCat(s => ({ ...s, brand: e.target.value }))} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Ürün adı</Label>
            <Input value={cat.name} onChange={e => setCat(s => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fiyat (₺)</Label>
            <Input value={cat.price} onChange={e => setCat(s => ({ ...s, price: e.target.value }))} />
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-3">
            <Label className="text-xs">Görsel URL (opsiyonel — /api/img linki kullanılabilir)</Label>
            <Input value={cat.imageUrl} onChange={e => setCat(s => ({ ...s, imageUrl: e.target.value }))} placeholder="https://..." />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={busy || !parseInt(cat.categoryId, 10) || !cat.merchantSku.trim() || !cat.name.trim()}
            onClick={() =>
              sendProduct.mutate({
                categoryId: parseInt(cat.categoryId, 10),
                merchantSku: cat.merchantSku.trim(),
                name: cat.name.trim(),
                brand: cat.brand.trim() || "Art of Colour",
                price: parseFloat(cat.price) || 100,
                imageUrl: cat.imageUrl.trim() || undefined,
              })
            }
          >
            Ürünü Gönder
          </Button>
          <Input className="w-72" value={trackingId} onChange={e => setTrackingId(e.target.value)} placeholder="trackingId" />
          <Button size="sm" variant="outline" disabled={busy || !trackingId.trim()} onClick={() => productStatus.mutate({ trackingId: trackingId.trim() })}>
            Durum Sorgula
          </Button>
          <IdChip label="trackingId" value={trackingId || null} />
        </div>
        <ResultBox data={catResult} />
      </div>

      {/* 2) Listing */}
      <div className="rounded-lg border p-3 space-y-2.5">
        <p className="font-medium text-sm">2) Listing testi — HB envanterine stok/fiyat gönder, uploadId al</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => listings.mutate()}>
            Envanteri Getir
          </Button>
          {listItems.length > 0 && (
            <span className="text-xs text-muted-foreground">{listItems.length} ürün — birine tıkla, forma dolsun</span>
          )}
        </div>
        {listItems.length > 0 && (
          <div className="max-h-36 overflow-auto rounded-md border divide-y">
            {listItems.map((it, i) => (
              <button
                key={i}
                className="flex w-full items-center gap-2 p-1.5 text-xs hover:bg-accent/40 text-left"
                onClick={() => {
                  setPush(p => ({ ...p, merchantSku: it.merchantSku }));
                  setOrder(o => ({ ...o, hbSku: String(it.hbSku ?? it.merchantSku), merchantSku: it.merchantSku }));
                }}
              >
                <span className="font-mono">{it.merchantSku}</span>
                {it.hbSku && <span className="font-mono text-muted-foreground">hbSku: {it.hbSku}</span>}
                {it.price != null && <span className="ml-auto">{it.price} ₺ / stok {it.stock ?? "?"}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">merchantSku</Label>
            <Input className="w-48" value={push.merchantSku} onChange={e => setPush(s => ({ ...s, merchantSku: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fiyat</Label>
            <Input className="w-24" value={push.price} onChange={e => setPush(s => ({ ...s, price: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stok</Label>
            <Input className="w-20" value={push.stock} onChange={e => setPush(s => ({ ...s, stock: e.target.value }))} />
          </div>
          <Button
            size="sm"
            disabled={busy || !push.merchantSku.trim()}
            onClick={() =>
              pushListing.mutate({
                merchantSku: push.merchantSku.trim(),
                price: parseFloat(push.price) || 1,
                stock: parseInt(push.stock, 10) || 0,
              })
            }
          >
            Stok/Fiyat Gönder
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <IdChip label="priceUploadId" value={pushResult?.priceUploadId} />
          <IdChip label="stockUploadId" value={pushResult?.stockUploadId} />
        </div>
        <ResultBox data={listResult} />
      </div>

      {/* 3) Sipariş & paketleme */}
      <div className="rounded-lg border p-3 space-y-2.5">
        <p className="font-medium text-sm">3) Sipariş testi — test siparişi oluştur, listele, paketle</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">hbSku (envanterden)</Label>
            <Input className="w-48" value={order.hbSku} onChange={e => setOrder(s => ({ ...s, hbSku: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Adet</Label>
            <Input className="w-16" value={order.quantity} onChange={e => setOrder(s => ({ ...s, quantity: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fiyat</Label>
            <Input className="w-24" value={order.price} onChange={e => setOrder(s => ({ ...s, price: e.target.value }))} />
          </div>
          <Button
            size="sm"
            disabled={busy || !order.hbSku.trim()}
            onClick={() =>
              createOrder.mutate({
                hbSku: order.hbSku.trim(),
                merchantSku: order.merchantSku.trim() || undefined,
                quantity: parseInt(order.quantity, 10) || 1,
                price: parseFloat(order.price) || 100,
              })
            }
          >
            Test Siparişi Oluştur
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => listOrders.mutate()}>
            Siparişleri Getir
          </Button>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Sipariş no (paketlenecek)</Label>
            <Input className="w-48" value={createdOrderNo} onChange={e => setCreatedOrderNo(e.target.value)} placeholder="10 haneli test sipariş no" />
          </div>
          <Button size="sm" disabled={busy || !createdOrderNo.trim()} onClick={() => packageOrder.mutate({ orderNumber: createdOrderNo.trim() })}>
            Paketle
          </Button>
          <IdChip label="packageNumber" value={packageNo} />
        </div>
        <ResultBox data={orderResult} />
      </div>

      <p className="text-xs text-muted-foreground">
        3 adım da tamamlanınca HB'ye yeni bir ticket aç: trackingId + uploadId'ler + paketlenen test
        siparişi numarasını yaz, canlı ortam bilgilerini iste. Bu panel canlı API'lere yalnızca
        Render üzerinde ulaşabilir (geliştirme ortamı dışarı kapalı).
      </p>
    </Card>
  );
}
