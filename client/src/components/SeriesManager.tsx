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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { LibraryBig, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Ürün serileri yönetimi.
 *
 * Şablonlar sayfasının içinde tanımlıydı ve oraya menüden gidilemiyordu —
 * seri düzenlemek için adresi elle yazmak gerekiyordu. Ürünler sayfasının
 * "Seri kurgusu" sekmesinde de kullanıldığı için kendi dosyasına alındı.
 */

const emptySeriesForm = {
  name: "",
  nameEn: "",
  profitMargin: "35",
  vatRate: "20",
  category: "",
  shortDescription: "",
  longDescription: "",
  applicationText: "",
  faqContent: "",
  // Ürün motoru v2 alanları
  prefix: "",
  packagingOptions: "", // her satır bir ambalaj (örn. 50ml)
  applicationSurfaces: "", // her satır bir yüzey (örn. Araç)
  colorOptions: "", // her satır bir renk (örn. Mavi #1a2b5c)
  guideTemplate: "",
  labelTemplate: "",
};

/**
 * Ürün serileri yönetimi: seri bazlı kâr oranı, KDV ve hazır açıklamalar.
 * Ürün formundaki "Otomatik Doldur" bu kayıtlardan beslenir.
 */
export default function SeriesManager() {
  const utils = trpc.useUtils();
  const { data: seriesList } = trpc.series.list.useQuery();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySeriesForm);

  const invalidate = () => utils.series.list.invalidate();
  const create = trpc.series.create.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Seri eklendi");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.series.update.useMutation({
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Seri güncellendi");
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.series.delete.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  // Seri bazlı AI içerik üretimi: tek çağrıda kısa/uzun açıklama, uygulama ve SSS.
  const generateContent = trpc.series.generateContent.useMutation({
    onSuccess: r => {
      setForm(f => ({
        ...f,
        shortDescription: r.shortDescription ?? f.shortDescription,
        longDescription: r.longDescription ?? f.longDescription,
        applicationText: r.applicationText ?? f.applicationText,
        faqContent: r.faqContent ?? f.faqContent,
      }));
      invalidate();
      toast.success("AI içerik üretildi — gözden geçirip kaydedebilirsiniz 🎉");
    },
    onError: e => toast.error(e.message),
  });

  // Satır bazlı metni temiz bir diziye çevirir (boş satırları atar).
  const toLines = (v: string): string[] =>
    v
      .split(/[\n,]/)
      .map(x => x.trim())
      .filter(Boolean);

  /** Renk satırı: "Etiket #hex" (hex opsiyonel). value = etiketten üretilir. */
  const parseColorLines = (v: string) =>
    v
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const hexMatch = line.match(/#([0-9a-fA-F]{3,8})\b/);
        const hex = hexMatch ? hexMatch[0] : null;
        const label = line.replace(/#([0-9a-fA-F]{3,8})\b/, "").trim() || line;
        const value = label.toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
        return { label, value: value || label, hex };
      });

  // Canlı önizleme: "kaç varyant üretilecek" sorusunun cevabı kaydetmeden
  // görünsün — 8 renk × 4 ambalaj yazıp 32 varyantla karşılaşmak sürpriz olmasın.
  const packagingLines = toLines(form.packagingOptions);
  const colorLines = parseColorLines(form.colorOptions);
  const variantCount =
    packagingLines.length > 0 ? Math.max(1, colorLines.length) * packagingLines.length : 0;

  function submit() {
    if (!form.name.trim()) return toast.error("Seri adı gerekli");
    const surfaces = toLines(form.applicationSurfaces);
    // Ambalaj: her satır hem label hem value (örn. "50ml").
    const packaging = packagingLines.map(x => ({ label: x, value: x }));
    const colors = colorLines;
    const payload = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim() || null,
      profitMargin: parseFloat(form.profitMargin.replace(",", ".")) || 0,
      vatRate: parseFloat(form.vatRate.replace(",", ".")) || 0,
      category: form.category || null,
      shortDescription: form.shortDescription || null,
      longDescription: form.longDescription || null,
      applicationText: form.applicationText || null,
      faqContent: form.faqContent || null,
      // Ürün motoru v2: kod ön eki, ambalaj/yüzey ve şablonlar.
      prefix: form.prefix.trim().toUpperCase() || null,
      packagingOptions: packaging.length ? packaging : null,
      applicationSurfaces: surfaces.length ? surfaces : null,
      colorOptions: colors.length ? colors : null,
      guideTemplate: form.guideTemplate || null,
      labelTemplate: form.labelTemplate || null,
    };
    if (editingId) update.mutate({ id: editingId, data: payload });
    else create.mutate(payload);
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <LibraryBig className="h-4 w-4 text-primary" /> Ürün Serileri
          </h2>
          <p className="text-xs text-muted-foreground">
            Seri bazlı kâr oranı, KDV ve hazır açıklamalar — ürün formundaki "Otomatik Doldur" buradan beslenir.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm(emptySeriesForm);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Yeni Seri
        </Button>
      </div>
      {(seriesList ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Henüz seri yok — "Yeni Seri" ile ekle (örn. CANDY %35 kâr, %20 KDV).
        </p>
      ) : (
        <div className="space-y-1.5">
          {(seriesList ?? []).map(s => (
            <div key={s.id} className="flex items-start gap-2 rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Kâr %{parseFloat(String(s.profitMargin))} · KDV %{parseFloat(String(s.vatRate))}
                    {s.category ? ` · ${s.category}` : ""}
                    {(s as { prefix?: string | null }).prefix
                      ? ` · ${(s as { prefix?: string | null }).prefix}`
                      : ""}
                  </span>
                </p>
                {/* Serinin neyi beslediği listeden görünsün: metin yazılmış mı,
                    şablonu kurulmuş mu — düzenlemeyi açmadan anlaşılsın. */}
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${s.longDescription ? "" : "text-muted-foreground"}`}
                  >
                    {s.longDescription ? "metinler hazır" : "metin yok"}
                  </Badge>
                  {seriesVariantSummary(s) && (
                    <Badge variant="outline" className="text-[10px]">
                      {seriesVariantSummary(s)}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditingId(s.id);
                  // JSON alanları düzenlenebilir satır metnine çevir.
                  const arr = (v: unknown): unknown[] => {
                    if (Array.isArray(v)) return v;
                    if (typeof v === "string" && v.trim()) {
                      try {
                        const p = JSON.parse(v);
                        return Array.isArray(p) ? p : [];
                      } catch {
                        return [];
                      }
                    }
                    return [];
                  };
                  const pkgLines = arr((s as { packagingOptions?: unknown }).packagingOptions)
                    .map(x =>
                      x && typeof x === "object" && "value" in x
                        ? String((x as { value: unknown }).value)
                        : String(x),
                    )
                    .join("\n");
                  const surfLines = arr((s as { applicationSurfaces?: unknown }).applicationSurfaces)
                    .map(String)
                    .join("\n");
                  const colorLines = arr((s as { colorOptions?: unknown }).colorOptions)
                    .map(x => {
                      if (x && typeof x === "object") {
                        const o = x as { label?: unknown; value?: unknown; hex?: unknown };
                        const lbl = String(o.label ?? o.value ?? "");
                        return o.hex ? `${lbl} ${String(o.hex)}` : lbl;
                      }
                      return String(x);
                    })
                    .join("\n");
                  setForm({
                    name: s.name,
                    nameEn: (s as { nameEn?: string | null }).nameEn ?? "",
                    profitMargin: String(parseFloat(String(s.profitMargin)) || 0),
                    vatRate: String(parseFloat(String(s.vatRate)) || 0),
                    category: s.category ?? "",
                    shortDescription: s.shortDescription ?? "",
                    longDescription: s.longDescription ?? "",
                    applicationText: s.applicationText ?? "",
                    faqContent: (s as { faqContent?: string | null }).faqContent ?? "",
                    prefix: (s as { prefix?: string | null }).prefix ?? "",
                    packagingOptions: pkgLines,
                    applicationSurfaces: surfLines,
                    colorOptions: colorLines,
                    guideTemplate: (s as { guideTemplate?: string | null }).guideTemplate ?? "",
                    labelTemplate: (s as { labelTemplate?: string | null }).labelTemplate ?? "",
                  });
                  setOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate({ id: s.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/*
        Seri düzenleme — sekmeli.

        Tek sütunda 12 alan alt alta diziliydi: kâr oranını değiştirmek için
        beş ekran kaydırmak, SSS metnini görmek için sonuna inmek gerekiyordu
        ve hangi alanın neyi beslediği hiçbir yerde yazmıyordu. Sekmeler işi
        üç net soruya ayırıyor: seri nedir · ne yazacağız · nasıl türeteceğiz.
      */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {editingId ? "Seriyi Düzenle" : "Yeni Seri"}
              {form.name.trim() && <Badge variant="secondary">{form.name.trim()}</Badge>}
              {editingId && (
                <span className="text-xs font-normal text-muted-foreground">
                  Kâr %{form.profitMargin || 0} · KDV %{form.vatRate || 0}
                  {variantCount > 0 && ` · sihirbaz ${variantCount} varyant üretir`}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="temel" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="temel">Temel &amp; Fiyat</TabsTrigger>
              <TabsTrigger value="icerik">Pazarlama Metinleri</TabsTrigger>
              <TabsTrigger value="varyant">Varyant Şablonu</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto pt-3">
              {/* ── Temel & fiyat ─────────────────────────────────────────── */}
              <TabsContent value="temel" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Seri Adı *</Label>
                    <Input
                      autoFocus
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Örn. CANDY, METEOR"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Satış adındaki karşılığı</Label>
                    <Input
                      value={form.nameEn}
                      onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                      placeholder="Örn. CANDY PAINT"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ürün adı buradan kurulur: ARTOFCOLOUR <strong>CANDY PAINT</strong> MAGENTA
                      (FUŞYA) - AİRBRUSH 100 ML. Boşsa seri adı kullanılır.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kategori</Label>
                    <Input
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="Boya, Sprey, Yardımcı Ürünler"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pazaryeri kategorisi önerisinde kullanılır.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Kod Ön Eki</Label>
                    <Input
                      value={form.prefix}
                      maxLength={10}
                      onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                      placeholder="CND"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ürün kodu: <strong>{(form.prefix || "CND").toUpperCase()}0042</strong>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kâr Oranı %</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.profitMargin}
                      onChange={e => setForm(f => ({ ...f, profitMargin: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>KDV %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.vatRate}
                      onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Kâr oranı soyut bir sayı; örnek maliyet üzerinden fiyat
                    göstermek "%45 az mı çok mu" sorusunu somutlaştırıyor. */}
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Fiyat önerisi böyle çıkar</p>
                  <p className="mt-1">
                    Maliyet <strong>100,00 ₺</strong> → satış{" "}
                    <strong>
                      {(100 * (1 + (parseFloat(form.profitMargin.replace(",", ".")) || 0) / 100)).toFixed(2)} ₺
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      (KDV dahil{" "}
                      {(
                        100 *
                        (1 + (parseFloat(form.profitMargin.replace(",", ".")) || 0) / 100) *
                        (1 + (parseFloat(form.vatRate.replace(",", ".")) || 0) / 100)
                      ).toFixed(2)}{" "}
                      ₺)
                    </span>
                  </p>
                </div>
              </TabsContent>

              {/* ── Pazarlama metinleri ───────────────────────────────────── */}
              <TabsContent value="icerik" className="mt-0 space-y-3">
                {/* İçerik seri bazlıdır; varyantlar (renk/gramaj) bu metinleri
                    paylaşır — varyant başına AI çağrısı yok. */}
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-primary/5 p-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-primary" /> AI ile içerik üret
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dört metni tek seferde yazar; varyantlar bunları devralır. Üretilen metin
                      doğrudan kaydedilmez — gözden geçirip "Kaydet" demeniz gerekir.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!editingId || generateContent.isPending}
                    onClick={() => editingId && generateContent.mutate({ id: editingId })}
                    title={editingId ? "" : "Önce seriyi kaydedin"}
                  >
                    {generateContent.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-4 w-4" />
                    )}
                    AI ile Üret
                  </Button>
                </div>
                {!editingId && (
                  <p className="-mt-1 text-xs text-muted-foreground">
                    AI üretimi için önce seriyi kaydedin, sonra düzenleyerek "AI ile Üret" deyin.
                  </p>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Kısa Açıklama</Label>
                      <CharCount value={form.shortDescription} />
                    </div>
                    <Textarea
                      rows={6}
                      className="font-normal"
                      value={form.shortDescription}
                      onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))}
                      placeholder="Ürünün yanında görünen kısa tanıtım"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Uzun Açıklama</Label>
                      <CharCount value={form.longDescription} />
                    </div>
                    <Textarea
                      rows={6}
                      value={form.longDescription}
                      onChange={e => setForm(f => ({ ...f, longDescription: e.target.value }))}
                      placeholder="İlan ve web sitesi için detaylı pazarlama metni"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Uygulama Metni</Label>
                      <CharCount value={form.applicationText} />
                    </div>
                    <Textarea
                      rows={6}
                      value={form.applicationText}
                      onChange={e => setForm(f => ({ ...f, applicationText: e.target.value }))}
                      placeholder="Nasıl uygulanır — adım adım"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>SSS / Blog</Label>
                      <CharCount value={form.faqContent} />
                    </div>
                    <Textarea
                      rows={6}
                      value={form.faqContent}
                      onChange={e => setForm(f => ({ ...f, faqContent: e.target.value }))}
                      placeholder="Sıkça sorulan sorular — web sitesinde kullanılır"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ── Varyant şablonu ───────────────────────────────────────── */}
              <TabsContent value="varyant" className="mt-0 space-y-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  Sihirbaz varyantları <strong>Renk × Ambalaj</strong> matrisi olarak üretir.
                  {variantCount > 0 ? (
                    <>
                      {" "}
                      Şu an: <strong>{colorLines.length || 1} renk × {packagingLines.length || 1} ambalaj ={" "}
                      {variantCount} varyant</strong>.
                    </>
                  ) : (
                    " Aşağıya en az bir ambalaj yazın."
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Ambalaj Boyutları</Label>
                      <span className="text-[11px] text-muted-foreground">
                        {packagingLines.length} satır
                      </span>
                    </div>
                    <Textarea
                      rows={7}
                      value={form.packagingOptions}
                      onChange={e => setForm(f => ({ ...f, packagingOptions: e.target.value }))}
                      placeholder={"Her satıra bir ambalaj:\n50ml\n100ml\n250ml"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Renk Seçenekleri</Label>
                      <span className="text-[11px] text-muted-foreground">
                        {colorLines.length} satır
                      </span>
                    </div>
                    <Textarea
                      rows={7}
                      value={form.colorOptions}
                      onChange={e => setForm(f => ({ ...f, colorOptions: e.target.value }))}
                      placeholder={"Her satıra bir renk (hex opsiyonel):\nMavi #1a2b5c\nKırmızı #d32f2f"}
                    />
                    {/* Yazılan hex'leri göstermek, kopyalanan renk kodunun
                        gerçekten okunup okunmadığını anında belli ediyor. */}
                    {colorLines.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {colorLines.slice(0, 24).map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                          >
                            {c.hex && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full border"
                                style={{ backgroundColor: c.hex }}
                              />
                            )}
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Uygulanabilir Yüzeyler</Label>
                  <Textarea
                    rows={3}
                    value={form.applicationSurfaces}
                    onChange={e => setForm(f => ({ ...f, applicationSurfaces: e.target.value }))}
                    placeholder={"Her satıra bir yüzey:\nAraç\n3D Baskı\nAhşap"}
                  />
                  <p className="text-xs text-muted-foreground">
                    "Hedef Yüzey / Kullanım" seçenekleri buradan gelir. Varyant sayısını
                    etkilemez.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Kullanım Kılavuzu Şablonu</Label>
                    <Textarea
                      rows={4}
                      value={form.guideTemplate}
                      onChange={e => setForm(f => ({ ...f, guideTemplate: e.target.value }))}
                      placeholder="Değişkenler: {{renk}}, {{seri}}, {{ambalaj}}"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Etiket İçerik Şablonu</Label>
                    <Textarea
                      rows={4}
                      value={form.labelTemplate}
                      onChange={e => setForm(f => ({ ...f, labelTemplate: e.target.value }))}
                      placeholder="Değişkenler: {{renk}}, {{seri}}, {{ambalaj}}"
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button disabled={create.isPending || update.isPending} onClick={submit}>
              {(create.isPending || update.isPending) && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Karakter sayacı — pazaryeri açıklamalarında sınır var ve metni yazarken
 * ne kadar yer kaldığını görmek, yayınlarken kırpılmasından iyi.
 */
function CharCount({ value }: { value: string }) {
  const n = value.trim().length;
  if (n === 0) return <span className="text-[11px] text-muted-foreground">boş</span>;
  return <span className="text-[11px] text-muted-foreground">{n} karakter</span>;
}

/**
 * Serinin varyant şablonu özeti ("3 renk × 2 ambalaj"). Listede görünmesi,
 * hangi serinin sihirbaza hazır olduğunu düzenlemeyi açmadan gösteriyor.
 */
function seriesVariantSummary(s: unknown): string | null {
  const arr = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string" && v.trim()) {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  const row = s as { colorOptions?: unknown; packagingOptions?: unknown };
  const colors = arr(row.colorOptions).length;
  const packs = arr(row.packagingOptions).length;
  if (packs === 0) return null;
  return `${Math.max(1, colors)} renk × ${packs} ambalaj = ${Math.max(1, colors) * packs} varyant`;
}
