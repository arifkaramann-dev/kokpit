import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { formatTL } from "@/lib/format";
import {
  Bot,
  CalendarDays,
  ClipboardList,
  Contact,
  FlaskConical,
  Package,
  Receipt,
  Sparkles,
  Target,
  Warehouse,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/** Sık kullanılan sayfalar — daima aranabilir. */
const PAGES: { label: string; path: string; icon: React.ReactNode; keywords?: string }[] = [
  { label: "Kokpit (Ana Sayfa)", path: "/", icon: <Target className="h-4 w-4" />, keywords: "dashboard özet" },
  { label: "Sipariş Panosu", path: "/siparisler", icon: <ClipboardList className="h-4 w-4" />, keywords: "kanban sipariş" },
  { label: "Teklifler", path: "/teklifler", icon: <ClipboardList className="h-4 w-4" />, keywords: "teklif fiyat teklifi proforma" },
  { label: "Müşteriler", path: "/musteriler", icon: <Contact className="h-4 w-4" />, keywords: "müşteri crm adres" },
  { label: "Giderler", path: "/giderler", icon: <Receipt className="h-4 w-4" />, keywords: "gider masraf" },
  { label: "Stok & Hammadde", path: "/stok", icon: <Warehouse className="h-4 w-4" />, keywords: "stok hammadde" },
  { label: "Ürünler & Türevler", path: "/urunler", icon: <Package className="h-4 w-4" />, keywords: "ürün" },
  { label: "Formül Defteri", path: "/formuller", icon: <FlaskConical className="h-4 w-4" />, keywords: "reçete formül" },
  { label: "Fiyat & Kâr Motoru", path: "/fiyat", icon: <Target className="h-4 w-4" />, keywords: "fiyat kâr marj toplu zam excel maliyet hesaplayıcı" },
  { label: "AI Pazarlama", path: "/pazarlama", icon: <Sparkles className="h-4 w-4" />, keywords: "metin instagram" },
  { label: "Kampanyalar", path: "/kampanyalar", icon: <CalendarDays className="h-4 w-4" />, keywords: "kampanya takvim" },
  { label: "Asistan", path: "/asistan", icon: <Bot className="h-4 w-4" />, keywords: "sohbet komut" },
  { label: "Strateji & Rapor", path: "/strateji", icon: <Target className="h-4 w-4" />, keywords: "rapor kar zarar" },
];

/**
 * Global komut paleti / hızlı arama. ⌘K (Mac) veya Ctrl+K ile açılır.
 * Sayfalar + ürün, sipariş, müşteri ve hammadde kayıtlarında arayıp gider.
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Veriyi yalnızca palet açıkken çek (önbelleğe düşerse anında gelir).
  const { data: products } = trpc.products.list.useQuery(undefined, { enabled: open });
  const { data: orders } = trpc.orders.list.useQuery(undefined, { enabled: open });
  const { data: customers } = trpc.customers.list.useQuery(undefined, { enabled: open });
  const { data: materials } = trpc.materials.list.useQuery(undefined, { enabled: open });

  function go(path: string) {
    setOpen(false);
    setLocation(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Ara: sayfa, ürün, sipariş, müşteri, hammadde…" />
      <CommandList>
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        <CommandGroup heading="Sayfalar">
          {PAGES.map(p => (
            <CommandItem key={p.path} value={`${p.label} ${p.keywords ?? ""}`} onSelect={() => go(p.path)}>
              {p.icon}
              <span className="ml-2">{p.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {(customers ?? []).length > 0 && (
          <CommandGroup heading="Müşteriler">
            {(customers ?? []).slice(0, 8).map(c => (
              <CommandItem key={`c-${c.id}`} value={`müşteri ${c.name} ${c.phone ?? ""} ${c.city ?? ""}`} onSelect={() => go("/musteriler")}>
                <Contact className="h-4 w-4" />
                <span className="ml-2">{c.name}</span>
                {c.phone && <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(orders ?? []).length > 0 && (
          <CommandGroup heading="Siparişler">
            {(orders ?? []).slice(0, 8).map(o => (
              <CommandItem key={`o-${o.id}`} value={`sipariş ${o.orderNo} ${o.customerName}`} onSelect={() => go("/siparisler")}>
                <ClipboardList className="h-4 w-4" />
                <span className="ml-2">{o.customerName}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {o.orderNo} · {formatTL(o.totalAmount)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(products ?? []).length > 0 && (
          <CommandGroup heading="Ürünler">
            {(products ?? []).slice(0, 8).map(p => (
              <CommandItem key={`p-${p.id}`} value={`ürün ${p.name} ${p.series ?? ""} ${p.barcode ?? ""}`} onSelect={() => go("/urunler")}>
                <Package className="h-4 w-4" />
                <span className="ml-2">{p.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatTL(p.salePrice)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(materials ?? []).length > 0 && (
          <CommandGroup heading="Hammaddeler">
            {(materials ?? []).slice(0, 8).map(m => (
              <CommandItem key={`m-${m.id}`} value={`hammadde ${m.name} ${m.category}`} onSelect={() => go("/stok")}>
                <Warehouse className="h-4 w-4" />
                <span className="ml-2">{m.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{m.category}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
