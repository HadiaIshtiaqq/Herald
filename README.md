# Herald — Release Concierge

> **Does your team have the certifications to ship this change safely?**
> Herald answers that question — automatically — every time a PR merges.

Herald is a multi-agent system that connects **code changes to team certification readiness**. When a PR merges, four coordinated agents reason about the change, assess whether the owning engineers hold the certifications those services require, generate AI-powered study plans for any gaps, and execute Microsoft 365 actions — all behind a human approval gate.

Built for the **Microsoft Agents League Hackathon @ AI Skills Fest 2026**, spanning all three tracks.

---

## Architecture

```
GitHub PR merged
       │ webhook (HMAC-verified)
       ▼
┌──────────────────────────────────────────────────────────┐
│                    Herald Orchestrator                     │
│                                                            │
│  ┌─────────────────┐   ┌─────────────────────────────┐   │
│  │ Reasoning Agent  │   │      Readiness Agent         │   │
│  │  Foundry IQ      │──▶│  Foundry IQ + Work IQ        │   │
│  │  Impact analysis │   │  Team cert assessment         │   │
│  └─────────────────┘   └─────────────────────────────┘   │
│           │                         │                      │
│           └────────────┬────────────┘                      │
│                        ▼                                    │
│           ┌─────────────────────────┐                      │
│           │    Generation Agent      │                      │
│           │  Changelog · Docs · NL   │                      │
│           └─────────────────────────┘                      │
│                        │  ← human approval gate             │
│                        ▼                                    │
│           ┌─────────────────────────┐                      │
│           │   Enterprise Agent       │                      │
│           │  Teams · SharePoint      │                      │
│           │  Outlook · Study Plans   │                      │
│           └─────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

---

## Hackathon Track Alignment

| Track | Required Tool | How Herald Uses It |
|---|---|---|
| 🎨 Creative Apps | GitHub Copilot | **Runtime Copilot Extension** — `@herald` commands in GitHub Copilot Chat (status, analyze, readiness); RSA-SHA256 signature verified; SSE streaming |
| 🧠 Reasoning Agents | Microsoft Foundry | 4-tier AI chain: Foundry Agent → Phi-4 Reasoning → Azure OpenAI → Gemini; impact analysis + cert readiness via Foundry IQ knowledge base |
| 💼 Enterprise Agents | Microsoft 365 / Graph | Teams announcements, SharePoint release log (Teams fallback for personal accounts), Outlook reminders, cert study plans; Work IQ calendar signals |

### Microsoft IQ Layers
- **Foundry IQ** — `knowledge/` holds the grounding knowledge base (cert requirements, role maps, study methodology). The reasoning agent queries it to return cited, auditable impact decisions.
- **Work IQ** — The readiness agent fetches live meeting/focus signals from the M365 calendar via `GET /users/{upn}/calendarView` when Graph is configured, computing real capacity-aware study plans. Falls back to synthetic signals from `data/team-certifications.json` when not (all 13 team members have UPNs — replace `contoso.com` with your tenant domain).

---

## Multi-Agent Architecture

| Agent | File | Role |
|---|---|---|
| Reasoning Agent | `agents/reasoning-agent.ts` | 6-step impact analysis — risk, areas, audience, breaking changes; 4-tier AI fallback |
| Generation Agent | `agents/generation-agent.ts` | Changelog, docs patch, plain-language summary |
| Readiness Agent | `agents/readiness-agent.ts` | Cert coverage check + capacity-aware study plans via Work IQ signals |
| Enterprise Agent | `agents/enterprise-agent.ts` | Teams / SharePoint / Outlook / Study Plans via Microsoft Graph |
| Copilot Extension | `agents/copilot-extension.ts` | `@herald` commands in GitHub Copilot Chat — RSA-SHA256 verified, SSE streaming |
| Work IQ | `agents/work-iq.ts` | Live M365 calendar signal fetching — meeting load, focus hours per engineer |

---

## Setup

```bash
npm install
cp .env.example .env   # fill in your credentials
npm run dev            # → http://localhost:3000
```

### Check your configuration
```bash
curl http://localhost:3000/diagnostic
```

### Run a demo

**Via UI (recommended for judges):** Open http://localhost:3000 → Sidebar → **Webhook Runs** → click **Breaking Change** button. Watch the full pipeline: Reasoning → Review → M365 Actions.

**Via curl:**
```bash
# Feature PR fixture
curl -X POST http://localhost:3000/runs/demo/trigger \
  -H "Content-Type: application/json" \
  -H "x-api-key: herald-dev-key" \
  -d '{"fixture":"feature-pr"}'

