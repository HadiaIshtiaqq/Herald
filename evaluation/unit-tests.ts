/**
 * Herald unit tests — pure logic, no server required.
 * Run with:  npx tsx evaluation/unit-tests.ts
 */
import assert from "node:assert/strict";
import { extractJson } from "../agents/foundry-agent-client.js";
import { normalizeReport, isTemplateEcho } from "../agents/reasoning-agent.js";
import { assessTeamReadiness } from "../agents/readiness-agent.js";
import { adjudicate } from "../lib/adjudicator.js";
import type { CertData, AreaCertData } from "../lib/pipeline.js";
import type { OwnershipMap, ImpactReport, TeamReadinessReport, TeamMember } from "../src/types.js";

let pass = 0;
let fail = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(
    () => { console.log(`  ✓ ${name}`); pass++; },
    (err: unknown) => { console.error(`  ✗ ${name}\n    ${(err as Error).message}`); fail++; }
  );
}

// ── extractJson ───────────────────────────────────────────────────────────────

console.log("\nextractJson");

await test("plain JSON is returned unchanged", () => {
  const input = `{"a":1}`;
  assert.equal(extractJson(input), input);
});

await test("strips ```json fences", () => {
  const input = "```json\n{\"a\":1}\n```";
  assert.equal(JSON.parse(extractJson(input)).a, 1);
});

await test("extracts last JSON object from reasoning prose", () => {
  const text = `Let me think... {"summary":"first"} more prose {"summary":"final","change_type":"feature"}`;
  const parsed = JSON.parse(extractJson(text));
  assert.equal(parsed.summary, "final");
});

await test("returns partial text when no JSON found", () => {
  const result = extractJson("no json here at all");
  assert.equal(result, "no json here at all");
});

await test("handles nested objects correctly", () => {
  const input = `{"risk":{"level":"high","rationale":"breaking"}}`;
  const parsed = JSON.parse(extractJson(input));
  assert.equal(parsed.risk.level, "high");
});

// ── isTemplateEcho ────────────────────────────────────────────────────────────

console.log("\nisTemplateEcho");

await test("detects '<your analysis' placeholder in summary", () => {
  assert.ok(isTemplateEcho({ summary: "<your analysis here>" }));
});

await test("detects '<your rationale' placeholder in risk rationale", () => {
  assert.ok(isTemplateEcho({ summary: "real", risk: { level: "low", rationale: "<your rationale here>" } }));
});

await test("detects '<actual area>' in impacted_areas", () => {
  assert.ok(isTemplateEcho({ summary: "real", impacted_areas: ["<actual area>"] }));
});

await test("passes real content", () => {
  assert.ok(!isTemplateEcho({
    summary: "This PR adds OAuth2 refresh token rotation.",
    risk: { level: "high", rationale: "Auth changes can break active sessions." },
    impacted_areas: ["auth-service"]
  }));
});

// ── normalizeReport ───────────────────────────────────────────────────────────

console.log("\nnormalizeReport");

const fallback = {
  prTitle: "feat: add OAuth refresh",
  branch: "feat/oauth",
  commitMessages: [],
  changedPaths: ["src/auth/token.ts"]
};

await test("fills default summary when missing", () => {
  const r = normalizeReport({}, fallback);
  assert.ok(r.summary.includes("feat: add OAuth refresh"));
});

await test("coerces null arrays to empty arrays", () => {
  const r = normalizeReport({ breaking_changes: null as unknown as string[], impacted_areas: null as unknown as string[] }, fallback);
  assert.deepEqual(r.breaking_changes, []);
  assert.deepEqual(r.impacted_areas, ["core-service"]);
});

await test("preserves provided values", () => {
  const r = normalizeReport({
    summary: "Custom summary",
    change_type: "bugfix",
    risk: { level: "medium", rationale: "Minor fix." },
    breaking_changes: [],
    impacted_areas: ["auth-service"],
    audience: ["releases@cloudnexus.io"],
    reasoning_trace: ["step1"]
  }, fallback);
  assert.equal(r.summary, "Custom summary");
  assert.equal(r.change_type, "bugfix");
});

await test("safety override: feat! prefix → change_type=breaking, risk=high", () => {
  const breakingFallback = { ...fallback, prTitle: "feat!: remove legacy auth endpoint" };
  const r = normalizeReport({ summary: "removes endpoint", change_type: "feature", risk: { level: "low", rationale: "simple" }, breaking_changes: [], impacted_areas: [], audience: [], reasoning_trace: [] }, breakingFallback);
  assert.equal(r.change_type, "breaking");
  assert.equal(r.risk.level, "high");
  assert.ok(r.breaking_changes.length > 0);
});

