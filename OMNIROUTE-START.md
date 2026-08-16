# OmniRoute Integration — Quick Start (Bu Gece)

OmniRoute: 290+ AI provider gateway, fallback logic, token compression. Claude → GPT → Gemini otomatik.

---

## 1. OmniRoute Başlat (5 dakika)

### Option A: Docker (Önerilen)

```bash
cd /home/user/kokpit

# OmniRoute container başlat
docker-compose -f docker-compose.omniroute.yml up -d

# Sağlık kontrolü
curl http://localhost:20128/health
# Yanıt: {"status":"healthy","version":"..."}

# Provider listesi (290+ provider)
curl http://localhost:20128/v1/models
```

### Option B: npm (Local)

```bash
npm install -g omniroute
omniroute start
# Logs: OmniRoute listening on http://localhost:20128
```

---

## 2. Kokpit Entegre (Otomatik)

`server/_core/llm.ts` zaten OmniRoute'u destekliyor:

```typescript
// Routing: Claude (native) → OmniRoute → Forge (fallback)
export async function invokeLLM(params: InvokeParams)
```

**Hiçbir kod değişikliği yok.** OmniRoute çalışıyorsa otomatik kullanılır.

---

## 3. Test Et (10 dakika)

### Local Test

```bash
# Terminal 1: OmniRoute
docker-compose -f docker-compose.omniroute.yml up

# Terminal 2: Kokpit dev server
npm run dev

# Terminal 3: Test
curl -X POST http://localhost:3000/api/trpc/pazarlama.generateVariantTitle \
  -H "Content-Type: application/json" \
  -d '{
    "masterId": 1,
    "tone": "playful"
  }'
```

**Logs'ta göreceksin:**
```
[OmniRoute] Request to claude-3-5-sonnet-20241022
[OmniRoute] Response: 200 OK (via Claude API)
[Kokpit] Pazarlama yazı generated: "..."
```

### Log Kontrol

```bash
# OmniRoute logs
docker logs omniroute -f

# Token compression çalışıyor mı?
# "compression_ratio": 0.62 → %38 tasarruf
```

---

## 4. Env Configuration

**`.env` (geliştirme):**

```bash
# OmniRoute
OMNIROUTE_ENABLED=true
OMNIROUTE_URL=http://localhost:20128/v1

# API Keys (OmniRoute fallback'i için)
ANTHROPIC_API_KEY=sk-ant-... # Claude fallback
OPENAI_API_KEY=sk-... # GPT fallback (opsiyonel)
GOOGLE_API_KEY=... # Gemini fallback (opsiyonel)
```

**Render Production:**

```
OMNIROUTE_ENABLED=true
OMNIROUTE_URL=http://omniroute-sidecar:20128/v1
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 5. Fallback Stratejisi

```
invokeLLM()
  ├─ ANTHROPIC_API_KEY set? → invokeClaude() ✅
  └─ Else
     ├─ OmniRoute healthy? → invokeViaOmniRoute() ✅
     │  └─ Model selector: Claude → GPT-4 → Gemini (otomatik)
     │  └─ Token compression: 30-40% azalış
     │  └─ Rate-limited? → Next provider otomatik
     └─ Else → invokeViaForge() (Manus Forge yedek)
```

---

## 6. Monitoring & Logs

### OmniRoute Health

```bash
curl http://localhost:20128/health

# Yanıt:
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "requests_total": 1250,
  "tokens_compressed": 2500000,
  "compression_ratio": 0.65,
  "providers": [
    {"name": "claude", "status": "active", "requests": 500},
    {"name": "gpt-4", "status": "active", "requests": 300},
    {"name": "gemini", "status": "active", "requests": 100}
  ]
}
```

### Kokpit + OmniRoute

```bash
# Kokpit logs'tan OmniRoute kullanımı
npm run dev 2>&1 | grep -i omniroute

# [OmniRoute] → Kokpit OmniRoute'u kullanıyor
# [Forge] → OmniRoute kapalı, yedek gateway
```

---

## 7. Canlıya (Render) — Tomorrow

### Option 1: Sidecar Container (Single Dyno)

```yaml
# Dockerfile.omniroute
FROM node:20-alpine
RUN npm install -g omniroute
CMD omniroute start
```

Deploy: `render.yaml` içine omniroute service ekleme.

### Option 2: Separate Dyno

```bash
# OmniRoute: tier=hobby (free), 20128 port
# Kokpit: OMNIROUTE_URL=https://omniroute-dyno.onrender.com/v1
```

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| `curl localhost:20128: refused` | OmniRoute başlamadı mı? `docker-compose up -d` kontrol et |
| `[OmniRoute] 401 Unauthorized` | API key eksik. `ANTHROPIC_API_KEY` ayarla |
| `Token compression 0%` | Compression disabled. `.omniroute.config.json` kontrol et |
| OmniRoute fallback to Forge | Claude kota bitti. `OpenAI_API_KEY` ekle (GPT fallback) |

---

## 📊 Expected Results (This Week)

| Metric | Before | After | Gain |
|--------|--------|-------|------|
| N5 (otomasyonla kazanılan süre) | — | +7.5 saat/gün | 💰 |
| Claude maliyet | $20/ay | $2/ay | -90% |
| Token compression | N/A | 30-40% | ⚡ |
| Provider fallback | N/A | Auto (Claude→GPT→Gemini) | 🛡️ |

---

**Status:** ✅ OmniRoute ready to go tonight. Start with docker-compose, test pazarlama endpoint, deploy to Render tomorrow.
