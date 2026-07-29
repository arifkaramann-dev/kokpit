import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatTL } from "@/lib/format";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

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
  health: { score: number; missing: string[]; listingCount: number; liveCount: number };
};

export default function ProductTree({
  rows,
  onlyProblem,
}: {
  rows: TrackRow[];
  onlyProblem: boolean;
}) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
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
        listings: variants.reduce((n, v) => n + v.health.listingCount, 0),
        live: variants.reduce((n, v) => n + v.health.liveCount, 0),
        worstScore: Math.min(...variants.map(v => v.health.score)),
        missing: Array.from(new Set(variants.flatMap(v => v.health.missing))),
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

      <Card className="p-4 text-xs text-muted-foreground">
        Bir <strong className="text-foreground">varyant</strong> = bir fiziksel şişe
        (renk × form × ambalaj × hazırlık). Stok, reçete ve barkod ona aittir. Renk satırı
        onları toplar; tıklayınca açılır.
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
                              <span
                                className={
                                  c.buildable > 0 ? "text-emerald-600" : "text-destructive"
                                }
                              >
                                {c.buildable} üretilebilir
                              </span>
                              <Badge
                                variant={c.worstScore >= 90 ? "secondary" : "destructive"}
                                className="text-[10px]"
                              >
                                %{c.worstScore}
                              </Badge>
                            </span>
                          </button>

                          {!open && c.missing.length > 0 && (
                            <p className="px-3 pb-2 pl-12 text-[11px] text-muted-foreground">
                              {c.missing.slice(0, 3).join(" · ")}
                              {c.missing.length > 3 && ` · +${c.missing.length - 3}`}
                            </p>
                          )}

                          {open && (
                            <div className="overflow-x-auto bg-muted/20">
                              <table className="w-full text-sm">
                                <thead className="text-xs text-muted-foreground">
                                  <tr>
                                    <th className="p-2 pl-12 text-left">Varyant</th>
                                    <th className="p-2 text-right">Üretilebilir</th>
                                    <th className="p-2 text-right">Maliyet</th>
                                    <th className="p-2 text-right">Fiyat</th>
                                    <th className="p-2 text-right">Kâr</th>
                                    <th className="p-2 text-right">İlan</th>
                                    <th className="p-2 text-left">Eksik</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.variants.map(v => (
                                    <tr
                                      key={v.masterId}
                                      className="cursor-pointer border-t hover:bg-accent/40"
                                      onClick={() => setLocation(`/urun/${v.masterId}`)}
                                    >
                                      <td className="p-2 pl-12">
                                        <span className="font-medium">
                                          {v.family} · {v.packaging}
                                        </span>
                                        {v.readiness === "r2u" && (
                                          <Badge variant="secondary" className="ml-1.5 text-[10px]">
                                            r2u
                                          </Badge>
                                        )}
                                        <span className="block font-mono text-[10px] text-muted-foreground">
                                          {v.internalSku}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right">
                                        <span
                                          className={
                                            v.buildable > 0 ? undefined : "text-destructive"
                                          }
                                        >
                                          {v.buildable}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right">
                                        {v.cost > 0 ? formatTL(v.cost) : "—"}
                                      </td>
                                      <td className="p-2 text-right">
                                        {v.price > 0 ? formatTL(v.price) : "—"}
                                      </td>
                                      <td className="p-2 text-right">
                                        {v.price > 0 ? formatTL(v.profit) : "—"}
                                      </td>
                                      <td className="p-2 text-right">
                                        {v.health.liveCount}/{v.health.listingCount}
                                      </td>
                                      <td className="p-2 text-[11px] text-muted-foreground">
                                        {v.health.missing.slice(0, 2).join(" · ") || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
