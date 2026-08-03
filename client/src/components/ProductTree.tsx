import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import VariantCard from "./VariantCard";

/**
 * Ürün ağacı — SERİ → RENK → varyant.
 *
 * Liste düz bir tablodydu: 540 master alt alta, hepsi ayrı satır. Veride
 * ilişki vardı (seriesId, colorId, baseCode) ama ekranda hiç görünmüyordu;
 * "ürünler birbirine bağlı değil" hissi buradan geliyordu.
 *
 * Model şu: bir MASTER = bir fiziksel şişe (renk × form × ambalaj × hazırlık).
 * Stok, reçete, barkod onun. Ama İNSAN bir rengi düşünür — "Açık Mavi"nin
 * 30/100/250/500 ml'si aynı üründür. Ağaç bu iki bakışı birleştirir: renk
 * satırı kapalıyken tek ürün gibi görünür, açılınca varyantları çıkar.
 */

export type TrackRow = {
  masterId: number;
  internalSku: string;
  seriesId: number;
  colorId: number;
  series: string | null;
  family: string | null;
  packaging: string | null;
  colorName: string | null;
  colorHex: string | null;
  readiness: string;
  status: string;
  buildable: number;
  cost: number;
  price: number;
  profit: number;
  health: {
    score: number;
    missing: string[];
    checkCount: number;
    listingCount: number;
    liveCount: number;
  };
  salesMode: "siparis_uzerine" | "stoktan" | "tedarikli";
  leadTimeDays: number;
  stockQty: number;
  /** İlana yazılacak miktar — satış moduna göre hesaplanmış. */
  listingQty: number;
  gtin: string | null;
  /** Elle girilmiş satış adı; boşsa koordinattan türetilir. */
  name: string | null;
  /** Kapak görselinin adresi; yüklenmemişse null. */
  imageUrl: string | null;
  imageId: number | null;
  imageCount: number;
};

/** Satış modu etiketleri; kısa tutuldu, satıra sığması gerekiyor. */
const SALES_MODES = [
  { value: "siparis_uzerine", label: "Sipariş üzerine", hint: "Eldeki hammaddeden üretilebilir adet" },
  { value: "stoktan", label: "Stoktan", hint: "Raftaki mamul adedi — hammaddeye bakılmaz" },
  { value: "tedarikli", label: "Tedarikli", hint: "Hammadde yokken de satışta, termin sözüyle" },
] as const;

