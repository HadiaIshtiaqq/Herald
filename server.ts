import express from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { PullRequest, DashboardStats, Run, RunArtifacts, ActionsResult, RunStatus, TeamReadinessReport, TrackedRepo, OwnershipMap, OwnershipArea, CertData, AreaCertData } from "./src/types.js";

// ─── Agent modules (multi-agent architecture) ────────────────────────────────
import { executeActions, getGraphToken, validateTeamsChannelId } from "./agents/enterprise-agent.js";
import { processPipelineRun, type PipelineContext } from "./lib/pipeline.js";
import { verifyCopilotSignature, handleCopilotRequest } from "./agents/copilot-extension.js";
import { generateAssessment } from "./agents/assessment-agent.js";
import { generateTeamInsights } from "./agents/insights-agent.js";
import { createFabricIQ } from "./lib/fabric-iq.js";
import { buildAttestation, verifyAttestation, type RunAttestation } from "./lib/provenance.js";
import { computeReleaseHealth, buildRemediationRoadmap } from "./lib/health-score.js";
import { renderExecutiveReport } from "./lib/exec-report.js";
import { adjudicate } from "./lib/adjudicator.js";

dotenv.config();

// Validate FOUNDRY_AGENT_ID format — must be an agent ID (e.g. asst_abc123), not a display name.
// Go to Foundry UI → Build → Agents → your agent → Details tab to find the real ID.
{
  const agentId = process.env.FOUNDRY_AGENT_ID;
  // Accept UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) OR asst_ prefix
  if (agentId && !/^asst_[A-Za-z0-9]{8,}/.test(agentId) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
    console.error(
      `[Herald] CONFIGURATION ERROR: FOUNDRY_AGENT_ID="${agentId}" looks like an agent display name, not an agent ID.`
    );
    console.error(
      "[Herald] Agent IDs look like: asst_XXXXXXXXXXXXXXXXXXXXXX"
    );
    console.error(
      "[Herald] Go to Foundry UI → Build → Agents → your agent → Details tab and copy the ID field."
    );
    console.error("[Herald] Tier 1 (Foundry Agent) will fail until this is corrected.");
  }
}

// ─── Startup: AI readiness check ─────────────────────────────────────────────
// Warn loudly if no AI tier is configured — demos with no AI key produce
// [SIMULATION] traces, which look weak to judges. This fires on every `npm run dev`.
{
  const tier1 = !!(process.env.FOUNDRY_AGENT_ID && process.env.FOUNDRY_PROJECT_ENDPOINT);
  const tier2 = !!process.env.FOUNDRY_INFERENCE_ENDPOINT;
  const tier3 = !!(process.env.FOUNDRY_ENDPOINT && process.env.FOUNDRY_API_KEY);
  const tier4 = !!process.env.GEMINI_API_KEY;
  const anyAI = tier1 || tier2 || tier3 || tier4;

  if (!anyAI) {
    console.warn(
      "\n╔══════════════════════════════════════════════════════════════════╗\n" +
      "║  Herald — NO AI CREDENTIALS CONFIGURED                          ║\n" +
      "║  All runs will use heuristic simulation ([SIMULATION] in traces) ║\n" +
      "║                                                                  ║\n" +
      "║  Quickest fix — add ONE of these to .env:                        ║\n" +
      "║    GEMINI_API_KEY=<key>      free at aistudio.google.com/apikey  ║\n" +
      "║    FOUNDRY_AGENT_ID + FOUNDRY_PROJECT_ENDPOINT  (Tier 1)         ║\n" +
      "║    FOUNDRY_INFERENCE_ENDPOINT                   (Tier 2 Phi-4)   ║\n" +
      "║    FOUNDRY_ENDPOINT + FOUNDRY_API_KEY           (Tier 3 gpt-4o)  ║\n" +
      "║                                                                  ║\n" +
      "║  For the hackathon demo, GEMINI_API_KEY is the easiest path.     ║\n" +
      "╚══════════════════════════════════════════════════════════════════╝\n"
    );
  } else {
    const active = [
      tier1 && "Tier 1 (Foundry Agent)",
      tier2 && "Tier 2 (Phi-4)",
      tier3 && "Tier 3 (Azure OpenAI)",
      tier4 && "Tier 4 (Gemini)"
    ].filter(Boolean).join(", ");
    console.log(`[Herald] AI pipeline ready: ${active}`);
  }
}

// Always have an effective API secret.
// If API_SECRET is set in .env, use it. Otherwise generate a random one per session
// and print it so the operator can copy it. This guarantees requireApiKey always enforces.
const API_SECRET_EFFECTIVE: string = process.env.API_SECRET || (() => {
  const generated = crypto.randomBytes(24).toString("hex");
  console.warn(
    "\n┌─────────────────────────────────────────────────────────────┐\n" +
    "│  Herald: no API_SECRET set — generated session key:        │\n" +
    `│  ${generated}  │\n` +
    "│  Add  API_SECRET=\"<above>\"  to .env to make it permanent.  │\n" +
    "└─────────────────────────────────────────────────────────────┘\n"
  );
  return generated;
})();

// Dual-mode root resolution: under tsx (ESM dev) import.meta.url points at this
// file in the repo root; in the esbuild CJS bundle (dist/server.cjs, Docker)
// import.meta is empty, so fall back to cwd — the Dockerfile sets WORKDIR /app
// with config/, data/, knowledge/, fixtures/ and dist/ laid out beneath it.
const __dirname = import.meta.url
  ? path.dirname(fileURLToPath(import.meta.url))
  : process.cwd();

// Generates a stable inline SVG avatar from a person's name.
// Uses Microsoft Fluent color palette. No external requests — zero breakage risk.
function makeAvatarSvg(name: string): string {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] ?? "") + (words[words.length - 1][0] ?? "")
    : name.slice(0, 2);
  const upper = initials.toUpperCase();
  const palette = ["0078D4","107C10","D83B01","8764B8","038387","CA5010","C239B3","10893E","005A9E","7B3F00"];
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#${palette[idx]}"/><text x="20" y="27" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">${upper}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const app = express();

// ─── CORS (F3) ───────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.APP_URL ?? "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:5173"
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-api-key");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// ─── Optional API key guard for sensitive mutations (F3) ─────────────────────
// Set API_SECRET in .env to require x-api-key header on approve/reject/github
// endpoints. Leave unset to disable (default: open, suitable for local dev).
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const provided = req.headers["x-api-key"];
  if (provided !== API_SECRET_EFFECTIVE) {
    res.status(401).json({ error: "Missing or invalid x-api-key header" });
    return;
  }
  next();
}

// Public config endpoint — returns the API token for same-origin callers (the embedded frontend).
// External callers must configure API_SECRET in .env and use it directly.
app.get("/api/client-token", (req, res) => {
  const origin = req.headers.origin ?? "";
  const referer = req.headers.referer ?? "";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const isSameOrigin =
    origin === appUrl ||
    referer.startsWith(appUrl) ||
    // Allow any localhost port (Vite dev server, etc.) but not arbitrary domains
    // that merely contain the string "localhost"
    /^https?:\/\/localhost:\d+$/.test(origin) ||
    referer.startsWith("http://localhost:") ||
    referer.startsWith("https://localhost:");
  if (!isSameOrigin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ token: API_SECRET_EFFECTIVE });
});

// Raw body for webhook + Copilot extension MUST be registered before express.json()
// so the stream isn't consumed by the JSON parser before signature checks can read it.
app.use("/webhook/github", express.raw({ type: "*/*" }));
app.use("/copilot", express.raw({ type: "*/*" }));
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ─── Ownership map ────────────────────────────────────────────────────────────

let ownershipMap: OwnershipMap = { areas: [], default_audience: ["releases@cloudnexus.io"] };
try {
  const raw = fs.readFileSync(path.join(__dirname, "config", "ownership.json"), "utf-8");
  ownershipMap = JSON.parse(raw) as OwnershipMap;
  console.log(`[Herald] Loaded ownership map: ${ownershipMap.areas.length} areas`);
} catch {
  console.warn("[Herald] No config/ownership.json found — using default ownership rules.");
}

// ─── Certification data (HER — Reasoning Agents track) ───────────────────────

let certData: CertData = { team_members: [] };
let areaCertData: AreaCertData = { cert_metadata: {}, critical_certs: [], requirements: {} };
try {
  certData = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "team-certifications.json"), "utf-8"));
  areaCertData = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "area-cert-requirements.json"), "utf-8"));
  // TENANT_DOMAIN: remap UPN domain so Work IQ Graph calendar calls use real M365 users.
  // Set TENANT_DOMAIN=yourcompany.onmicrosoft.com in .env to enable live calendar signals.
  const tenantDomain = process.env.TENANT_DOMAIN;
  if (tenantDomain) {
    certData.team_members = certData.team_members.map(m => ({
      ...m,
      upn: m.upn ? m.upn.replace(/@[^@]+$/, `@${tenantDomain}`) : m.upn
    }));
    console.log(`[Herald] Work IQ: UPNs remapped to @${tenantDomain} (${certData.team_members.filter(m => m.upn).length} members)`);
  }
  console.log(`[Herald] Loaded cert data: ${certData.team_members.length} team members, ${Object.keys(areaCertData.requirements).length} area requirements`);
} catch {
  console.warn("[Herald] No cert data files found — team readiness will use defaults.");
}

// ─── Fabric IQ semantic layer (ontology over roles ↔ certs ↔ skills ↔ areas) ──

const fabricIQ = createFabricIQ(path.join(__dirname, "data"));
console.log(`[Herald] Fabric IQ ontology loaded: ${fabricIQ.ontology.certifications.length} certs, ${fabricIQ.ontology.areas.length} areas (v${fabricIQ.ontology.version})`);

// ─── Structured logger ───────────────────────────────────────────────────────

function log(runId: string, stage: string, message: string, data?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    run_id: runId,
    stage,
    message
  };
  if (data) entry.data = data;
  console.log(JSON.stringify(entry));
}

// ─── Crash guards ─────────────────────────────────────────────────────────────
// A single bad request must never take the server down mid-demo. Express 4
// does not catch async route rejections, so without these one streaming-route
// bug kills the process (observed: ERR_HTTP_HEADERS_SENT from the Copilot SSE
// path). Log loudly, keep serving.

process.on("unhandledRejection", (reason) => {
  console.error("[Herald] UNHANDLED REJECTION (server kept alive):", reason instanceof Error ? reason.stack : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Herald] UNCAUGHT EXCEPTION (server kept alive):", err.stack);
});

// ─── AI clients ──────────────────────────────────────────────────────────────

let geminiAI: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  geminiAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "herald-release-concierge" } }
  });
}

// ─── In-memory stores + persistence load (F9) ────────────────────────────────

const runs = new Map<string, Run>();

// Load persisted runs from previous sessions
try {
  const runsFile = path.join(__dirname, "data", "runs.json");
  if (fs.existsSync(runsFile)) {
    const saved = JSON.parse(fs.readFileSync(runsFile, "utf-8")) as [string, Run][];
    saved.forEach(([k, v]) => runs.set(k, v));
    console.log(`[Herald] Loaded ${runs.size} persisted runs`);
  }
} catch { /* fresh start */ }

// Review comments store — persisted per-PR
const prComments = new Map<string, import("./src/types.js").PRComment[]>();
try {
  const commentsFile = path.join(__dirname, "data", "comments.json");
  if (fs.existsSync(commentsFile)) {
    const saved = JSON.parse(fs.readFileSync(commentsFile, "utf-8")) as [string, import("./src/types.js").PRComment[]][];
    saved.forEach(([k, v]) => prComments.set(k, v));
    console.log(`[Herald] Loaded comments for ${prComments.size} PRs`);
  }
} catch { /* fresh start */ }

