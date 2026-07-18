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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, MessageSquare, Plus, RefreshCw, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const SOURCE_LABELS: Record<string, string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  n11: "N11",
  ciceksepeti: "Çiçeksepeti",
  whatsapp: "WhatsApp",
  email: "E-posta",
  elle: "Elle",
};

type Question = {
  id: number;
  source: string;
  customerName: string | null;
  questionText: string;
  productId: number | null;
  productName: string | null;
  status: "new" | "answered" | "dismissed";
  answerDraft: string | null;
  answerText: string | null;
  createdAt: string | Date;
};

export default function Questions() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"new" | "answered" | "dismissed">("new");
  const { data: questions, isLoading } = trpc.questions.list.useQuery({ status: tab });
  const { data: products } = trpc.products.list.useQuery();
  const { data: autoAnswer } = trpc.questions.autoAnswer.useQuery();

  const invalidate = () => {
    utils.questions.list.invalidate();
    utils.questions.newCount.invalidate();
  };

  const setAutoAnswer = trpc.questions.setAutoAnswer.useMutation({
    onSuccess: r => {
      utils.questions.autoAnswer.invalidate();
      toast.success(r.enabled ? "Oto-cevap açıldı" : "Oto-cevap kapatıldı");
    },
    onError: e => toast.error(e.message),
  });

  const syncNow = trpc.questions.syncNow.useMutation({
    onSuccess: r => {
      invalidate();
      if (!r.ok && r.errors.length === 0) {
        toast.info("Trendyol bağlı değil — çekme yalnızca canlı ortamda ve bağlantı sonrası çalışır");
      } else if (r.errors.length > 0) {
        toast.error(r.errors[0], { duration: 8000 });
      } else if (r.imported === 0) {
        toast.success("Cevap bekleyen yeni soru yok");
      } else {
        const parts = [`${r.imported} yeni soru`];
        if (r.autoAnswered > 0) parts.push(`${r.autoAnswered} otomatik yanıtlandı`);
        if (r.drafted > 0) parts.push(`${r.drafted} taslak onay bekliyor`);
        toast.success(parts.join(" · "));
      }
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ source: "elle", customerName: "", questionText: "", productId: "" });
  // Cevap düzenleme metni (soru id → metin).
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const create = trpc.questions.create.useMutation({
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setForm({ source: "elle", customerName: "", questionText: "", productId: "" });
      toast.success("Soru eklendi");
    },
    onError: e => toast.error(e.message),
  });

  const genDraft = trpc.questions.generateDraft.useMutation({
    onSuccess: (r, vars) => {
      setAnswers(a => ({ ...a, [vars.id]: r.draft }));
      utils.questions.list.invalidate();
      toast.success("AI cevap taslağı hazır — düzenleyip gönderebilirsiniz");
    },
    onError: e => toast.error(e.message, { duration: 8000 }),
  });

  const answer = trpc.questions.answer.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Yanıtlandı olarak işaretlendi");
    },
    onError: e => toast.error(e.message),
  });

  const dismiss = trpc.questions.dismiss.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Kapatıldı");
    },
    onError: e => toast.error(e.message),
  });

  const list = (questions as Question[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Soru-Cevap Kuyruğu</h1>
          <p className="text-sm text-muted-foreground">
            Pazaryeri müşteri soruları otomatik çekilir; oto-cevap açıkken AI güvenilir cevapları
            kendisi gönderir, emin olmadıklarını taslak olarak onayınıza bırakır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={syncNow.isPending}
            onClick={() => syncNow.mutate()}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncNow.isPending ? "animate-spin" : ""}`} />
            {syncNow.isPending ? "Çekiliyor..." : "Soruları Çek"}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Soru Ekle
          </Button>
        </div>
      </div>

      <Card className="p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium flex items-center gap-2">
              Otomatik Cevap
              <Badge variant={autoAnswer ? "default" : "secondary"} className="text-[10px]">
                {autoAnswer ? "Açık" : "Kapalı"}
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground max-w-xl">
              Açıkken, çekilen her yeni soruya AI cevap üretir; yalnızca <b>emin olduğu</b> cevapları
              (genel ürün/kullanım bilgisi) pazaryerine otomatik gönderir. Fiyat, kargo, iade, stok
              gibi kişiye özel sorular otomatik gönderilmez — taslakla onayınızı bekler.
            </p>
          </div>
        </div>
        <Switch
          checked={!!autoAnswer}
          disabled={setAutoAnswer.isPending}
          onCheckedChange={v => setAutoAnswer.mutate({ enabled: v })}
        />
      </Card>

      <div className="flex items-center rounded-lg border p-0.5 w-fit">
        {(
          [
            ["new", "Yeni"],
            ["answered", "Yanıtlanan"],
            ["dismissed", "Kapatılan"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && list.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Bu sekmede soru yok</p>
          <p className="text-sm text-muted-foreground">
            Pazaryerinden gelen soruyu "Soru Ekle" ile kopyalayıp AI cevap taslağı üretebilirsiniz.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {list.map(q => (
          <Card key={q.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{SOURCE_LABELS[q.source] ?? q.source}</Badge>
                {q.customerName && <span className="text-sm font-medium">{q.customerName}</span>}
                {(q.productName || q.productId) && (
                  <Badge variant="outline" className="text-[10px]">
                    {q.productName ?? `Ürün #${q.productId}`}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</span>
              </div>
            </div>

            <p className="text-sm whitespace-pre-wrap rounded-lg border bg-muted/30 p-3">{q.questionText}</p>

            {q.status === "answered" ? (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-emerald-600">Gönderilen cevap</p>
                <p className="text-sm whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                  {q.answerText}
                </p>
              </div>
            ) : q.status === "new" ? (
              <div className="space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Cevap yazın veya 'AI Taslak' ile üretin..."
                  value={answers[q.id] ?? q.answerDraft ?? ""}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={genDraft.isPending}
                    onClick={() => genDraft.mutate({ id: q.id })}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {genDraft.isPending ? "Üretiliyor..." : "AI Taslak"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={answer.isPending || !(answers[q.id] ?? q.answerDraft ?? "").trim()}
                    onClick={() =>
                      answer.mutate({ id: q.id, answerText: (answers[q.id] ?? q.answerDraft ?? "").trim() })
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Yanıtlandı İşaretle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss.mutate({ id: q.id })}>
                    <X className="h-3.5 w-3.5 mr-1" /> Kapat
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pazaryerinden gelen sorularda "Yanıtlandı İşaretle" cevabı doğrudan pazaryerine gönderir;
                  elle eklenen sorularda yalnızca kuyrukta işaretlenir.
                </p>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => answer.mutate({ id: q.id, answerText: q.answerText ?? q.questionText })}>
                Tekrar aç / yanıtla
              </Button>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Soru Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kaynak</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Müşteri (opsiyonel)</Label>
                <Input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Ad soyad"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>İlgili Ürün (opsiyonel)</Label>
              <Select value={form.productId || "__none__"} onValueChange={v => setForm(f => ({ ...f, productId: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Ürün seç" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Ürün yok —</SelectItem>
                  {(products ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Ürün seçilirse AI cevap taslağı o ürünün kılavuzundan beslenir.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Soru *</Label>
              <Textarea
                rows={3}
                value={form.questionText}
                onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
                placeholder="Müşterinin sorusunu buraya yapıştırın"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={!form.questionText.trim() || create.isPending}
              onClick={() => {
                const productId = form.productId ? Number(form.productId) : null;
                const productName = productId
                  ? (products ?? []).find(p => p.id === productId)?.name ?? null
                  : null;
                create.mutate({
                  source: form.source as never,
                  customerName: form.customerName.trim() || null,
                  questionText: form.questionText.trim(),
                  productId,
                  productName,
                });
              }}
            >
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
