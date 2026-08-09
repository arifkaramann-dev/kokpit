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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  PACKAGING,
  ensureBrandFont,
  loadImage,
  recolorSample,
  renderCard,
  toDataUrl,
} from "@/lib/renkStudyo";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Image as ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Renk Stüdyosu — renk × ambalaj → pazaryeri kart görseli.
 *
 * ── Neden bu ekran var ────────────────────────────────────────────────────
 * Bir rengin ürün görselini elde etmek bugüne kadar elle iş demekti: fotoğraf
 * çek ya da tasarımcıya ver, düzenle, yükle. Renk sayısı arttıkça bu iş
 * doğrusal büyüyor ve katalog tutarsızlaşıyor — her görsel biraz farklı
 * açıdan, biraz farklı ışıkta çıkıyor.
 *
 * Burada renk AI'dan İSTENMİYOR, matematikle BASILIYOR: numune master'ı bir
 * kez üretilir, sonraki her renk aynı master'ın yeniden renklendirilmesiyle
 * çıkar. Şekil, ışık ve kompozisyon sabit kalır; renk kesin olur.
 *
 * Ambalaj görselleri gerçek ürün çekimleridir ve hiç değiştirilmez.
 */

type ColorRow = {
  id: number;
  code: string;
  name: string;
  nameEn?: string | null;
  hex?: string | null;
  finish?: string | null;
  seriesId?: number | null;
  isActive?: number | null;
};

