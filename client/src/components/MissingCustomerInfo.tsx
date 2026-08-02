import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { FIELD_LABELS } from "@shared/missingInfo";
import { CheckCircle2, ClipboardCopy, MessageCircle, PhoneOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Kargo/fatura için eksik müşteri bilgileri.
 *
 * ── Neden ─────────────────────────────────────────────────────────────────
 * Eksik adres ya da vergi numarası, ancak kargo etiketi basılırken veya fatura
 * kesilirken fark ediliyordu — yani gönderim günü, sipariş beklerken. Burada
 * eksikler ÖNCEDEN listelenir ve her müşteri için gönderime hazır bir mesaj
 * üretilir; tek tık WhatsApp'ta açılır.
 *
 * Mesajı sistem GÖNDERMEZ, açar: hangi müşteriye ne zaman yazılacağı patronun
 * kararı ve otomatik toplu mesaj rahatsız edici olur.
 */
export default function MissingCustomerInfo() {
  const [requireTax, setRequireTax] = useState(false);
  const [includeMarketplace, setIncludeMarketplace] = useState(false);
  const { data, isLoading } = trpc.customers.missingInfo.useQuery({
    requireTax,
    includeMarketplace,
  });

  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-56 flex-1 text-sm text-muted-foreground">
          Açık siparişi olup kargo/fatura bilgisi eksik müşteriler. Mesaj hazır üretilir —
          göndermeden önce görebilir, düzenleyebilirsiniz.
        </div>
        <div className="flex items-center gap-2">
          <Switch id="tax" checked={requireTax} onCheckedChange={setRequireTax} />
          <Label htmlFor="tax" className="text-xs">
            Vergi bilgisi de sor
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="mp"
            checked={includeMarketplace}
            onCheckedChange={setIncludeMarketplace}
          />
          <Label htmlFor="mp" className="text-xs">
            Pazaryeri siparişleri dahil
          </Label>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Açık siparişlerin tamamında kargo ve fatura bilgisi tam.
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {data?.summary.customers} müşteri · {data?.summary.orders} sipariş bekliyor ·{" "}
            {data?.summary.reachable} müşteriye WhatsApp'tan ulaşılabilir
          </p>

          {rows.map(r => (
            <Card key={`${r.customerId ?? r.customerName}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.customerName}</p>
                {r.missing.map(m => (
                  <Badge key={m} variant="outline" className="text-[10px] text-amber-600">
                    {FIELD_LABELS[m]}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  {r.orders.map(o => o.orderNo).join(", ")}
                </span>

                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      void navigator.clipboard.writeText(r.message);
                      toast.success("Mesaj kopyalandı");
                    }}
                  >
                    <ClipboardCopy className="mr-1 h-3.5 w-3.5" /> Kopyala
                  </Button>
                  {r.waLink ? (
                    <Button size="sm" className="h-8" asChild>
                      <a href={r.waLink} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp'ta aç
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                      <PhoneOff className="h-3 w-3" /> telefon da yok
                    </Badge>
                  )}
                </div>
              </div>

              {/* Mesaj görünür dursun: gönderilecek metni görmeden göndermek,
                  yanlış müşteriye yanlış siparişi sormanın kolay yolu. */}
              <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs">
                {r.message}
              </pre>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