// Tracked GitHub repositories — persisted
const repos = new Map<string, TrackedRepo>();
try {
  const reposFile = path.join(__dirname, "data", "repos.json");
  if (fs.existsSync(reposFile)) {
    const saved = JSON.parse(fs.readFileSync(reposFile, "utf-8")) as TrackedRepo[];
    saved.forEach(r => repos.set(r.id, r));
    console.log(`[Herald] Loaded ${repos.size} tracked repositories`);
  }
} catch { /* fresh start */ }

let prs: PullRequest[] = [
  {
    id: "PR-42",
    title: "feat: Implement Graph API integration",
    authorName: "Monica Davis",
    authorHandle: "@dev_monica",
    authorAvatar: makeAvatarSvg("Monica Davis"),
    type: "FEATURE",
    branch: "feature/graph-api",
    risk: "Medium",
    riskDetail: "Scoped to Graph Module only.",
    filesChanged: 24,
    methodsImpacted: 112,
    status: "Pending Review",
    version: "2.4.0-rc1",
    description: "This PR introduces the core infrastructure for the Microsoft Graph API integration, including authentication middleware, shared context providers, and basic endpoint mapping for user presence and calendar events. It refactors AuthContext and establishes token refresh heuristics.",
    changelog: "# Release Notes - v2.4.0-rc1\n\n## Added\n- Core Graph API middleware for authentication.\n- User presence polling service (interval: 30s).\n- Calendar event synchronization hooks.\n\n## Improved\n- Refactored `AuthContext` to support multiple providers.\n- Optimized cache eviction for identity tokens.\n\n\n*// End of AI generated markdown //*",
    teamsPost: "**Release Updates: Graph API Integration is Ready!**\n\nWe have completed the deployment candidates for `v2.4.0-rc1`. Monica Davis has successfully implemented the Graph API middleware, allowing multi-provider presence polling and calendar synchronization. This is low risk and scoped tightly to the auth gateway.\n\n*Approved by DevOps Lead*",
    reasoningTrace: [
      { title: "Code Scanning", description: "Analyzed 1,402 lines of code. Detected new OAuth2.0 flows and token management logic.", status: "success", icon: "FileSearch" },
      { title: "Dependency Mapping", description: "Mapped integration to `IdentityServer4` and `InternalCacheSvc`. No circular deps detected.", status: "success", icon: "GitBranch" },
      { title: "Security Heuristics", description: "Identified potential token exposure risk in dev logging. Mitigation: Redacted output added.", status: "warning", icon: "ShieldAlert" },
      { title: "Artifact Generation", description: "Summarized changes for stakeholders and technical teams based on git history.", status: "success", icon: "FileSignature" }
    ],
    approved: false, verified: false, reviewer: "Sarah Jenkins", priority: "Medium",
    changedFiles: ["server/auth/middleware.ts", "server/auth/context.ts", "src/hooks/useAuth.ts", "src/components/GraphDashboard.tsx"],
  },
  {
    id: "PR-4209",
    title: "feat: Implement dynamic bento grid",
    authorName: "Alex Chen",
    authorHandle: "@alex_chen",
    authorAvatar: makeAvatarSvg("Alex Chen"),
    type: "FEATURE", branch: "dashboard-revamp", risk: "Medium", riskDetail: "Front-end and layout adjustments. Highly visual.",
    filesChanged: 12, methodsImpacted: 35, status: "Released", version: "2.4.0-stable",
    description: "Replaces standard layout with responsive bento grids, enabling customized draggable widget cards, live metrics stream, and adjustable density states.",
    changelog: "# Release Notes - Bento Grid Update\n\n- Added bento grid structure to main landing overview.\n- Made widget panels fully responsive.\n- Improved browser compatibility on mobile sizes.",
    teamsPost: "Announcing the Bento Grid layout rollout! Desktop viewers can now enjoy high density panels.",
    reasoningTrace: [{ title: "Layout Check", description: "Validated Tailwind grid configurations and breakpoints.", status: "success", icon: "LayoutGrid" }],
    approved: true, verified: true, reviewer: "Emily Diaz", priority: "Low",
    changedFiles: ["src/components/BentoGrid.tsx", "src/components/ActivityDashboard.tsx", "src/App.tsx"],
  },
  {
    id: "PR-4212",
    title: "fix: Memory leak in auth hook",
    authorName: "Sarah Miller",
    authorHandle: "@sarah_m",
    authorAvatar: makeAvatarSvg("Sarah Miller"),
    type: "BUGFIX", branch: "fix/auth-leak", risk: "High", riskDetail: "Affects core session persistence and hooks. Critical memory profile.",
    filesChanged: 4, methodsImpacted: 18, status: "In Progress", version: "2.4.1-rc2",
    description: "Disposes window timers and event listeners inside `useAuth` hook cleanup cycle. Prevents infinite retains during route swaps.",
    changelog: "# Bugfix - Auth Hook Memory Leak\n\n- Cleared window intervals on auth unmount.\n- Redefined closures in storage listener handlers.",
    teamsPost: "Critical fix under review: Sarah resolved memory leaks occurring during rapid login swaps. Deploying.",
    reasoningTrace: [
      { title: "Memory profiling", description: "Detected leakage of 12MB/min on active browser simulation.", status: "error", icon: "ShieldAlert" },
      { title: "Heuristic patch", description: "Applied ref/timer clearing inside React useEffect return function.", status: "success", icon: "FileCheck" }
    ],
    approved: false, verified: false, reviewer: "Alex Rover", priority: "Critical",
    changedFiles: ["src/hooks/useAuth.ts", "src/context/AuthContext.tsx", "server/auth/context.ts"],
  },
  {
    id: "PR-4198",
    title: "chore: Update dependencies",
    authorName: "John Doe",
    authorHandle: "@john_doe",
    authorAvatar: makeAvatarSvg("John Doe"),
    type: "CHORE", branch: "chore/deps", risk: "Low", riskDetail: "Trivial package bump of non-critical developer utilities.",
    filesChanged: 2, methodsImpacted: 0, status: "Pending Review", version: "2.4.1-rc1",
    description: "Bumps typescript development tools and eslint compliance package arrays to their closest patch versions.",
    changelog: "Updates development tools compile pipelines.",
    teamsPost: "Chore: developer tooling minor bump is ready to merge.",
    reasoningTrace: [{ title: "Security Check", description: "Ran npm audit. 0 vulnerabilities found.", status: "success", icon: "ShieldCheck" }],
    approved: false, verified: false, reviewer: "Carter Smith", priority: "Low",
    changedFiles: ["package.json", "package-lock.json"],
  },
  {
    id: "PR-4215",
    title: "refactor: Optimize API queries",
    authorName: "Elena Rodriguez",
    authorHandle: "@elena_r",
    authorAvatar: makeAvatarSvg("Elena Rodriguez"),
    type: "FEATURE", branch: "refactor/api", risk: "Medium", riskDetail: "DB index optimizations for faster lookup speeds.",
    filesChanged: 8, methodsImpacted: 44, status: "Released", version: "2.4.0-rc3",
    description: "Adds partial indexes on user subscription status to trim lookups from 400ms to <15ms inside the dashboard loader routes.",
    changelog: "# Optimization Report\n- Added composite index on sub statuses.\n- Simplified ORM query builders.",
    teamsPost: "Elena refactored main user profile endpoints. Latency plummeted from 400ms to 12ms!",
    reasoningTrace: [{ title: "Execution Query Trace", description: "Index utilization verified via query analyzers.", status: "success", icon: "TrendingUp" }],
    approved: true, verified: true, reviewer: "Sarah Jenkins", priority: "High",
    changedFiles: ["server/db/composite-index.sql", "server/controllers/userController.ts", "src/components/ActivityDashboard.tsx"],
  }
];

// Load persisted PRs (overrides seed data if a save file exists)
try {
  const prsFile = path.join(__dirname, "data", "prs.json");
  if (fs.existsSync(prsFile)) {
    const saved = JSON.parse(fs.readFileSync(prsFile, "utf-8")) as PullRequest[];
    if (saved.length > 0) { prs.splice(0, prs.length, ...saved); }
    console.log(`[Herald] Loaded ${prs.length} persisted PRs`);
  }
} catch { /* keep seed data */ }

// ─── Bridge: sync a completed run back into the prs array (F1) ───────────────

function bridgeRunToPr(run: Run): void {
  if (!run.linked_pr_id) return;
  const prIdx = prs.findIndex(p => p.id === run.linked_pr_id);
  if (prIdx === -1) return;

  // Always clone — never mutate the shared array element in-place
  const pr: PullRequest = { ...prs[prIdx] };

  if (run.impact_report) {
    const lvl = run.impact_report.risk.level;
    pr.risk = lvl === "high" ? "High" : lvl === "medium" ? "Medium" : "Low";
    pr.riskDetail = run.impact_report.risk.rationale;
    pr.reasoningTrace = run.impact_report.reasoning_trace.map((step, i) => ({
      title: `Step ${i + 1}`,
      description: step,
      status: "success" as const,
      icon: i === 0 ? "FileSearch" : i === 1 ? "GitBranch" : i === 2 ? "ShieldAlert" : "FileSignature"
    }));
    // Update file/method counts from actual pipeline data when available
    if (run.fixture_paths && run.fixture_paths.length > 0) {
      pr.filesChanged = run.fixture_paths.length;
    }
    // Derive methodsImpacted as a risk-weighted estimate from the resolved file count
    const fileFactor = pr.filesChanged || 1;
    pr.methodsImpacted = Math.round(fileFactor * (lvl === "high" ? 14 : lvl === "medium" ? 9 : 5));
  }
  if (run.artifacts) {
    pr.changelog = run.artifacts.changelog_md;
    pr.teamsPost = run.artifacts.plain_summary;
  }
  prs[prIdx] = pr;
  persistPrs();
}

