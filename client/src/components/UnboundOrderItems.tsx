import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQty } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Link2, Loader2, PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type UnboundRow = {
  id: number;
  orderId: number;
  orderNo: string | null;
  productName: string;
  channelRef: string | null;
  quantity: string;
  createdAt: Date | string;
};

/**
 * Bağlanmamış sipariş satırları — elle bağlama iş listesi.
 *
 * Pazaryeri siparişi barkodla gelir ve otomatik bağlanır. Elden girilen,
 * ilanı silinmiş ya da barkodu tanınmayan satırlar burada kalır: bağlanmadan
 * üretim planına ve getiri raporuna girmezler.
 *
 * "Kanal kodundan bağla" geçmişi topluca tarar — ilan sonradan yayınlandığında
 * eski siparişler de bağlanabilir hale gelir.
 */
export default function UnboundOrderItems() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.katalog.unboundOrderItems.useQuery();
  const { data: catalog } = trpc.katalog.sellableList.useQuery();

  const backfill = trpc.katalog.bindOrders.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      toast.success(
        `${r.bound} satır bağlandı · ${r.unknownRefs.length} kod tanınmadı · ${r.noRef} kodsuz`,
        { duration: 9000 },
      );
    },
    onError: e => toast.error(e.message),
  });

  const bind = trpc.katalog.bindOrderItem.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Bağlandı");
    },
    onError: e => toast.error(e.message),
  });

  // "Ürün yoksa oluştur": katalogda karşılığı olmayan pazaryeri ürünleri
  // aksi halde sonsuza kadar bağsız kalıyor ve hiçbir rapora girmiyordu.
  const [createFor, setCreateFor] = useState<UnboundRow | null>(null);

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  const rows = (items ?? []) as UnboundRow[];

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-64 flex-1 text-sm text-muted-foreground">
          Bağlanmamış satır üretim planına ve getiri raporuna girmez. Pazaryeri siparişleri
          barkodla otomatik bağlanır; burada kalanlar elden girilmiş ya da kodu tanınmayanlardır.
        </div>
        <Button
          variant="outline"
          disabled={backfill.isPending}
          onClick={() => backfill.mutate()}
        >
          {backfill.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          Kanal kodundan bağla
        </Button>
      </Card>

      {rows.length === 0 ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Bağlanmamış satır yok — bütün satışlar ürünlere bağlı.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sipariş</TableHead>
                <TableHead>Kalem</TableHead>
                <TableHead>Kanal kodu</TableHead>
                <TableHead className="text-right">Adet</TableHead>
                <TableHead>Bağla</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium">{r.orderNo ?? `#${r.orderId}`}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell>{r.productName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.channelRef ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatQty(r.quantity)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <MasterPicker
                        options={catalog ?? []}
                        onPick={masterId => bind.mutate({ itemId: r.id, masterId })}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        title="Katalogda karşılığı yok — ürünü aç ve bu satırı ona bağla"
                        onClick={() => setCreateFor(r)}
                      >
                        <PackagePlus className="mr-1 h-3.5 w-3.5" /> Ürün aç
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CreateMasterDialog row={createFor} onClose={() => setCreateFor(null)} />
    </div>
  );
}

/**
 * Bağsız satırdan ürün açma.
 *
 * Küp koordinatı (seri × renk × form × ambalaj) sorulmak zorunda: pazaryeri
 * başlığından renk ve ambalajı güvenilir biçimde çıkarmak mümkün değil ve
 * yanlış tahmin, yanlış reçeteye bağlanmış bir ürün demek. Ama tahmin
 * EDİLEBİLİR olanlar (ambalaj hacmi, isim) ön dolduruluyor.
 *
 * Mükerrer koruması sunucuda: aynı kanal kodu ya da aynı küp varsa yeni ürün
 * açılmaz, mevcuda bağlanır.
 */
