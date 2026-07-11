import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

/** Şablon kütüphanesinden seçim: seçilen şablonun adı/içeriği alana doldurulur. */
export default function TemplatePicker({
  kind,
  onPick,
  placeholder = "Şablondan seç",
}: {
  kind: string;
  onPick: (t: { name: string; content: string | null }) => void;
  placeholder?: string;
}) {
  const { data } = trpc.templates.list.useQuery();
  const list = (data ?? []).filter(t => t.kind === kind);
  if (list.length === 0) return null;
  return (
    <Select
      value=""
      onValueChange={v => {
        const t = list.find(x => String(x.id) === v);
        if (t) onPick({ name: t.name, content: t.content });
      }}
    >
      <SelectTrigger className="h-7 w-auto min-w-36 text-xs text-muted-foreground">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map(t => (
          <SelectItem key={t.id} value={String(t.id)}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
