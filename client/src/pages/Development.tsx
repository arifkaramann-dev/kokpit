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
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { calcDevProfit } from "@shared/pricing";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  GripVertical,
  LayoutGrid,
  List,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
  const confirm = useConfirm();
  const { data: projects, isLoading } = trpc.dev.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetUse, setTargetUse] = useState("");
  // Liste (kart ızgarası) veya Pano (adım adım kanban) görünümü; tercih saklanır.
  const [view, setView] = useState<"list" | "board">(
    () => (localStorage.getItem("dev-view") as "list" | "board") || "list",
  );
  useEffect(() => {
    localStorage.setItem("dev-view", view);
  }, [view]);

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

  // Panoda kart sürüklenince projenin geliştirme adımını günceller (optimistic).
  const setStep = trpc.dev.update.useMutation({
    onMutate: async ({ id, data }) => {
      await utils.dev.list.cancel();
      const prev = utils.dev.list.getData();
      utils.dev.list.setData(undefined, old =>
        old?.map(p => (p.id === id ? { ...p, currentStep: data.currentStep ?? p.currentStep } : p)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.dev.list.setData(undefined, ctx.prev);
      toast.error("Adım güncellenemedi");
    },
    onSettled: () => utils.dev.list.invalidate(),
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
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Liste görünümü"
            >
              <List className="h-3.5 w-3.5" /> Liste
            </button>
            <button
              onClick={() => setView("board")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === "board" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Pano (adım adım) görünümü"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Pano
            </button>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Yeni Proje
          </Button>
        </div>
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
      ) : view === "board" ? (
        <DevBoard
          projects={projects ?? []}
          onOpen={onOpen}
          onStepChange={(id, step) => setStep.mutate({ id, data: { currentStep: step } })}
        />
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
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Projeyi sil",
                        description: `"${p.name}" projesi ve tüm denemeleri silinsin mi?`,
                        confirmText: "Sil",
                        destructive: true,
                      })
                    )
                      deleteProject.mutate({ id: p.id });
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
  const { data: settings } = trpc.settings.get.useQuery();
  const [step, setStep] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [trialNotes, setTrialNotes] = useState("");
  const [trialRows, setTrialRows] = useState<TrialItemRow[]>([]);
  // Düzenlenen deneme id'si (null → yeni deneme ekleniyor).
  const [editTrialId, setEditTrialId] = useState<number | null>(null);
  // KDV, komisyon ve adet başı işçilik+genel gider (ayarlardan gelir; düzenlenip global kaydedilir).
  const [rates, setRates] = useState<{ vat: string; commission: string; labor: string }>({ vat: "", commission: "", labor: "" });

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

  // Oranların varsayılanı: KDV → ayarlardaki vatRate (yoksa 20), komisyon → PAYTR %3,9.
  useEffect(() => {
    if (settings) {
      setRates(r => ({
        vat: r.vat || (settings.vatRate ?? "20"),
        commission: r.commission || (settings.devCommissionPercent ?? "3.9"),
        labor: r.labor || (settings.unitLaborOverhead ?? "0"),
      }));
    }
  }, [settings]);

  const saveRates = trpc.settings.save.useMutation();

  const updateProject = trpc.dev.update.useMutation({
    onSuccess: () => utils.dev.get.invalidate({ id }),
    onError: e => toast.error(e.message),
  });

  function closeTrialDialog() {
    setTrialDialogOpen(false);
    setEditTrialId(null);
    setTrialRows([]);
    setTrialNotes("");
  }

  const addTrial = trpc.dev.addTrial.useMutation({
    onSuccess: () => {
      utils.dev.get.invalidate({ id });
      closeTrialDialog();
      toast.success("Deneme kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const updateTrial = trpc.dev.updateTrial.useMutation({
    onSuccess: (_r, vars) => {
      utils.dev.get.invalidate({ id });
      // Reçete (hammadde) düzenlemesi kaydedildiyse pencereyi kapat.
      if (vars.items) {
        closeTrialDialog();
        toast.success("Reçete güncellendi");
      }
    },
    onError: e => toast.error(e.message),
  });

  // Var olan denemeyi düzenlemek için pencereyi mevcut hammadde/notla açar.
  function openEditTrial(trial: { id: number; notes: string | null; items: { materialId: number; qty: string }[] }) {
    setEditTrialId(trial.id);
    setTrialNotes(trial.notes ?? "");
    setTrialRows(
      trial.items.length > 0
        ? trial.items.map(i => ({ materialId: String(i.materialId), qty: String(parseFloat(i.qty)), note: "" }))
        : [{ materialId: "", qty: "", note: "" }],
    );
    setTrialDialogOpen(true);
  }

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
  const vatPct = parseFloat(rates.vat) || 0;
  const commissionPct = parseFloat(rates.commission) || 0;
  const laborOverhead = parseFloat(rates.labor) || 0;
  // Gerçek net kâr: KDV, komisyon ve işçilik+genel gider dahil. Maliyet/satış KDV dahil.
  // Reçete hammadde maliyeti KDV HARİÇ (net) gelir; motor KDV dahil beklediği için
  // KDV'yle brütleştirilir (çift-netleştirme YOK, Tema 0 #3). Ambalaj/kargo zaten KDV dahil.
  const dev = calcDevProfit({
    salePrice: sale,
    materialCost: chosenCost * (1 + vatPct / 100),
    packagingCost: packaging,
    shippingCost: shipping,
    commissionPercent: commissionPct,
    vatPercent: vatPct,
    laborOverheadCost: laborOverhead,
  });
  const totalCost = dev.totalCostGross;
  const profit = dev.net;
  const margin = dev.marginOnSale;

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
                  setEditTrialId(null);
                  setTrialNotes("");
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
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => openEditTrial(t)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Düzenle
                </Button>
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
            <span>Seçili reçetenin hammadde maliyeti (KDV dahil)</span>
            <span className="font-semibold">{chosen ? formatTL(chosenCost) : "Reçete seçilmedi"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("packagingCost", "Ambalaj Maliyeti (₺, KDV dahil)", "0")}
            {field("shippingCost", "Kargo Maliyeti (₺, KDV dahil)", "0")}
          </div>
          {field("salePrice", "Satış Fiyatı (₺, KDV dahil)", "0")}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>KDV Oranı (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={rates.vat}
                placeholder="20"
                onChange={e => setRates(r => ({ ...r, vat: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Komisyon / Ödeme (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={rates.commission}
                placeholder="3.9"
                onChange={e => setRates(r => ({ ...r, commission: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Pazaryeri/POS komisyonu. Örn. PAYTR %3,9, Trendyol ~%20.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>İşçilik + Genel Gider (₺/adet)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={rates.labor}
              placeholder="0"
              onChange={e => setRates(r => ({ ...r, labor: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Adet başı işçilik + genel gider (kira/elektrik payı). KDV hariç. Öneri: aylık genel
              gider ÷ aylık üretilen adet + işçilik payı.
            </p>
          </div>

          {/* Excel'le aynı kâr dökümü: KDV ve komisyon dahil gerçek net kâr. */}
          <div className="rounded-lg border p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span>Toplam maliyet (KDV dahil)</span>
              <span className="font-medium">{formatTL(totalCost)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Satış (KDV hariç)</span>
              <span>{formatTL(dev.saleEx)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Maliyet (KDV hariç)</span>
              <span>−{formatTL(dev.costEx)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Komisyon ({commissionPct.toLocaleString("tr-TR")}%)</span>
              <span>−{formatTL(dev.commission)}</span>
            </div>
            {laborOverhead > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>İşçilik + genel gider</span>
                <span>−{formatTL(dev.laborOverheadCost)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground border-t pt-1.5">
              <span>Hesaplanan KDV</span>
              <span>{formatTL(dev.outputVat)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>İndirilecek KDV</span>
              <span>−{formatTL(dev.inputVat)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Ödenecek KDV (vergi matrahı)</span>
              <span>{formatTL(dev.vatPayable)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 text-base">
              <span className="font-medium">Net kâr</span>
              <span className={`font-semibold ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatTL(profit)} ({margin.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Net kâr = (satış − komisyon) KDV'den arındırılıp maliyet düşülerek bulunur; KDV ve
              komisyon hesaba katılır (basit "satış − maliyet" değil).
            </p>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Geri
            </Button>
            <Button
              onClick={() => {
                saveRates.mutate({
                  vatRate: rates.vat || "20",
                  devCommissionPercent: rates.commission || "0",
                  unitLaborOverhead: rates.labor || "0",
                });
                saveFields(["packagingCost", "shippingCost", "salePrice"], 5);
              }}
            >
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

      {/* Deneme ekleme / düzenleme penceresi */}
      <Dialog open={trialDialogOpen} onOpenChange={o => (o ? setTrialDialogOpen(true) : closeTrialDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTrialId ? "Reçeteyi Düzenle" : "Yeni Reçete Denemesi"}</DialogTitle>
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
            <Button variant="outline" onClick={closeTrialDialog}>
              İptal
            </Button>
            <Button
              disabled={addTrial.isPending || updateTrial.isPending}
              onClick={() => {
                const items = trialRows
                  .filter(r => r.materialId && parseFloat(r.qty) > 0)
                  .map(r => ({ materialId: Number(r.materialId), qty: parseFloat(r.qty) }));
                if (items.length === 0) return toast.error("En az bir hammadde satırı girin");
                const notes = trialNotes.trim() || null;
                if (editTrialId) {
                  updateTrial.mutate({ id: editTrialId, notes, items });
                } else {
                  addTrial.mutate({ projectId: id, notes, items });
                }
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

/* ------------------------- Geliştirme panosu (kanban) ------------------------- */

type DevBoardProject = {
  id: number;
  name: string;
  targetUse: string | null;
  status: "active" | "done" | "archived";
  currentStep: number;
};

/**
 * Aktif geliştirme projelerini 5 adıma göre kanban sütunlarında gösterir.
 * Kartı bir adıma sürükleyince projenin currentStep'i güncellenir. Ürünleşen
 * (done) projeler panoda gösterilmez; liste görünümünde görünür.
 */
function DevBoard({
  projects,
  onOpen,
  onStepChange,
}: {
  projects: DevBoardProject[];
  onOpen: (id: number) => void;
  onStepChange: (id: number, step: number) => void;
}) {
  const active = projects.filter(p => p.status !== "done" && p.status !== "archived");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragId, setDragId] = useState<number | null>(null);
  const dragged = active.find(p => p.id === dragId) ?? null;

  function handleEnd(e: DragEndEvent) {
    setDragId(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = Number(a.id);
    const step = Number(over.id);
    const proj = active.find(p => p.id === id);
    if (proj && proj.currentStep !== step) onStepChange(id, step);
  }

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        onDragStart={e => setDragId(Number(e.active.id))}
        onDragEnd={handleEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {STEPS.map(step => (
            <DevStepColumn
              key={step.n}
              step={step}
              projects={active.filter(p => p.currentStep === step.n)}
              onOpen={onOpen}
            />
          ))}
        </div>
        <DragOverlay>
          {dragged ? <DevBoardCard project={dragged} onOpen={onOpen} overlay /> : null}
        </DragOverlay>
      </DndContext>
      {projects.some(p => p.status === "done") && (
        <p className="text-xs text-muted-foreground">
          Ürünleşen projeler panoda gösterilmez — liste görünümünde görüntüleyin.
        </p>
      )}
    </div>
  );
}

function DevStepColumn({
  step,
  projects,
  onOpen,
}: {
  step: (typeof STEPS)[number];
  projects: DevBoardProject[];
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(step.n) });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-card p-2.5 flex flex-col gap-2 min-h-[160px] transition-colors ${
        isOver ? "ring-2 ring-primary/60 bg-accent/40" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {step.n}
        </span>
        <span className="text-xs font-semibold">{step.label}</span>
        <Badge variant="secondary" className="ml-auto">
          {projects.length}
        </Badge>
      </div>
      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground border border-dashed rounded-lg py-6">
          —
        </div>
      ) : (
        projects.map(p => <DraggableDevCard key={p.id} project={p} onOpen={onOpen} />)
      )}
    </div>
  );
}

function DraggableDevCard({
  project,
  onOpen,
}: {
  project: DevBoardProject;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: project.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <DevBoardCard
        project={project}
        onOpen={onOpen}
        dragHandle={{
          attributes: attributes as unknown as React.HTMLAttributes<HTMLButtonElement>,
          listeners,
        }}
      />
    </div>
  );
}

function DevBoardCard({
  project,
  onOpen,
  overlay,
  dragHandle,
}: {
  project: DevBoardProject;
  onOpen: (id: number) => void;
  overlay?: boolean;
  dragHandle?: {
    attributes: React.HTMLAttributes<HTMLButtonElement>;
    listeners: Record<string, unknown> | undefined;
  };
}) {
  return (
    <Card className={`p-2.5 space-y-1.5 ${overlay ? "shadow-xl rotate-2" : "shadow-sm"}`}>
      <div className="flex items-start gap-1.5">
        <button
          className="mt-0.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...(dragHandle?.attributes ?? {})}
          {...(dragHandle?.listeners ?? {})}
          aria-label="Taşı"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{project.name}</p>
          {project.targetUse && (
            <p className="text-[11px] text-muted-foreground truncate">{project.targetUse}</p>
          )}
        </div>
      </div>
      {!overlay && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={() => onOpen(project.id)}
        >
          Aç <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </Card>
  );
}
