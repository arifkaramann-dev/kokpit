import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  downscaleToDataUrl,
  forceExactColor,
  labToHexString,
  measureColorFromImage,
  readAsDataUrl,
  slug,
} from "@/lib/renkStudyo";
import SablonEditor from "@/components/SablonEditor";
import { buildCards } from "@/lib/renkCards";
import { TEMPLATES, fallbackPackaging, getSeries, type PaintInfo } from "@/lib/renkTemplates";
import type { PaletteEntry, TemplateLayout } from "@shared/color/layout";
import {
  packagingImageUrl,
  resolvePackagingImageSrc,
  seriesPackRange,
} from "@shared/color/packagingImage";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lab } from "@shared/color/color";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * Renk Stüdyosu — ürünün renginde görsel üret, pazarlama karesine dönüştür.
 *
 * ── İki ayrı iş, iki ayrı sekme ────────────────────────────────────────────
 *   1) OBJE ÜRETİMİ: ürün seç → AI o ürünün renginde objeyi çizsin
 *   2) PAZARLAMA GÖRSELLERİ: bir obje karesi seç → şablonlara bas
 *
 * Başta ikisi tek ekrandaydı ve on ayrı alan tek kolona diziliyordu: üretimin
 * girdileri (referans fotoğraf, istem, model) ile şablonun girdileri (gümüş
 * baz, ambalaj, yerleşim) aynı formda karışıyordu. Daha kötüsü, kartları
 * yeniden basmak için AI'ı yeniden çalıştırmak gerekiyordu — yerleşimi
 * düzeltip aynı kareyi tekrar basmanın yolu yoktu.
 *
 * Ayrıldığında ikinci adım kayıtlı görsellerle de çalışıyor: obje bir kez
 * üretilir, şablon defalarca denenir. Üretim sekmesinden çıkan kare ikinci
 * sekmeye elden devredilir (`Handoff`), yani akış tek tıkla devam eder.
 */

type MasterRow = {
  id: number;
  colorId: number;
  seriesId: number;
  familyId: number;
  packagingId: number;
  name?: string | null;
  internalSku: string;
};

type ColorRow = {
  id: number;
  code: string;
  name: string;
  nameEn?: string | null;
  hex?: string | null;
  finish?: string | null;
};

type NamedRow = { id: number; code?: string | null; name: string; volumeMl?: string | null };

/** Üretim sekmesinden pazarlama sekmesine devredilen iş. */
type Handoff = { masterId: number; image: string };

/**
 * Katalog bitiş türü → şablon seri kodu.
 *
 * İki ayrı sözlük: `colors.finish` satış etiketi, şablonun `seriesCode`'u
 * marka hattı (VIVID/METEOR) + efekt. Kapak yazısı için yaklaşık eşleme
 * yeterli; tam karşılığı olmayan değerler düz (VS) sayılıyor.
 */
const SERIES_CODE_BY_FINISH: Record<string, string> = {
  duz: "VS",
  metalik: "VM",
  sedef: "VP",
  candy: "VC",
  neon: "VS",
  seffaf: "VC",
};

/** Üretimde ne çizileceğine dair hazır başlangıçlar. */
const SUBJECT_PRESETS = [
  { id: "damla", label: "Boya damlası", text: "a single glossy drop of automotive paint on a flat surface" },
  { id: "kasik", label: "Numune kaşığı", text: "an automotive paint test spray-out spoon" },
  { id: "panel", label: "Kaporta paneli", text: "a curved automotive body panel" },
  { id: "govde", label: "Otomobil gövdesi", text: "a smooth sculpted car body form, three-quarter view" },
  { id: "kask", label: "Kask", text: "a motorcycle helmet" },
  { id: "depo", label: "Motosiklet deposu", text: "a motorcycle fuel tank" },
];

// ---------------------------------------------------------------------------

/**
 * Ürün seçici — iki sekmenin ortak parçası.
 *
 * Aynı arama+liste iki yere kopyalanmıştı; biri düzeltildiğinde diğeri
 * geride kalıyordu. Tek bileşen, tek davranış.
 */
