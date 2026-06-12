# Herald Submission Checklist

**Registration deadline: June 12, 2026 12:00 PM PT**
**Submission deadline: June 14, 2026 11:59 PM PT — submit June 13, don't cut it close**

---

## 🚨 Critical, user-only actions (in priority order)

- [ ] **Rotate all six secrets** — `.env` was pasted into a chat; treat every
      value as burned. See `docs/AI-TIER-RUNBOOK.md` Part 0 (~10 min).
      Git history is already verified clean (`git log --all -- .env` → empty).
- [x] **Tier 1 FIXED (June 12)** — root causes: code sent `api-key` headers
      (Agents API requires Entra ID bearer tokens) and the configured agent id
      didn't exist. Now: `DefaultAzureCredential` auth in
      `agents/foundry-agent-client.ts`, real agent `herald-release-analyst`
      (`asst_FXJITUqoNX6Kq1fqFB9sf2GL`, gpt-4o-mini) created in proj-default.
      Verified live: runs complete with `"tier":"foundry-agent"`.
      ⚠️ Requires `az login` on the demo machine (already done here).
- [x] **Tier 3 FIXED (June 12)** — `gpt-4o-mini` deployed on HERALDAI
      (GlobalStandard, capacity 10); `FOUNDRY_DEPLOYMENT=gpt-4o-mini`.
      Verified live: `"tier":"azure-openai"`.
- [ ] **Link the project to the “Reasoning Agents” challenge** on the hackathon
      site (one challenge is required per project).
- [ ] **Discord `#agentsleague` post #1** today with a screenshot — community
      vote is 10% and the clock starts when you post.

## Before June 13 (recording day)

- [ ] Optional, high-value: one live Work IQ signal — set `OUTLOOK_USER_ID` to
      a tenant UPN (not gmail), admin-consent `Calendars.Read` (application),
      put 2–3 events on that calendar → banner shows `N live M365 signal(s)`.
- [ ] Replace the `(#)` demo-video placeholder link at the top of README.md.
- [ ] If GitHub Copilot contributed to development, add a truthful
      "Built with GitHub Copilot" section to the README — specifics only;
      generic claims read as box-ticking.
- [ ] Export `docs/architecture.svg` → `docs/architecture.png`.
- [ ] Verify repo is public and up to date.

## Recording day (June 13)

- [ ] Follow `docs/demo-script.md` — including ALL setup checks
      (tier check, 60s spacing between runs, no `[SIMULATION]` anywhere).
- [ ] One off-camera assessment attempt first, so the on-camera grade shows
      an "improving" trend.
- [ ] Run `npx tsx evaluation/run-evaluation.ts` on camera — 100%.
- [ ] Upload video (YouTube/Vimeo unlisted ok), put the link in README, commit.
- [ ] **Submit June 13.** Post #2 in Discord with the video; reply to comments.

## Submission form content

**Project name:** Herald — Release Concierge

**One-line description:**
A coordinated-agent system that connects merged PRs to team certification
readiness — grounded impact reasoning, cited practice assessments with
progress tracking, capacity-aware study plans, and human-gated Microsoft 365
actions.

**Challenge:** Reasoning Agents (required tool: Microsoft Foundry)

**Microsoft IQ layer(s):** All three patterns — Foundry IQ (grounded, cited
knowledge base), Work IQ (calendar capacity signals), Fabric IQ (semantic
ontology with explainable relation paths)

**Demo video:** [link]

**Live demo:** https://herald-app.purpledesert-47a6cc46.southeastasia.azurecontainerapps.io
(Azure Container Apps, southeastasia; Tier 1 runs via system-assigned managed
identity with the Foundry User role — verified `tier:"foundry-agent"` in cloud)

**GitHub repo:** https://github.com/HadiaIshtiaqq/Herald

**Architecture diagram:** `docs/architecture.png`

## Track descriptions

**Reasoning Agents (Microsoft Foundry) — primary challenge:**
Agent pipeline: ReasoningAgent (6-step grounded impact analysis, 4-tier
Foundry-first model fallback with tier disclosure), ReadinessAgent
(capacity-aware study plans), AssessmentAgent (grounded, cited practice
questions + graded progress tracking), InsightsAgent (deterministic manager
readiness/risk reporting), GenerationAgent (changelog + docs), EnterpriseAgent
(human-gated M365 actions). `knowledge/` (7 guides) grounds reasoning and
assessments with citations; `lib/fabric-iq.ts` provides the semantic layer.

**Also demonstrates — Creative Apps (GitHub Copilot):**
Runtime GitHub Copilot Extension: `@herald status | analyze | readiness` in
Copilot Chat (RSA-SHA256 verified, SSE streaming) + in-app simulator.

**Also demonstrates — Enterprise Agents (M365 / Graph):**
Teams announcements, SharePoint release log (honest fallback for personal
accounts), Outlook reminders, study-plan notifications — all behind a
server-enforced human approval gate.