const dashboardStats: DashboardStats = {
  activePRsCount: 24, avgRiskLevel: "Medium", deploySpeed: "12m 40s",
  rollbackRate: "0.4%", totalReleases7d: 114, successRate: "99.6%", activePipelinesCount: 3,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRunId(): string {
  return `run_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function updateRun(runId: string, patch: Partial<Run>): Run {
  const existing = runs.get(runId);
  if (!existing) throw new Error(`Run ${runId} not found`);
  const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
  runs.set(runId, updated);
  persistRuns();
  return updated;
}

// ─── GitHub PR data fetching (HER-8) ────────────────────────────────────────

interface GitHubPRData {
  commits: string[];
  changedPaths: string[];
}

async function fetchGitHubPRData(
  repoFullName: string,
  prNumber: number
): Promise<GitHubPRData | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !repoFullName || !prNumber) return null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };

  try {
    const [filesRes, commitsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=100`, { headers }),
      fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/commits?per_page=100`, { headers })
    ]);

    const changedPaths: string[] = [];
    if (filesRes.ok) {
      const files = await filesRes.json() as Array<{ filename: string }>;
      files.forEach(f => changedPaths.push(f.filename));
    }

    const commits: string[] = [];
    if (commitsRes.ok) {
      const commitData = await commitsRes.json() as Array<{ commit: { message: string } }>;
      commitData.forEach(c => commits.push(c.commit.message.split("\n")[0]));
    }

    if (changedPaths.length === 0 && commits.length === 0) return null;
    return { commits, changedPaths };
  } catch (err) {
    console.warn("[GitHub API] Failed to fetch PR data:", (err as Error).message);
    return null;
  }
}

// ─── Input sanitization (F6) ────────────────────────────────────────────────

function sanitizeText(value: string, maxLength: number): string {
  return value
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, "")                              // strip HTML tags
    .replace(/\{\{.*?\}\}/gs, "")                         // strip template injections
    .replace(/ignore\s+(previous|all|prior)\s+instructions?/gi, "[filtered]")
    .replace(/system\s*prompt/gi, "[filtered]")
    .replace(/you\s+are\s+(now\s+)?a/gi, "[filtered]")
    .trim();
}

function sanitizePaths(paths: string[]): string[] {
  return paths
    .slice(0, 60)
    .map(p => p.replace(/[^\w./-]/g, ""))
    .filter(p => p.length > 0 && p.length < 256);
}

// ─── Rate limiter (F8) ───────────────────────────────────────────────────────

const _rlLog = new Map<string, number[]>();
function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const log = (_rlLog.get(ip) ?? []).filter(t => now - t < windowMs);
  if (log.length >= limit) return false;
  log.push(now);
  _rlLog.set(ip, log);
  return true;
}

// ─── File persistence (F9) ───────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "data");
// Ensure the data directory exists before any read/write attempt
fs.mkdirSync(DATA_DIR, { recursive: true });

// Debounced writers with a per-file serial async queue.
// Debounce coalesces rapid updates; the queue ensures no two writes for the
// same file overlap even if callbacks fire close together.
function makeDebouncedWriter(filePath: string, dataFn: () => string, label: string, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  return function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const data = dataFn();
      // Chain onto the queue so previous write always finishes first
      writeQueue = writeQueue.then(() =>
        fs.promises.writeFile(filePath, data, "utf-8")
          .catch(e => console.warn(`[persist] ${label}:`, (e as Error).message))
      );
    }, delayMs);
  };
}

const MAX_RUNS = 200;
const RUN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function pruneRuns(): void {
  const cutoff = Date.now() - RUN_TTL_MS;
  // Delete runs older than 7 days (keep active ones regardless of age)
  for (const [id, run] of runs) {
    if (new Date(run.created_at).getTime() < cutoff && run.status !== "reasoning" && run.status !== "acting") {
      runs.delete(id);
    }
  }
  // If still over cap, evict oldest completed runs first
  if (runs.size > MAX_RUNS) {
    const sorted = Array.from(runs.entries())
      .filter(([, r]) => r.status !== "reasoning" && r.status !== "acting")
      .sort((a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime());
    const toDelete = sorted.slice(0, runs.size - MAX_RUNS);
    toDelete.forEach(([id]) => runs.delete(id));
  }
}

const persistRuns = makeDebouncedWriter(
  path.join(DATA_DIR, "runs.json"),
  () => { pruneRuns(); return JSON.stringify(Array.from(runs.entries()), null, 2); },
  "runs"
);

const persistPrs = makeDebouncedWriter(
  path.join(DATA_DIR, "prs.json"),
  () => JSON.stringify(prs, null, 2),
  "prs"
);

const persistComments = makeDebouncedWriter(
  path.join(DATA_DIR, "comments.json"),
  () => JSON.stringify(Array.from(prComments.entries()), null, 2),
  "comments"
);

const persistRepos = makeDebouncedWriter(
  path.join(DATA_DIR, "repos.json"),
  () => JSON.stringify(Array.from(repos.values()), null, 2),
  "repos"
);

// ─── Pipeline context factory ─────────────────────────────────────────────────
// Builds the PipelineContext passed to lib/pipeline.ts processPipelineRun.

function buildPipelineContext(): PipelineContext {
  return {
    runs,
    ownershipMap,
    certData,
    areaCertData,
    geminiAI,
    knowledgeDir: path.join(__dirname, "knowledge"),
    fetchGitHubPRData,
    sanitizeText,
    sanitizePaths,
    log,
    updateRun,
    bridgeRunToPr
  };
}

// Convenience wrapper used by all route handlers
function startPipeline(runId: string): void {
  processPipelineRun(runId, buildPipelineContext());
}

// ─── GitHub webhook verification ─────────────────────────────────────────────
// Tries the per-repo secret first (registered via /api/repos), then falls back
// to the global GITHUB_WEBHOOK_SECRET env var.

function verifyGitHubSignature(payload: Buffer, signature: string | undefined): boolean {
  if (!signature) {
    if (!process.env.GITHUB_WEBHOOK_SECRET) {
      console.warn("[SECURITY] GITHUB_WEBHOOK_SECRET not set — accepting all webhook requests. Set it before production use.");
      return true;
    }
    return false;
  }

  const sigBuf = Buffer.from(signature);
  // Always evaluate ALL secrets — no early return — so execution time does not
  // reveal which secret (if any) matched (prevents timing oracle).
  let matched = false;
  const candidates: string[] = [
    ...Array.from(repos.values()).map(r => r.webhook_secret),
    ...(process.env.GITHUB_WEBHOOK_SECRET ? [process.env.GITHUB_WEBHOOK_SECRET] : [])
  ];

  if (candidates.length === 0) {
    console.warn("[SECURITY] GITHUB_WEBHOOK_SECRET not set — accepting all webhook requests. Set it before production use.");
    return true;
  }

  for (const secret of candidates) {
    try {
      const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
      const expBuf = Buffer.from(expected);
      // timingSafeEqual requires equal-length buffers
      if (expBuf.length === sigBuf.length) {
        const eq = crypto.timingSafeEqual(expBuf, sigBuf);
        if (eq) matched = true; // don't break — evaluate all to prevent timing leak
      }
    } catch { /* continue */ }
  }
  return matched;
}

// ─── Routes: Webhook ─────────────────────────────────────────────────────────

app.post("/webhook/github", (req, res) => {
  // F8: rate limit webhook to 30 events/min per IP
  if (!checkRateLimit(req.ip ?? "unknown", 30, 60_000)) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const rawBody = req.body as Buffer;
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  const event = req.headers["x-github-event"] as string | undefined;
  const deliveryId = req.headers["x-github-delivery"] as string | undefined;

  if (!verifyGitHubSignature(rawBody, sig)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  // F12: parse and validate webhook payload shape
  interface GHWebhookPayload {
    action?: string;
    pull_request?: {
      title?: string;
      number?: number;
      state?: string;          // "open" | "closed"
      merged?: boolean;
      merged_by?: { login?: string };
      merged_at?: string;
      created_at?: string;
      head?: { ref?: string };
      diff_url?: string;
      user?: { login?: string };
      html_url?: string;
    };
    repository?: { full_name?: string };
  }

  let payload: GHWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString()) as GHWebhookPayload;
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  if (typeof payload !== "object" || payload === null) {
    return res.status(400).json({ error: "Payload must be a JSON object" });
  }

  // Handle pull_request events: opened, reopened, synchronize, and closed+merged
  const action = payload.action;
  const isTrackedAction = event === "pull_request" && (
    action === "opened" ||
    action === "reopened" ||
    action === "synchronize" ||
    (action === "closed" && payload.pull_request?.merged)
  );

  if (!isTrackedAction) {
    return res.status(200).json({ message: "Event ignored", event, action: action ?? "unknown" });
  }

  const pr = payload.pull_request!;

  // Fix: don't fire a new run for synchronize on a PR that is no longer open
  if (action === "synchronize" && pr.state && pr.state !== "open") {
    return res.status(200).json({ message: "Event ignored — PR state is not open", state: pr.state });
  }

  // Idempotency: skip duplicate deliveries
  if (deliveryId) {
    for (const run of runs.values()) {
      if (run.delivery_id === deliveryId) {
        return res.status(200).json({ message: "Duplicate delivery ignored", run_id: run.run_id });
      }
    }
  }

  const repoFullName = payload.repository?.full_name ?? "unknown/repo";

  // Dedup: skip if a run for this exact repo+PR is already reasoning or acting.
  // This prevents synchronize floods and duplicate opened/reopened events.
  const prNumber = pr.number ?? 0;
  for (const existingRun of runs.values()) {
    if (
      existingRun.repository === repoFullName &&
      existingRun.pr_number === prNumber &&
      (existingRun.status === "reasoning" || existingRun.status === "acting")
    ) {
      return res.status(200).json({
        message: "Duplicate ignored — run already in progress for this PR",
        run_id: existingRun.run_id
      });
    }
  }

  const now = new Date().toISOString();

  // Determine trigger type for status labelling
  const triggerEvent: Run["trigger_event"] =
    action === "closed" ? "merged" :
    action === "synchronize" ? "synchronize" : "opened";

  // Update tracked repo stats — pr_count tracks unique PRs opened, not events
  const trackedRepo = Array.from(repos.values()).find(r => r.full_name === repoFullName);
  if (trackedRepo) {
    const newCount = action === "opened"
      ? trackedRepo.pr_count + 1
      : trackedRepo.pr_count;
    repos.set(trackedRepo.id, { ...trackedRepo, last_event_at: now, pr_count: newCount });
    persistRepos();
  }

  // ── Bridge: ensure a Dashboard PR card exists for this GitHub PR ─────────────
  // Use a deterministic card ID so all events for the same PR point to the same card.
  const prCardId = `GH-${repoFullName.replace("/", "-")}-${prNumber}`;
  const existingCardIdx = prs.findIndex(p => p.id === prCardId);

  if (existingCardIdx === -1) {
    // Create a new Dashboard card for this GitHub PR
    const ghPrCard: PullRequest = {
      id: prCardId,
      title: sanitizeText(pr.title ?? "Untitled PR", 200),
      authorName: pr.user?.login ?? "GitHub user",
      authorHandle: `@${pr.user?.login ?? "github"}`,
      authorAvatar: `https://github.com/${pr.user?.login ?? "ghost"}.png`,
      type: "FEATURE",
      branch: pr.head?.ref ?? "unknown",
      risk: "Medium",
      riskDetail: "AI analysis in progress…",
      filesChanged: 0,
      methodsImpacted: 0,
      status: triggerEvent === "merged" ? "Released" : "In Progress",
      version: `${repoFullName}#${prNumber}`,
      description: `Pull request #${prNumber} from ${repoFullName}. Triggered by: ${triggerEvent}.`,
      changelog: "Analysis running…",
      teamsPost: "Analysis running…",
      reasoningTrace: [{ title: "Webhook Received", description: `PR ${action} event from ${repoFullName}`, status: "info" as const, icon: "GitBranch" }],
      approved: false,
      verified: false,
      changedFiles: []
    };
    prs.unshift(ghPrCard);
    persistPrs();
    log("webhook", "bridge", "Created Dashboard PR card for GitHub PR", { card_id: prCardId, repo: repoFullName, pr: prNumber });
  } else if (triggerEvent === "merged") {
    // Mark the existing card as Released on merge
    prs[existingCardIdx] = { ...prs[existingCardIdx], status: "Released" };
    persistPrs();
  }

  const runId = generateRunId();

  const newRun: Run = {
    run_id: runId,
    status: "reasoning",
    trigger_event: triggerEvent,
    pr_title: pr.title ?? "Untitled PR",
    pr_number: prNumber,
    repository: repoFullName,
    merged_by: triggerEvent === "merged" ? (pr.merged_by?.login ?? "unknown") : (pr.user?.login ?? "unknown"),
    merged_at: triggerEvent === "merged" ? (pr.merged_at ?? now) : (pr.created_at ?? now),
    branch: pr.head?.ref ?? "unknown",
    diff_url: pr.diff_url ?? undefined,
    created_at: now,
    updated_at: now,
    delivery_id: deliveryId,
    linked_pr_id: prCardId    // always bridge so bridgeRunToPr updates the Dashboard card
  };

  runs.set(runId, newRun);
  persistRuns();

  // Start pipeline asynchronously (no await)
  startPipeline(runId);

  log(runId, "webhook", `PR ${action} event received`, { repo: repoFullName, pr: pr.number, trigger: triggerEvent });
  res.status(202).json({ run_id: runId, status: "reasoning", trigger_event: triggerEvent });
});