function UrunSecici({
  masters,
  colorById,
  packById,
  loading,
  value,
  onChange,
}: {
  masters: MasterRow[];
  colorById: Map<number, ColorRow>;
  packById: Map<number, NamedRow>;
  loading?: boolean;
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return masters.slice(0, 200);
    return masters
      .filter(m => {
        const c = colorById.get(m.colorId);
        const hay = [m.name, m.internalSku, c?.code, c?.name].filter(Boolean).join(" ").toLocaleLowerCase("tr");
        return hay.includes(q);
      })
      .slice(0, 200);
  }, [masters, query, colorById]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ürün adı, SKU veya renk ara"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded border">
        {loading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Yükleniyor…
          </div>
        ) : !filtered.length ? (
          <div className="p-3 text-sm text-muted-foreground">
            {masters.length ? "Aramaya uyan ürün yok." : "Katalogda ürün yok."}
          </div>
        ) : (
          filtered.map(m => {
            const c = colorById.get(m.colorId);
            const p = packById.get(m.packagingId);
            const active = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent ${
                  active ? "bg-accent" : ""
                }`}
              >
                <span
                  className="size-4 shrink-0 rounded-full border"
                  style={{ background: c?.hex || "#e5e7eb" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.name || m.internalSku}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c?.code, c?.name, p?.name].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {active && <Check className="size-4 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Serinin renk paleti — palet karesinin çizdiği liste.
 *
 * Kaynak, uyumluluk tablosu değil KATALOĞUN KENDİSİ: o seride master'ı olan
 * renkler. Uyumluluk "üretilebilir"i söyler, palet karesi ise müşteriye
 * "satılıyor" demek.
 *
 * Kutularda rengin STÜDYO KARESİ çizilir. Düz hex kutusu boyayı anlatmıyor:
 * katalogdaki çoğu rengin hex'i boş (renk kaynağı fotoğraf) ve dolu olanlarda
 * bile metalik pulun çakması, candy'nin derinliği düz karede kayboluyor.
 * Görseli olan renk varsa palet YALNIZ onlardan kurulur; hiçbirinin görseli
 * yoksa hex'e düşülür ki kare hiç üretilememektense bir şey gösterebilsin.
 */
function buildPalette(opts: {
  masters: MasterRow[];
  colorById: Map<number, ColorRow>;
  seriesId: number | null | undefined;
  activeColorId?: number | null;
  images?: Array<{ colorId: number; url: string }>;
}): PaletteEntry[] {
  const { masters, colorById, seriesId, activeColorId, images = [] } = opts;
  if (seriesId == null) return [];
  const bySrc = new Map(images.map(i => [i.colorId, i.url]));
  const seen = new Set<number>();
  const out: Array<PaletteEntry & { code: string }> = [];
  for (const m of masters) {
    if (m.seriesId !== seriesId || seen.has(m.colorId)) continue;
    seen.add(m.colorId);
    const c = colorById.get(m.colorId);
    if (!c) continue;
    out.push({
      code: c.code,
      name: c.name,
      hex: c.hex ?? null,
      src: bySrc.get(c.id) ?? null,
      active: c.id === activeColorId,
    });
  }
  const withImage = out.filter(e => e.src);
  const list = withImage.length ? withImage : out;
  // Kod sırası: katalogda renkler koda göre aranıyor, kart da aynı sırayı
  // gösterirse müşteri ilandaki kodu palette gözle bulabiliyor.
  return list.sort((a, b) => a.code.localeCompare(b.code, "tr")).slice(0, 48);
}

/** Katalog boyutlarını iki sekmenin de ihtiyaç duyduğu biçimde toparlar. */
function useKatalogBoyutlari() {
  const { data: masters, isLoading: mastersLoading } = trpc.katalog.masters.useQuery();
  const { data: dims } = trpc.katalog.dimensions.useQuery();

  const colors = (dims?.colors ?? []) as ColorRow[];
  const packagings = (dims?.packagings ?? []) as NamedRow[];
  const colorById = useMemo(() => new Map(colors.map(c => [c.id, c])), [colors]);
  const packById = useMemo(() => new Map(packagings.map(p => [p.id, p])), [packagings]);

  return {
    rows: (masters ?? []) as MasterRow[],
    mastersLoading,
    dims,
    colors,
    packagings,
    colorById,
    packById,
  };
}

// ---------------------------------------------------------------------------

/** 1. adım: AI ile obje üretimi. Şablon işi burada YOK. */
function ObjeUretimi({ onDevret }: { onDevret: (h: Handoff) => void }) {
  const utils = trpc.useUtils();
  const { rows, mastersLoading, colorById, packById } = useKatalogBoyutlari();
  const { data: references } = trpc.renkStudyo.references.useQuery();
  const { data: status } = trpc.renkStudyo.status.useQuery();

  const [masterId, setMasterId] = useState<number | null>(null);
  const [referenceId, setReferenceId] = useState<string>("");
  const [subjectId, setSubjectId] = useState(SUBJECT_PRESETS[0].id);
  const [subject, setSubject] = useState(SUBJECT_PRESETS[0].text);
  const [exact, setExact] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  // Model seçimi tarayıcıda hatırlanıyor: her açılışta yeniden seçmek,
  // arka arkaya renk üretirken en sık tekrarlanan tıklama olurdu.
  const [model, setModel] = useState<string>(
    () => localStorage.getItem("renkStudyo.model") ?? "",
  );

  // Boyanın referans fotoğrafları. Kalıcı DEĞİL — istekle birlikte gidiyor,
  // veritabanına yazılmıyor. Her renk için farklı kareler yüklenebilsin diye:
  // bunlar bir "obje kütüphanesi" değil, o üretimin renk kaynağı.
  const [refImages, setRefImages] = useState<string[]>([]);
  const refFileRef = useRef<HTMLInputElement>(null);

  const [extra, setExtra] = useState("");
  // Referanstan ölçülen renk — kullanıcı neyin hedeflendiğini görsün.
  const [measured, setMeasured] = useState<string | null>(null);
  const [usedPrompt, setUsedPrompt] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const master = rows.find(m => m.id === masterId) ?? null;
  const color = master ? (colorById.get(master.colorId) ?? null) : null;

  const models = status?.models ?? [];
  // Kayıtlı seçim bu sağlayıcıda yoksa (sağlayıcı değişmiş olabilir) ilkine düş.
  const activeModel = models.some(m => m.id === model) ? model : (models[0]?.id ?? "");

  const addRefImages = async (files: File[]) => {
    const room = 6 - refImages.length;
    if (room <= 0) {
      toast.error("En fazla 6 referans görsel");
      return;
    }
    try {
      const added = await Promise.all(files.slice(0, room).map(f => downscaleToDataUrl(f)));
      setRefImages(prev => [...prev, ...added].slice(0, 6));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel okunamadı");
    }
  };

  const generate = trpc.renkStudyo.generateForColor.useMutation();

  const onGenerate = async () => {
    // Hex ARTIK ZORUNLU DEĞİL. Rengin kaynağı öncelikle referans fotoğraf;
    // hex yalnız fotoğraf yokken gerekiyor. Katalogdaki birçok rengin hex'i
    // boş ve bu, boyanın fotoğrafı elimizdeyken üretimi engellememeli.
    if (!refImages.length && !color?.hex) {
      toast.error(
        "Renk kaynağı yok: boyanın fotoğrafını yükle ya da bu rengin hex kodunu tanımla.",
      );
      return;
    }
    setBusy(true);
    setWarning(null);
    setUsedPrompt(null);
    setMeasured(null);
    try {
      const res = await generate.mutateAsync({
        hex: color?.hex || undefined,
        colorName: color ? [color.name, color.nameEn].filter(Boolean).join(" / ") || undefined : undefined,
        finish: color?.finish ?? undefined,
        referenceImages: refImages.length ? refImages : undefined,
        referenceId: referenceId ? Number(referenceId) : null,
        subject,
        extra: extra.trim() || undefined,
        model: activeModel || undefined,
      });

      // Modele gerçekten ne gittiğini göster: sonuç beklenenden farklıysa
      // ilk bakılacak yer istemdir, tahmin etmek yerine okunabilsin.
      setUsedPrompt(res.prompt);

      // Düzeltme bir HEDEF gerektiriyor. Hedef önce hex'ten, hex yoksa
      // referans fotoğraftan ÖLÇÜLEREK bulunuyor — böylece katalogda hex'i
      // olmayan renklerde de renk oturtulabiliyor.
      let target: string | Lab | null = color?.hex || null;
      if (exact && !target && refImages.length) {
        target = await measureColorFromImage(refImages[0]);
        if (target) setMeasured(labToHexString(target));
      }

      if (!exact || !target) {
        setPreview(res.data);
        if (exact && !target) {
          setWarning(
            "Renk düzeltmesi için hedef bulunamadı: ne hex tanımlı ne de referanstan ölçülebildi.",
          );
        }
        return;
      }

      const fixed = await forceExactColor(res.data, target);
      setPreview(fixed.data);
      if (fixed.noBackgroundFound) {
        setWarning(
          "Üretilen görselde beyaz fon bulunamadı; renk düzeltmesi görselin tamamına uygulandı.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Üretim başarısız");
    } finally {
      setBusy(false);
    }
  };

  const saveMaster = trpc.renkStudyo.saveToMaster.useMutation({
    onSuccess: () => {
      toast.success("Ürüne kaydedildi");
      void utils.katalog.invalidate();
      void utils.renkStudyo.masterImages.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const saveColor = trpc.renkStudyo.saveToColor.useMutation({
    onSuccess: r => {
      toast.success(
        r.added > 0
          ? `${r.added} ürüne kaydedildi${r.skipped ? `, ${r.skipped} zaten vardı` : ""}`
          : "Bu görsel zaten tüm ürünlerde vardı",
      );
      void utils.renkStudyo.masterImages.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const saving = saveMaster.isPending || saveColor.isPending;

  return (
    <div className="space-y-4">
      {status && !status.provider && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Görsel üretimi yapılandırılmamış</p>
            <p>
              Render → Environment altında <code>OPENAI_API_KEY</code> ya da{" "}
              <code>GEMINI_API_KEY</code> girilmeli. Anahtar olmadan üretim çalışmaz;
              referans obje yükleme ve mevcut görselleri ürüne kaydetme çalışır.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>Ürün</Label>
            <UrunSecici
              masters={rows}
              colorById={colorById}
              packById={packById}
              loading={mastersLoading}
              value={masterId}
              onChange={setMasterId}
            />

            {color && (
              <p className="text-xs text-muted-foreground">
                Renk üründen geliyor: <strong>{color.code}</strong> · {color.name}
                {color.finish ? ` · ${color.finish}` : ""}
                {color.hex ? (
                  <>
                    {" · "}
                    <code>{color.hex}</code>
                  </>
                ) : (
                  <>
                    {" · "}
                    <span className="text-amber-600">
                      hex tanımsız — renk referans fotoğraflardan alınacak
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Renk örneği — boyanın gerçek fotoğrafları */}
          <div className="space-y-2 border-t pt-4">
            <Label>Renk örneği (referans fotoğraflar)</Label>
            <p className="text-xs text-muted-foreground">
              Boyanın gerçek fotoğraflarını yükle; model rengi ve kaplamayı bunlardan
              okur. Farklı açılardan 2-3 kare tek kareden çok daha doğru sonuç verir —
              tek karede parlama ya da gölge rengi kaydırabilir.
            </p>

            {refImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {refImages.map((src, i) => (
                  <div key={i} className="group relative">
                    <img
                      src={src}
                      alt={`Referans ${i + 1}`}
                      className="size-20 rounded border object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Kaldır"
                      onClick={() => setRefImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 shadow"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={refFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void addRefImages(files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={refImages.length >= 6}
              onClick={() => refFileRef.current?.click()}
            >
              <Upload className="mr-2 size-4" />
              {refImages.length ? `Görsel ekle (${refImages.length}/6)` : "Renk örneği yükle"}
            </Button>
            {refImages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {color && !color.hex
                  ? "Bu rengin hex kodu tanımlı değil, yani üretim için fotoğraf şart."
                  : "Yüklemezsen model rengi yalnız hex kodundan üretir — kaplamanın dokusunu bilemez."}
              </p>
            )}
          </div>

          {/* Ne çizilecek */}
          <div className="space-y-2 border-t pt-4">
            <Label>Ne çizilsin</Label>
            <Select
              value={subjectId}
              onValueChange={v => {
                setSubjectId(v);
                const p = SUBJECT_PRESETS.find(x => x.id === v);
                if (p) setSubject(p.text);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_PRESETS.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea value={subject} onChange={e => setSubject(e.target.value)} rows={2} />
          </div>

          {/* İnce ayarlar KAPALI başlar.
              Günlük iş "ürünü seç, üret"; ek yönerge, referans obje, model ve
              renk düzeltmesi ara sıra dokunulan alanlar. Hepsini tek kolona
              dizmek formu iki ekran boyuna çıkarıyor ve asıl düğmeyi
              görünmez yapıyordu. Bir şey seçilmişse başlıkta yazıyor, yani
              kapalı panel bilgi saklamıyor. */}
          <Collapsible open={advanced} onOpenChange={setAdvanced}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded border p-2 text-left hover:bg-accent">
              <span className="min-w-0">
                <span className="block text-sm font-medium">İnce ayarlar</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    extra.trim() ? "ek yönerge" : null,
                    referenceId
                      ? (references ?? []).find(r => String(r.id) === referenceId)?.label
                      : "referans yok",
                    exact && color?.hex ? "renk tam tutulacak" : null,
                    models.length ? (models.find(m => m.id === activeModel)?.label ?? null) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${advanced ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>Ek yönerge</Label>
                <Textarea
                  value={extra}
                  onChange={e => setExtra(e.target.value)}
                  rows={2}
                  placeholder="Örn. üstten çekim, damla daha küçük, zemin hafif gri"
                />
                <p className="text-xs text-muted-foreground">
                  İstemin sonuna olduğu gibi eklenir; sonraki talimat öncekini ezdiği
                  için senin sözün hazır kalıpların üstünde kalır.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Referans obje</Label>
                <Select value={referenceId} onValueChange={setReferenceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Yok — model serbest çizsin" />
                  </SelectTrigger>
                  <SelectContent>
                    {(references ?? []).map(r => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sık kullandığın bir kareyi her seferinde yeniden yüklememek için
                  kaydedebilirsin. Yukarıdaki yüklemelere ek olarak gönderilir.
                </p>
              </div>

              {models.length > 0 && (
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={activeModel}
                    onValueChange={v => {
                      setModel(v);
                      localStorage.setItem("renkStudyo.model", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Sağlayıcı: {status?.provider === "openai" ? "OpenAI" : "Gemini"}. Model
                    hesabında açık değilse sağlayıcının hata mesajı olduğu gibi gösterilir.
                  </p>
                </div>
              )}

              <div className="flex items-start justify-between gap-3 rounded border p-3">
                <div className="min-w-0">
                  <Label className="text-sm">Rengi tam tutur</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {color?.hex
                      ? "AI kesin renk tutturmaz. Açıkken üretim sonrası renk ölçülüp hedefe oturtulur; gölge ve parlama korunur."
                      : "Bu rengin hex kodu tanımlı olmadığı için oturtulacak bir hedef yok. Renk referans fotoğraflardan gelir."}
                  </p>
                </div>
                <Switch checked={exact && !!color?.hex} onCheckedChange={setExact} disabled={!color?.hex} />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Referans uyarısı panel KAPALIYKEN DE görünür: şekil sabitlenmezse
              her renk farklı formda çıkıyor ve bu, kapalı bir panelin içinde
              saklanacak kadar küçük bir ayrıntı değil. */}
          {!referenceId && (references?.length ?? 0) > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Seçili referans obje yok — üretimde şekil sabitlenmeyecek, model her
              renkte farklı bir form çizebilir.
            </p>
          )}

          <Button className="w-full" disabled={!master || busy} onClick={() => void onGenerate()}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            AI ile bu renkte üret
          </Button>
        </Card>

        <Card className="flex min-h-[460px] flex-col items-center justify-center gap-3 p-4">
          {busy ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-sm">Üretiliyor… bu bir dakika sürebilir</span>
            </div>
          ) : preview ? (
            <>
              <img
                src={preview}
                alt="Üretilen görsel"
                className="max-h-[520px] w-auto rounded border bg-white"
              />
              {warning && (
                <p className="flex items-start gap-2 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {warning}
                </p>
              )}
              {measured && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ background: measured }}
                  />
                  Referanstan ölçülen renk: <code>{measured}</code>
                </span>
              )}

              {/* Karenin gidebileceği üç yer: bu ürün, rengin tüm ürünleri ya
                  da doğrudan şablonlar. Kaydetmek şablona basmanın ÖNKOŞULU
                  değil — beğenilmeyen kareyi kataloğa yazmadan denemek
                  mümkün olmalı. */}
              <div className="flex w-full max-w-2xl flex-wrap gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!master || saving}
                  onClick={() =>
                    master && preview && saveMaster.mutate({ masterId: master.id, data: preview })
                  }
                >
                  {saveMaster.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 size-4" />
                  )}
                  Bu ürüne kaydet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!master || saving}
                  onClick={() =>
                    master &&
                    preview &&
                    saveColor.mutate({
                      colorId: master.colorId,
                      seriesId: master.seriesId,
                      data: preview,
                    })
                  }
                >
                  {saveColor.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Layers className="mr-2 size-4" />
                  )}
                  Rengin tüm ürünlerine kaydet
                </Button>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!master}
                  onClick={() => master && onDevret({ masterId: master.id, image: preview })}
                >
                  Pazarlama görsellerine geç
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
              <p className="w-full max-w-2xl text-xs text-muted-foreground">
                Aynı rengin 30/100/250/500 ml'si aynı görseli kullanır. Zaten aynı
                görsele sahip ürünler atlanır.
              </p>

              {usedPrompt && (
                <details className="w-full max-w-2xl">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Kullanılan istem
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
                    {usedPrompt}
                  </p>
                </details>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {master ? "Üretmek için düğmeye bas" : "Soldan bir ürün seç"}
            </span>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * 2. adım: şablonlara basma.
 *
 * Obje karesi ÜÇ yerden gelebilir: üretim sekmesinden devredilen kare,
 * ürünün kayıtlı görselleri ya da elle yükleme. Üçü de aynı işi görüyor ve
 * hiçbiri AI çalıştırmayı gerektirmiyor — yerleşimi düzeltip aynı kareyi
 * tekrar basmak bedava olmalı.
 */
function PazarlamaGorselleri({
  handoff,
  onSablonDuzenle,
}: {
  handoff: Handoff | null;
  onSablonDuzenle: () => void;
}) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { rows, mastersLoading, dims, packagings, colorById, packById } = useKatalogBoyutlari();
  const { data: references } = trpc.renkStudyo.references.useQuery();
  const { data: packImages } = trpc.katalog.packagingImages.useQuery();
  const { data: layoutRows } = trpc.renkStudyo.layouts.useQuery();

  const [masterId, setMasterId] = useState<number | null>(handoff?.masterId ?? null);
  /** Devredilen kare — ürün değişirse artık geçerli değil. */
  const [fresh, setFresh] = useState<Handoff | null>(handoff);
  /** Seçili obje kaynağı: devredilen kare, kayıtlı görsel ya da yüklenen. */
  const [objectImage, setObjectImage] = useState<string | null>(handoff?.image ?? null);
  const [silverBaseId, setSilverBaseId] = useState<string>("");
  const [picked, setPicked] = useState<string[]>(() => TEMPLATES.map(t => t.id));
  const [cards, setCards] = useState<Array<{ id: string; label: string; data: string }>>([]);
  const [rendering, setRendering] = useState(false);
  /** Toplu üretim ilerlemesi — kaç varyant bitti. */
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  /** Büyütülen görsel — küçük resimde kutunun/yazının doğruluğu anlaşılmıyor. */
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Üretim sekmesi yeni bir kare devrettiğinde bu sekme onunla açılır.
  useEffect(() => {
    if (!handoff) return;
    setMasterId(handoff.masterId);
    setFresh(handoff);
    setObjectImage(handoff.image);
    setCards([]);
  }, [handoff]);

  const master = rows.find(m => m.id === masterId) ?? null;
  const color = master ? (colorById.get(master.colorId) ?? null) : null;

  const { data: saved } = trpc.renkStudyo.masterImages.useQuery(
    { masterId: masterId ?? 0 },
    { enabled: !!masterId },
  );

  // Serideki renklerin stüdyo kareleri — palet şablonu bunları diziyor.
  const { data: colorImages } = trpc.renkStudyo.colorImages.useQuery(
    { seriesId: master?.seriesId ?? 0 },
    { enabled: !!master },
  );

  /**
   * Kayıtlı görseller ikiye ayrılıyor: OBJE kareleri ve basılmış ŞABLON
   * kareleri (rolü bir şablon kimliği olanlar).
   *
   * Hepsi tek listede duruyordu ve kullanıcı bir pazarlama karesini "obje
   * karesi" olarak seçebiliyordu — kartın içine kart basmak. Ayrıca eski,
   * yanlış üretilmiş kareler orada duruyor ama silmenin yolu yoktu.
   */
  const templateIds = useMemo(() => new Set(TEMPLATES.map(t => t.id)), []);
  const objectSources = (saved ?? []).filter(i => i.hosted && !templateIds.has(i.role ?? ""));
  const savedCards = (saved ?? []).filter(i => i.hosted && templateIds.has(i.role ?? ""));

  const removeImage = trpc.katalog.deleteMasterImage.useMutation({
    onSuccess: () => {
      toast.success("Görsel silindi");
      void utils.renkStudyo.masterImages.invalidate();
      void utils.katalog.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const layouts = useMemo(() => {
    const out: Record<string, TemplateLayout> = {};
    for (const r of layoutRows ?? []) out[r.templateId] = r.layout as TemplateLayout;
    return out;
  }, [layoutRows]);

  /**
   * Şablonun ambalaj bilgisi — ÜRÜNDEN türetiliyor.
   *
   * Eskiden kutu, rengin bitiş türünden tahmin edilen bir "hat" üzerinden koda
   * gömülü altı dosyadan seçiliyordu. Oysa ürünün ambalajı ve serisi zaten
   * belli: doğru kutu tam olarak o çiftin çekimi.
   */
  const packInfo = useMemo(() => {
    if (!master) return null;
    const own = packById.get(master.packagingId) ?? null;
    const volume = own?.volumeMl != null ? parseFloat(String(own.volumeMl)) : 0;
    return {
      src: resolvePackagingImageSrc(packImages ?? [], master.packagingId, master.seriesId),
      name: own?.name ?? null,
      volumeMl: volume > 0 ? volume : null,
      volumeLabel: volume > 0 ? `${volume} ML` : null,
      range: seriesPackRange({
        packagings,
        seriesPackagings: dims?.seriesPackagings ?? [],
        images: packImages ?? [],
        seriesId: master.seriesId,
        limit: 4,
      }),
    };
  }, [master, packById, packImages, packagings, dims?.seriesPackagings]);

  /**
   * Serinin renk paleti — palet karesinin çizdiği liste.
   *
   * Kaynak, uyumluluk tablosu değil KATALOĞUN KENDİSİ: o seride master'ı olan
   * renkler. Uyumluluk "üretilebilir"i söyler, palet karesi ise müşteriye
   * "satılıyor" demek — ikisi aynı şey değil ve müşteriye gösterilen liste
   * gerçekten satılan renkler olmalı.
   */
  const palette = useMemo(
    () =>
      buildPalette({
        masters: rows,
        colorById,
        seriesId: master?.seriesId,
        activeColorId: master?.colorId,
        images: colorImages,
      }),
    [master, rows, colorById, colorImages],
  );

  /** Çekim yoksa devreye girecek yerleşik kutu — kullanıcı NE basılacağını görsün. */
  const packFallback = useMemo(
    () =>
      packInfo?.src
        ? null
        : fallbackPackaging(
            packInfo?.volumeMl,
            getSeries(SERIES_CODE_BY_FINISH[color?.finish ?? "duz"] ?? "VS").line,
          ),
    [packInfo?.src, packInfo?.volumeMl, color?.finish],
  );

  /**
   * Pazarlama karesi kaydetme — rol başına TEK güncel kare.
   *
   * Şablonu düzeltip aynı kareyi yeniden basmak sık yapılan iş; her denemede
   * ürün kartına bir kopya daha eklemek kartı çöple doldurup hangisinin
   * güncel olduğunu belirsizleştiriyordu. Obje karesi kaydetme (Obje Üretimi
   * sekmesi) bu kuralın DIŞINDA: orada birkaç farklı kare tutmak istenebilir.
   */
  const saveMany = trpc.renkStudyo.saveManyToMaster.useMutation({
    onSuccess: r => {
      toast.success(
        r.replaced
          ? `${r.added} görsel kaydedildi (${r.replaced} eski kare değiştirildi)`
          : `${r.added} görsel ürüne kaydedildi`,
      );
      void utils.katalog.invalidate();
      void utils.renkStudyo.masterImages.invalidate();
    },
    onError: e => toast.error(e.message),
  });


  const onUpload = async (file: File) => {
    try {
      // Obje karesi şablona ÇİZİLECEK; 4000 px'lik telefon fotoğrafı 1400'lük
      // kareye hiçbir şey katmıyor ama tarayıcıyı yavaşlatıyor.
      setObjectImage(await downscaleToDataUrl(file, 1400));
      setCards([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel okunamadı");
    }
  };

  /**
   * Pazarlama görsellerini basar.
   *
   * Obje görseli BİR KEZ seçilir, şablonlar aynı görselden türetilir. Her
   * şablon için yeniden üretmek hem pahalı hem tutarsız olurdu — kareler
   * arasında obje değişirse seri dağılır.
   */
  const render = async () => {
    if (!objectImage || !master) return;
    setRendering(true);
    try {
      // Renk hedefi: katalogdaki hex, yoksa OBJE KARESİNDEN ölçülen renk.
      // Renk şeridi ve kat progresyonu bir hedef istiyor; hex'i tanımlanmamış
      // renklerde ölçüm, kartı renksiz basmaktan iyidir.
      let hex = color?.hex || null;
      if (!hex) {
        const lab = await measureColorFromImage(objectImage);
        if (lab) hex = labToHexString(lab);
      }

      const paint: PaintInfo = {
        code: color?.code,
        nameTr: color?.name,
        nameEn: color?.nameEn,
        seriesCode: SERIES_CODE_BY_FINISH[color?.finish ?? "duz"] ?? "VS",
        hex,
        packagingSrc: packInfo?.src ?? null,
        packagingName: packInfo?.name ?? null,
        volumeLabel: packInfo?.volumeLabel ?? null,
        // Çekim yoksa yerleşik yedek BU HACİMDEN seçilir; ölçü tutmazsa kutu
        // hiç çizilmez. Ürünün hacmiyle ilgisiz bir kutu basmıyoruz.
        volumeMl: packInfo?.volumeMl ?? null,
        packRange: packInfo?.range.map(p => ({ label: p.label, src: p.src })),
        palette,
      };

      const out = await buildCards({
        objectImage,
        baseImage: silverBaseId ? `/api/img/sample/${silverBaseId}` : null,
        paint,
        layouts,
        only: picked,
      });
      setCards(out);
      if (!out.length) toast.error("Hiçbir şablon üretilemedi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Şablonlar üretilemedi");
    } finally {
      setRendering(false);
    }
  };

  /**
   * Aynı rengin diğer boyları — 30/100/250/500 ml, sprey…
   *
   * Aynı renk ve aynı seri, farklı ambalaj. Obje karesi hepsinde AYNI (renk
   * aynı), ama kutu farklı: bu yüzden kareler kopyalanamaz, her varyant için
   * o varyantın kutusuyla YENİDEN çizilmesi gerekir.
   */
  const variants = useMemo(() => {
    if (!master) return [];
    return rows.filter(m => m.colorId === master.colorId && m.seriesId === master.seriesId);
  }, [master, rows]);

  /**
   * Bütün boylara üretir ve kaydeder.
   *
   * Bir rengi bitirmek "her boy için ürün seç → üret → kaydet" demekti; dört
   * boyda aynı işi dört kez yapmak. Obje karesi zaten elimizde, tek değişen
   * kutu — o da Tanımlar'dan geliyor. Kalan iş döngü.
   */
  const renderAllVariants = async () => {
    if (!objectImage || !master || !variants.length) return;
    setBatch({ done: 0, total: variants.length });
    let cards = 0;
    const noPack: string[] = [];
    try {
      for (const m of variants) {
        const own = packById.get(m.packagingId) ?? null;
        const volume = own?.volumeMl != null ? parseFloat(String(own.volumeMl)) : 0;
        const src = resolvePackagingImageSrc(packImages ?? [], m.packagingId, m.seriesId);
        if (!src) noPack.push(own?.name ?? String(m.packagingId));

        let hex = color?.hex || null;
        if (!hex) {
          const lab = await measureColorFromImage(objectImage);
          if (lab) hex = labToHexString(lab);
        }

        const out = await buildCards({
          objectImage,
          baseImage: silverBaseId ? `/api/img/sample/${silverBaseId}` : null,
          layouts,
          only: picked,
          paint: {
            code: color?.code,
            nameTr: color?.name,
            nameEn: color?.nameEn,
            seriesCode: SERIES_CODE_BY_FINISH[color?.finish ?? "duz"] ?? "VS",
            hex,
            packagingSrc: src,
            packagingName: own?.name ?? null,
            volumeMl: volume > 0 ? volume : null,
            volumeLabel: volume > 0 ? `${volume} ML` : null,
            packRange: packInfo?.range.map(p => ({ label: p.label, src: p.src })),
            palette,
          },
        });

        if (out.length) {
          await saveMany.mutateAsync({
            masterId: m.id,
            images: out.map(c => ({ data: c.data, role: c.id })),
            // Aynı rolü değiştir: aynı işi ikinci kez çalıştırmak ürün kartını
            // ikiye katlamasın.
            replaceSameRole: true,
          });
          cards += out.length;
          // Seçili ürünün kareleri ekranda da görünsün.
          if (m.id === master.id) setCards(out);
        }
        setBatch(b => (b ? { ...b, done: b.done + 1 } : b));
      }

      toast.success(`${variants.length} boy · ${cards} görsel kaydedildi`, {
        description: noPack.length
          ? `Ambalaj çekimi olmayanlar: ${noPack.join(", ")} — o kartlarda kutu eksik ya da yerleşik yedek.`
          : undefined,
        duration: noPack.length ? 10000 : 5000,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toplu üretim başarısız");
    } finally {
      setBatch(null);
    }
  };

  const saving = saveMany.isPending || !!batch;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>Ürün</Label>
            <UrunSecici
              masters={rows}
              colorById={colorById}
              packById={packById}
              loading={mastersLoading}
              value={masterId}
              onChange={id => {
                setMasterId(id);
                // Devredilen kare başka ürünün karesiydi; sessizce taşınırsa
                // yanlış ürünün görseli yanlış ürüne kaydedilir.
                if (fresh && fresh.masterId !== id) {
                  setFresh(null);
                  setObjectImage(null);
                }
                setCards([]);
              }}
            />
            {color && (
              <p className="text-xs text-muted-foreground">
                Renk: <strong>{color.code}</strong> · {color.name}
                {color.hex ? (
                  <>
                    {" · "}
                    <code>{color.hex}</code>
                  </>
                ) : (
                  " · hex tanımsız — renk obje karesinden ölçülecek"
                )}
              </p>
            )}
          </div>

          {/* Obje kaynağı */}
          <div className="space-y-2 border-t pt-4">
            <Label>Obje karesi</Label>
            <p className="text-xs text-muted-foreground">
              Şablonun ortasına basılacak kare. Yeni üretmek şart değil — bu ürüne
              daha önce kaydettiğin bir görseli seçebilirsin.
            </p>

            <div className="flex flex-wrap gap-2">
              {fresh && (
                <ObjeSecenegi
                  src={fresh.image}
                  label="Yeni üretilen"
                  active={objectImage === fresh.image}
                  onClick={() => {
                    setObjectImage(fresh.image);
                    setCards([]);
                  }}
                />
              )}
              {/* Dış adresli görsel (pazaryerinden gelen) obje kaynağı olamaz:
                  canvas'tan piksel okuyoruz ve çapraz kaynak görsel canvas'ı
                  kirletiyor. Listelemek, tıklandığında anlaşılmaz bir güvenlik
                  hatası vermek olurdu.

                  Basılmış şablon kareleri de burada YOK: kartın içine kart
                  basmak istenen bir şey değil. Onlar aşağıda ayrı listede. */}
              {objectSources.map(img => (
                <ObjeSecenegi
                  key={img.id}
                  src={img.url}
                  label={img.role ?? "kayıtlı"}
                  active={objectImage === img.url}
                  onClick={() => {
                    setObjectImage(img.url);
                    setCards([]);
                  }}
                  onZoom={() => setZoom({ src: img.url, label: img.role ?? "kayıtlı" })}
                />
              ))}
            </div>

            {masterId && !fresh && !objectSources.length && (
              <p className="text-xs text-muted-foreground">
                Bu ürünün kullanılabilir obje karesi yok. Obje Üretimi sekmesinden bir
                kare üret ya da elindeki fotoğrafı yükle.
              </p>
            )}

            <input
              ref={uploadRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="mr-2 size-4" /> Kendi karemi yükle
            </Button>
          </div>

          {/* Ambalaj çekimi durumu.
              Eksikliği kart basıldıktan sonra değil ÖNCE görünmeli: yanlış
              kutuyla altı kare üretmek iki tıklamayı boşa harcamak demekti. */}
          {master && (
            <div className="flex items-center gap-2 rounded border p-2">
              {/* Kutuya tıklayınca büyür: "şablon hangi kutuyu basacak"
                  sorusunun cevabı 40 piksellik bir karede görünmüyor. */}
              <button
                type="button"
                title="Büyüt"
                disabled={!packInfo?.src && !packFallback}
                onClick={() =>
                  setZoom({
                    src: packInfo?.src || packFallback!.src,
                    label: `Ambalaj çekimi — ${packInfo?.name ?? ""}${
                      packInfo?.src ? "" : " (yerleşik yedek)"
                    }`,
                  })
                }
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-white"
              >
                {packInfo?.src || packFallback ? (
                  <img
                    src={packInfo?.src || packFallback!.src}
                    alt=""
                    className={`size-full object-contain ${packInfo?.src ? "" : "opacity-50"}`}
                  />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600" />
                )}
              </button>
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate font-medium">Ambalaj: {packInfo?.name ?? "—"}</div>
                <div className="text-muted-foreground">
                  {packInfo?.src
                    ? "çekim tanımlı — şablonlar bu kutuyu basacak"
                    : packFallback
                      ? `çekim yok — yerleşik ${packFallback.label} kullanılacak`
                      : "çekim yok — kartlarda kutu çizilmeyecek"}
                </div>
              </div>
              {!packInfo?.src && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation("/katalog?sekme=tanimlar")}
                >
                  Görsel yükle
                </Button>
              )}
            </div>
          )}

          {/* Hangi şablonlar */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Şablonlar</Label>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setPicked(prev => (prev.length === TEMPLATES.length ? [] : TEMPLATES.map(t => t.id)))
                  }
                >
                  {picked.length === TEMPLATES.length ? "Hiçbiri" : "Tümü"}
                </Button>
                <Button size="sm" variant="ghost" onClick={onSablonDuzenle}>
                  <Settings2 className="mr-1 size-4" /> Düzenle
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              {TEMPLATES.map(t => {
                const on = picked.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setPicked(prev =>
                        on ? prev.filter(x => x !== t.id) : [...prev, t.id],
                      )
                    }
                    className={`flex w-full items-start gap-2 rounded border p-2 text-left hover:bg-accent ${
                      on ? "border-primary/50 bg-accent/50" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                        on ? "bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {t.label}
                        {layouts[t.id] && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            düzenlendi
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gümüş baz YALNIZ kat progresyonu seçiliyken.
              Başka hiçbir şablon kullanmıyor; her zaman göstermek, formu
              ilgisiz bir alanla uzatmak demekti. */}
          {picked.includes("coats") && (
            <div className="space-y-2 border-t pt-4">
              <Label>Gümüş baz (kat progresyonu için)</Label>
              <Select value={silverBaseId} onValueChange={setSilverBaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Yok — kat progresyonu üretilemez" />
                </SelectTrigger>
                <SelectContent>
                  {(references ?? []).map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Candy'de altta gümüş metalik baz vardır, üstüne saydam renk katmanları
                biner. Katlar bu numuneden fizikle türetiliyor: 1. kat gümüş, 2. yarı
                saydam, 3. doygun. Referans Objeler sekmesinden bir gümüş numune kaydet.
              </p>
              {!silverBaseId && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Gümüş baz seçilmedi — kat progresyonu karesi üretilmeyecek.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            <Button
              className="w-full"
              disabled={!objectImage || !master || !picked.length || rendering || !!batch}
              onClick={() => void render()}
            >
              {rendering ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Layers className="mr-2 size-4" />
              )}
              Görselleri üret ({picked.length})
            </Button>

            {/* Toplu üretim: bir rengi TEK seferde bitirmek.
                Aynı renk dört boyda satılıyor ve kareler boy başına yeniden
                çizilmek zorunda (kutu değişiyor). Elle yapılınca dört kez
                aynı iş. */}
            <Button
              variant="secondary"
              className="w-full"
              disabled={!objectImage || !master || !picked.length || rendering || !!batch || variants.length < 2}
              onClick={() => void renderAllVariants()}
            >
              {batch ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Boxes className="mr-2 size-4" />
              )}
              {batch
                ? `Üretiliyor… ${batch.done}/${batch.total}`
                : `Bu rengin tüm boylarına üret (${variants.length})`}
            </Button>
            {variants.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {variants
                  .map(v => packById.get(v.packagingId)?.name ?? "?")
                  .join(" · ")}{" "}
                — her boy kendi ambalaj çekimiyle yeniden çizilir ve o ürüne kaydedilir.
                Aynı rolde eski kare varsa değiştirilir.
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          {!cards.length ? (
            <div className="space-y-4">
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <ImageIcon className="size-8" />
                {!master
                  ? "Soldan bir ürün seç."
                  : !objectImage
                    ? "Bir obje karesi seç ya da yükle."
                    : "Şablonları seç ve “Görselleri üret”e bas."}
              </div>

              {/* Bu ürüne DAHA ÖNCE kaydedilmiş kareler.
                  Görünür olmaları şart: eski bir üretimden kalan yanlış kare
                  (mesela yanlış kutulu ürün karesi) ürün kartında duruyor ve
                  yenisini basana kadar kimse fark etmiyordu. Buradan büyütüp
                  bakılabiliyor ve silinebiliyor. */}
              {savedCards.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <h2 className="text-sm font-medium">Bu üründe kayıtlı kareler</h2>
                  <p className="text-xs text-muted-foreground">
                    Daha önce kaydedilmiş şablon çıktıları. Yeniden ürettiğinde aynı
                    şablonun karesi değişir; eskiyen ya da yanlış olanı buradan
                    silebilirsin.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {savedCards.map(img => (
                      <div key={img.id} className="overflow-hidden rounded border">
                        <button
                          type="button"
                          title="Büyüt"
                          className="block w-full"
                          onClick={() =>
                            setZoom({ src: img.url, label: img.role ?? "kayıtlı kare" })
                          }
                        >
                          <img
                            src={img.url}
                            alt={img.role ?? ""}
                            className="aspect-square w-full bg-white object-contain"
                          />
                        </button>
                        <div className="flex items-center justify-between gap-1 border-t p-1.5">
                          <span className="truncate text-xs">
                            {TEMPLATES.find(t => t.id === img.role)?.label ?? img.role}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-destructive"
                            disabled={removeImage.isPending}
                            onClick={() => removeImage.mutate({ id: img.id })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">Pazarlama görselleri</h2>
                  <p className="text-xs text-muted-foreground">
                    Hepsi aynı obje karesinden türetildi — kareler arasında obje
                    değişmiyor, seri dağılmıyor. Pazaryeri ana görseli metin taşımaz
                    (Amazon/Trendyol şartı).
                  </p>
                </div>
                <Button
                  disabled={!master || saving}
                  onClick={() =>
                    master &&
                    saveMany.mutate({
                      masterId: master.id,
                      images: cards.map(c => ({ data: c.data, role: c.id })),
                      replaceSameRole: true,
                    })
                  }
                >
                  {saveMany.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Layers className="mr-2 size-4" />
                  )}
                  Hepsini ürüne kaydet ({cards.length})
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(c => (
                  <div key={c.id} className="overflow-hidden rounded border">
                    <button
                      type="button"
                      className="block w-full"
                      title="Büyüt"
                      onClick={() => setZoom({ src: c.data, label: c.label })}
                    >
                      <img src={c.data} alt={c.label} className="w-full bg-white object-contain" />
                    </button>
                    <div className="flex items-center justify-between gap-2 border-t p-2">
                      <span className="truncate text-xs font-medium">{c.label}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = c.data;
                            a.download = `${color?.code ?? "renk"}-${c.id}.png`;
                            a.click();
                          }}
                        >
                          <Download className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!master || saving}
                          onClick={() =>
                            master &&
                            saveMany.mutate({
                              masterId: master.id,
                              images: [{ data: c.data, role: c.id }],
                              replaceSameRole: true,
                            })
                          }
                        >
                          Kaydet
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <GorselPenceresi view={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

/**
 * Görsel büyütme penceresi.
 *
 * Küçük resme bakarak "kutu doğru mu, yazı doğru mu" anlaşılmıyordu; kareyi
 * indirip açmak gerekiyordu. Karta tıklayınca tam boy açılıyor.
 */
function GorselPenceresi({
  view,
  onClose,
}: {
  view: { src: string; label: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!view} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{view?.label}</DialogTitle>
        </DialogHeader>
        {view && (
          <div className="space-y-3">
            <img
              src={view.src}
              alt={view.label}
              className="max-h-[70vh] w-full rounded border bg-white object-contain"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = view.src;
                  a.download = `${slug(view.label) || "gorsel"}.png`;
                  a.click();
                }}
              >
                <Download className="mr-2 size-4" /> İndir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Obje kaynağı küçük resmi — seçili olan çerçeveli. */
function ObjeSecenegi({
  src,
  label,
  active,
  onClick,
  onZoom,
}: {
  src: string;
  label: string;
  active: boolean;
  onClick: () => void;
  onZoom?: () => void;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded border bg-white p-0.5 ${
        active ? "ring-2 ring-primary" : "hover:bg-accent"
      }`}
    >
      <button type="button" onClick={onClick} title={`${label} — seç`}>
        <img src={src} alt={label} className="size-16 object-contain" />
        <span className="block max-w-16 truncate px-0.5 pb-0.5 text-[10px] text-muted-foreground">
          {label}
        </span>
      </button>
      {onZoom && (
        <button
          type="button"
          title="Büyüt"
          onClick={onZoom}
          className="absolute right-0.5 top-0.5 rounded bg-background/80 p-0.5 opacity-60 shadow transition-opacity hover:opacity-100"
        >
          <Maximize2 className="size-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Şablon görselleri — kullanıcının yüklediği logo, doku.
 *
 * Referans objelerden AYRI: biri üretime girip şekli sabitler, diğeri karta
 * çizilir. Aynı listede karışırlarsa kullanıcı üretimde logosunu, kartta
 * gümüş bazını seçer.
 *
 * Ambalaj çekimleri BURADA DEĞİL: onlar ambalaj tanımına bağlı ve Tanımlar →
 * Ambalajlar'dan yükleniyor, yoksa hangi kutunun hangi ambalaj olduğu yine
 * kullanıcının aklında kalırdı.
 */
function SablonGorselleri() {
  const utils = trpc.useUtils();
  const { data: assets, isLoading } = trpc.renkStudyo.assets.useQuery();
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = trpc.renkStudyo.saveAsset.useMutation({
    onSuccess: () => {
      toast.success("Görsel kaydedildi");
      setLabel("");
      void utils.renkStudyo.assets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const remove = trpc.renkStudyo.deleteReference.useMutation({
    onSuccess: () => {
      toast.success("Silindi");
      void utils.renkStudyo.assets.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-medium">Şablon görselleri</h2>
        <p className="text-xs text-muted-foreground">
          Logon, arka plan dokun, serbest görseller. Yükledikten sonra Şablon
          Editörü'nde bir görsel katmanının <strong>Kaynak</strong> listesinde çıkar.
          Ambalaj kutuları buraya değil, <strong>Tanımlar → Ambalajlar</strong>'a
          yüklenir — şablon doğru kutuyu oradan seçiyor.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <Label className="text-xs">Ad</Label>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Örn. arka plan dokusu"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) {
              if (!label.trim()) toast.error("Önce bir ad yaz");
              else
                void readAsDataUrl(f).then(data =>
                  save.mutate({ objectType: slug(label), label: label.trim(), data }),
                );
            }
            e.target.value = "";
          }}
        />
        <Button variant="outline" disabled={save.isPending} onClick={() => fileRef.current?.click()}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
          Görsel yükle
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Yükleniyor…
        </div>
      ) : !assets?.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Henüz şablon görseli yok.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {assets.map(a => (
            <div key={a.id} className="overflow-hidden rounded border">
              <img
                src={`/api/img/sample/${a.id}`}
                alt={a.label}
                className="aspect-square w-full bg-white object-contain"
              />
              <div className="flex items-center justify-between gap-1 border-t p-1.5">
                <span className="truncate text-xs">{a.label}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: a.id })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReferansObjeler() {
  const utils = trpc.useUtils();
  const { data: references, isLoading } = trpc.renkStudyo.references.useQuery();
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void utils.renkStudyo.references.invalidate();

  const save = trpc.renkStudyo.saveReference.useMutation({
    onSuccess: () => {
      toast.success("Referans kaydedildi");
      setLabel("");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const remove = trpc.renkStudyo.deleteReference.useMutation({
    onSuccess: () => {
      toast.success("Silindi");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const onUpload = async (file: File) => {
    if (!label.trim()) {
      toast.error("Önce bir ad yaz");
      return;
    }
    try {
      const data = await readAsDataUrl(file);
      save.mutate({ objectType: slug(label), label: label.trim(), data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dosya okunamadı");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Referans obje, üretimde şekli sabitler. Aynı referansla üretilen bütün
          renkler aynı formda, aynı açıda ve aynı ışıkta çıkar — müşteri iki kareyi
          yan yana koyduğunda şekil farkını değil rengi görür.
        </p>

        <div className="space-y-2">
          <Label>Ad</Label>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Örn. Gövde formu"
          />
          {label && (
            <p className="text-xs text-muted-foreground">
              Anahtar: <code>{slug(label)}</code> — aynı anahtar ikinci kez
              kaydedilirse üzerine yazılır.
            </p>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={save.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Upload className="mr-2 size-4" />
          )}
          Görsel yükle
        </Button>
        <p className="text-xs text-muted-foreground">
          Beyaz fonlu, tek objeli kare çekim en iyi sonucu verir.
        </p>
      </Card>

      <Card className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Yükleniyor…
          </div>
        ) : !references?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Henüz referans obje yok. Soldan bir görsel yükle.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {references.map(r => (
              <div key={r.id} className="overflow-hidden rounded border">
                <img
                  src={`/api/img/sample/${r.id}`}
                  alt={r.label}
                  className="aspect-square w-full bg-white object-contain"
                />
                <div className="flex items-center justify-between gap-2 border-t p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.objectType}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">Referans</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: r.id })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Editör sekmesi — kayıtlı yerleşimleri okur, düzenlemeyi geri yazar. */
function SablonlarSekmesi() {
  const utils = trpc.useUtils();
  const { rows: masters, colorById } = useKatalogBoyutlari();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: layoutRows } = trpc.renkStudyo.layouts.useQuery();
  const { data: assets } = trpc.renkStudyo.assets.useQuery();
  const { data: packImages } = trpc.katalog.packagingImages.useQuery();

  const saved = useMemo(() => {
    const out: Record<string, TemplateLayout> = {};
    for (const r of layoutRows ?? []) out[r.templateId] = r.layout as TemplateLayout;
    return out;
  }, [layoutRows]);

  const save = trpc.renkStudyo.saveLayout.useMutation({
    onSuccess: () => {
      toast.success("Şablon kaydedildi");
      void utils.renkStudyo.layouts.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const reset = trpc.renkStudyo.resetLayout.useMutation({
    onSuccess: () => {
      toast.success("Fabrika ayarına dönüldü");
      void utils.renkStudyo.layouts.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Örnek olarak katalogdaki ilk ÜRÜNÜN rengi: editörde gerçek bir kare
  // görünsün, boş yer tutucularla düzenlemek yanıltıcı olur. Ürün üzerinden
  // gidiliyor çünkü palet önizlemesi seriyi bilmek zorunda.
  const colors = (dims?.colors ?? []) as ColorRow[];
  const örnekMaster = masters[0] ?? null;
  const örnek = örnekMaster ? (colorById.get(örnekMaster.colorId) ?? colors[0]) : colors[0];

  const { data: örnekColorImages } = trpc.renkStudyo.colorImages.useQuery(
    { seriesId: örnekMaster?.seriesId ?? 0 },
    { enabled: !!örnekMaster },
  );

  /**
   * Önizlemenin ambalajı — GERÇEK çekimlerden.
   *
   * Editörde yerleşik örnek kutuyu göstermek, kullanıcı kendi kutusunu
   * yükledikten sonra kareyi yeniden düzenlemesi demek olurdu: kendi
   * fotoğrafının oranı farklı, kutu kutunun yerine oturmuyor. Çekim varsa
   * doğrudan o çiziliyor.
   */
  const packagings = (dims?.packagings ?? []) as NamedRow[];

  /**
   * Önizlemenin ambalajı — KULLANICI SEÇER.
   *
   * Önceki hâli listedeki ilk çekimi alıyordu; hangi ambalaja ait olduğuna
   * bakmadan. Bir sprey çekimi yüklüyse "Ürün + Numune" şablonunun
   * önizlemesinde sprey görünüyordu ve kullanıcı 100 ml'lik yerleşimi sprey
   * kutusuna göre ayarlıyordu. Hangi kutuya göre tasarladığın, tahmin
   * edilecek bir şey değil.
   */
  const [previewPackagingId, setPreviewPackagingId] = useState<string>("");
  const previewPackaging =
    packagings.find(p => String(p.id) === previewPackagingId) ??
    // Varsayılan: çekimi OLAN en küçük ambalaj. Çekimi olmayan bir ambalajı
    // varsayılan yapmak, önizlemeyi boş kutuyla açmak olurdu.
    packagings
      .filter(p => (packImages ?? []).some(i => i.packagingId === p.id))
      .sort(
        (a, b) => parseFloat(String(a.volumeMl ?? 0)) - parseFloat(String(b.volumeMl ?? 0)),
      )[0] ??
    packagings[0] ??
    null;

  const packSample = useMemo(() => {
    const rows = (packImages ?? []).slice();
    const own = previewPackaging
      ? (rows.find(r => r.packagingId === previewPackaging.id && r.seriesId == null) ??
        rows.find(r => r.packagingId === previewPackaging.id))
      : null;
    const seriesId = own?.seriesId ?? null;
    const volume = previewPackaging?.volumeMl != null
      ? parseFloat(String(previewPackaging.volumeMl))
      : 0;
    return {
      src: own ? packagingImageUrl(own.id) : null,
      name: previewPackaging?.name ?? null,
      volumeMl: volume > 0 ? volume : null,
      range: seriesPackRange({
        packagings,
        seriesPackagings: dims?.seriesPackagings ?? [],
        images: rows,
        seriesId,
        limit: 4,
      }).map(p => ({ label: p.label, src: p.src })),
    };
  }, [packImages, packagings, dims?.seriesPackagings, previewPackaging]);

  const paint: PaintInfo = {
    code: örnek?.code ?? "VC1282",
    nameTr: örnek?.name ?? "FUŞYA",
    nameEn: örnek?.nameEn ?? "FUCHSIA",
    seriesCode: SERIES_CODE_BY_FINISH[örnek?.finish ?? "candy"] ?? "VC",
    hex: örnek?.hex || "#c2185b",
    packagingSrc: packSample.src,
    packagingName: packSample.name,
    volumeLabel: packSample.volumeMl ? `${packSample.volumeMl} ML` : null,
    volumeMl: packSample.volumeMl,
    packRange: packSample.range,
    // Editörde palet katmanı boş görünmesin: gerçek renkler ve gerçek
    // kareler, yerleşimi ayarlarken kaç kutu sığdığını gösteriyor.
    palette: buildPalette({
      masters,
      colorById,
      seriesId: örnekMaster?.seriesId,
      activeColorId: örnekMaster?.colorId,
      images: örnekColorImages,
    }),
  };

  return (
    <SablonEditor
      paint={paint}
      saved={saved}
      assets={(assets ?? []).map(a => ({ id: a.id, label: a.label }))}
      packagingOptions={packagings.map(p => ({
        id: p.id,
        label: p.name,
        hasImage: (packImages ?? []).some(i => i.packagingId === p.id),
      }))}
      packagingValue={previewPackaging ? String(previewPackaging.id) : ""}
      onPackagingChange={setPreviewPackagingId}
      saving={save.isPending || reset.isPending}
      onSave={(templateId, layout) =>
        save.mutateAsync({ templateId, layout: layout as unknown as Record<string, unknown> }).then(() => undefined)
      }
      onReset={templateId => reset.mutateAsync({ templateId }).then(() => undefined)}
    />
  );
}

export default function RenkStudyo() {
  const [tab, setTab] = useState("uret");
  /**
   * Üretimden pazarlamaya devredilen kare.
   *
   * Sekmeler arasında taşınan tek durum bu. Obje karesini pazarlama
   * sekmesinin kendi içinde tutmak, "üret → şablona bas" akışını iki ayrı
   * seçim adımına bölerdi.
   */
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Renk Stüdyosu</h1>
        <p className="text-sm text-muted-foreground">
          Önce ürünün renginde obje karesini üret, sonra o kareyi pazarlama
          şablonlarına bas. İki adım ayrı: şablonu değiştirdiğinde AI'ı yeniden
          çalıştırmak gerekmiyor.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="uret">1 · Obje Üretimi</TabsTrigger>
          <TabsTrigger value="pazarlama">2 · Pazarlama Görselleri</TabsTrigger>
          <TabsTrigger value="referans">Referans Objeler</TabsTrigger>
          <TabsTrigger value="sablon">Şablon Editörü</TabsTrigger>
        </TabsList>
        <TabsContent value="uret" className="mt-4">
          <ObjeUretimi
            onDevret={h => {
              setHandoff(h);
              setTab("pazarlama");
            }}
          />
        </TabsContent>
        <TabsContent value="pazarlama" className="mt-4">
          <PazarlamaGorselleri handoff={handoff} onSablonDuzenle={() => setTab("sablon")} />
        </TabsContent>
        <TabsContent value="referans" className="mt-4 space-y-4">
          <ReferansObjeler />
          <SablonGorselleri />
        </TabsContent>
        <TabsContent value="sablon" className="mt-4">
          <SablonlarSekmesi />
        </TabsContent>
      </Tabs>
    </div>
  );
}
