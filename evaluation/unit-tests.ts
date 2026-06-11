/**
 * Herald unit tests — pure logic, no server required.
 * Run with:  npx tsx evaluation/unit-tests.ts
 */
import assert from "node:assert/strict";
import { extractJson } from "../agents/foundry-agent-client.js";
import { normalizeReport, isTemplateEcho } from "../agents/reasoning-agent.js";
import { assessTeamReadiness } from "../agents/readiness-agent.js";
import type { CertData, AreaCertData } from "../lib/pipeline.js";

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
    "auth-service": { required: ["AZ-204", "AZ-900"] }
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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
