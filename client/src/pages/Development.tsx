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
import { Textarea } from "@/components/ui/textarea";
import TemplatePicker from "@/components/TemplatePicker";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  Package,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STEPS = [
  { n: 1, label: "Tanım" },
  { n: 2, label: "Reçete Denemeleri" },
  { n: 3, label: "Test Notları" },
  { n: 4, label: "Maliyet & Fiyat" },
  { n: 5, label: "Ürünleştir" },
];

const RESULT_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Değerlendirilmedi", cls: "bg-muted text-muted-foreground" },
  success: { label: "Tuttu ✓", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  partial: { label: "Kısmen", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  fail: { label: "Olmadı", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
};

type TrialItemRow = { materialId: string; qty: string; note: string };

export default function Development() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return selectedId === null ? (
    <ProjectList onOpen={setSelectedId} />
  ) : (
    <ProjectDetail id={selectedId} onBack={() => setSelectedId(null)} />
  );
}

/* ------------------------- Proje listesi ------------------------- */

function ProjectList({ onOpen }: { onOpen: (id: number) => void }) {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.dev.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetUse, setTargetUse] = useState("");

  const createProject = trpc.dev.create.useMutation({
    onSuccess: () => {
      utils.dev.list.invalidate();
      setDialogOpen(false);
      setName("");
      setTargetUse("");
      toast.success("Proje oluşturuldu — adım adım ilerleyin");
    },
    onError: e => toast.error(e.message),
  });

  const deleteProject = trpc.dev.delete.useMutation({
    onSuccess: () => {
      utils.dev.list.invalidate();
      toast.success("Proje silindi");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ürün Geliştirme</h1>
          <p className="text-sm text-muted-foreground">
            Fikirden bitmiş ürüne 5 adım: tanım → reçete → test → fiyat → ürünleştir.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Proje
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      ) : (projects ?? []).length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">Henüz geliştirme projesi yok</p>
          <p className="text-sm text-muted-foreground">
            "Yeni Proje" ile başlayın — sistem sizi adım adım yönlendirir.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(projects ?? []).map(p => (
            <Card key={p.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  {p.targetUse && (
                    <p className="text-xs text-muted-foreground truncate">{p.targetUse}</p>
                  )}
                </div>
                {p.status === "done" ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Ürünleşti
                  </Badge>
                ) : (
                  <Badge variant="secondary">Adım {p.currentStep}/5</Badge>
                )}
              </div>
              <div className="flex gap-1">
                {STEPS.map(s => (
                  <span
                    key={s.n}
                    className={`h-1.5 flex-1 rounded-full ${
                      p.status === "done" || s.n <= p.currentStep ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Button size="sm" onClick={() => onOpen(p.id)}>
                  {p.status === "done" ? "Görüntüle" : "Devam Et"}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`"${p.name}" projesi ve tüm denemeleri silinsin mi?`)) {
                      deleteProject.mutate({ id: p.id });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Geliştirme Projesi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Çalışma Adı *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Örn. Gece Mavisi Metalik"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hedef Kullanım / Yüzey</Label>
              <Input
                value={targetUse}
                onChange={e => setTargetUse(e.target.value)}
                placeholder="Örn. Ahşap mobilya, iç mekan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={createProject.isPending}
              onClick={() => {
                if (!name.trim()) return toast.error("Çalışma adı gerekli");
                createProject.mutate({ name: name.trim(), targetUse: targetUse.trim() || null });
              }}
            >
              Başla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------- Proje detayı (5 adım) ------------------------- */

function ProjectDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.dev.get.useQuery({ id });
  const { data: materials } = trpc.materials.list.useQuery();
  const [step, setStep] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [trialNotes, setTrialNotes] = useState("");
  const [trialRows, setTrialRows] = useState<TrialItemRow[]>([]);

  const project = data?.project;
  const trials = data?.trials ?? [];
  const currentStep = step ?? project?.currentStep ?? 1;
  const isDone = project?.status === "done";

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        targetUse: project.targetUse ?? "",
        series: project.series ?? "",
        colorCode: project.colorCode ?? "",
        colorHex: project.colorHex ?? "",
        applicationNotes: project.applicationNotes ?? "",
        dryingTime: project.dryingTime ?? "",
        coats: project.coats ?? "",
        testNotes: project.testNotes ?? "",
        description: project.description ?? "",
        packaging: project.packaging ?? "",
        labelSize: project.labelSize ?? "",
        labelText: project.labelText ?? "",
        usageGuide: project.usageGuide ?? "",
        safetyNotes: project.safetyNotes ?? "",
        packagingCost: project.packagingCost,
        shippingCost: project.shippingCost,
        salePrice: project.salePrice,
      });
    }
  }, [project]);

  const updateProject = trpc.dev.update.useMutation({
    onSuccess: () => utils.dev.get.invalidate({ id }),
    onError: e => toast.error(e.message),
  });

  const addTrial = trpc.dev.addTrial.useMutation({
    onSuccess: () => {
      utils.dev.get.invalidate({ id });
      setTrialDialogOpen(false);
      setTrialRows([]);
      setTrialNotes("");
      toast.success("Deneme kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const updateTrial = trpc.dev.updateTrial.useMutation({
    onSuccess: () => utils.dev.get.invalidate({ id }),
    onError: e => toast.error(e.message),
  });

  const deleteTrial = trpc.dev.deleteTrial.useMutation({
    onSuccess: () => utils.dev.get.invalidate({ id }),
    onError: e => toast.error(e.message),
  });

  const chooseTrial = trpc.dev.chooseTrial.useMutation({
    onSuccess: () => {
      utils.dev.get.invalidate({ id });
      toast.success("Seçili reçete güncellendi");
    },
    onError: e => toast.error(e.message),
  });

  const convert = trpc.dev.convert.useMutation({
    onSuccess: () => {
      utils.dev.get.invalidate({ id });
      utils.dev.list.invalidate();
      utils.products.list.invalidate();
      toast.success("Ürün oluşturuldu! Formülü ve fiyatı hazır. 🎉");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading || !project) {
    return <p className="text-sm text-muted-foreground">Yükleniyor...</p>;
  }

  function saveFields(fields: string[], nextStep?: number) {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f] ?? "";
      if (["packagingCost", "shippingCost", "salePrice"].includes(f)) {
        payload[f] = parseFloat(v) || 0;
      } else if (f === "name") {
        if (!v.trim()) return toast.error("Ad boş olamaz");
        payload[f] = v.trim();
      } else {
        payload[f] = v.trim() || null;
      }
    }
    if (nextStep && nextStep > (project?.currentStep ?? 1) && !isDone) {
      payload.currentStep = nextStep;
    }
    updateProject.mutate({ id, data: payload as never });
    if (nextStep) setStep(nextStep);
  }

  const materialCost = (items: { qty: string; materialUnitCost: string | null }[]) =>
    items.reduce((s, i) => s + parseFloat(i.qty) * parseFloat(i.materialUnitCost ?? "0"), 0);

  const chosen = trials.find(t => t.isChosen === 1);
  const chosenCost = chosen ? materialCost(chosen.items) : 0;
  const packaging = parseFloat(form.packagingCost ?? "0") || 0;
  const shipping = parseFloat(form.shippingCost ?? "0") || 0;
  const sale = parseFloat(form.salePrice ?? "0") || 0;
  const totalCost = chosenCost + packaging + shipping;
  const profit = sale - totalCost;
  const margin = sale > 0 ? (profit / sale) * 100 : 0;

  const field = (key: string, label: string, placeholder = "", textarea = false, pickerKind?: string) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {pickerKind && (
          <TemplatePicker
            kind={pickerKind}
            onPick={t => setForm(f => ({ ...f, [key]: t.content || t.name }))}
          />
        )}
      </div>
      {textarea ? (
        <Textarea
          rows={2}
          value={form[key] ?? ""}
          placeholder={placeholder}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        />
      ) : (
        <Input
          value={form[key] ?? ""}
          placeholder={placeholder}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Projeler
        </Button>
        <h1 className="text-xl font-bold tracking-tight flex-1 min-w-0 truncate">{project.name}</h1>
        {isDone && (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Ürünleşti
          </Badge>
        )}
      </div>

      {/* Adım çubuğu */}
      <div className="flex gap-1.5 flex-wrap">
        {STEPS.map(s => {
          const reached = isDone || s.n <= (project.currentStep ?? 1);
          return (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                currentStep === s.n
                  ? "bg-primary text-primary-foreground border-primary"
                  : reached
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-transparent"
              }`}
            >
              <span>{s.n}</span> {s.label}
            </button>
          );
        })}
      </div>

      {/* 1: Tanım */}
      {currentStep === 1 && (
        <Card className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Neyi geliştirdiğinizi tanımlayın — bu bilgiler ürünleşince otomatik taşınır.
          </p>
          {field("name", "Çalışma Adı *", "Örn. Gece Mavisi Metalik")}
          {field("targetUse", "Hedef Kullanım / Yüzey", "Örn. Ahşap mobilya, iç mekan")}
          <div className="grid grid-cols-2 gap-3">
            {field("series", "Seri", "Örn. Meteor")}
            {field("colorCode", "Renk Kodu", "Örn. M1130")}
          </div>
          {field("colorHex", "Renk (hex)", "#1a2b5c")}
          <div className="flex justify-end">
            <Button onClick={() => saveFields(["name", "targetUse", "series", "colorCode", "colorHex"], 2)}>
              Kaydet ve Devam <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* 2: Denemeler */}
      {currentStep === 2 && (
        <div className="space-y-3">
          <Card className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Reçete Denemeleri</p>
                <p className="text-sm text-muted-foreground">
                  Her denemeyi kaydedin, sonucunu işaretleyin. Tutan reçeteyi ⭐ ile seçin.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setTrialRows([{ materialId: "", qty: "", note: "" }]);
                  setTrialDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Yeni Deneme
              </Button>
            </div>
          </Card>

          {trials.map(t => (
            <Card key={t.id} className={`p-4 space-y-2 ${t.isChosen ? "border-primary" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">Deneme #{t.trialNo}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${RESULT_LABELS[t.result].cls}`}>
                  {RESULT_LABELS[t.result].label}
                </span>
                {t.isChosen === 1 && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">Seçili Reçete</Badge>
                )}
                <span className="flex-1" />
                <Select
                  value={t.result}
                  onValueChange={v => updateTrial.mutate({ id: t.id, result: v as never })}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Değerlendirilmedi</SelectItem>
                    <SelectItem value="success">Tuttu ✓</SelectItem>
                    <SelectItem value="partial">Kısmen</SelectItem>
                    <SelectItem value="fail">Olmadı</SelectItem>
                  </SelectContent>
                </Select>
                {t.isChosen !== 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => chooseTrial.mutate({ projectId: id, trialId: t.id })}
                  >
                    <Star className="h-3.5 w-3.5 mr-1" /> Seç
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTrial.mutate({ id: t.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-sm space-y-1">
                {t.items.map(i => (
                  <div key={i.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{i.materialName ?? `Malzeme #${i.materialId}`}</span>
                    <span className="text-muted-foreground">
                      {parseFloat(i.qty)} {i.materialUnit ?? ""}
                    </span>
                    <span className="w-24 text-right font-medium">
                      {formatTL(parseFloat(i.qty) * parseFloat(i.materialUnitCost ?? "0"))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Hammadde maliyeti</span>
                  <span>{formatTL(materialCost(t.items))}</span>
                </div>
              </div>
              {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
            </Card>
          ))}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Geri
            </Button>
            <Button
              onClick={() => {
                if (!chosen) return toast.error("Devam etmek için bir reçeteyi 'Seç' ile işaretleyin");
                saveFields([], 3);
              }}
            >
              Devam <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* 3: Test */}
      {currentStep === 3 && (
        <Card className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Uygulama testlerinizin sonuçlarını kaydedin — ürün açıklamasına otomatik eklenir.
          </p>
          {field("applicationNotes", "Uygulama Yöntemi", "Örn. Fırça / rulo, 2 kat, ara zımpara", true, "uygulama_yontemi")}
          <div className="grid grid-cols-2 gap-3">
            {field("dryingTime", "Kuruma Süresi", "Örn. Dokunma 30 dk, tam 24 saat", false, "kuruma_suresi")}
            {field("coats", "Önerilen Kat", "Örn. 2-3", false, "kat_sayisi")}
          </div>
          {field("testNotes", "Test Sonuçları / Gözlemler", "Yüzeyde nasıl durdu, örtücülük, parlaklık...", true, "test_sonucu")}
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-semibold">Etiket & Açıklama</p>
            <p className="text-xs text-muted-foreground">
              Burada doldurduklarınız ürünleşince doğrudan ana ürüne işlenir. Şablonlardan seçebilir
              veya elle yazabilirsiniz.
            </p>
            {field("description", "Ürün Açıklaması", "Pazaryeri/web sitesi açıklaması — boş bırakılırsa test notlarından oluşturulur", true)}
            <div className="grid grid-cols-2 gap-3">
              {field("packaging", "Ambalaj", "Örn. 400 ml Sprey", false, "ambalaj")}
              {field("labelSize", "Etiket Boyutu", "Örn. 6x9 cm", false, "etiket_boyutu")}
            </div>
            {field("labelText", "Etiket Yazısı", "Etiket üzerindeki tam metin", true, "etiket_yazisi")}
            {field("usageGuide", "Kullanım Kılavuzu", "Uygulama adımları", true, "kilavuz")}
            {field("safetyNotes", "Güvenlik / Uyarılar", "Saklama koşulları, uyarılar", true, "guvenlik")}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Geri
            </Button>
            <Button
              onClick={() =>
                saveFields(
                  [
                    "applicationNotes",
                    "dryingTime",
                    "coats",
                    "testNotes",
                    "description",
                    "packaging",
                    "labelSize",
                    "labelText",
                    "usageGuide",
                    "safetyNotes",
                  ],
                  4,
                )
              }
            >
              Kaydet ve Devam <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* 4: Maliyet & Fiyat */}
      {currentStep === 4 && (
        <Card className="p-5 space-y-3">
          <div className="rounded-lg bg-muted/50 p-3 text-sm flex justify-between">
            <span>Seçili reçetenin hammadde maliyeti</span>
            <span className="font-semibold">{chosen ? formatTL(chosenCost) : "Reçete seçilmedi"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("packagingCost", "Ambalaj Maliyeti (₺)", "0")}
            {field("shippingCost", "Kargo Maliyeti (₺)", "0")}
          </div>
          {field("salePrice", "Satış Fiyatı (₺)", "0")}
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Toplam maliyet</span>
              <span className="font-medium">{formatTL(totalCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Net kâr</span>
              <span className={`font-semibold ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatTL(profit)} ({margin.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Geri
            </Button>
            <Button onClick={() => saveFields(["packagingCost", "shippingCost", "salePrice"], 5)}>
              Kaydet ve Devam <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* 5: Ürünleştir */}
      {currentStep === 5 && (
        <Card className="p-5 space-y-4">
          {isDone ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
              <p className="font-semibold">Bu proje ürüne dönüştürüldü</p>
              <Button onClick={() => setLocation("/urunler")}>
                <Package className="h-4 w-4 mr-1" /> Ürünlere Git
              </Button>
            </div>
          ) : (
            <>
              <p className="font-semibold">Özet — her şey hazır mı?</p>
              <div className="text-sm space-y-1.5">
                <SummaryRow ok={!!project.name} label={`Ad: ${project.name}`} />
                <SummaryRow ok={!!project.targetUse} label={`Kullanım: ${project.targetUse || "—"}`} />
                <SummaryRow
                  ok={!!chosen}
                  label={chosen ? `Seçili reçete: Deneme #${chosen.trialNo} (${chosen.items.length} hammadde)` : "Seçili reçete yok"}
                />
                <SummaryRow ok={!!project.dryingTime || !!project.applicationNotes} label="Test notları" />
                <SummaryRow
                  ok={parseFloat(project.salePrice) > 0}
                  label={`Satış fiyatı: ${formatTL(project.salePrice)} (marj %${margin.toFixed(1)})`}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                "Ürünü Oluştur" dediğinizde ürün; formülü, fiyatı, rengi ve açıklamasıyla birlikte
                Ürünler, Formül Defteri ve Maliyet sayfalarında kullanıma hazır olur.
              </p>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(4)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Geri
                </Button>
                <Button
                  disabled={convert.isPending || !chosen}
                  onClick={() => convert.mutate({ id })}
                >
                  <Package className="h-4 w-4 mr-1" /> Ürünü Oluştur
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Deneme ekleme penceresi */}
      <Dialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Yeni Reçete Denemesi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Hammaddeler</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setTrialRows(r => [...r, { materialId: "", qty: "", note: "" }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Satır
                </Button>
              </div>
              {trialRows.map((row, idx) => {
                const mat = materials?.find(m => String(m.id) === row.materialId);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_90px_28px] gap-1.5 items-center">
                    <Select
                      value={row.materialId}
                      onValueChange={v =>
                        setTrialRows(rows => rows.map((r, i) => (i === idx ? { ...r, materialId: v } : r)))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Hammadde seç" />
                      </SelectTrigger>
                      <SelectContent>
                        {(materials ?? []).map(m => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name} ({m.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder={mat ? mat.unit : "Miktar"}
                      value={row.qty}
                      onChange={e =>
                        setTrialRows(rows =>
                          rows.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setTrialRows(rows => rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {(materials ?? []).length === 0 && (
                <p className="text-xs text-amber-600">
                  Önce "Stok & Hammadde" sayfasından hammaddelerinizi ekleyin.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Deneme Notu</Label>
              <Textarea
                rows={2}
                value={trialNotes}
                onChange={e => setTrialNotes(e.target.value)}
                placeholder="Ne değiştirdiniz, ne gözlemlediniz?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialogOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={addTrial.isPending}
              onClick={() => {
                const items = trialRows
                  .filter(r => r.materialId && parseFloat(r.qty) > 0)
                  .map(r => ({ materialId: Number(r.materialId), qty: parseFloat(r.qty) }));
                if (items.length === 0) return toast.error("En az bir hammadde satırı girin");
                addTrial.mutate({ projectId: id, notes: trialNotes.trim() || null, items });
              }}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Check className={`h-4 w-4 ${ok ? "text-emerald-500" : "text-muted-foreground/40"}`} />
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
