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
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { LEAD_SOURCES, LEAD_STAGES, pipelineSummary, type LeadStage } from "@shared/leads";
import { ArrowRight, Phone, Plus, Trash2, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  source: "diğer",
  stage: "yeni" as LeadStage,
  estimatedValue: "",
  note: "",
};

/** Aşama rozet rengi (boru hattı boyunca). */
const STAGE_TONE: Record<LeadStage, string> = {
  yeni: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  iletisim: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  teklif: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  kazanildi: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  kaybedildi: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function Leads() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: leads, isLoading } = trpc.leads.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => {
    utils.leads.invalidate();
    utils.customers.invalidate();
  };
  const createLead = trpc.leads.create.useMutation({ onSuccess: () => { invalidate(); setDialogOpen(false); } });
  const updateLead = trpc.leads.update.useMutation({ onSuccess: () => { invalidate(); setDialogOpen(false); } });
  const setStage = trpc.leads.setStage.useMutation({ onSuccess: invalidate });
  const convert = trpc.leads.convert.useMutation({
    onSuccess: () => { invalidate(); toast.success("Fırsat müşteriye dönüştürüldü ✅"); },
  });
  const deleteLead = trpc.leads.delete.useMutation({ onSuccess: invalidate });

  const summary = useMemo(() => pipelineSummary(leads ?? []), [leads]);
  const byStage = useMemo(() => {
    const map: Record<string, NonNullable<typeof leads>> = {};
    for (const { key } of LEAD_STAGES) map[key] = [];
    for (const l of leads ?? []) (map[l.stage] ??= []).push(l);
    return map;
  }, [leads]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(l: NonNullable<typeof leads>[number]) {
    setEditingId(l.id);
    setForm({
      name: l.name,
      phone: l.phone ?? "",
      email: l.email ?? "",
      source: l.source,
      stage: l.stage,
      estimatedValue: l.estimatedValue != null ? String(parseFloat(String(l.estimatedValue))) : "",
      note: l.note ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Fırsat/kişi adı gerekli");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      source: form.source,
      stage: form.stage,
      estimatedValue: parseFloat(form.estimatedValue) || 0,
      note: form.note || null,
    };
    if (editingId) updateLead.mutate({ id: editingId, data: payload });
    else createLead.mutate(payload);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Satış Fırsatları (CRM)</h1>
          <p className="text-sm text-muted-foreground">Lead → iletişim → teklif → kazanıldı. Kazanınca müşteriye dönüşür.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Yeni Fırsat
        </Button>
      </div>

      {/* Özet şerit */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Açık Fırsat</p>
          <p className="text-lg font-semibold">{summary.openCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Açık Fırsat Değeri</p>
          <p className="text-lg font-semibold">{formatTL(summary.openValue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Kazanılan Değer</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatTL(summary.wonValue)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Kazanma Oranı</p>
          <p className="text-lg font-semibold">%{Math.round(summary.winRate)}</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : (leads ?? []).length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Henüz fırsat yok. "Yeni Fırsat" ile potansiyel müşterini ekle; teklif aşamasına gelince Teklifler'e taşı.
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {LEAD_STAGES.map(({ key, label }) => {
              const items = byStage[key] ?? [];
              const bucket = summary.byStage[key] ?? { count: 0, value: 0 };
              return (
                <div key={key} className="w-64 shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${STAGE_TONE[key]}`}>{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {bucket.count} · {formatTL(bucket.value)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map(l => (
                      <Card key={l.id} className="p-2.5 space-y-1.5">
                        <button className="text-left w-full" onClick={() => openEdit(l)}>
                          <p className="text-sm font-medium leading-tight">{l.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{l.source}</Badge>
                            {parseFloat(String(l.estimatedValue)) > 0 && (
                              <span className="text-xs text-muted-foreground">{formatTL(l.estimatedValue)}</span>
                            )}
                          </div>
                          {l.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <Phone className="h-3 w-3" /> {l.phone}
                            </span>
                          )}
                          {l.note && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{l.note}</p>}
                        </button>
                        <div className="flex items-center gap-1 pt-1 border-t">
                          <Select value={l.stage} onValueChange={v => setStage.mutate({ id: l.id, stage: v as LeadStage })}>
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STAGES.map(s => (
                                <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {l.stage !== "kazanildi" && l.stage !== "kaybedildi" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              title="Müşteriye dönüştür (kazanıldı)"
                              onClick={() => convert.mutate({ id: l.id })}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-muted-foreground"
                            title="Sil"
                            onClick={async () => {
                              if (await confirm({ title: "Fırsatı sil", description: `"${l.name}" silinsin mi?`, confirmText: "Sil", destructive: true }))
                                deleteLead.mutate({ id: l.id });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground/60 px-1 py-4 text-center">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Fırsatı Düzenle" : "Yeni Fırsat"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ad / Fırsat *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kişi ya da firma adı" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="05xx xxx xx xx" />
              </div>
              <div className="space-y-1.5">
                <Label>E-posta</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Kaynak</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aşama</Label>
                <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as LeadStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tahmini Değer ₺</Label>
                <Input
                  inputMode="decimal"
                  value={form.estimatedValue}
                  onChange={e => setForm(f => ({ ...f, estimatedValue: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="İhtiyaç, ürün, bütçe…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={submit} disabled={createLead.isPending || updateLead.isPending}>
              {editingId ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
