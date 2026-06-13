/**
 * Herald pipeline orchestration — extracted from server.ts to keep route
 * handlers and business logic separate.
 *
 * Receives all dependencies through PipelineContext so the module has no
 * implicit globals and can be tested in isolation.
 */
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { Run, OwnershipMap, CertData, AreaCertData, PipelineStageStatus } from "../src/types.js";
import { analyzeImpact, type AnalysisResult } from "../agents/reasoning-agent.js";
import { generateArtifacts } from "../agents/generation-agent.js";
import { assessTeamReadiness } from "../agents/readiness-agent.js";
import { adjudicate } from "./adjudicator.js";
import { getGraphToken } from "../agents/enterprise-agent.js";
import { fetchLiveWorkSignals, type WorkIQSignalMap } from "../agents/work-iq.js";

// Re-export so server.ts can import from one place
export type { CertData, AreaCertData };

interface GitHubPRData { commits: string[]; changedPaths: string[]; }

export interface PipelineContext {
  runs: Map<string, Run>;
  ownershipMap: OwnershipMap;
  certData: CertData;
  areaCertData: AreaCertData;
  geminiAI: GoogleGenAI | null;
  knowledgeDir: string;
  fetchGitHubPRData: (repo: string, prNumber: number) => Promise<GitHubPRData | null>;
  sanitizeText: (value: string, maxLength: number) => string;
  sanitizePaths: (paths: string[]) => string[];
  log: (runId: string, stage: string, message: string, data?: Record<string, unknown>) => void;
  updateRun: (runId: string, patch: Partial<Run>) => Run;
  bridgeRunToPr: (run: Run) => void;
}

// ─── Knowledge context loader ─────────────────────────────────────────────────

export function loadKnowledgeContext(knowledgeDir: string): string {
  const files = ["cert-requirements-guide.md", "engineering-roles-map.md", "study-plan-methodology.md"];
  return files.map(f => {
    try { return fs.readFileSync(path.join(knowledgeDir, f), "utf-8").slice(0, 1000); }
    catch { return ""; }
  }).filter(Boolean).join("\n\n---\n\n");
}

// ─── Pipeline timeout ─────────────────────────────────────────────────────────

export const PIPELINE_TIMEOUT_MS = 240_000; // Phi-4-reasoning ~32s × 3 agents
const AGENT_TIMEOUT_MS = 70_000; // per-agent cap: prevents one hung tier from consuming the full budget