function CreateMasterDialog({ row, onClose }: { row: UnboundRow | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();

  const [seriesId, setSeriesId] = useState("");
  const [colorId, setColorId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [packagingId, setPackagingId] = useState("");
  const [price, setPrice] = useState("");

  // Ambalajı isimden tahmin et: "... 100 ml ..." yazan bir başlıkta 100 ml
  // ambalajı seçmek neredeyse her zaman doğru ve en sık yapılan seçim.
  useEffect(() => {
    if (!row) return;
    setPrice("");
    const packs = dims?.packagings ?? [];
    const match = row.productName.match(/(\d+(?:[.,]\d+)?)\s*(ml|lt|l)\b/i);
    if (match) {
      const qty = parseFloat(match[1].replace(",", "."));
      const ml = /^l/i.test(match[2]) ? qty * 1000 : qty;
      const hit = packs.find(p => Math.abs(Number(p.volumeMl ?? 0) - ml) < 0.5);
      if (hit) setPackagingId(String(hit.id));
    }
  }, [row, dims]);

  const create = trpc.katalog.createMasterFromOrderLine.useMutation({
    onSuccess: r => {
      utils.katalog.invalidate();
      utils.orders.invalidate();
      toast.success(
        r.created
          ? `Ürün açıldı ve ${r.bound} satır bağlandı. Kanal kodu kaydedildi — bu üründen gelen sonraki siparişler kendiliğinden bağlanacak.`
          : `Zaten kayıtlı ürün bulundu (${r.reason === "kanal_kodu" ? "aynı kanal kodu" : "aynı renk/ambalaj"}) — yeni ürün açılmadı, ${r.bound} satır ona bağlandı.`,
        { duration: 10000 },
      );
      onClose();
    },
    onError: e => toast.error(e.message, { duration: 9000 }),
  });

  const ready = seriesId && colorId && familyId && packagingId;

  return (
    <Dialog open={row != null} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bu satır için ürün aç</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="space-y-1 p-3 text-sm">
            <p className="font-medium">{row?.productName}</p>
            <p className="text-xs text-muted-foreground">
              {row?.orderNo ?? `#${row?.orderId}`} · kanal kodu{" "}
              <span className="font-mono">{row?.channelRef ?? "yok"}</span>
            </p>
          </Card>

          <p className="text-xs text-muted-foreground">
            Ürünü katalog koordinatına yerleştirin. Aynı koordinatta ya da aynı kanal kodunda
            ürün varsa <strong>yenisi açılmaz</strong>, mevcuda bağlanır.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Seri *</Label>
              <Select value={seriesId} onValueChange={setSeriesId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seri seç" />
                </SelectTrigger>
                <SelectContent>
                  {(series ?? []).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Renk *</Label>
              <Select value={colorId} onValueChange={setColorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Renk seç" />
                </SelectTrigger>
                <SelectContent>
                  {(dims?.colors ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ürün tipi *</Label>
              <Select value={familyId} onValueChange={setFamilyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tip seç" />
                </SelectTrigger>
                <SelectContent>
                  {(dims?.families ?? []).map(f => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ambalaj *</Label>
              <Select value={packagingId} onValueChange={setPackagingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Ambalaj seç" />
                </SelectTrigger>
                <SelectContent>
                  {(dims?.packagings ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Taban fiyat (₺)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Boş bırakılırsa siparişteki birim fiyat kullanılır"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Ürün <strong>tedarikli</strong> satış moduyla açılır: reçetesi bağlanmadan da satışta
            kalır, "üretmediğini satamama" durumu doğmaz. Reçeteyi sonra Reçeteler'den bağlayın.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            İptal
          </Button>
          <Button
            disabled={!ready || create.isPending}
            onClick={() =>
              row &&
              create.mutate({
                itemId: row.id,
                seriesId: Number(seriesId),
                colorId: Number(colorId),
                familyId: Number(familyId),
                packagingId: Number(packagingId),
                basePrice: price ? parseFloat(price) : undefined,
              })
            }
          >
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Ürünü aç ve bağla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MasterPicker({
  options,
  onPick,
}: {
  options: { masterId: number; name: string; internalSku: string; hex: string | null }[];
  onPick: (masterId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          Ürün seç
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Renk, ambalaj ya da kod ara…" />
          <CommandList>
            <CommandEmpty>Ürün bulunamadı.</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem
                  key={o.masterId}
                  value={`${o.name} ${o.internalSku}`}
                  onSelect={() => {
                    onPick(o.masterId);
                    setOpen(false);
                  }}
                >
                  {o.hex && (
                    <span
                      className="mr-2 inline-block h-3.5 w-3.5 shrink-0 rounded border"
                      style={{ backgroundColor: o.hex }}
                    />
                  )}
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
