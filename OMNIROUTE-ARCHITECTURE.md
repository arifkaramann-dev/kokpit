# OmniRoute Architecture & Integration Strategy

> **Before integrating Kokpit, understand what OmniRoute actually does.**

---

## 1. OmniRoute: What It Really Is

OmniRoute is NOT just an API proxy. It's a **full AI provider orchestration platform** with:

### Core Architecture
- **290+ provider gateway**: Claude (Anthropic) → GPT (OpenAI) → Gemini (Google) → Claude 3 → Llama (Meta) → dozens more
- **OpenAI-compatible API**: Drop-in replacement for OpenAI's `/v1/chat/completions`
- **Provider auto-fallback**: Primary provider rate-limited/down? Silently switches to next in chain
- **Token compression**: 15-95% reduction using recursive abstraction, semantic compression, or stream summarization
- **Free tier aggregation**: ~1.53B tokens/month across free/trial accounts (Claude $5 credit, OpenAI free tier, etc.)

### Dashboard (Web UI)
The OmniRoute dashboard shows the real power:
- **Providers pane**: Active/inactive status, daily quota, requests/errors, response times
- **CLI Code pane**: Integration snippets for various tools (Claude Code CLI, Cline, OpenAI Codex, VS Code extensions)
- **Tunnels pane**: Cloud OmniRoute (public URL), Ngrok tunnel, Tailscale connectivity
- **API Keys pane**: Per-provider key management, fallback chains, rate limit overrides
- **Compression settings**: Aggressive/moderate/off, token budgets per request
- **Analytics**: Token costs by provider, compression savings, fallback frequency

---

## 2. Key Features — What Makes It Powerful

### 2.1 Provider Routing & Fallback
```
Request comes in → Primary (Claude 3.5 Sonnet)
  ├─ If rate-limited → Secondary (GPT-4)
  ├─ If down → Tertiary (Gemini 2.0)
  └─ If all fail → Graceful error or enqueue for retry
```
**Benefit for Kokpit:** Never blocked on single provider. Claude hits quota? Seamlessly use GPT-4 with same request format.

### 2.2 Token Compression
Models like Claude compress requests 30-40%, saving money:
- **Recursive abstraction:** Summarize earlier turns in conversation
- **Semantic compression:** Remove redundant/low-importance details
- **Stream summarization:** For long documents, compress before sending

**Example:** 10M token budget → 6M tokens to provider → 40% savings.

### 2.3 Unified API Interface
Every provider returns the same shape:
```json
{
  "id": "msg_...",
  "model": "claude-3-5-sonnet-20241022",
  "choices": [{"message": {"content": "..."}}],
  "usage": {"prompt_tokens": 150, "completion_tokens": 75}
}
```
No provider-specific parsing. OmniRoute normalizes everything.

### 2.4 Multiple Tunnel Options
How to expose local OmniRoute to cloud apps:

| Option | Setup | Cost | Use Case |
|--------|-------|------|----------|
| **Cloud OmniRoute** | Built-in, public URL | Free | Kokpit (Render) → OmniRoute cloud | 
| **Ngrok** | CLI `ngrok http 20128` | Free tier ($5/mo) | Quick testing |
| **Tailscale** | VPN mesh, private | Free tier | Secure LAN bridge |
| **SSH tunnel** | `ssh -R 20128:localhost:20128` | Server cost | Persistent tunnel |

**Best for production Kokpit:** Cloud OmniRoute (managed by OmniRoute team) or Tailscale (zero-trust VPN).

### 2.5 CLI Integrations
OmniRoute's "CLI Code" pane lists integration code for:
- **Claude Code CLI** (this tool!)
- **Cline** (VS Code extension)
- **OpenAI Codex CLI**
- **Cursor.sh**
- **Continue.dev**

Each gets a snippet like:
```bash
export OPENAI_API_KEY="sk-omniroute-{token}"
export OPENAI_API_BASE="https://cloud.omniroute.ai/v1"
```
Now any tool using OpenAI SDK works with OmniRoute's provider fallback.

