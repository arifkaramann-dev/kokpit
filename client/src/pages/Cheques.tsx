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
import { ArrowDownLeft, ArrowUpRight, Plus, ScrollText, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ChequeRow = {
  id: number;
  type: "cek" | "senet";
  direction: "alinan" | "verilen";
  partyName: string | null;
  bank: string | null;
  serialNo: string | null;
  amount: string;
  dueDate: Date | null;
  status: "portfoyde" | "tahsil" | "odendi" | "karsiliksiz" | "iade";
  note: string | null;
};

const STATUS: Record<ChequeRow["status"], { label: string; cls: string }> = {
  portfoyde: { label: "Portföyde", cls: "bg-blue-500/15 text-blue-600" },
  tahsil: { label: "Tahsil edildi", cls: "bg-emerald-500/15 text-emerald-600" },
  odendi: { label: "Ödendi", cls: "bg-emerald-500/15 text-emerald-600" },
  karsiliksiz: { label: "Karşılıksız", cls: "bg-rose-500/15 text-rose-600" },
  iade: { label: "İade", cls: "bg-muted text-muted-foreground" },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Cheques() {
  const utils = trpc.useUtils();
  const { data: cheques, isLoading } = trpc.cheques.list.useQuery();
  const [form, setForm] = useState({
    type: "cek" as "cek" | "senet",
    direction: "alinan" as "alinan" | "verilen",
    partyName: "",
    bank: "",
    amount: "",
    dueDate: todayStr(),
  });

  const create = trpc.cheques.create.useMutation({
    onSuccess: () => {
      utils.cheques.invalidate();
      toast.success("Kayıt eklendi");
      setForm(f => ({ ...f, partyName: "", bank: "", amount: "" }));
    },
    onError: e => toast.error(e.message),
  });
  const setStatus = trpc.cheques.setStatus.useMutation({
    onSuccess: () => utils.cheques.invalidate(),
    onError: e => toast.error(e.message),
  });
  const remove = trpc.cheques.delete.useMutation({
    onSuccess: () => {
      utils.cheques.invalidate();
      toast.success("Silindi");
    },
    onError: e => toast.error(e.message),
  });

  const rows = (cheques as ChequeRow[]) ?? [];
  const num = (v: string) => parseFloat(v) || 0;
  const receivable = rows.filter(c => c.status === "portfoyde" && c.direction === "alinan").reduce((s, c) => s + num(c.amount), 0);
  const payable = rows.filter(c => c.status === "portfoyde" && c.direction === "verilen").reduce((s, c) => s + num(c.amount), 0);
  const isOverdue = (c: ChequeRow) => c.status === "portfoyde" && c.dueDate != null && new Date(c.dueDate).getTime() < Date.now();

  function submit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error("Geçerli tutar girin");
    create.mutate({
      type: form.type,
      direction: form.direction,
      partyName: form.partyName || null,
      bank: form.bank || null,
      amount,
      dueDate: form.dueDate || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Çek & Senet</h1>
          <p className="text-sm text-muted-foreground">
            Aldığın (tahsil edilecek) ve verdiğin (ödenecek) çek/senetleri vade ve durumuyla takip et.
          </p>
        </div>
        <div className="flex gap-2">
          <Card className="px-4 py-2">
            <p className="text-[11px] text-muted-foreground leading-none">Portföyde alınacak</p>
            <p className="text-lg font-bold text-emerald-600">{formatTL(receivable)}</p>
          </Card>
          <Card className="px-4 py-2">
            <p className="text-[11px] text-muted-foreground leading-none">Portföyde ödenecek</p>
            <p className="text-lg font-bold text-rose-600">{formatTL(payable)}</p>
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Tür</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as "cek" | "senet" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cek">Çek</SelectItem>
                <SelectItem value="senet">Senet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Yön</Label>
            <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as "alinan" | "verilen" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alinan">Alınan (tahsil edilecek)</SelectItem>
                <SelectItem value="verilen">Verilen (ödenecek)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kişi/Firma</Label>
            <Input value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} placeholder="Ad" />
          </div>
          <div className="space-y-1.5">
            <Label>Banka</Label>
            <Input value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} placeholder="Ops." />
          </div>
          <div className="space-y-1.5">
            <Label>Tutar (₺)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Vade</Label>
            <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={submit} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Ekle
          </Button>
        </div>
      </Card>

      {isLoading && <div className="h-40 rounded-xl bg-muted animate-pulse" />}

      {!isLoading && rows.length === 0 && (
        <Card className="p-10 text-center space-y-2">
          <ScrollText className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="font-medium">Henüz çek/senet eklenmedi</p>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="divide-y">
          {rows.map(c => (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${isOverdue(c) ? "bg-rose-500/5" : ""}`}>
              <span className={`h-7 w-7 rounded-full flex items-center justify-center ${c.direction === "alinan" ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                {c.direction === "alinan" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  <span className="capitalize">{c.type}</span>
                  {c.partyName ? ` · ${c.partyName}` : ""}
                  {c.bank ? ` · ${c.bank}` : ""}
                </p>
                <p className={`text-[11px] ${isOverdue(c) ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                  Vade: {formatDate(c.dueDate)}
                  {isOverdue(c) ? " · vadesi geçti" : ""}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap">{formatTL(c.amount)}</span>
              <Select value={c.status} onValueChange={v => setStatus.mutate({ id: c.id, status: v as ChequeRow["status"] })}>
                <SelectTrigger className={`h-7 w-[130px] text-xs border-0 ${STATUS[c.status].cls}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate({ id: c.id })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
