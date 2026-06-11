# Herald Submission Checklist

**Registration deadline: June 12, 2026 12:00 PM PT**
**Submission deadline: June 14, 2026 11:59 PM PT**

---

## Must-do before June 12 (registration)

- [ ] Register on the hackathon platform and link Herald project to all 3 tracks
- [ ] Fix Teams channel ID — see `scripts/fix-teams-channel-id.md`
- [ ] Fix Graph token (admin consent) — see `scripts/fix-graph-token.md`
- [ ] Verify `curl http://localhost:3000/diagnostic` shows: Foundry ✅, Graph token ✅, Teams channel valid ✅

## Must-do before June 14 (submission)

- [ ] Use GitHub Copilot in VS Code for at least one more feature — record it
- [ ] Export `docs/architecture.svg` to `docs/architecture.png` (open in browser → Save As PNG)
- [ ] Record 5-minute demo video following `docs/demo-script.md`
- [ ] Upload video to YouTube/Vimeo (unlisted is fine)
- [ ] Verify repo is public: `github.com/your-org/herald`
- [ ] Run final evaluation: `npx tsx evaluation/run-evaluation.ts` — must score 100%
- [ ] Deploy to Azure (optional but recommended): `azd up`

## Submission form content

**Project name:** Herald — Release Concierge

**One-line description:**
A multi-agent system that connects merged PRs to team certification readiness — using Foundry IQ, Work IQ signals, and Microsoft Graph to assess, plan, and notify before every rollout.

**Tracks:** Creative Apps + Reasoning Agents + Enterprise Agents

**Microsoft IQ layer(s):** Foundry IQ + Work IQ

**Demo video:** [YouTube/Vimeo link]

**GitHub repo:** [public repo URL]

**Architecture diagram:** `docs/architecture.png`

## Track descriptions

**Creative Apps (GitHub Copilot):**
Review UI built with GitHub Copilot in VS Code — markdown-rendering artifact editor, team readiness panel, action toggles, high-risk confirmation gate.

**Reasoning Agents (Microsoft Foundry):**
Four-agent pipeline: ReasoningAgent (6-step Foundry IQ impact analysis), ReadinessAgent (AI-generated cert study plans), GenerationAgent (changelog + docs), EnterpriseAgent (M365 actions). Knowledge base in `knowledge/` grounds all reasoning with citations.

**Enterprise Agents (M365 Copilot):**
Teams announcements, SharePoint release log, Outlook rollout reminders, and study plan notifications — all via Microsoft Graph, all gated behind explicit human approval.
