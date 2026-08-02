import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { formatTL, num } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Elden satış — kasa ekranı.
 *
 * ── Neden ayrı ekran ──────────────────────────────────────────────────────
 * Elden satış, "Yeni Sipariş" diyaloğunun içine sıkıştırılmıştı: ürün adı
 * serbest metin + datalist, adet ve fiyat elle, satır toplamı yok, indirim
 * yok, ödeme yöntemi serbest metin. Müşteri karşısında en hızlı olması
 * gereken akış, en yavaşıydı; katalogdan seçilmeyen her satır masterId'siz
 * kaydolduğu için stoktan da düşmüyor, ürün raporuna da girmiyordu.
 *
 * Buradaki akış tek bir soruya indirgendi: "ne sattın, kaç para aldın".
 * Ürün aranarak seçilir (fiyat kendiliğinden gelir ve ürün bağı kurulur),
 * adet artı/eksiyle değişir, toplam her an görünür.
 *
 * Varsayılanlar elden satışın gerçeğine göre: kanal "elden", ödeme "ödendi",
 * durum "tamamlandı". Kullanıcı hiçbir şey seçmeden satışı bitirebilmeli.
 */

type Line = {
  key: string;
  masterId: number | null;
  name: string;
  qty: number;
  unitPrice: number;
};

const PAYMENT_METHODS = ["Nakit", "Kart", "Havale", "Kapıda"];

