#!/usr/bin/env node
// Art of Colour — Render yardımcı aracı (Render API köprüsü)
//
// Render panelindeki işlemleri komut satırından yapmak için: deploy tetikle,
// deploy durumunu izle, canlı logları oku, ortam değişkenlerini yönet.
//
// Gerekli ortam değişkenleri (repoya ASLA girmez — Render Environment'ta durur):
//   RENDER_API_KEY   → Render → Account Settings → API Keys → Create API Key
//   RENDER_SERVICE_ID → (opsiyonel) "srv-..." kimliği; verilmezse servis adı
//                        (RENDER_SERVICE_NAME, varsayılan "artofcolour-kokpit")
//                        üzerinden otomatik bulunur.
//
// Kullanım:
//   node scripts/render.mjs services            # erişilebilir servisleri listele
//   node scripts/render.mjs deploy [--clear-cache]
//   node scripts/render.mjs status              # son deploy'un durumu
//   node scripts/render.mjs watch               # deploy bitene kadar izle
//   node scripts/render.mjs deploy:watch        # tetikle + bitene kadar izle
//   node scripts/render.mjs logs [--tail 100]   # son logları getir
//   node scripts/render.mjs env                 # env değişkenlerini listele (değerler maskeli)
//   node scripts/render.mjs env:get KEY
//   node scripts/render.mjs env:set KEY=VALUE [KEY2=VALUE2 ...]
//   node scripts/render.mjs env:unset KEY [KEY2 ...]
//
// Not: env:set/env:unset ilgili servisi otomatik yeniden deploy eder (Render davranışı).

const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_NAME = process.env.RENDER_SERVICE_NAME || "artofcolour-kokpit";

function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

const HELP_CMDS = new Set([undefined, "help", "-h", "--help"]);

function requireKey() {
  if (!KEY) {
    die(
      "RENDER_API_KEY tanımlı değil.\n" +
        "  Render → Account Settings → API Keys → Create API Key ile bir anahtar üret,\n" +
        "  sonra:  RENDER_API_KEY=rnd_xxx node scripts/render.mjs <komut>\n" +
        "  (Anahtarı repoya koyma; kalıcı için Render Environment'a ekle.)",
    );
  }
}

async function api(path, { method = "GET", body, query } = {}) {
  let url = `${API}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && data.message ? data.message : text || res.statusText;
    die(`Render API ${res.status}: ${detail}`);
  }
  return data;
}

// Servis kimliğini bul: RENDER_SERVICE_ID > isimle arama.
let _serviceId = process.env.RENDER_SERVICE_ID || null;
async function serviceId() {
  if (_serviceId) return _serviceId;
  const list = await api("/services", { query: { limit: "100" } });
  const items = Array.isArray(list) ? list.map((x) => x.service || x) : [];
  const match = items.find((s) => s.name === SERVICE_NAME);
  if (!match) {
    const names = items.map((s) => s.name).join(", ") || "(hiç yok)";
    die(
      `"${SERVICE_NAME}" adlı servis bulunamadı.\n` +
        `  Erişilebilir servisler: ${names}\n` +
        `  RENDER_SERVICE_ID ver ya da RENDER_SERVICE_NAME'i düzelt.`,
    );
  }
  _serviceId = match.id;
  return _serviceId;
}

