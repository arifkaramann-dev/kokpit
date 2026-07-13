import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertCircle, MessageCircleQuestion, PackageX, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Pazaryeri Yönetimi: iade takibi, müşteri soru-cevap ve sıfırdan ilan açma.
 * Veriler pazaryeri API'lerinden canlı çekilir — bu özellikler Render'da API
 * anahtarı girildikten sonra çalışır.
 */
export default function Marketplace() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pazaryeri Yönetimi</h1>
        <p className="text-sm text-muted-foreground">
          İade talepleri, müşteri soruları ve yeni ilan açma. Veriler pazaryeri API'lerinden canlı gelir.
        </p>
      </div>

      <Tabs defaultValue="returns">
        <TabsList>
          <TabsTrigger value="returns">
            <PackageX className="h-4 w-4 mr-1.5" /> İadeler
          </TabsTrigger>
          <TabsTrigger value="questions">
            <MessageCircleQuestion className="h-4 w-4 mr-1.5" /> Sorular
          </TabsTrigger>
          <TabsTrigger value="listing">
            <Store className="h-4 w-4 mr-1.5" /> Yeni İlan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="returns" className="pt-4">
          <ReturnsTab />
        </TabsContent>
        <TabsContent value="questions" className="pt-4">
          <QuestionsTab />
        </TabsContent>
        <TabsContent value="listing" className="pt-4">
          <ListingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApiHint({ message }: { message: string }) {
  return (
    <Card className="p-4 flex items-start gap-2 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Pazaryeri bağlantısı gerekli</p>
        <p className="text-muted-foreground mt-0.5">{message}</p>
        <p className="text-muted-foreground mt-1">
          Render → Environment'a API anahtarlarını girip Ayarlar'dan bağlantıyı test edin.
        </p>
      </div>
    </Card>
  );
}

