# Herald — Demo Script (5 minutes)

## Setup before recording
- [ ] Server running: `npm run dev`
- [ ] Run diagnostic: `curl http://localhost:3000/diagnostic` — confirm Foundry CONNECTED
- [ ] Fix Teams channel ID (see `scripts/fix-teams-channel-id.md`)
- [ ] Fix Graph token (see `scripts/fix-graph-token.md`)
- [ ] Browser open at http://localhost:3000
- [ ] Dark mode OFF (better for recording)

---

## Scene 1 — The problem (0:00–0:30)

> *"Every time code ships, someone has to ask: did we document this? Who needs to know? And critically — does the team owning this service actually have the skills to handle it safely? Herald answers all three questions automatically."*

Show the Herald home screen briefly.

---

## Scene 2 — Trigger a breaking change (0:30–1:15)

Open the **Webhook Runs** tab.

Click **Demo Run** — but first explain:

> *"I'm going to simulate merging a breaking change — a JWT to session token migration. This touches the auth service, which requires AZ-500 and SC-300 certifications."*

Click Demo Run. Watch the status go from **Reasoning...** to **Ready for Review**.

---

## Scene 3 — Show the reasoning trace (1:15–2:00)

Select the run. Show the **Impact panel**:

> *"Herald's Foundry reasoning core analyzed the change in 6 steps — classified it as breaking, high risk, and mapped it to the auth-service and core-service teams."*

Expand the **Reasoning Trace** to show all 6 steps live.

---

## Scene 4 — Show team readiness (2:00–2:45)

Scroll down to the **Team Readiness** section:

> *"This is the Reasoning Agents track core — Herald checked every engineer on the auth team against the required certifications for this service. 0% readiness. Three engineers are missing AZ-500."*

Expand one engineer's gap card to show the AI-generated study plan:

> *"Using Work IQ-style signals — their meeting load, focus hours, preferred study window — Herald generated a capacity-aware study plan. Carter Smith has 14 focus hours per week, so Herald allocated 8h/week and estimated 4 weeks to complete AZ-500."*

---

## Scene 5 — Artifacts (2:45–3:15)

Click the **Changelog** tab — show the rendered markdown.

> *"The generation agent produced a full changelog, docs patch, and a plain-language summary that any stakeholder can read — no jargon."*

Switch to **Plain Summary** tab.

---

## Scene 6 — Approve and send (3:15–4:00)

Show the **Actions bar**. Check Teams, Outlook, and Study Plans.

> *"I'm approving three actions: a Teams announcement to the engineering channel, an Outlook rollout checkpoint, and study plan notifications to the engineers with gaps."*

Click **Approve & Send**. Show the confirmation view with real links.

Open Teams to show the actual posted message.

---

## Scene 7 — Architecture close (4:00–5:00)

Show the architecture diagram (`docs/architecture.svg`):

> *"Four coordinated agents. Reasoning Agent uses Foundry IQ with a grounded knowledge base. Readiness Agent applies Work IQ-pattern signals. Enterprise Agent fires only after human approval — the safety gate is architectural, not just UI. All three Microsoft IQ layers. Three hackathon tracks in one submission."*

End on the Herald UI.

---

## Key phrases for judges
- "Foundry IQ knowledge base with grounded, cited cert requirements"
- "Work IQ-pattern signals: meeting load, focus hours, preferred study window"  
- "Human approval gate is enforced in the orchestrator — no Graph call fires without it"
- "Multi-agent: four separate agents, each with a typed contract"
- "100% evaluation score across all three fixture PRs"
