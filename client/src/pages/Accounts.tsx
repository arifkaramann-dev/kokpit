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
import { formatDate, formatTL } from "@/lib/format";
import { printReceipt } from "@/lib/receipt";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Banknote, Landmark, Plus, Printer, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AccountRow = { id: number; name: string; kind: "kasa" | "banka"; openingBalance: string; balance: number };
type TxnRow = {
  id: number;
  txnDate: Date;
  accountId: number | null;
  direction: "in" | "out";
  amount: string;
  category: string;
  customerName: string | null;
  orderNo: string | null;
  description: string | null;
};

// Hareket tipi → yön + kategori eşlemesi.
const TXN_TYPES = [
  { key: "tahsilat", label: "Tahsilat (giren)", direction: "in" as const, category: "tahsilat" },
  { key: "gelir", label: "Diğer Gelir (giren)", direction: "in" as const, category: "gelir" },
  { key: "odeme", label: "Ödeme (çıkan)", direction: "out" as const, category: "odeme" },
  { key: "gider", label: "Gider (çıkan)", direction: "out" as const, category: "gider" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Accounts() {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: accounts } = trpc.accounts.list.useQuery();
  const { data: txns } = trpc.transactions.list.useQuery({});
  const { data: customers } = trpc.customers.list.useQuery();

  const [accDialog, setAccDialog] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", kind: "kasa" as "kasa" | "banka", openingBalance: "", note: "" });
  const [transferDialog, setTransferDialog] = useState(false);
  const [transfer, setTransfer] = useState({ fromId: "", toId: "", amount: "" });
  const [txn, setTxn] = useState({
    type: "tahsilat",
    amount: "",
    accountId: "",
    customerName: "",
    description: "",
    txnDate: todayStr(),
  });

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: () => {
      utils.accounts.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hesap eklendi");
      setAccDialog(false);
      setAccForm({ name: "", kind: "kasa", openingBalance: "", note: "" });
    },
    onError: e => toast.error(e.message),
  });
  const deleteAccount = trpc.accounts.delete.useMutation({
    onSuccess: () => {
      utils.accounts.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hesap silindi");
    },
    onError: e => toast.error(e.message),
  });
  const createTxn = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.transactions.invalidate();
      utils.accounts.invalidate();
      utils.dashboard.summary.invalidate();
      utils.orders.list.invalidate();
      toast.success("Hareket eklendi");
      setTxn(t => ({ ...t, amount: "", customerName: "", description: "" }));
    },
    onError: e => toast.error(e.message),
  });
  const deleteTxn = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.invalidate();
      utils.accounts.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Hareket silindi");
    },
    onError: e => toast.error(e.message),
  });
  const doTransfer = trpc.accounts.transfer.useMutation({
    onSuccess: () => {
      utils.transactions.invalidate();
      utils.accounts.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Transfer yapıldı");
      setTransferDialog(false);
      setTransfer({ fromId: "", toId: "", amount: "" });
    },
    onError: e => toast.error(e.message),
  });

  const accountRows = (accounts as AccountRow[]) ?? [];
  const txnRows = (txns as TxnRow[]) ?? [];
  const totalCash = accountRows.reduce((s, a) => s + a.balance, 0);
  const accName = (id: number | null) => accountRows.find(a => a.id === id)?.name ?? "—";

  // Tahsilat/ödeme makbuzu yazdır (şirket bilgisini alıp).
  async function printTxnReceipt(t: TxnRow) {
    const company = await utils.client.settings.get.query();
    printReceipt(
      {
        no: t.id,
        date: t.txnDate,
        direction: t.direction,
        amount: t.amount,
        category: t.category,
        party: t.customerName,
        account: accName(t.accountId),
        description: t.description,
      },
      company,
    );
  }

  function submitTxn() {
    const amount = parseFloat(txn.amount);
    if (!amount || amount <= 0) return toast.error("Geçerli bir tutar girin");
    const type = TXN_TYPES.find(t => t.key === txn.type)!;
    createTxn.mutate({
      direction: type.direction,
      category: type.category,
      amount,
      accountId: txn.accountId ? Number(txn.accountId) : null,
      customerName: txn.customerName || null,
      description: txn.description || null,
      txnDate: txn.txnDate || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kasa & Banka</h1>
          <p className="text-sm text-muted-foreground">
            Nakit ve banka hesapları, tahsilat/ödeme hareketleri ve güncel bakiyeler.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accountRows.length >= 2 && (
            <Button variant="outline" onClick={() => setTransferDialog(true)}>
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Transfer
            </Button>
          )}
          <Card className="px-4 py-2 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-[11px] text-muted-foreground leading-none">Toplam bakiye</p>
              <p className="text-lg font-bold leading-tight">{formatTL(totalCash)}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Hesap kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {accountRows.map(a => (
          <Card key={a.id} className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              {a.kind === "banka" ? (
                <Landmark className="h-4 w-4 text-blue-600" />
              ) : (
                <Banknote className="h-4 w-4 text-emerald-600" />
              )}
              <span className="font-medium text-sm flex-1 truncate">{a.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Hesabı sil",
                      description: `"${a.name}" hesabı silinsin mi? Hareketler kalır (hesaptan çözülür).`,
                      confirmText: "Sil",
                      destructive: true,
                    })
                  )
                    deleteAccount.mutate({ id: a.id });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className={`text-xl font-bold ${a.balance < 0 ? "text-rose-600" : ""}`}>{formatTL(a.balance)}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{a.kind}</p>
          </Card>
        ))}
        <button
          onClick={() => setAccDialog(true)}
          className="rounded-xl border border-dashed p-4 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors min-h-[92px]"
        >
          <Plus className="h-5 w-5" /> Hesap Ekle
        </button>
      </div>

      {/* Hareket ekle */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Tip</Label>
            <Select value={txn.type} onValueChange={v => setTxn(t => ({ ...t, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TXN_TYPES.map(t => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tutar (₺)</Label>
            <Input type="number" value={txn.amount} onChange={e => setTxn(t => ({ ...t, amount: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Hesap</Label>
            <Select value={txn.accountId || "none"} onValueChange={v => setTxn(t => ({ ...t, accountId: v === "none" ? "" : v }))}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Hesapsız</SelectItem>
                {accountRows.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Müşteri/Açıklama</Label>
            <Input
              list="acc-customer-names"
              value={txn.customerName}
              onChange={e => setTxn(t => ({ ...t, customerName: e.target.value }))}
              placeholder="Cari (ops.)"
            />
            <datalist id="acc-customer-names">
              {(customers ?? []).map(c => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Tarih</Label>
            <Input type="date" value={txn.txnDate} onChange={e => setTxn(t => ({ ...t, txnDate: e.target.value }))} />
          </div>
          <Button onClick={submitTxn} disabled={createTxn.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Ekle
          </Button>
        </div>
      </Card>

      {/* Hareket listesi */}
      {txnRows.length > 0 && (
        <Card className="divide-y">
          {txnRows.map(t => {
            const isIn = t.direction === "in";
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center ${isIn ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>
                  {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <span className="capitalize">{t.category}</span>
                    {t.customerName ? ` · ${t.customerName}` : ""}
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(t.txnDate)} · {accName(t.accountId)}
                    {t.orderNo ? ` · ${t.orderNo}` : ""}
                  </p>
                </div>
                <span className={`font-semibold whitespace-nowrap ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                  {isIn ? "+" : "−"}
                  {formatTL(t.amount)}
                </span>
                {(t.category === "tahsilat" || t.category === "odeme") && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Makbuz yazdır" onClick={() => printTxnReceipt(t)}>
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTxn.mutate({ id: t.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      <Dialog open={transferDialog} onOpenChange={setTransferDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hesaplar Arası Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kaynak hesap</Label>
              <Select value={transfer.fromId} onValueChange={v => setTransfer(t => ({ ...t, fromId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seç" />
                </SelectTrigger>
                <SelectContent>
                  {accountRows.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({formatTL(a.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hedef hesap</Label>
              <Select value={transfer.toId} onValueChange={v => setTransfer(t => ({ ...t, toId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seç" />
                </SelectTrigger>
                <SelectContent>
                  {accountRows.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar (₺)</Label>
              <Input type="number" value={transfer.amount} onChange={e => setTransfer(t => ({ ...t, amount: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog(false)}>
              İptal
            </Button>
            <Button
              onClick={() => {
                const amount = parseFloat(transfer.amount);
                if (!transfer.fromId || !transfer.toId) return toast.error("Kaynak ve hedef hesap seçin");
                if (!amount || amount <= 0) return toast.error("Geçerli tutar girin");
                doTransfer.mutate({ fromId: Number(transfer.fromId), toId: Number(transfer.toId), amount });
              }}
              disabled={doTransfer.isPending}
            >
              Transfer Et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accDialog} onOpenChange={setAccDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Hesap</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Hesap Adı *</Label>
              <Input value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} placeholder="Örn. Nakit Kasa / Ziraat" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <Select value={accForm.kind} onValueChange={v => setAccForm(f => ({ ...f, kind: v as "kasa" | "banka" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kasa">Kasa (nakit)</SelectItem>
                    <SelectItem value="banka">Banka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Açılış Bakiyesi</Label>
                <Input type="number" value={accForm.openingBalance} onChange={e => setAccForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccDialog(false)}>
              İptal
            </Button>
            <Button
              onClick={() => {
                if (!accForm.name.trim()) return toast.error("Hesap adı gerekli");
                createAccount.mutate({
                  name: accForm.name.trim(),
                  kind: accForm.kind,
                  openingBalance: parseFloat(accForm.openingBalance) || 0,
                  note: accForm.note || null,
                });
              }}
              disabled={createAccount.isPending}
            >
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
