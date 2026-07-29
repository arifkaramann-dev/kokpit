import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatQty, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

/**
 * Getiri paneli — "hangi renk para kazandırıyor?"
 *
 * Sağlık karnesi EKSİKLERİ söylüyordu (reçetesi yok, görseli yok, yayında
 * değil); getiriler hiçbir yerde yoktu. Üretim önceliği ve renk emekliliği
 * kararı hisle veriliyordu.
 *
 * Maliyet BUGÜNKÜ maliyettir, satış anındaki değil (hammadde fiyatı geçmişe
 * dönük saklanmıyor). Eğilim için doğru, muhasebe için değil — panelde de
 * böyle yazar ki karıştırılmasın.
 */

const WINDOWS = [
  { days: 30, label: "30 gün" },
  { days: 90, label: "90 gün" },
  { days: 365, label: "1 yıl" },
  { days: 0, label: "Tümü" },
];

export default function CatalogRevenue() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = trpc.katalog.revenue.useQuery({ days });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!data) return null;

  const totalRevenue = data.masters.reduce((s, m) => s + m.revenue, 0);
  const totalProfit = data.masters.reduce((s, m) => s + m.profit, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map(w => (
          <Button
            key={w.days}
            size="sm"
            variant={days === w.days ? "default" : "outline"}
            onClick={() => setDays(w.days)}
          >
            {w.label}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          Ciro {formatTL(totalRevenue)} · Brüt kâr {formatTL(totalProfit)}
        </span>
      </div>

      {data.unboundItemCount > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {data.unboundItemCount} sipariş satırı bir ürüne bağlı değil — bu satışlar rakamlara
            girmiyor.
          </span>
        </Card>
      )}

      <Card className="p-4 text-xs text-muted-foreground">
        Maliyet <strong className="text-foreground">bugünkü</strong> hammadde fiyatlarıyla
        hesaplanır, satış anındakiyle değil. Eğilim ve sıralama için doğrudur; muhasebe kaydı
        yerine geçmez.
      </Card>

      {data.series.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            Seri bazında
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seri</TableHead>
                <TableHead className="text-right">Adet</TableHead>
                <TableHead className="text-right">Ciro</TableHead>
                <TableHead className="text-right">Brüt kâr</TableHead>
                <TableHead className="text-right">Marj</TableHead>
                <TableHead className="text-right">Ürün</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.series.map(s => (
                <TableRow key={s.seriesId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right">{formatQty(s.qty)}</TableCell>
                  <TableCell className="text-right">{formatTL(s.revenue)}</TableCell>
                  <TableCell className="text-right">{formatTL(s.profit)}</TableCell>
                  <TableCell className="text-right">%{s.marginPercent}</TableCell>
                  <TableCell className="text-right">{s.masterCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          En çok kazandıran ürünler
        </div>
        {data.masters.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Bu dönemde bağlı satış yok.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Adet</TableHead>
                <TableHead className="text-right">Sipariş</TableHead>
                <TableHead className="text-right">Ciro</TableHead>
                <TableHead className="text-right">Brüt kâr</TableHead>
                <TableHead className="text-right">Marj</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.masters.slice(0, 30).map(m => (
                <TableRow key={m.masterId}>
                  <TableCell>
                    <Link href={`/urun/${m.masterId}`} className="font-medium hover:underline">
                      {m.label || `#${m.masterId}`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{formatQty(m.qty)}</TableCell>
                  <TableCell className="text-right">{m.orderCount}</TableCell>
                  <TableCell className="text-right">{formatTL(m.revenue)}</TableCell>
                  <TableCell className="text-right">
                    <span className={m.profit < 0 ? "text-destructive" : undefined}>
                      {formatTL(m.profit)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">%{m.marginPercent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data.dead.length > 0 && (
        <Card className="space-y-2 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            Ölü renkler
            <Badge variant="outline">{data.dead.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Aktif ama bu dönemde hiç satmamış ürünler. Sermaye bağlıyorlar — arşive alınabilir ya
            da pazarlaması güçlendirilebilir.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.dead.slice(0, 60).map(d => (
              <Link key={d.masterId} href={`/urun/${d.masterId}`}>
                <Badge variant="secondary" className="cursor-pointer">
                  {d.label || `#${d.masterId}`}
                  {d.daysSinceSale != null && (
                    <span className="ml-1 opacity-60">{d.daysSinceSale}g</span>
                  )}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
