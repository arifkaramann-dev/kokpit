import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { buildProductJsonLd } from "@shared/seo";
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

/**
 * Kendi web mağazası (Tema B) — HERKESE AÇIK vitrin. Ürün çekirdeğinden beslenir,
 * pazaryeri komisyonu olmayan en yüksek marjlı kanal.
 *
 * - Fiyat (indirim + kampanya + maliyet-taban) ve KARGO hep SUNUCUDA çözülür;
 *   client yalnızca gösterir. Sepet localStorage'da tutulur.
 * - Ürün sayfaları GERÇEK URL'dir (/magaza/urun/:id) — sitemap + SEO içindir.
 * - Ödeme: PAYTR yapılandırılmışsa iframe; değilse "sipariş alındı" (havale/kapıda).
 */

type Cart = Record<number, number>; // productId → adet
const CART_KEY = "storefront-cart";

function firstImage(imageUrls: string | null, mockupUrl: string | null): string | null {
  if (mockupUrl) return mockupUrl;
  if (!imageUrls) return null;
  try {
    const arr = JSON.parse(imageUrls);
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") return arr[0];
  } catch {
    if (imageUrls.startsWith("http") || imageUrls.startsWith("/")) return imageUrls;
  }
  return null;
}

function useCart() {
  const [cart, setCart] = useState<Cart>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);
  return [cart, setCart] as const;
}

