import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { renderLayout } from "@/lib/renkLayoutRender";
import { FAMILIES, FAMILY_IDS } from "@shared/color/families";
import { tokenValues } from "@/lib/renkCards";
import { BRAND, TEMPLATES, templatesOfFamily, fallbackPackaging, forceWhiteBackground, getSeries, loadImageSrc, type PaintInfo } from "@/lib/renkTemplates";
import {
  assetIdOf,
  clampBox,
  DEFAULT_WATERMARK,
  layerAt,
  newLayerId,
  resolveWatermark,
  TOKENS,
  type ImageSource,
  type Layer,
  type TemplateLayout,
  type Watermark,
} from "@shared/color/layout";
import { defaultLayout } from "@shared/color/layoutDefaults";
import { Eye, EyeOff, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Şablon editörü — kareyi kullanıcı düzenler.
 *
 * ── İki yüzey, tek veri ───────────────────────────────────────────────────
 * Önizleme üstünde sürükleyerek ve sağdaki alanlarla düzenlemek AYNI katman
 * listesini yazıyor. İki ayrı düzenleme sistemi kurulsaydı er ya da geç
 * birbirinden kayarlardı; hangisinin doğru olduğu da belirsiz kalırdı.
 *
 * ── Önizleme neden gerçek çizim ───────────────────────────────────────────
 * Editörde HTML kutuları gösterip "yaklaşık böyle görünecek" demek yerine
 * gerçek kare çiziliyor. Yaklaşık önizleme, yazı sığmaları ve kırpmalarda
 * yalan söyler — kullanıcı kaydettikten sonra sürprizle karşılaşır.
 */

type Props = {
  /** Örnek kare için kullanılacak renk bilgisi. */
  paint: PaintInfo;
  /** Örnek obje görseli (data URL). Yoksa düz renk kutusu çizilir. */
  objectImage?: string | null;
  /** Kayıtlı yerleşimler — şablon kimliğine göre. */
  saved: Record<string, TemplateLayout>;
  onSave: (templateId: string, layout: TemplateLayout) => Promise<void> | void;
  onReset: (templateId: string) => Promise<void> | void;
  saving?: boolean;
  /** Kullanıcının yüklediği görseller — katman kaynağı olarak seçilebilir. */
  assets?: Array<{ id: number; label: string }>;
  /**
   * Önizlemenin hangi ambalajla çizileceği — hangi kutuya göre tasarladığın
   * tahmin edilecek bir şey değil, seçilir.
   */
  packagingOptions?: Array<{ id: number; label: string; hasImage: boolean }>;
  packagingValue?: string;
  onPackagingChange?: (id: string) => void;
};

/** Görsel kaynağının insan tarafındaki adı — liste "pack2" değil "2. boy" desin. */
const SOURCE_LABEL: Record<string, string> = {
  object: "obje",
  packaging: "ambalaj",
  logo: "logo",
  coat1: "1. kat",
  coat2: "2. kat",
  coat3: "3. kat",
  pack1: "gam 1. boy",
  pack2: "gam 2. boy",
  pack3: "gam 3. boy",
  pack4: "gam 4. boy",
  use1: "kullanım 1",
  use2: "kullanım 2",
  use3: "kullanım 3",
  use4: "kullanım 4",
  before: "öncesi çekimi",
  after: "sonrası çekimi",
};

/** Sahne türlerinin insan tarafındaki adı. */
const SCENE_LABEL: Record<string, string> = {
  panel: "açılı panel",
  glow: "halo",
  sweep: "yatay bant",
};

/** Katmanın insan tarafındaki adı. */
function layerName(l: Layer): string {
  if (l.type === "text") return `Metin: ${l.text.slice(0, 24) || "(boş)"}`;
  if (l.type === "image") return `Görsel: ${SOURCE_LABEL[l.source] ?? l.source}`;
  if (l.type === "palette") return `Palet: ${l.columns} kolon`;
  if (l.type === "scene") return `Sahne: ${SCENE_LABEL[l.variant] ?? l.variant}`;
  return `Kutu: ${l.fill === "paint" ? "renk" : l.fill}`;
}

/** Örnek obje: gerçek görsel yoksa rengin kendisinden bir damla. */
function placeholderObject(hex: string): string {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 512);
  const g = ctx.createRadialGradient(220, 200, 20, 256, 260, 200);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, hex);
  g.addColorStop(1, "#00000055");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(256, 270, 190, 115, 0, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL("image/png");
}

