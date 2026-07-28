import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  HelpCircle,
  Package,
  Printer,
  ShoppingCart,
} from "lucide-react";
import { useLocation } from "wouter";

/**
 * Üretim Brifingi — günlük döngünün ana ekranı.
 *
 * Sipariş gelince sistem eskiden hiçbir şey söylemiyordu; içerik dökümü yalnız
 * ad ve adet basıyordu. Bu ekran üç soruyu sırayla cevaplar:
 *   1) Ne üreteceğim?      (renk + ambalaj ile — boyada üretilecek şey tam olarak o)
 *   2) Neyim eksik?        (çok seviyeli reçeteden patlatılmış hammadde/ambalaj)
 *   3) Önce ne yapmalıyım? (yarı mamul üretim adımları)
 */
export default function Briefing() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.katalog.briefing.useQuery({ orderIds: [] });

  const plan = data?.plan;
  const hazir = plan?.canProduce === true && (data?.demand.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Üretim Brifingi</h1>
          <p className="text-sm text-muted-foreground">
            Açık siparişler için ne üretileceği, neyin eksik olduğu ve hangi yarı mamulün önce
            hazırlanması gerektiği.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/siparisler")}>
          <ShoppingCart className="mr-1 h-4 w-4" /> Sipariş Panosu
        </Button>
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}

      {!isLoading && (data?.orders.length ?? 0) === 0 && (
        <Card className="space-y-2 p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="font-medium">Açık sipariş yok</p>
          <p className="text-sm text-muted-foreground">
            Yeni veya üretimdeki sipariş olduğunda burada üretim listesi ve eksik malzeme dökümü
            görünür.
          </p>
        </Card>
      )}

      {!isLoading && (data?.orders.length ?? 0) > 0 && (
        <>
          {/* Karar şeridi */}
          <Card
            className={`flex flex-wrap items-center gap-3 border-2 p-4 ${
              hazir
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
            }`}
          >
            {hazir ? (
              <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 shrink-0 text-amber-600" />
            )}
            <div className="flex-1">
              <p className="font-semibold">
                {hazir
                  ? "Tüm malzeme var — üretime geçebilirsiniz"
                  : `${plan?.shortages.length ?? 0} kalem eksik`}
              </p>
              <p className="text-sm text-muted-foreground">
                {data?.orders.length} açık sipariş · {data?.demand.length} farklı ürün ·{" "}
                {data?.demand.reduce((s, d) => s + d.qty, 0)} adet
              </p>
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Yazdır
            </Button>
          </Card>

          {/* Eşleşmeyen satırlar — sessizce düşmemeli */}
          {(data?.unmatched.length ?? 0) > 0 && (
            <Card className="space-y-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-medium">
                  {data?.unmatched.length} sipariş satırı katalogla eşleşmedi
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Bu ürünler için master kaydı yok ya da ilan başlığı katalogdakinden çok farklı.
                Üretim listesine dahil edilmediler.
              </p>
              <div className="space-y-0.5">
                {data?.unmatched.map(u => (
                  <div key={u.id} className="text-xs">
                    <span className="tabular-nums font-medium">{u.quantity}×</span> {u.productName}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 1 — Ne üretilecek */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <Package className="h-4 w-4 text-primary" />
              <p className="font-semibold">Üretim Listesi</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Renk</th>
                    <th className="p-2 text-left">Ürün</th>
                    <th className="p-2 text-left">Ambalaj</th>
                    <th className="p-2 text-right">Adet</th>
                    <th className="p-2 text-right">Kapasite</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.demand.map(d => (
                    <tr key={d.masterId} className="border-t">
                      <td className="p-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-5 w-5 shrink-0 rounded border shadow-inner"
                            style={{ backgroundColor: d.colorHex ?? "#ccc" }}
                            title={d.colorName ?? ""}
                          />
                          <span className="truncate">{d.colorName ?? "—"}</span>
                        </span>
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{d.series ?? "—"}</span>
                        <span className="text-muted-foreground"> · {d.family ?? "—"}</span>
                        {d.readiness === "r2u" && (
                          <Badge variant="secondary" className="ml-1.5 text-[10px]">
                            r2u
                          </Badge>
                        )}
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          {d.internalSku}
                        </span>
                      </td>
                      <td className="p-2">{d.packaging ?? "—"}</td>
                      <td className="p-2 text-right text-base font-semibold tabular-nums">{d.qty}</td>
                      <td className="p-2 text-right tabular-nums">
                        {d.buildable >= d.qty ? (
                          <span className="text-emerald-600">{d.buildable}</span>
                        ) : (
                          <span className="font-medium text-rose-600">{d.buildable}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 2 — Önce üretilecek yarı mamuller */}
          {(plan?.steps.length ?? 0) > 0 && (
            <Card className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <p className="font-semibold">Önce Bunları Hazırlayın</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Eldeki stok düşüldü — yalnız eksik kalan miktar yazıyor.
              </p>
              <div className="space-y-1">
                {plan?.steps.map(s => (
                  <div
                    key={s.materialId}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="tabular-nums">{formatQty(s.produceQty)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 3 — Malzeme dökümü */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <ClipboardList className="h-4 w-4 text-primary" />
              <p className="font-semibold">Malzeme İhtiyacı</p>
              {(plan?.shortages.length ?? 0) > 0 && (
                <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  {plan?.shortages.length} eksik
                </Badge>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Kalem</th>
                    <th className="p-2 text-left">Tür</th>
                    <th className="p-2 text-right">Gereken</th>
                    <th className="p-2 text-right">Elde</th>
                    <th className="p-2 text-right">Eksik</th>
                  </tr>
                </thead>
                <tbody>
                  {plan?.needs.map(n => (
                    <tr key={n.materialId} className={`border-t ${n.missing > 0 ? "bg-rose-50/60 dark:bg-rose-950/20" : ""}`}>
                      <td className="p-2 font-medium">{n.name}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {n.type === "yari_mamul" ? "yarı mamul" : n.type}
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatQty(n.needed)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {formatQty(n.available)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {n.missing > 0 ? (
                          <span className="font-semibold text-rose-600">{formatQty(n.missing)}</span>
                        ) : (
                          <span className="text-emerald-600">✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {(plan?.missingFormula.length ?? 0) > 0 && (
            <Card className="border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {plan?.missingFormula.length} üründe reçete yok — malzeme ihtiyacı eksik hesaplandı.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setLocation("/recete")}
              >
                Reçete Defteri'ne git
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
