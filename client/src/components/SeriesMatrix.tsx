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
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Seri uyumluluk matrisi — hangi seride hangi RENK, ürün tipi ve ambalaj üretilir.
 *
 * Eksik olan renk eksenIydi. `colors.seriesId` tek bir seriye işaret eden
 * nullable bir alandı ve tohumlama hiçbir renge seri atamıyordu; sonuçta her
 * renk her seriye düşüyordu. CANDY için master üretince RAL kodları dahil 31
 * rengin tamamı çarpıma girip 744 master çıkıyordu.
 *
 * Renk artık ambalaj ve tiple aynı şekilde çoka-çok bağlanır. Seçim yapılmamış
 * seri "tüm renkler" demektir ve bu ekranda açıkça uyarılır — sessizce
 * şişmesin.
 *
 * `seriesId` verilirse kendi seri seçicisini gizler ve yalnız o seriyi
 * düzenler. Sihirbaz bunu kullanır: kullanıcının kurulum için ayrı sayfaya
 * gidip geri dönmesi, akışın en çok şikayet edilen yeriydi.
 */
export default function SeriesMatrix({ seriesId: lockedSeriesId }: { seriesId?: number } = {}) {
  const utils = trpc.useUtils();
  const { data: dims } = trpc.katalog.dimensions.useQuery();
  const { data: series } = trpc.series.list.useQuery();
  const { data: links } = trpc.katalog.seriesLinks.useQuery();
  const { data: redundant } = trpc.katalog.redundantPackagings.useQuery();

  const deactivate = trpc.katalog.setPackagingActive.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Ambalaj pasife alındı");
    },
    onError: e => toast.error(e.message),
  });

  const [seriesId, setSeriesId] = useState<string>("");
  // Dışarıdan seri verildiyse o kilitlenir; verilmediyse kendi seçicisi çalışır.
  const activeId = lockedSeriesId ?? (Number(seriesId) || series?.[0]?.id || 0);

  const colors = dims?.colors ?? [];
  const families = dims?.families ?? [];
  const packagings = dims?.packagings ?? [];

  const current = useMemo(() => {
    const pick = <T extends { seriesId: number }>(rows: T[] | undefined, key: keyof T) =>
      new Set((rows ?? []).filter(r => r.seriesId === activeId).map(r => Number(r[key])));
    return {
      colors: pick(links?.colors, "colorId" as never),
      families: pick(links?.families, "familyId" as never),
      packagings: pick(links?.packagings, "packagingId" as never),
    };
  }, [links, activeId]);

  const [sel, setSel] = useState(current);

  /*
   * Seçim YALNIZ düzenlenen seri değişince sıfırlanır.
   *
   * Önce `useEffect(() => setSel(current), [current])` yazılmıştı ve bu,
   * kullanıcının KAYDEDİLMEMİŞ seçimlerini siliyordu: `current` bir useMemo
   * ve `links` her tazelendiğinde yeni bir nesne kimliği üretiyor. Sayfadaki
   * herhangi bir mutation `utils.katalog.invalidate()` çağırdığında ya da
   * pencere yeniden odağa geldiğinde sorgu yeniden çekiliyor, efekt tetikleniyor
   * ve ekranda işaretlenen her şey eski haline dönüyordu.
   *
   * `links` gelmeden ilk kurulum yapılmaz; yoksa seçim boş kümeyle sabitlenir
   * ve gerçek veri geldiğinde bir daha yüklenmez.
   */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!links) return;
    const key = String(activeId);
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setSel(current);
  }, [links, activeId, current]);

  const save = trpc.katalog.seriesCompatibility.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Seri uyumluluğu kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const toggle = (kind: "colors" | "families" | "packagings", id: number) =>
    setSel(prev => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });

  const dirty =
    sel.colors.size !== current.colors.size ||
    sel.families.size !== current.families.size ||
    sel.packagings.size !== current.packagings.size ||
    Array.from(sel.colors).some(id => !current.colors.has(id)) ||
    Array.from(sel.families).some(id => !current.families.has(id)) ||
    Array.from(sel.packagings).some(id => !current.packagings.has(id));

  const projected =
    (sel.colors.size || colors.length) *
    (sel.families.size || 0) *
    (sel.packagings.size || 0);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Seri Uyumluluğu</h2>
        {lockedSeriesId == null && (
          <Select value={String(activeId)} onValueChange={setSeriesId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Seri seçin" />
            </SelectTrigger>
            <SelectContent>
              {(series ?? []).map(s => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {dirty && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                seriesId: activeId,
                colorIds: Array.from(sel.colors),
                familyIds: Array.from(sel.families),
                packagingIds: Array.from(sel.packagings),
              })
            }
          >
            <Save className="mr-1 h-4 w-4" /> Kaydet
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Master sayısı bu üç eksenin çarpımıdır. Renk seçilmezse{" "}
        <strong className="text-foreground">tüm renkler</strong> girer — bir seriye ait olmayan
        renkler de dahil.
      </p>

      {(redundant?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            Mükerrer ambalajlar
          </div>
          <p className="text-xs text-muted-foreground">
            R2U artık bir ürün TİPİDİR ("R2U Boya"), ambalaj adına gömülmemeli. Bu ambalajlar
            aynı hacmin ikinci kaydı: "30 ML" ile "30 ml (ReadyToUse)" aynı şişedir ve üretime
            girerse kopya SKU doğurur. Pasife alın.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {redundant?.map(p => (
              <Button
                key={p.id}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate({ id: p.id, isActive: false })}
              >
                {p.name} — pasife al
              </Button>
            ))}
          </div>
        </div>
      )}

      {sel.colors.size === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          Bu seride renk sınırı yok: {colors.length} rengin tamamı üretilecek.
        </div>
      )}

      <div className="rounded-lg border p-3 text-sm">
        Tahmini master: <strong>{projected}</strong>
        <span className="text-muted-foreground">
          {" "}
          — renk × ürün tipi × ambalaj. R2U ayrı bir ürün tipidir, sayıyı ikiye katlayan
          ayrı bir eksen değil.
        </span>
      </div>

      <Axis
        title="Renkler"
        count={sel.colors.size}
        total={colors.length}
        onAll={() => setSel(p => ({ ...p, colors: new Set(colors.map(c => c.id)) }))}
        onNone={() => setSel(p => ({ ...p, colors: new Set<number>() }))}
      >
        {colors.map(c => (
          <Chip
            key={c.id}
            active={sel.colors.has(c.id)}
            onClick={() => toggle("colors", c.id)}
            hex={c.hex}
          >
            {c.name}
          </Chip>
        ))}
      </Axis>

      <Axis
        title="Formlar"
        count={sel.families.size}
        total={families.length}
        onAll={() => setSel(p => ({ ...p, families: new Set(families.map(f => f.id)) }))}
        onNone={() => setSel(p => ({ ...p, families: new Set<number>() }))}
      >
        {families.map(f => (
          <Chip key={f.id} active={sel.families.has(f.id)} onClick={() => toggle("families", f.id)}>
            {f.name}
          </Chip>
        ))}
      </Axis>

      <Axis
        title="Ambalajlar"
        count={sel.packagings.size}
        total={packagings.length}
        onAll={() => setSel(p => ({ ...p, packagings: new Set(packagings.map(x => x.id)) }))}
        onNone={() => setSel(p => ({ ...p, packagings: new Set<number>() }))}
      >
        {packagings.map(p => (
          <Chip
            key={p.id}
            active={sel.packagings.has(p.id)}
            onClick={() => toggle("packagings", p.id)}
          >
            {p.name}
          </Chip>
        ))}
      </Axis>

      <FamilyPackagingMatrix families={families} packagings={packagings} links={links?.familyPackagings ?? []} />
    </Card>
  );
}

