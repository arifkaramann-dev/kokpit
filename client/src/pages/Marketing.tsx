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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Copy, Loader2, PenLine, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const CONTENT_TYPES = [
  { value: "urun_aciklamasi", label: "Ürün Açıklaması (SEO)" },
  { value: "instagram_post", label: "Instagram Gönderisi" },
  { value: "reklam_metni", label: "Reklam Metni" },
] as const;

const TONES = [
  { value: "profesyonel", label: "Profesyonel" },
  { value: "samimi", label: "Samimi" },
  { value: "enerjik", label: "Enerjik" },
] as const;

export default function Marketing() {
  const utils = trpc.useUtils();
  const { data: history } = trpc.marketing.history.useQuery();
  const { data: products } = trpc.products.list.useQuery();

  const [contentType, setContentType] = useState<string>("instagram_post");
  const [productName, setProductName] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [tone, setTone] = useState<string>("profesyonel");
  const [extra, setExtra] = useState("");
  const [result, setResult] = useState("");
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [manualText, setManualText] = useState("");

  const saveManual = trpc.marketing.saveManual.useMutation({
    onSuccess: () => {
      utils.marketing.history.invalidate();
      setManualText("");
      toast.success("Metin arşive kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const generate = trpc.marketing.generate.useMutation({
    onSuccess: data => {
      setResult(data.content);
      utils.marketing.history.invalidate();
      toast.success("Metin üretildi");
    },
    onError: e => toast.error(e.message),
  });

  const deleteText = trpc.marketing.delete.useMutation({
    onSuccess: () => utils.marketing.history.invalidate(),
  });

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Panoya kopyalandı");
  }

  function submit() {
    if (!productName.trim()) {
      toast.error("Ürün adı girin veya seçin");
      return;
    }
    generate.mutate({
      contentType: contentType as "urun_aciklamasi" | "instagram_post" | "reklam_metni",
      productName: productName.trim(),
      productDetails: productDetails || undefined,
      tone: tone as "profesyonel" | "samimi" | "enerjik",
      extraInstructions: extra || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Pazarlama Ajanı</h1>
        <p className="text-sm text-muted-foreground">
          Ürün açıklamaları, sosyal medya gönderileri ve reklam metinleri üretin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              {mode === "ai" ? (
                <>
                  <Sparkles className="h-4 w-4 text-primary" /> Metin Üret
                </>
              ) : (
                <>
                  <PenLine className="h-4 w-4 text-primary" /> Elle Yaz
                </>
              )}
            </h2>
            <div className="flex rounded-lg border p-0.5">
              <button
                onClick={() => setMode("ai")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                AI ile
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Elle
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>İçerik Tipi</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "ai" && (
              <div className="space-y-1.5">
                <Label>Ton</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Ürün</Label>
            {(products ?? []).length > 0 && (
              <Select value="" onValueChange={v => setProductName(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kayıtlı ürünlerden seç (opsiyonel)" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map(p => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="Veya ürün adını elle yazın: örn. Meteor M1128 Nemesis Bukalemun Boya"
            />
          </div>
          {mode === "ai" ? (
            <>
              <div className="space-y-1.5">
                <Label>Ürün Detayları (opsiyonel)</Label>
                <Textarea
                  value={productDetails}
                  onChange={e => setProductDetails(e.target.value)}
                  rows={2}
                  placeholder="Örn. açıdan açıya renk değiştiren bukalemun efekt, 1K bazkat, airbrush uyumlu"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ek Yönergeler (opsiyonel)</Label>
                <Input
                  value={extra}
                  onChange={e => setExtra(e.target.value)}
                  placeholder="Örn. %43 indirimi vurgula, kısa tut"
                />
              </div>
              <Button onClick={submit} disabled={generate.isPending} className="w-full">
                {generate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Üretiliyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" /> Metni Üret
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Metin</Label>
                <Textarea
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  rows={8}
                  placeholder="Kendi yazdığın gönderi/açıklama metnini buraya yapıştır veya yaz — arşivde saklanır, istediğinde kopyalarsın."
                />
              </div>
              <Button
                onClick={() => {
                  if (!manualText.trim()) return toast.error("Metin boş olamaz");
                  saveManual.mutate({
                    contentType: contentType as "urun_aciklamasi" | "instagram_post" | "reklam_metni",
                    productName: productName.trim() || null,
                    content: manualText.trim(),
                  });
                }}
                disabled={saveManual.isPending}
                className="w-full"
              >
                <PenLine className="h-4 w-4 mr-1" /> Arşive Kaydet
              </Button>
            </>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sonuç</h2>
            {result && (
              <Button size="sm" variant="outline" onClick={() => copyText(result)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Kopyala
              </Button>
            )}
          </div>
          {result ? (
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border bg-muted/40 p-4 overflow-y-auto max-h-[420px]">
              <Streamdown>{result}</Streamdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Üretilen metin burada görünecek.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Geçmiş Üretimler</h2>
        {(history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Henüz metin üretilmedi.</p>
        ) : (
          <div className="space-y-2">
            {(history ?? []).map(h => (
              <div key={h.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {CONTENT_TYPES.find(t => t.value === h.contentType)?.label ?? h.contentType}
                  </Badge>
                  {h.productName && <span className="text-sm font-medium">{h.productName}</span>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(h.createdAt).toLocaleString("tr-TR")}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyText(h.content)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => deleteText.mutate({ id: h.id })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{h.content}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
