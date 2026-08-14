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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRoute, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const utils = trpc.useUtils();
  const masterId = Number(params?.id ?? 0);

  /*
   * "İlan üret" düğmesi eskiden yalnız /katalog'a yönlendiriyordu; kullanıcı
   * ürün listesine düşüyor ve hiçbir şey olmuyordu. Zincirin kırıldığı yer tam
   * burasıydı — düğme artık işini kendisi yapar.
   */
  /*
   * Hangi kullanım alanlarında ilan açılacağı SEÇİLİR. Önceden hepsi birden
   * açılıyordu — bir şişe için 20 ilan, çoğu ilgisiz (kaliper, motosiklet…).
   * Varsayılan hiçbiri: kullanıcı bilerek seçsin.
   */
  const [pickedUseCases, setPickedUseCases] = useState<Set<number>>(new Set());
  const toggleUseCase = (id: number) =>
    setPickedUseCases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const genListings = trpc.katalog.generateListings.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      setPickedUseCases(new Set());
      toast.success(
        r.created > 0
          ? `${r.created} ilan açıldı — Toplu Yayın'dan pazaryerine gönderebilirsiniz`
          : "Açılacak yeni ilan yok",
      );
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });
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
          <p className="font-mono text-xs text-muted-foreground">
            {identity.color?.displayCode ? `${identity.color.displayCode} · ` : ""}
            {master.internalSku}
          </p>
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
          <TabsTrigger value="gorsel">Görsel</TabsTrigger>
          <TabsTrigger value="ilanlar">İlanlar</TabsTrigger>
          <TabsTrigger value="fiyat">Fiyat</TabsTrigger>
        </TabsList>

        {/* Künye — kimlik, başka bir şey yok */}
        <TabsContent value="kunye" className="pt-3">
          <Card className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field label="Seri" value={identity.series} />
            {/* Rengin kimliği: ad + uluslararası ad + hex. Katalog kodu
                (CND1324) kendi alanında — ilanda ve müşteri yazışmasında
                sorulan asıl numara o, dipnotta kaybolmamalı. */}
            <Field
              label="Renk"
              value={identity.color?.name ?? null}
              hex={identity.color?.hex ?? null}
              hint={
                [
                  identity.color?.nameEn ?? null,
                  identity.color?.hex ?? "hex yok — Renk Stüdyosu ölçüp yazar",
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
            />
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
            <Field
              label="Renk kodu"
              value={identity.color?.displayCode ?? null}
              mono
              hint={
                identity.color?.displayCode
                  ? undefined
                  : "Tanımlar → Renkler'den ver ya da toplu üret"
              }
            />
            <Field label="Temel kod" value={master.baseCode} mono />
            <Field label="Ürün kodu" value={master.internalSku} mono />
            <Field label="GTIN" value={master.gtin} mono />
          </Card>

          {/* Kargo/vergi alanları pazaryerine buradan gider; boşsa ambalajdan
              ya da hacimden türetilir — hangisi olduğu görünür kalır. */}
          <Card className="mt-3 grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field
              label="Desi"
              value={`${data.logistics.desi}`}
              hint={SOURCE_HINT[data.logistics.desiSource]}
            />
            <Field
              label="Ağırlık"
              value={`${data.logistics.weightG} g`}
              hint={SOURCE_HINT[data.logistics.weightSource]}
            />
            <Field
              label="KDV"
              value={`%${data.logistics.vatRate}`}
              hint={data.logistics.vatSource === "seri" ? "seriden" : "varsayılan"}
            />
          </Card>
        </TabsContent>

        {/* Görsel — ilanlar buradan devralır */}
        <TabsContent value="gorsel" className="space-y-3 pt-3">
          <MasterImages masterId={masterId} images={data.images} />
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
              <div className="flex flex-wrap items-center gap-1.5">
                {(openUseCases as { id: number; name: string }[]).map(u => {
                  const on = pickedUseCases.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUseCase(u.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:border-primary/60"
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setPickedUseCases(
                      pickedUseCases.size === openUseCases.length
                        ? new Set()
                        : new Set((openUseCases as { id: number }[]).map(u => u.id)),
                    )
                  }
                  className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {pickedUseCases.size === openUseCases.length ? "Hiçbiri" : "Tümü"}
                </button>
              </div>
              <Button
                size="sm"
                className="mt-1 w-fit"
                disabled={genListings.isPending || pickedUseCases.size === 0}
                onClick={() =>
                  genListings.mutate({
                    masterIds: [masterId],
                    useCaseIds: Array.from(pickedUseCases),
                    dryRun: false,
                  })
                }
              >
                {genListings.isPending
                  ? "Açılıyor…"
                  : pickedUseCases.size === 0
                    ? "Kullanım alanı seçin"
                    : `Seçili ${pickedUseCases.size} ilanı aç`}
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Fiyat — para */}
        <TabsContent value="fiyat" className="space-y-3 pt-3">
          <PriceEditor
            masterId={masterId}
            basePrice={parseFloat(String(master.basePrice)) || 0}
            discountPercent={parseFloat(String(master.discountPercent)) || 0}
            cost={cost?.totalCost ?? 0}
            onSaved={() => {
              utils.katalog.masterCard.invalidate({ masterId });
              utils.katalog.trackList.invalidate();
            }}
          />
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

/**
 * Taban fiyat girişi. Kanal fiyatı girilmemişse bu kullanılır — her kanala
 * ayrı fiyat girmek zorunda kalınmasın diye. Maliyet biliniyorsa kâr ve marj
 * yazarken canlı gösterilir; fiyatı maliyetin altına yazmak kolayca fark edilir.
 */
function PriceEditor({
  masterId,
  basePrice,
  discountPercent,
  cost,
  onSaved,
}: {
  masterId: number;
  basePrice: number;
  discountPercent: number;
  cost: number;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(basePrice || ""));
  const [discount, setDiscount] = useState(String(discountPercent || ""));
  const [applyToChannels, setApplyToChannels] = useState(true);

  useEffect(() => {
    setPrice(String(basePrice || ""));
    setDiscount(String(discountPercent || ""));
  }, [basePrice, discountPercent]);

  const save = trpc.katalog.setBasePrice.useMutation({
    onSuccess: r => {
      toast.success(
        r.updated > 0 ? `Fiyat kaydedildi — ${r.updated} kanal yayını güncellendi` : "Fiyat kaydedildi",
      );
      onSaved();
    },
    onError: e => toast.error(e.message),
  });

  const p = parseFloat(price.replace(",", ".")) || 0;
  const d = parseFloat(discount.replace(",", ".")) || 0;
  const net = p * (1 - d / 100);
  const kar = net - cost;

  return (
    <Card className="space-y-3 p-5">
      <p className="font-semibold">Taban Fiyat</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Satış fiyatı (₺)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>İndirim %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Net fiyat</Label>
          <p className="pt-2 font-semibold tabular-nums">{formatTL(net)}</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Birim kâr</Label>
          <p
            className={`pt-2 font-semibold tabular-nums ${
              cost <= 0 ? "" : kar > 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {cost > 0 ? `${formatTL(kar)} (%${net > 0 ? ((kar / net) * 100).toFixed(1) : "0"})` : "maliyet yok"}
          </p>
        </div>
      </div>
      {cost > 0 && p > 0 && kar <= 0 && (
        <p className="flex items-center gap-1.5 text-sm text-rose-600">
          <TriangleAlert className="h-4 w-4" /> Bu fiyat maliyetin altında — her satışta zarar edersiniz.
        </p>
      )}
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={applyToChannels}
          onChange={e => setApplyToChannels(e.target.checked)}
          className="h-4 w-4"
        />
        Fiyatı olmayan kanal yayınlarına da yaz
      </label>
      <Button
        className="w-fit"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({ masterId, basePrice: p, discountPercent: d, applyToChannels })
        }
      >
        Fiyatı Kaydet
      </Button>
    </Card>
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
  hint,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  hex?: string | null;
  hint?: string;
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
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Dosyayı data URL'e çevirir — sunucuya base64 olarak gider. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("okunamadı"));
    reader.readAsDataURL(file);
  });
}

/** Lojistik değerinin kaynağı — "neden bu değer?" sorusunun cevabı. */
const SOURCE_HINT: Record<string, string> = {
  master: "ürüne özel girilmiş",
  ambalaj: "ambalajdan",
  hacimden: "hacimden tahmin",
};

/**
 * Master görselleri. İlanın kendi görseli yoksa pazaryerine bunlar gider —
 * aynı şişenin fotoğrafını her ilana ayrı yüklemek 6 kat iş demekti.
 */
function MasterImages({
  masterId,
  images,
}: {
  masterId: number;
  images: { id: number; url: string | null; role: string | null; sortOrder: number; hosted: boolean }[];
}) {
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const add = trpc.katalog.addMasterImage.useMutation({
    onSuccess: () => {
      setUrl("");
      utils.katalog.masterCard.invalidate();
      toast.success("Görsel eklendi");
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.katalog.deleteMasterImage.useMutation({
    onSuccess: () => {
      utils.katalog.masterCard.invalidate();
      toast.success("Görsel kaldırıldı");
    },
    onError: e => toast.error(e.message),
  });

  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <Card className="p-4 text-sm text-muted-foreground">
        Pazaryeri kartı görselsiz açılamaz. Buraya eklenen görselleri bu ürünün{" "}
        <strong className="text-foreground">tüm ilanları devralır</strong>; bir ilana özel görsel
        gerekirse ilan kendi görselini kullanır. İlk görsel kapak olur.
      </Card>

      <Card className="flex flex-wrap items-end gap-2 p-4">
        <div className="space-y-1.5">
          <Label>Dosyadan yükle</Label>
          <Input
            type="file"
            accept="image/*"
            disabled={busy || add.isPending}
            className="text-xs"
            onChange={async e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                add.mutate({ masterId, data: await readAsDataUrl(file) });
              } catch {
                toast.error("Dosya okunamadı");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label>ya da adres</Label>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…/urun.jpg"
            className="text-xs"
          />
        </div>
        <Button
          disabled={!url.trim() || add.isPending}
          onClick={() => add.mutate({ masterId, url: url.trim() })}
        >
          Ekle
        </Button>
      </Card>

      {sorted.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Görsel yok — bu ürünün kartı pazaryerinde açılamaz. Aynı rengin tüm
          ambalajlarına tek seferde görsel atamak için Katalog → Görseller'i kullanın.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {sorted.map((img, i) => (
            <Card key={img.id} className="space-y-2 overflow-hidden p-2">
              {img.url && (
                <img
                  src={img.url}
                  alt=""
                  className="h-32 w-full rounded bg-muted object-contain"
                  loading="lazy"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <Badge variant={i === 0 ? "default" : "outline"}>{i === 0 ? "Kapak" : i + 1}</Badge>
                {!img.hosted && <Badge variant="outline">dış</Badge>}
                <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: img.id })}>
                  Kaldır
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