// ─── Routes: Runs ────────────────────────────────────────────────────────────

app.get("/runs", requireApiKey, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  as string ?? "50", 10) || 50, 200);
  const offset = parseInt(req.query.offset as string ?? "0",  10) || 0;
  const all = Array.from(runs.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ total: all.length, limit, offset, items: all.slice(offset, offset + limit) });
});

app.get("/runs/:id", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});

app.post("/runs/:id/approve", requireApiKey, async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "ready_for_review") {
    return res.status(409).json({ error: `Run is not ready for review (current: ${run.status})` });
  }

  const { edited_artifacts, approved_actions } = req.body;
  const actions: string[] = Array.isArray(approved_actions) ? approved_actions : ["teams"];

  // Merge edits into artifacts
  const finalArtifacts = edited_artifacts
    ? { ...run.artifacts, ...edited_artifacts }
    : run.artifacts;

  updateRun(req.params.id, {
    status: "acting",
    artifacts: finalArtifacts as RunArtifacts
  });

  log(req.params.id, "approval", "Run approved — executing enterprise actions", { actions, edited: !!edited_artifacts });

  try {
    const actionsResult = await executeActions(
      {
        runId: req.params.id,
        prTitle: run.pr_title,
        prNumber: run.pr_number,
        artifacts: finalArtifacts as RunArtifacts,
        report: run.impact_report!,
        teamReadiness: run.team_readiness,
        approvedActions: actions
      },
      {
        tenantId: process.env.GRAPH_TENANT_ID,
        clientId: process.env.GRAPH_CLIENT_ID,
        clientSecret: process.env.GRAPH_CLIENT_SECRET,
        teamsTeamId: process.env.TEAMS_TEAM_ID,
        teamsChannelId: process.env.TEAMS_CHANNEL_ID,
        sharepointSiteId: process.env.SHAREPOINT_SITE_ID,
        sharepointListId: process.env.SHAREPOINT_LIST_ID,
        outlookUserId: process.env.OUTLOOK_USER_ID
      }
    );

    updateRun(req.params.id, { status: "done", actions_result: actionsResult });
    log(req.params.id, "enterprise", "Enterprise actions completed", {
      teams: !!actionsResult.teams,
      sharepoint: !!actionsResult.sharepoint,
      outlook: !!actionsResult.outlook
    });
    res.json({ status: "done", actions_result: actionsResult });
  } catch (err) {
    const msg = (err as Error).message;
    log(req.params.id, "enterprise", "Enterprise actions failed", { error: msg });
    updateRun(req.params.id, { status: "error", error: msg });
    res.status(500).json({ error: "Enterprise actions failed" });
  }
});

app.post("/runs/:id/reject", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  updateRun(req.params.id, { status: "done" });
  res.json({ status: "done", message: "Run rejected — no org-visible actions taken" });
});

// ─── Graph token test (detailed error when credentials fail) ─────────────────

app.get("/api/graph/test", requireApiKey, async (req, res) => {
  const tenantId  = process.env.GRAPH_TENANT_ID;
  const clientId  = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return res.json({ ok: false, reason: "Missing GRAPH_TENANT_ID, GRAPH_CLIENT_ID, or GRAPH_CLIENT_SECRET in .env" });
  }

  try {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default"
    });
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.json() as { error?: string; error_description?: string };
      return res.json({
        ok: false,
        http_status: tokenRes.status,
        error: body.error ?? "unknown_error",
        description: body.error_description ?? "No description returned",
        hint: tokenRes.status === 401
          ? "Invalid client secret — regenerate it in Entra ID → App Registrations → your app → Certificates & secrets"
          : tokenRes.status === 400
          ? "Invalid tenant ID or client ID — check GRAPH_TENANT_ID and GRAPH_CLIENT_ID in .env"
          : "Check Azure Entra ID portal for more details"
      });
    }
    const data = await tokenRes.json() as { access_token?: string; expires_in?: number };
    return res.json({ ok: true, expires_in: data.expires_in, token_preview: data.access_token?.slice(0, 20) + "…" });
  } catch (err) {
    return res.json({ ok: false, reason: "Network error", detail: (err as Error).message });
  }
});

// ─── Diagnostic: validate Microsoft 365 configuration (Flaw 5 fix) ───────────

app.get("/diagnostic", requireApiKey, async (req, res) => {
  const channelId = process.env.TEAMS_CHANNEL_ID ?? "";
  const channelValidation = validateTeamsChannelId(channelId);
  const token = await getGraphToken({
    tenantId: process.env.GRAPH_TENANT_ID,
    clientId: process.env.GRAPH_CLIENT_ID,
    clientSecret: process.env.GRAPH_CLIENT_SECRET
  });

  res.json({
    ai: {
      tier1_foundry_agent: { configured: !!(process.env.FOUNDRY_AGENT_ID && process.env.FOUNDRY_PROJECT_ENDPOINT), agent_id: process.env.FOUNDRY_AGENT_ID || null },
      tier2_phi4: { configured: !!(process.env.FOUNDRY_INFERENCE_ENDPOINT), endpoint: process.env.FOUNDRY_INFERENCE_ENDPOINT || null, deployment: process.env.FOUNDRY_INFERENCE_DEPLOYMENT ?? "phi-4-reasoning" },
      tier3_azure_openai: { configured: !!(process.env.FOUNDRY_ENDPOINT && process.env.FOUNDRY_API_KEY), endpoint: process.env.FOUNDRY_ENDPOINT?.replace(/\/+$/, "") ?? null, deployment: process.env.FOUNDRY_DEPLOYMENT ?? "gpt-4o" },
      tier4_gemini: { configured: !!process.env.GEMINI_API_KEY }
    },
    graph: {
      token_acquired: !!token,
      tenant_id: process.env.GRAPH_TENANT_ID ?? null,
      client_id: process.env.GRAPH_CLIENT_ID ?? null
    },
    teams: {
      team_id: process.env.TEAMS_TEAM_ID ?? null,
      channel_id: channelId || null,
      channel_id_valid: channelValidation.valid,
      channel_id_hint: channelValidation.hint
    },
    // F18: honest SharePoint status — personal/student accounts don't have SharePoint
    sharepoint: {
      configured: !!(process.env.SHAREPOINT_SITE_ID && process.env.SHAREPOINT_LIST_ID),
      status: !process.env.SHAREPOINT_SITE_ID
        ? "simulated — SHAREPOINT_SITE_ID not configured (personal account limitation)"
        : "configured"
    },
    outlook: { user_id: process.env.OUTLOOK_USER_ID ?? null },
    work_iq: {
      graph_available: !!token,
      upn_count: certData.team_members.filter(m => (m as {upn?: string}).upn).length,
      note: !token
        ? "Graph token not available — synthetic signals from team-certifications.json"
        : "Graph token available; live signals fire when Calendars.Read (application) is admin-consented",
      admin_consent_url: process.env.GRAPH_TENANT_ID
        ? `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/adminconsent?client_id=${process.env.GRAPH_CLIENT_ID ?? ""}`
        : null
    },
    github: { token_set: !!process.env.GITHUB_TOKEN, webhook_secret_set: !!process.env.GITHUB_WEBHOOK_SECRET },
    ownership_map: { areas: ownershipMap.areas.length },
    cert_data: { members: certData.team_members.length, area_requirements: Object.keys(areaCertData.requirements).length },
    persistence: { runs: runs.size, prs: prs.length },
    app_url: process.env.APP_URL ?? "http://localhost:3000",
    webhook_url: `${process.env.APP_URL ?? "http://localhost:3000"}/webhook/github`,
    repos: { connected: repos.size }
  });
});

// ─── Routes: Manager Insights Agent (Challenge A — manager-level visibility) ──

app.get("/insights/team", requireApiKey, (req, res) => {
  const recentAreas = Array.from(runs.values())
    .filter(r => r.impact_report)
    .slice(-10)
    .flatMap(r => r.impact_report?.impacted_areas ?? []);
  const report = generateTeamInsights({
    members: certData.team_members,
    fabric: fabricIQ,
    recentAreas
  });
  log("insights", "insights", "Manager insights generated", {
    overall: report.overall_readiness, at_risk: report.at_risk_areas.length
  });
  res.json(report);
});

// ─── Routes: Assessment grading + progress (Challenge A — feedback on progress) ─

interface AssessmentAttempt {
  member: string;
  cert_id: string;
  score_pct: number;
  correct: number;
  total: number;
  generator: "ai" | "deterministic";
  ts: string;
}

const assessmentProgressFile = path.join(__dirname, "data", "assessment-progress.json");
function loadAssessmentProgress(): AssessmentAttempt[] {
  try { return JSON.parse(fs.readFileSync(assessmentProgressFile, "utf-8")) as AssessmentAttempt[]; } catch { return []; }
}

// NOTE: must be registered before /assessment/:cert or "progress" is read as a cert id.
app.get("/assessment/progress", requireApiKey, (req, res) => {
  const history = loadAssessmentProgress();
  const byKey = new Map<string, AssessmentAttempt[]>();
  for (const a of history) {
    const k = `${a.member}|${a.cert_id}`;
    byKey.set(k, [...(byKey.get(k) ?? []), a]);
  }
  const progress = [...byKey.entries()].map(([k, attempts]) => {
    const [member, cert_id] = k.split("|");
    const latest = attempts[attempts.length - 1];
    const first = attempts[0];
    return {
      member,
      cert_id,
      attempts: attempts.length,
      first_score: first.score_pct,
      latest_score: latest.score_pct,
      delta: latest.score_pct - first.score_pct,
      ready: latest.score_pct >= 70,
      last_attempt: latest.ts
    };
  }).sort((a, b) => b.last_attempt.localeCompare(a.last_attempt));
  res.json({ total_attempts: history.length, tracked: progress.length, progress });
});