# Breaking change fixture (shows high risk + deployment block + cert gaps)
curl -X POST http://localhost:3000/runs/demo/trigger \
  -H "Content-Type: application/json" \
  -H "x-api-key: herald-dev-key" \
  -d '{"fixture":"breaking-pr"}'
```

### Copilot Chat simulator

Open the **Copilot Chat** tab in the Herald sidebar for an in-app GitHub Copilot Chat experience:
- Click command cards to stream `@herald status`, `@herald readiness`, `@herald analyze`, `@herald help`
- Responses stream token-by-token, identical to real GitHub Copilot Chat
- `@herald analyze <url>` triggers a real Herald pipeline run — follow up with `@herald status <id>`

### Run the evaluation suite
```bash
# Server must be running on port 3000
npx tsx evaluation/run-evaluation.ts
```
Validates all three fixture types (feature / bugfix / breaking) against 20 schema and logic checks per run.

### Test the GitHub Copilot Extension locally

You can test the Copilot Extension without a registered GitHub App:

```bash
# 1. Add to .env:
#    COPILOT_SKIP_SIG_VERIFY=1

# 2. Test via the demo endpoint (returns JSON):
curl "http://localhost:3000/copilot/demo?command=status"
curl "http://localhost:3000/copilot/demo?command=readiness"
curl "http://localhost:3000/copilot/demo?command=help"

# 3. Or send a raw SSE request:
curl -X POST http://localhost:3000/copilot \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"@herald readiness"}]}' \
  --no-buffer
```

To use `@herald` in live GitHub Copilot Chat, [register a GitHub App with Copilot Extension capability](https://docs.github.com/en/copilot/building-copilot-extensions) and set the callback URL to `POST /copilot`. See `Settings → Configuration` in the app for the step-by-step guide.

---

## Required Graph API Permissions (app-only)

| Scope | Purpose |
|---|---|
| `ChannelMessage.Send` | Teams announcements + release log fallback |
| `Sites.ReadWrite.All` | SharePoint release log |
| `Calendars.ReadWrite` | Outlook rollout reminders |
| `Calendars.Read` | Work IQ — live M365 calendar signals for study-plan capacity |

> **Note:** `Calendars.Read` requires tenant admin consent. Without it, Herald falls back to synthetic Work IQ signals from `data/team-certifications.json` — cert gap analysis still works, capacity estimates use static values.

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /webhook/github` | HMAC-verified GitHub webhook receiver |
| `GET /runs` · `GET /runs/:id` | List / get pipeline runs |
| `POST /runs/:id/approve` | Approve with edits + selected actions |
| `POST /runs/:id/reject` | Reject — no org-visible action |
| `POST /runs/demo/trigger` | Demo trigger (`fixture`: feature-pr / bugfix-pr / breaking-pr) |
| `POST /runs/github` | Trigger analysis from a real GitHub PR URL |
| `GET /diagnostic` | Validate M365 + Foundry + Copilot config |
| `POST /copilot` | GitHub Copilot Extension endpoint (RSA-SHA256 verified, SSE) |
| `GET /copilot/info` | Extension manifest — commands, description |
| `GET /copilot/demo` | Test the extension locally without a GitHub App |

---

## Run State Machine

```
reasoning → ready_for_review → approved → acting → done
                 ↑ human gate ↑              ↘ error
```

---

## Project Structure

```
herald/
├── agents/
│   ├── reasoning-agent.ts      # 4-tier AI: Foundry → Phi-4 → Azure OAI → Gemini
│   ├── generation-agent.ts     # Changelog, docs patch, plain summary
│   ├── readiness-agent.ts      # Cert gap analysis + study plans
│   ├── enterprise-agent.ts     # Graph: Teams, SharePoint, Outlook
│   ├── copilot-extension.ts    # GitHub Copilot Extension handler
│   ├── work-iq.ts              # Live M365 calendar signal fetching
│   └── foundry-agent-client.ts # Foundry Agent + Phi-4 client
├── lib/pipeline.ts             # Multi-agent orchestration
├── config/ownership.json       # Path → team ownership map
├── data/                       # Synthetic team + cert data (with UPNs)
├── fixtures/                   # Curated demo PR diffs
├── knowledge/                  # Foundry IQ knowledge base
├── src/components/             # React review UI
├── server.ts                   # Express orchestrator + all routes
└── Dockerfile
```

---

## Security
- Webhook payloads HMAC-verified (timing-safe, multi-secret) before processing
- Copilot Extension requests RSA-SHA256 verified against GitHub's public key registry
- Approval gate enforced server-side — no Graph call fires without human approval
- All Graph tokens server-side only — never in the browser
- API key never injected into DOM — fetched client-side from same-origin `/api/client-token`
- All team/certification data is **synthetic** — no real PII

*Microsoft Agents League Hackathon · AI Skills Fest 2026*
