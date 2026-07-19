import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { FileText, Landmark, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Banka mutabakatı + e-Fatura (Tema C). Ekstre CSV'yi yükle, tahsilat/ödemelerle
 * eşleştir; siparişten e-Fatura taslağı üret (entegratör bağlıysa gönder).
 */

const CONF: Record<string, { label: string; cls: string }> = {
  exact: { label: "Birebir", cls: "border-emerald-500 text-emerald-600" },
  amount: { label: "Tutar", cls: "border-amber-500 text-amber-600" },
  none: { label: "Eşleşmedi", cls: "border-neutral-400 text-neutral-500" },
};

export default function Reconcile() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Banka Mutabakatı & e-Fatura</h1>
        <p className="text-sm text-muted-foreground">
          Banka ekstresini yükleyip tahsilat/ödemelerle eşleştirin; siparişten e-Fatura taslağı üretin.
        </p>
      </div>
      <BankReconcile />
      <InvoiceFromOrder />
    </div>
  );
}

type MatchRow = { bankLine: { date: string; description: string; amount: number; line: number }; txnId: number | null; txnLabel: string | null; confidence: "exact" | "amount" | "none" };

function BankReconcile() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MatchRow[]>([]);

  const match = trpc.reconcile.match.useMutation({
    onSuccess: r => {
      setRows(r.matches as MatchRow[]);
      if (r.errors.length > 0) toast.warning(`${r.errors.length} satır atlandı`);
    },
    onError: e => toast.error(e.message),
  });

  async function onFile(file: File) {
    const csv = await file.text();
    match.mutate({ csv });
  }

  const matched = rows.filter(r => r.txnId != null).length;

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" /> Banka Ekstresi Mutabakatı
      </h2>
      <p className="text-xs text-muted-foreground">
        İnternet bankacılığından indirdiğiniz CSV/Excel ekstresini yükleyin. Gerekli sütunlar:{" "}
        <b>Tarih</b> ve <b>Tutar</b> (giriş +, çıkış −). Açıklama sütunu opsiyoneldir.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button variant="outline" disabled={match.isPending} onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4 mr-1" /> {match.isPending ? "İşleniyor..." : "Ekstre Yükle (CSV)"}
      </Button>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            {rows.length} satır · <b className="text-emerald-600">{matched} eşleşti</b> ·{" "}
            {rows.length - matched} eşleşmedi
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Tarih</th>
                  <th className="text-left p-2">Açıklama</th>
                  <th className="text-right p-2">Tutar</th>
                  <th className="text-left p-2">Eşleşen kayıt</th>
                  <th className="text-center p-2">Güven</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 whitespace-nowrap">{r.bankLine.date}</td>
                    <td className="p-2 max-w-[220px] truncate">{r.bankLine.description || "—"}</td>
                    <td className={`p-2 text-right font-medium ${r.bankLine.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatTL(r.bankLine.amount)}
                    </td>
                    <td className="p-2 max-w-[220px] truncate text-muted-foreground">{r.txnLabel ?? "—"}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className={CONF[r.confidence].cls}>
                        {CONF[r.confidence].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Eşleşmeyen satırlar için Kasa & Banka'dan ilgili tahsilat/ödemeyi ekleyin.
          </p>
        </div>
      )}
    </Card>
  );
}

function InvoiceFromOrder() {
  const { data: orders } = trpc.orders.list.useQuery();
  const { data: cfg } = trpc.invoices.configured.useQuery();
  const [orderId, setOrderId] = useState<string>("");
  const [payload, setPayload] = useState<unknown>(null);
  const [info, setInfo] = useState<string>("");

  const gen = trpc.invoices.fromOrder.useMutation({
    onSuccess: r => {
      setPayload(r.payload);
      setInfo(r.result.sent ? `Gönderildi (${r.result.provider})` : r.result.reason ?? "Taslak hazır");
    },
    onError: e => toast.error(e.message),
  });

  const list = (orders as { id: number; orderNo: string; customerName: string }[] | undefined) ?? [];

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" /> e-Fatura / e-Arşiv
      </h2>
      <p className="text-xs text-muted-foreground">
        Entegratör durumu:{" "}
        {cfg?.efatura ? (
          <span className="text-emerald-600">bağlı — faturalar gönderilebilir</span>
        ) : (
          <span className="text-amber-600">yapılandırılmamış — taslak üretilir (Render'a EFATURA_* girin)</span>
        )}
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <label className="text-sm">Sipariş</label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Sipariş seçin..." />
            </SelectTrigger>
            <SelectContent>
              {list.map(o => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.orderNo} · {o.customerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={!orderId || gen.isPending} onClick={() => gen.mutate({ orderId: Number(orderId), send: false })}>
          Taslak Üret
        </Button>
        <Button
          variant="outline"
          disabled={!orderId || gen.isPending || !cfg?.efatura}
          onClick={() => gen.mutate({ orderId: Number(orderId), send: true })}
        >
          Üret ve Gönder
        </Button>
      </div>
      {info && <p className="text-sm text-muted-foreground">{info}</p>}
      {payload != null && (
        <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-2 text-[11px]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </Card>
  );
}