export default function ProductTree({
  rows,
  onlyProblem,
}: {
  rows: TrackRow[];
  onlyProblem: boolean;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");

  /*
   * Satış modu satır içinde değiştirilir. Ayrı bir ekrana göndermek, bu
   * kararın alındığı yerden (ürünün neden satılamadığını gördüğün yerden)
   * koparırdı — zaten 5-6 pencere gezme şikayetinin kaynağı bu.
   */
  const setSalesMode = trpc.katalog.setSalesMode.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(`${r.updated} varyantın satış modu güncellendi`);
    },
    onError: e => toast.error(e.message),
  });
  const [openColors, setOpenColors] = useState<Set<string>>(new Set());
  const [openSeries, setOpenSeries] = useState<Set<number>>(new Set());

  const tree = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const filtered = rows.filter(r => {
      if (onlyProblem && r.health.missing.length === 0) return false;
      if (!q) return true;
      return [r.colorName, r.series, r.family, r.packaging, r.internalSku]
        .filter(Boolean)
        .some(v => String(v).toLocaleLowerCase("tr").includes(q));
    });

    const bySeries = new Map<number, { name: string; colors: Map<number, TrackRow[]> }>();
    for (const r of filtered) {
      const s = bySeries.get(r.seriesId) ?? {
        name: r.series ?? `#${r.seriesId}`,
        colors: new Map<number, TrackRow[]>(),
      };
      s.colors.set(r.colorId, [...(s.colors.get(r.colorId) ?? []), r]);
      bySeries.set(r.seriesId, s);
    }

    return Array.from(bySeries, ([seriesId, s]) => ({
      seriesId,
      name: s.name,
      variantCount: Array.from(s.colors.values()).reduce((n, v) => n + v.length, 0),
      colors: Array.from(s.colors, ([colorId, variants]) => ({
        colorId,
        name: variants[0].colorName ?? `#${colorId}`,
        hex: variants[0].colorHex,
        variants: [...variants].sort((a, b) =>
          `${a.family}${a.packaging}${a.readiness}`.localeCompare(
            `${b.family}${b.packaging}${b.readiness}`,
            "tr",
          ),
        ),
        // Renk seviyesindeki özet: en iyi durum değil, GERÇEK durum.
        buildable: variants.reduce((n, v) => n + v.buildable, 0),
        stock: variants.reduce((n, v) => n + v.stockQty, 0),
        listings: variants.reduce((n, v) => n + v.health.listingCount, 0),
        live: variants.reduce((n, v) => n + v.health.liveCount, 0),
        worstScore: Math.min(...variants.map(v => v.health.score)),
        missing: Array.from(new Set(variants.flatMap(v => v.health.missing))),
        // Kaç ÜRÜNDE eksik var — hangi rengi açacağını bu söyler; eksik
        // etiketlerinin birleşimi kaç ürünü ilgilendirdiğini göstermiyordu.
        problemCount: variants.filter(v => v.health.missing.length > 0).length,
      })).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [rows, search, onlyProblem]);

  const totalColors = tree.reduce((n, s) => n + s.colors.length, 0);
  const totalVariants = tree.reduce((n, s) => n + s.variantCount, 0);

  const toggleColor = (key: string) =>
    setOpenColors(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleSeries = (id: number) =>
    setOpenSeries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Renk, seri, ambalaj ya da kod ara…"
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">
          {tree.length} seri · {totalColors} renk · {totalVariants} varyant
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() =>
            setOpenSeries(prev =>
              prev.size === tree.length ? new Set() : new Set(tree.map(s => s.seriesId)),
            )
          }
        >
          {openSeries.size === tree.length ? "Hepsini kapat" : "Hepsini aç"}
        </Button>
      </div>

      {/* Metin tek <p> içinde: Card `flex flex-col gap-6` olduğu için çıplak
          metin düğümleri ve <strong> ayrı flex öğesi olup alt alta kırılıyordu. */}
      <Card className="p-4 text-xs text-muted-foreground">
        <p>
          Bir <strong className="text-foreground">varyant</strong> = bir fiziksel şişe
          (renk × ürün tipi × ambalaj). Stok, reçete ve barkod ona aittir. Renk satırı onları
          toplar; tıklayınca açılır. Aynı varyant birden çok isimle satılabilir — o pazarlama
          kimliğidir, ayrı varyant değil.
        </p>
      </Card>

      {tree.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Eşleşen ürün yok.
        </Card>
      ) : (
        <div className="space-y-2">
          {tree.map(s => {
            const seriesOpen = openSeries.has(s.seriesId);
            return (
              <Card key={s.seriesId} className="overflow-hidden p-0">
                <button
                  onClick={() => toggleSeries(s.seriesId)}
                  className="flex w-full items-center gap-2 border-b bg-muted/40 p-3 text-left hover:bg-muted/60"
                >
                  {seriesOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-semibold">{s.name}</span>
                  <Badge variant="secondary">{s.colors.length} renk</Badge>
                  <Badge variant="outline">{s.variantCount} varyant</Badge>
                </button>

                {seriesOpen && (
                  <div className="divide-y">
                    {s.colors.map(c => {
                      const key = `${s.seriesId}-${c.colorId}`;
                      const open = openColors.has(key);
                      return (
                        <div key={key}>
                          <button
                            onClick={() => toggleColor(key)}
                            className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-accent/40"
                          >
                            {open ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span
                              className="h-6 w-6 shrink-0 rounded border shadow-inner"
                              style={{ backgroundColor: c.hex ?? "#ccc" }}
                            />
                            <span className="font-medium">{c.name}</span>
                            <Badge variant="outline">{c.variants.length} varyant</Badge>
                            {c.listings > 0 && (
                              <Badge variant="secondary">
                                {c.live}/{c.listings} yayında
                              </Badge>
                            )}
                            <span className="ml-auto flex items-center gap-2 text-xs">
                              {/* Hammadde defteri tamamlanana kadar güvenilir
                                  adet elle girilen raf stoğu; kapasite ancak
                                  hesaplanabildiği yerde eklenir. */}
                              <span className={c.stock > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                                {c.stock} adet stok
                              </span>
                              {c.buildable > 0 && (
                                <span className="text-muted-foreground">
                                  +{c.buildable} üretilebilir
                                </span>
                              )}
                              {c.problemCount > 0 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {c.problemCount} üründe eksik
                                </Badge>
                              )}
                            </span>
                          </button>

                          {/* Toplu satış modu: bir rengin 36 varyantını tek tek
                              ayarlamak pratikte yapılmaz, o yüzden renk
                              başlığından hepsine birden uygulanır. */}
                          {open && (
                            <div
                              className="flex flex-wrap items-center gap-1.5 border-t bg-muted/30 px-3 py-1.5 pl-12 text-[11px]"
                              onClick={e => e.stopPropagation()}
                            >
                              <span className="text-muted-foreground">
                                Bu rengin {c.variants.length} varyantını:
                              </span>
                              {SALES_MODES.map(m => (
                                <button
                                  key={m.value}
                                  type="button"
                                  title={m.hint}
                                  disabled={setSalesMode.isPending}
                                  onClick={() =>
                                    setSalesMode.mutate({
                                      masterIds: c.variants.map(v => v.masterId),
                                      salesMode: m.value as never,
                                    })
                                  }
                                  className="rounded-full border px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {!open && c.missing.length > 0 && (
                            <p className="px-3 pb-2 pl-12 text-[11px] text-muted-foreground">
                              {c.missing.slice(0, 3).join(" · ")}
                              {c.missing.length > 3 && ` · +${c.missing.length - 3}`}
                            </p>
                          )}

                          {open && (
                            <div className="space-y-2 bg-muted/20 p-2 pl-4 sm:pl-10">
                              {c.variants.map(v => (
                                <VariantCard key={v.masterId} row={v} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