/** Dosyayı data URL'e çevirir. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

/** Boşluk ve Türkçe harfleri obje tipi anahtarına indirger. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

// ---------------------------------------------------------------------------

function KartUret({ colors }: { colors: ColorRow[] }) {
  const utils = trpc.useUtils();
  const { data: masters } = trpc.renkStudyo.masters.useQuery();

  const [colorId, setColorId] = useState<string>("");
  const [packagingId, setPackagingId] = useState<string>(PACKAGING[0].id);
  const [masterId, setMasterId] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Önizleme bir yarış durumu kaynağı: kullanıcı hızlı hızlı renk değiştirince
  // önceki çizim sonradan bitip yenisini ezebilir. Her çizime sıra numarası
  // veriliyor, yalnız en sonuncusu ekrana yazıyor.
  const runRef = useRef(0);

  const color = colors.find(c => String(c.id) === colorId) ?? null;
  const master = masters?.find(m => String(m.id) === masterId) ?? null;

  const draw = useCallback(async () => {
    if (!color) return;
    const run = ++runRef.current;
    setRendering(true);
    setError(null);
    setWarning(null);
    try {
      await ensureBrandFont();

      let sample: HTMLCanvasElement | null = null;
      if (master) {
        const img = await loadImage(`/api/img/sample/${master.id}`);
        const out = recolorSample(img, color.hex || "#808080");
        sample = out.canvas;
        if (out.noBackgroundFound) {
          // Sessizce yanlış kart üretmektense uyar: master'ın fonu koyu ya da
          // dört köşesi de objeyle dolu, yani maske "her şey obje" oldu.
          setWarning(
            `"${master.label}" master'ında beyaz fon bulunamadı; görselin tamamı boyandı. Beyaz fonlu bir çekim daha iyi sonuç verir.`,
          );
        }
      }

      const canvas = await renderCard({
        sample,
        packagingId,
        color: {
          code: color.code,
          name: color.name,
          nameEn: color.nameEn,
          hex: color.hex || "#808080",
        },
        seriesLabel: color.finish ?? null,
      });

      if (run !== runRef.current) return; // daha yeni bir çizim başladı
      setPreview(toDataUrl(canvas));
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : "Önizleme üretilemedi");
      setPreview(null);
    } finally {
      if (run === runRef.current) setRendering(false);
    }
  }, [color, master, packagingId]);

  useEffect(() => {
    if (!colorId) {
      setPreview(null);
      return;
    }
    void draw();
  }, [colorId, packagingId, masterId, draw]);

  const save = trpc.renkStudyo.saveCard.useMutation({
    onSuccess: r => {
      toast.success(
        r.added > 0
          ? `${r.added} ürüne bağlandı${r.skipped ? `, ${r.skipped} zaten vardı` : ""}`
          : "Bu görsel zaten tüm ürünlere bağlıydı",
      );
      void utils.katalog.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>Renk</Label>
          <Select value={colorId} onValueChange={setColorId}>
            <SelectTrigger>
              <SelectValue placeholder="Renk seç" />
            </SelectTrigger>
            <SelectContent>
              {colors.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-full border"
                      style={{ background: c.hex || "#808080" }}
                    />
                    {c.code} · {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Ambalaj</Label>
          <Select value={packagingId} onValueChange={setPackagingId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PACKAGING.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Numune master'ı</Label>
          <Select value={masterId} onValueChange={setMasterId}>
            <SelectTrigger>
              <SelectValue placeholder="Yok — yalnız ambalaj" />
            </SelectTrigger>
            <SelectContent>
              {(masters ?? []).map(m => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Master seçilirse rengi bu karta matematiksel olarak basılır. Seçilmezse
            kartta yalnız ambalaj görünür.
          </p>
        </div>

        <Button
          className="w-full"
          disabled={!color || !preview || save.isPending}
          onClick={() => {
            if (!color || !preview) return;
            save.mutate({
              colorId: color.id,
              seriesId: color.seriesId ?? null,
              data: preview,
              role: "studyo",
            });
          }}
        >
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ImageIcon className="mr-2 size-4" />
          )}
          Bu rengin tüm ürünlerine bağla
        </Button>
        <p className="text-xs text-muted-foreground">
          Bir rengin 30/100/250/500 ml'si aynı kartı kullanır; hepsine birden
          bağlanır. Zaten bağlı olanlar atlanır.
        </p>
      </Card>

      <Card className="flex min-h-[420px] items-center justify-center p-4">
        {rendering ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Kart çiziliyor…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 text-destructive">
            <AlertTriangle className="size-6" />
            <span className="text-sm">{error}</span>
          </div>
        ) : preview ? (
          <div className="space-y-2">
            <img src={preview} alt="Kart önizlemesi" className="max-h-[560px] w-auto rounded border" />
            {warning && (
              <p className="flex items-start gap-2 text-xs text-amber-600">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {warning}
              </p>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Önizleme için bir renk seç</span>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function NumuneMasterlari() {
  const utils = trpc.useUtils();
  const { data: masters, isLoading } = trpc.renkStudyo.masters.useQuery();

  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void utils.renkStudyo.masters.invalidate();

  const saveMaster = trpc.renkStudyo.saveMaster.useMutation({
    onSuccess: () => {
      toast.success("Numune master'ı kaydedildi");
      setLabel("");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const generate = trpc.renkStudyo.generateMaster.useMutation({
    onSuccess: () => {
      toast.success("Numune master'ı üretildi");
      setLabel("");
      setPrompt("");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const remove = trpc.renkStudyo.deleteMaster.useMutation({
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
      saveMaster.mutate({ objectType: slug(label), label: label.trim(), data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dosya okunamadı");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>Ad</Label>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Örn. Damla numune"
          />
          {label && (
            <p className="text-xs text-muted-foreground">
              Obje tipi: <code>{slug(label)}</code> — aynı tip ikinci kez kaydedilirse
              üzerine yazılır.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Kendi fotoğrafını yükle</Label>
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
            disabled={saveMaster.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {saveMaster.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Görsel seç
          </Button>
          <p className="text-xs text-muted-foreground">
            Elinde gerçek numune çekimi varsa bunu kullan — bedava ve markanın
            gerçek görünümü. Beyaz fonlu, tek objeli kare çekim en iyi sonucu verir.
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Ya da AI ile üret</Label>
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Örn. a single glossy drop of automotive paint on a flat surface"
            rows={3}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={!label.trim() || !prompt.trim() || generate.isPending}
            onClick={() =>
              generate.mutate({
                objectType: slug(label),
                label: label.trim(),
                prompt: prompt.trim(),
              })
            }
          >
            {generate.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            Üret
          </Button>
          <p className="text-xs text-muted-foreground">
            İstem otomatik olarak nötr renk, beyaz fon ve stüdyo ışığıyla
            tamamlanır — master ne kadar nötrse yeniden renklendirme o kadar geniş
            renk aralığında doğal durur.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Yükleniyor…
          </div>
        ) : !masters?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Henüz numune master'ı yok. Soldan bir görsel yükle ya da üret.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {masters.map(m => (
              <div key={m.id} className="overflow-hidden rounded border">
                <img
                  src={`/api/img/sample/${m.id}`}
                  alt={m.label}
                  className="aspect-square w-full bg-white object-contain"
                />
                <div className="flex items-center justify-between gap-2 border-t p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.objectType}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.prompt ? <Badge variant="secondary">AI</Badge> : <Badge>Foto</Badge>}
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: m.id })}
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
  const { data: dims, isLoading } = trpc.katalog.dimensions.useQuery();
  const colors = ((dims?.colors ?? []) as ColorRow[]).filter(c => c.isActive !== 0);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Renk Stüdyosu</h1>
        <p className="text-sm text-muted-foreground">
          Numune master'ını bir kez üret, her rengi ondan çıkar. Ambalaj görselleri
          gerçek ürün çekimlerimizdir — değiştirilmez.
        </p>
      </div>

      <Tabs defaultValue="kart">
        <TabsList>
          <TabsTrigger value="kart">Kart Üret</TabsTrigger>
          <TabsTrigger value="master">Numune Master'ları</TabsTrigger>
        </TabsList>
        <TabsContent value="kart" className="mt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Renkler yükleniyor…
            </div>
          ) : !colors.length ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Katalogda tanımlı renk yok. Önce Ürünler → Tanımlar bölümünden renk ekle.
            </Card>
          ) : (
            <KartUret colors={colors} />
          )}
        </TabsContent>
        <TabsContent value="master" className="mt-4">
          <NumuneMasterlari />
        </TabsContent>
      </Tabs>
    </div>
  );
}
