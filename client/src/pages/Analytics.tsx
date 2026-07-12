import { Card } from "@/components/ui/card";
import { formatTL, num } from "@/lib/format";
import { trpc } from "@/lib/trpc";
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
 * Satış Analizi: haftalık ciro trendi, kanal dağılımı, en çok satan ürünler.
 * Renkler doğrulanmış veri-görselleştirme paletinden gelir (CSS değişkenleri,
 * koyu tema için ayrı adımlar).
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

export default function Analytics() {
  const { data } = trpc.report.data.useQuery();

  const model = useMemo(() => {
    if (!data) return null;
    const { orders, orderItems } = data;
    const now = Date.now();
    const day = 86400000;

    // Haftalık ciro (son 12 hafta, pazartesi başlangıçlı kaydırmasız basit kova)
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

    // Son 30 gün
    const recent = orders.filter(o => now - new Date(o.createdAt).getTime() <= 30 * day);
    const revenue30 = recent.reduce((s, o) => s + num(o.totalAmount), 0);
    const avgOrder = recent.length ? revenue30 / recent.length : 0;

    // Kanal dağılımı (son 30 gün)
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

    return { weeks, revenue30, orders30: recent.length, avgOrder, channels, bestChannel, topProducts };
  }, [data]);

  return (
    <div className="viz-root space-y-4">
      <style>{VIZ_CSS}</style>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Satış Analizi</h1>
        <p className="text-sm text-muted-foreground">
          Ciro trendi, kanal dağılımı ve en çok satanlar — veriler sipariş kayıtlarından canlı hesaplanır.
        </p>
      </div>

      {!model ? (
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Ciro (30 gün)" value={formatTL(model.revenue30)} />
            <Kpi label="Sipariş (30 gün)" value={String(model.orders30)} />
            <Kpi label="Ortalama Sipariş" value={formatTL(model.avgOrder)} />
            <Kpi label="En İyi Kanal" value={model.bestChannel} />
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
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--grid)" }}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={v => new Intl.NumberFormat("tr-TR").format(v)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, key: string) =>
                      key === "ciro" ? [formatTL(v), "Ciro"] : [v, "Sipariş"]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="ciro"
                    stroke="var(--series-1)"
                    strokeWidth={2}
                    fill="url(#ciroFill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
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
                    <BarChart
                      data={model.channels}
                      layout="vertical"
                      margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
                      barCategoryGap={8}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={92}
                        tick={{ fill: "var(--ink-2)", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number) => [formatTL(v), "Ciro"]}
                        cursor={{ fill: "var(--grid)", opacity: 0.35 }}
                      />
                      <Bar dataKey="ciro" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={18}>
                        <LabelList
                          dataKey="ciro"
                          position="right"
                          formatter={(v: number) => new Intl.NumberFormat("tr-TR").format(v) + " ₺"}
                          style={{ fill: "var(--ink-2)", fontSize: 11 }}
                        />
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
                    <BarChart
                      data={model.topProducts}
                      layout="vertical"
                      margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
                      barCategoryGap={8}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={170}
                        tick={{ fill: "var(--ink-2)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number, key: string) =>
                          key === "ciro" ? [formatTL(v), "Ciro"] : [v, "Adet"]
                        }
                        cursor={{ fill: "var(--grid)", opacity: 0.35 }}
                      />
                      <Bar dataKey="ciro" fill="var(--series-2)" radius={[0, 4, 4, 0]} barSize={18}>
                        <LabelList
                          dataKey="ciro"
                          position="right"
                          formatter={(v: number) => new Intl.NumberFormat("tr-TR").format(v) + " ₺"}
                          style={{ fill: "var(--ink-2)", fontSize: 11 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold leading-none truncate">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </Card>
  );
}

function Empty() {
  return (
    <p className="text-sm text-muted-foreground py-8 text-center">
      Henüz yeterli sipariş verisi yok — satışlar girildikçe burası dolacak.
    </p>
  );
}
