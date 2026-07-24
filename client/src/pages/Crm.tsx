import { useConfirm } from "@/components/ConfirmDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatDate, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
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
import { CalendarClock, GripVertical, MessageCircle, MoreVertical, Plus, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * CRM Satış Boru Hattı: teklif ÖNCESİ fırsat takibi (Odoo uyarlaması 🟠).
 * Aşamalar sütun halinde; kartlar aşama değiştirilerek ilerletilir.
 * "Teklif" aşamasına geçen fırsat Teklifler sayfasından teklife bağlanır.
 */

const STAGES = [
  { key: "yeni", label: "Yeni Fırsat", color: "border-blue-300" },
  { key: "gorusme", label: "Görüşme", color: "border-amber-300" },
  { key: "teklif", label: "Teklif Aşaması", color: "border-violet-300" },
  { key: "kazanildi", label: "Kazanıldı 🎉", color: "border-emerald-300" },
  { key: "kaybedildi", label: "Kaybedildi", color: "border-rose-300" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

type OppRow = {
  id: number;
  title: string;
  customerName: string | null;
  customerPhone: string | null;
  expectedAmount: unknown;
  stage: Stage;
  nextStep: string | null;
  nextStepDate: Date | string | null;
  note: string | null;
  createdAt: Date | string;
};

const emptyForm = {
  title: "",
  customerName: "",
  customerPhone: "",
  expectedAmount: "",
  stage: "yeni" as Stage,
  nextStep: "",
  nextStepDate: "",
  note: "",
};

export default function Crm() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
  const { data: opps, isLoading } = trpc.crm.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OppRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showClosed, setShowClosed] = useState(false);

  const invalidate = () => utils.crm.list.invalidate();
  const create = trpc.crm.create.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Fırsat eklendi");
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.crm.update.useMutation({
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Fırsat güncellendi");
    },
    onError: e => toast.error(e.message),
  });
  const setStage = trpc.crm.setStage.useMutation({
    onSuccess: invalidate,
    onError: e => toast.error(e.message),
  });
  const remove = trpc.crm.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Fırsat silindi");
    },
    onError: e => toast.error(e.message),
  });

  const rows = (opps as OppRow[] | undefined) ?? [];
  const byStage = useMemo(() => {
    const m = new Map<Stage, OppRow[]>();
    for (const s of STAGES) m.set(s.key, []);
    for (const o of rows) m.get(o.stage)?.push(o);
    return m;
  }, [rows]);

  const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
  const openRows = rows.filter(o => o.stage !== "kazanildi" && o.stage !== "kaybedildi");
  const pipelineTotal = openRows.reduce((s, o) => s + num(o.expectedAmount), 0);
  const wonTotal = rows.filter(o => o.stage === "kazanildi").reduce((s, o) => s + num(o.expectedAmount), 0);
  const overdueSteps = openRows.filter(
    o => o.nextStepDate && new Date(o.nextStepDate).getTime() < Date.now() - 24 * 3600 * 1000,
  ).length;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(o: OppRow) {
    setEditing(o);
    setForm({
      title: o.title,
      customerName: o.customerName ?? "",
      customerPhone: o.customerPhone ?? "",
      expectedAmount: num(o.expectedAmount) ? String(num(o.expectedAmount)) : "",
      stage: o.stage,
      nextStep: o.nextStep ?? "",
      nextStepDate: o.nextStepDate ? String(o.nextStepDate).slice(0, 10) : "",
      note: o.note ?? "",
    });
    setDialogOpen(true);
  }
  function submit() {
    if (!form.title.trim()) return toast.error("Fırsat başlığı gerekli");
    const data = {
      title: form.title.trim(),
      customerName: form.customerName.trim() || null,
      customerPhone: form.customerPhone.trim() || null,
      expectedAmount: parseFloat(form.expectedAmount) || 0,
      stage: form.stage,
      nextStep: form.nextStep.trim() || null,
      nextStepDate: form.nextStepDate || null,
      note: form.note.trim() || null,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  const visibleStages = STAGES.filter(s =>
    showClosed ? true : s.key !== "kazanildi" && s.key !== "kaybedildi",
  );

  // Sürükle-bırak: kartı bir aşama sütununa bırakınca stage güncellenir
  // (Ürün Geliştirme panosuyla aynı desen — uygulama genelinde tek kanban).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragId, setDragId] = useState<number | null>(null);
  const dragged = rows.find(o => o.id === dragId) ?? null;

  function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const { active, over } = e;
    if (!over) return;
    const id = Number(active.id);
    const stage = String(over.id) as Stage;
    const opp = rows.find(o => o.id === id);
    if (opp && opp.stage !== stage) setStage.mutate({ id, stage });
  }

  async function handleRemove(o: OppRow) {
    const ok = await confirm({
      title: "Fırsatı sil",
      description: `"${o.title}" silinecek. Emin misin?`,
      confirmText: "Sil",
      destructive: true,
    });
    if (ok) remove.mutate({ id: o.id });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Satış Fırsatları</h1>
          <p className="text-sm text-muted-foreground">
            Teklif öncesi boru hattı: görüşmeler kaybolmasın, sıradaki adım hep belli olsun.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowClosed(v => !v)}>
            {showClosed ? "Kapananları Gizle" : "Kapananları Göster"}
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Fırsat Ekle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Açık Fırsat</p>
          <p className="text-2xl font-bold">{openRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Boru Hattı Değeri</p>
          <p className="text-2xl font-bold">{formatTL(pipelineTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Kazanılan (toplam)</p>
          <p className="text-2xl font-bold text-emerald-600">{formatTL(wonTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Adımı Gecikmiş</p>
          <p className={`text-2xl font-bold ${overdueSteps > 0 ? "text-rose-600" : ""}`}>{overdueSteps}</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor...</p>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Target className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">Henüz fırsat yok</p>
          <p className="text-sm text-muted-foreground">
            Potansiyel bir müşteriyle ilk görüşmeyi yaptığında buraya ekle; teklif ve satışa
            dönüşene kadar takip et.
          </p>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> İlk Fırsatı Ekle
          </Button>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={e => setDragId(Number(e.active.id))}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
            {visibleStages.map(stage => (
              <CrmColumn
                key={stage.key}
                stage={stage}
                list={byStage.get(stage.key) ?? []}
                num={num}
                onEdit={openEdit}
                onRemove={handleRemove}
                onStage={(id, s) => setStage.mutate({ id, stage: s })}
                onQuote={() => setLocation("/teklifler")}
              />
            ))}
          </div>
          <DragOverlay>
            {dragged ? <CrmCard o={dragged} num={num} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Fırsatı Düzenle" : "Yeni Fırsat"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Başlık *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Örn. Oto galeri — 50'li rötuş seti talebi"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Müşteri</Label>
                <Input
                  list="crm-customers"
                  value={form.customerName}
                  onChange={e => {
                    const name = e.target.value;
                    const match = (customers ?? []).find(c => c.name === name);
                    setForm(f => ({
                      ...f,
                      customerName: name,
                      customerPhone: match?.phone ?? f.customerPhone,
                    }));
                  }}
                  placeholder="Ad / firma"
                />
                <datalist id="crm-customers">
                  {(customers ?? []).map(c => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input
                  value={form.customerPhone}
                  onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="05xx..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tahmini Tutar (₺)</Label>
                <Input
                  type="number"
                  value={form.expectedAmount}
                  onChange={e => setForm(f => ({ ...f, expectedAmount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Aşama</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as Stage }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sıradaki Adım</Label>
                <Input
                  value={form.nextStep}
                  onChange={e => setForm(f => ({ ...f, nextStep: e.target.value }))}
                  placeholder="Örn. numune gönder"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Adım Tarihi</Label>
                <Input
                  type="date"
                  value={form.nextStepDate}
                  onChange={e => setForm(f => ({ ...f, nextStepDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea
                rows={2}
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Görüşme özeti, özel istekler..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Bir aşama sütunu — kart buraya bırakılınca stage değişir (droppable). */
function CrmColumn({
  stage,
  list,
  num,
  onEdit,
  onRemove,
  onStage,
  onQuote,
}: {
  stage: (typeof STAGES)[number];
  list: OppRow[];
  num: (v: unknown) => number;
  onEdit: (o: OppRow) => void;
  onRemove: (o: OppRow) => void;
  onStage: (id: number, stage: Stage) => void;
  onQuote: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = list.reduce((s, o) => s + num(o.expectedAmount), 0);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-t-4 ${stage.color} bg-muted/30 p-2 space-y-2 min-h-[120px] transition-colors ${
        isOver ? "ring-2 ring-primary/60 bg-accent/40" : ""
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold">{stage.label}</span>
        <span className="text-xs text-muted-foreground">
          {list.length} · {formatTL(total)}
        </span>
      </div>
      {list.map(o => (
        <DraggableCrmCard
          key={o.id}
          o={o}
          num={num}
          onEdit={onEdit}
          onRemove={onRemove}
          onStage={onStage}
          onQuote={onQuote}
        />
      ))}
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">Bu aşamada fırsat yok</p>
      )}
    </div>
  );
}

/** Sürüklenebilir sarmalayıcı; görsel kartı CrmCard render eder. */
function DraggableCrmCard(props: {
  o: OppRow;
  num: (v: unknown) => number;
  onEdit: (o: OppRow) => void;
  onRemove: (o: OppRow) => void;
  onStage: (id: number, stage: Stage) => void;
  onQuote: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.o.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <CrmCard
        {...props}
        dragHandle={{
          attributes: attributes as unknown as React.HTMLAttributes<HTMLButtonElement>,
          listeners,
        }}
      />
    </div>
  );
}

/** Fırsat kartı (sunum). Sürükle tutamacı + düzenle + menü (teklif/WhatsApp/aşama/sil). */
function CrmCard({
  o,
  num,
  onEdit,
  onRemove,
  onStage,
  onQuote,
  overlay,
  dragHandle,
}: {
  o: OppRow;
  num: (v: unknown) => number;
  onEdit?: (o: OppRow) => void;
  onRemove?: (o: OppRow) => void;
  onStage?: (id: number, stage: Stage) => void;
  onQuote?: () => void;
  overlay?: boolean;
  dragHandle?: {
    attributes: React.HTMLAttributes<HTMLButtonElement>;
    listeners: Record<string, unknown> | undefined;
  };
}) {
  const overdue = o.nextStepDate && new Date(o.nextStepDate).getTime() < Date.now() - 24 * 3600 * 1000;
  return (
    <Card className={`p-3 space-y-1.5 ${overlay ? "shadow-xl rotate-2" : "shadow-sm"}`}>
      <div className="flex items-start gap-1">
        <button
          className="mt-0.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
          {...(dragHandle?.attributes ?? {})}
          {...(dragHandle?.listeners ?? {})}
          aria-label="Taşı"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button className="flex-1 text-left min-w-0" onClick={() => onEdit?.(o)}>
          <p className="text-sm font-medium leading-tight">{o.title}</p>
          {o.customerName && <p className="text-xs text-muted-foreground">{o.customerName}</p>}
        </button>
        {!overlay && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {o.stage === "teklif" && (
                <DropdownMenuItem onClick={() => onQuote?.()}>Teklif oluştur →</DropdownMenuItem>
              )}
              {o.customerPhone && (
                <DropdownMenuItem
                  onClick={() =>
                    window.open(`https://wa.me/${o.customerPhone!.replace(/\D/g, "")}`, "_blank")
                  }
                >
                  <MessageCircle className="h-3.5 w-3.5 mr-2" /> WhatsApp
                </DropdownMenuItem>
              )}
              {/* Dokunmatik cihazlarda sürükleme yerine aşama seçimi (fallback). */}
              {STAGES.filter(s => s.key !== o.stage).map(s => (
                <DropdownMenuItem key={s.key} onClick={() => onStage?.(o.id, s.key)}>
                  → {s.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-destructive" onClick={() => onRemove?.(o)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Sil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {num(o.expectedAmount) > 0 && (
        <p className="text-sm font-semibold pl-5">{formatTL(num(o.expectedAmount))}</p>
      )}
      {o.nextStep && (
        <p
          className={`text-xs flex items-center gap-1 pl-5 ${
            overdue ? "text-rose-600 font-medium" : "text-muted-foreground"
          }`}
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          {o.nextStep}
          {o.nextStepDate ? ` · ${formatDate(o.nextStepDate)}` : ""}
          {overdue ? " (gecikti)" : ""}
        </p>
      )}
    </Card>
  );
}
