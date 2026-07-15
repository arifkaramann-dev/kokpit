import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

/**
 * Bildirim merkezi zili: zamanlayıcı/nöbetçi bildirimleri (yeni sipariş,
 * kritik stok, sabah brifingi, senkron hatası) burada listelenir.
 * Mikrofon butonunun üstünde sabit durur; okunmamış sayısı rozetle gösterilir.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: unread } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: items } = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  const markRead = trpc.notifications.markRead.useMutation({
    onSettled: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSettled: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const count = unread ?? 0;

  function openItem(item: { id: number; status: string; link: string | null }) {
    if (item.status === "unread") markRead.mutate({ id: item.id });
    if (item.link) {
      setLocation(item.link);
      setOpen(false);
    }
  }

  function timeAgo(value: string | Date): string {
    const t = new Date(value).getTime();
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return "şimdi";
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} sa önce`;
    return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Bildirimler"
          className="fixed bottom-24 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-lg transition-all hover:bg-accent"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Bildirimler</span>
          {count > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Tümünü okundu say
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!items || items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Henüz bildirim yok. Yeni sipariş, kritik stok ve sabah brifingi buraya düşer.
            </p>
          ) : (
            items.map(item => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/40"
              >
                <div className="flex items-center gap-2">
                  {item.status === "unread" && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                  <span className={`flex-1 truncate text-sm ${item.status === "unread" ? "font-semibold" : ""}`}>
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {timeAgo(item.createdAt as unknown as string)}
                  </span>
                </div>
                {item.body && (
                  <span className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                    {item.body}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