/**
 * Form × ambalaj uyumluluğu.
 *
 * Seri ekseni sprey kutusunu da airbrush formunu da içeriyorsa "Airbrush ·
 * SPREY 400ML" master'ı üretiliyordu — çünkü form ile ambalaj arasında hiç
 * kısıt yoktu. Burada her formun hangi ambalajlarla eşleşeceği belirlenir.
 */
function FamilyPackagingMatrix({
  families,
  packagings,
  links,
}: {
  families: { id: number; name: string }[];
  packagings: { id: number; name: string }[];
  links: { familyId: number; packagingId: number }[];
}) {
  const utils = trpc.useUtils();
  const [familyId, setFamilyId] = useState<string>("");
  const activeId = Number(familyId) || families[0]?.id || 0;

  const current = useMemo(
    () => new Set(links.filter(l => l.familyId === activeId).map(l => l.packagingId)),
    [links, activeId],
  );
  const [sel, setSel] = useState(current);

  // Aynı sebep, aynı çözüm: yalnız düzenlenen form değişince sıfırla.
  // Bkz. SeriesMatrix'teki uzun açıklama.
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (links.length === 0) return;
    if (loadedFor.current === activeId) return;
    loadedFor.current = activeId;
    setSel(current);
  }, [links, activeId, current]);

  const save = trpc.katalog.setFamilyPackagings.useMutation({
    onSuccess: () => {
      utils.katalog.invalidate();
      toast.success("Form uyumluluğu kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  const dirty =
    sel.size !== current.size || Array.from(sel).some(id => !current.has(id));

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Form × Ambalaj</span>
        <Select value={String(activeId)} onValueChange={setFamilyId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Form seçin" />
          </SelectTrigger>
          <SelectContent>
            {families.map(f => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {dirty && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={save.isPending}
            onClick={() => save.mutate({ familyId: activeId, packagingIds: Array.from(sel) })}
          >
            <Save className="mr-1 h-4 w-4" /> Kaydet
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Sprey kutusu yalnız sprey formunda anlamlıdır. Seçim yapılmazsa bu form serinin tüm
        ambalajlarıyla eşleşir.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {packagings.map(p => (
          <Chip
            key={p.id}
            active={sel.has(p.id)}
            onClick={() =>
              setSel(prev => {
                const next = new Set(prev);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                return next;
              })
            }
          >
            {p.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Axis({
  title,
  count,
  total,
  onAll,
  onNone,
  children,
}: {
  title: string;
  count: number;
  total: number;
  onAll: () => void;
  onNone: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Badge variant={count > 0 ? "secondary" : "outline"}>
          {count}/{total}
        </Badge>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onAll}>
          Tümü
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onNone}>
          Hiçbiri
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  hex,
  children,
}: {
  active: boolean;
  onClick: () => void;
  hex?: string | null;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {hex && (
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full border"
          style={{ backgroundColor: hex }}
        />
      )}
      {children}
    </button>
  );
}
