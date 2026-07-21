import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Session expired mid-use: reload so DashboardLayout shows the login form.
  // Protected queries only run while authenticated, so this cannot loop.
  window.location.reload();
};

// Kullanıcıya görünür genel hata bildirimi: sayfa kendi onError'ını tanımlamadıysa
// hata sessiz kalmasın. Oturum hatası toast yerine girişe yönlendirir.
const errorToast = (error: unknown, id: string) => {
  if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) return;
  const message = error instanceof Error && error.message ? error.message : "Beklenmeyen bir hata oluştu";
  toast.error("İşlem başarısız", { description: message, id });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
    // Aynı sorgu için tek toast (id ile tekilleştirilir) — yeniden denemelerde üst üste binmez.
    errorToast(error, `q:${event.query.queryHash}`);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    // Sayfanın kendi onError'ı varsa çifte bildirim yapma.
    if (!event.mutation.options.onError) errorToast(error, `m:${event.mutation.mutationId}`);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// PWA: service worker yalnızca üretimde kaydedilir (dev'de Vite HMR ile çakışır).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW kaydolmazsa uygulama normal çalışmaya devam eder */
    });
  });
}
