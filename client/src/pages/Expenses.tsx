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
import { formatDate, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Pencil, Plus, Receipt, Trash2, TrendingDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ExpenseRow = {
  id: number;
  expenseDate: Date;
  category: string;
  description: string | null;
  amount: string;
  note: string | null;
};

const CATEGORIES = ["kira", "kargo", "reklam", "komisyon", "maaş", "fatura", "ambalaj", "vergi", "diğer"];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Expenses() {
  const utils = trpc.useUtils();
  const { data: expenses, isLoading } = trpc.expenses.list.useQuery();
  const [form, setForm] = useState({ category: "diğer", description: "", amount: "", expenseDate: todayStr(), note: "" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setForm(f => ({ ...f, description: "", amount: "", note: "" }));
  };

  const createExpense = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Gider eklendi");
      resetForm();
    },
    onError: e => toast.error(e.message),
  });
  const updateExpense = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.expenses.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Gider güncellendi");
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  function startEdit(e: ExpenseRow) {
    setEditingId(e.id);
    setForm({
      category: e.category,
      description: e.description ?? "",
      amount: String(parseFloat(e.amount)),
      expenseDate: new Date(e.expenseDate).toISOString().slice(0, 10),
      note: e.note ?? "",
    });
  }
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Gider silindi");
    },
    onError: e => toast.error(e.message),
  });

  const rows = (expenses as ExpenseRow[]) ?? [];
  const monthTotal = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return rows
      .filter(e => new Date(e.expenseDate) >= start)
      .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  }, [rows]);

  function submit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    const payload = {
      category: form.category,
      description: form.description || null,
      amount,
      expenseDate: form.expenseDate || null,
      note: form.note || null,
    };
    if (editingId) updateExpense.mutate({ id: editingId, data: payload });
    else createExpense.mutate(payload);
  }

  // Bu ayki giderlerin kategori kırılımı (en yüksekten).
  const monthByCategory = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const m = new Map<string, number>();
    for (const e of rows) {
      if (new Date(e.expenseDate) < start) continue;
      m.set(e.category, (m.get(e.category) ?? 0) + (parseFloat(e.amount) || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Giderler</h1>
          <p className="text-sm text-muted-foreground">
            Kira, kargo, reklam, komisyon gibi masraflar — Kâr/Zarar raporunda cirodan düşülür.
          </p>
        </div>
        <Card className="px-4 py-2 flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-[11px] text-muted-foreground leading-none">Bu ay toplam gider</p>
            <p className="text-lg font-bold leading-tight">{formatTL(monthTotal)}</p>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toLocaleUpperCase("tr-TR") + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Açıklama</Label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Örn. Instagram reklamı"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tutar (₺)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tarih</Label>
            <Input
              type="date"
              value={form.expenseDate}
              onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
            />
          </div>
          <div className="flex gap-1.5">
            <Button onClick={submit} disabled={createExpense.isPending || updateExpense.isPending} className="flex-1">
              {editingId ? (
                <>
                  <Pencil className="h-4 w-4 mr-1" /> Kaydet
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" /> Ekle
                </>
              )}
            </Button>
            {editingId && (
              <Button variant="outline" size="icon" onClick={resetForm} title="Vazgeç">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {monthByCategory.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-medium">Bu ay kategoriye göre</p>
          {monthByCategory.map(([cat, amt]) => {
            const pct = monthByCategory[0][1] > 0 ? (amt / monthByCategory[0][1]) * 100 : 0;
            return (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-20 capitalize shrink-0">{cat}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-24 text-right font-medium">{formatTL(amt)}</span>
              </div>
            );
          })}
        </Card>
      )}

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && rows.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <Receipt className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Henüz gider eklenmedi</p>
          <p className="text-sm text-muted-foreground">
            İşletme masraflarını girin; net kâr hesabı gerçekçi olsun.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="divide-y">
          {rows.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">{e.category}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{e.description || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{formatDate(e.expenseDate)}</p>
              </div>
              <span className="font-semibold whitespace-nowrap">{formatTL(e.amount)}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)} title="Düzenle">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={() => deleteExpense.mutate({ id: e.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
