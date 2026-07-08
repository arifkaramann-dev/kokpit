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
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignRow = {
  id: number;
  name: string;
  productGroup: string | null;
  startDate: Date;
  endDate: Date;
  discountPercent: string | null;
  note: string | null;
  status: "planned" | "active" | "done";
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planlandı", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  done: { label: "Bitti", cls: "bg-muted text-muted-foreground" },
};

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const DAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const emptyForm = {
  name: "",
  productGroup: "",
  startDate: toDateInput(new Date()),
  endDate: toDateInput(new Date()),
  discountPercent: "",
  note: "",
  status: "planned" as "planned" | "active" | "done",
};

export default function Campaigns() {
  const utils = trpc.useUtils();
  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      utils.campaigns.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Kampanya eklendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: () => {
      utils.campaigns.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Kampanya güncellendi");
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      utils.campaigns.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Kampanya silindi");
    },
    onError: e => toast.error(e.message),
  });

  // Takvim günleri
  const calendarDays = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const startWeekday = (first.getDay() + 6) % 7; // Pazartesi = 0
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.year, month.month, d));
    return cells;
  }, [month]);

  function campaignsOnDay(day: Date): CampaignRow[] {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    return ((campaigns as CampaignRow[]) ?? []).filter(c => {
      const s = new Date(c.startDate);
      const e = new Date(c.endDate);
      return s <= dayEnd && e >= dayStart;
    });
  }

  function openCreate(day?: Date) {
    setEditing(null);
    setForm({
      ...emptyForm,
      startDate: toDateInput(day ?? new Date()),
      endDate: toDateInput(day ?? new Date()),
    });
    setDialogOpen(true);
  }

  function openEdit(c: CampaignRow) {
    setEditing(c);
    setForm({
      name: c.name,
      productGroup: c.productGroup ?? "",
      startDate: toDateInput(new Date(c.startDate)),
      endDate: toDateInput(new Date(c.endDate)),
      discountPercent: c.discountPercent ?? "",
      note: c.note ?? "",
      status: c.status,
    });
    setDialogOpen(true);
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("Kampanya adı gerekli");
      return;
    }
    const start = new Date(form.startDate + "T00:00:00");
    const end = new Date(form.endDate + "T23:59:59");
    if (end < start) {
      toast.error("Bitiş tarihi başlangıçtan önce olamaz");
      return;
    }
    const payload = {
      name: form.name.trim(),
      productGroup: form.productGroup || null,
      startDate: start,
      endDate: end,
      discountPercent: parseFloat(form.discountPercent) || 0,
      note: form.note || null,
      status: form.status,
    };
    if (editing) {
      updateCampaign.mutate({ id: editing.id, data: payload });
    } else {
      createCampaign.mutate(payload);
    }
  }

  const today = new Date();
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kampanya Takvimi</h1>
          <p className="text-sm text-muted-foreground">
            Hangi ürün grubunda ne zaman kampanya yapacağınızı planlayın.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-1" /> Yeni Kampanya
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Button
            size="icon"
            variant="outline"
            onClick={() =>
              setMonth(m => (m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 }))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">
            {MONTHS_TR[month.month]} {month.year}
          </h2>
          <Button
            size="icon"
            variant="outline"
            onClick={() =>
              setMonth(m => (m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 }))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAYS_TR.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
          {calendarDays.map((day, i) =>
            day === null ? (
              <div key={`e-${i}`} />
            ) : (
              <button
                key={day.toISOString()}
                onClick={() => openCreate(day)}
                className={`min-h-16 rounded-lg border p-1 text-left align-top hover:bg-accent/50 transition-colors ${
                  isToday(day) ? "ring-2 ring-primary" : ""
                }`}
                title="Bu güne kampanya ekle"
              >
                <span className={`text-xs ${isToday(day) ? "font-bold text-primary" : "text-muted-foreground"}`}>
                  {day.getDate()}
                </span>
                <div className="space-y-0.5 mt-0.5">
                  {campaignsOnDay(day)
                    .slice(0, 2)
                    .map(c => (
                      <div
                        key={c.id}
                        className="text-[10px] leading-tight truncate rounded bg-primary/15 text-primary px-1 py-0.5"
                      >
                        {c.name}
                      </div>
                    ))}
                  {campaignsOnDay(day).length > 2 && (
                    <div className="text-[9px] text-muted-foreground">+{campaignsOnDay(day).length - 2}</div>
                  )}
                </div>
              </button>
            ),
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Tüm Kampanyalar
        </h2>
        {((campaigns as CampaignRow[]) ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Henüz kampanya planlanmadı. Takvimden bir güne tıklayarak ekleyebilirsiniz.
          </p>
        ) : (
          <div className="space-y-2">
            {((campaigns as CampaignRow[]) ?? []).map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border p-3 flex-wrap">
                <div className="flex-1 min-w-40">
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    {c.productGroup && ` · ${c.productGroup}`}
                    {c.discountPercent && parseFloat(c.discountPercent) > 0 && ` · %${parseFloat(c.discountPercent)} indirim`}
                  </p>
                </div>
                <Badge className={`border-0 ${STATUS_LABELS[c.status].cls}`}>
                  {STATUS_LABELS[c.status].label}
                </Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (confirm(`"${c.name}" kampanyası silinsin mi?`)) deleteCampaign.mutate({ id: c.id });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Kampanyayı Düzenle" : "Yeni Kampanya"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kampanya Adı *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Örn. Meteor Serisi Yaz İndirimi"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ürün Grubu</Label>
                <Input
                  value={form.productGroup}
                  onChange={e => setForm(f => ({ ...f, productGroup: e.target.value }))}
                  placeholder="Örn. Meteor Serisi"
                />
              </div>
              <div className="space-y-1.5">
                <Label>İndirim %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.discountPercent}
                  onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Başlangıç *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bitiş *</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select
                value={form.status}
                onValueChange={v => setForm(f => ({ ...f, status: v as typeof f.status }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planlandı</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="done">Bitti</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Textarea
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
                placeholder="Kampanya detayları"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={submit} disabled={createCampaign.isPending || updateCampaign.isPending}>
              {editing ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
