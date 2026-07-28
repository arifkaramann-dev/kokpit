import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatQty, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Beaker,
  Factory,
  Lightbulb,
  Store,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { useRoute, useLocation } from "wouter";

/**
 * Ürün kartı — bir master hakkındaki her şey tek yerde.
 *
 * Eskiden bir ürünün reçetesi Formül Defteri'nde, fiyatı Fiyat Motoru'nda,
 * stoğu Ürünler'de, ilanları Katalog'da duruyordu; tek ürün üzerinde
 * çalışırken dört sayfa geziliyordu.
 *
 * Karışık olmaması için kural: HER SEKMEDE TEK BİR İŞ. Künye kimlik,
 * Reçete içerik, Kapasite üretilebilirlik, İlanlar pazar, Fiyat para.
 * Sekme içinde ikinci bir konu açılmıyor.
 */
export default function MasterCard() {
  const [, params] = useRoute("/urun/:id");
  const [, setLocation] = useLocation();
  const masterId = Number(params?.id ?? 0);
  const { data, isLoading } = trpc.katalog.masterCard.useQuery(
    { masterId },
    { enabled: masterId > 0 },
  );

  if (isLoading || !data) {
    return <p className="p-6 text-sm text-muted-foreground">Yükleniyor…</p>;
  }

  const { master, identity, capacity, cost, recipe, listings, channelListings, openUseCases, channels } = data;
  const channelName = new Map((channels as { id: number; name: string }[]).map(c => [c.id, c.name]));
  const price = Math.max(
    0,
    ...(channelListings as { price: string }[]).map(c => parseFloat(String(c.price)) || 0),
    0,
  );
  const profit = price - (cost?.totalCost ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/katalog")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Ürünler
        </Button>
        <span
          className="h-9 w-9 shrink-0 rounded-lg border shadow-inner"
          style={{ backgroundColor: identity.color?.hex ?? "#ccc" }}
          title={identity.color?.name ?? ""}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {identity.color?.name ?? "—"} · {identity.family ?? "—"} · {identity.packaging?.name ?? "—"}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">{master.internalSku}</p>
        </div>
        {master.readiness === "r2u" && <Badge variant="secondary">Kullanıma hazır</Badge>}
        <Badge variant={master.status === "aktif" ? "default" : "outline"}>{master.status}</Badge>
      </div>

      {/* Özet şerit — kartın "her şey yolunda mı" cevabı */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary
          label="Üretilebilir"
          value={String(capacity?.buildable ?? 0)}
          tone={(capacity?.buildable ?? 0) > 0 ? "ok" : "bad"}
          hint={capacity?.bottleneck ? `Darboğaz: ${capacity.bottleneck.materialName}` : undefined}
        />
        <Summary
          label="Birim maliyet"
          value={cost ? formatTL(cost.totalCost) : "—"}
          tone={cost && cost.unknownInputs.length > 0 ? "warn" : "neutral"}
          hint={cost?.unknownInputs.length ? `Fiyatı bilinmeyen: ${cost.unknownInputs.join(", ")}` : undefined}
        />
        <Summary label="Satış fiyatı" value={price > 0 ? formatTL(price) : "—"} tone="neutral" />
        <Summary
          label="Birim kâr"
          value={price > 0 ? formatTL(profit) : "—"}
          tone={price > 0 ? (profit > 0 ? "ok" : "bad") : "neutral"}
        />
      </div>

      <Tabs defaultValue="kunye">
        <TabsList className="flex-wrap">
          <TabsTrigger value="kunye">Künye</TabsTrigger>
          <TabsTrigger value="recete">Reçete</TabsTrigger>
          <TabsTrigger value="kapasite">Kapasite</TabsTrigger>
          <TabsTrigger value="ilanlar">İlanlar</TabsTrigger>
          <TabsTrigger value="fiyat">Fiyat</TabsTrigger>
        </TabsList>

        {/* Künye — kimlik, başka bir şey yok */}
        <TabsContent value="kunye" className="pt-3">
          <Card className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field label="Seri" value={identity.series} />
            <Field label="Renk" value={identity.color?.name ?? null} hex={identity.color?.hex ?? null} />
            <Field label="Form" value={identity.family} />
            <Field label="Ambalaj" value={identity.packaging?.name ?? null} />
            <Field
              label="Hacim"
              value={
                identity.packaging && parseFloat(String(identity.packaging.volumeMl)) > 0
                  ? `${parseFloat(String(identity.packaging.volumeMl))} ml`
                  : null
              }
            />
            <Field label="Hazırlık" value={master.readiness === "r2u" ? "Kullanıma hazır" : "Konsantre"} />
            <Field label="Temel kod" value={master.baseCode} mono />
            <Field label="Ürün kodu" value={master.internalSku} mono />
            <Field label="GTIN" value={master.gtin} mono />
          </Card>
        </TabsContent>

        {/* Reçete — içerik */}
        <TabsContent value="recete" className="space-y-3 pt-3">
          {!data.formula ? (
            <Card className="space-y-2 p-8 text-center">
              <Beaker className="mx-auto h-7 w-7 text-muted-foreground/50" />
              <p className="font-medium">Reçete bağlı değil</p>
              <p className="text-sm text-muted-foreground">
                Reçetesiz ürünün kapasitesi 0 sayılır ve maliyeti hesaplanamaz.
              </p>
              <Button size="sm" className="mt-1" onClick={() => setLocation("/recete")}>
                Reçete Defteri'ne git
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-2 border-b p-4">
                <p className="font-semibold">{String(data.formula.name)}</p>
                <span className="text-xs text-muted-foreground">
                  {parseFloat(String(data.formula.baseQty))} {String(data.formula.baseUnit)} baz ·
                  bu ambalaj için ×{parseFloat(String(master.formulaScale))}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Kalem</th>
                    <th className="p-2 text-right">Reçetede</th>
                    <th className="p-2 text-right">Bu üründe</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.map(r => (
                    <tr key={r.materialId} className="border-t">
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {formatQty(r.qtyPerBase)}
                      </td>
                      <td className="p-2 text-right font-medium tabular-nums">
                        {formatQty(r.qtyPerUnit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* Kapasite — üretilebilirlik */}
        <TabsContent value="kapasite" className="space-y-3 pt-3">
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              <p className="font-semibold">
                Eldeki hammaddeyle {capacity?.buildable ?? 0} adet üretilebilir
              </p>
            </div>
            {capacity?.bottleneck ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Darboğaz: {capacity.bottleneck.materialName}</p>
                <p className="text-muted-foreground">
                  Elde {formatQty(capacity.bottleneck.available)} · adet başına{" "}
                  {formatQty(capacity.bottleneck.needPerUnit)} gerekiyor
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {capacity?.reason === "recete_yok"
                  ? "Reçete bağlı olmadığı için kapasite hesaplanamıyor."
                  : "Kısıtlayan kalem bulunamadı."}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={() => setLocation("/stok")}>
              Hammadde & Stok'a git
            </Button>
          </Card>
        </TabsContent>

        {/* İlanlar — hedef pazar ve fırsat */}
        <TabsContent value="ilanlar" className="space-y-3 pt-3">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <Tag className="h-4 w-4 text-primary" />
              <p className="font-semibold">Açık ilanlar ({listings.length})</p>
            </div>
            {listings.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Bu ürün için ilan açılmamış — hiçbir pazarda görünmüyor.
              </p>
            ) : (
              <div className="divide-y">
                {(listings as { id: number; title: string; status: string }[]).map(l => {
                  const pubs = (channelListings as { listingId: number; channelId: number; status: string }[]).filter(
                    c => c.listingId === l.id,
                  );
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {l.status}
                      </Badge>
                      {pubs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">yayında değil</span>
                      ) : (
                        pubs.map(p => (
                          <Badge
                            key={p.channelId}
                            className={`text-[10px] ${
                              p.status === "canli"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : ""
                            }`}
                            variant={p.status === "canli" ? undefined : "secondary"}
                          >
                            {channelName.get(p.channelId) ?? "?"}
                          </Badge>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pazarlama fırsatı — açılmamış pazar, eksik alandan daha değerli */}
          {openUseCases.length > 0 && (
            <Card className="space-y-2 border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">
                  {openUseCases.length} kullanım alanında ilan açılmamış
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Aynı şişe, farklı alıcı kitlesi. Eksik alan doldurmak değil, açılmamış pazara
                girmek satış getirir.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(openUseCases as { id: number; name: string }[]).map(u => (
                  <Badge key={u.id} variant="outline">
                    {u.name}
                  </Badge>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setLocation("/katalog")}>
                İlan üret
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Fiyat — para */}
        <TabsContent value="fiyat" className="space-y-3 pt-3">
          <Card className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Hammadde" value={cost ? formatTL(cost.materialCost) : "—"} />
              <Field label="Ambalaj" value={cost ? formatTL(cost.packagingCost) : "—"} />
              <Field label="Toplam maliyet" value={cost ? formatTL(cost.totalCost) : "—"} />
              <Field
                label="Kâr marjı"
                value={price > 0 ? `%${((profit / price) * 100).toFixed(1)}` : "—"}
              />
            </div>
            {cost && cost.unknownInputs.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Şu kalemlerin birim fiyatı girilmemiş, maliyet eksik hesaplandı:{" "}
                  <strong>{cost.unknownInputs.join(", ")}</strong>
                </span>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <Store className="h-4 w-4 text-primary" />
              <p className="font-semibold">Kanal fiyatları</p>
            </div>
            {channelListings.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Hiçbir kanalda yayında değil.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Kanal</th>
                    <th className="p-2 text-left">Satıcı kodu</th>
                    <th className="p-2 text-right">Fiyat</th>
                    <th className="p-2 text-right">Kâr</th>
                  </tr>
                </thead>
                <tbody>
                  {(channelListings as { id: number; channelId: number; channelSku: string; price: string }[]).map(c => {
                    const p = parseFloat(String(c.price)) || 0;
                    const kar = p - (cost?.totalCost ?? 0);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="p-2 font-medium">{channelName.get(c.channelId) ?? "?"}</td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">{c.channelSku}</td>
                        <td className="p-2 text-right tabular-nums">{formatTL(p)}</td>
                        <td
                          className={`p-2 text-right tabular-nums ${kar > 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {p > 0 ? formatTL(kar) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  hint?: string;
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : tone === "warn"
          ? "text-amber-600"
          : "";
  return (
    <Card className="p-3" title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${cls}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
  hex,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  hex?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`flex items-center gap-1.5 font-medium ${mono ? "font-mono text-sm" : ""}`}>
        {hex && (
          <span className="inline-block h-3.5 w-3.5 rounded border" style={{ backgroundColor: hex }} />
        )}
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}
