import { Badge } from "@/components/ui/badge";
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
import { trpc } from "@/lib/trpc";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Pazaryeri özellik eşlemesi.
 *
 * Trendyol kategori başına zorunlu özellik ister (Renk, Hacim, Ürün Tipi).
 * Bunlar ayarlarda kategori başına SABİT duruyordu — aynı kategorideki her
 * ürüne aynı renk gidiyordu. Burada özellik, master'ın küp eksenine bağlanır:
 * "Renk özelliği renk ekseninden beslensin" denir, sonra her rengin pazaryeri
 * karşılığı bir kez girilir. 30 renk × 40 ürün = 1 kez 30 satır.
 *
 * Eşlenmemiş değer kart açarken hata verir; "Eksik eşleme" paneli o listeyi
 * önden gösterir.
 */

const SOURCE_LABEL: Record<string, string> = {
  renk: "Renk ekseni",
  ambalaj: "Ambalaj ekseni",
  form: "Ürün tipi ekseni",
  seri: "Seri ekseni",
  hacim: "Ambalaj hacmi (metin)",
  sabit: "Sabit değer",
};

export default function AttributeMapping({ channelId }: { channelId: number }) {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.katalog.channelCategories.useQuery();
  const { data: attributes } = trpc.katalog.channelAttributes.useQuery(
    { channelId },
    { enabled: channelId > 0 },
  );
  const { data: coverage } = trpc.katalog.attributeCoverage.useQuery(
    { channelId },
    { enabled: channelId > 0 },
  );

  const [categoryId, setCategoryId] = useState("");

  // Eşlenmiş kategoriler — özellikler kategori başına tanımlanır.
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of categories ?? []) {
      if (c.channelId !== channelId) continue;
      if (!seen.has(c.categoryId)) seen.set(c.categoryId, c.categoryName || c.categoryId);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [categories, channelId]);

  const activeCategory = categoryId || categoryOptions[0]?.id || "";
  const rows = (attributes ?? []).filter(a => String(a.categoryId) === activeCategory);

  const importAttrs = trpc.katalog.importChannelAttributes.useMutation({
    onSuccess: r => {
      utils.katalog.channelAttributes.invalidate();
      utils.katalog.attributeCoverage.invalidate();
      toast.success(`${r.added} yeni · ${r.updated} güncellendi (${r.total} özellik)`, {
        duration: 8000,
      });
    },
    onError: e => toast.error(e.message, { duration: 10000 }),
  });

  const saveAttr = trpc.katalog.saveChannelAttribute.useMutation({
    onSuccess: () => {
      utils.katalog.channelAttributes.invalidate();
      utils.katalog.attributeCoverage.invalidate();
      toast.success("Özellik kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  /*
   * Silme uçları yazılmıştı ama hiçbir düğmeye bağlı değildi: özellik ve eşleme
   * eklenebiliyor, kaldırılamıyordu. Yanlış eklenen bir kayıt kalıcı oluyordu.
   */
  const deleteAttr = trpc.katalog.deleteChannelAttribute.useMutation({
    onSuccess: () => {
      utils.katalog.channelAttributes.invalidate();
      utils.katalog.attributeCoverage.invalidate();
      toast.success("Özellik kaldırıldı");
    },
    onError: e => toast.error(e.message),
  });

  /** Kurulu eşlemeler — yanlış eşleneni kaldırabilmek için listelenir. */
  const { data: mappedValues } = trpc.katalog.channelAttributeValues.useQuery({ channelId });

  const deleteValue = trpc.katalog.deleteChannelAttributeValue.useMutation({
    onSuccess: () => {
      utils.katalog.attributeCoverage.invalidate();
      utils.katalog.channelAttributeValues.invalidate();
      toast.success("Eşleme kaldırıldı");
    },
    onError: e => toast.error(e.message),
  });

  const saveValue = trpc.katalog.saveChannelAttributeValue.useMutation({
    onSuccess: () => {
      utils.katalog.attributeCoverage.invalidate();
      utils.katalog.channelAttributeValues.invalidate();
      toast.success("Eşleme kaydedildi");
    },
    onError: e => toast.error(e.message),
  });

  if (categoryOptions.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Önce <strong className="text-foreground">Kategori Eşlemesi</strong> sekmesinden en az bir
        kullanım alanını pazaryeri kategorisine bağlayın — özellikler kategori başına tanımlanır.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-muted-foreground">
        Pazaryeri zorunlu özellikleri artık ürün başına <strong className="text-foreground">
          master'ın küp koordinatından
        </strong>{" "}
        üretilir: renk ekseni → Renk, ambalaj hacmi → Hacim, form → Ürün Tipi. Bir kez eşlenir,
        tüm ürünlere doğru değerle gider.
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Kategori</Label>
          <Select value={activeCategory} onValueChange={setCategoryId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Kategori seçin" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!activeCategory || importAttrs.isPending}
          onClick={() => importAttrs.mutate({ channelId, categoryId: activeCategory })}
        >
          {importAttrs.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Pazaryerinden çek
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Bu kategori için özellik tanımı yok. "Pazaryerinden çek" ile zorunlu özellikler
          alınır; kaynak tahmini yapılır ve aşağıdan düzeltilebilir.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Özellik</th>
                <th className="p-2 text-left">Kaynak</th>
                <th className="p-2 text-left">Sabit değer</th>
                <th className="p-2 text-left">Durum</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <AttributeRow
                  key={a.id}
                  attributeId={a.attributeId}
                  attributeName={a.attributeName}
                  source={String(a.source)}
                  constantValueId={a.constantValueId}
                  constantText={a.constantText}
                  isRequired={Number(a.isRequired ?? 1) === 1}
                  coverage={(coverage ?? []).find(c => c.id === a.id) ?? null}
                  onSave={patch =>
                    saveAttr.mutate({
                      channelId,
                      categoryId: activeCategory,
                      attributeId: a.attributeId,
                      attributeName: a.attributeName,
                      isRequired: Number(a.isRequired ?? 1) === 1,
                      ...patch,
                    })
                  }
                  onDelete={() => deleteAttr.mutate({ id: a.id })}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(coverage ?? [])
        .filter(c => c.categoryId === activeCategory && c.missing.length > 0)
        .map(c => (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              Eksik eşleme: {c.attributeName || `#${c.attributeId}`}
              <Badge variant="destructive">
                {c.total - c.mapped}/{c.total}
              </Badge>
              {!c.isRequired && <Badge variant="outline">zorunlu değil</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Bu değerler eşlenmeden kart açılamaz — pazaryerindeki karşılık kimliğini (ya da
              serbest metni) girin.
            </p>
            {/* Kurulu eşlemeler: yanlış eşleneni kaldırmanın tek yolu. */}
            {(mappedValues ?? []).filter(v => v.attributeId === c.attributeId).length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b pb-2">
                {(mappedValues ?? [])
                  .filter(v => v.attributeId === c.attributeId)
                  .map(v => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]"
                    >
                      {v.attributeText || v.attributeValueId || `#${v.dimensionId}`}
                      <button
                        type="button"
                        title="Eşlemeyi kaldır"
                        onClick={() => deleteValue.mutate({ id: v.id })}
                        className="text-destructive hover:opacity-70"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="space-y-1.5">
              {c.missing.map(m => (
                <MissingRow
                  key={m.id}
                  name={m.name}
                  onSave={(valueId, text) =>
                    saveValue.mutate({
                      channelId,
                      attributeId: c.attributeId,
                      dimensionKind: c.source as "renk" | "ambalaj" | "form" | "seri",
                      dimensionId: m.id,
                      attributeValueId: valueId,
                      attributeText: text,
                    })
                  }
                />
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}

function AttributeRow({
  attributeId,
  attributeName,
  source,
  constantValueId,
  constantText,
  isRequired,
  coverage,
  onSave,
  onDelete,
}: {
  attributeId: number;
  attributeName: string | null;
  source: string;
  constantValueId: number | null;
  constantText: string | null;
  isRequired: boolean;
  coverage: { total: number; mapped: number } | null;
  onSave: (patch: {
    source: "renk" | "ambalaj" | "form" | "seri" | "hacim" | "sabit";
    constantValueId?: number | null;
    constantText?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [src, setSrc] = useState(source);
  const [valueId, setValueId] = useState(constantValueId ? String(constantValueId) : "");
  const [text, setText] = useState(constantText ?? "");
  const dirty =
    src !== source ||
    valueId !== (constantValueId ? String(constantValueId) : "") ||
    text !== (constantText ?? "");

  return (
    <tr className="border-t align-top">
      <td className="p-2">
        <div className="font-medium">{attributeName || `#${attributeId}`}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {attributeId}
          {isRequired && <span className="ml-1 text-destructive">zorunlu</span>}
        </div>
      </td>
      <td className="p-2">
        <Select value={src} onValueChange={setSrc}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SOURCE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        {src === "sabit" ? (
          <div className="flex gap-1.5">
            <Input
              value={valueId}
              onChange={e => setValueId(e.target.value)}
              placeholder="değer kimliği"
              className="h-8 w-28 font-mono text-xs"
            />
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="ya da metin"
              className="h-8 w-40 text-xs"
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">ürün başına türetilir</span>
        )}
      </td>
      <td className="flex items-center gap-2 p-2">
        {coverage ? (
          <Badge variant={coverage.mapped === coverage.total ? "secondary" : "destructive"}>
            {coverage.mapped}/{coverage.total}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {dirty && (
          <Button
            size="sm"
            className="h-8"
            onClick={() =>
              onSave({
                source: src as "renk" | "ambalaj" | "form" | "seri" | "hacim" | "sabit",
                constantValueId: valueId.trim() ? Number(valueId) : null,
                constantText: text.trim() || null,
              })
            }
          >
            Kaydet
          </Button>
        )}
      </td>
      <td className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Özelliği kaldır"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}

function MissingRow({
  name,
  onSave,
}: {
  name: string;
  onSave: (valueId: number | null, text: string | null) => void;
}) {
  const [valueId, setValueId] = useState("");
  const [text, setText] = useState("");
  const filled = valueId.trim() !== "" || text.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-44 shrink-0 truncate text-sm">{name}</span>
      <Input
        value={valueId}
        onChange={e => setValueId(e.target.value)}
        placeholder="pazaryeri değer kimliği"
        className="h-8 w-44 font-mono text-xs"
      />
      <Input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="ya da serbest metin"
        className="h-8 w-52 text-xs"
      />
      {filled && (
        <Button
          size="sm"
          className="h-8"
          onClick={() => onSave(valueId.trim() ? Number(valueId) : null, text.trim() || null)}
        >
          Eşle
        </Button>
      )}
    </div>
  );
}
