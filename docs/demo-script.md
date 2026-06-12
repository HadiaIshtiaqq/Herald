# Herald — Demo Script (target 3 minutes, hard cap 5)

## Setup before recording (do ALL of these — each one has burned a take before)

- [ ] Secrets rotated (runbook Part 0) — never record with burned keys
- [ ] Server running: `npm run dev` — banner must say `AI pipeline ready: Tier 1 …`
- [ ] `curl -H "x-api-key: $API_SECRET" http://localhost:3000/diagnostic` — Foundry ✅, Graph token ✅, Teams channel valid ✅
- [ ] **`az login` is active on this machine** — Tier 1 authenticates via
      Entra ID (DefaultAzureCredential → Azure CLI). If you switched machines
      or accounts, run `az login` first or Tier 1 falls through.
- [ ] **Tier check:** trigger one throwaway run, then check the server log for
      `"tier":"foundry-agent"` (expected as of June 12 — verified live).
      `"tier":"azure-openai"` or `"tier":"phi4"` are acceptable fallbacks
      (all Microsoft-hosted).
      **Abort the take if you see `"tier":"simulation"` or `[SIMULATION]` anywhere.**
- [ ] **Rate-limit spacing:** Gemini free tier throttles back-to-back runs.
      Leave ~60s between pipeline triggers or the fallback chain may exhaust.
- [ ] **Numbers are live, not scripted:** risk level and readiness % vary by
      which AI tier answers. Say "Herald classified this as…" and read the
      screen — never pre-commit to "54%" in your narration.
- [ ] Browser at http://localhost:3000, dark mode OFF, notifications OFF

---

## Scene 1 — The problem (0:00–0:20)

> *"Every time code ships someone has to ask: who needs to know — and does the
> team that owns this service actually have the certifications to handle it
> safely? Herald answers automatically, on every merged PR."*

---

## Scene 2 — Trigger a breaking change (0:20–0:50)

**Webhook Runs** tab → explain first, then click **Breaking Change**:

> *"I'm merging a breaking auth change — JWT to server-side sessions. The auth
> service requires AZ-500 and SC-300."*

Watch status: **Reasoning… → Ready for Review**.

---

## Scene 3 — Reasoning trace + tier (0:50–1:20)

Open the run, show the Impact panel and expand the **Reasoning Trace**:

> *"Six reasoning steps — classified breaking, mapped to the owning teams. And
> Herald discloses which model tier produced this analysis — the trace is
> auditable, never a black box."*

(Point at the tier/source indicator. This is the track's required-tool moment.)

---

## Scene 4 — Readiness gap → cited practice questions (1:20–2:10) ★ the money shot

Scroll to **Team Readiness**, expand an engineer's gap card:

> *"Herald found engineers missing SC-300, and built a capacity-aware study
> plan from their real meeting load and focus hours — Work IQ-pattern signals."*

Click the **practice button** on the missing cert. Answer the questions, click
**Check answers**:

> *"Every question is generated from the team's approved knowledge base and
> carries a citation — file and heading. Herald refuses to write a question it
> can't cite. And it tracks progress: score, attempt number, trend."*

(One earlier off-camera attempt makes the trend line say "improving" — do it.)

---

## Scene 5 — Manager view + semantic layer (2:10–2:35)

Split terminal or browser: hit `/insights/team` and `/fabric/explain?area=auth-service`:

> *"Managers get aggregated readiness — at-risk areas, capacity constraints, no
> personal data. And every recommendation shows the ontology path that produced
> it: area demands skill, skill is taught by cert. Explainable, not vibes."*

---

## Scene 6 — Approve and send (2:35–3:00)

Actions bar → check Teams + Study Plans → **Approve & Send** → show the real
Teams post:

> *"Nothing org-visible fires without explicit human approval, enforced
> server-side. That's the safety architecture, not a UI checkbox."*

Close on the evaluation run if time allows:
`npx tsx evaluation/run-evaluation.ts` → 100%.

---

## Key phrases for judges (all verified true — say them confidently)

- "Grounded, **cited** practice questions — file and heading on every one"
- "Every AI response **discloses which tier produced it**"
- "Human approval gate enforced **in the orchestrator**, not the UI"
- "All three Microsoft IQ **patterns** implemented — grounding, work context, semantic layer"
- "Specialized agents coordinated through an explicit, auditable pipeline"
- "Self-check evaluation harness: three fixture PRs, ~60 checks, 100%"

## Never say on camera
- A specific readiness % before the screen shows it
- "Multi-agent" as if agents negotiate autonomously — say "coordinated/orchestrated"
- Anything implying the managed Fabric/Foundry IQ cloud services — say "pattern"