export default function QuickSale({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.katalog.sellableList.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Nakit");
  const [discountText, setDiscountText] = useState("");
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unpaid, setUnpaid] = useState(false);
  const pickerButton = useRef<HTMLButtonElement>(null);

  // Diyalog her açılışta temiz başlasın: bir önceki satışın kalıntısıyla
  // devam etmek, kasa ekranında en pahalı hata türü.
  useEffect(() => {
    if (!open) return;
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMethod("Nakit");
    setDiscountText("");
    setNote("");
    setUnpaid(false);
    // Ürün seçici hemen açılsın — akış "ürün ekle" ile başlıyor.
    const t = setTimeout(() => setPickerOpen(true), 120);
    return () => clearTimeout(t);
  }, [open]);

  const create = trpc.orders.create.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.dashboard.summary.invalidate();
      utils.katalog.invalidate();
      utils.customers.list.invalidate();
      toast.success(`Satış kaydedildi — ${formatTL(total)}`);
      onOpenChange(false);
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
    [lines],
  );

  /**
   * İndirim hem "%10" hem "150" yazılabilsin: müşteri karşısında hangisini
   * söyleyeceğiniz belli olmaz ve iki ayrı kutu koymak akışı yavaşlatır.
   */
  const discount = useMemo(() => {
    const raw = discountText.trim();
    if (!raw) return 0;
    if (raw.endsWith("%")) {
      const p = parseFloat(raw.slice(0, -1).replace(",", ".")) || 0;
      return Math.min(subtotal, (subtotal * p) / 100);
    }
    const v = parseFloat(raw.replace(",", ".")) || 0;
    return Math.min(subtotal, Math.max(0, v));
  }, [discountText, subtotal]);

  const total = Math.max(0, subtotal - discount);

  function addProduct(p: { masterId: number; name: string; basePrice: number }) {
    setLines(prev => {
      // Aynı ürün ikinci kez seçilirse yeni satır değil ADET artışı: kasada
      // "bir tane daha" demek yeni bir kalem açmak değildir.
      const hit = prev.find(l => l.masterId === p.masterId);
      if (hit) {
        return prev.map(l => (l.key === hit.key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          key: `m${p.masterId}-${Date.now()}`,
          masterId: p.masterId,
          name: p.name,
          qty: 1,
          unitPrice: p.basePrice,
        },
      ];
    });
  }

  function addFreeLine() {
    setLines(prev => [
      ...prev,
      { key: `free-${Date.now()}`, masterId: null, name: "", qty: 1, unitPrice: 0 },
    ]);
  }

  const patch = (key: string, data: Partial<Line>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...data } : l)));

  function submit() {
    const rows = lines.filter(l => l.name.trim() && l.qty > 0);
    if (rows.length === 0) {
      toast.error("En az bir ürün ekleyin");
      return;
    }

    /*
     * İndirim, kalem fiyatlarına oransal dağıtılır. Sipariş toplamı kalem
     * satırlarından hesaplandığı için indirimi ayrı bir alanda tutmak, kartta
     * görünen tutarla tahsil edilen tutarın ayrışması demek olurdu.
     * Son satır kuruş farkını üstlenir ki toplam birebir tutsun.
     */
    const factor = subtotal > 0 ? total / subtotal : 1;
    const items = rows.map(l => ({
      productName: l.name.trim(),
      quantity: l.qty,
      unitPrice: Math.round(l.unitPrice * factor * 100) / 100,
      masterId: l.masterId,
    }));
    const computed = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const drift = Math.round((total - computed) * 100) / 100;
    if (drift !== 0 && items.length > 0) {
      const last = items[items.length - 1];
      last.unitPrice = Math.round((last.unitPrice + drift / last.quantity) * 100) / 100;
    }

    create.mutate({
      customerName: customerName.trim() || "Elden Satış",
      channel: "elden",
      totalAmount: total,
      customerPhone: customerPhone.trim() || null,
      paymentStatus: unpaid ? "unpaid" : "paid",
      paidAmount: unpaid ? 0 : total,
      paymentMethod: unpaid ? null : paymentMethod,
      notes: [note.trim(), discount > 0 ? `İndirim: ${formatTL(discount)}` : null]
        .filter(Boolean)
        .join(" · ") || null,
      status: "done",
      items,
    });
  }

  const customerRows =
    (customers as { id: number; name: string; phone: string | null }[] | undefined) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" /> Elden Satış
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {/* Ürün ekleme — akışın başladığı yer, en üstte ve tek tuşla. */}
          <div className="flex flex-wrap gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button ref={pickerButton} variant="outline" className="flex-1 justify-start">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-60" />
                  Ürün ara ve ekle…
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Renk, ambalaj ya da kod…" />
                  <CommandList>
                    <CommandEmpty>Ürün bulunamadı — "Serbest satır" kullanın.</CommandEmpty>
                    <CommandGroup>
                      {(catalog ?? []).map(p => (
                        <CommandItem
                          key={p.masterId}
                          value={`${p.name} ${p.internalSku}`}
                          onSelect={() => {
                            addProduct(p);
                            // Seçici açık kalır: peş peşe ürün eklemek normaldir.
                            pickerButton.current?.focus();
                          }}
                        >
                          {p.hex && (
                            <span
                              className="mr-2 inline-block h-3.5 w-3.5 shrink-0 rounded border"
                              style={{ backgroundColor: p.hex }}
                            />
                          )}
                          <span className="truncate">{p.name}</span>
                          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatTL(p.basePrice)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" onClick={addFreeLine} title="Katalogda olmayan bir şey sat">
              <Plus className="mr-1 h-4 w-4" /> Serbest satır
            </Button>
          </div>

          {lines.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Sepet boş — yukarıdan ürün arayıp ekleyin. Fiyat ve ürün bağı kendiliğinden gelir.
            </Card>
          ) : (
            <div className="space-y-2">
              {lines.map(l => (
                <Card key={l.key} className="flex flex-wrap items-center gap-2 p-2.5">
                  <div className="min-w-40 flex-1">
                    {l.masterId != null ? (
                      <p className="truncate text-sm font-medium">{l.name}</p>
                    ) : (
                      <Input
                        autoFocus
                        value={l.name}
                        placeholder="Ürün adı (katalog dışı)"
                        onChange={e => patch(l.key, { name: e.target.value })}
                        className="h-8"
                      />
                    )}
                    {l.masterId == null && l.name.trim() && (
                      <p className="mt-0.5 text-[11px] text-amber-600">
                        Katalog dışı — stoktan düşmez, ürün raporuna girmez.
                      </p>
                    )}
                  </div>

                  {/* Adet: artı/eksi tuşları — kasada klavyeye geçmek yavaş. */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => patch(l.key, { qty: Math.max(1, l.qty - 1) })}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      value={String(l.qty)}
                      onChange={e => patch(l.key, { qty: Math.max(0, num(e.target.value)) })}
                      className="h-8 w-14 text-center"
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => patch(l.key, { qty: l.qty + 1 })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Input
                      value={l.unitPrice === 0 ? "" : String(l.unitPrice)}
                      placeholder="0,00"
                      onChange={e => patch(l.key, { unitPrice: num(e.target.value) })}
                      className="h-8 w-24 text-right"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-muted-foreground">₺</span>
                  </div>

                  <span className="w-24 text-right text-sm font-semibold tabular-nums">
                    {formatTL(l.qty * l.unitPrice)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {/* Müşteri opsiyonel: elden satışın çoğu isimsizdir, ama cari
              takibi gerekenlerde kayıtlı müşteri seçilince telefon da gelir. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Müşteri (opsiyonel)
              </Label>
              <Input
                list="quicksale-customers"
                value={customerName}
                onChange={e => {
                  const v = e.target.value;
                  setCustomerName(v);
                  const hit = customerRows.find(
                    c => c.name.trim().toLocaleLowerCase("tr-TR") === v.trim().toLocaleLowerCase("tr-TR"),
                  );
                  if (hit?.phone) setCustomerPhone(hit.phone);
                }}
                placeholder="Boş bırakılırsa 'Elden Satış'"
              />
              <datalist id="quicksale-customers">
                {customerRows.map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Telefon (opsiyonel)</Label>
              <Input
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Not (opsiyonel)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Özel istek, teslim notu…"
            />
          </div>
        </div>

        {/* Toplam ve ödeme sabit altlıkta: kaydırma nerede olursa olsun
            tahsil edilecek rakam ve "Satışı Bitir" hep görünür. */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">İndirim</Label>
            <Input
              value={discountText}
              onChange={e => setDiscountText(e.target.value)}
              placeholder="150 veya %10"
              className="h-8 w-28"
            />
            {discount > 0 && (
              <span className="text-xs text-muted-foreground">
                −{formatTL(discount)} (ara toplam {formatTL(subtotal)})
              </span>
            )}
            <span className="ml-auto text-lg font-bold tabular-nums">{formatTL(total)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={!unpaid && paymentMethod === m ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setPaymentMethod(m);
                  setUnpaid(false);
                }}
              >
                {m}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={unpaid ? "default" : "outline"}
              className="h-8"
              onClick={() => setUnpaid(true)}
              title="Ödeme sonra alınacak — alacak olarak takip edilir"
            >
              Veresiye
            </Button>
            {unpaid && (
              <Badge variant="outline" className="text-amber-600">
                Alacak olarak kaydedilir
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={lines.length === 0 || create.isPending} onClick={submit}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Satışı Bitir · {formatTL(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
