import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatQty, formatTL, ORDER_STATUSES } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  ClipboardList,
  Contact,
  ListChecks,
  Package,
  PiggyBank,
  Receipt,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.dashboard.summary.useQuery();

  const statusMap = new Map((data?.statusCounts ?? []).map(s => [s.status, Number(s.count)]));
  const activeOrders =
    (statusMap.get("new") ?? 0) + (statusMap.get("production") ?? 0) + (statusMap.get("ready") ?? 0);
  const finance = data?.finance;
  const netPositive = (finance?.monthNet ?? 0) >= 0;

  // "Bugün ne yapmalı" şeridi: yalnızca aksiyon gerektiren (sıfır olmayan) maddeler.
  const actions: { label: string; count: string; path: string; tone: "rose" | "amber" | "blue" }[] = [];
  const newOrders = statusMap.get("new") ?? 0;
  if (newOrders > 0) actions.push({ label: "yeni sipariş bekliyor", count: String(newOrders), path: "/siparisler", tone: "blue" });
  if ((data?.newQuestions ?? 0) > 0)
    actions.push({ label: "soru cevap bekliyor", count: String(data?.newQuestions), path: "/sorular", tone: "amber" });
  if ((data?.productionQueue ?? 0) > 0)
    actions.push({ label: "ürün üretim bekliyor", count: String(data?.productionQueue), path: "/uretim", tone: "amber" });
  if ((data?.critical?.length ?? 0) > 0)
    actions.push({ label: "hammadde kritik seviyede", count: String(data?.critical?.length), path: "/stok", tone: "rose" });
  if ((finance?.receivables ?? 0) > 0)
    actions.push({ label: "tahsil edilecek", count: formatTL(finance?.receivables ?? 0), path: "/cari", tone: "rose" });

  // Zamanlayıcı sağlığı: iz 30 dk'dan eskiyse otomasyon durmuş demektir (Render uykusu).
  const lastTick = data?.schedulerLastTickAt ?? 0;
  const tickAgeMin = lastTick > 0 ? Math.round((Date.now() - lastTick) / 60000) : null;
  const schedulerStale = !data?.schedulerDisabled && (tickAgeMin === null || tickAgeMin > 30);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kokpit</h1>
          <p className="text-sm text-muted-foreground">
            İşletmenizin günlük durumu tek bakışta.
          </p>
        </div>
        {!isLoading && (
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              data?.schedulerDisabled
                ? "text-muted-foreground"
                : schedulerStale
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
            }`}
            title={
              data?.schedulerDisabled
                ? "SCHEDULER_DISABLED=1 — otomasyon bilinçli kapalı"
                : schedulerStale
                  ? "Otomatik senkron/brifing/nöbetçiler çalışmıyor. Render uykuda olabilir — /api/health'e uptime monitörü kurun (cron-job.org, 10 dk)."
                  : `Son çalışma: ${tickAgeMin} dk önce`
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                data?.schedulerDisabled ? "bg-muted-foreground/50" : schedulerStale ? "bg-rose-500" : "bg-emerald-500"
              }`}
            />
            {data?.schedulerDisabled
              ? "Otomasyon kapalı"
              : schedulerStale
                ? "Otomasyon durmuş — monitör kurun"
                : "Otomasyon çalışıyor"}
          </div>
        )}
      </div>

      {/* Bugün ne yapmalı — aksiyon şeridi */}
      {!isLoading && actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map(a => (
            <button
              key={a.label}
              onClick={() => setLocation(a.path)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                a.tone === "rose"
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                  : a.tone === "amber"
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400"
              }`}
            >
              <span className="font-bold">{a.count}</span> {a.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="Bugünkü Sipariş"
          value={isLoading ? "..." : String(data?.today?.count ?? 0)}
          sub={isLoading ? "" : formatTL(data?.today?.total ?? 0)}
          color="text-blue-600 bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="Aktif Sipariş"
          value={isLoading ? "..." : String(activeOrders)}
          sub="Yeni + Üretimde + Hazır"
          color="text-amber-600 bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Kritik Stok"
          value={isLoading ? "..." : String(data?.critical?.length ?? 0)}
          sub="Eşik altındaki malzeme"
          color="text-rose-600 bg-rose-50 dark:bg-rose-950/40"
        />
        <StatCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Yaklaşan Kampanya"
          value={isLoading ? "..." : String(data?.upcoming?.length ?? 0)}
          sub="Önümüzdeki 30 gün"
          color="text-violet-600 bg-violet-50 dark:bg-violet-950/40"
        />
      </div>

      {/* Finans özeti */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button className="text-left" onClick={() => setLocation("/siparisler")}>
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Tahsil Edilecek"
            value={isLoading ? "..." : formatTL(finance?.receivables ?? 0)}
            sub="Bekleyen + kısmi ödemeler"
            color="text-rose-600 bg-rose-50 dark:bg-rose-950/40"
          />
        </button>
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="Bu Ay Ciro"
          value={isLoading ? "..." : formatTL(finance?.monthRevenue ?? 0)}
          sub="Bu ayki siparişler"
          color="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
        />
        <button className="text-left" onClick={() => setLocation("/giderler")}>
          <StatCard
            icon={<TrendingDown className="h-5 w-5" />}
            label="Bu Ay Gider"
            value={isLoading ? "..." : formatTL(finance?.monthExpense ?? 0)}
            sub="Giderler + alış faturaları"
            color="text-amber-600 bg-amber-50 dark:bg-amber-950/40"
          />
        </button>
        <button className="text-left" onClick={() => setLocation("/kasa")}>
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Kasa/Banka"
            value={isLoading ? "..." : formatTL(finance?.cashTotal ?? 0)}
            sub="Toplam nakit + banka"
            color="text-blue-600 bg-blue-50 dark:bg-blue-950/40"
          />
        </button>
        <StatCard
          icon={<PiggyBank className="h-5 w-5" />}
          label="Bu Ay Net"
          value={isLoading ? "..." : formatTL(finance?.monthNet ?? 0)}
          sub={netPositive ? "Ciro − gider" : "Zarar (ciro − gider)"}
          color={
            netPositive
              ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
              : "text-rose-600 bg-rose-50 dark:bg-rose-950/40"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sipariş durum dağılımı */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sipariş Durumları</h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/siparisler")}>
              Panoya Git <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {ORDER_STATUSES.map(s => (
              <div key={s.value} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                <span className="text-sm flex-1">{s.label}</span>
                <span className="font-semibold">{statusMap.get(s.value) ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Kritik stok */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Kritik Stok Uyarıları
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/stok")}>
              Stoğa Git <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          {(data?.critical ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Tüm stoklar yeterli seviyede. 👍
            </p>
          ) : (
            <div className="space-y-2">
              {(data?.critical ?? []).slice(0, 5).map(m => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{m.name}</span>
                  <Badge variant="secondary">{m.category}</Badge>
                  <span className="font-medium text-amber-600 whitespace-nowrap">
                    {formatQty(m.stockQty)} {m.unit}
                  </span>
                </div>
              ))}
              {(data?.critical ?? []).length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{(data?.critical ?? []).length - 5} malzeme daha...
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Bekleyen tahsilatlar */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-rose-500" /> Bekleyen Tahsilatlar
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/siparisler")}>
              Siparişlere Git <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          {(data?.unpaid ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Bekleyen tahsilat yok. 💰
            </p>
          ) : (
            <div className="space-y-2">
              {(data?.unpaid ?? []).map(o => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{o.customerName}</span>
                  <span className="text-[11px] text-muted-foreground">{o.orderNo}</span>
                  <span className="font-semibold text-rose-600 whitespace-nowrap">{formatTL(o.due)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Yaklaşan kampanyalar */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-violet-500" /> Yaklaşan Kampanyalar
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/kampanyalar")}>
              Takvime Git <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          {(data?.upcoming ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Önümüzdeki 30 günde planlı kampanya yok.
            </p>
          ) : (
            <div className="space-y-2">
              {(data?.upcoming ?? []).slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate font-medium">{c.name}</span>
                  {c.productGroup && <Badge variant="outline">{c.productGroup}</Badge>}
                  <span className="text-muted-foreground whitespace-nowrap text-xs">
                    {formatDate(c.startDate)} – {formatDate(c.endDate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Görevler & eksik listesi */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-emerald-600" /> Görevler & Eksikler
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/gorevler")}>
              Listeye Git <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          {(data?.openTasks ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Açık görev ve eksik yok. 🎉
            </p>
          ) : (
            <div className="space-y-2">
              {(data?.openTasks ?? []).slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  {t.kind === "eksik" ? (
                    <ShoppingBasket className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <ListChecks className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{t.title}</span>
                  <Badge variant="outline">{t.kind === "eksik" ? "alınacak" : "görev"}</Badge>
                </div>
              ))}
              {(data?.openTasks ?? []).length > 6 && (
                <p className="text-xs text-muted-foreground">
                  +{(data?.openTasks ?? []).length - 6} madde daha...
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Hızlı erişim */}
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Hızlı Erişim</h2>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction
              icon={<ClipboardList className="h-4 w-4" />}
              label="Siparişler"
              onClick={() => setLocation("/siparisler")}
            />
            <QuickAction
              icon={<Package className="h-4 w-4" />}
              label="Ürünler"
              onClick={() => setLocation("/urunler")}
            />
            <QuickAction
              icon={<Contact className="h-4 w-4" />}
              label="Müşteriler"
              onClick={() => setLocation("/musteriler")}
            />
            <QuickAction
              icon={<Receipt className="h-4 w-4" />}
              label="Giderler"
              onClick={() => setLocation("/giderler")}
            />
            <QuickAction
              icon={<Sparkles className="h-4 w-4" />}
              label="AI Pazarlama"
              onClick={() => setLocation("/pazarlama")}
            />
            <QuickAction
              icon={<TrendingUp className="h-4 w-4" />}
              label="Fiyat & Kâr"
              onClick={() => setLocation("/fiyat")}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/70">{sub}</p>}
      </div>
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