export default function Storefront() {
  const [cart, setCart] = useCart();
  const [, setLocation] = useLocation();
  const [detailMatch, detailParams] = useRoute("/magaza/urun/:id");
  const [cartMatch] = useRoute("/magaza/sepet");
  const [okMatch] = useRoute("/magaza/tamam");
  const [failMatch] = useRoute("/magaza/hata");

  const cartCount = useMemo(() => Object.values(cart).reduce((s, n) => s + n, 0), [cart]);
  const add = (id: number) => {
    setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    toast.success("Sepete eklendi");
  };
  const setQty = (id: number, qty: number) =>
    setCart(c => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <button className="text-lg font-bold tracking-tight" onClick={() => setLocation("/magaza")}>
            Art of Colour <span className="text-primary">Mağaza</span>
          </button>
          <Button variant="outline" size="sm" onClick={() => setLocation("/magaza/sepet")}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Sepet{cartCount > 0 ? ` (${cartCount})` : ""}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {okMatch ? (
          <ResultView ok onClear={() => setCart({})} onBack={() => setLocation("/magaza")} />
        ) : failMatch ? (
          <ResultView ok={false} onClear={() => {}} onBack={() => setLocation("/magaza/sepet")} />
        ) : detailMatch && detailParams?.id ? (
          <ProductDetail id={Number(detailParams.id)} onBack={() => setLocation("/magaza")} onAdd={add} />
        ) : cartMatch ? (
          <CartView cart={cart} setQty={setQty} onBack={() => setLocation("/magaza")} onClear={() => setCart({})} />
        ) : (
          <Grid onOpen={id => setLocation(`/magaza/urun/${id}`)} onAdd={add} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------ Vitrin (grid) ------------------------------ */

function Grid({ onOpen, onAdd }: { onOpen: (id: number) => void; onAdd: (id: number) => void }) {
  const { data: products, isLoading } = trpc.storefront.products.useQuery();
  const list = products ?? [];
  const [q, setQ] = useState("");
  const [series, setSeries] = useState<string>("");

  const seriesList = useMemo(() => {
    const s = new Set<string>();
    for (const p of list) if (p.series) s.add(p.series);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "tr"));
  }, [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return list.filter(p => {
      if (series && p.series !== series) return false;
      if (!needle) return true;
      return (
        p.name.toLocaleLowerCase("tr-TR").includes(needle) ||
        (p.series ?? "").toLocaleLowerCase("tr-TR").includes(needle) ||
        (p.shortDescription ?? "").toLocaleLowerCase("tr-TR").includes(needle)
      );
    });
  }, [list, q, series]);

  useEffect(() => {
    document.title = "Ürünler | Art of Colour Mağaza";
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold mb-1">Ürünler</h1>
      <p className="text-sm text-neutral-500 mb-4">Butik boya — oto rötuş, airbrush, hobi.</p>

      <div className="mb-5 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ürün ara (renk, seri, isim)..." className="pl-8" />
        </div>
        {seriesList.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant={series === "" ? "default" : "outline"} onClick={() => setSeries("")}>
              Tümü
            </Button>
            {seriesList.map(s => (
              <Button key={s} size="sm" variant={series === s ? "default" : "outline"} onClick={() => setSeries(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yükleniyor...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">{list.length === 0 ? "Şu an satışta ürün yok." : "Aramanıza uygun ürün bulunamadı."}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(p => {
            const img = firstImage(p.imageUrls, p.mockupUrl);
            return (
              <div key={p.id} className="rounded-xl border bg-white overflow-hidden flex flex-col">
                <button className="aspect-square bg-neutral-100 flex items-center justify-center relative" onClick={() => onOpen(p.id)}>
                  {img ? (
                    <img src={img} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-neutral-300 text-sm">görsel yok</span>
                  )}
                  {p.discounted && p.discountPercent > 0 && (
                    <span className="absolute top-2 left-2 rounded bg-rose-600 text-white text-[11px] font-semibold px-1.5 py-0.5">
                      −%{p.discountPercent}
                    </span>
                  )}
                </button>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <button className="text-sm font-medium leading-tight line-clamp-2 text-left" onClick={() => onOpen(p.id)}>
                    {p.name}
                  </button>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="flex flex-col leading-tight">
                      {p.discounted && <span className="text-[11px] text-neutral-400 line-through">{formatTL(p.listPrice)}</span>}
                      <span className="font-semibold">{formatTL(p.price)}</span>
                    </span>
                    <Button size="sm" disabled={!p.inStock} onClick={() => onAdd(p.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {!p.inStock && <span className="text-[11px] text-amber-600">Stokta yok</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------ Ürün detay ------------------------------ */

function ProductDetail({ id, onBack, onAdd }: { id: number; onBack: () => void; onAdd: (id: number) => void }) {
  const { data: p, isLoading, isError } = trpc.storefront.product.useQuery({ id });

  // Client-side SEO head (dev + SPA gezinme fallback; production'da sunucu da enjekte eder).
  useEffect(() => {
    if (!p) return;
    const prevTitle = document.title;
    document.title = `${p.name} | Art of Colour`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const jsonLd = buildProductJsonLd({
      id: p.id,
      name: p.name,
      description: (p.shortDescription ?? p.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      url: `${origin}/magaza/urun/${p.id}`,
      image: firstImage(p.imageUrls, p.mockupUrl),
      price: p.price > 0 ? p.price : null,
      availability: p.inStock ? "InStock" : "OutOfStock",
      series: p.series,
    });
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-storefront-jsonld", "1");
    script.textContent = jsonLd;
    document.head.appendChild(script);
    return () => {
      document.title = prevTitle;
      script.remove();
    };
  }, [p]);

  if (isLoading) return <p className="text-sm text-neutral-500">Yükleniyor...</p>;
  if (isError || !p)
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">Ürün bulunamadı.</p>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Mağazaya dön
        </Button>
      </div>
    );

  const img = firstImage(p.imageUrls, p.mockupUrl);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Geri
      </Button>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="aspect-square rounded-xl border bg-neutral-100 flex items-center justify-center overflow-hidden">
          {img ? <img src={img} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-neutral-300">görsel yok</span>}
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          {p.series && <p className="text-sm text-neutral-500">{p.series}</p>}
          <div className="flex items-baseline gap-2">
            {p.discounted && <span className="text-base text-neutral-400 line-through">{formatTL(p.listPrice)}</span>}
            <span className="text-2xl font-semibold">{formatTL(p.price)}</span>
            {p.discounted && p.discountPercent > 0 && (
              <span className="rounded bg-rose-600 text-white text-xs font-semibold px-1.5 py-0.5">−%{p.discountPercent}</span>
            )}
          </div>
          {p.shortDescription && <p className="text-sm text-neutral-700 whitespace-pre-wrap">{p.shortDescription}</p>}
          {p.description && <p className="text-sm text-neutral-600 whitespace-pre-wrap">{p.description}</p>}
          <Button disabled={!p.inStock} onClick={() => onAdd(p.id)}>
            <Plus className="h-4 w-4 mr-1" /> Sepete Ekle
          </Button>
          {!p.inStock && <p className="text-sm text-amber-600">Şu an stokta yok.</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Sepet + ödeme ------------------------------ */

function CartView({
  cart,
  setQty,
  onBack,
  onClear,
}: {
  cart: Cart;
  setQty: (id: number, qty: number) => void;
  onBack: () => void;
  onClear: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: products } = trpc.storefront.products.useQuery();
  const { data: config } = trpc.storefront.config.useQuery();
  const list = products ?? [];

  const rows = Object.entries(cart)
    .map(([id, qty]) => {
      const p = list.find(x => x.id === Number(id));
      return p ? { p, qty } : null;
    })
    .filter((x): x is { p: (typeof list)[number]; qty: number } => x !== null);
  const subtotal = +rows.reduce((s, r) => s + r.p.price * r.qty, 0).toFixed(2);

  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [freeShipping, setFreeShipping] = useState(false);
  const [couponBusy, setCouponBusy] = useState(false);
  const [form, setForm] = useState({ customerName: "", phone: "", address: "", email: "" });
  const [paytr, setPaytr] = useState<{ token: string } | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);

  // Kargo: sunucu ayarına göre önizleme (kargo bedava kuponu veya eşik üstü → 0).
  // Nihai tutar sunucuda createOrder'da yeniden hesaplanır.
  const shipConfig = config?.shipping;
  const baseShipping = useMemo(() => {
    if (!shipConfig || !shipConfig.enabled || subtotal <= 0) return 0;
    if (shipConfig.freeOver != null && subtotal >= shipConfig.freeOver) return 0;
    return shipConfig.fee;
  }, [shipConfig, subtotal]);
  const shipping = freeShipping ? 0 : baseShipping;
  const total = Math.max(0, subtotal - discount) + shipping;

  const applyCouponQ = async () => {
    if (!coupon.trim()) return;
    setCouponBusy(true);
    try {
      const res = await utils.storefront.checkCoupon.fetch({ code: coupon.trim(), subtotal });
      if (res.ok) {
        setDiscount(res.discount);
        setFreeShipping(res.freeShipping);
        toast.success(res.freeShipping ? "Kargo bedava kuponu uygulandı" : `İndirim: ${formatTL(res.discount)}`);
      } else {
        setDiscount(0);
        setFreeShipping(false);
        toast.error(res.reason ?? "Kupon geçersiz");
      }
    } finally {
      setCouponBusy(false);
    }
  };

  const paytrToken = trpc.storefront.paytrToken.useMutation();
  const createOrder = trpc.storefront.createOrder.useMutation({
    onSuccess: async r => {
      onClear();
      // Ödeme yapılandırılmış + e-posta varsa PAYTR iframe akışı; değilse "sipariş alındı".
      if (r.paymentConfigured && form.email.trim()) {
        try {
          const { token } = await paytrToken.mutateAsync({ orderId: r.orderId, email: form.email.trim() });
          setPaytr({ token });
          return;
        } catch {
          toast.message("Sipariş alındı; kartlı ödeme başlatılamadı, sizinle iletişime geçeceğiz.");
        }
      }
      toast.success("Siparişiniz alındı!");
      setPlaced(r.total);
    },
    onError: e => toast.error(e.message),
  });

  if (paytr) {
    return (
      <div className="max-w-2xl mx-auto space-y-3">
        <h1 className="text-xl font-bold">Güvenli Ödeme</h1>
        <p className="text-sm text-neutral-600">Kart bilgilerinizi güvenli PAYTR ekranında girin.</p>
        <iframe
          title="PAYTR Ödeme"
          src={`https://www.paytr.com/odeme/guvenli/${paytr.token}`}
          className="w-full rounded-lg border"
          style={{ minHeight: 640 }}
        />
      </div>
    );
  }

  if (placed != null) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-10">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold">Siparişiniz alındı</h1>
        <p className="text-sm text-neutral-600">
          Sipariş tutarı <b>{formatTL(placed)}</b>. Ödeme ve kargo için sizinle iletişime geçeceğiz.
        </p>
        <Button onClick={onBack}>Alışverişe devam</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Alışverişe dön
      </Button>
      <h1 className="text-2xl font-bold">Sepet</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Sepetiniz boş.</p>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map(({ p, qty }) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(p.id, qty - 1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center text-sm">{qty}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(p.id, qty + 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <span className="w-24 text-right font-medium">{formatTL(p.price * qty)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400" onClick={() => setQty(p.id, 0)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label>Kupon Kodu</Label>
              <Input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Örn. YUZDE10" />
            </div>
            <Button variant="outline" onClick={applyCouponQ} disabled={couponBusy}>
              Uygula
            </Button>
          </div>

          <div className="rounded-lg border bg-white p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-neutral-500">Ara toplam</span>
              <span>{formatTL(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Kupon indirimi</span>
                <span>− {formatTL(discount)}</span>
              </div>
            )}
            {shipConfig?.enabled && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Kargo</span>
                <span>{shipping > 0 ? formatTL(shipping) : "Bedava"}</span>
              </div>
            )}
            {shipConfig?.enabled && shipConfig.freeOver != null && baseShipping > 0 && !freeShipping && (
              <p className="text-[11px] text-neutral-500">{formatTL(shipConfig.freeOver)} ve üzeri alışverişte kargo bedava.</p>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold text-base">
              <span>Toplam</span>
              <span>{formatTL(total)}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 space-y-3">
            <h2 className="font-semibold">Teslimat Bilgileri</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ad Soyad *</Label>
                <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefon *</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>E-posta {config?.paymentConfigured ? "(kartlı ödeme için gerekli)" : ""}</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Adres *</Label>
              <Textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <Button
              className="w-full"
              disabled={createOrder.isPending || paytrToken.isPending}
              onClick={() => {
                if (form.customerName.trim().length < 2 || form.phone.trim().length < 7 || form.address.trim().length < 5) {
                  return toast.error("Ad, telefon ve adres zorunlu");
                }
                createOrder.mutate({
                  customerName: form.customerName.trim(),
                  phone: form.phone.trim(),
                  address: form.address.trim(),
                  email: form.email.trim() || undefined,
                  couponCode: coupon.trim() || undefined,
                  items: rows.map(r => ({ productId: r.p.id, quantity: r.qty })),
                });
              }}
            >
              {config?.paymentConfigured && form.email.trim() ? "Ödemeye Geç" : "Siparişi Tamamla"} — {formatTL(total)}
            </Button>
            <p className="text-[11px] text-neutral-500 text-center">
              {config?.paymentConfigured
                ? "Kartlı ödeme güvenli PAYTR ekranında alınır. E-posta girmezseniz sipariş havale/kapıda ödeme olarak alınır."
                : "Ödeme ve kargo bilgisi sipariş sonrası iletilir."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Ödeme sonucu ------------------------------ */

function ResultView({ ok, onClear, onBack }: { ok: boolean; onClear: () => void; onBack: () => void }) {
  useEffect(() => {
    if (ok) onClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);
  return (
    <div className="max-w-md mx-auto text-center space-y-3 py-10">
      <div className="text-4xl">{ok ? "✅" : "⚠️"}</div>
      <h1 className="text-xl font-bold">{ok ? "Ödemeniz alındı" : "Ödeme tamamlanamadı"}</h1>
      <p className="text-sm text-neutral-600">
        {ok
          ? "Siparişiniz onaylandı. Kargo süreci için sizinle iletişime geçeceğiz. Teşekkürler!"
          : "Ödeme sırasında bir sorun oluştu. Sepetiniz korunuyor; tekrar deneyebilirsiniz."}
      </p>
      <Button onClick={onBack}>{ok ? "Alışverişe devam" : "Sepete dön"}</Button>
    </div>
  );
}
