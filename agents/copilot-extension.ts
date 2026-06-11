/**
 * Herald GitHub Copilot Extension Handler
 *
 * Implements the GitHub Copilot Extensions API (agent extension):
 * - Verifies RSA-SHA256 signatures using GitHub's public key registry
 * - Parses user commands: status, analyze, readiness, help
 * - Streams responses as Server-Sent Events (SSE)
 *
 * To enable:
 *   1. Register Herald as a GitHub App (github.com → Settings → Developer settings)
 *   2. Enable "Copilot Extension" on the app and set callback URL to POST /copilot
 *   3. Install the app on your org/repo
 *   4. Users can then type `@herald <command>` in GitHub Copilot Chat
 *
 * In dev/testing set COPILOT_SKIP_SIG_VERIFY=1 to bypass RSA signature check.
 *
 * Reference: https://docs.github.com/en/copilot/building-copilot-extensions
 */

import crypto from "crypto";
import type express from "express";
import type { Run } from "../src/types.js";

// ── Public key cache (fetched once per process; refreshed every hour) ─────────

const _keyCache = new Map<string, string>();
let _keysCachedAt = 0;
const KEY_CACHE_TTL_MS = 3_600_000;

async function fetchGitHubCopilotPublicKey(keyId: string): Promise<string | null> {
  const now = Date.now();
  if (now - _keysCachedAt > KEY_CACHE_TTL_MS) _keyCache.clear();
  if (_keyCache.has(keyId)) return _keyCache.get(keyId)!;

  try {
    const res = await fetch("https://api.github.com/meta/public_keys/copilot_api", {
      headers: { "User-Agent": "herald-release-concierge" }
    });
    if (!res.ok) return null;
    const data = await res.json() as { public_keys: Array<{ key_identifier: string; key: string }> };
    data.public_keys.forEach(k => _keyCache.set(k.key_identifier, k.key));
    _keysCachedAt = now;
    return _keyCache.get(keyId) ?? null;
  } catch {
    return null;
  }
}

export async function verifyCopilotSignature(
  rawBody: Buffer,
  keyId: string | undefined,
  signature: string | undefined
): Promise<boolean> {
  // Dev bypass — never set this in production
  if (process.env.COPILOT_SKIP_SIG_VERIFY === "1") return true;
  if (!keyId || !signature) return false;

  const pubKey = await fetchGitHubCopilotPublicKey(keyId);
  if (!pubKey) return false;

  try {
    const verify = crypto.createVerify("SHA256");
    verify.update(rawBody);
    return verify.verify(pubKey, signature, "base64");
  } catch {
    return false;
  }
}

// ── SSE streaming helpers ─────────────────────────────────────────────────────

function writeChunk(res: express.Response, id: string, text: string): void {
  const payload = JSON.stringify({
    id,
    object: "thread.message.delta",
    delta: { content: [{ type: "text", text: { value: text } }] }
  });
  res.write(`data: ${payload}\n\n`);
}

function writeDone(res: express.Response): void {
  res.write("data: [DONE]\n\n");
}

// ── Run formatter ─────────────────────────────────────────────────────────────

function formatRun(run: Run): string {
  const risk = run.impact_report?.risk.level ?? "unknown";
  const riskEmoji = risk === "high" ? "🔴" : risk === "medium" ? "🟡" : "🟢";
  const statusEmoji =
    run.status === "done" ? "✅" :
    run.status === "error" ? "❌" :
    run.status === "ready_for_review" ? "👀" : "⏳";

  return [
    `${statusEmoji} **${run.pr_title}**`,
    `  • Run ID: \`${run.run_id}\``,
    `  • Status: \`${run.status}\`  |  Repo: ${run.repository}`,
    run.impact_report
      ? `  • Risk: ${riskEmoji} **${risk.toUpperCase()}** — ${run.impact_report.risk.rationale}`
      : "",
    run.impact_report
      ? `  • Type: ${run.impact_report.change_type}  |  Areas: ${run.impact_report.impacted_areas.join(", ")}`
      : "",
    run.team_readiness
      ? `  • 🎓 Readiness: **${run.team_readiness.overall_score}%** (${run.team_readiness.ready_count}/${run.team_readiness.total_count} certified)`
      : "",
    run.team_readiness?.blocking_deployment
      ? "  • ⛔ **Deployment blocked** — cert gaps must be resolved"
      : ""
  ].filter(Boolean).join("\n");
}