export default function SablonEditor({
  paint,
  objectImage,
  saved,
  onSave,
  onReset,
  saving,
  assets = [],
  packagingOptions = [],
  packagingValue,
  onPackagingChange,
}: Props) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [layout, setLayout] = useState<TemplateLayout>(() => defaultLayout(TEMPLATES[0].id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    box: Layer["box"];
  } | null>(null);

  // Şablon değişince kayıtlı sürüm varsa o, yoksa fabrika tarifi.
  useEffect(() => {
    setLayout(saved[templateId] ?? defaultLayout(templateId));
    setSelectedId(null);
  }, [templateId, saved]);

  const template = useMemo(() => TEMPLATES.find(t => t.id === templateId) ?? null, [templateId]);
  /** Filigran katman değil, yerleşimin özelliği — tanımsızsa fabrika ayarı. */
  const watermark: Watermark = layout.watermark ?? DEFAULT_WATERMARK;
  const patchWatermark = (patch: Partial<Watermark>) =>
    setLayout(prev => ({ ...prev, watermark: { ...(prev.watermark ?? DEFAULT_WATERMARK), ...patch } }));

  const values = useMemo(() => tokenValues(paint), [paint]);
  const sample = useMemo(
    () => objectImage || placeholderObject(paint.hex || "#c2185b"),
    [objectImage, paint.hex],
  );

  const selected = layout.layers.find(l => l.id === selectedId) ?? null;

  /** Gerçek kareyi çizip önizleme canvas'ına basar. */
  const draw = useCallback(async () => {
    setBusy(true);
    try {
      const obj = await loadImageSrc(sample);
      // Ambalaj kaynağı: Tanımlar'daki çekim → aynı hacimdeki yerleşik yedek.
      let packaging: HTMLImageElement | null = null;
      const packSrc =
        paint.packagingSrc ||
        fallbackPackaging(paint.volumeMl, getSeries(paint.seriesCode).line)?.src;
      if (packSrc) {
        try {
          packaging = await loadImageSrc(packSrc);
        } catch {
          // ambalajsız önizleme, kart yine çizilsin
        }
      }

      // Ambalaj gamı (pack1..pack4). Çekimi olmayan boy çizilmez; kutusu boş
      // kalan katman editörde de boş görünmeli, yoksa kullanıcı yerleşimi
      // olmayan bir görsele göre ayarlar.
      const packRange: Record<string, HTMLImageElement> = {};
      for (let i = 0; i < 4; i += 1) {
        const src = paint.packRange?.[i]?.src;
        if (!src) continue;
        try {
          packRange[`pack${i + 1}`] = await loadImageSrc(src);
        } catch {
          // silinmiş çekim; katman atlanır
        }
      }
      let logo: HTMLImageElement | null = null;
      try {
        logo = await loadImageSrc(BRAND.logoDark);
      } catch {
        // logosuz önizleme
      }

      // Kat kareleri editörde örnek olarak objenin kendisi: editör
      // yerleşimi düzenlemek için, kat fiziğini denemek için değil.
      // Yerleşimde geçen kullanıcı varlıkları — yoksa o katman çizilmez ve
      // kullanıcı neden görünmediğini anlayamaz, o yüzden yükleniyor.
      const assetImages: Record<string, HTMLImageElement> = {};
      for (const layer of layout.layers) {
        if (layer.type !== "image") continue;
        const id = assetIdOf(layer.source);
        if (!id || assetImages[`asset:${id}`]) continue;
        try {
          assetImages[`asset:${id}`] = await loadImageSrc(`/api/img/sample/${id}`);
        } catch {
          // varlık silinmiş olabilir; katman atlanır
        }
      }

      const rendered = await renderLayout({
        layout,
        values,
        images: {
          object: obj,
          packaging,
          logo,
          coat1: obj,
          coat2: obj,
          coat3: obj,
          ...packRange,
          ...assetImages,
          // Öncesi/sonrası çekimleri örnekle temsil ediliyor: editörde
          // yerleşimi ayarlarken kareler boş görünürse kutular kör ayarlanır.
          before: obj,
          after: obj,
        },
        paintHex: paint.hex,
        accentHex: paint.accentHex,
        palette: paint.palette,
        // Önizleme gerçek kareyi göstermeli: filigran üretimde basılıp
        // editörde görünmezse kullanıcı yerleşimi eksik bilgiyle ayarlar.
        watermark: resolveWatermark(layout, { bare: template?.bare }),
      });

      const target = canvasRef.current;
      if (!target) return;
      target.width = rendered.width;
      target.height = rendered.height;
      const ctx = target.getContext("2d");
      ctx?.drawImage(rendered, 0, 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Önizleme çizilemedi");
    } finally {
      setBusy(false);
    }
  }, [
    layout,
    values,
    sample,
    template?.bare,
    paint.hex,
    paint.seriesCode,
    paint.volumeMl,
    paint.packagingSrc,
    paint.packRange,
    paint.palette,
  ]);

  useEffect(() => {
    void draw();
  }, [draw]);

  const patchLayer = (id: string, patch: Partial<Layer>) => {
    setLayout(prev => ({
      ...prev,
      layers: prev.layers.map(l => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    }));
  };

  /** Fare konumunu 0..1 oranına çevirir. */
  const toRatio = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = toRatio(e);
    const hit = layerAt(layout, x, y);
    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    // Sağ-alt köşeye yakınsa boyutlandırma, değilse taşıma.
    const nearCorner =
      Math.abs(x - (hit.box.x + hit.box.w)) < 0.03 && Math.abs(y - (hit.box.y + hit.box.h)) < 0.03;
    dragRef.current = {
      id: hit.id,
      mode: nearCorner ? "resize" : "move",
      startX: x,
      startY: y,
      box: { ...hit.box },
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toRatio(e);
    const dx = x - d.startX;
    const dy = y - d.startY;
    const next =
      d.mode === "move"
        ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
        : { ...d.box, w: d.box.w + dx, h: d.box.h + dy };
    patchLayer(d.id, { box: clampBox(next) } as Partial<Layer>);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const addLayer = (type: Layer["type"]) => {
    const base = { id: newLayerId(type), box: { x: 0.1, y: 0.1, w: 0.3, h: 0.08 }, visible: true };
    const layer: Layer =
      type === "text"
        ? { ...base, type: "text", text: "{code}", size: 0.04, weight: 700, color: "#0a0a0a", align: "left", transform: "upper" }
        : type === "image"
          ? { ...base, type: "image", source: "object", fit: "contain" }
          : type === "palette"
            ? {
                ...base,
                // Palet ızgarası küçük bir kutuda anlamsız; doğduğu anda
                // kullanılabilir bir ölçüde doğsun.
                box: { x: 0.06, y: 0.3, w: 0.88, h: 0.5 },
                type: "palette",
                columns: 6,
                gap: 0.018,
                showCode: true,
                labelSize: 0.017,
                labelColor: "#3f3f46",
                radius: 0.008,
                highlight: true,
              }
            : { ...base, type: "rect", fill: "paint" };
    setLayout(prev => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  };

  const removeLayer = (id: string) => {
    setLayout(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== id) }));
    setSelectedId(null);
  };

  const move = (id: string, dir: -1 | 1) => {
    setLayout(prev => {
      const i = prev.layers.findIndex(l => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.layers.length) return prev;
      const layers = [...prev.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...prev, layers };
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            {/*
              Şablonlar aileye göre gruplu listeleniyor: düz liste on dört
              satırdı ve hangisinin hangi işi yaptığı ancak adından tahmin
              ediliyordu.
            */}
            <SelectContent>
              {FAMILY_IDS.map(fid => (
                <SelectGroup key={fid}>
                  <SelectLabel>{FAMILIES[fid].label}</SelectLabel>
                  {templatesOfFamily(fid).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                      {t.sizeLabel ? ` · ${t.sizeLabel}` : ""}
                      {saved[t.id] ? " ·  düzenlendi" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={() => addLayer("text")}>
            <Plus className="mr-1 size-4" /> Metin
          </Button>
          <Button size="sm" variant="outline" onClick={() => addLayer("image")}>
            <Plus className="mr-1 size-4" /> Görsel
          </Button>
          <Button size="sm" variant="outline" onClick={() => addLayer("rect")}>
            <Plus className="mr-1 size-4" /> Kutu
          </Button>
          <Button size="sm" variant="outline" onClick={() => addLayer("palette")}>
            <Plus className="mr-1 size-4" /> Palet
          </Button>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLayout(defaultLayout(templateId));
                void onReset(templateId);
              }}
            >
              <RotateCcw className="mr-1 size-4" /> Fabrika ayarı
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void onSave(templateId, layout)}>
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
              Kaydet
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-xs text-muted-foreground">
            Katmana tıkla ve sürükle. Sağ-alt köşeye yakın tutup sürüklersen
            boyutlandırır. Önizleme gerçek karenin kendisi — kaydettiğinde aynısı
            çıkar.
          </p>
          {packagingOptions.length > 0 && onPackagingChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Önizleme ambalajı</span>
              <Select value={packagingValue ?? ""} onValueChange={onPackagingChange}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Seç" />
                </SelectTrigger>
                <SelectContent>
                  {packagingOptions.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.label}
                      {p.hasImage ? "" : " · çekim yok"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div
          ref={wrapRef}
          className="relative mx-auto w-full max-w-[560px] cursor-move select-none overflow-hidden rounded border bg-white"
          style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          <canvas ref={canvasRef} className="pointer-events-none block h-full w-full" />
          {layout.layers.map(l =>
            l.visible ? (
              <div
                key={l.id}
                className={`pointer-events-none absolute border ${
                  l.id === selectedId ? "border-2 border-sky-500" : "border-dashed border-sky-300/50"
                }`}
                style={{
                  left: `${l.box.x * 100}%`,
                  top: `${l.box.y * 100}%`,
                  width: `${l.box.w * 100}%`,
                  height: `${l.box.h * 100}%`,
                }}
              />
            ) : null,
          )}
          {busy && (
            <div className="absolute right-2 top-2 rounded bg-background/80 p-1">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-medium">Katmanlar</h3>
          <p className="text-xs text-muted-foreground">Üstteki katman öne çizilir.</p>
        </div>

        <div className="max-h-56 overflow-y-auto rounded border">
          {layout.layers.map((l, i) => (
            <div
              key={l.id}
              className={`flex items-center gap-1 border-b px-2 py-1.5 last:border-b-0 ${
                l.id === selectedId ? "bg-accent" : ""
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs"
                onClick={() => setSelectedId(l.id)}
              >
                {layerName(l)}
              </button>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => move(l.id, -1)} disabled={i === 0}>
                ↑
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => move(l.id, 1)}
                disabled={i === layout.layers.length - 1}
              >
                ↓
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => patchLayer(l.id, { visible: !l.visible } as Partial<Layer>)}
              >
                {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => removeLayer(l.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Filigran — katman listesinin dışında, çünkü katman değil: kareyi
            başkasının kullanamaması "her zaman ve en üstte" olmasına bağlı. */}
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Filigran</h3>
            <Switch
              checked={watermark.enabled && !template?.bare}
              disabled={template?.bare}
              onCheckedChange={v => patchWatermark({ enabled: v })}
            />
          </div>

          {template?.bare ? (
            <p className="text-xs text-muted-foreground">
              Pazaryeri ana görselinde filigran YASAK — Amazon ve Trendyol yazı, logo
              ya da filigran taşıyan ana görseli reddediyor. Bu kare korumasız kalır;
              koruma diğer karelerde.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Diziliş</Label>
                  <Select
                    value={watermark.mode}
                    onValueChange={v => patchWatermark({ mode: v as Watermark["mode"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tile">Çapraz döşeme</SelectItem>
                      <SelectItem value="center">Tek damga (orta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Renk</Label>
                  <Select
                    value={watermark.tint}
                    onValueChange={v => patchWatermark({ tint: v as Watermark["tint"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ink">Koyu</SelectItem>
                      <SelectItem value="light">Açık</SelectItem>
                      <SelectItem value="paint">Ürünün rengi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Damga boyu</Label>
                  <Input
                    type="number"
                    step="0.02"
                    min="0.05"
                    max="1"
                    value={watermark.scale}
                    onChange={e => patchWatermark({ scale: Number(e.target.value) || 0.24 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Saydamlık</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={watermark.opacity}
                    onChange={e =>
                      patchWatermark({ opacity: Math.max(0, Math.min(1, Number(e.target.value))) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Eğim°</Label>
                  <Input
                    type="number"
                    step="5"
                    min="-90"
                    max="90"
                    value={watermark.angle}
                    onChange={e => patchWatermark({ angle: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Marka logosu karenin ÜSTÜNE basılır — objeyi kesip alan biri filigranı
                da almış olur. Çapraz döşeme kırpılarak temizlenemez; "ürünün rengi"
                seçilirse damga rengin kendisiyle boyanır ve koyu karelerde de görünür.
                Saydamlık %8 civarı: satışı bozmadan sahiplenmeye yeter.
              </p>
            </>
          )}
        </div>

        {selected ? (
          <div className="space-y-3 border-t pt-3">
            <h3 className="text-sm font-medium">Özellikler</h3>

            <div className="grid grid-cols-4 gap-2">
              {(["x", "y", "w", "h"] as const).map(k => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs uppercase">{k}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={selected.box[k].toFixed(3)}
                    onChange={e =>
                      patchLayer(selected.id, {
                        box: clampBox({ ...selected.box, [k]: Number(e.target.value) }),
                      } as Partial<Layer>)
                    }
                  />
                </div>
              ))}
            </div>

            {/* Saydamlık her katman türünde var: renk yıkaması, soluk filigran
                ve ikinci plandaki kutu bununla kuruluyor. */}
            <div className="space-y-1">
              <Label className="text-xs">Saydamlık</Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={selected.opacity ?? 1}
                onChange={e =>
                  patchLayer(selected.id, {
                    opacity: Math.max(0, Math.min(1, Number(e.target.value))),
                  } as Partial<Layer>)
                }
              />
            </div>

            {selected.type === "text" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Metin</Label>
                  <Input
                    value={selected.text}
                    onChange={e => patchLayer(selected.id, { text: e.target.value } as Partial<Layer>)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Yer tutucular: {TOKENS.join(" ")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Boyut</Label>
                    <Input
                      type="number"
                      step="0.002"
                      value={selected.size}
                      onChange={e =>
                        patchLayer(selected.id, { size: Number(e.target.value) } as Partial<Layer>)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Renk</Label>
                    <Input
                      type="color"
                      value={selected.color}
                      onChange={e => patchLayer(selected.id, { color: e.target.value } as Partial<Layer>)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Kalınlık</Label>
                    <Select
                      value={String(selected.weight)}
                      onValueChange={v => patchLayer(selected.id, { weight: Number(v) as 400 | 700 } as Partial<Layer>)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="400">İnce</SelectItem>
                        <SelectItem value="700">Kalın</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hiza</Label>
                    <Select
                      value={selected.align}
                      onValueChange={v => patchLayer(selected.id, { align: v as "left" } as Partial<Layer>)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Sol</SelectItem>
                        <SelectItem value="center">Orta</SelectItem>
                        <SelectItem value="right">Sağ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Büyük harf</Label>
                    <div className="pt-2">
                      <Switch
                        checked={selected.transform === "upper"}
                        onCheckedChange={v =>
                          patchLayer(selected.id, { transform: v ? "upper" : "none" } as Partial<Layer>)
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Satır sar</Label>
                    <div className="pt-2">
                      <Switch
                        checked={!!selected.wrap}
                        onCheckedChange={v => patchLayer(selected.id, { wrap: v } as Partial<Layer>)}
                      />
                    </div>
                  </div>
                  {selected.wrap && (
                    <div className="space-y-1">
                      <Label className="text-xs">Satır arası</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0.8"
                        value={selected.lineHeight ?? 1.2}
                        onChange={e =>
                          patchLayer(selected.id, {
                            lineHeight: Number(e.target.value) || 1.2,
                          } as Partial<Layer>)
                        }
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selected.wrap
                    ? "Metin kutuya sarılır; sığmayan satırlar çizilmez. Paragraf ve açıklama için."
                    : "Tek satır: sığmazsa yazı küçültülür. Kod ve isim için doğrusu bu."}
                </p>
              </>
            )}

            {selected.type === "image" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Kaynak</Label>
                    <Select
                      value={selected.source}
                      onValueChange={v => patchLayer(selected.id, { source: v as ImageSource } as Partial<Layer>)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="object">Obje</SelectItem>
                        <SelectItem value="packaging">Ambalaj (ürünün kendi)</SelectItem>
                        <SelectItem value="pack1">Gam: 1. boy</SelectItem>
                        <SelectItem value="pack2">Gam: 2. boy</SelectItem>
                        <SelectItem value="pack3">Gam: 3. boy</SelectItem>
                        <SelectItem value="pack4">Gam: 4. boy</SelectItem>
                        <SelectItem value="logo">Logo</SelectItem>
                        <SelectItem value="coat1">1. kat</SelectItem>
                        <SelectItem value="coat2">2. kat</SelectItem>
                        <SelectItem value="coat3">3. kat</SelectItem>
                        <SelectItem value="use1">Kullanım karesi 1</SelectItem>
                        <SelectItem value="use2">Kullanım karesi 2</SelectItem>
                        <SelectItem value="use3">Kullanım karesi 3</SelectItem>
                        <SelectItem value="use4">Kullanım karesi 4</SelectItem>
                        {assets.map(a => (
                          <SelectItem key={a.id} value={`asset:${a.id}`}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sığdırma</Label>
                    <Select
                      value={selected.fit}
                      onValueChange={v => patchLayer(selected.id, { fit: v as "contain" } as Partial<Layer>)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contain">Sığdır</SelectItem>
                        <SelectItem value="cover">Doldur (kırp)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!selected.shadow}
                    onCheckedChange={v => patchLayer(selected.id, { shadow: v } as Partial<Layer>)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Zemin gölgesi. Yalnız fonu SAYDAM görselde uygulanır; beyaz fonlu karede
                    gölge objenin değil karenin çevresine düşerdi. Pazaryeri ana görselinde
                    kapalı olmalı (fon saf beyaz kalmalı).
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!selected.knockout}
                    onCheckedChange={v => patchLayer(selected.id, { knockout: v } as Partial<Layer>)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Fonu sil. AI obje kareleri beyaz fonlu gelir; KOYU zeminli karelerde
                    (banner) fon silinmezse objenin etrafında beyaz bir dikdörtgen kalır.
                    Açık zeminli kartlarda kapalı bırakın.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ambalaj ve gam kutuları Tanımlar → Ambalajlar'daki çekimlerden gelir. Gam
                  hacme göre sıralıdır: "2. boy" seri değiştiğinde de doğru kutuyu çizer.
                  Arka plan olarak kendi görselinizi kullanmak için: Şablon Varlıkları'na
                  yükleyin, sonra bu listeden seçin.
                </p>
              </>
            )}

            {selected.type === "palette" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Kolon (0 = oto)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="16"
                      value={selected.columns}
                      onChange={e =>
                        patchLayer(selected.id, {
                          columns: Math.max(0, Math.min(16, Number(e.target.value) || 0)),
                        } as Partial<Layer>)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Boşluk</Label>
                    <Input
                      type="number"
                      step="0.002"
                      min="0"
                      value={selected.gap}
                      onChange={e =>
                        patchLayer(selected.id, {
                          gap: Math.max(0, Number(e.target.value)),
                        } as Partial<Layer>)
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Köşe yarıçapı</Label>
                    <Input
                      type="number"
                      step="0.002"
                      min="0"
                      value={selected.radius ?? 0}
                      onChange={e =>
                        patchLayer(selected.id, {
                          radius: Math.max(0, Number(e.target.value)),
                        } as Partial<Layer>)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kod yazısı</Label>
                    <Input
                      type="number"
                      step="0.002"
                      min="0"
                      value={selected.labelSize}
                      onChange={e =>
                        patchLayer(selected.id, {
                          labelSize: Math.max(0, Number(e.target.value)),
                        } as Partial<Layer>)
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selected.showCode}
                    onCheckedChange={v => patchLayer(selected.id, { showCode: v } as Partial<Layer>)}
                  />
                  <span className="text-xs text-muted-foreground">Renk kodlarını yaz</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!selected.highlight}
                    onCheckedChange={v => patchLayer(selected.id, { highlight: v } as Partial<Layer>)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Kartın kendi rengini çerçevele
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Kutularda rengin STÜDYO KARESİ çizilir (kayıtlı görseli olan renkler);
                  görsel yoksa düz renk. Kolon 0 ise ızgara renk sayısına göre kendini
                  kurar ve hepsi tek kareye sığar — yeni renk eklendiğinde şablona
                  dönmek gerekmez.
                </p>
              </>
            )}

            {selected.type === "rect" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Dolgu</Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selected.fill === "paint"}
                      onCheckedChange={v =>
                        patchLayer(selected.id, { fill: v ? "paint" : "#e5e7eb" } as Partial<Layer>)
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {selected.fill === "paint" ? "Ürünün rengi" : "Sabit renk"}
                    </span>
                    {selected.fill !== "paint" && (
                      <Input
                        type="color"
                        value={selected.fill}
                        onChange={e => patchLayer(selected.id, { fill: e.target.value } as Partial<Layer>)}
                      />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Köşe yarıçapı</Label>
                    <Input
                      type="number"
                      step="0.005"
                      min="0"
                      value={selected.radius ?? 0}
                      onChange={e =>
                        patchLayer(selected.id, {
                          radius: Math.max(0, Number(e.target.value)),
                        } as Partial<Layer>)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Aşağı soluklaş</Label>
                    <div className="pt-2">
                      <Switch
                        checked={!!selected.gradient}
                        onCheckedChange={v =>
                          patchLayer(selected.id, { gradient: v } as Partial<Layer>)
                        }
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Düzenlemek için önizlemeden ya da listeden bir katman seç.
          </p>
        )}
      </Card>
    </div>
  );
}
