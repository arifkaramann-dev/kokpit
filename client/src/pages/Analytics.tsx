import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTL, num } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { customerInsights, normalizeName, productProfitability } from "@shared/analytics";
import { AlertTriangle, MessageCircle, Moon, TrendingUp, Trophy, Users } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * İş Zekâsı: satış trendleri (ciro), ürün kârlılığı (ciro − reçete/ambalaj/kargo
 * maliyeti) ve müşteri zekâsı (en değerli + uykuda müşteriler). Kâr ve müşteri
 * hesapları @shared/analytics içindeki test edilmiş saf fonksiyonlardan gelir.
 */

const VIZ_CSS = `
.viz-root {
  --series-1: #2a78d6;
  --series-1-soft: #9ec5f4;
  --series-2: #1baf7a;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
}
.dark .viz-root {
  --series-1: #3987e5;
  --series-1-soft: #1c5cab;
  --series-2: #199e70;
  --ink: #ffffff;
  --ink-2: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
}
`;

const tooltipStyle = {
  backgroundColor: "var(--card, #fff)",
  border: "1px solid var(--grid)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink)",
};

function weekLabel(d: Date) {
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

const PROFIT_WINDOW_DAYS = 90;
const SLEEPING_DAYS = 60;

export default function Analytics() {
  const { data } = trpc.report.data.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  const model = useMemo(() => {
    if (!data) return null;
    const { orders, orderItems, expenses } = data;
    const now = Date.now();
    const day = 86400000;

    // Haftalık ciro (son 12 hafta)
    const weeks: { label: string; ciro: number; siparis: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = now - (i + 1) * 7 * day;
      const end = now - i * 7 * day;
      const inWeek = orders.filter(o => {
        const t = new Date(o.createdAt).getTime();
        return t >= start && t < end;
      });
      weeks.push({
        label: weekLabel(new Date(start)),
        ciro: Math.round(inWeek.reduce((s, o) => s + num(o.totalAmount), 0)),
        siparis: inWeek.length,
      });
    }

    const recent = orders.filter(o => now - new Date(o.createdAt).getTime() <= 30 * day);
    const revenue30 = recent.reduce((s, o) => s + num(o.totalAmount), 0);
    const avgOrder = recent.length ? revenue30 / recent.length : 0;

    const chMap = new Map<string, number>();
    for (const o of recent) {
      const ch = o.channel || "diğer";
      chMap.set(ch, (chMap.get(ch) ?? 0) + num(o.totalAmount));
    }
    const channels = Array.from(chMap.entries())
      .map(([name, ciro]) => ({ name, ciro: Math.round(ciro) }))
      .sort((a, b) => b.ciro - a.ciro)
      .slice(0, 6);
    const bestChannel = channels[0]?.name ?? "-";

    // En çok satan ürünler (son 90 gün, ciroya göre)
    const orderDate = new Map(orders.map(o => [o.id, new Date(o.createdAt).getTime()]));
    const prodMap = new Map<string, { ciro: number; adet: number }>();
    for (const it of orderItems) {
      const t = orderDate.get(it.orderId);
      if (!t || now - t > 90 * day) continue;
      const cur = prodMap.get(it.productName) ?? { ciro: 0, adet: 0 };
      cur.ciro += num(it.quantity) * num(it.unitPrice);
      cur.adet += num(it.quantity);
      prodMap.set(it.productName, cur);
    }
    const topProducts = Array.from(prodMap.entries())
      .map(([name, v]) => ({
        name: name.length > 28 ? name.slice(0, 27) + "…" : name,
        ciro: Math.round(v.ciro),
        adet: v.adet,
      }))
      .sort((a, b) => b.ciro - a.ciro)
      .slice(0, 5);

    const expense30 = (expenses ?? [])
      .filter(e => now - new Date(e.expenseDate).getTime() <= 30 * day)
      .reduce((s, e) => s + num(e.amount), 0);
    const net30 = revenue30 - expense30;
    const receivables = orders
      .filter(o => o.paymentStatus !== "paid")
      .reduce((s, o) => s + Math.max(0, num(o.totalAmount) - num(o.paidAmount)), 0);

    // Kârlılık & müşteri zekâsı (test edilmiş saf motordan)
    const profit = productProfitability(
      { products: data.products, formulas: data.formulas, orders, orderItems },
      { sinceDays: PROFIT_WINDOW_DAYS, now },
    );
    const cust = customerInsights(orders, { now, sleepingDays: SLEEPING_DAYS });

    return {
      weeks, revenue30, orders30: recent.length, avgOrder, channels, bestChannel,
      topProducts, expense30, net30, receivables, profit, cust,
    };
  }, [data]);

  const phoneByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers ?? []) {
      if (c.phone) m.set(normalizeName(c.name), c.phone);
    }
    return m;
  }, [customers]);

  return (
    <div className="viz-root space-y-4">
      <style>{VIZ_CSS}</style>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">İş Zekâsı</h1>
        <p className="text-sm text-muted-foreground">
          Satış trendleri, ürün kârlılığı ve müşteri değeri — hepsi sipariş kayıtlarından canlı hesaplanır.
        </p>
      </div>

      {!model ? (
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      ) : (
        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Satış
            </TabsTrigger>
            <TabsTrigger value="profit" className="gap-1.5">
              <Trophy className="h-3.5 w-3.5" /> Kârlılık
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Müşteriler
            </TabsTrigger>
          </TabsList>

          {/* ------------------------- SATIŞ ------------------------- */}
          <TabsContent value="sales" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Ciro (30 gün)" value={formatTL(model.revenue30)} />
              <Kpi label="Sipariş (30 gün)" value={String(model.orders30)} />
              <Kpi label="Ortalama Sipariş" value={formatTL(model.avgOrder)} />
              <Kpi label="En İyi Kanal" value={model.bestChannel} />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Gider (30 gün)" value={formatTL(model.expense30)} />
              <Kpi label="Net (30 gün)" value={formatTL(model.net30)} />
              <Kpi label="Tahsil Edilecek" value={formatTL(model.receivables)} />
              <Kpi label="Kâr Marjı" value={model.revenue30 > 0 ? `%${Math.round((model.net30 / model.revenue30) * 100)}` : "-"} />
            </div>

            <Card className="p-5 space-y-2">
              <h2 className="font-semibold">Haftalık Ciro — son 12 hafta</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={model.weeks} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ciroFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--grid)" }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={v => new Intl.NumberFormat("tr-TR").format(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, key: string) => (key === "ciro" ? [formatTL(v), "Ciro"] : [v, "Sipariş"])} />
                    <Area type="monotone" dataKey="ciro" stroke="var(--series-1)" strokeWidth={2} fill="url(#ciroFill)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-5 space-y-2">
                <h2 className="font-semibold">Kanal Dağılımı — son 30 gün ciro</h2>
                {model.channels.length === 0 ? (
                  <Empty />
                ) : (
                  <div style={{ height: Math.max(160, model.channels.length * 44) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={model.channels} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }} barCategoryGap={8}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={92} tick={{ fill: "var(--ink-2)", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatTL(v), "Ciro"]} cursor={{ fill: "var(--grid)", opacity: 0.35 }} />
                        <Bar dataKey="ciro" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={18}>
                          <LabelList dataKey="ciro" position="right" formatter={(v: number) => new Intl.NumberFormat("tr-TR").format(v) + " ₺"} style={{ fill: "var(--ink-2)", fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="p-5 space-y-2">
                <h2 className="font-semibold">En Çok Satanlar — son 90 gün ciro</h2>
                {model.topProducts.length === 0 ? (
                  <Empty />
                ) : (
                  <div style={{ height: Math.max(160, model.topProducts.length * 48) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={model.topProducts} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }} barCategoryGap={8}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={170} tick={{ fill: "var(--ink-2)", fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, key: string) => (key === "ciro" ? [formatTL(v), "Ciro"] : [v, "Adet"])} cursor={{ fill: "var(--grid)", opacity: 0.35 }} />
                        <Bar dataKey="ciro" fill="var(--series-2)" radius={[0, 4, 4, 0]} barSize={18}>
                          <LabelList dataKey="ciro" position="right" formatter={(v: number) => new Intl.NumberFormat("tr-TR").format(v) + " ₺"} style={{ fill: "var(--ink-2)", fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* ------------------------- KÂRLILIK ------------------------- */}
          <TabsContent value="profit" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label={`Toplam Kâr (${PROFIT_WINDOW_DAYS} gün)`} value={formatTL(model.profit.summary.totalProfit)} accent={model.profit.summary.totalProfit >= 0 ? "pos" : "neg"} />
              <Kpi
                label="Kâr Marjı"
                value={model.profit.summary.matchedRevenue > 0 ? `%${Math.round((model.profit.summary.totalProfit / model.profit.summary.matchedRevenue) * 100)}` : "-"}
              />
              <Kpi label="Maliyet Kapsamı" value={`%${Math.round(model.profit.summary.coverage * 100)}`} />
              <Kpi label="Zarar/Düşük Marj" value={String(model.profit.lowMargin.length)} accent={model.profit.lowMargin.length > 0 ? "neg" : undefined} />
            </div>

            {model.profit.summary.coverage < 0.999 && model.profit.summary.unmatchedRevenue > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                Son {PROFIT_WINDOW_DAYS} günün {formatTL(model.profit.summary.unmatchedRevenue)} cirosunun maliyeti bilinmiyor —
                sipariş kalemindeki ürün adı bir ürünle (reçete) eşleşmiyor. Kâr rakamları maliyeti bilinen satışlara göredir.
              </p>
            )}

            {model.profit.lowMargin.length > 0 && (
              <Card className="p-5 space-y-3 border-rose-200 dark:border-rose-900/50">
                <h2 className="font-semibold flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" /> Fiyatı Gözden Geçir — Zarar / Düşük Marj
                </h2>
                <p className="text-xs text-muted-foreground -mt-1">
                  Bu ürünler satılıyor ama marjı %{15} altında ya da zarar ediyor. Satış fiyatını, indirimi ya da maliyeti gözden geçir.
                </p>
                <ProfitTable rows={model.profit.lowMargin.slice(0, 10)} />
              </Card>
            )}

            <Card className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> En Kârlı Ürünler — son {PROFIT_WINDOW_DAYS} gün
              </h2>
              {model.profit.rows.filter(r => r.matched).length === 0 ? (
                <Empty />
              ) : (
                <ProfitTable rows={model.profit.rows.filter(r => r.matched).slice(0, 12)} />
              )}
            </Card>
          </TabsContent>

          {/* ------------------------- MÜŞTERİLER ------------------------- */}
          <TabsContent value="customers" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Toplam Müşteri" value={String(model.cust.totalCustomers)} />
              <Kpi label="Aktif" value={String(model.cust.activeCustomers)} accent="pos" />
              <Kpi label="Uykuda" value={String(model.cust.sleeping.length)} accent={model.cust.sleeping.length > 0 ? "neg" : undefined} />
              <Kpi label="Bu Ay Yeni" value={String(model.cust.newThisMonth.length)} />
            </div>

            {model.cust.sleeping.length > 0 && (
              <Card className="p-5 space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-500" /> Uykuda Müşteriler — {SLEEPING_DAYS}+ gündür sessiz
                </h2>
                <p className="text-xs text-muted-foreground -mt-1">
                  En değerli müşterilerin başta. Tek tıkla WhatsApp'tan geri kazan.
                </p>
                <div className="divide-y">
                  {model.cust.sleeping.slice(0, 12).map(c => {
                    const phone = phoneByName.get(normalizeName(c.name));
                    return (
                      <div key={c.name} className="flex items-center gap-3 py-2 text-sm">
                        <span className="flex-1 truncate font-medium">{c.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap text-xs">{c.daysSinceLast} gün önce</span>
                        <span className="font-semibold whitespace-nowrap w-24 text-right">{formatTL(c.totalSpent)}</span>
                        {phone ? (
                          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/50 dark:hover:bg-emerald-950/30">
                            <a
                              href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(reminderText(c.name))}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle className="h-3 w-3" /> Hatırlat
                            </a>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground w-[84px] text-right">telefon yok</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> En Değerli Müşteriler
              </h2>
              {model.cust.top.length === 0 ? (
                <Empty />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 font-medium">Müşteri</th>
                        <th className="py-2 font-medium text-right">Sipariş</th>
                        <th className="py-2 font-medium text-right">Toplam Harcama</th>
                        <th className="py-2 font-medium text-right">Alacak</th>
                        <th className="py-2 font-medium text-right">Son Sipariş</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {model.cust.top.slice(0, 15).map(c => (
                        <tr key={c.name}>
                          <td className="py-2 pr-2">
                            <span className="font-medium">{c.name}</span>
                            {c.channels.length > 0 && (
                              <Badge variant="outline" className="ml-2 text-[10px]">{c.channels[0]}</Badge>
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">{c.orderCount}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{formatTL(c.totalSpent)}</td>
                          <td className="py-2 text-right tabular-nums">{c.outstanding > 0 ? <span className="text-rose-600">{formatTL(c.outstanding)}</span> : "—"}</td>
                          <td className="py-2 text-right text-muted-foreground text-xs whitespace-nowrap">{c.daysSinceLast} gün önce</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function reminderText(name: string) {
  const first = name.split(" ")[0] || name;
  return `Merhaba ${first}, Art of Colour'dan selamlar! 🎨 Bir süredir siparişiniz yok, sizi özledik. Yeni renklerimiz ve kampanyalarımız için yazabilirsiniz.`;
}

function ProfitTable({ rows }: { rows: import("@shared/analytics").ProfitRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="py-2 font-medium">Ürün</th>
            <th className="py-2 font-medium text-right">Adet</th>
            <th className="py-2 font-medium text-right">Ciro</th>
            <th className="py-2 font-medium text-right">Maliyet</th>
            <th className="py-2 font-medium text-right">Kâr</th>
            <th className="py-2 font-medium text-right">Marj</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(r => {
            const loss = (r.profit ?? 0) < 0;
            return (
              <tr key={r.name}>
                <td className="py-2 pr-2 max-w-[220px] truncate font-medium" title={r.name}>{r.name}</td>
                <td className="py-2 text-right tabular-nums">{Math.round(r.qty)}</td>
                <td className="py-2 text-right tabular-nums">{formatTL(r.revenue)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{formatTL(r.cost ?? 0)}</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${loss ? "text-rose-600" : "text-emerald-600"}`}>{formatTL(r.profit ?? 0)}</td>
                <td className={`py-2 text-right tabular-nums ${loss ? "text-rose-600" : (r.margin ?? 0) < 15 ? "text-amber-600" : ""}`}>
                  {r.margin === null ? "—" : `%${Math.round(r.margin)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-emerald-600" : accent === "neg" ? "text-rose-600" : "";
  return (
    <Card className="p-4">
      <p className={`text-2xl font-bold leading-none truncate ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </Card>
  );
}

function Empty() {
  return (
    <p className="text-sm text-muted-foreground py-8 text-center">
      Henüz yeterli veri yok — satışlar ve reçeteler girildikçe burası dolacak.
    </p>
  );
}