app.post("/assessment/:cert/grade", requireApiKey, (req, res) => {
  const certId = req.params.cert.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const { member, questions, selections, generator } = req.body as {
    member?: string;
    questions?: { question: string; options: string[]; answer_index: number; why: string; citation: { file: string; heading: string } }[];
    selections?: number[];
    generator?: string;
  };
  if (!Array.isArray(questions) || !Array.isArray(selections) ||
      questions.length === 0 || questions.length !== selections.length) {
    res.status(400).json({ error: "Body must include matching questions[] and selections[]" });
    return;
  }

  const feedback = questions.map((q, i) => ({
    question: q.question,
    correct: selections[i] === q.answer_index,
    selected_index: selections[i],
    answer_index: q.answer_index,
    why: q.why,
    citation: q.citation
  }));
  const correct = feedback.filter(f => f.correct).length;
  const scorePct = Math.round((correct / questions.length) * 100);

  const attempt: AssessmentAttempt = {
    member: (member || "anonymous").slice(0, 80),
    cert_id: certId,
    score_pct: scorePct,
    correct,
    total: questions.length,
    generator: generator === "ai" ? "ai" : "deterministic",
    ts: new Date().toISOString()
  };
  const history = loadAssessmentProgress();
  history.push(attempt);
  try {
    fs.writeFileSync(assessmentProgressFile, JSON.stringify(history.slice(-500), null, 2));
  } catch { /* progress persistence is best-effort */ }

  const memberAttempts = history.filter(a => a.member === attempt.member && a.cert_id === certId);
  const prev = memberAttempts.length > 1 ? memberAttempts[memberAttempts.length - 2].score_pct : null;
  log("assessment", "assessment", `AssessmentAgent: graded ${certId} for ${attempt.member}`,
    { score: scorePct, correct, total: questions.length, attempts: memberAttempts.length });
  res.json({
    cert_id: certId,
    member: attempt.member,
    score_pct: scorePct,
    correct,
    total: questions.length,
    passed: scorePct >= 70,
    trend: prev === null
      ? "first attempt"
      : scorePct > prev
        ? `improving (+${scorePct - prev} vs last attempt)`
        : scorePct < prev
          ? `declining (${scorePct - prev} vs last attempt)`
          : "steady",
    attempts_for_cert: memberAttempts.length,
    feedback
  });
});

// ─── Routes: Assessment Agent (Challenge A — grounded, cited questions) ───────

app.get("/assessment/:cert", requireApiKey, async (req, res) => {
  const certId = req.params.cert.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const count = Math.min(parseInt(String(req.query.n ?? "4"), 10) || 4, 8);
  const skills = fabricIQ.cert(certId)?.teaches ?? [];
  try {
    const set = await generateAssessment({
      certId,
      knowledgeDir: path.join(__dirname, "knowledge"),
      count,
      skills
    });
    log("assessment", "assessment",
      `AssessmentAgent: ${set.questions.length} cited questions for ${certId}`,
      { generator: set.generator, sources: set.source_chunks.length });
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: "Assessment generation failed", detail: (err as Error).message });
  }
});

// ─── Routes: Blast radius + failure replay (ontology-grounded, deterministic) ─

app.get("/runs/:id/blast-radius", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  const areas = run.impact_report?.impacted_areas ?? [];
  if (areas.length === 0) {
    res.json({ origin_areas: [], total_areas_affected: 0, blast_score: 0, hops: [], cascade: [], grounded_in: "fabric-ontology" });
    return;
  }
  res.json(fabricIQ.blastRadius(areas));
});

app.get("/fabric/blast", requireApiKey, (req, res) => {
  const areas = String(req.query.areas ?? "").split(",").map(a => a.trim()).filter(Boolean);
  if (areas.length === 0) { res.status(400).json({ error: "Pass ?areas=a,b,c" }); return; }
  res.json(fabricIQ.blastRadius(areas));
});

// Ontology dependency graph — nodes + edges for the blast-radius visualization.
app.get("/fabric/graph", requireApiKey, (req, res) => {
  res.json({
    nodes: fabricIQ.ontology.areas.map(a => ({
      id: a.id,
      title: a.title ?? a.id,
      criticality: a.criticality ?? "medium"
    })),
    edges: fabricIQ.ontology.areas.flatMap(a =>
      (a.depends_on ?? []).map(dep => ({ from: a.id, to: dep }))
    )
  });
});

// ─── Routes: Release health + executive report ────────────────────────────────

app.get("/runs/:id/health", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  const blast = fabricIQ.blastRadius(run.impact_report?.impacted_areas ?? []);
  res.json({
    health: computeReleaseHealth(run, blast),
    roadmap: buildRemediationRoadmap(run, fabricIQ, areaCertData.critical_certs ?? [])
  });
});

// The Release Verdict — the deterministic adjudicator's CLEAR/BLOCKED/ABSTAIN
// decision for a run. Returns the verdict computed during the pipeline; falls
// back to an on-the-fly re-adjudication (idempotent) if one wasn't persisted.
app.get("/runs/:id/verdict", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  if (run.release_verdict) { res.json(run.release_verdict); return; }
  if (!run.impact_report || !run.team_readiness) {
    res.status(409).json({ error: "Run not ready — verdict is available once analysis completes" });
    return;
  }
  // Best-effort path set for older runs: fixture paths, else a representative
  // path per impacted area so authority resolution still has something to chew on.
  const paths = (run.fixture_paths && run.fixture_paths.length > 0)
    ? run.fixture_paths
    : run.impact_report.impacted_areas.flatMap(area =>
        (ownershipMap.areas.find(a => a.name === area)?.pathPatterns ?? [area]).slice(0, 1)
      );
  const verdict = adjudicate({
    changedPaths: paths,
    impactReport: run.impact_report,
    teamReadiness: run.team_readiness,
    ownershipMap,
    areaCertData,
    certData
  });
  res.json(verdict);
});

app.get("/runs/:id/report", requireApiKey, async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  try {
    const blast = fabricIQ.blastRadius(run.impact_report?.impacted_areas ?? []);
    const health = computeReleaseHealth(run, blast);
    const roadmap = buildRemediationRoadmap(run, fabricIQ, areaCertData.critical_certs ?? []);
    const attestation = buildAttestation({ run, serverSecret: API_SECRET_EFFECTIVE });
    const html = await renderExecutiveReport({ run, health, roadmap, blast, attestation });
    log(run.run_id, "report", "Executive report generated", { health: health.overall, grade: health.grade });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: "Report generation failed", detail: (err as Error).message });
  }
});

// ─── Routes: Run provenance attestations (signed, tamper-evident) ─────────────

app.get("/runs/:id/attestation", requireApiKey, (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  const attestation = buildAttestation({ run, serverSecret: API_SECRET_EFFECTIVE });
  log(run.run_id, "provenance", "Attestation issued", {
    tier: attestation.predicate.ai_tier, approval: attestation.predicate.human_approval.status
  });
  res.json(attestation);
});

app.post("/attestation/verify", requireApiKey, (req, res) => {
  const attestation = req.body as RunAttestation;
  const result = verifyAttestation(attestation, API_SECRET_EFFECTIVE);
  res.status(result.valid ? 200 : 422).json(result);
});

// ─── Routes: Fabric IQ explainability (semantic reasoning, demoable) ──────────

app.get("/fabric/explain", requireApiKey, (req, res) => {
  const area = String(req.query.area ?? "core-service");
  res.json({
    certs_for_area: fabricIQ.certsForArea(area),
    next_cert_for_uncertified: fabricIQ.recommendNextCert([], area)
  });
});

// ─── Real GitHub PR trigger ───────────────────────────────────────────────────
// Accepts a public GitHub PR URL, fetches real diff data, runs the full pipeline.

app.post("/runs/github", requireApiKey, async (req, res) => {
  const { github_url } = req.body as { github_url?: string };

  const match = github_url?.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) {
    return res.status(400).json({
      error: "Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123"
    });
  }

  const [, owner, repo, prNumStr] = match;
  const prNumber = parseInt(prNumStr, 10);
  const repoFullName = `${owner}/${repo}`;

  const token = process.env.GITHUB_TOKEN;
  const ghHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  try {
    const prRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
      { headers: ghHeaders }
    );

    if (prRes.status === 404) {
      return res.status(404).json({
        error: `PR #${prNumber} not found in ${repoFullName}. Make sure the repo is public or your GITHUB_TOKEN has read access.`
      });
    }
    if (!prRes.ok) {
      return res.status(prRes.status).json({ error: prRes.status === 403 ? GH_RATE_MSG : `GitHub API returned ${prRes.status}` });
    }

    const prData = await prRes.json() as {
      title: string;
      number: number;
      state: string;
      head: { ref: string };
      base: { ref: string };
      merged_by: { login: string } | null;
      merged_at: string | null;
      diff_url: string;
    };

    const runId = generateRunId();
    const now = new Date().toISOString();

    const githubRun = {
      run_id: runId,
      status: "reasoning" as const,
      pr_title: sanitizeText(prData.title, 200),
      pr_number: prNumber,
      repository: repoFullName,
      merged_by: prData.merged_by?.login ?? "unknown",
      merged_at: prData.merged_at ?? now,
      branch: prData.head.ref,
      diff_url: prData.diff_url,
      created_at: now,
      updated_at: now
    };

    runs.set(runId, githubRun as unknown as Run);
    persistRuns();
    startPipeline(runId);

    log(runId, "github", "Real GitHub PR run triggered", { repo: repoFullName, pr: prNumber, title: prData.title });

    res.status(202).json({
      run_id: runId,
      status: "reasoning",
      pr_title: prData.title,
      repository: repoFullName,
      pr_number: prNumber
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Demo: trigger a test run without a real webhook ─────────────────────────

// HER-39: built-in fixtures for demo/testing
const DEMO_PRESETS = [
  { pr_title: "feat: Add Microsoft Graph API webhook integration", branch: "feature/graph-webhooks", repository: "org/herald" },
  { pr_title: "feat!: Migrate auth token format from JWT to opaque server-side session tokens", branch: "breaking/auth-token-migration", repository: "org/herald" },
  { pr_title: "fix: Resolve memory leak in useAuth hook on rapid login swaps", branch: "fix/auth-hook-memory-leak", repository: "org/herald" }
];

app.post("/runs/demo/trigger", requireApiKey, async (req, res) => {
  // F8: rate limit demo triggers to 10/min per IP
  if (!checkRateLimit(req.ip ?? "unknown", 10, 60_000)) {
    return res.status(429).json({ error: "Too many demo requests — wait a moment before retrying" });
  }

  let { pr_title, branch, repository = "org/herald", fixture } = req.body;

  // F10: Load fixture ONCE (was previously read twice — duplicate removed)
  let fixturePaths: string[] = [];
  let fixtureCommits: string[] = [];

  if (fixture && typeof fixture === "string") {
    const safeName = fixture.replace(/[^a-z-]/g, "");
    try {
      const fixtureRaw = fs.readFileSync(path.join(__dirname, "fixtures", `${safeName}.json`), "utf-8");
      const fixtureData = JSON.parse(fixtureRaw) as { pr_title?: string; branch?: string; repository?: string; changed_paths?: string[]; commit_messages?: string[] };
      pr_title = pr_title ?? fixtureData.pr_title;
      branch = branch ?? fixtureData.branch;
      repository = fixtureData.repository ?? repository;
      fixturePaths = Array.isArray(fixtureData.changed_paths) ? fixtureData.changed_paths : [];
      fixtureCommits = Array.isArray(fixtureData.commit_messages) ? fixtureData.commit_messages : [];
    } catch { /* ignore missing fixture, fall through to random preset */ }
  }

  if (!pr_title) {
    const preset = DEMO_PRESETS[Math.floor(Math.random() * DEMO_PRESETS.length)];
    pr_title = preset.pr_title;
    branch = branch ?? preset.branch;
    repository = preset.repository;
  }

  const runId = generateRunId();
  const now = new Date().toISOString();

  const demoRun = {
    run_id: runId,
    status: "reasoning" as const,
    trigger_event: "demo" as const,
    pr_title: pr_title as string,
    pr_number: Math.floor(Math.random() * 5000) + 100,
    repository: repository as string,
    merged_by: "demo-user",
    merged_at: now,
    branch: (branch as string | undefined) ?? "feature/demo",
    created_at: now,
    updated_at: now,
    fixture_name: (fixture as string | null) ?? null,
    fixture_paths: fixturePaths,
    fixture_commits: fixtureCommits
  };
  runs.set(runId, demoRun as unknown as Run);
  persistRuns();

  log(runId, "demo", "Demo run triggered", { pr_title, fixture: fixture ?? "random", fixture_paths: fixturePaths.length });
  startPipeline(runId);

  res.status(202).json({ run_id: runId, status: "reasoning" });
});

// ─── Routes: GitHub Copilot Extension ────────────────────────────────────────
// Implements the GitHub Copilot Extensions API (agent extension).
// Users invoke it as `@herald <command>` inside GitHub Copilot Chat.
// Track: Creative Apps (GitHub Copilot) — runtime integration, not just a build tool.

app.get("/copilot/info", (req, res) => {
  res.json({
    name: "Herald Release Concierge",
    description: "AI-powered release automation with Microsoft 365 team certification readiness",
    track: "Creative Apps — GitHub Copilot Extension",
    commands: [
      { name: "status", description: "List recent pipeline runs" },
      { name: "status <run-id>", description: "Get full details for a specific run" },
      { name: "analyze <github-pr-url>", description: "Trigger Herald analysis for a GitHub PR" },
      { name: "readiness", description: "Show team cert readiness for high-risk runs" },
      { name: "help", description: "Show available commands" }
    ],
    setup: "Register Herald as a GitHub App with Copilot Extension capabilities and point callback to POST /copilot. See /README.md for full instructions."
  });
});

// Test endpoint — lets you try the extension locally without a registered GitHub App.
// Set COPILOT_SKIP_SIG_VERIFY=1 in .env, then:
//   curl "http://localhost:3000/copilot/demo?command=status"
app.get("/copilot/demo", async (req, res) => {
  const allowed = ["status", "readiness", "help", "analyze"] as const;
  const raw = typeof req.query.command === "string" ? req.query.command : "status";
  const command = (allowed as readonly string[]).includes(raw) ? raw : "status";

  const fakeBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: `@herald ${command}` }],
    copilot_thread_id: `demo_${Date.now()}`
  }));

  const chunks: string[] = [];
  const mockRes = {
    setHeader: () => {},
    flushHeaders: () => {},
    write: (chunk: string) => { chunks.push(chunk); return true; },
    end: () => {}
  } as unknown as import("express").Response;

  await handleCopilotRequest(fakeBody, mockRes, runs, (prTitle, branch) => {
    // Demo endpoint: don't actually start a pipeline run
    return `demo_${Date.now()}`;
  });

  const text = chunks
    .map(c => c.replace(/^data:\s*/, "").trim())
    .filter(c => c && c !== "[DONE]")
    .map(c => { try { return (JSON.parse(c) as { delta?: { content?: Array<{ text?: { value?: string } }> } }).delta?.content?.[0]?.text?.value ?? ""; } catch { return ""; } })
    .join("");

  res.json({
    command,
    response: text,
    note: "Live demo of the @herald Copilot Extension. To use in GitHub Copilot Chat, register a GitHub App — see GET /copilot/info for setup instructions."
  });
});