function ReturnsTab() {
  const { data, isLoading, error } = trpc.marketplace.returns.useQuery(undefined, { retry: false });
  if (isLoading) return <div className="h-32 rounded-xl bg-muted animate-pulse" />;
  if (error) return <ApiHint message={error.message} />;
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground py-8 text-center">Açık iade talebi yok. 👍</p>;

  return (
    <div className="space-y-2">
      {data.map(r => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{r.customerName ?? "Müşteri"}</span>
                <Badge variant="secondary">{r.status}</Badge>
                <span className="text-[11px] text-muted-foreground font-mono">{r.orderNo}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{r.items}</p>
              {r.reason && <p className="text-xs mt-1">İade sebebi: {r.reason}</p>}
            </div>
            {r.createdAt && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString("tr-TR")}
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuestionsTab() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.marketplace.questions.useQuery(undefined, { retry: false });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answer = trpc.marketplace.answerQuestion.useMutation({
    onSuccess: () => {
      utils.marketplace.questions.invalidate();
      toast.success("Cevap gönderildi");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <div className="h-32 rounded-xl bg-muted animate-pulse" />;
  if (error) return <ApiHint message={error.message} />;
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground py-8 text-center">Cevap bekleyen soru yok. 👍</p>;

  return (
    <div className="space-y-2">
      {data.map(q => (
        <Card key={q.id} className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{q.customerName ?? "Müşteri"}</span>
            {q.productName && <Badge variant="secondary">{q.productName}</Badge>}
            <Badge variant={q.answered ? "outline" : "default"}>
              {q.answered ? "Cevaplandı" : "Bekliyor"}
            </Badge>
          </div>
          <p className="text-sm">{q.text}</p>
          {!q.answered && (
            <div className="flex gap-2 items-start pt-1">
              <Textarea
                rows={2}
                placeholder="Cevabınız..."
                value={answers[q.id] ?? ""}
                onChange={e => setAnswers(s => ({ ...s, [q.id]: e.target.value }))}
              />
              <Button
                size="sm"
                disabled={answer.isPending || !(answers[q.id] ?? "").trim()}
                onClick={() => answer.mutate({ questionId: q.id, text: answers[q.id] })}
              >
                Gönder
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ListingTab() {
  const { data: products } = trpc.products.list.useQuery();
  const [form, setForm] = useState({
    productId: "",
    barcode: "",
    title: "",
    brandId: "",
    categoryId: "",
    quantity: "",
    listPrice: "",
    salePrice: "",
    vatRate: "20",
    description: "",
  });

  const createListing = trpc.marketplace.createListing.useMutation({
    onSuccess: r => toast.success(`İlan gönderildi${r.batchRequestId ? ` (parti: ${r.batchRequestId})` : ""}`),
    onError: e => toast.error(e.message),
  });

  function fillFromProduct(id: string) {
    const p = (products ?? []).find(x => String(x.id) === id);
    if (!p) {
      setForm(f => ({ ...f, productId: id }));
      return;
    }
    setForm(f => ({
      ...f,
      productId: id,
      barcode: p.barcode ?? f.barcode,
      title: p.name,
      salePrice: String(parseFloat(p.salePrice) || ""),
      listPrice: String(parseFloat(p.salePrice) || ""),
      quantity: String(p.stockQty ?? ""),
      description: p.description ?? f.description,
    }));
  }

  function submit() {
    if (!form.barcode.trim() || !form.title.trim() || !form.brandId || !form.categoryId) {
      toast.error("Barkod, başlık, marka ID ve kategori ID zorunlu");
      return;
    }
    createListing.mutate({
      barcode: form.barcode.trim(),
      title: form.title.trim(),
      productMainId: form.barcode.trim(),
      brandId: parseInt(form.brandId, 10) || 0,
      categoryId: parseInt(form.categoryId, 10) || 0,
      quantity: parseInt(form.quantity, 10) || 0,
      listPrice: parseFloat(form.listPrice) || 0,
      salePrice: parseFloat(form.salePrice) || 0,
      description: form.description.trim(),
      images: [],
      vatRate: parseFloat(form.vatRate) || 20,
      attributes: [],
    });
  }

  return (
    <Card className="p-5 space-y-3 max-w-2xl">
      <div>
        <h2 className="font-semibold">Trendyol'da Sıfırdan İlan Aç</h2>
        <p className="text-xs text-muted-foreground">
          Bir ürün seçip bilgileri doldurun. Marka ID ve kategori ID Trendyol panelinden alınır; zorunlu
          kategori özellikleri (attribute) gerekiyorsa Trendyol yanıtındaki uyarıya göre eklenir. İlan açma
          canlıda API anahtarıyla çalışır.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Üründen Doldur</Label>
        <select
          value={form.productId}
          onChange={e => fillFromProduct(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">— Ürün seç —</option>
          {(products ?? []).map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Barkod" value={form.barcode} onChange={v => setForm(f => ({ ...f, barcode: v }))} />
        <Field label="Başlık" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
        <Field label="Marka ID" value={form.brandId} onChange={v => setForm(f => ({ ...f, brandId: v }))} type="number" />
        <Field label="Kategori ID" value={form.categoryId} onChange={v => setForm(f => ({ ...f, categoryId: v }))} type="number" />
        <Field label="Stok Adedi" value={form.quantity} onChange={v => setForm(f => ({ ...f, quantity: v }))} type="number" />
        <Field label="KDV %" value={form.vatRate} onChange={v => setForm(f => ({ ...f, vatRate: v }))} type="number" />
        <Field label="Liste Fiyatı" value={form.listPrice} onChange={v => setForm(f => ({ ...f, listPrice: v }))} type="number" />
        <Field label="Satış Fiyatı" value={form.salePrice} onChange={v => setForm(f => ({ ...f, salePrice: v }))} type="number" />
      </div>
      <div className="space-y-1.5">
        <Label>Açıklama</Label>
        <Textarea
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>
      {form.salePrice && (
        <p className="text-xs text-muted-foreground">Satış fiyatı: {formatTL(form.salePrice)}</p>
      )}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={createListing.isPending}>
          Trendyol'a İlan Gönder
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