await test("safety override: auth path → includes auth-service in impacted_areas", () => {
  const breakingFallback = { ...fallback, prTitle: "feat!: rotate tokens", changedPaths: ["src/auth/oauth.ts"] };
  const r = normalizeReport({ summary: "rotates", change_type: "feature", risk: { level: "low", rationale: "simple" }, breaking_changes: [], impacted_areas: ["core-service"], audience: [], reasoning_trace: [] }, breakingFallback);
  assert.ok(r.impacted_areas.includes("auth-service"));
});

// ── assessTeamReadiness (per-area scoring) ───────────────────────────────────

console.log("\nassessTeamReadiness — per-area heuristic scoring");

const mockCertData: CertData = {
  team_members: [
    { id: "ENG-101", name: "Alice", role: "Senior Engineer", team: "auth-team", certifications: ["AZ-204", "AZ-900"], meeting_hours_per_week: 10, focus_hours_per_week: 25, preferred_learning_slot: "morning" },
    { id: "ENG-102", name: "Bob",   role: "Engineer",        team: "auth-team", certifications: ["AZ-900"],           meeting_hours_per_week: 8,  focus_hours_per_week: 28, preferred_learning_slot: "evening" },
  ]
};

const mockAreaCertData: AreaCertData = {
  requirements: {
    "auth-service": { required: ["AZ-204", "AZ-900"], recommended: [], rationale: "test fixture" }
  },
  critical_certs: ["AZ-204"],
  cert_metadata: {
    "AZ-204": { name: "Azure Developer", recommended_hours: 40, level: "intermediate" },
    "AZ-900": { name: "Azure Fundamentals", recommended_hours: 10, level: "beginner" }
  }
};

await test("scores auth-service: 1/2 members certified → 50%", async () => {
  const result = await assessTeamReadiness(
    { impactedAreas: ["auth-service"], prTitle: "feat: oauth", changeType: "feature", riskLevel: "high" },
    { certData: mockCertData, areaCertData: mockAreaCertData, ownershipTeamMap: { "auth-service": "auth-team" } }
  );
  assert.equal(result.overall_score, 50);
  assert.equal(result.total_count, 2);
  assert.equal(result.ready_count, 1);
});

await test("areas with no cert requirements score 100", async () => {
  const result = await assessTeamReadiness(
    { impactedAreas: ["web-frontend"], prTitle: "feat: style", changeType: "feature", riskLevel: "low" },
    { certData: mockCertData, areaCertData: mockAreaCertData, ownershipTeamMap: { "web-frontend": "frontend-team" } }
  );
  assert.equal(result.overall_score, 100);
  assert.equal(result.blocking_deployment, false);
});

await test("blocking_deployment=true when critical gap and score < 70", async () => {
  const result = await assessTeamReadiness(
    { impactedAreas: ["auth-service"], prTitle: "feat: auth", changeType: "feature", riskLevel: "high" },
    { certData: mockCertData, areaCertData: mockAreaCertData, ownershipTeamMap: { "auth-service": "auth-team" } }
  );
  assert.equal(result.blocking_deployment, true, "should block: AZ-204 critical gap, score 50% < 70%");
});

await test("gap for Bob includes AZ-204 study plan", async () => {
  const result = await assessTeamReadiness(
    { impactedAreas: ["auth-service"], prTitle: "feat: auth", changeType: "feature", riskLevel: "high" },
    { certData: mockCertData, areaCertData: mockAreaCertData, ownershipTeamMap: { "auth-service": "auth-team" } }
  );
  const bobGap = result.gaps.find(g => g.member_id === "ENG-102");
  assert.ok(bobGap, "Bob should have a gap");
  assert.ok(bobGap!.missing_certs.includes("AZ-204"));
  assert.ok(bobGap!.study_plans.some(p => p.certification === "AZ-204"));
});

// ── adjudicator — the Release Verdict (CLEAR / BLOCKED / ABSTAIN) ──────────────
// The AI agents FORM the analysis; the adjudicator OWNS the verdict. These tests
// pin the three reasoning behaviours that distinguish a verdict from a rubber
// stamp: authority resolution, abstention, and false-conflict rejection.

console.log("\nadjudicator — Release Verdict");

const mkMember = (id: string, team: string, certs: string[]): TeamMember => ({
  id, name: id, role: "Engineer", team, certifications: certs,
  meeting_hours_per_week: 8, focus_hours_per_week: 28, preferred_learning_slot: "morning"
});

const mkImpact = (areas: string[]): ImpactReport => ({
  summary: "test change", change_type: "feature", risk: { level: "medium", rationale: "test" },
  breaking_changes: [], impacted_areas: areas, audience: [], reasoning_trace: []
});

const mkReadiness = (over: Partial<TeamReadinessReport>): TeamReadinessReport => ({
  overall_score: 100, required_certifications: [], ready_count: 1, total_count: 1,
  gaps: [], blocking_deployment: false, reasoning_trace: [], ...over
});