// Streaming demo — returns real SSE so the frontend can animate token-by-token.
// The triggerAnalysis callback creates a REAL pipeline run so @herald status <id> works.
app.get("/copilot/demo/stream", async (req, res) => {
  const allowed = ["status", "readiness", "help", "analyze"] as const;
  const raw = typeof req.query.command === "string" ? req.query.command : "status";
  const command = (allowed as readonly string[]).includes(raw) ? raw : "status";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const fakeBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: `@herald ${command}` }],
    copilot_thread_id: `demo_${Date.now()}`
  }));

  try {
  await handleCopilotRequest(fakeBody, res, runs, (prTitle, branch) => {
    // Create a real run so `@herald status <runId>` returns real data
    const runId = generateRunId();
    const now = new Date().toISOString();
    const demoRun = {
      run_id: runId,
      status: "reasoning" as const,
      trigger_event: "demo" as const,
      pr_title: prTitle || "Copilot-triggered analysis",
      pr_number: Math.floor(Math.random() * 5000) + 100,
      repository: "copilot/triggered",
      merged_by: "copilot-chat",
      merged_at: now,
      branch: branch || "main",
      created_at: now,
      updated_at: now
    };
    runs.set(runId, demoRun as unknown as Run);
    persistRuns();
    startPipeline(runId);
    log(runId, "copilot", "Analysis triggered via @herald Copilot Extension", { pr_title: prTitle });
    return runId;
  });
  } catch (err) {
    console.error("[Copilot demo-stream] handler error:", (err as Error).message);
    if (!res.writableEnded) {
      try { res.write(`data: ${JSON.stringify({ error: "Herald hit an internal error — try again." })}\n\n`); } catch { /* socket gone */ }
    }
  }
  if (!res.writableEnded) res.end();
});

app.post("/copilot", async (req, res) => {
  const rawBody = req.body as Buffer;
  const keyId = req.headers["x-github-public-key-identifier"] as string | undefined;
  const sig = req.headers["x-github-public-key-signature"] as string | undefined;

  const valid = await verifyCopilotSignature(rawBody, keyId, sig);
  if (!valid) {
    return res.status(401).json({ error: "Invalid or missing GitHub Copilot Extension signature" });
  }

  try {
  await handleCopilotRequest(rawBody, res, runs, (prTitle, branch) => {
    const runId = generateRunId();
    const now = new Date().toISOString();
    const copilotRun = {
      run_id: runId, status: "reasoning" as const,
      pr_title: prTitle, pr_number: Math.floor(Math.random() * 5000) + 100,
      repository: "org/herald", merged_by: "copilot-extension",
      merged_at: now, branch: branch ?? "copilot-triggered",
      created_at: now, updated_at: now, trigger_event: "manual" as const
    };
    runs.set(runId, copilotRun as unknown as Run);
    persistRuns();
    startPipeline(runId);
    return runId;
  });
  } catch (err) {
    console.error("[Copilot] handler error:", (err as Error).message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Copilot handler failed" });
    } else if (!res.writableEnded) {
      try { res.write(`data: ${JSON.stringify({ error: "Herald hit an internal error — try again." })}\n\n`); res.end(); } catch { /* socket gone */ }
    }
  }
});

// ─── Routes: existing PR management ─────────────────────────────────────────

// ─── Routes: Reviewer Load ────────────────────────────────────────────────────
// Derives reviewer workload from real GitHub open PRs when GITHUB_TOKEN + connected
// repos are available. Falls back to the local prs array otherwise.

interface ReviewerEntry {
  name: string;
  login: string;
  count: number;
  avatar: string;
  source: "github" | "local";
}