// ── Command parser ────────────────────────────────────────────────────────────

type CopilotCommand =
  | { command: "help" }
  | { command: "status"; runId?: string }
  | { command: "analyze"; githubUrl: string }
  | { command: "readiness" }
  | { command: "unknown"; raw: string };

function parseCommand(message: string): CopilotCommand {
  const text = message.replace(/@herald\s*/i, "").trim();

  if (!text || /^help$/i.test(text)) return { command: "help" };
  if (/^readiness\s*$/i.test(text)) return { command: "readiness" };
  if (/^status\s*$/i.test(text)) return { command: "status" };

  const runMatch = text.match(/^status\s+(run_\S+)/i);
  if (runMatch) return { command: "status", runId: runMatch[1] };

  const analyzeMatch = text.match(/^analyze\s+(https?:\/\/github\.com\/\S+)/i);
  if (analyzeMatch) return { command: "analyze", githubUrl: analyzeMatch[1] };

  return { command: "unknown", raw: text };
}

// ── Request body type ─────────────────────────────────────────────────────────

interface CopilotMessage { role: string; content: string; }
interface CopilotRequestBody {
  messages?: CopilotMessage[];
  copilot_thread_id?: string;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleCopilotRequest(
  rawBody: Buffer,
  res: express.Response,
  runs: Map<string, Run>,
  triggerAnalysis: (prTitle: string, branch: string) => string
): Promise<void> {
  let body: CopilotRequestBody;
  try {
    body = JSON.parse(rawBody.toString()) as CopilotRequestBody;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const messages = body.messages ?? [];
  const userMessage = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const msgId = `herald_${Date.now()}`;
  const cmd = parseCommand(userMessage);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    switch (cmd.command) {
      case "help": {
        writeChunk(res, msgId, [
          "## Herald Release Concierge",
          "",
          "AI-powered release automation with Microsoft 365 team certification readiness assessment.",
          "",
          "**Commands:**",
          "- `@herald status` — list the 5 most recent pipeline runs",
          "- `@herald status <run-id>` — get full details for a specific run",
          "- `@herald analyze <github-pr-url>` — trigger Herald analysis for a PR",
          "- `@herald readiness` — show cert readiness for high-risk runs",
          "- `@herald help` — show this message",
          "",
          "**How it works:**",
          "When a PR merges, Herald reasons about impact (Microsoft Foundry), assesses whether engineers have the certifications required for the changed service areas (Work IQ signals from M365 calendar), then posts Teams announcements + SharePoint release logs via Microsoft Graph — all behind a human approval gate."
        ].join("\n"));
        break;
      }

      case "status": {
        if (cmd.runId) {
          const run = runs.get(cmd.runId);
          if (!run) {
            writeChunk(res, msgId, `Run \`${cmd.runId}\` not found. Use \`@herald status\` to list recent runs.`);
          } else {
            writeChunk(res, msgId, `## Run Details\n\n${formatRun(run)}`);
            if (run.artifacts) {
              const preview = run.artifacts.changelog_md.slice(0, 600);
              writeChunk(res, msgId, `\n\n### Changelog Preview\n\n${preview}${run.artifacts.changelog_md.length > 600 ? "…" : ""}`);
            }
            if (run.team_readiness?.gaps?.length) {
              const gapLines = run.team_readiness.gaps
                .map(g => `- **${g.name}** (${g.role}) — missing: \`${g.missing_certs.join(", ")}\``)
                .join("\n");
              writeChunk(res, msgId, `\n\n### Certification Gaps\n\n${gapLines}`);
            }
            if (run.impact_report?.reasoning_trace?.length) {
              const trace = run.impact_report.reasoning_trace.map(s => `- ${s}`).join("\n");
              writeChunk(res, msgId, `\n\n### Reasoning Trace\n\n${trace}`);
            }
          }
        } else {
          const recent = Array.from(runs.values())
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);
          if (recent.length === 0) {
            writeChunk(res, msgId, "No pipeline runs yet. Use `@herald analyze <github-pr-url>` or trigger a demo run via the Herald UI.");
          } else {
            writeChunk(res, msgId, "## Recent Pipeline Runs\n\n");
            for (const run of recent) {
              writeChunk(res, msgId, formatRun(run) + "\n\n---\n\n");
            }
          }
        }
        break;
      }

      case "readiness": {
        const highRisk = Array.from(runs.values())
          .filter(r => r.impact_report?.risk.level === "high" && r.team_readiness)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 3);

        if (highRisk.length === 0) {
          writeChunk(res, msgId, "No high-risk runs with readiness data yet. Trigger a breaking-change run to see cert gap analysis.");
        } else {
          writeChunk(res, msgId, "## Team Readiness — High-Risk Runs\n\n");
          for (const run of highRisk) {
            const tr = run.team_readiness!;
            const scoreEmoji = tr.overall_score >= 80 ? "✅" : tr.overall_score >= 50 ? "⚠️" : "⛔";
            const gapLines = tr.gaps.length
              ? `\n**Certification gaps:**\n${tr.gaps.map(g => `- ${g.name} (${g.role}): \`${g.missing_certs.join(", ")}\``).join("\n")}`
              : "";
            writeChunk(res, msgId, [
              `### ${run.pr_title}`,
              `${scoreEmoji} Readiness: **${tr.overall_score}%** (${tr.ready_count}/${tr.total_count} certified)`,
              tr.blocking_deployment ? "⛔ **BLOCKED** — critical cert gaps must be resolved before rollout" : "Readiness threshold met — safe to proceed",
              gapLines
            ].filter(Boolean).join("\n") + "\n\n");
          }
        }
        break;
      }

      case "analyze": {
        // Parse https://github.com/{owner}/{repo}/pull/{number}
        const prUrlMatch = cmd.githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        let prTitle = `PR from ${cmd.githubUrl}`;
        let branch = "copilot-triggered";
        let repository = "";

        if (prUrlMatch) {
          const [, owner, repo, prNumber] = prUrlMatch;
          repository = `${owner}/${repo}`;
          prTitle = `${owner}/${repo}#${prNumber}`;
          branch = `refs/pull/${prNumber}/merge`;

          // Try to fetch real PR metadata from GitHub API
          const ghToken = process.env.GITHUB_TOKEN;
          const headers: Record<string, string> = {
            "User-Agent": "herald-release-concierge",
            "Accept": "application/vnd.github.v3+json"
          };
          if (ghToken) headers["Authorization"] = `Bearer ${ghToken}`;

          try {
            const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers });
            if (apiRes.ok) {
              const prData = await apiRes.json() as { title: string; head: { ref: string } };
              prTitle = prData.title;
              branch = prData.head.ref;
            }
          } catch {
            // proceed with parsed fallback
          }
        }

        const runId = triggerAnalysis(prTitle, branch);
        writeChunk(res, msgId, [
          `Triggered Herald analysis for: \`${cmd.githubUrl}\``,
          repository ? `Repository: \`${repository}\`` : "",
          `PR: **${prTitle}**`,
          `Branch: \`${branch}\``,
          "",
          `Run ID: \`${runId}\``,
          "",
          "Use `@herald status " + runId + "` in a moment to check progress."
        ].filter(Boolean).join("\n"));
        break;
      }

      default: {
        writeChunk(res, msgId, `I didn't understand \`${(cmd as { raw: string }).raw}\`. Try \`@herald help\` to see available commands.`);
      }
    }
  } finally {
    writeDone(res);
    res.end();
  }
}