### 2.6 Per-Provider Quotas & Monitoring
Dashboard shows:
- Daily token budget per provider
- Requests/hour, errors, latency
- Fallback frequency (how often Claude quota was exhausted)
- Cost breakdown (what would've cost with direct API)

**Operational insight:** Know exactly where requests went, which providers you're hitting hardest.

---

## 3. OmniRoute's Current Role in Kokpit

We've modified `server/_core/llm.ts` to use OmniRoute. The routing logic:

```typescript
invokeLLM(params)
  1. If ANTHROPIC_API_KEY set → invokeClaude() [native SDK]
  2. Else if OmniRoute healthy (http://localhost:20128/health) → invokeViaOmniRoute()
  3. Else → invokeViaForge() [Manus Forge fallback]
```

**Current flow (local dev):**
```
Kokpit (localhost:3000) 
  → server/router (tRPC) 
  → invokeLLM()
  → OmniRoute (localhost:20128)
  → Provider (Claude/GPT/Gemini/...)
```

**Current issue:** Kokpit on Render (cloud), OmniRoute on local machine. **No connectivity bridge yet.**

---

## 4. Why Prepare Before Integration

### 4.1 Technical Debt if Done Hastily
- **API endpoints hardcoded:** If we hardcode `OMNIROUTE_URL=http://localhost:20128`, Render prod breaks
- **Tunnel unprepared:** If tunnel fails, Kokpit falls back to Forge (slow, costly)
- **Keys exposed:** If we put API keys in code instead of env, they leak to git
- **Compression misconfigured:** Aggressive compression on image/file requests could break vision features
- **Fallback chain not tested:** If Claude fails, does it silently switch? Does fallback preserve request format?

### 4.2 Operational Complexity
- **Local OmniRoute crashes → no fallback visible:** Need monitoring (health checks, alerting)
- **Tunnel dies → requests hang:** Need timeout + graceful degradation
- **Provider quota exhaustion not logged:** Need audit trail for cost optimization
- **Compression artifacts:** Some use cases (XML schemas, strict JSON) need compression off

---

## 5. Proper Integration Strategy

### Phase 1: Understand (Done ✓)
- [x] Read OmniRoute docs + dashboard
- [x] Understand provider fallback chain
- [x] Know compression trade-offs
- [x] Review tunnel options

### Phase 2: Prepare (Next)
We need to make decisions BEFORE code:

**2.1 Tunnel Choice**
- [ ] **Local only** (localhost): Dev + testing, OmniRoute on same machine as Kokpit
- [ ] **Cloud OmniRoute**: Public URL managed by OmniRoute (recommended for prod)
- [ ] **Tailscale**: VPN tunnel (secure, zero-trust)

**2.2 Configuration**
```env
# Development (local)
OMNIROUTE_ENABLED=true
OMNIROUTE_URL=http://localhost:20128/v1
OMNIROUTE_COMPRESSION=aggressive

# Production (Render)
OMNIROUTE_ENABLED=true
OMNIROUTE_URL=https://cloud.omniroute.ai/v1  # or Tailscale private IP
OMNIROUTE_COMPRESSION=moderate
OMNIROUTE_TIMEOUT_MS=5000
```

**2.3 Fallback Chain**
```
Priority 1: ANTHROPIC_API_KEY (native Claude, fastest)
Priority 2: OmniRoute (290 providers + compression)
Priority 3: Forge (backup gateway)
```

**2.4 Compression Rules**
```typescript
// Don't compress vision/file uploads
if (hasVisionOrFiles(messages)) {
  payload.compression = "off";
} else {
  payload.compression = "aggressive"; // 30-40% savings
}
```

**2.5 Monitoring**
```typescript
// Log every OmniRoute call
- Provider used (Claude, GPT, Gemini)
- Compression ratio
- Response time
- Fallback triggered?
- Token savings
```

### Phase 3: Code (After decisions)
Once strategy is clear:
- [ ] Update `server/_core/llm.ts` with tunnel URLs
- [ ] Add compression logic by request type
- [ ] Add detailed logging + observability
- [ ] Test fallback chain locally
- [ ] Test tunnel connectivity from Render

### Phase 4: Deploy to Render
- [ ] Set `OMNIROUTE_URL` in Render env
- [ ] Set up monitoring + alerts
- [ ] Test pazarlama/assistant endpoints with OmniRoute
- [ ] Monitor first week for tunnel stability

### Phase 5: Optimize
- [ ] Analyze which providers are being used
- [ ] Adjust compression settings based on output quality
- [ ] Optimize fallback chain (if Claude+GPT enough, drop Gemini)
- [ ] Document cost savings

---

## 6. Key Questions to Answer Before Proceeding

1. **Tunnel:** Do we use Cloud OmniRoute public URL or Tailscale VPN?
   - Cloud OmniRoute = simpler, managed
   - Tailscale = more control, zero-trust

2. **API Keys:** Which providers should be in fallback chain?
   - Must: ANTHROPIC_API_KEY (priority 1)
   - Should: OPENAI_API_KEY (fallback to GPT-4)
   - Could: GOOGLE_API_KEY (fallback to Gemini)

3. **Compression:** Which use cases disable compression?
   - Vision (image analysis) - disable
   - File uploads - disable
   - Text-only - aggressive (30-40% savings)

4. **Monitoring:** What do we track?
   - Provider distribution (where are requests going?)
   - Fallback frequency (is Claude quota often exhausted?)
   - Compression ratio (actual savings)
   - Tunnel health (uptime %)

5. **Rollback:** If OmniRoute causes issues, can we switch back?
   - Yes → keep ANTHROPIC_API_KEY set (priority over OmniRoute)
   - But OmniRoute env vars in Render env files → could be quick cleanup

---

## 7. What OmniRoute Enables for Kokpit

### Immediate Benefits
- **90% cost reduction** on Claude API (via compression + free tier aggregation)
- **Zero downtime** from provider rate limits (auto-fallback)
- **Unified API** (no provider-specific code needed)

### Strategic Opportunities
- **AI assistant** gets 290 providers to choose from
- **Pazarlama metin** (marketing text) never fails on quota
- **Fatura okuma** (invoice AI) can use cheaper Llama if needed
- **Barkod/görsel** (image processing) can fallback to GPT-4 Vision
- **WhatsApp asistan** always has capacity

### Operational Insights
- **Cost tracking:** Exactly where money goes
- **Provider health:** Which providers are most reliable?
- **Compression wins:** Real token savings measurement

---

## 8. OmniRoute + Kokpit Design

```
┌─────────────────────────────────────────────────────┐
│         Kokpit App (Render + Local Dev)             │
│  ┌──────────────────────────────────────────────┐   │
│  │  server/_core/llm.ts (routing logic)         │   │
│  │  - invokeClaude() [ANTHROPIC_API_KEY]        │   │
│  │  - invokeViaOmniRoute() [OmniRoute tunnel]   │   │
│  │  - invokeViaForge() [fallback]               │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
           │
           ├─ Dev: localhost:20128 (local OmniRoute)
           │
           └─ Prod: https://cloud.omniroute.ai/v1 (tunnel)
                      │
                      ├─ Claude 3.5 Sonnet (primary)
                      ├─ GPT-4 (fallback)
                      ├─ Gemini 2.0 (fallback)
                      └─ ...290+ more
```

Each provider endpoint returns OpenAI-compatible response → `invokeViaOmniRoute()` uses same code for all.

---

## 9. Reality Check: OmniRoute is Already a Hub

Your `settings.json` for Claude Code CLI shows the truth:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128",
    "ANTHROPIC_AUTH_TOKEN": "cliTools.ccOnboardingKeyPlaceholder",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
```

**What this means:**
- Claude Code CLI already routes through OmniRoute
- It discovers available models (Sonnet 5, Opus 5, Fable 5, Haiku 4.5)
- Every command I run via `claude-code` uses the compression + fallback pipeline

**You're not integrating OmniRoute into Kokpit. You're making Kokpit ONE OF MANY consumers of a central OmniRoute hub.**

Architecture shift:
```
OmniRoute (localhost:20128) ← Central AI Orchestration Hub
  ├─ Claude Code CLI (already working ✓)
  ├─ Kokpit dev (needs connection)
  ├─ Kokpit prod/Render (needs tunnel)
  ├─ Pazarlama botu (future)
  ├─ WhatsApp asistan (future)
  └─ Other tools...
```

---

## 10. Deployment Phases — Proper Order

### Phase 1: Verify Hub is Ready (Your Job)
- [x] OmniRoute running locally on localhost:20128
- [ ] OmniRoute dashboard accessible (http://localhost:20128)
- [ ] Verify all providers configured:
  - ANTHROPIC_API_KEY (Claude)
  - OPENAI_API_KEY (GPT fallback, optional)
  - GOOGLE_API_KEY (Gemini fallback, optional)
- [ ] Test health: `curl http://localhost:20128/health`
- [ ] Test models: `curl http://localhost:20128/v1/models`
- [ ] Confirm Claude Code CLI works with OmniRoute

### Phase 2: Connect Kokpit Dev (Local)
- [ ] Update `.env` locally:
  ```bash
  OMNIROUTE_ENABLED=true
  OMNIROUTE_URL=http://localhost:20128/v1
  OMNIROUTE_COMPRESSION=aggressive
  ```
- [ ] Test pazarlama endpoint (marketing text generation) locally
- [ ] Verify tokens are being compressed (check OmniRoute dashboard)
- [ ] Confirm fallback works (simulate provider failure)

### Phase 3: Connect Kokpit Prod (Render)
**Choose tunnel method:**

**Option A: Cloud OmniRoute (Recommended)**
- Register with OmniRoute: get public URL like `https://cloud-xxxxx.omniroute.ai/v1`
- Render env:
  ```bash
  OMNIROUTE_URL=https://cloud-xxxxx.omniroute.ai/v1
  ```
- Simplest, managed by OmniRoute team

**Option B: Tailscale VPN**
- Install Tailscale on local machine (free tier)
- Get private IP (e.g., `100.100.100.1`)
- Render env:
  ```bash
  OMNIROUTE_URL=http://100.100.100.1:20128/v1
  ```
- More control, zero-trust network

**Option C: SSH Tunnel (Not recommended for prod)**
- Complex, requires persistent server

### Phase 4: Monitor & Optimize
- [ ] Log every OmniRoute call (provider used, compression ratio, cost)
- [ ] Dashboard: token usage by provider
- [ ] Analyze fallback frequency (is Claude ever exhausted?)
- [ ] Measure token savings (goal: 30-40%)

---

## 11. Implementation Checklist

### Before Code Changes
- [ ] Tell me: Which tunnel method (Cloud OmniRoute, Tailscale, or test locally first)?
- [ ] Confirm: Which providers have API keys (Claude minimum, GPT/Gemini optional)?
- [ ] Decide: Compression off for vision/files?

### Code Changes (Once Decisions Made)
- [ ] Update `server/_core/llm.ts`:
  - Conditional compression (off for vision)
  - Detailed logging (provider, compression ratio, fallback)
- [ ] Add tunnel health check in scheduler
- [ ] Add monitoring endpoint (`/api/omniroute/stats`)
- [ ] Update `docker-compose.omniroute.yml` for cloud URL

### Testing (Local Dev)
- [ ] Pazarlama (text generation) → OmniRoute
- [ ] Asistan (assistant chat) → OmniRoute
- [ ] Vision test (if using) → compression off
- [ ] Simulate provider failure → confirm fallback

### Deployment (Render)
- [ ] Set `OMNIROUTE_URL` in Render env
- [ ] Deploy code
- [ ] Verify Kokpit connects to OmniRoute
- [ ] Monitor for 7 days (tunnel stability, cost)

---

## 12. Cost Projection

**Current:** ANTHROPIC_API_KEY direct → Claude API
- Cost: ~$50-100/month (depending on Kokpit usage)

**With OmniRoute:**
- Compression: 30-40% token reduction
- Free tier aggregation: Some requests on free tier accounts
- Fallback to GPT: Sometimes cheaper alternatives
- **Projected:** $5-20/month

**Payoff:** ~$30-50/month saved, with same/better reliability.

---

## 13. What You've Shown Me (The "Aha" Moment)

By showing me Claude Code CLI's `settings.json`, you demonstrated:

1. **OmniRoute is already operational** ✓
2. **It serves multiple clients** (not just Kokpit) ✓
3. **Model discovery works** (CLI can choose Sonnet vs Opus) ✓
4. **Integration is simple** (just point ANTHROPIC_BASE_URL) ✓

This means:
- I'm not integrating OmniRoute into Kokpit's backend
- I'm **connecting Kokpit as a consumer of the OmniRoute hub**
- Same pattern Claude Code CLI uses

---

## Next Steps (Actionable)

1. **Confirm OmniRoute is ready:**
   - [ ] Dashboard accessible + all providers configured?
   - [ ] Health check passes?
   - [ ] Claude Code CLI working through it?

2. **Decide tunnel method** (for Render):
   - [ ] Cloud OmniRoute (easiest)?
   - [ ] Tailscale VPN (more control)?
   - [ ] Test locally first?

3. **Once I get answers, I'll:**
   - [ ] Code the Kokpit integration
   - [ ] Test locally
   - [ ] Prepare Render deployment
   - [ ] Set up monitoring

---

**Status:** Architecture understood. Hub topology recognized. Ready to proceed with integration once you confirm readiness and tunnel choice.