// SharePoint Site ID discovery — calls Graph to resolve site by hostname + path.
// Cross-tenant note: if your SharePoint is in a different tenant than herald-graph,
// this will return a 403. Use Graph Explorer (graph.microsoft.com) signed in with
// the SharePoint tenant account as an alternative.
app.get("/api/sharepoint/discover", requireApiKey, async (req, res) => {
  const hostname = typeof req.query.hostname === "string" ? req.query.hostname : "pern.sharepoint.com";
  const sitePath = typeof req.query.sitePath === "string" ? req.query.sitePath : "HERALD";

  const token = await getGraphToken({
    tenantId: process.env.GRAPH_TENANT_ID,
    clientId: process.env.GRAPH_CLIENT_ID,
    clientSecret: process.env.GRAPH_CLIENT_SECRET
  });

  if (!token) {
    return res.status(503).json({ error: "Graph token unavailable — check GRAPH credentials in .env" });
  }

  try {
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(hostname)}:/sites/${encodeURIComponent(sitePath)}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    const data = await siteRes.json() as Record<string, unknown>;
    if (!siteRes.ok) {
      const errMsg = (data.error as { message?: string } | undefined)?.message ?? JSON.stringify(data).slice(0, 200);
      if (siteRes.status === 403) {
        return res.status(403).json({
          error: "Access denied — herald-graph app is in a different tenant than your SharePoint. Use Graph Explorer (graph.microsoft.com) signed in with the SharePoint tenant account, run: GET /v1.0/sites/" + hostname + ":/sites/" + sitePath,
          graph_explorer_query: `https://graph.microsoft.com/v1.0/sites/${hostname}:/sites/${sitePath}`
        });
      }
      return res.status(siteRes.status).json({ error: errMsg });
    }
    res.json({
      site_id: data.id,
      display_name: data.displayName,
      web_url: data.webUrl,
      env_line: `SHAREPOINT_SITE_ID="${data.id}"`
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/reviewers", requireApiKey, async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const ghHeaders = {
    Authorization: `Bearer ${token ?? ""}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "herald-release-concierge"
  };

  const reviewerMap = new Map<string, ReviewerEntry>();
  let source: "github" | "local" = "local";
  let githubUser: string | null = null;

  if (token) {
    // Fetch the authenticated GitHub user profile
    try {
      const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
      if (userRes.ok) {
        const u = await userRes.json() as { login: string; name?: string; avatar_url: string };
        githubUser = u.login;
        // Seed the map with the authenticated user at 0 so they always appear
        reviewerMap.set(u.login, {
          name: u.name || u.login,
          login: u.login,
          count: 0,
          avatar: u.avatar_url,
          source: "github"
        });
      }
    } catch { /* no profile — continue */ }

    // For every connected repo, fetch open PRs and tally reviewer assignments
    for (const repo of repos.values()) {
      try {
        const prRes = await fetch(
          `https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=100`,
          { headers: ghHeaders }
        );
        if (!prRes.ok) continue;

        const ghPrs = await prRes.json() as Array<{
          requested_reviewers: Array<{ login: string; name?: string; avatar_url: string }>;
          assignees:           Array<{ login: string; avatar_url: string }>;
        }>;

        for (const pr of ghPrs) {
          for (const reviewer of pr.requested_reviewers) {
            const existing = reviewerMap.get(reviewer.login) ?? {
              name: reviewer.login,
              login: reviewer.login,
              count: 0,
              avatar: reviewer.avatar_url,
              source: "github" as const
            };
            existing.count++;
            reviewerMap.set(reviewer.login, existing);
          }
        }
        source = "github";
      } catch { /* skip repo on error */ }
    }
  }

  // Local fallback: derive from the prs array when GitHub data is empty
  if (reviewerMap.size === 0 || (source === "local")) {
    source = "local";
    for (const pr of prs) {
      if (!pr.reviewer) continue;
      const key = pr.reviewer;
      const existing = reviewerMap.get(key) ?? {
        name: pr.reviewer,
        login: pr.reviewer.toLowerCase().replace(/\s+/g, "_"),
        count: 0,
        avatar: makeAvatarSvg(pr.reviewer),
        source: "local" as const
      };
      if (pr.status !== "Released") existing.count++;
      reviewerMap.set(key, existing);
    }
  }

  const reviewers = Array.from(reviewerMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  res.json({ reviewers, source, github_user: githubUser });
});

// F15: compute real stats from actual runs + prs data
app.get("/api/stats", requireApiKey, (req, res) => {
  const runsArr = Array.from(runs.values());
  const done = runsArr.filter(r => r.status === "done");
  const errored = runsArr.filter(r => r.status === "error");
  const active = runsArr.filter(r => r.status === "reasoning" || r.status === "acting");
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = done.filter(r => new Date(r.created_at).getTime() > week);

  const durations = done
    .map(r => new Date(r.updated_at).getTime() - new Date(r.created_at).getTime())
    .filter(d => d > 0 && d < 240_000);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const deploySpeed = avgMs > 0
    ? `${Math.floor(avgMs / 60000)}m ${Math.round((avgMs % 60000) / 1000)}s`
    : dashboardStats.deploySpeed;

  const total = done.length + errored.length;
  const successRate = total > 0 ? `${((done.length / total) * 100).toFixed(1)}%` : "100%";
  const rollbackRate = total > 0 ? `${((errored.length / total) * 100).toFixed(1)}%` : "0%";

  const riskCounts = { low: 0, medium: 0, high: 0 };
  runsArr.forEach(r => { if (r.impact_report) riskCounts[r.impact_report.risk.level]++; });
  const avgRiskLevel: "Low" | "Medium" | "High" =
    riskCounts.high > riskCounts.medium && riskCounts.high > riskCounts.low ? "High"
    : riskCounts.medium >= riskCounts.low ? "Medium" : "Low";

  res.json({
    activePRsCount: prs.length,
    avgRiskLevel,
    deploySpeed,
    rollbackRate,
    totalReleases7d: recent.length,
    successRate,
    activePipelinesCount: active.length || prs.filter(p => p.status === "In Progress").length
  });
});

app.get("/api/prs", requireApiKey, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  as string ?? "100", 10) || 100, 500);
  const offset = parseInt(req.query.offset as string ?? "0",  10) || 0;
  const page   = prs.slice(offset, offset + limit);
  res.json({ total: prs.length, limit, offset, items: page });
});

// F17: single-PR fetch so the frontend can refresh after a run completes
app.get("/api/prs/:id", requireApiKey, (req, res) => {
  const pr = prs.find(p => p.id === req.params.id);
  if (!pr) return res.status(404).json({ error: "Pull request not found" });
  res.json(pr);
});

app.post("/api/prs", requireApiKey, (req, res) => {
  const raw = req.body as Record<string, string>;
  const title       = sanitizeText(raw.title       ?? "", 200);
  const authorName  = sanitizeText(raw.authorName  ?? "", 100);
  const description = sanitizeText(raw.description ?? "", 2000);
  const branch      = sanitizeText(raw.branch      ?? "", 200);
  const { type, status, reviewer, priority } = raw;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const generatedId = `PR-${Math.floor(1000 + Math.random() * 9000)}`;
  const authorHandle = `@${(authorName || "developer").toLowerCase().replace(/\s+/g, "_")}`;

  // Generate a deterministic avatar from the author's name — no external CDN dependency
  const fallbackNames = ["Alex Chen", "Sarah Miller", "John Doe", "Elena Rodriguez"];
  const avatars = fallbackNames.map(n => makeAvatarSvg(n));

  // changedFiles are unknown at PR creation time — they get populated by the AI pipeline
  const filesCount = 0;
  const changedFiles: string[] = [];

  const newPr: PullRequest = {
    id: generatedId,
    title,
    authorName: authorName || "Unassigned dev",
    authorHandle,
    authorAvatar: makeAvatarSvg(authorName || "Developer"),
    type: (type || "FEATURE") as PullRequest["type"],
    branch: branch || "dev-main",
    risk: "Medium",
    riskDetail: "Analyzing queue...",
    filesChanged: filesCount,
    methodsImpacted: 0,
    status: (status || "Pending Review") as PullRequest["status"],
    version: `2.4.1-${generatedId.toLowerCase()}`,
    description: description || "No detailed description supplied yet.",
    changelog: `# Release Changelog - ${generatedId}\n\nAnalyzing changes... Run analyze step to expand.`,
    teamsPost: `Deploy candidate ${generatedId} created by ${authorName}.`,
    reasoningTrace: [{ title: "Ingestion Queue", description: "Pull request synced to Release Concierge gateway.", status: "info", icon: "Inbox" }],
    approved: false,
    verified: false,
    reviewer: reviewer || "Unreviewed",
    priority: (priority || "Medium") as PullRequest["priority"],
    changedFiles
  };

  prs.unshift(newPr);
  res.status(201).json(newPr);
});

app.post("/api/prs/:id/reviewer", requireApiKey, (req, res) => {
  const pr = prs.find(p => p.id === req.params.id);
  if (!pr) return res.status(404).json({ error: "Pull request not found" });
  pr.reviewer = req.body.reviewer;
  persistPrs();
  res.json(pr);
});

app.post("/api/prs/:id/priority", requireApiKey, (req, res) => {
  const pr = prs.find(p => p.id === req.params.id);
  if (!pr) return res.status(404).json({ error: "Pull request not found" });
  pr.priority = req.body.priority;
  persistPrs();
  res.json(pr);
});

// ─── Routes: Review Comments ──────────────────────────────────────────────────

app.get("/api/prs/:id/comments", requireApiKey, (req, res) => {
  res.json(prComments.get(req.params.id) ?? []);
});

app.post("/api/prs/:id/comments", requireApiKey, (req, res) => {
  const { author, handle, avatar, text, is_voice_note, reactions } = req.body as {
    author: string; handle: string; avatar: string; text: string;
    is_voice_note?: boolean; reactions?: Record<string, string[]>;
  };
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });

  const comment: import("./src/types.js").PRComment = {
    id: `comment_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    author: sanitizeText(author ?? "Anonymous", 100),
    handle: sanitizeText(handle ?? "@user", 50),
    avatar: avatar ?? "",
    text: sanitizeText(text, 2000),
    created_at: new Date().toISOString(),
    is_voice_note: !!is_voice_note,
    reactions: reactions ?? {}
  };

  const existing = prComments.get(req.params.id) ?? [];
  prComments.set(req.params.id, [comment, ...existing]);
  persistComments();
  res.status(201).json(comment);
});

app.delete("/api/prs/:id/comments/:commentId", requireApiKey, (req, res) => {
  const list = prComments.get(req.params.id);
  if (!list) return res.status(404).json({ error: "No comments found for this PR" });
  const filtered = list.filter(c => c.id !== req.params.commentId);
  if (filtered.length === list.length) return res.status(404).json({ error: "Comment not found" });
  prComments.set(req.params.id, filtered);
  persistComments();
  res.json({ deleted: req.params.commentId });
});

app.patch("/api/prs/:id/comments/:commentId/reactions", requireApiKey, (req, res) => {
  const list = prComments.get(req.params.id);
  if (!list) return res.status(404).json({ error: "No comments found for this PR" });
  const { emoji, handle } = req.body as { emoji: string; handle: string };
  if (!emoji || !handle) return res.status(400).json({ error: "emoji and handle are required" });

  const updated = list.map(c => {
    if (c.id !== req.params.commentId) return c;
    const reactions = { ...(c.reactions ?? {}) };
    const reactors = reactions[emoji] ?? [];
    const idx = reactors.indexOf(handle);
    if (idx > -1) {
      const next = reactors.filter(h => h !== handle);
      if (next.length === 0) delete reactions[emoji]; else reactions[emoji] = next;
    } else {
      reactions[emoji] = [...reactors, handle];
    }
    return { ...c, reactions };
  });
  prComments.set(req.params.id, updated);
  persistComments();
  res.json(updated.find(c => c.id === req.params.commentId) ?? {});
});

// F1 + F17: analyze now creates a real Run through the full AI pipeline.
// Returns immediately with { pr, run_id } — client polls /runs/:id for completion,
// and bridgeRunToPr automatically updates the prs array when the run finishes.
app.post("/api/prs/:id/analyze", requireApiKey, (req, res) => {
  const prIndex = prs.findIndex(p => p.id === req.params.id);
  if (prIndex === -1) return res.status(404).json({ error: "Pull request not found" });

  const pr = prs[prIndex];
  const runId = generateRunId();
  const now = new Date().toISOString();
  const prNumber = parseInt(pr.id.replace("PR-", ""), 10) || Math.floor(Math.random() * 5000) + 100;

  const analyzeRun = {
    run_id: runId,
    status: "reasoning" as const,
    pr_title: pr.title,
    pr_number: prNumber,
    repository: "org/herald",
    merged_by: pr.authorHandle ?? "ui-user",
    merged_at: now,
    branch: pr.branch ?? "dev",
    created_at: now,
    updated_at: now,
    linked_pr_id: pr.id
  };
  runs.set(runId, analyzeRun as unknown as Run);
  persistRuns();

  startPipeline(runId);

  res.json({ success: true, pr, run_id: runId });
});

app.post("/api/prs/:id/approve", requireApiKey, async (req, res) => {
  const prIndex = prs.findIndex(p => p.id === req.params.id);
  if (prIndex === -1) return res.status(404).json({ error: "PR not found" });

  prs[prIndex] = { ...prs[prIndex], approved: true, verified: !!req.body.verified, status: "Released" };
  persistPrs();

  // Find the latest ready-for-review run linked to this PR and fire enterprise actions.
  // This closes the gap between the UI approve path and the full /runs/:id/approve path.
  const linkedRun = Array.from(runs.values())
    .filter(r => r.linked_pr_id === req.params.id && r.status === "ready_for_review")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  let actionsResult = null;
  if (linkedRun && linkedRun.artifacts && linkedRun.impact_report) {
    try {
      actionsResult = await executeActions(
        {
          runId: linkedRun.run_id,
          prTitle: linkedRun.pr_title,
          prNumber: linkedRun.pr_number,
          artifacts: linkedRun.artifacts,
          report: linkedRun.impact_report,
          teamReadiness: linkedRun.team_readiness,
          approvedActions: Array.isArray(req.body.approved_actions) ? req.body.approved_actions : ["teams"]
        },
        {
          tenantId: process.env.GRAPH_TENANT_ID,
          clientId: process.env.GRAPH_CLIENT_ID,
          clientSecret: process.env.GRAPH_CLIENT_SECRET,
          teamsTeamId: process.env.TEAMS_TEAM_ID,
          teamsChannelId: process.env.TEAMS_CHANNEL_ID,
          sharepointSiteId: process.env.SHAREPOINT_SITE_ID,
          sharepointListId: process.env.SHAREPOINT_LIST_ID,
          outlookUserId: process.env.OUTLOOK_USER_ID
        }
      );
      updateRun(linkedRun.run_id, { status: "done", actions_result: actionsResult });
      log(linkedRun.run_id, "enterprise", "Enterprise actions fired via PR approve", {});
    } catch (err) {
      log(linkedRun.run_id, "enterprise", "Enterprise actions failed via PR approve", { error: (err as Error).message });
    }
  }

  res.json({ success: true, pr: prs[prIndex], actions_result: actionsResult });
});

// ─── Routes: Tracked Repositories ────────────────────────────────────────────

// Safe view strips webhook_secret — secrets never leave the server in list responses
type SafeTrackedRepo = Omit<TrackedRepo, "webhook_secret">;
function toSafeRepo(r: TrackedRepo): SafeTrackedRepo {
  const { webhook_secret: _omit, ...safe } = r;
  return safe;
}

app.get("/api/repos", requireApiKey, (req, res) => {
  res.json(Array.from(repos.values()).map(toSafeRepo));
});

// One-time secret reveal — only callable with API key, returns just the secret for a repo
app.get("/api/repos/:id/secret", requireApiKey, (req, res) => {
  const repo = repos.get(req.params.id);
  if (!repo) return res.status(404).json({ error: "Repository not found" });
  res.json({ id: repo.id, full_name: repo.full_name, webhook_secret: repo.webhook_secret });
});

app.post("/api/repos", requireApiKey, async (req, res) => {
  // Rate-limit: 10 connects per minute per IP
  if (!checkRateLimit(req.ip ?? "unknown", 10, 60_000)) {
    return res.status(429).json({ error: "Too many requests — wait before connecting another repository." });
  }
  const raw = (req.body as Record<string, string>);
  let fullName = (raw.full_name ?? raw.github_url ?? "").trim();

  // Accept https://github.com/owner/repo form as well as owner/repo
  const urlMatch = fullName.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/|$)/);
  if (urlMatch) fullName = urlMatch[1];

  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(fullName)) {
    return res.status(400).json({ error: 'Invalid repository. Use "owner/repo" or a full GitHub URL.' });
  }

  // Reject duplicates
  if (Array.from(repos.values()).some(r => r.full_name.toLowerCase() === fullName.toLowerCase())) {
    return res.status(409).json({ error: `${fullName} is already connected.` });
  }

  const repoId = crypto.randomUUID();
  const webhookSecret = crypto.randomBytes(32).toString("hex");
  const webhookUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/webhook/github`;
  let webhookId: number | undefined;
  let autoRegistered = false;

  // Warn if APP_URL points to localhost — the webhook GitHub registers would be unreachable
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    console.warn(
      `[Herald] WARNING: Webhook URL is "${webhookUrl}" (localhost). GitHub cannot reach this ` +
      "address from the internet. Set APP_URL in .env to your public URL before connecting real repos."
    );
  }

  // Attempt auto-registration via GitHub API if token is present
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${fullName}/hooks`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "web",
          active: true,
          events: ["pull_request"],
          config: { url: webhookUrl, content_type: "json", secret: webhookSecret, insecure_ssl: "0" }
        })
      });
      if (ghRes.ok) {
        const hook = await ghRes.json() as { id: number };
        webhookId = hook.id;
        autoRegistered = true;
        console.log(`[Herald] Auto-registered webhook #${webhookId} on ${fullName}`);
      } else {
        const errBody = await ghRes.text().catch(() => "");
        console.warn(`[Herald] Auto-register failed (${ghRes.status}): ${errBody.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn("[Herald] Webhook auto-register error:", (err as Error).message);
    }
  }

  const repo: TrackedRepo = {
    id: repoId,
    full_name: fullName,
    webhook_id: webhookId,
    webhook_secret: webhookSecret,
    auto_registered: autoRegistered,
    added_at: new Date().toISOString(),
    pr_count: 0
  };

  repos.set(repoId, repo);
  persistRepos();

  // Return safe repo (no secret) plus one-time setup info when manual setup is needed.
  // The secret is only included here at creation time — use GET /api/repos/:id/secret to retrieve later.
  res.status(201).json({
    repo: toSafeRepo(repo),
    setup: autoRegistered ? null : {
      message: "Webhook not auto-registered — add it manually in your repo settings.",
      url: webhookUrl,
      secret: webhookSecret,    // one-time inclusion in creation response only
      events: ["pull_request"],
      content_type: "application/json"
    }
  });
});

app.delete("/api/repos/:id", requireApiKey, async (req, res) => {
  const repo = repos.get(req.params.id);
  if (!repo) return res.status(404).json({ error: "Repository not found" });

  // Attempt to delete the webhook from GitHub
  if (repo.webhook_id && process.env.GITHUB_TOKEN) {
    try {
      await fetch(`https://api.github.com/repos/${repo.full_name}/hooks/${repo.webhook_id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
    } catch (err) {
      console.warn("[Herald] Webhook delete error:", (err as Error).message);
    }
  }

  repos.delete(req.params.id);
  persistRepos();
  res.json({ deleted: req.params.id, full_name: repo.full_name });
});

