import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { forceExactColor, readAsDataUrl, slug } from "@/lib/renkStudyo";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Check,
  Layers,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Renk Stüdyosu — ürünün renginde görsel üret, ürüne kaydet.
 *
 * ── Akış ──────────────────────────────────────────────────────────────────
 *   ürün seç  →  rengi üründen gelir  →  AI o renkte üretir
 *             →  önizle  →  bu ürüne ya da o rengin tüm ürünlerine kaydet
 *
 * Renk seçimi ayrı bir adım değil: kokpit'te gerçek nesne ürün (master), renk
 * de onun küp koordinatının bir ekseni. Rengi ayrıca seçtirmek, aynı bilgiyi
 * iki yerden sormak olurdu — ve ikisi çeliştiğinde hangisinin doğru olduğu
 * belirsiz kalırdı.
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

type NamedRow = { id: number; code?: string | null; name: string };

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

function UrunGorseli() {
  const utils = trpc.useUtils();
  const { data: masters, isLoading: mastersLoading } = trpc.katalog.masters.useQuery();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: references } = trpc.renkStudyo.references.useQuery();
  const { data: status } = trpc.renkStudyo.status.useQuery();

  const [query, setQuery] = useState("");
  const [masterId, setMasterId] = useState<number | null>(null);
  const [referenceId, setReferenceId] = useState<string>("");
  const [subjectId, setSubjectId] = useState(SUBJECT_PRESETS[0].id);
  const [subject, setSubject] = useState(SUBJECT_PRESETS[0].text);
  const [exact, setExact] = useState(false);
  // Model seçimi tarayıcıda hatırlanıyor: her açılışta yeniden seçmek,
  // arka arkaya renk üretirken en sık tekrarlanan tıklama olurdu.
  const [model, setModel] = useState<string>(
    () => localStorage.getItem("renkStudyo.model") ?? "",
  );

  const [preview, setPreview] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const colors = (dims?.colors ?? []) as ColorRow[];
  const packagings = (dims?.packagings ?? []) as NamedRow[];
  const colorById = useMemo(() => new Map(colors.map(c => [c.id, c])), [colors]);
  const packById = useMemo(() => new Map(packagings.map(p => [p.id, p])), [packagings]);

  const rows = (masters ?? []) as MasterRow[];
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return rows.slice(0, 200);
    return rows
      .filter(m => {
        const c = colorById.get(m.colorId);
        const hay = [m.name, m.internalSku, c?.code, c?.name].filter(Boolean).join(" ").toLocaleLowerCase("tr");
        return hay.includes(q);
      })
      .slice(0, 200);
  }, [rows, query, colorById]);

  const master = rows.find(m => m.id === masterId) ?? null;
  const color = master ? (colorById.get(master.colorId) ?? null) : null;

  const models = status?.models ?? [];
  // Kayıtlı seçim bu sağlayıcıda yoksa (sağlayıcı değişmiş olabilir) ilkine düş.
  const activeModel = models.some(m => m.id === model) ? model : (models[0]?.id ?? "");

  const generate = trpc.renkStudyo.generateForColor.useMutation();

  const onGenerate = async () => {
    if (!color?.hex) {
      toast.error("Bu ürünün renginde hex kodu tanımlı değil");
      return;
    }
    setBusy(true);
    setWarning(null);
    try {
      const res = await generate.mutateAsync({
        hex: color.hex,
        colorName: [color.name, color.nameEn].filter(Boolean).join(" / ") || undefined,
        finish: color.finish ?? undefined,
        referenceId: referenceId ? Number(referenceId) : null,
        subject,
        model: activeModel || undefined,
      });

      if (!exact) {
        setPreview(res.data);
        return;
      }

      // İsteğe bağlı düzeltme: modelin çıkardığı rengi hedefe tam oturt.
      const fixed = await forceExactColor(res.data, color.hex);
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
    },
    onError: e => toast.error(e.message),
  });

  const saveColor = trpc.renkStudyo.saveToColor.useMutation({
    onSuccess: r =>
      toast.success(
        r.added > 0
          ? `${r.added} ürüne kaydedildi${r.skipped ? `, ${r.skipped} zaten vardı` : ""}`
          : "Bu görsel zaten tüm ürünlerde vardı",
      ),
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
        {/* Ürün seçimi */}
        <div className="space-y-2">
          <Label>Ürün</Label>
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
            {mastersLoading ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Yükleniyor…
              </div>
            ) : !filtered.length ? (
              <div className="p-3 text-sm text-muted-foreground">
                {rows.length ? "Aramaya uyan ürün yok." : "Katalogda ürün yok."}
              </div>
            ) : (
              filtered.map(m => {
                const c = colorById.get(m.colorId);
                const p = packById.get(m.packagingId);
                const active = m.id === masterId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMasterId(m.id)}
                    className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent ${
                      active ? "bg-accent" : ""
                    }`}
                  >
                    <span
                      className="size-4 shrink-0 rounded-full border"
                      style={{ background: c?.hex || "#e5e7eb" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {m.name || m.internalSku}
                      </span>
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

          {color && (
            <p className="text-xs text-muted-foreground">
              Renk üründen geliyor: <strong>{color.code}</strong> · {color.name} ·{" "}
              <code>{color.hex || "hex yok"}</code>
              {color.finish ? ` · ${color.finish}` : ""}
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

        {/* Referans */}
        <div className="space-y-2">
          <Label>Referans obje (isteğe bağlı)</Label>
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
            Referans verilirse model şekli, açıyı ve ışığı aynen korur, yalnız rengi
            değiştirir — katalogdaki bütün renkler aynı formda çıkar.
          </p>
        </div>

        {/* Model */}
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

        {/* Renk düzeltmesi */}
        <div className="flex items-start justify-between gap-3 rounded border p-3">
          <div className="min-w-0">
            <Label className="text-sm">Rengi tam tutur</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              AI kesin renk tutturmaz. Açıkken üretim sonrası renk ölçülüp hedefe
              oturtulur; gölge ve parlama korunur.
            </p>
          </div>
          <Switch checked={exact} onCheckedChange={setExact} />
        </div>

        <Button className="w-full" disabled={!master || busy} onClick={() => void onGenerate()}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          AI ile bu renkte üret
        </Button>

        {/* Kaydetme */}
        <div className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={!preview || !master || saving}
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
            className="w-full"
            disabled={!preview || !master || saving}
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
            Bu rengin tüm ürünlerine kaydet
          </Button>
          <p className="text-xs text-muted-foreground">
            Aynı rengin 30/100/250/500 ml'si aynı görseli kullanır. Zaten aynı görsele
            sahip ürünler atlanır.
          </p>
        </div>
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

export default function RenkStudyo() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Renk Stüdyosu</h1>
        <p className="text-sm text-muted-foreground">
          Ürünü seç, AI o ürünün renginde görseli üretsin, ürüne kaydet.
        </p>
      </div>

      <Tabs defaultValue="uret">
        <TabsList>
          <TabsTrigger value="uret">Ürün Görseli</TabsTrigger>
          <TabsTrigger value="referans">Referans Objeler</TabsTrigger>
        </TabsList>
        <TabsContent value="uret" className="mt-4">
          <UrunGorseli />
        </TabsContent>
        <TabsContent value="referans" className="mt-4">
          <ReferansObjeler />
        </TabsContent>
      </Tabs>
    </div>
  );
}
