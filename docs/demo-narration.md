# Demo narration — timed to `herald-demo-draft.mp4` (1:25)

A draft screen recording exists at `.verify-shots/herald-demo-draft.mp4`
(regenerate any time with `node .verify-record.cjs`, then trim in Clipchamp or
with ffmpeg). Record the voiceover below over it, or use it as the shot list
for a fresh take. Spoken at a natural pace each block fits its window.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Herald dashboard | "Every time code ships, someone has to ask: does the team that owns this service have the certifications to handle it safely? Herald answers automatically — on every merged pull request." |
| 0:09 | Runs tab, new run appears with **Reasoning…** | "A breaking auth change just merged — JWT to server-side sessions. Herald's reasoning pipeline picks it up live. Tier one is a Microsoft Foundry Agent — and Herald always discloses which tier produced the analysis." |
| 0:30 | Status flips to **Ready**, run opens | "Twenty seconds later: classified breaking, high risk, with the full reasoning trace — auditable, never a black box." |
| 0:36 | Reasoning trace expanded | "Six steps, grounded in the team's ownership map and knowledge base." |
| 0:45 | Team Readiness, gap card expands | "Herald checked every engineer on the owning teams. These engineers are missing the required certifications — so it built capacity-aware study plans from their real meeting load." |
| 0:54 | Practice questions render with citations | "And here's what no quiz generator does: every practice question is grounded in the team's approved knowledge base — file and heading cited on every question. Herald refuses to write a question it can't cite." |
| 1:02 | Graded — score + trend | "Answers are graded server-side with progress tracked across attempts — this engineer is improving." |
| 1:08 | Failure cascade renders | "The Fabric IQ ontology knows what depends on what — so Herald replays the worst case: auth fails, the gateway goes dark, the frontend follows. That's what this change puts at stake." |
| 1:14 | Attestation issued + verified | "Finally, provenance: a signed attestation records which AI tier reasoned, hashes of the trace, and the human approval. Tamper with one field and verification fails. An auditor can check it in seconds." |
| 1:20 | Close | "Herald: release readiness, grounded, explainable, and signed. Built on Microsoft Foundry. Live on Azure Container Apps." |

## Re-record checklist
- Server up, `az login` valid, banner shows all 4 tiers
- New API key from `.env` (`API_SECRET`) — old herald-dev-key is dead
- Space runs ~60s apart (Gemini free-tier RPM)
- Abort if any trace shows `[SIMULATION]`
