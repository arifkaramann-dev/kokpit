import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { Check, Loader2, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Kategori eşlemesi — kullanım alanı × KANAL.
 *
 * İki sorun düzeltildi:
 *
 *  1) Eşleme zaten kanal başınaydı (`useCaseChannelCategories.channelId`) ama
 *     satır bileşeni kanal değişince yeniden kurulmuyordu: `useState` yalnız
 *     ilk değeri alır, `key` kanalı içermediği için React aynı örneği yeniden
 *     kullanıyordu. Sonuç: Trendyol'dan Hepsiburada'ya geçince EKRANDA eski
 *     kanalın kimlikleri kalıyordu — eşleme ortakmış gibi görünüyordu.
 *     Artık `key` kanalı da içeriyor.
 *
 *  2) Kategori kimliği elle bulunuyordu. Artık pazaryerinin kendi ağacından
 *     aranıyor ve kullanım alanı adına göre otomatik öneriliyor.
 */
export default function CategoryMapping({
  channelId,
  channelName,
  useCases,
  categories,
}: {
  channelId: number;
  channelName: string;
  useCases: { id: number; name: string }[];
  categories: { useCaseId: number; channelId: number; categoryId: string; categoryName: string | null }[];
}) {
  const utils = trpc.useUtils();
  const [suggestOpen, setSuggestOpen] = useState(false);

  const setCategory = trpc.katalog.setChannelCategory.useMutation({
    onSuccess: () => {
      utils.katalog.channelCategories.invalidate();
      toast.success("Kategori eşlendi");
    },
    onError: e => toast.error(e.message),
  });

  const suggestions = trpc.katalog.suggestChannelCategories.useQuery(
    { channelId, onlyUnmapped: true },
    { enabled: suggestOpen && channelId > 0, retry: false },
  );

  const catOf = (useCaseId: number) =>
    categories.find(c => c.useCaseId === useCaseId && c.channelId === channelId);

  const mapped = useCases.filter(u => catOf(u.id)).length;

  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-muted-foreground">
        Her kullanım alanı bir pazaryeri kategorisine eşlenmeli — kategorisiz ilan açılamaz.
        <span className="mt-1 block">
          Eşleme <strong className="text-foreground">kanal başınadır</strong>: Trendyol ve
          Hepsiburada kategori kimlikleri farklıdır, ayrı ayrı girilir.
        </span>
        <span className="mt-1 block">
          Aynı zamanda <strong className="text-foreground">mükerrer ilan kilidinin</strong>{" "}
          dayanağı: bir ürün, bir kanalda, bir kategoride tek ilan.
        </span>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={mapped === useCases.length ? "secondary" : "outline"}>
          {mapped}/{useCases.length} eşlenmiş · {channelName}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setSuggestOpen(v => !v)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {suggestOpen ? "Önerileri gizle" : "Otomatik öner"}
        </Button>
      </div>

      {suggestOpen && (
        <Card className="space-y-3 p-4">
          {suggestions.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Kategori ağacı çekiliyor…
            </p>
          ) : suggestions.error ? (
            <p className="text-sm text-destructive">{suggestions.error.message}</p>
          ) : (suggestions.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Eşlenmemiş kullanım alanı yok.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Öneriler kullanım alanı adına göre hesaplandı — kesin değildir. Yanlış kategori
                kartın reddedilmesine yol açar; onaylamadan yazılmaz.
              </p>
              {suggestions.data?.rows.map(row => (
                <div key={row.useCaseId} className="space-y-1.5">
                  <p className="text-sm font-medium">{row.useCaseName}</p>
                  {row.suggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Uygun kategori bulunamadı — aşağıdan arayın.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.suggestions.map(sg => (
                        <Button
                          key={sg.categoryId}
                          size="sm"
                          variant="outline"
                          className="h-auto py-1.5 text-left"
                          onClick={() =>
                            setCategory.mutate({
                              useCaseId: row.useCaseId,
                              channelId,
                              categoryId: sg.categoryId,
                              categoryName: sg.name,
                            })
                          }
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{sg.path}</span>
                          <Badge variant="secondary" className="ml-2">
                            %{Math.round(sg.score * 100)}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Kullanım alanı</th>
              <th className="p-2 text-left">Kategori</th>
              <th className="p-2 text-left" />
            </tr>
          </thead>
          <tbody>
            {useCases.map(u => (
              <CategoryRow
                // Kanal anahtarın parçası: kanal değişince satır sıfırdan
                // kurulsun, önceki kanalın değerleri ekranda kalmasın.
                key={`${channelId}-${u.id}`}
                channelId={channelId}
                useCaseName={u.name}
                current={catOf(u.id)}
                onSave={(categoryId, categoryName) =>
                  setCategory.mutate({ useCaseId: u.id, channelId, categoryId, categoryName })
                }
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/**
 * Bir kullanım alanının kanal kategorisi.
 *
 * Eskiden satırda iki boş kutu vardı (kimlik + ad) ve arama 14 piksellik
 * etiketsiz bir büyüteçti; sonuç olarak kimlik pazaryeri panelinden tek tek
 * kopyalanıyordu. Artık arama ana kontrol, eşlenen kategori okunur biçimde
 * görünüyor, elle kimlik girişi yalnız istendiğinde açılıyor.
 */
function CategoryRow({
  channelId,
  useCaseName,
  current,
  onSave,
}: {
  channelId: number;
  useCaseName: string;
  current: { categoryId: string; categoryName: string | null } | undefined;
  onSave: (categoryId: string, categoryName: string | null) => void;
}) {
  const [manual, setManual] = useState(false);
  const [id, setId] = useState(current?.categoryId ?? "");
  const [name, setName] = useState(current?.categoryName ?? "");
  const dirty = id !== (current?.categoryId ?? "") || name !== (current?.categoryName ?? "");

  return (
    <tr className="border-t">
      <td className="p-2 font-medium">{useCaseName}</td>
      <td className="p-2">
        {manual ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="kimlik"
              className="h-8 w-28 font-mono text-xs"
            />
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="kategori adı"
              className="h-8 w-56 text-xs"
            />
            {dirty && id.trim() && (
              <Button
                size="sm"
                className="h-8"
                onClick={() => onSave(id.trim(), name.trim() || null)}
              >
                Kaydet
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {current ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="truncate">{current.categoryName || current.categoryId}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {current.categoryId}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">eşlenmedi</span>
            )}
            <CategorySearch
              channelId={channelId}
              label={current ? "Değiştir" : "Kategori seç"}
              onPick={(categoryId, categoryName) => {
                setId(categoryId);
                setName(categoryName);
                onSave(categoryId, categoryName);
              }}
            />
          </div>
        )}
      </td>
      <td className="p-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => setManual(v => !v)}
        >
          {manual ? "Aramaya dön" : "Elle gir"}
        </Button>
      </td>
    </tr>
  );
}

/** Pazaryerinin kendi kategori ağacında canlı arama. */
function CategorySearch({
  channelId,
  label,
  onPick,
}: {
  channelId: number;
  label: string;
  onPick: (categoryId: string, categoryName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = trpc.katalog.channelCategoryTree.useQuery(
    { channelId, query },
    { enabled: open && channelId > 0, retry: false },
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="ml-auto h-8 shrink-0 text-xs">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[32rem] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Kategori ara (örn. airbrush, rötuş, 3d)…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
              </div>
            )}
            {error && <div className="p-4 text-sm text-destructive">{error.message}</div>}
            {!isLoading && !error && <CommandEmpty>Sonuç yok.</CommandEmpty>}
            <CommandGroup heading={data ? `${data.total} kategori` : undefined}>
              {(data?.results ?? []).map(c => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onPick(c.id, c.name);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.path}</div>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {c.id}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
