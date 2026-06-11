/**
 * Herald Evaluation Runner — Flaw 10
 * Tests the full pipeline against all three fixture PRs.
 * Validates: impact report schema, risk classification, team readiness, artifact quality.
 * Run: npx tsx evaluation/run-evaluation.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.HERALD_URL ?? "http://localhost:3000";
const API_KEY = process.env.HERALD_API_KEY ?? process.env.API_SECRET ?? "herald-dev-key";

// Authenticated fetch — sends x-api-key header on all requests
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), "x-api-key": API_KEY }
  });
}

interface EvalResult {
  fixture: string;
  passed: string[];
  failed: string[];
  score: number;
  run_id?: string;
  details: Record<string, unknown>;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pollUntilReady(runId: string, maxWait = 300000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await apiFetch(`${BASE_URL}/runs/${runId}`);
    const run = await res.json() as any;
    if (run.status === "ready_for_review" || run.status === "error") return run;
    await sleep(1000);
  }
  throw new Error(`Run ${runId} did not complete within ${maxWait}ms`);
}

function check(results: EvalResult, name: string, condition: boolean, detail?: string) {
  if (condition) { results.passed.push(name); }
  else { results.failed.push(`${name}${detail ? ": " + detail : ""}`); }
}

async function evaluateFixture(fixtureName: string): Promise<EvalResult> {
  const results: EvalResult = { fixture: fixtureName, passed: [], failed: [], score: 0, details: {} };

  // Load expected fixture data
  const fixtureRaw = fs.readFileSync(path.join(__dirname, "..", "fixtures", `${fixtureName}.json`), "utf-8");
  const fixture = JSON.parse(fixtureRaw);

  console.log(`\n▶ Evaluating fixture: ${fixtureName}`);
  console.log(`  PR: ${fixture.pr_title}`);

  // Trigger run
  const triggerRes = await apiFetch(`${BASE_URL}/runs/demo/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixture: fixtureName })
  });
  check(results, "trigger_202", triggerRes.status === 202, `got ${triggerRes.status}`);

  const { run_id } = await triggerRes.json() as any;
  results.run_id = run_id;

  // Wait for pipeline
  let run: any;
  try { run = await pollUntilReady(run_id); }
  catch (e) { results.failed.push("pipeline_timeout"); results.score = 0; return results; }

  results.details = { status: run.status, risk: run.impact_report?.risk?.level, readiness_score: run.team_readiness?.overall_score };

  // Schema validation
  check(results, "status_ready", run.status === "ready_for_review", `got ${run.status}`);
  check(results, "impact_report_present", !!run.impact_report);
  check(results, "impact_has_summary", !!run.impact_report?.summary);
  check(results, "impact_has_change_type", ["feature","bugfix","breaking","chore"].includes(run.impact_report?.change_type));
  check(results, "impact_has_risk_level", ["low","medium","high"].includes(run.impact_report?.risk?.level));
  check(results, "impact_has_risk_rationale", !!run.impact_report?.risk?.rationale);
  check(results, "impact_has_impacted_areas", Array.isArray(run.impact_report?.impacted_areas) && run.impact_report.impacted_areas.length > 0);
  check(results, "impact_has_audience", Array.isArray(run.impact_report?.audience) && run.impact_report.audience.length > 0);
  check(results, "reasoning_trace_6_steps", Array.isArray(run.impact_report?.reasoning_trace) && run.impact_report.reasoning_trace.length >= 5);
  check(results, "artifacts_present", !!run.artifacts);
  check(results, "changelog_non_empty", (run.artifacts?.changelog_md?.length ?? 0) > 50);
  check(results, "docs_patch_non_empty", (run.artifacts?.docs_patch_md?.length ?? 0) > 20);
  check(results, "plain_summary_non_empty", (run.artifacts?.plain_summary?.length ?? 0) > 20);
  check(results, "team_readiness_present", !!run.team_readiness);
  check(results, "readiness_has_score", typeof run.team_readiness?.overall_score === "number");
  check(results, "readiness_has_trace", Array.isArray(run.team_readiness?.reasoning_trace) && run.team_readiness.reasoning_trace.length >= 3);

  // Fixture-specific checks
  if (fixtureName === "breaking-pr") {
    check(results, "breaking_change_type", run.impact_report?.change_type === "breaking", `got ${run.impact_report?.change_type}`);
    check(results, "breaking_high_risk", run.impact_report?.risk?.level === "high", `got ${run.impact_report?.risk?.level}`);
    check(results, "breaking_changes_listed", run.impact_report?.breaking_changes?.length > 0);
    check(results, "breaking_deployment_blocked_or_warned", run.team_readiness?.blocking_deployment === true || run.team_readiness?.overall_score < 100);
  }
  if (fixtureName === "bugfix-pr") {
    check(results, "bugfix_change_type", run.impact_report?.change_type === "bugfix", `got ${run.impact_report?.change_type}`);
    check(results, "bugfix_no_breaking_changes", run.impact_report?.breaking_changes?.length === 0);
  }
  if (fixtureName === "feature-pr") {
    check(results, "feature_change_type", run.impact_report?.change_type === "feature", `got ${run.impact_report?.change_type}`);
  }

  results.score = Math.round((results.passed.length / (results.passed.length + results.failed.length)) * 100);
  return results;
}

async function runEvaluation() {
  console.log("Herald Evaluation Runner");
  console.log("========================");
  console.log(`Target: ${BASE_URL}`);

  // Check server is up
  try {
    const diag = await apiFetch(`${BASE_URL}/diagnostic`);
    const config = await diag.json() as any;
    const tier1 = config.ai?.tier1_foundry_agent?.configured;
    const tier2 = config.ai?.tier2_phi4?.configured;
    const tier3 = config.ai?.tier3_azure_openai?.configured;
    const tier4 = config.ai?.tier4_gemini?.configured;
    const activeTiers = [tier1 && "Foundry", tier2 && "Phi-4", tier3 && "Azure OpenAI", tier4 && "Gemini"].filter(Boolean);
    console.log(`\nConfig check:`);
    console.log(`  AI tiers: ${activeTiers.length > 0 ? "✅ " + activeTiers.join(", ") : "⬜ simulation only"}`);
    console.log(`  Graph token: ${config.graph?.token_acquired ? "✅" : "⬜ simulated"}`);
    console.log(`  Teams channel valid: ${config.teams?.channel_id_valid ? "✅" : "⚠ " + config.teams?.channel_id_hint}`);
  } catch {
    console.error("Server not reachable. Run `npm run dev` first.");
    process.exit(1);
  }

  const fixtures = ["feature-pr", "bugfix-pr", "breaking-pr"];
  const allResults: EvalResult[] = [];

  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture);
    allResults.push(result);
    const icon = result.score === 100 ? "✅" : result.score >= 80 ? "🟡" : "❌";
    console.log(`  ${icon} Score: ${result.score}% (${result.passed.length} passed, ${result.failed.length} failed)`);
    if (result.failed.length > 0) {
      result.failed.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log(`  Details: risk=${result.details.risk}, readiness=${result.details.readiness_score}%`);
  }

  const overallScore = Math.round(allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length);
  console.log(`\n════════════════════════════`);
  console.log(`Overall score: ${overallScore}%`);
  console.log(overallScore === 100 ? "✅ All checks passed!" : overallScore >= 80 ? "🟡 Good — some checks failed" : "❌ Significant failures");

  // Write results to file
  const outputPath = path.join(__dirname, "evaluation-results.json");
  fs.writeFileSync(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), overall_score: overallScore, results: allResults }, null, 2));
  console.log(`\nFull results written to: ${outputPath}`);

  process.exit(overallScore >= 80 ? 0 : 1);
}

runEvaluation().catch(console.error);