function mask(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}••••${s.slice(-2)} (${s.length} karakter)`;
}

function fmtTime(t) {
  if (!t) return "-";
  try {
    return new Date(t).toLocaleString("tr-TR");
  } catch {
    return t;
  }
}

// ---- Komutlar ----

async function cmdServices() {
  const list = await api("/services", { query: { limit: "100" } });
  const items = Array.isArray(list) ? list.map((x) => x.service || x) : [];
  if (!items.length) return console.log("Erişilebilir servis yok.");
  for (const s of items) {
    console.log(`• ${s.name}  [${s.id}]  ${s.type || ""}  ${s.suspended || ""}`);
  }
}

async function cmdDeploy(args) {
  const id = await serviceId();
  const clearCache = args.includes("--clear-cache");
  const body = clearCache ? { clearCache: "clear" } : {};
  const d = await api(`/services/${id}/deploys`, { method: "POST", body });
  console.log(`✔ Deploy tetiklendi: ${d.id}  (durum: ${d.status})`);
  return d;
}

async function latestDeploy(id) {
  const list = await api(`/services/${id}/deploys`, { query: { limit: "1" } });
  const items = Array.isArray(list) ? list.map((x) => x.deploy || x) : [];
  return items[0] || null;
}

async function cmdStatus() {
  const id = await serviceId();
  const d = await latestDeploy(id);
  if (!d) return console.log("Henüz deploy yok.");
  console.log(
    `Son deploy: ${d.id}\n  durum   : ${d.status}\n  başladı : ${fmtTime(
      d.createdAt,
    )}\n  bitti   : ${fmtTime(d.finishedAt)}\n  commit  : ${
      (d.commit && d.commit.message) || "-"
    }`,
  );
  return d;
}

const LIVE = new Set(["live", "deactivated"]);
const FAIL = new Set([
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_failed",
]);

async function watchDeploy(id, deployId) {
  const start = Date.now();
  const MAX_MS = 20 * 60 * 1000; // 20 dk emniyet sınırı
  let last = "";
  while (Date.now() - start < MAX_MS) {
    const d = deployId
      ? await api(`/services/${id}/deploys/${deployId}`)
      : await latestDeploy(id);
    if (!d) {
      await sleep(4000);
      continue;
    }
    if (d.status !== last) {
      console.log(`  … ${d.status}  (${fmtTime(new Date().toISOString())})`);
      last = d.status;
    }
    if (LIVE.has(d.status)) {
      console.log(`✔ Deploy tamam: ${d.status}`);
      return d;
    }
    if (FAIL.has(d.status)) {
      console.log(`✖ Deploy başarısız: ${d.status}`);
      console.log("  Loglara bak:  node scripts/render.mjs logs --tail 120");
      process.exitCode = 1;
      return d;
    }
    await sleep(5000);
  }
  die("Zaman aşımı: deploy 20 dakikada bitmedi.");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cmdWatch() {
  const id = await serviceId();
  const d = await latestDeploy(id);
  if (!d) return console.log("İzlenecek deploy yok.");
  console.log(`İzleniyor: ${d.id}`);
  return watchDeploy(id, d.id);
}

async function cmdDeployWatch(args) {
  const id = await serviceId();
  const d = await cmdDeploy(args);
  return watchDeploy(id, d.id);
}

async function cmdLogs(args) {
  const id = await serviceId();
  const i = args.indexOf("--tail");
  const limit = i >= 0 && args[i + 1] ? args[i + 1] : "100";
  // Render Logs API: /logs?ownerId=&resource=<serviceId>
  const svc = await api(`/services/${id}`);
  const ownerId = (svc.service || svc).ownerId || (svc.owner && svc.owner.id);
  const data = await api(`/logs`, {
    query: { ownerId, resource: id, limit, direction: "backward" },
  });
  const logs = (data && data.logs) || [];
  if (!logs.length) return console.log("Log bulunamadı (bu pencerede).");
  for (const l of logs.reverse()) {
    console.log(`${fmtTime(l.timestamp)}  ${l.message}`);
  }
}

async function cmdEnvList() {
  const id = await serviceId();
  const list = await api(`/services/${id}/env-vars`, { query: { limit: "100" } });
  const items = Array.isArray(list) ? list.map((x) => x.envVar || x) : [];
  if (!items.length) return console.log("Ortam değişkeni yok.");
  for (const e of items.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`${e.key.padEnd(28)} = ${mask(e.value)}`);
  }
}

async function cmdEnvGet(args) {
  const key = args[0];
  if (!key) die("Kullanım: env:get KEY");
  const id = await serviceId();
  const e = await api(`/services/${id}/env-vars/${encodeURIComponent(key)}`);
  const v = (e.envVar || e).value;
  console.log(`${key} = ${v}`);
}

async function cmdEnvSet(args) {
  if (!args.length) die("Kullanım: env:set KEY=VALUE [KEY2=VALUE2 ...]");
  const id = await serviceId();
  for (const pair of args) {
    const eq = pair.indexOf("=");
    if (eq < 0) die(`Geçersiz argüman: "${pair}" (KEY=VALUE bekleniyor)`);
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    await api(`/services/${id}/env-vars/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { value },
    });
    console.log(`✔ ${key} güncellendi (${mask(value)})`);
  }
  console.log("↻ Render bu değişiklikle servisi otomatik yeniden deploy edecek.");
}

async function cmdEnvUnset(args) {
  if (!args.length) die("Kullanım: env:unset KEY [KEY2 ...]");
  const id = await serviceId();
  for (const key of args) {
    await api(`/services/${id}/env-vars/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    console.log(`✔ ${key} silindi`);
  }
  console.log("↻ Render bu değişiklikle servisi otomatik yeniden deploy edecek.");
}

const HELP = `Art of Colour — Render yardımcı aracı

Komutlar:
  services                 Erişilebilir servisleri listele
  deploy [--clear-cache]   Yeni deploy tetikle
  status                   Son deploy'un durumunu göster
  watch                    Son deploy'u bitene kadar izle
  deploy:watch             Tetikle + bitene kadar izle
  logs [--tail N]          Son N log satırını getir (varsayılan 100)
  env                      Ortam değişkenlerini listele (değerler maskeli)
  env:get KEY              Bir değişkenin değerini göster
  env:set KEY=VALUE ...    Değişken(ler) ayarla
  env:unset KEY ...        Değişken(ler) sil

Ortam: RENDER_API_KEY (zorunlu), RENDER_SERVICE_ID veya RENDER_SERVICE_NAME (opsiyonel)`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!HELP_CMDS.has(cmd)) requireKey();
  switch (cmd) {
    case "services":
      return cmdServices();
    case "deploy":
      return cmdDeploy(args);
    case "status":
      return cmdStatus();
    case "watch":
      return cmdWatch();
    case "deploy:watch":
      return cmdDeployWatch(args);
    case "logs":
      return cmdLogs(args);
    case "env":
      return cmdEnvList();
    case "env:get":
      return cmdEnvGet(args);
    case "env:set":
      return cmdEnvSet(args);
    case "env:unset":
      return cmdEnvUnset(args);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      return console.log(HELP);
    default:
      die(`Bilinmeyen komut: "${cmd}"\n\n${HELP}`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
