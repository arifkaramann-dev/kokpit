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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  const rows = items ?? [];

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
                    <MasterPicker
                      options={catalog ?? []}
                      onPick={masterId => bind.mutate({ itemId: r.id, masterId })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
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
