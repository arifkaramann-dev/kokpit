import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { TrackRow } from "./ProductTree";

/**
 * Bir varyantın (fiziksel şişenin) çalışma kartı.
 *
 * Önceki hâli sekiz kolonluk yatay kaydırmalı bir tablo satırıydı: görsel ve
 * barkod hiç yoktu, eksikler `slice(0, 2)` ile kırpılıp en sağda soluk gri
 * yazıyla gösteriliyordu, tıklayınca da kullanıcıyı `/urun/:id`'ye fırlatıyordu.
 * Yani ekran "şu eksik" diyor ama düzeltmeye izin vermiyordu; her düzeltme
 * listeden çıkıp geri gelmek demekti.
 *
 * Kart bunun tersini yapar: eksiğin tamamını gösterir ve HER BİRİNİ yerinde
 * kapatılabilir kılar. Görsel buraya sürüklenir, fiyat/stok/barkod buradan
 * yazılır. Detay sayfası durur ama mecburiyet olmaktan çıkar.
 */

const SALES_MODES = [
  { value: "siparis_uzerine", label: "Sipariş üzerine" },
  { value: "stoktan", label: "Stoktan" },
  { value: "tedarikli", label: "Tedarikli" },
] as const;

/** Kaydı yalnız değer gerçekten değiştiyse gönderen küçük alan. */
function InlineField({
  value,
  onSave,
  inputRef,
  prefix,
  suffix,
  placeholder,
  className,
  saving,
}: {
  value: string;
  onSave: (next: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  className?: string;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // Sunucudan yeni değer gelince (başka bir kayıt, invalidate) taslak tazelenir;
  // aksi hâlde ekrandaki sayı sessizce veritabanından ayrışırdı.
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft.trim() === value.trim()) return;
    onSave(draft.trim());
  };

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className={`h-8 text-sm ${prefix ? "pl-6" : ""} ${suffix ? "pr-7" : ""} ${className ?? ""}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      )}
      {saving && (
        <Loader2 className="absolute -right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

function Metric({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "bad";
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${tone === "bad" ? "text-destructive" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export default function VariantCard({ row }: { row: TrackRow }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const gtinRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const done = () => utils.katalog.invalidate();
  const fail = (e: { message: string }) => toast.error(e.message);

  const setPrice = trpc.katalog.setBasePrice.useMutation({
    onSuccess: () => {
      done();
      toast.success("Fiyat kaydedildi");
    },
    onError: fail,
  });
  const setStock = trpc.katalog.setStock.useMutation({
    onSuccess: () => {
      done();
      toast.success("Stok kaydedildi");
    },
    onError: fail,
  });
  const setGtin = trpc.katalog.setGtin.useMutation({
    onSuccess: () => {
      done();
      toast.success("Barkod kaydedildi");
    },
    onError: fail,
  });
  const setSalesMode = trpc.katalog.setSalesMode.useMutation({ onSuccess: done, onError: fail });
  const addImage = trpc.katalog.addMasterImage.useMutation({
    onSuccess: () => {
      done();
      toast.success("Görsel yüklendi");
    },
    onError: fail,
  });
  const deleteImage = trpc.katalog.deleteMasterImage.useMutation({
    onSuccess: () => {
      done();
      toast.success("Görsel silindi");
    },
    onError: fail,
  });

  /** Dosyayı data URL'e çevirip yükler — kalıcı disk/S3 gerektirmez. */
  const upload = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Yalnız görsel dosyası yükleyebilirsiniz");
      return;
    }
    // 8 MB üstü base64 olarak satıra sığmaz; kullanıcı sebebini bilsin.
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Görsel 8 MB'tan küçük olmalı");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      addImage.mutate(
        { masterId: row.masterId, data: String(reader.result) },
        { onSettled: () => setUploading(false) },
      );
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error("Dosya okunamadı");
    };
    reader.readAsDataURL(file);
  };

  const focus = (ref: React.RefObject<HTMLInputElement | null>) => () => {
    ref.current?.focus();
    ref.current?.select();
  };

  /*
   * Her eksik, onu kapatan eyleme bağlanır. Etiketler `masterHealth.ts`'teki
   * kontrol listesinden birebir gelir — orada bir etiket değişirse burada
   * eşleşme düşer ve eksik yalnız rozet olarak görünür (bozulmaz, sadece
   * tıklanamaz olur).
   */
  const FIX: Record<string, { action: string; run: () => void }> = {
    "Görsel yok": { action: "Yükle", run: () => fileRef.current?.click() },
    "Fiyat girilmemiş": { action: "Gir", run: focus(priceRef) },
    "Stok yok": { action: "Gir", run: focus(stockRef) },
    "Barkod yok": { action: "Gir", run: focus(gtinRef) },
    "Reçete bağlı değil": { action: "Bağla", run: () => setLocation("/receteler") },
    "Maliyet bilinmiyor": { action: "Reçeteye git", run: () => setLocation("/receteler") },
    "İlan açılmamış": { action: "Aç", run: () => setLocation(`/urun/${row.masterId}`) },
    "İlan metni boş": { action: "Yaz", run: () => setLocation(`/urun/${row.masterId}`) },
    "Hiçbir kanalda yayında değil": { action: "Yayınla", run: () => setLocation("/yayin") },
  };

  const total = row.health.checkCount;
  const okCount = Math.max(0, total - row.health.missing.length);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Görsel — kartın içinde yüklenir, ayrı "Görseller" sekmesine gitmek yok. */}
        <div className="shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              upload(e.dataTransfer.files?.[0]);
            }}
            className={`group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            } ${row.imageUrl ? "border-solid border-border" : ""}`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : row.imageUrl ? (
              <>
                <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  title="Görseli sil"
                  onClick={() => row.imageId && deleteImage.mutate({ id: row.imageId })}
                  className="absolute right-1 top-1 rounded bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
                {row.imageCount > 1 && (
                  <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px]">
                    +{row.imageCount - 1}
                  </span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px]">Görsel ekle</span>
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Kimlik */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">
                  {row.family} · {row.packaging}
                </span>
                {row.readiness === "r2u" && (
                  <Badge variant="secondary" className="text-[10px]">
                    r2u
                  </Badge>
                )}
                {row.status !== "aktif" && (
                  <Badge variant="outline" className="text-[10px]">
                    {row.status}
                  </Badge>
                )}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">{row.internalSku}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={() => setLocation(`/urun/${row.masterId}`)}
            >
              Detay <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>

          {/* Sayılar — düzenlenebilir olanlar alan, olmayanlar metin. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Maliyet" tone={row.cost > 0 ? undefined : "bad"}>
              {row.cost > 0 ? formatTL(row.cost) : "bilinmiyor"}
            </Metric>

            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Fiyat
              </div>
              <InlineField
                inputRef={priceRef}
                value={row.price > 0 ? String(row.price) : ""}
                placeholder="0"
                suffix="₺"
                saving={setPrice.isPending}
                onSave={v => {
                  const n = Number(v.replace(",", "."));
                  if (!Number.isFinite(n) || n < 0) return toast.error("Geçerli bir fiyat girin");
                  setPrice.mutate({ masterId: row.masterId, basePrice: n });
                }}
              />
            </div>

            <Metric label="Kâr" tone={row.price > 0 && row.profit <= 0 ? "bad" : undefined}>
              {row.price > 0 && row.cost > 0 ? formatTL(row.profit) : "—"}
            </Metric>

            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Stok
              </div>
              <InlineField
                inputRef={stockRef}
                value={String(row.stockQty)}
                placeholder="0"
                suffix="ad"
                saving={setStock.isPending}
                onSave={v => {
                  const n = Number(v);
                  if (!Number.isInteger(n) || n < 0) return toast.error("Stok tam sayı olmalı");
                  setStock.mutate({ masterId: row.masterId, stockQty: n });
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Barkod
              </div>
              <InlineField
                inputRef={gtinRef}
                value={row.gtin ?? ""}
                placeholder="8-14 hane"
                saving={setGtin.isPending}
                onSave={v => setGtin.mutate({ masterId: row.masterId, gtin: v })}
                className="font-mono text-xs"
              />
            </div>

            <div className="min-w-0">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Satış
              </div>
              <Select
                value={row.salesMode}
                onValueChange={mode =>
                  setSalesMode.mutate({ masterIds: [row.masterId], salesMode: mode as never })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALES_MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Eksikler — tamamı, kırpılmadan, her biri düzeltmeye götürür. */}
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
            {row.health.missing.length === 0 ? (
              <span className="text-xs text-emerald-600">Eksiksiz — satışa hazır</span>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Eksik
                </span>
                {row.health.missing.map(m => {
                  const fix = FIX[m];
                  return fix ? (
                    <button
                      key={m}
                      type="button"
                      onClick={fix.run}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 transition hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                    >
                      {m}
                      <span className="font-medium underline underline-offset-2">{fix.action}</span>
                    </button>
                  ) : (
                    <Badge key={m} variant="outline" className="text-[11px] font-normal">
                      {m}
                    </Badge>
                  );
                })}
              </>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {okCount}/{total} tamam · ilanda {row.listingQty} adet
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
