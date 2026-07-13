import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Contact, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

/**
 * Cari Hesaplar genel bakışı: müşteriler (bize borçlu = alacağımız) ve
 * tedarikçiler (bizim borcumuz) tek ekranda, bakiyeye göre sıralı.
 */
export default function Ledgers() {
  const [, setLocation] = useLocation();
  const { data: customers } = trpc.customers.list.useQuery();
  const { data: custBal } = trpc.customers.balances.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  const { data: supBal } = trpc.suppliers.balances.useQuery();
  const [search, setSearch] = useState("");

  const q = search.trim().toLocaleLowerCase("tr-TR");
  const key = (n: string) => n.trim().toLocaleLowerCase("tr-TR");

  const custRows = useMemo(() => {
    return ((customers as { id: number; name: string }[]) ?? [])
      .map(c => ({ id: c.id, name: c.name, balance: (custBal ?? {})[key(c.name)] ?? 0 }))
      .filter(r => (q ? r.name.toLocaleLowerCase("tr-TR").includes(q) : true))
      .sort((a, b) => b.balance - a.balance);
  }, [customers, custBal, q]);

  const supRows = useMemo(() => {
    return ((suppliers as { id: number; name: string }[]) ?? [])
      .map(s => ({ id: s.id, name: s.name, balance: (supBal ?? {})[key(s.name)] ?? 0 }))
      .filter(r => (q ? r.name.toLocaleLowerCase("tr-TR").includes(q) : true))
      .sort((a, b) => b.balance - a.balance);
  }, [suppliers, supBal, q]);

  const totalReceivable = custRows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const totalPayable = supRows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const net = totalReceivable - totalPayable;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cari Hesaplar</h1>
        <p className="text-sm text-muted-foreground">
          Müşteri alacakları ve tedarikçi borçları tek ekranda. Detay için ilgili sayfaya git.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Toplam Alacak (müşteri)" value={formatTL(totalReceivable)} tone="text-emerald-600" />
        <Stat label="Toplam Borç (tedarikçi)" value={formatTL(totalPayable)} tone="text-rose-600" />
        <Stat label="Net Cari" value={formatTL(net)} tone={net >= 0 ? "text-emerald-600" : "text-rose-600"} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Cari ara…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Contact className="h-4 w-4 text-emerald-600" /> Müşteriler (alacak)
            </h2>
            <button className="text-xs text-primary inline-flex items-center gap-1" onClick={() => setLocation("/musteriler")}>
              Tümü <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {custRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Kayıt yok.</p>
          ) : (
            <div className="divide-y">
              {custRows.map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className={`font-medium ${r.balance > 0.01 ? "text-rose-600" : r.balance < -0.01 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {formatTL(r.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4 text-rose-600" /> Tedarikçiler (borç)
            </h2>
            <button className="text-xs text-primary inline-flex items-center gap-1" onClick={() => setLocation("/tedarikciler")}>
              Tümü <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {supRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Kayıt yok.</p>
          ) : (
            <div className="divide-y">
              {supRows.map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className={`font-medium ${r.balance > 0.01 ? "text-rose-600" : "text-muted-foreground"}`}>
                    {formatTL(r.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}