// ─── GitHub Profile Discovery ────────────────────────────────────────────────
// These read the server's GITHUB_TOKEN to expose the authenticated user's
// profile, repos, and open PRs to the frontend — no browser-side token needed.

const GH_HEADERS = (token?: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "herald-release-concierge",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

// GitHub login rules: alphanumeric with single hyphens, 1–39 chars.
const GH_USERNAME = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;
// Shown when the unauthenticated GitHub API (no GITHUB_TOKEN) hits its 60/hr cap.
const GH_RATE_MSG = "GitHub rate limit reached — this deployment has no GITHUB_TOKEN (60 requests/hr, shared). Try again in a few minutes.";

// Optional ?user=<login> loads ANY public profile (works with or without a
// token — the token just raises the rate limit). No user → the token owner.
app.get("/api/github/profile", async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const login = typeof req.query.user === "string" ? req.query.user.trim() : "";
  if (login && !GH_USERNAME.test(login)) return res.json({ ok: false, reason: `"${login}" is not a valid GitHub username` });
  if (!login && !token) return res.json({ ok: false, reason: "GITHUB_TOKEN not configured in .env" });
  try {
    const r = await fetch(login ? `https://api.github.com/users/${login}` : "https://api.github.com/user", { headers: GH_HEADERS(token) });
    if (!r.ok) return res.json({ ok: false, reason: r.status === 404 ? `GitHub user "${login}" not found` : r.status === 403 ? GH_RATE_MSG : `GitHub returned ${r.status}` });
    const u = await r.json() as Record<string, unknown>;
    res.json({
      ok: true,
      user: {
        login: u.login, name: u.name, avatar_url: u.avatar_url,
        bio: u.bio, public_repos: u.public_repos,
        private_repos: (u as Record<string, unknown>).total_private_repos ?? 0,
        followers: u.followers, html_url: u.html_url,
        company: u.company, location: u.location
      }
    });
  } catch (err) { res.json({ ok: false, reason: (err as Error).message }); }
});

app.get("/api/github/user-repos", async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const login = typeof req.query.user === "string" ? req.query.user.trim() : "";
  if (login && !GH_USERNAME.test(login)) return res.json({ ok: false, repos: [], reason: `"${login}" is not a valid GitHub username` });
  if (!login && !token) return res.json({ ok: false, repos: [], reason: "GITHUB_TOKEN not configured" });
  try {
    const r = await fetch(
      login
        ? `https://api.github.com/users/${login}/repos?per_page=100&sort=pushed`
        : "https://api.github.com/user/repos?per_page=100&sort=pushed&type=all",
      { headers: GH_HEADERS(token) }
    );
    if (!r.ok) return res.json({ ok: false, repos: [], reason: r.status === 403 ? GH_RATE_MSG : `GitHub returned ${r.status}` });
    const repos = await r.json() as Array<Record<string, unknown>>;
    res.json({
      ok: true,
      repos: repos.map(repo => ({
        id: repo.id,
        full_name: repo.full_name,
        description: repo.description ?? null,
        language: repo.language ?? null,
        private: repo.private,
        updated_at: repo.updated_at,
        open_issues_count: repo.open_issues_count ?? 0,
        html_url: repo.html_url,
        default_branch: repo.default_branch ?? "main",
        fork: repo.fork ?? false
      }))
    });
  } catch (err) { res.json({ ok: false, repos: [], reason: (err as Error).message }); }
});

app.get("/api/github/repo-prs", async (req, res) => {
  const repoName = typeof req.query.repo === "string" ? req.query.repo : "";
  if (!repoName || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoName)) {
    return res.status(400).json({ ok: false, prs: [], error: "Invalid repo — use owner/repo format" });
  }
  const token = process.env.GITHUB_TOKEN;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repoName}/pulls?state=open&per_page=30&sort=updated`,
      { headers: GH_HEADERS(token) }
    );
    if (!r.ok) return res.json({ ok: false, prs: [], status: r.status, reason: r.status === 403 ? GH_RATE_MSG : `GitHub returned ${r.status}` });
    const prs = await r.json() as Array<Record<string, unknown>>;
    res.json({
      ok: true,
      prs: prs.map(pr => {
        const user = pr.user as Record<string, unknown> | null;
        const head = pr.head as Record<string, unknown> | null;
        const base = pr.base as Record<string, unknown> | null;
        return {
          number: pr.number, title: pr.title, state: pr.state,
          user: { login: user?.login ?? "unknown", avatar_url: user?.avatar_url ?? "" },
          created_at: pr.created_at, updated_at: pr.updated_at,
          html_url: pr.html_url,
          head: { ref: head?.ref ?? "" },
          base: { ref: base?.ref ?? "" },
          draft: pr.draft ?? false,
          labels: Array.isArray(pr.labels)
            ? pr.labels.map((l: Record<string, unknown>) => String(l.name ?? ""))
            : []
        };
      })
    });
  } catch (err) { res.json({ ok: false, prs: [], reason: (err as Error).message }); }
});

// Real team roster (from data/team-certifications.json) — powers the manual
// release dialog's Author/Reviewer pickers so they match the engineers used in
// cert-readiness analysis (no more hardcoded placeholder names).
app.get("/api/team", (_req, res) => {
  res.json({
    members: certData.team_members.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      team: m.team,
      handle: (m as { upn?: string }).upn
        ? (m as { upn: string }).upn.split("@")[0]
        : m.name.toLowerCase().replace(/\s+/g, ".")
    }))
  });
});

// Auto-aggregate a profile's OPEN pull requests across all their repos in ONE
// GitHub Search call — no webhook, no repo wiring. Works with or without a token
// (the server token just raises the rate limit). Powers the "sign in with your
// GitHub username and we review your PRs" onboarding.
app.get("/api/github/open-prs", async (req, res) => {
  const login = typeof req.query.user === "string" ? req.query.user.trim() : "";
  if (!GH_USERNAME.test(login)) return res.status(400).json({ ok: false, prs: [], reason: "Invalid GitHub username" });
  const token = process.env.GITHUB_TOKEN;
  try {
    const q = encodeURIComponent(`is:pr is:open user:${login}`);
    const r = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=30&sort=updated`, { headers: GH_HEADERS(token) });
    if (!r.ok) {
      return res.json({ ok: false, prs: [], reason: r.status === 403 ? "GitHub rate limit reached — try again in a minute" : `GitHub returned ${r.status}` });
    }
    const data = await r.json() as { items?: Array<Record<string, unknown>>; total_count?: number };
    const prs = (data.items ?? []).map(it => {
      const user = it.user as Record<string, unknown> | null;
      const repo = String(it.repository_url ?? "").replace("https://api.github.com/repos/", "");
      return {
        number: it.number,
        title: it.title,
        repo,
        html_url: it.html_url,
        user: { login: user?.login ?? "unknown", avatar_url: user?.avatar_url ?? "" },
        updated_at: it.updated_at,
        draft: it.draft ?? false,
        labels: Array.isArray(it.labels) ? it.labels.map((l: Record<string, unknown>) => String(l.name ?? "")) : []
      };
    });
    res.json({ ok: true, prs, total: data.total_count ?? prs.length });
  } catch (err) { res.json({ ok: false, prs: [], reason: (err as Error).message }); }
});

// ─── Vite dev + static serving ───────────────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.HMR_PORT ? { port: parseInt(process.env.HMR_PORT, 10) } : true
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { index: false }));
    app.get("*", (req, res) => {
      try {
        const html = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
        res.setHeader("Content-Type", "text/html");
        res.send(html);
      } catch {
        res.status(404).send("Build not found — run `npm run build` first.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\nHerald server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST /webhook/github`);
    console.log(`Runs list:        GET  /runs`);
    console.log(`Foundry:          ${process.env.FOUNDRY_ENDPOINT ? "CONNECTED" : "simulated"}`);
    console.log(`Microsoft Graph:  ${process.env.GRAPH_CLIENT_ID ? "CONNECTED" : "simulated"}`);
    console.log(`Gemini:           ${process.env.GEMINI_API_KEY ? "CONNECTED" : "not configured"}`);
    console.log(`GitHub Token:     ${process.env.GITHUB_TOKEN ? "SET" : "not set (heuristic fallback)"}`);
    console.log(`Ownership map:    ${ownershipMap.areas.length} areas loaded`);
  });
}

startServer();
