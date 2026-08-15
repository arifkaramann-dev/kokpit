import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ConfirmDialog";
import PackagingCost from "@/components/PackagingCost";
import PackagingImages from "@/components/PackagingImages";
import { trpc } from "@/lib/trpc";
import { packagingImageUrl } from "@shared/color/packagingImage";
import {
  colorCodePrefix,
  formatColorCode,
  isNeutralColor,
  makeColorCodeIndex,
  parseColorNo,
  type SeriesColorNo,
} from "@shared/colorCode";
import { seriesForColor } from "@shared/colorScope";
import { ImagePlus, Languages, Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Kind = "colors" | "families" | "packagings" | "useCases";
/** Sekme değeri; KIND_META tablo sekmeleri içindir, bu ayrı bir içerik. */
const PACKAGING_COST_TAB = "packagingCost";
const NONE = "__none__";

const KIND_META: Record<Kind, { title: string; desc: string }> = {
  colors: {
    title: "Renkler",
    desc: "Katalog kodu renge DEĞİL ürüne aittir: ön ek ürünün serisinden, numara o serinin kendi düzeninden gelir. Aynı renk CANDY'de CND1004, METEOR'da MTR1012 olabilir — her seri kendi numarasını verir, vermezse rengin varsayılan numarası kullanılır.",
  },
  families: {
    title: "Formlar",
    desc: "Fiziksel form: airbrush · boya · sprey · rötuş. Kullanıma hazır (r2u) bir form değil, ürünün hazırlık bayrağıdır.",
  },
  packagings: {
    title: "Ambalajlar",
    desc: "Hacim, reçete ölçeklemesinin paydasıdır — boş bırakılırsa o ambalajda reçete ölçeklenemez. Stok kalemi şişeyi kapasiteye bağlar. Görsel, Renk Stüdyosu şablonlarının bastığı gerçek kutudur; seri bazında ayrı çekim yüklenebilir.",
  },
  useCases: {
    title: "Kullanım Alanları",
    desc: "İlan ekseni — aynı şişe 3D baskıcıya ve olta yapımcısına ayrı ilanla satılır. Master ekseni değildir.",
  },
};

/**
 * Tanımlar — ürün sözlüğünün TEK kaynağı.
 *
 * Eskiden renk/ambalaj/kullanım alanı hem "Şablonlar" sayfasında (metin
 * şablonu olarak) hem katalog boyutlarında duruyordu; ikisi senkron değildi ve
 * hangisinin doğru olduğu belirsizdi. Artık sözlük burada, metin şablonları
 * (etiket yazısı, kılavuz, güvenlik) ayrı sekmede.
 */
export default function Definitions({ embedded = false }: { embedded?: boolean }) {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const { data: packImages } = trpc.katalog.packagingImages.useQuery();

  // Sekme değeri tablo sekmelerinden biri ya da ambalaj maliyeti olabilir;
  // `kind` yalnız tablo sekmelerinde anlamlıdır.
  const [tab, setTab] = useState<string>("colors");
  const kind = (tab === PACKAGING_COST_TAB ? "packagings" : tab) as Kind;
  const setKind = (k: Kind) => setTab(k);
  const [open, setOpen] = useState(false);
  // Ambalaj çekimleri ayrı bir diyalogda: kayıt formuyla aynı yere sığmıyor ve
  // yeni ambalaj kaydedilmeden görsel yüklenemez (satır kimliği gerekiyor).
  const [imagesFor, setImagesFor] = useState<{ id: number; name: string } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    colorNo: "",
    nameEn: "",
    hex: "#888888",
    seriesId: NONE,
    volumeMl: "",
    materialId: NONE,
    skuSegment: "",
    titlePattern: "",
  });
  /**
   * Serinin kendi renk numaraları — seriId → yazılan metin ("" = numara yok).
   * Renk kaydıyla AYNI formda düzenlenir; kaydederken renk satırından sonra
   * seri satırları yazılır.
   */
  const [seriesNos, setSeriesNos] = useState<Record<number, string>>({});

  const seriesRows = useMemo(
    () => (series ?? []).map(s => ({ id: s.id, name: s.name, prefix: s.prefix ?? null })),
    [series],
  );
  const colorLinks = useMemo(
    () => ((dims?.seriesColors ?? []) as { seriesId: number; colorId: number }[]),
    [dims?.seriesColors],
  );
  const seriesColorNumbers = useMemo(
    () => ((dims?.seriesColorNumbers ?? []) as SeriesColorNo[]),
    [dims?.seriesColorNumbers],
  );
  /** Kodun tek karar noktası — kart, künye ve stüdyo ile aynı indeks. */
  const codeIndex = useMemo(
    () => makeColorCodeIndex({ series: seriesRows, overrides: seriesColorNumbers }),
    [seriesRows, seriesColorNumbers],
  );
  /** Formda seçili "seriye kilitli mi" değeri — düzenlenirken kapsam buna göre. */
  const formSeriesId = form.seriesId === NONE ? null : Number(form.seriesId);
  /** Bu renk hangi serilerde üretiliyor — üretim planlayıcısıyla aynı kural. */
  const seriesOfColor = (row: { id: number; seriesId?: number | null }) =>
    seriesForColor({
      color: { id: row.id, seriesId: row.seriesId ?? null },
      series: seriesRows,
      links: colorLinks,
    });

  // Diyalog kapanışı ve bildirim `submit`'te: renk satırından sonra serinin
  // numaraları da yazılıyor, "Kaydedildi" hepsi bitmeden görünmemeli.
  const save = trpc.katalog.saveDimension.useMutation({
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  /**
   * Serinin renk numarası — renk kaydından AYRI bir satır.
   *
   * Sessizce yutulmaz: numara reddedilirse (aynı seride başka renk o numarayı
   * tutuyorsa) kullanıcı hangi rengin tuttuğunu görmeli, yoksa kaydettiğini
   * sanıp ilanı yanlış kodla açar.
   */
  const saveSeriesNo = trpc.katalog.setSeriesColorNo.useMutation({
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  /**
   * Katalog kodu önerisi — form açıkken tek tuşla.
   *
   * Sunucudan isteniyor çünkü "sıradaki numara" bütün renklerin koduna bakmayı
   * gerektiriyor; istemcideki listeden hesaplamak, başka biri aynı anda kod
   * verdiğinde çakışırdı. `seriesId` verilirse o serinin kendi dizisinden
   * devam eder — CANDY'nin sırası METEOR'unkini kaydırmaz.
   */
  const [suggesting, setSuggesting] = useState<number | "default" | null>(null);
  const suggestColorNo = async (seriesId: number | null) => {
    setSuggesting(seriesId ?? "default");
    try {
      const r = await utils.katalog.nextColorNo.fetch({ seriesId });
      if (seriesId == null) setForm(f => ({ ...f, colorNo: String(r.colorNo) }));
      else setSeriesNos(p => ({ ...p, [seriesId]: String(r.colorNo) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Numara üretilemedi");
    } finally {
      setSuggesting(null);
    }
  };

  /**
   * Numarası olmayan renklere toplu numara verir — önce ne olacağını gösterir.
   *
   * Katalogdaki onlarca rengi tek tek açıp numara yazmak saatlik bir iş; dolu
   * numaralara dokunulmadığı için tekrar çalıştırmak da güvenli.
   *
   * Hedef seri seçilirse O SERİNİN kendi dizisi doldurulur (CND1001, CND1002…)
   * ve yalnız o seride üretilen renkler işlenir. Seçilmezse rengin varsayılan
   * numarası yazılır — hiçbir serinin kendi numarası olmadığında kullanılan.
   */
  const [assignSeriesId, setAssignSeriesId] = useState<string>(NONE);
  const assignCodes = trpc.katalog.assignColorNumbers.useMutation({
    onSuccess: r => {
      if (!r.dryRun) {
        utils.katalog.dimensions.invalidate();
        toast.success(`${r.assigned} renge numara verildi`);
      }
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const runAssignCodes = async () => {
    const seriesId = assignSeriesId === NONE ? null : Number(assignSeriesId);
    const hedef = seriesId == null ? null : seriesRows.find(s => s.id === seriesId);
    const preview = await assignCodes.mutateAsync({ dryRun: true, seriesId });
    if (!preview.plan.length) {
      toast.message(
        hedef ? `${hedef.name} serisinde numarasız renk yok` : "Numarası olmayan renk yok",
      );
      return;
    }
    // Örnekte KODUN TAMAMI gösteriliyor: kullanıcı "1001" değil "CND1001"
    // basılacağını görmeli — onaylanan şey karta basılan şey olsun.
    const ornek = preview.plan
      .slice(0, 5)
      .map(p => `${formatColorCode(hedef?.prefix, p.colorNo) ?? p.colorNo} — ${p.name}`)
      .join("\n");
    if (
      await confirm({
        title: hedef ? `${hedef.name} renk numaraları` : "Varsayılan renk numarası üret",
        description: `${preview.plan.length} renge numara verilecek. Dolu numaralara dokunulmaz.\n\n${ornek}${
          preview.plan.length > 5 ? `\n… ve ${preview.plan.length - 5} tane daha` : ""
        }`,
        confirmText: "Üret",
      })
    ) {
      await assignCodes.mutateAsync({ dryRun: false, seriesId });
    }
  };

  /**
   * İngilizce ad önerileri — ÖNCE göster, sonra yaz.
   *
   * Sözlük eşleşmesi tartışmasız olsa da liste onaydan geçiyor: ad etikete ve
   * pazaryeri başlığına gidiyor, sessizce yazılan yanlış bir karşılık ancak
   * müşteri sorunca fark edilirdi. Sözlükte olmayan renk boş satırla geliyor —
   * kullanıcı elle yazabilsin.
   */
  const [nameRows, setNameRows] = useState<Array<{ colorId: number; name: string; nameEn: string }> | null>(
    null,
  );
  const applyNames = trpc.katalog.applyColorNamesEn.useMutation({
    onSuccess: r => {
      utils.katalog.dimensions.invalidate();
      setNameRows(null);
      toast.success(`${r.written} renge İngilizce ad yazıldı`);
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const openNameSuggestions = async () => {
    try {
      const rows = await utils.katalog.suggestColorNamesEn.fetch();
      if (!rows.length) {
        toast.message("İngilizce adı eksik renk yok");
        return;
      }
      setNameRows(rows.map(r => ({ colorId: r.colorId, name: r.name, nameEn: r.suggestion })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Öneri alınamadı");
    }
  };

  const remove = trpc.katalog.deleteDimension.useMutation({
    onSuccess: () => {
      utils.katalog.dimensions.invalidate();
      toast.success("Silindi");
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const rows = (k: Kind) => (dims?.[k] ?? []) as Record<string, unknown>[];
  const materialName = new Map((materials ?? []).map(m => [m.id, m.name]));

  function openNew(k: Kind) {
    setKind(k);
    setEditId(null);
    setSeriesNos({});
    setForm({
      code: "",
      name: "",
      colorNo: "",
      nameEn: "",
      hex: "#888888",
      seriesId: NONE,
      volumeMl: "",
      materialId: NONE,
      skuSegment: "",
      titlePattern: "",
    });
    setOpen(true);
  }

  function openEdit(k: Kind, row: Record<string, unknown>) {
    setKind(k);
    setEditId(row.id as number);
    // Serinin KENDİ numarası yazılır; varsayılana düşenler boş kalır ki
    // kullanıcı hangisinin gerçekten tanımlı olduğunu görsün.
    setSeriesNos(
      Object.fromEntries(
        seriesColorNumbers
          .filter(n => n.colorId === (row.id as number))
          .map(n => [n.seriesId, String(n.colorNo)]),
      ),
    );
    setForm({
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      colorNo: row.colorNo != null ? String(row.colorNo) : "",
      nameEn: (row.nameEn as string) ?? "",
      hex: (row.hex as string) ?? "#888888",
      seriesId: row.seriesId != null ? String(row.seriesId) : NONE,
      volumeMl: row.volumeMl != null ? String(parseFloat(String(row.volumeMl))) : "",
      materialId: row.materialId != null ? String(row.materialId) : NONE,
      skuSegment: (row.skuSegment as string) ?? "",
      titlePattern: (row.titlePattern as string) ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Kod ve ad gerekli");
    try {
      await saveAll();
    } catch {
      // Hata mesajını mutation'ların onError'ı gösterdi; diyalog AÇIK kalır ki
      // kullanıcı reddedilen numarayı düzeltebilsin.
    }
  }

  async function saveAll() {
    const saved = await save.mutateAsync({
      kind,
      id: editId,
      code: form.code.trim(),
      name: form.name.trim(),
      nameEn: kind === "colors" ? form.nameEn.trim() || null : undefined,
      colorNo: kind === "colors" ? parseColorNo(form.colorNo) : undefined,
      hex: kind === "colors" ? form.hex : null,
      seriesId: form.seriesId === NONE ? null : Number(form.seriesId),
      volumeMl: kind === "packagings" ? parseFloat(form.volumeMl) || 0 : undefined,
      materialId: form.materialId === NONE ? null : Number(form.materialId),
      skuSegment: form.skuSegment.trim() || null,
      titlePattern: form.titlePattern.trim() || null,
    });

    // Seri numaraları renk satırından SONRA yazılır: yeni renkte kimlik ancak
    // burada oluşuyor. Yalnız DEĞİŞENLER gönderilir — dokunulmamış seriye
    // boşuna yazma yapılmaz.
    if (kind === "colors") {
      const before = new Map(
        seriesColorNumbers.filter(n => n.colorId === saved.id).map(n => [n.seriesId, n.colorNo]),
      );
      // Alan boşaltıldıysa `parseColorNo` null döner ve kayıt silinir: renk o
      // seride varsayılan numarasına geri döner. Formda hiç görünmeyen seriye
      // dokunulmaz.
      for (const [key, value] of Object.entries(seriesNos)) {
        const seriesId = Number(key);
        const next = parseColorNo(value);
        if ((before.get(seriesId) ?? null) === next) continue;
        await saveSeriesNo.mutateAsync({ seriesId, colorId: saved.id, colorNo: next });
      }
    }

    utils.katalog.dimensions.invalidate();
    setOpen(false);
    toast.success("Kaydedildi");
  }

  return (
    <div className="space-y-4">
      {/* Ürünler sayfasının sekmesinde kullanılırken kendi başlığını
          göstermez — iki başlık üst üste gelirdi. */}
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tanımlar</h1>
          <p className="text-sm text-muted-foreground">
            Ürün sözlüğünün tek kaynağı. Buradaki renk, form, ambalaj ve kullanım alanları master
            ürünlerin koordinatını ve ilan başlıklarını oluşturur.
          </p>
        </div>
      )}

      <Tabs value={tab} onValueChange={v => setTab(v)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="colors">Renkler</TabsTrigger>
          <TabsTrigger value="families">Formlar</TabsTrigger>
          <TabsTrigger value="packagings">Ambalajlar</TabsTrigger>
          <TabsTrigger value={PACKAGING_COST_TAB}>Ambalaj Maliyeti</TabsTrigger>
          <TabsTrigger value="useCases">Kullanım Alanları</TabsTrigger>
        </TabsList>

        <TabsContent value={PACKAGING_COST_TAB} className="pt-3">
          <PackagingCost />
        </TabsContent>

        {(Object.keys(KIND_META) as Kind[]).map(k => (
          <TabsContent key={k} value={k} className="space-y-3 pt-3">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1 text-sm text-muted-foreground">{KIND_META[k].desc}</p>
              {k === "colors" && (
                <div className="flex items-center gap-2">
                  {/* Hedef seri numaranın hangi diziye yazılacağını belirler;
                      "varsayılan" hiçbir serinin kendi numarası olmadığında
                      kullanılan sayıdır. */}
                  <Select value={assignSeriesId} onValueChange={setAssignSeriesId}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Varsayılan numara</SelectItem>
                      {seriesRows.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({colorCodePrefix(s.prefix)}…)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={assignCodes.isPending}
                    onClick={() => void runAssignCodes()}
                  >
                    {assignCodes.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 h-4 w-4" />
                    )}
                    Numara üret
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void openNameSuggestions()}>
                    <Languages className="mr-1 h-4 w-4" /> İngilizce ad öner
                  </Button>
                </div>
              )}
              <Button size="sm" onClick={() => openNew(k)}>
                <Plus className="mr-1 h-4 w-4" /> Yeni
              </Button>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
                    <tr>
                      {k === "packagings" && <th className="p-2 text-left">Görsel</th>}
                      <th className="p-2 text-left">Ad</th>
                      {k === "colors" && <th className="p-2 text-left">Katalog kodu (seriye göre)</th>}
                      <th className="p-2 text-left">Kod</th>
                      {k === "colors" && <th className="p-2 text-left">Varsayılan no</th>}
                      {k === "packagings" && <th className="p-2 text-right">Hacim (ml)</th>}
                      {k === "packagings" && <th className="p-2 text-left">Stok kalemi</th>}
                      {(k === "families" || k === "packagings") && (
                        <th className="p-2 text-left">SKU eki</th>
                      )}
                      <th className="p-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(k).map(row => (
                      <tr key={row.id as number} className="border-t">
                        {k === "packagings" && (
                          <td className="p-2">
                            <PackagingThumb
                              images={packImages ?? []}
                              packagingId={row.id as number}
                              onClick={() =>
                                setImagesFor({ id: row.id as number, name: String(row.name) })
                              }
                            />
                          </td>
                        )}
                        <td className="p-2 font-medium">
                          <span className="flex items-center gap-2">
                            {k === "colors" && (
                              <span
                                className="inline-block h-4 w-4 shrink-0 rounded border"
                                style={{ backgroundColor: (row.hex as string) ?? "#ccc" }}
                              />
                            )}
                            {String(row.name)}
                          </span>
                        </td>
                        {k === "colors" && (
                          <td className="p-2">
                            <ColorCodes
                              color={{
                                id: row.id as number,
                                code: String(row.code),
                                colorNo: (row.colorNo as number | null) ?? null,
                                seriesId: (row.seriesId as number | null) ?? null,
                              }}
                              series={seriesOfColor({
                                id: row.id as number,
                                seriesId: (row.seriesId as number | null) ?? null,
                              })}
                              index={codeIndex}
                            />
                          </td>
                        )}
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {String(row.code)}
                        </td>
                        {k === "colors" && (
                          <td className="p-2 font-mono text-xs">
                            {row.colorNo != null ? (
                              <span className="text-muted-foreground">{String(row.colorNo)}</span>
                            ) : isNeutralColor(String(row.code)) ? (
                              <span className="text-muted-foreground" title="Renksiz kalemlerin yer tutucusu — katalog kodu almaz">
                                gerekmez
                              </span>
                            ) : (
                              <span
                                className="text-muted-foreground"
                                title="Serilerin kendi numarası varsa varsayılana gerek yok"
                              >
                                —
                              </span>
                            )}
                          </td>
                        )}
                        {k === "packagings" && (
                          <td className="p-2 text-right tabular-nums">
                            {parseFloat(String(row.volumeMl)) > 0 ? (
                              parseFloat(String(row.volumeMl))
                            ) : (
                              <span className="text-amber-600" title="Hacimsiz ambalajda reçete ölçeklenemez">
                                —
                              </span>
                            )}
                          </td>
                        )}
                        {k === "packagings" && (
                          <td className="p-2 text-xs text-muted-foreground">
                            {row.materialId != null
                              ? (materialName.get(row.materialId as number) ?? "?")
                              : "bağlı değil"}
                          </td>
                        )}
                        {(k === "families" || k === "packagings") && (
                          <td className="p-2 font-mono text-xs">{(row.skuSegment as string) ?? "—"}</td>
                        )}
                        <td className="p-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(k, row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Tanımı sil",
                                  description: `"${String(row.name)}" silinsin mi? Kullanımdaysa engellenecek.`,
                                  confirmText: "Sil",
                                  destructive: true,
                                })
                              )
                                remove.mutate({ kind: k, id: row.id as number });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {rows(k).length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                          Henüz tanım yok — Ürünler sayfasındaki "Boyutları Tohumla" ile mevcut
                          sözlüğünüzden otomatik kurabilirsiniz.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {!embedded && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm text-muted-foreground">
            <strong className="text-foreground">Metin şablonları</strong> (etiket yazısı, kullanım
            kılavuzu, güvenlik uyarısı) ayrı sayfada — orada ikinci kaynak sorunu yok.
          </p>
          <Button variant="outline" size="sm" onClick={() => setLocation("/sablonlar")}>
            Şablonlar
          </Button>
        </Card>
      )}

      {/* İngilizce ad önerileri — düzenlenebilir onay listesi. */}
      <Dialog open={!!nameRows} onOpenChange={v => !v && setNameRows(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>İngilizce adlar</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Kartta ve satış adında{" "}
            <strong className="text-foreground">FUŞYA / MAGENTA</strong> olarak yazılır. Sözlükte
            olmayan renkler boş geldi — elle yazabilir ya da boş bırakıp geçebilirsin.
          </p>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {(nameRows ?? []).map((row, i) => (
              <div key={row.colorId} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-sm">{row.name}</span>
                <span className="text-muted-foreground">/</span>
                <Input
                  value={row.nameEn}
                  onChange={e =>
                    setNameRows(prev =>
                      (prev ?? []).map((r, j) => (j === i ? { ...r, nameEn: e.target.value } : r)),
                    )
                  }
                  className="h-8"
                  placeholder="İngilizce ad"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameRows(null)}>
              İptal
            </Button>
            <Button
              disabled={applyNames.isPending}
              onClick={() =>
                applyNames.mutate({
                  rows: (nameRows ?? []).map(r => ({ colorId: r.colorId, nameEn: r.nameEn.trim() })),
                })
              }
            >
              {(nameRows ?? []).filter(r => r.nameEn.trim()).length} adı yaz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imagesFor} onOpenChange={v => !v && setImagesFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ambalaj çekimleri</DialogTitle>
          </DialogHeader>
          {imagesFor && (
            <PackagingImages packagingId={imagesFor.id} packagingName={imagesFor.name} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImagesFor(null)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Düzenle" : "Yeni"} — {KIND_META[kind].title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ad *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={kind === "colors" ? "Candy Red" : "100 ML PET"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kod *</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="font-mono"
                  placeholder={kind === "colors" ? "red1822" : "pet100"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ürün kodunda kullanılır — sonradan değiştirmek eşleşmeyi bozar.
                </p>
              </div>
            </div>

            {kind === "colors" && (
              <>
                {/* Katalog kodu — müşteriye giden numara. Slug'la (yukarıdaki
                    "Kod") karıştırılmasın diye hemen altında ve ayrı
                    açıklamayla duruyor. */}
                <div className="space-y-1.5">
                  <Label>Varsayılan renk numarası</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.colorNo}
                      onChange={e => setForm(f => ({ ...f, colorNo: e.target.value }))}
                      className="font-mono"
                      placeholder="1324"
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={suggesting !== null}
                      onClick={() => void suggestColorNo(null)}
                    >
                      {suggesting === "default" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Üret"
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Hiçbir serinin kendi numarası yoksa kullanılan sayı. Kod ürün anında kurulur:
                    ön ek ÜRÜNÜN serisinden gelir.
                    {editId == null &&
                      " Seriye özel numaralar renk kaydedildikten sonra bu formda açılır."}
                  </p>
                </div>

                {/* Kodun asıl tanım yeri: her seri kendi numarasını verir.
                    Yalnız rengin GERÇEKTEN üretildiği seriler listelenir —
                    üretilmediği seriye kod yazmak koda anlam katmaz. */}
                {editId != null && (
                  <div className="space-y-1.5">
                    <Label>Seri kodları</Label>
                    {seriesOfColor({ id: editId, seriesId: formSeriesId }).length === 0 ? (
                      <p className="text-[11px] text-amber-600">
                        Bu renk hiçbir seride üretilmiyor — önce Seri Uyumluluğu ekranından bir
                        seriye ekleyin.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {seriesOfColor({ id: editId, seriesId: formSeriesId }).map(s => {
                          const yazilan = seriesNos[s.id] ?? "";
                          const no = parseColorNo(yazilan) ?? parseColorNo(form.colorNo);
                          return (
                            <div key={s.id} className="flex items-center gap-2">
                              <span className="w-24 shrink-0 truncate text-xs">{s.name}</span>
                              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                                {formatColorCode(s.prefix, no) ?? `${colorCodePrefix(s.prefix)}—`}
                              </span>
                              <Input
                                value={yazilan}
                                onChange={e =>
                                  setSeriesNos(p => ({ ...p, [s.id]: e.target.value }))
                                }
                                className="h-8 font-mono"
                                placeholder={
                                  form.colorNo ? `varsayılan ${form.colorNo}` : "numara yok"
                                }
                                inputMode="numeric"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0"
                                disabled={suggesting !== null}
                                onClick={() => void suggestColorNo(s.id)}
                              >
                                {suggesting === s.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Üret"
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Her serinin kendi numara düzeni olabilir; boş bırakılan seri varsayılan
                      numarayı kullanır. Numara seri İÇİNDE tekildir — CND1004 ile MTR1004 farklı
                      ürünlerdir, çakışma değildir.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Uluslararası ad</Label>
                  <Input
                    value={form.nameEn}
                    onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    placeholder="MAGENTA"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Satış adında Türkçe adın yanına yazılır: MAGENTA (FUŞYA). Boşsa yalnız Türkçe
                    ad kullanılır.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Renk</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.hex}
                      onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
                      className="h-9 w-14 cursor-pointer rounded-md border bg-transparent"
                    />
                    <Input
                      value={form.hex}
                      onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Seriye kilitle</Label>
                  <Select
                    value={form.seriesId}
                    onValueChange={v => setForm(f => ({ ...f, seriesId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Kilitleme (tüm seriler)</SelectItem>
                      {(series ?? []).map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Yalnız bir seride anlamı olan renkler için (RAL kodları gibi). Hangi seride
                    üretileceğinin asıl yeri Seri Uyumluluğu ekranıdır; burası kilit, kapsam değil.
                  </p>
                </div>
              </>
            )}

            {kind === "packagings" && (
              <>
                <div className="space-y-1.5">
                  <Label>Hacim (ml)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.volumeMl}
                    onChange={e => setForm(f => ({ ...f, volumeMl: e.target.value }))}
                    placeholder="100"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Reçete ölçeklemesinin paydası. Boş bırakılırsa bu ambalajda reçete
                    ölçeklenemez.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Stok kalemi (şişe/kutu)</Label>
                  <Select
                    value={form.materialId}
                    onValueChange={v => setForm(f => ({ ...f, materialId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Bağlı değil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Bağlı değil</SelectItem>
                      {(materials ?? [])
                        .filter(m => m.type === "ambalaj")
                        .map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Bağlanırsa kapasite hesabı şişeyi de kısıt sayar — boya var ama şişe yoksa
                    üretim görünmez.
                  </p>
                </div>
              </>
            )}

            {(kind === "families" || kind === "packagings") && (
              <div className="space-y-1.5">
                <Label>SKU eki</Label>
                <Input
                  value={form.skuSegment}
                  onChange={e => setForm(f => ({ ...f, skuSegment: e.target.value }))}
                  className="font-mono"
                  placeholder={kind === "families" ? "ab" : "100"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ürün kodunda kullanılır: aoccndred1822<strong>ab100</strong>
                </p>
              </div>
            )}

            {kind === "useCases" && (
              <div className="space-y-1.5">
                <Label>Başlık şablonu</Label>
                <Input
                  value={form.titlePattern}
                  onChange={e => setForm(f => ({ ...f, titlePattern: e.target.value }))}
                  placeholder="{{renk}} {{kullanim}} Boyası {{ambalaj}}"
                />
                <p className="text-[11px] text-muted-foreground">
                  Değişkenler: {"{{marka}} {{seri}} {{renk}} {{form}} {{ambalaj}} {{kullanim}}"} —
                  boş bırakılırsa otomatik başlık kurulur.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Rengin katalog kodları — HER SERİDE AYRI.
 *
 * Bu hücre eskiden tek bir kod basıyordu: rengin numarasının başına listedeki
 * ilk serinin ön eki ekleniyordu. Sonuç, "tüm seriler"de kullanılan bir renge
 * "CND1026" yazmak — yani her rengi CANDY'ye aitmiş gibi göstermekti. Renk
 * METEOR ürününde MTR ile basılıyor, ekranda CND yazıyordu.
 *
 * Artık rengin gerçekten üretildiği her seri için o serinin kodu ayrı ayrı
 * yazılıyor. Serinin kendi numarası varsa koyu, rengin varsayılan numarasına
 * düşüyorsa soluk — kullanıcı hangisinin tanımlı olduğunu görüyor.
 */
function ColorCodes({
  color,
  series,
  index,
}: {
  color: { id: number; code: string; colorNo: number | null; seriesId: number | null };
  series: { id: number; name: string; prefix: string | null }[];
  index: ReturnType<typeof makeColorCodeIndex>;
}) {
  // Renksiz yer tutucu katalog kodu almaz: tinerin etiketine renk kodu
  // basılması bir kodlama hatası değil, ürün hatasıdır.
  if (isNeutralColor(color.code)) {
    return <span className="text-xs text-muted-foreground">renksiz — kod basılmaz</span>;
  }
  if (series.length === 0) {
    return (
      <span className="text-xs text-amber-600" title="Seri Uyumluluğu ekranından bu rengi bir seriye ekleyin">
        hiçbir seride üretilmiyor
      </span>
    );
  }

  const shown = series.slice(0, 3);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map(s => {
        const own = index.overrideOf(s.id, color.id);
        const code = index.codeOf(s.id, color.id, color.colorNo);
        return (
          <span
            key={s.id}
            title={`${s.name} — ${own != null ? "serinin kendi numarası" : "rengin varsayılan numarası"}`}
            className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
              own != null ? "border-primary/40 text-foreground" : "text-muted-foreground"
            }`}
          >
            {code ?? `${colorCodePrefix(s.prefix)}—`}
          </span>
        );
      })}
      {series.length > shown.length && (
        <span className="text-xs text-muted-foreground">+{series.length - shown.length}</span>
      )}
      {color.colorNo == null && series.some(s => index.overrideOf(s.id, color.id) == null) && (
        <span
          className="text-xs text-amber-600"
          title="Numarası olmayan rengin kartında rengin adı basılır"
        >
          numara yok
        </span>
      )}
    </span>
  );
}

/**
 * Ambalajın çekim özeti — varsayılan kare + kaç seriye özel çekim var.
 *
 * Listede küçük bir kare göstermek, "hangi ambalajın görseli eksik" sorusunu
 * ayrı bir denetim ekranı açmadan cevaplıyor: Renk Stüdyosu görselsiz ambalajı
 * çizemiyor ve eksiği ancak kart üretilirken fark ediliyordu.
 */
function PackagingThumb({
  images,
  packagingId,
  onClick,
}: {
  images: Array<{ id: number; packagingId: number; seriesId: number | null; updatedAt: Date | string }>;
  packagingId: number;
  onClick: () => void;
}) {
  const mine = images.filter(i => i.packagingId === packagingId);
  const cover = mine.find(i => i.seriesId == null) ?? mine[0];
  const perSeries = mine.filter(i => i.seriesId != null).length;

  return (
    <button
      type="button"
      onClick={onClick}
      title={cover ? "Çekimleri düzenle" : "Ambalaj görseli yükle"}
      className="flex items-center gap-2 rounded border p-1 hover:bg-accent"
    >
      <span className="flex size-10 items-center justify-center overflow-hidden rounded bg-white">
        {cover ? (
          <img
            src={`${packagingImageUrl(cover.id)}?v=${new Date(cover.updatedAt).getTime()}`}
            alt=""
            className="size-full object-contain"
          />
        ) : (
          <ImagePlus className="size-4 text-muted-foreground" />
        )}
      </span>
      {perSeries > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          +{perSeries} seri
        </Badge>
      )}
    </button>
  );
}
