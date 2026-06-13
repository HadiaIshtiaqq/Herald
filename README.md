# Herald — Release Concierge

> **Does your team have the certifications to ship this change safely?**
> Herald answers that question — automatically — every time a PR merges.
> And when it *can't* answer with evidence, it says so instead of guessing.

> **Semantic reasoning forms the question. Deterministic policy owns the verdict.**
> Three engineers touch the auth service; one holds the security cert it requires. Ship anyway? Herald doesn't vibe-check it. It grounds ownership in the diff, evaluates the certs as executed policy, rejects false conflicts, and returns one defensible verdict — **Clear**, **Blocked**, or, when ownership can't be grounded, **Abstain**.

🎬 **[Watch the 3-minute demo](#)** *(video link added at submission)* · 🌐 **[Live demo](https://herald-app.purpledesert-47a6cc46.southeastasia.azurecontainerapps.io)** (Azure Container Apps — Tier 1 Foundry Agent via managed identity) · 🏆 Submitted to the **Reasoning Agents** track · Implements **all three Microsoft IQ patterns**

Herald is a multi-agent system that connects **code changes to team certification readiness**. When a PR merges, four coordinated agents reason about the change, assess whether the owning engineers hold the certifications those services require, generate AI-powered study plans for any gaps, and execute Microsoft 365 actions — all behind a human approval gate.

Built for the **Microsoft Agents League Hackathon @ AI Skills Fest 2026**, spanning all three tracks.

---

## The Release Verdict — reasoning that knows its own limits

Most "AI reviewers" answer every question you put to them. The dangerous ones
are the questions they *shouldn't* answer. Herald's reasoning agents form the
analysis; a **deterministic adjudicator** (`lib/adjudicator.ts`) owns the
verdict — and the same inputs always produce the same, defensible decision:

| Verdict | When | What makes it a *reasoning* call, not a rubber stamp |
|---|---|---|
| ✅ **CLEAR** | Ownership resolved, owning team staffed, no real critical gap | — |
| ⛔ **BLOCKED** | A real, non-superseded critical certification gap remains | **False-conflict rejection** — a "missing" cert already satisfied by a superseding credential (e.g. `SC-100 ⊃ SC-300, AZ-500`) is struck from the blocker, so Herald never blocks on a conflict that doesn't really exist |
| ⚠️ **ABSTAIN** | The change can't be attributed to any owning team, or the owning team is unstaffed | **Epistemic humility** — Herald re-derives ownership *from the diff itself*, not from the model's guess. When the model says "core-service" but no team actually owns the changed paths, Herald refuses to certify readiness it cannot ground, and **escalates for an ownership decision** instead of emitting a green light it has no basis for |

This is the difference between a tool that's confidently wrong and one a
release manager can trust. The model is free to guess; the verdict is not.
Every decision ships with cited evidence (`GET /runs/:id/verdict`) — which
paths resolved to which team, which conflicts were rejected and why, and the
exact blocker that owns a BLOCK.

> Try it: the **`Unowned Change → Abstain`** demo fixture merges an ML training
> pipeline under a path no team owns. The reasoning agent guesses an area;
> the adjudicator catches that the change is unattributable and abstains.

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

## Challenge A Alignment — Enterprise Learning System

Herald implements the Reasoning track's Challenge A ("Enterprise Learning
System") with one original twist: **readiness is triggered by real code
changes, not by a learner asking**. Every merged PR becomes the moment the
organisation checks: *can the owning team ship this safely?*

| Challenge A capability | Herald implementation |
|---|---|
| Certification requirements mapped to roles | Fabric IQ ontology (`data/fabric-ontology.json`) + `data/area-cert-requirements.json` |
| Role-based study plans | Readiness Agent — capacity-aware plans per engineer (`agents/readiness-agent.ts`) |
| Grounded practice questions from approved sources | **Assessment Agent** — every question cites `knowledge/` file + heading (`agents/assessment-agent.ts`, `GET /assessment/:cert`) |
| Feedback on progress | Graded assessments with per-question cited feedback + per-member score trends across attempts (`POST /assessment/:cert/grade`, `GET /assessment/progress`); answer-and-grade flow in the review UI |
| Adapt schedules to real work context | Work IQ calendar signals → study windows in focus hours (`agents/work-iq.ts`) |
| Manager-level insights across readiness & risk | **Manager Insights Agent** — criticality-weighted coverage, at-risk areas, capacity constraints (`agents/insights-agent.ts`, `GET /insights/team`) |

### Microsoft IQ layers — all three patterns implemented

Herald implements the three IQ *patterns* in its own runtime (it does not
claim the managed cloud services themselves — what's here is inspectable code):

- **Foundry IQ pattern (grounding)** — `knowledge/` is a curated, approved
  knowledge base (7 guides). The Reasoning Agent grounds impact analysis in
  it, and the Assessment Agent refuses to write a question it cannot cite
  (`citation: { file, heading }` on every question).
- **Work IQ pattern (work context)** — live M365 calendar signals
  (`GET /users/{upn}/calendarView`) feed meeting-load and focus-hour context
  into study plans when Graph is configured; otherwise clearly-labelled
  synthetic signals keep the pipeline honest about its inputs.
- **Fabric IQ pattern (semantic layer)** — a deterministic ontology
  (`lib/fabric-iq.ts`) connecting
  ServiceArea ─demands→ Skill ←teaches─ Certification ←requires─ Role.
  Readiness scores and cert recommendations come with the relation path that
  produced them — explainable answers, not vibes:
  `area:auth-service ─demands→ skill:Identity ─taught-by→ cert:SC-300`.

---

## Multi-Agent Architecture

Herald's agents are specialized modules coordinated through an explicit
pipeline (`lib/pipeline.ts`) — orchestration is deliberate and auditable
rather than emergent. The AI-backed agents (Reasoning, Generation, Readiness)
run a 4-tier model fallback and disclose which tier answered; the Insights
agent is deterministic by design, because manager reporting must be
reproducible.

| Agent | File | Role |
|---|---|---|
| Reasoning Agent | `agents/reasoning-agent.ts` | 6-step impact analysis — risk, areas, audience, breaking changes; 4-tier AI fallback |
| Generation Agent | `agents/generation-agent.ts` | Changelog, docs patch, plain-language summary |
| Readiness Agent | `agents/readiness-agent.ts` | Cert coverage check + capacity-aware study plans via Work IQ signals |
| Enterprise Agent | `agents/enterprise-agent.ts` | Teams / SharePoint / Outlook / Study Plans via Microsoft Graph |
| Copilot Extension | `agents/copilot-extension.ts` | `@herald` commands in GitHub Copilot Chat — RSA-SHA256 verified, SSE streaming |
| Work IQ | `agents/work-iq.ts` | Live M365 calendar signal fetching — meeting load, focus hours per engineer |
| Assessment Agent | `agents/assessment-agent.ts` | Grounded practice questions — every question cites a `knowledge/` file + heading |
| Manager Insights Agent | `agents/insights-agent.ts` | Team readiness, at-risk areas, capacity constraints — deterministic and auditable |

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
| `POST /runs/demo/trigger` | Demo trigger (`fixture`: feature-pr / bugfix-pr / breaking-pr / unowned-pr) |
| `GET /runs/:id/verdict` | **Release Verdict** — the adjudicator's CLEAR / BLOCKED / ABSTAIN decision with authority resolution, rejected false conflicts, real blockers, and cited evidence |
| `POST /runs/github` | Trigger analysis from a real GitHub PR URL |
| `GET /diagnostic` | Validate M365 + Foundry + Copilot config |
| `POST /copilot` | GitHub Copilot Extension endpoint (RSA-SHA256 verified, SSE) |
| `GET /copilot/info` | Extension manifest — commands, description |
| `GET /copilot/demo` | Test the extension locally without a GitHub App |
| `GET /insights/team` | Manager Insights Agent — readiness, at-risk areas, capacity constraints |
| `GET /runs/:id/blast-radius` | Transitive impact + deterministic failure-cascade replay for a run |
| `GET /fabric/blast` | Blast radius for arbitrary areas (`?areas=auth-service,data-layer`) |
| `GET /runs/:id/attestation` | Signed provenance attestation — AI tier, content hashes, human approval |
| `POST /attestation/verify` | Verify an attestation's HMAC signature (timing-safe) |
| `GET /runs/:id/health` | Release Health Score — 4 weighted dimensions + phased remediation roadmap |
| `GET /runs/:id/report` | Executive report (print-ready HTML) — health, cascade, gaps, roadmap, QR release passport |
| `GET /fabric/graph` | Ontology dependency graph (nodes + edges) for the blast-radius visualization |
| `GET /assessment/:cert` | Assessment Agent — grounded, cited practice questions (`?n=4`) |
| `POST /assessment/:cert/grade` | Grade an attempt — score, per-question cited feedback, trend vs last attempt |
| `GET /assessment/progress` | Per-member, per-cert progress across attempts (feedback on progress) |
| `GET /fabric/explain` | Fabric IQ semantic layer — relation paths for an area (`?area=auth-service`) |

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
│   ├── assessment-agent.ts     # Grounded, cited practice questions
│   ├── insights-agent.ts       # Manager insights — readiness, risk, capacity
│   └── foundry-agent-client.ts # Foundry Agent + Phi-4 client
├── lib/pipeline.ts             # Multi-agent orchestration
├── lib/fabric-iq.ts            # Fabric IQ semantic ontology layer
├── lib/extract-json.ts         # Resilient LLM JSON extraction (think-blocks, fences)
├── config/ownership.json       # Path → team ownership map
├── data/                       # Synthetic team + cert data (with UPNs)
├── fixtures/                   # Curated demo PR diffs
├── knowledge/                  # Foundry IQ knowledge base
├── src/components/             # React review UI
├── server.ts                   # Express orchestrator + all routes
└── Dockerfile
```

---

## Blast Radius, Failure Replay &amp; Run Provenance

Three capabilities that turn a release decision into an auditable, explorable artifact:

- **Blast radius** — the Fabric IQ ontology carries `depends_on` edges between
  service areas. For any run, Herald walks the graph in reverse to show every
  area transitively affected by the change, each with a severity score that
  decays with dependency distance and the relation path that pulled it in
  (`GET /runs/:id/blast-radius`).
- **Failure replay** — the same graph generates a deterministic worst-case
  cascade timeline: `T+0s` the changed area's failure mode fires, then each
  downstream consumer breaks in dependency order, with a running system
  integrity meter. Not a prediction — a grounded "what does this change put at
  stake" visualization, rendered in the run review UI.
- **Run provenance** — every run can issue a signed attestation
  (`herald-attestation/v1`): which AI tier produced the reasoning, SHA-256
  hashes of the reasoning trace / impact report / artifacts, and the human
  approval decision with executed actions — HMAC-SHA256 signed over canonical
  JSON and verifiable in one call (`POST /attestation/verify`, timing-safe).
  An auditor can confirm in seconds that the analysis shown is the analysis
  that was approved, and that a human authorized every org-visible action.
  (Symmetric-key signing; ed25519/Sigstore keyless is the documented upgrade
  path.)
- **Release Health Score** — every run gets a 0–100 grade across four weighted
  dimensions (team readiness, blast containment, approval hygiene, AI
  grounding), each carrying the evidence that produced it
  (`GET /runs/:id/health`).
- **Executive report + release passport** — one click produces a print-ready
  leadership report: health scorecard, failure cascade, certification gaps, a
  phased remediation roadmap with effort projections, and the signed
  attestation rendered as a scannable QR "release passport"
  (`GET /runs/:id/report`).

## How Herald maps to the judging rubric

| Criterion | Where to look |
|---|---|
| **Accuracy & Relevance (25%)** | Challenge A table above — every required capability implemented; all three IQ layers integrated |
| **Reasoning & Multi-step (25%)** | 6-step impact analysis with persisted, visible reasoning traces; 4-tier AI fallback (Foundry Agent → Phi-4-reasoning → Azure OpenAI → Gemini) where every response discloses which tier produced it; ontology-path explanations on every recommendation; **a deterministic adjudicator that owns the verdict — and abstains when it can't ground the call** (`lib/adjudicator.ts`); specialized agents orchestrated through an explicit, auditable pipeline |
| **Creativity & Originality (15%)** | PR-merge as the trigger for certification readiness — learning driven by what the org actually ships; runtime GitHub Copilot Extension (`@herald`) |
| **UX & Presentation (15%)** | React review UI, one-click demo fixtures, Copilot Chat simulator, 3-min video |
| **Reliability & Safety (20%)** | HMAC + RSA-SHA256 verified inputs, server-side human approval gate, **a deterministic verdict that abstains rather than emit an unfounded green light**, **signed provenance attestations** (tamper-evident record of AI tier + reasoning hashes + human approval, verifiable via `POST /attestation/verify`), self-check evaluation harness (`npx tsx evaluation/run-evaluation.ts` — 3 fixtures, ~20 schema/logic/safety checks each; regression safety against our own spec, not an external benchmark), deterministic fallbacks at every tier, synthetic data only |

---

## Security
- Webhook payloads HMAC-verified (timing-safe, multi-secret) before processing
- Copilot Extension requests RSA-SHA256 verified against GitHub's public key registry
- Approval gate enforced server-side — no Graph call fires without human approval
- All Graph tokens server-side only — never in the browser
- API key never injected into DOM — fetched client-side from same-origin `/api/client-token`
- All team/certification data is **synthetic** — no real PII
- No credentials in git history (verified: `git log --all -- .env` returns nothing)

---

## Responsible AI

- **Human in the loop** — no org-visible action (Teams, SharePoint, Outlook)
  fires without explicit human approval, enforced server-side.
- **Groundedness** — assessments and impact citations trace to approved
  knowledge sources; ungrounded generation falls back to clearly-labelled
  deterministic output, never silent hallucination.
- **Abstention over guessing** — the adjudicator refuses to certify readiness
  for a change it cannot attribute to an owning team (or for an unstaffed
  team), escalating for an ownership decision instead of emitting an
  unfounded verdict. Refusing to decide is a first-class outcome.
- **Transparency** — every run exposes its full reasoning trace and which AI
  tier produced it; ontology recommendations carry the relation path that
  justified them.
- **Privacy** — manager insights are aggregated; no calendars, message
  content, or real PII are read or exposed. All team data is synthetic.

*Microsoft Agents League Hackathon · AI Skills Fest 2026*
