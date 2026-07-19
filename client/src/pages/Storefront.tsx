import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Kendi web mağazası (Tema B) — HERKESE AÇIK vitrin. Ürün çekirdeğinden beslenir,
 * pazaryeri komisyonu olmayan en yüksek marjlı kanal. Sepet localStorage'da tutulur;
 * ödeme PAYTR yapılandırılmışsa iframe, değilse "sipariş alındı" (havale/kapıda) akışı.
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
    /* düz metin URL olabilir */
    if (imageUrls.startsWith("http") || imageUrls.startsWith("/")) return imageUrls;
  }
  return null;
}

export default function Storefront() {
  const [cart, setCart] = useState<Cart>(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [view, setView] = useState<"grid" | "cart" | "detail">("grid");
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const { data: products, isLoading } = trpc.storefront.products.useQuery();
  const list = products ?? [];

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
          <button className="text-lg font-bold tracking-tight" onClick={() => setView("grid")}>
            Art of Colour <span className="text-primary">Mağaza</span>
          </button>
          <Button variant="outline" size="sm" onClick={() => setView("cart")}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Sepet{cartCount > 0 ? ` (${cartCount})` : ""}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {view === "grid" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Ürünler</h1>
            <p className="text-sm text-neutral-500 mb-5">Butik boya — oto rötuş, airbrush, hobi.</p>
            {isLoading ? (
              <p className="text-sm text-neutral-500">Yükleniyor...</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-neutral-500">Şu an satışta ürün yok.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {list.map(p => {
                  const img = firstImage(p.imageUrls, p.mockupUrl);
                  const net = p.salePrice * (1 - p.discountPercent / 100);
                  return (
                    <div key={p.id} className="rounded-xl border bg-white overflow-hidden flex flex-col">
                      <button
                        className="aspect-square bg-neutral-100 flex items-center justify-center"
                        onClick={() => {
                          setDetailId(p.id);
                          setView("detail");
                        }}
                      >
                        {img ? (
                          <img src={img} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-neutral-300 text-sm">görsel yok</span>
                        )}
                      </button>
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <p className="text-sm font-medium leading-tight line-clamp-2">{p.name}</p>
                        <div className="mt-auto flex items-center justify-between">
                          <span className="font-semibold">{formatTL(net)}</span>
                          <Button size="sm" disabled={!p.inStock} onClick={() => add(p.id)}>
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
        )}

        {view === "detail" && detailId != null && (
          <ProductDetail id={detailId} onBack={() => setView("grid")} onAdd={add} />
        )}

        {view === "cart" && (
          <CartView cart={cart} products={list} setQty={setQty} onBack={() => setView("grid")} onDone={() => setCart({})} />
        )}
      </main>
    </div>
  );
}

function ProductDetail({ id, onBack, onAdd }: { id: number; onBack: () => void; onAdd: (id: number) => void }) {
  const { data: p, isLoading } = trpc.storefront.product.useQuery({ id });
  if (isLoading || !p) return <p className="text-sm text-neutral-500">Yükleniyor...</p>;
  const img = firstImage(p.imageUrls, p.mockupUrl);
  const net = p.salePrice * (1 - p.discountPercent / 100);
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
          <p className="text-2xl font-semibold">{formatTL(net)}</p>
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

type StoreProduct = { id: number; name: string; salePrice: number; discountPercent: number; imageUrls: string | null; mockupUrl: string | null; inStock: boolean };

function CartView({
  cart,
  products,
  setQty,
  onBack,
  onDone,
}: {
  cart: Cart;
  products: StoreProduct[];
  setQty: (id: number, qty: number) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const rows = Object.entries(cart)
    .map(([id, qty]) => {
      const p = products.find(x => x.id === Number(id));
      return p ? { p, qty, net: p.salePrice * (1 - p.discountPercent / 100) } : null;
    })
    .filter((x): x is { p: StoreProduct; qty: number; net: number } => x !== null);
  const subtotal = rows.reduce((s, r) => s + r.net * r.qty, 0);

  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [form, setForm] = useState({ customerName: "", phone: "", address: "", email: "" });
  const [placed, setPlaced] = useState<{ orderId: number; total: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const applyCouponQ = async () => {
    if (!coupon.trim()) return;
    setCouponBusy(true);
    const res = await utils.storefront.checkCoupon.fetch({ code: coupon.trim(), subtotal, shipping: 0 }).finally(() => setCouponBusy(false));
    if (res.ok) {
      setDiscount(res.discount);
      toast.success(res.freeShipping ? "Kargo bedava kuponu uygulandı" : `İndirim: ${formatTL(res.discount)}`);
    } else {
      setDiscount(0);
      toast.error(res.reason ?? "Kupon geçersiz");
    }
  };

  const createOrder = trpc.storefront.createOrder.useMutation({
    onSuccess: r => {
      setPlaced({ orderId: r.orderId, total: r.total });
      onDone();
      toast.success("Siparişiniz alındı!");
    },
    onError: e => toast.error(e.message),
  });

  const total = Math.max(0, subtotal - discount);

  if (placed) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-10">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold">Siparişiniz alındı</h1>
        <p className="text-sm text-neutral-600">
          Sipariş tutarı <b>{formatTL(placed.total)}</b>. Ödeme ve kargo için sizinle iletişime geçeceğiz.
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
            {rows.map(({ p, qty, net }) => (
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
                <span className="w-24 text-right font-medium">{formatTL(net * qty)}</span>
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
              <Label>E-posta</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Adres *</Label>
              <Textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <Button
              className="w-full"
              disabled={createOrder.isPending}
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
              Siparişi Tamamla — {formatTL(total)}
            </Button>
            <p className="text-[11px] text-neutral-500 text-center">
              Ödeme ve kargo bilgisi sipariş sonrası iletilir. (Kartlı ödeme entegrasyonu aktifleştirildiğinde
              burada güvenli ödeme adımı görünür.)
            </p>
          </div>
        </>
      )}
    </div>
  );
}
