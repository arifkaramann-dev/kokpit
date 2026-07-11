import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, ReceiptText, ScanLine, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Row = { name: string; qty: string; unit: string; unitCost: string };
const emptyRow = (): Row => ({ name: "", qty: "", unit: "adet", unitCost: "" });

export default function Purchases() {
  const utils = trpc.useUtils();
  const { data: purchases } = trpc.purchases.list.useQuery();
  const { data: materials } = trpc.materials.list.useQuery();
  const fileRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const create = trpc.purchases.create.useMutation({
    onSuccess: r => {
      utils.purchases.list.invalidate();
      utils.materials.list.invalidate();
      toast.success(
        `Fatura işlendi: ${r.updatedCount} hammadde güncellendi${r.createdCount ? `, ${r.createdCount} yeni hammadde oluşturuldu` : ""}`,
      );
      setSupplierName("");
      setInvoiceNo("");
      setNote("");
      setRows([emptyRow()]);
    },
    onError: e => toast.error(e.message),
  });

  const parse = trpc.purchases.parseInvoice.useMutation({
    onSuccess: p => {
      if (p.supplierName) setSupplierName(p.supplierName);
      if (p.invoiceNo) setInvoiceNo(p.invoiceNo);
      if (p.items.length > 0) {
        setRows(
          p.items.map(i => ({
            name: i.name,
            qty: String(i.quantity),
            unit: i.unit || "adet",
            unitCost: String(i.unitPrice),
          })),
        );
        toast.success(`${p.items.length} kalem okundu — kontrol edip kaydedin`);
      } else {
        toast.error("Faturada kalem bulunamadı, elle girebilirsiniz");
      }
    },
    onError: e => toast.error(e.message),
  });

  function onFile(file: File) {
    if (file.size > 8 * 1024 * 1024) return toast.error("Dosya 8MB'dan küçük olmalı");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      parse.mutate({ mediaType: file.type, data: base64 });
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    const items = rows
      .filter(r => r.name.trim() && parseFloat(r.qty) > 0)
      .map(r => ({
        name: r.name.trim(),
        qty: parseFloat(r.qty),
        unit: r.unit.trim() || "adet",
        unitCost: parseFloat(r.unitCost) || 0,
      }));
    if (items.length === 0) return toast.error("En az bir kalem girin");
    create.mutate({
      supplierName: supplierName.trim() || null,
      invoiceNo: invoiceNo.trim() || null,
      note: note.trim() || null,
      items,
    });
  }

  const knownNames = new Set((materials ?? []).map(m => m.name.trim().toLowerCase()));
  const total = rows.reduce(
    (s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.unitCost) || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fatura Girişi</h1>
        <p className="text-sm text-muted-foreground">
          Alış faturasını gir; stok miktarları ve birim maliyetler otomatik güncellensin.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" /> Yeni Fatura
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={parse.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {parse.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Okunuyor...
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4 mr-1" /> AI ile Fotoğraftan Oku
              </>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tedarikçi</Label>
            <Input
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="Örn. Kimya A.Ş."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fatura No (opsiyonel)</Label>
            <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="ABC2026-123" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Kalemler</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setRows(r => [...r, emptyRow()])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Satır
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_70px_70px_90px_28px] gap-1.5 text-[11px] text-muted-foreground px-0.5">
            <span>Malzeme</span>
            <span>Miktar</span>
            <span>Birim</span>
            <span>Birim ₺</span>
            <span />
          </div>
          {rows.map((row, idx) => {
            const isNew = row.name.trim() && !knownNames.has(row.name.trim().toLowerCase());
            return (
              <div key={idx} className="space-y-0.5">
                <div className="grid grid-cols-[1fr_70px_70px_90px_28px] gap-1.5 items-center">
                  <Input
                    list="purchase-material-options"
                    value={row.name}
                    placeholder="Malzeme adı"
                    onChange={e =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={row.qty}
                    onChange={e =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)))
                    }
                  />
                  <Input
                    value={row.unit}
                    onChange={e =>
                      setRows(rs => rs.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)))
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0,00"
                    value={row.unitCost}
                    onChange={e =>
                      setRows(rs =>
                        rs.map((r, i) => (i === idx ? { ...r, unitCost: e.target.value } : r)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {isNew && (
                  <p className="text-[11px] text-sky-600 pl-0.5">
                    Yeni hammadde — kayıtta otomatik oluşturulacak
                  </p>
                )}
              </div>
            );
          })}
          <datalist id="purchase-material-options">
            {(materials ?? []).map(m => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label>Not (opsiyonel)</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Örn. vadeli alım" />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Toplam: {formatTL(total)}</p>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Faturayı İşle
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Kayıtta: eşleşen hammaddelerin stoğu artar ve birim maliyeti fatura fiyatıyla güncellenir;
          eşleşmeyenler yeni hammadde olarak açılır. Tüm girişler stok hareketlerine işlenir.
        </p>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold">Geçmiş Faturalar</h2>
        {(purchases ?? []).length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Henüz fatura girilmedi.</Card>
        ) : (
          (purchases ?? []).map(p => (
            <Card key={p.id} className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium flex-1 min-w-0 truncate">
                  {p.supplierName || "Tedarikçi belirtilmedi"}
                </p>
                {p.invoiceNo && <Badge variant="outline">{p.invoiceNo}</Badge>}
                <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                <span className="font-semibold">{formatTL(p.totalAmount)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.items.map(i => `${parseFloat(i.qty)} ${i.unit} ${i.name}`).join(" · ")}
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