function withAgentTimeout<T>(promise: Promise<T>, agentName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${agentName} timed out after ${AGENT_TIMEOUT_MS / 1000}s`)), AGENT_TIMEOUT_MS)
    )
  ]);
}

// ─── Orchestration entry point ────────────────────────────────────────────────

export async function processPipelineRun(runId: string, ctx: PipelineContext): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Pipeline timed out — check AI credentials")), PIPELINE_TIMEOUT_MS)
  );
  try {
    await Promise.race([runPipelineCore(runId, ctx), timeout]);
  } catch (err) {
    const msg = (err as Error).message ?? "Pipeline failed";
    ctx.log(runId, "pipeline", "Pipeline error", { error: msg });
    try { ctx.updateRun(runId, { status: "error", error: msg }); } catch {}
  }
}

async function runPipelineCore(runId: string, ctx: PipelineContext): Promise<void> {
  const run = ctx.runs.get(runId);
  if (!run) return;

  ctx.updateRun(runId, { status: "reasoning" });
  ctx.log(runId, "ingest", "Pipeline started", { pr_title: run.pr_title, repository: run.repository });

  // Step 1: Resolve changed paths + commits
  let commits: string[] = [run.pr_title];
  let paths: string[] = [];

  if (run.fixture_paths && run.fixture_paths.length > 0) {
    paths = run.fixture_paths;
    commits = run.fixture_commits ?? commits;
    ctx.log(runId, "ingest", "Using fixture data", { files: paths.length, commits: commits.length, fixture: run.fixture_name ?? null });
  } else {
    const ghData = await ctx.fetchGitHubPRData(run.repository, run.pr_number);
    if (ghData && (ghData.changedPaths.length > 0 || ghData.commits.length > 0)) {
      commits = ghData.commits.length > 0 ? ghData.commits : commits;
      paths = ctx.sanitizePaths(ghData.changedPaths);
      ctx.log(runId, "ingest", "Real GitHub PR data fetched", { files: paths.length, commits: commits.length });
    } else {
      const lower = run.pr_title.toLowerCase();
      const branchHints: string[] = [];
      if (lower.includes("auth") || run.branch.includes("auth")) branchHints.push("src/hooks/useAuth.ts", "server/auth/middleware.ts", "server/auth/tokenService.ts");
      if (lower.includes("graph") || run.branch.includes("graph")) branchHints.push("server/services/graphClient.ts", "server/routes/enterpriseActions.ts");
      if (lower.includes("fix") || lower.startsWith("fix")) branchHints.push("server/routes/", "src/components/");
      if (lower.includes("chore") || lower.includes("deps")) branchHints.push("package.json", "package-lock.json");
      paths = branchHints.length > 0 ? branchHints : ["src/components/", "server/routes/", "server/auth/"];
      ctx.log(runId, "ingest", "Using heuristic path fallback — set GITHUB_TOKEN for real diff data");
    }
  }

  // Step 2: Build context objects
  const ownershipContext = JSON.stringify(
    ctx.ownershipMap.areas.map(a => ({ name: a.name, pathPatterns: a.pathPatterns, team: a.team, contacts: a.contacts ?? [] }))
  );
  const knowledgeContext = loadKnowledgeContext(ctx.knowledgeDir);

  const agentConfig = {
    foundryAgentId: process.env.FOUNDRY_AGENT_ID,
    foundryProjectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT,
    foundryInferenceEndpoint: process.env.FOUNDRY_INFERENCE_ENDPOINT,
    foundryInferenceDeployment: process.env.FOUNDRY_INFERENCE_DEPLOYMENT ?? "phi-4-reasoning",
    foundryEndpoint: process.env.FOUNDRY_ENDPOINT,
    foundryApiKey: process.env.FOUNDRY_API_KEY,
    foundryDeployment: process.env.FOUNDRY_DEPLOYMENT ?? "gpt-4o",
    gemini: ctx.geminiAI
  };

  // Step 3: Reasoning Agent
  ctx.log(runId, "reasoning", "ReasoningAgent: analyzing impact");
  ctx.updateRun(runId, {
    pipeline_stages: [
      { name: "reasoning",   label: "Reasoning Agent",   status: "running" },
      { name: "generation",  label: "Generation Agent",  status: "pending" },
      { name: "readiness",   label: "Readiness Agent",   status: "pending" },
    ] as PipelineStageStatus[]
  });
  const analysisResult: AnalysisResult = await withAgentTimeout(analyzeImpact(
    {
      prTitle: ctx.sanitizeText(run.pr_title, 200),
      branch: run.branch,
      commitMessages: commits.map(c => ctx.sanitizeText(c, 500)),
      changedPaths: paths,
      ownershipContext,
      knowledgeContext
    },
    agentConfig
  ), "ReasoningAgent");
  const impactReport = analysisResult.report;
  const aiTier = analysisResult.tier;
  ctx.log(runId, "reasoning", "ReasoningAgent: complete", {
    risk: impactReport.risk.level,
    change_type: impactReport.change_type,
    areas: impactReport.impacted_areas,
    tier: aiTier
  });

  // Step 4: Generation Agent
  ctx.log(runId, "generation", "GenerationAgent: creating artifacts");
  ctx.updateRun(runId, {
    pipeline_stages: [
      { name: "reasoning",   label: "Reasoning Agent",   status: "done"    },
      { name: "generation",  label: "Generation Agent",  status: "running" },
      { name: "readiness",   label: "Readiness Agent",   status: "pending" },
    ] as PipelineStageStatus[]
  });
  const artifacts = await withAgentTimeout(generateArtifacts(run.pr_title, impactReport, agentConfig), "GenerationAgent");
  ctx.log(runId, "generation", "GenerationAgent: complete", { changelog_len: artifacts.changelog_md.length });

  // Step 5: Readiness Agent
  ctx.log(runId, "readiness", "ReadinessAgent: assessing team certification");
  ctx.updateRun(runId, {
    pipeline_stages: [
      { name: "reasoning",   label: "Reasoning Agent",   status: "done"    },
      { name: "generation",  label: "Generation Agent",  status: "done"    },
      { name: "readiness",   label: "Readiness Agent",   status: "running" },
    ] as PipelineStageStatus[]
  });
  const ownershipTeamMap: Record<string, string> = {};
  ctx.ownershipMap.areas.forEach(a => { ownershipTeamMap[a.name] = a.team; });

  // Fetch live Work IQ signals from M365 calendar when Graph is configured
  const graphToken = await getGraphToken({
    tenantId: process.env.GRAPH_TENANT_ID,
    clientId: process.env.GRAPH_CLIENT_ID,
    clientSecret: process.env.GRAPH_CLIENT_SECRET
  });
  let liveWorkIQSignals: WorkIQSignalMap | undefined;
  if (graphToken) {
    try {
      liveWorkIQSignals = await fetchLiveWorkSignals(ctx.certData.team_members, graphToken);
      const liveCount = Object.values(liveWorkIQSignals).filter(s => s.source === "live").length;
      ctx.log(runId, "readiness", `Work IQ: ${liveCount} live M365 signal(s), ${Object.keys(liveWorkIQSignals).length - liveCount} synthetic`);
    } catch {
      ctx.log(runId, "readiness", "Work IQ: Graph calendar fetch failed — using synthetic signals");
    }
  } else {
    ctx.log(runId, "readiness", "Work IQ: Graph not configured — using synthetic signals from team-certifications.json");
  }

  const teamReadiness = await withAgentTimeout(assessTeamReadiness(
    { impactedAreas: impactReport.impacted_areas, prTitle: run.pr_title, changeType: impactReport.change_type, riskLevel: impactReport.risk.level },
    { certData: ctx.certData, areaCertData: ctx.areaCertData, ownershipTeamMap, liveWorkIQSignals, ...agentConfig }
  ), "ReadinessAgent");
  ctx.log(runId, "readiness", "ReadinessAgent: complete", {
    score: teamReadiness.overall_score,
    gaps: teamReadiness.gaps.length,
    blocking: teamReadiness.blocking_deployment
  });

  // Step 6: Adjudicator — the AI agents formed the analysis; this deterministic
  // policy layer owns the verdict (CLEAR / BLOCKED / ABSTAIN). It re-derives
  // ownership from the diff (not the model's guess), abstains when the change is
  // unattributable or the owning team is unstaffed, and rejects false cert
  // conflicts (superseding credentials).
  const releaseVerdict = adjudicate({
    changedPaths: paths,
    impactReport,
    teamReadiness,
    ownershipMap: ctx.ownershipMap,
    areaCertData: ctx.areaCertData,
    certData: ctx.certData
  });
  ctx.log(runId, "verdict", `Adjudicator: ${releaseVerdict.decision}`, {
    decision: releaseVerdict.decision,
    unowned_paths: releaseVerdict.unowned_paths.length,
    false_conflicts_rejected: releaseVerdict.false_conflicts_rejected.length,
    real_blockers: releaseVerdict.real_blockers.length
  });

  ctx.updateRun(runId, {
    status: "ready_for_review",
    impact_report: impactReport,
    artifacts,
    team_readiness: teamReadiness,
    release_verdict: releaseVerdict,
    ai_tier_used: aiTier,
    pipeline_stages: [
      { name: "reasoning",  label: "Reasoning Agent",  status: "done" },
      { name: "generation", label: "Generation Agent", status: "done" },
      { name: "readiness",  label: "Readiness Agent",  status: "done" },
    ] as PipelineStageStatus[]
  });
  ctx.log(runId, "pipeline", "Run ready for review");

  ctx.bridgeRunToPr(ctx.runs.get(runId) as Run);
}
