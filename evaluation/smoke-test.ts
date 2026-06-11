/**
 * Herald smoke test suite.
 * Run with:  npm test
 *
 * Requires the server already running. Pass the session API key via env var:
 *   HERALD_TEST_KEY=<key>  npm test
 *
 * The key is printed at startup when API_SECRET is not set in .env.
 * In CI: set both API_SECRET and HERALD_TEST_KEY to the same value.
 */

const BASE = process.env.HERALD_BASE_URL ?? "http://localhost:3000";
const KEY  = process.env.HERALD_TEST_KEY  ?? "";

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `  →  ${detail}` : ""}`);
    failed++;
  }
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-api-key": KEY } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(path: string, data?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: data ? JSON.stringify(data) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Test groups ──────────────────────────────────────────────────────────────

async function testHealth() {
  console.log("\n── Health & config ──");
  const { status, body } = await get("/diagnostic");
  ok("GET /diagnostic → 200", status === 200);
  const d = body as Record<string, unknown>;
  ok("diagnostic.app_url is a string", typeof d?.app_url === "string");
  ok("diagnostic.webhook_url is a string", typeof d?.webhook_url === "string");
  ok("diagnostic has 4 AI tiers", typeof (d?.ai) === "object" && Object.keys(d.ai as object).length === 4);
  ok("diagnostic.repos.connected is a number", typeof (d as any)?.repos?.connected === "number");
}

async function testApiKeyEnforcement() {
  console.log("\n── API key enforcement ──");
  const unauthRepos = await fetch(`${BASE}/api/repos`);
  ok("GET /api/repos without key → 401", unauthRepos.status === 401);

  const unauthDemo = await fetch(`${BASE}/runs/demo/trigger`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok("POST /runs/demo/trigger without key → 401", unauthDemo.status === 401);

  const unauthReject = await fetch(`${BASE}/runs/fake-id/reject`, { method: "POST" });
  ok("POST /runs/:id/reject without key → 401", unauthReject.status === 401);
}

async function testClientToken() {
  console.log("\n── Client token endpoint ──");
  const same = await fetch(`${BASE}/api/client-token`, { headers: { Origin: BASE } });
  ok("GET /api/client-token same-origin → 200", same.status === 200);
  const body = await same.json() as { token?: string };
  ok("token is a non-empty string", typeof body.token === "string" && body.token.length > 10);

  const evil = await fetch(`${BASE}/api/client-token`, { headers: { Origin: "https://evil.example.com" } });
  ok("GET /api/client-token external origin → 403", evil.status === 403);
}

async function testPrCrud() {
  console.log("\n── PR CRUD ──");
  const list = await get("/api/prs");
  ok("GET /api/prs → 200", list.status === 200);
  const lb = list.body as { total?: number; items?: unknown[] };
  ok("response has total and items array", typeof lb.total === "number" && Array.isArray(lb.items));

  const create = await post("/api/prs", { title: "smoke: create test", authorName: "CI Bot", type: "CHORE", branch: "ci/smoke" });
  ok("POST /api/prs → 201", create.status === 201);
  const pr = create.body as { id?: string; changedFiles?: string[] };
  ok("created PR has an id", typeof pr.id === "string");
  ok("created PR.changedFiles is empty array (no fake source files)", Array.isArray(pr.changedFiles) && pr.changedFiles.length === 0);

  if (pr.id) {
    const single = await get(`/api/prs/${pr.id}`);
    ok(`GET /api/prs/${pr.id} → 200`, single.status === 200);

    const missing = await get("/api/prs/NONEXISTENT");
    ok("GET /api/prs/NONEXISTENT → 404", missing.status === 404);
  }
}

async function testRepos() {
  console.log("\n── Repository management ──");
  const list = await get("/api/repos");
  ok("GET /api/repos → 200", list.status === 200);
  ok("GET /api/repos returns an array", Array.isArray(list.body));

  const repos = list.body as Array<Record<string, unknown>>;
  if (repos.length > 0) {
    ok("repos list does not expose webhook_secret", repos.every(r => !("webhook_secret" in r)));
  }

  // Invalid name rejected
  const bad = await post("/api/repos", { full_name: "not-a-valid-repo!!!" });
  ok("POST /api/repos rejects invalid name → 400", bad.status === 400);
}

async function testPipeline() {
  console.log("\n── Pipeline (demo run) ──");
  const trigger = await post("/runs/demo/trigger", {
    pr_title: "smoke: pipeline test",
    branch: "ci/smoke",
    repository: "smoke/herald"
  });
  ok("POST /runs/demo/trigger → 202", trigger.status === 202);
  const runId = (trigger.body as { run_id?: string }).run_id;
  ok("trigger returns run_id", typeof runId === "string");

  if (!runId) return;

  // Poll up to 270s (> 240s pipeline timeout) for completion.
  // With real AI tiers (Phi-4 65s timeout × 3 agents) the pipeline can take ~3 minutes.
  // The pipeline itself times out at 240s and transitions to "error", so we always see a terminal state.
  process.stdout.write("  Polling");
  let finalStatus = "reasoning";
  for (let i = 0; i < 90; i++) {
    await sleep(3000);
    const { body } = await get(`/runs/${runId}`);
    finalStatus = (body as { status?: string }).status ?? "unknown";
    if (finalStatus !== "reasoning" && finalStatus !== "acting") break;
    if (i % 10 === 9) process.stdout.write(`\n  (${(i + 1) * 3}s)`);
    else process.stdout.write(".");
  }
  console.log(` → ${finalStatus}`);

  ok("run reaches terminal state", ["ready_for_review", "done", "error"].includes(finalStatus), `got: ${finalStatus}`);

  if (finalStatus === "ready_for_review") {
    const { body: rb } = await get(`/runs/${runId}`);
    const r = rb as { impact_report?: { risk?: { level?: string } }; artifacts?: { changelog_md?: string }; linked_pr_id?: string };
    ok("run has impact_report.risk.level", ["low", "medium", "high"].includes(r.impact_report?.risk?.level ?? ""));
    ok("run has artifacts.changelog_md", typeof r.artifacts?.changelog_md === "string" && r.artifacts.changelog_md.length > 0);
  }
}

async function testGraphDiagnostic() {
  console.log("\n── Graph token diagnostic ──");
  const { status, body } = await get("/api/graph/test");
  ok("GET /api/graph/test → 200", status === 200);
  ok("response has ok field", typeof (body as { ok?: unknown }).ok === "boolean");
  const b = body as { ok: boolean; reason?: string; hint?: string };
  if (!b.ok) console.log(`    Graph credentials issue: ${b.reason ?? b.hint ?? "check /api/graph/test for details"}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Herald Smoke Tests — ${BASE}`);
  console.log("═".repeat(52));

  if (!KEY) {
    console.warn("\nWARNING: HERALD_TEST_KEY is not set.");
    console.warn("API key enforcement tests will fail.");
    console.warn("Copy the session key printed at server startup and run:");
    console.warn("  HERALD_TEST_KEY=<key> npm test\n");
  }

  await testHealth();
  await testApiKeyEnforcement();
  await testClientToken();
  await testPrCrud();
  await testRepos();
  await testPipeline();
  await testGraphDiagnostic();

  console.log("\n" + "═".repeat(52));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n${failed} test(s) FAILED.`);
    process.exit(1);
  }
  console.log("\nAll tests passed.");
}

main().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