// Synthetic ownership map — independent of config/ownership.json so the tests
// stay deterministic regardless of production config edits.
const ownership: OwnershipMap = {
  areas: [
    { name: "auth-service", pathPatterns: ["auth", "token"], team: "auth-team", contacts: ["auth-team@x.io"] },
    { name: "ghost-area", pathPatterns: ["ghost"], team: "ghost-team", contacts: [] } // ghost-team has NO roster members
  ],
  default_audience: ["releases@x.io"]
};

const areaCert: AreaCertData = {
  cert_metadata: {
    "SC-300": { name: "Identity Admin", recommended_hours: 30, level: "intermediate" },
    "SC-100": { name: "Cybersecurity Architect", recommended_hours: 40, level: "advanced" }
  },
  critical_certs: ["SC-300"],
  requirements: { "auth-service": { required: ["SC-300"], recommended: [], rationale: "auth needs identity cert" } }
  // cert_supersedes omitted → adjudicator falls back to DEFAULT_SUPERSEDES (SC-100 ⊃ SC-300)
};

await test("ABSTAIN — changed paths match no owning team (re-derives from the diff, not the model's guess)", () => {
  const v = adjudicate({
    changedPaths: ["experiments/churn/train.py", "research/eda.ipynb"],
    impactReport: mkImpact(["core-service"]), // the model guessed an area …
    teamReadiness: mkReadiness({ overall_score: 100 }),
    ownershipMap: ownership, areaCertData: areaCert, certData: { team_members: [mkMember("ENG-2", "auth-team", [])] }
  });
  assert.equal(v.decision, "ABSTAIN");        // … but no team owns the diff, so Herald abstains
  assert.ok(v.unowned_paths.length >= 2, "both substantive paths are unattributed");
  assert.ok(/ownership/i.test(v.headline));
});

await test("ABSTAIN — owning team is unstaffed (cannot assess an empty team)", () => {
  const v = adjudicate({
    changedPaths: ["ghost-module/config.ts"],
    impactReport: mkImpact(["ghost-area"]),
    teamReadiness: mkReadiness({ overall_score: 100 }),
    ownershipMap: ownership, areaCertData: areaCert, certData: { team_members: [mkMember("ENG-2", "auth-team", [])] }
  });
  assert.equal(v.decision, "ABSTAIN");
  assert.ok(v.unstaffed_areas.includes("ghost-area"));
});

await test("BLOCKED — a real, non-superseded critical certification gap owns the verdict", () => {
  const v = adjudicate({
    changedPaths: ["src/auth/token.ts"],
    impactReport: mkImpact(["auth-service"]),
    teamReadiness: mkReadiness({
      blocking_deployment: true, overall_score: 50, ready_count: 0, total_count: 1,
      gaps: [{ member_id: "ENG-2", name: "Bob", role: "Engineer", team: "auth-team", missing_certs: ["SC-300"], study_plans: [] }]
    }),
    ownershipMap: ownership, areaCertData: areaCert,
    certData: { team_members: [mkMember("ENG-2", "auth-team", [])] } // Bob holds no superseding credential
  });
  assert.equal(v.decision, "BLOCKED");
  assert.ok(v.real_blockers.length >= 1);
  assert.equal(v.false_conflicts_rejected.length, 0);
});

await test("CLEAR — false-conflict rejection lifts the block (SC-100 ⊃ SC-300)", () => {
  const v = adjudicate({
    changedPaths: ["src/auth/token.ts"],
    impactReport: mkImpact(["auth-service"]),
    teamReadiness: mkReadiness({
      blocking_deployment: true, overall_score: 50, ready_count: 0, total_count: 1,
      gaps: [{ member_id: "ENG-2", name: "Bob", role: "Engineer", team: "auth-team", missing_certs: ["SC-300"], study_plans: [] }]
    }),
    ownershipMap: ownership, areaCertData: areaCert,
    certData: { team_members: [mkMember("ENG-2", "auth-team", ["SC-100"])] } // SC-100 supersedes the required SC-300
  });
  assert.equal(v.decision, "CLEAR", "block lifted because every critical gap was a false conflict");
  assert.ok(v.false_conflicts_rejected.length >= 1);
  assert.equal(v.real_blockers.length, 0);
});

await test("CLEAR — ownership resolved, team staffed, no gaps", () => {
  const v = adjudicate({
    changedPaths: ["src/auth/token.ts"],
    impactReport: mkImpact(["auth-service"]),
    teamReadiness: mkReadiness({ blocking_deployment: false, overall_score: 100, ready_count: 1, total_count: 1 }),
    ownershipMap: ownership, areaCertData: areaCert,
    certData: { team_members: [mkMember("ENG-2", "auth-team", ["SC-300"])] }
  });
  assert.equal(v.decision, "CLEAR");
  assert.equal(v.unowned_paths.length, 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
