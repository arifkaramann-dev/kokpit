import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Circle, ListChecks, ShoppingBasket, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const KINDS = [
  { key: "eksik", label: "Eksik Listesi", icon: ShoppingBasket, hint: "Alınacaklar — bitince işaretle" },
  { key: "gorev", label: "Görevler", icon: ListChecks, hint: "Yapılacak işler" },
] as const;

/**
 * Görevler & Eksikler: elle buradan, sesli komutla veya WhatsApp'tan yönetilir
 * ("eksik listesine ekle...", "bugün neler alınacaktı?", "X aldım").
 */
export default function Tasks() {
  const utils = trpc.useUtils();
  const { data: tasks } = trpc.tasks.list.useQuery();
  const [kind, setKind] = useState<"eksik" | "gorev">("eksik");
  const [title, setTitle] = useState("");

  const invalidate = () => utils.tasks.list.invalidate();
  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      invalidate();
      setTitle("");
    },
    onError: e => toast.error(e.message),
  });
  const setStatus = trpc.tasks.setStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });
  const remove = trpc.tasks.delete.useMutation({ onSuccess: () => invalidate() });

  const active = KINDS.find(k => k.key === kind)!;
  const list = (tasks ?? []).filter(t => t.kind === kind);
  const open = list.filter(t => t.status === "open");
  const done = list.filter(t => t.status === "done");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Görevler & Eksikler</h1>
        <p className="text-sm text-muted-foreground">
          Elle buradan ekle veya WhatsApp/sesli komutla: "Eksik listesine ekle: beyaz pigment" ·
          "Bugün neler alınacaktı?" · "Beyaz pigment aldım"
        </p>
      </div>

      <div className="flex gap-1.5">
        {KINDS.map(k => (
          <button
            key={k.key}
            onClick={() => setKind(k.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              kind === k.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <k.icon className="h-3.5 w-3.5" /> {k.label}
          </button>
        ))}
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={kind === "eksik" ? "Alınacak şey... (örn. beyaz pigment 10 kg)" : "Yapılacak iş..."}
            onKeyDown={e => {
              if (e.key === "Enter" && title.trim()) create.mutate({ kind, title: title.trim() });
            }}
          />
          <Button
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate({ kind, title: title.trim() })}
          >
            Ekle
          </Button>
        </div>

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            {kind === "eksik" ? "Eksik yok — liste boş 🎉" : "Açık görev yok 🎉"}
          </p>
        ) : (
          <div className="space-y-1">
            {open.map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                <button
                  onClick={() => setStatus.mutate({ id: t.id, status: "done" })}
                  aria-label="Tamamlandı işaretle"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Circle className="h-4.5 w-4.5" />
                </button>
                <p className="flex-1 text-sm">{t.title}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate({ id: t.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Tamamlananlar ({done.length})</p>
            {done.slice(0, 15).map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg p-2 opacity-60">
                <button
                  onClick={() => setStatus.mutate({ id: t.id, status: "open" })}
                  aria-label="Geri aç"
                  className="text-emerald-600"
                >
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </button>
                <p className="flex-1 text-sm line-through">{t.title}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate({ id: t.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{active.hint}</p>
      </Card>
    </div>
  );
}
