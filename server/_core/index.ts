import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerLocalAuthRoutes } from "./localAuth";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { registerImageRoutes } from "../images";
import { startScheduler } from "../scheduler";
import { startWhatsappBridge, getWhatsappQrView } from "../whatsapp";
import { refreshMarketplaceCredentials } from "../marketplaceCredentials";
import { sdk } from "./sdk";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

/** WhatsApp QR sayfası için basit, bağımsız HTML kabuğu (auto-refresh opsiyonlu). */
function waPage(title: string, body: string, refresh: boolean): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="4">' : ""}
<title>${title} — Kokpit WhatsApp</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;
    display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;padding:24px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;max-width:420px;text-align:center}
  h1{font-size:20px;margin:0 0 12px}
  p{line-height:1.5;color:#cbd5e1;font-size:15px}
  a{color:#38bdf8}
  code{background:#0f172a;padding:2px 6px;border-radius:6px}
  .qr{background:#fff;padding:12px;border-radius:12px;display:inline-block;margin:16px 0}
  .qr svg{display:block;width:280px;height:280px}
  .hint{font-size:13px;color:#94a3b8}
</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Temel güvenlik başlıkları (Faz 0 güvenlik paketi). Ürün görselleri
  // (/api/img) pazaryeri/web sitesine servis edildiğinden CORP'a dokunmuyoruz.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);
  registerImageRoutes(app);
  // Health check for hosting platforms (Render, Railway, uptime monitors).
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  // WhatsApp köprüsü QR sayfası: telefondan "Bağlı Cihazlar > Cihaz Bağla" ile
  // okutmak için. Panele giriş yapmış olmak gerekir (auth cookie). Render
  // loglarındaki ASCII QR yerine tarayıcıda temiz okutulur; bağlanınca kendini yeniler.
  app.get("/api/whatsapp/qr", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res
        .status(401)
        .type("html")
        .send(waPage("Önce panele giriş yap", "<p>QR'ı görmek için önce Kokpit'e giriş yapmalısın. <a href='/'>Girişe git</a>, sonra bu sayfayı yenile.</p>", false));
      return;
    }
    try {
      const { enabled, connected, svg } = await getWhatsappQrView();
      if (!enabled) {
        res.type("html").send(waPage("WhatsApp köprüsü kapalı", "<p><code>WHATSAPP_ENABLED=1</code> ortam değişkenini ekleyip yeniden deploy et.</p>", false));
        return;
      }
      if (connected) {
        res.type("html").send(waPage("Bağlandı ✔", "<p>WhatsApp köprüsü bağlı. Telefonunda <b>Kendine mesaj</b> sohbetine komut yazıp deneyebilirsin.</p>", false));
        return;
      }
      if (!svg) {
        res.type("html").send(waPage("QR hazırlanıyor…", "<p>Birkaç saniye içinde QR görünecek. Sayfa kendini yeniliyor.</p>", true));
        return;
      }
      res.type("html").send(
        waPage(
          "WhatsApp'a bağla",
          `<p>Telefonunda <b>WhatsApp &gt; Ayarlar &gt; Bağlı Cihazlar &gt; Cihaz Bağla</b> deyip bu QR'ı okut:</p><div class="qr">${svg}</div><p class="hint">Bağlanınca bu sayfa otomatik güncellenir.</p>`,
          true,
        ),
      );
    } catch {
      res.status(500).type("html").send(waPage("Hata", "<p>QR üretilemedi. Logları kontrol et.</p>", true));
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Uygulama içi girilen pazaryeri anahtarlarını (DB) env üzerine bindir.
  // DB erişilemezse sessizce env varsayılanlarıyla devam eder.
  await refreshMarketplaceCredentials().catch(() => {});

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Faz 1 zamanlayıcısı: oto-senkron + stok nöbetçisi + sabah brifingi.
    startScheduler();
    // WhatsApp bağlı-cihaz köprüsü (WHATSAPP_ENABLED=1 ise): gelen mesaj → asistan
    // beyni → taslak sipariş + onay. Kapalıysa/hatada sessiz; sunucuyu düşürmez.
    void startWhatsappBridge();
  });
}

startServer().catch(console.error);
