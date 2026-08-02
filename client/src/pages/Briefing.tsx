import { useConfirm } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Factory,
  FlaskConical,
  HelpCircle,
  Loader2,
  Package,
  Printer,
  ShoppingCart,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

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
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data, isLoading } = trpc.katalog.briefing.useQuery({ orderIds: [] });
  const [showFormulation, setShowFormulation] = useState(true);

  const plan = data?.plan;
  const hazir = plan?.canProduce === true && (data?.demand.length ?? 0) > 0;

  /*
   * "Hepsini üretildi işaretle" — üretim kaydının iş yükünü kaldıran düğme.
   *
   * Ürün başına seç-yaz-onayla döngüsü yüzlerce ürünlü katalogda yapılamıyor,
   * bu yüzden kimse üretim kaydı tutmuyor ve hammadde stoğu gerçeği
   * yansıtmıyordu. Gün sonunda tek tıkla brifingdeki her şey düşülür.
   */
  const produce = trpc.katalog.produceBriefing.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      utils.materials.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success(
        `${r.produced} üründe ${r.units} adet üretim işlendi · ${r.deducted} kalem hammadde düşüldü` +
          (r.shortages.length > 0 ? ` · eksik stokla: ${r.shortages.slice(0, 4).join(", ")}` : ""),
        { duration: 12000 },
      );
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

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
            {(data?.demand.length ?? 0) > 0 && (
              <Button
                disabled={produce.isPending}
                onClick={async () => {
                  const units = data?.demand.reduce((s, d) => s + d.qty, 0) ?? 0;
                  const short = plan?.shortages.length ?? 0;
                  const ok = await confirm({
                    title: "Hepsini üretildi olarak işle",
                    description:
                      `${data?.demand.length} üründe toplam ${units} adet üretim kaydedilecek ve reçeteye göre hammadde düşülecek.` +
                      (short > 0
                        ? ` ${short} kalemde stok yetersiz — üretim yine kaydedilir, o kalemler eksiye düşer.`
                        : ""),
                    confirmText: "Üretildi işaretle",
                  });
                  if (!ok) return;
                  produce.mutate({
                    items: (data?.demand ?? []).map(d => ({ masterId: d.masterId, qty: d.qty })),
                  });
                }}
              >
                {produce.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Factory className="mr-1 h-4 w-4" />
                )}
                Hepsini üretildi işaretle
              </Button>
            )}
          </Card>

          {/* Üretim kaydı zorunlu değil: bu ekran kayıt tutulmadan da işi
              yürütür. Kullanıcının bunu bilmesi gerekiyor, yoksa "üretmediğimi
              satamıyorum" korkusuyla gereksiz kayıt tutuyor. */}
          <p className="text-xs text-muted-foreground">
            Üretim kaydı <strong>zorunlu değildir</strong> — aşağıdaki formülasyonla üretip
            gönderebilirsiniz. Kayıt yalnız hammadde stoğunun gerçeği yansıtması içindir; satış
            hiçbir durumda üretim kaydına bağlı değildir.
          </p>

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

          {/* 1b — Tezgâh formülasyonu: "şu kadar için şunu tart" */}
          {(data?.formulation.length ?? 0) > 0 && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <p className="font-semibold">Üretim Formülasyonu</p>
                <span className="text-xs text-muted-foreground">
                  Reçete, sipariş adedine ölçeklenmiş halde — tezgâhta okunacak liste
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={() => setShowFormulation(v => !v)}
                >
                  {showFormulation ? "Gizle" : "Göster"}
                </Button>
              </div>

              {showFormulation && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {(data?.formulation ?? []).map(f => {
                    const d = (data?.demand ?? []).find(x => x.masterId === f.masterId);
                    return (
                      <div key={f.masterId} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded border shadow-inner"
                            style={{ backgroundColor: d?.colorHex ?? "#ccc" }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {[d?.series, d?.colorName, d?.packaging].filter(Boolean).join(" · ")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {f.qty} adet
                              {f.formulaName ? ` · ${f.formulaName}` : ""}
                              {f.scale !== 1 &&
                                ` · reçetenin ${String(Math.round(f.scale * 1000) / 1000).replace(".", ",")} katı`}
                              {f.wastePercent > 0 && ` · fire %${f.wastePercent}`}
                            </p>
                          </div>
                          <span className="text-lg font-bold tabular-nums">{f.qty}</span>
                        </div>

                        {f.lines.length === 0 ? (
                          <p className="text-xs text-amber-600">
                            Reçete bağlı değil — bu ürünün formülasyonu çıkarılamıyor.
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-[10px] text-muted-foreground">
                              <tr>
                                <th className="pb-1 text-left">Kalem</th>
                                <th className="pb-1 text-right">Adet başı</th>
                                <th className="pb-1 text-right">Toplam</th>
                              </tr>
                            </thead>
                            <tbody>
                              {f.lines.map(l => (
                                <tr key={l.materialId} className="border-t">
                                  <td className="py-1">{l.name}</td>
                                  <td className="py-1 text-right tabular-nums text-muted-foreground">
                                    {formatQty(l.perUnit)} {l.unit ?? ""}
                                  </td>
                                  <td className="py-1 text-right font-semibold tabular-nums">
                                    {formatQty(l.total)} {l.unit ?? ""}
                                  </td>
                                </tr>
                              ))}
                              {/* Ambalaj ayrı gösterilir: hacimle ölçeklenmez,
                                  adet başına sabittir — tezgâhta karıştırılmamalı. */}
                              {f.packagingLines.map(l => (
                                <tr key={`p${l.materialId}`} className="border-t text-muted-foreground">
                                  <td className="py-1">{l.name}</td>
                                  <td className="py-1 text-right tabular-nums">
                                    {formatQty(l.perUnit)} {l.unit ?? "adet"}
                                  </td>
                                  <td className="py-1 text-right tabular-nums">
                                    {formatQty(l.total)} {l.unit ?? "adet"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

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
