/**
 * Herald Generation Agent — GitHub Copilot-assisted
 * Produces human-readable release artifacts from the impact report.
 */
import { GoogleGenAI } from "@google/genai";
import { ImpactReport, RunArtifacts } from "../src/types.js";
import { callFoundryAgent, callPhi4, stripJsonFences, extractJson, retryFetch, callGeminiWithRetry } from "./foundry-agent-client.js";

export interface GenerationAgentConfig {
  // Tier 1: Foundry Agent
  foundryAgentId?: string;
  foundryProjectEndpoint?: string;
  // Tier 2: Phi-4-reasoning
  foundryInferenceEndpoint?: string;
  foundryInferenceDeployment?: string;
  // Tier 3: Azure OpenAI
  foundryEndpoint?: string;
  foundryApiKey?: string;
  foundryDeployment?: string;
  // Tier 4: Gemini
  gemini?: GoogleGenAI | null;
}

const GEN_SYSTEM = "You are Herald's generation agent. Produce accurate, concise, accessible release artifacts. Return ONLY valid JSON.";

export async function generateArtifacts(
  prTitle: string,
  report: ImpactReport,
  config: GenerationAgentConfig
): Promise<RunArtifacts> {
  const riskEmoji = report.risk?.level === "high" ? "🔴" : report.risk?.level === "medium" ? "🟡" : "🟢";
  const changeType = report.change_type ?? "feature";
  const typeLabel = changeType.charAt(0).toUpperCase() + changeType.slice(1);
  const userPrompt = buildGenerationPrompt(prTitle, report);

  function tryParse(text: string): RunArtifacts | null {
    try {
      const p = JSON.parse(extractJson(text));
      if (!p.changelog_md || !p.docs_patch_md || !p.plain_summary) return null;
      // Reject template echoes — Phi-4 sometimes copies the placeholder descriptions verbatim
      if (
        (p.changelog_md as string).includes("full markdown changelog with") ||
        (p.plain_summary as string).includes("2-3 sentence plain-language") ||
        (p.docs_patch_md as string).includes("brief markdown suggestion for what")
      ) return null;
      return p as RunArtifacts;
    } catch { return null; }
  }

  // ── Tier 1: Foundry Agent ────────────────────────────────────────────────
  if (config.foundryAgentId && config.foundryProjectEndpoint && config.foundryApiKey) {
    try {
      const text = await callFoundryAgent(config.foundryAgentId, config.foundryProjectEndpoint, config.foundryApiKey, `${GEN_SYSTEM}\n\n${userPrompt}\n\nReturn ONLY valid JSON.`);
      if (text) { const r = tryParse(text); if (r) return r; }
    } catch (err) {
      console.warn("[GenerationAgent] Foundry Agent failed:", (err as Error).message);
    }
  }

  // ── Tier 2: Phi-4-reasoning ──────────────────────────────────────────────
  if (config.foundryInferenceEndpoint && config.foundryApiKey) {
    const deployment = config.foundryInferenceDeployment ?? "phi-4-reasoning";
    try {
      const text = await callPhi4(config.foundryInferenceEndpoint, config.foundryApiKey, deployment, [
        { role: "system", content: GEN_SYSTEM },
        { role: "user", content: userPrompt }
      ], 1200, 0.3);
      if (text) { const r = tryParse(text); if (r) return r; }
    } catch (err) {
      console.warn("[GenerationAgent] Phi-4 failed:", (err as Error).message);
    }
  }

  // ── Tier 3: Azure OpenAI (classic deployment path OR AI Foundry serverless /openai/v1) ──
  if (config.foundryEndpoint && config.foundryApiKey) {
    const deployment = config.foundryDeployment ?? "gpt-4o";
    try {
      const aoaiBase = config.foundryEndpoint.replace(/\/$/, "");
      const msgs = [{ role: "system", content: GEN_SYSTEM }, { role: "user", content: userPrompt }];
      const urls = [
        `${aoaiBase}/openai/deployments/${deployment}/chat/completions?api-version=2024-12-01-preview`,
        `${aoaiBase}/openai/v1/chat/completions`
      ];
      for (const url of urls) {
        const body: Record<string, unknown> = { messages: msgs, temperature: 0.3, max_tokens: 1200 };
        if (url.includes("/v1/")) body.model = deployment;
        const res = await retryFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": config.foundryApiKey },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content ?? "{}";
          const r = tryParse(text);
          if (r) return r;
        }
      }
    } catch (err) {
      console.warn("[GenerationAgent] Azure OpenAI failed:", (err as Error).message);
    }
  }

  // ── Tier 4: Gemini ────────────────────────────────────────────────────────
  if (config.gemini) {
    try {
      const result = await callGeminiWithRetry(() => config.gemini!.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
        contents: `${userPrompt}\n\nReturn ONLY valid JSON, no markdown fences.`
      }));
      const r = tryParse(result.text ?? "{}");
      if (r) return r;
    } catch (err) {
      console.warn("[GenerationAgent] Gemini failed:", (err as Error).message);
    }
  }

  // ── Simulation fallback ───────────────────────────────────────────────────
  const breakingChanges = Array.isArray(report.breaking_changes) ? report.breaking_changes : [];
  const breakingSection = breakingChanges.length > 0
    ? `\n## ⚠️ Breaking Changes\n${breakingChanges.map(b => `- ${b}`).join("\n")}`
    : "";

  return {
    changelog_md: `# ${prTitle}

${riskEmoji} **Risk:** ${(report.risk?.level ?? "low").toUpperCase()} — ${report.risk?.rationale ?? "Risk assessed."}

## Summary
${report.summary}
${breakingSection}
## ${typeLabel === "Bugfix" ? "Fixed" : typeLabel === "Feature" ? "Added" : typeLabel === "Breaking" ? "Changed (Breaking)" : "Changed"}
${(report.impacted_areas ?? []).map(a => `- Updates to **${a}**`).join("\n") || "- Core updates"}

## Impacted Teams
${(report.audience ?? []).map(a => `- \`${a}\``).join("\n") || "- releases@cloudnexus.io"}

---
*Generated by Herald Release Concierge · ${new Date().toISOString().split("T")[0]}*`,

    docs_patch_md: `## Documentation Update

**PR:** ${prTitle}
**Affected areas:** ${report.impacted_areas.join(", ")}
**Risk:** ${report.risk.level} — ${report.risk.rationale}

### Suggested updates
- Add entry to \`CHANGELOG.md\` under next release version
- Update \`docs/architecture.md\` if service contracts changed
${report.breaking_changes.length > 0 ? "- **Update integration guides** — breaking changes affect downstream consumers\n- Notify API consumers before deploying" : "- No integration guide changes required"}

> *Verified by Herald · ${new Date().toISOString().split("T")[0]}*`,

    plain_summary: `${prTitle.replace(/^(feat|fix|chore|refactor|docs)(\(.+\))?!?:?\s*/i, "")} has been merged and is ready for rollout. This is a ${report.risk?.level ?? "low"}-risk ${report.change_type ?? "feature"} affecting ${(report.impacted_areas ?? []).slice(0, 2).join(" and ") || "core service"}. ${(report.breaking_changes ?? []).length > 0 ? "This release contains breaking changes — please coordinate with downstream teams before deploying." : "No breaking changes are expected and the update should be transparent to end users."}`
  };
}

function buildGenerationPrompt(prTitle: string, report: ImpactReport): string {
  return `Generate three release artifacts for this merged pull request. Be concise, accurate, and jargon-free.

PR Title: ${prTitle}
Change Type: ${report.change_type}
Risk: ${report.risk.level} — ${report.risk.rationale}
Summary: ${report.summary}
Breaking Changes: ${report.breaking_changes.join("; ") || "None"}
Impacted Areas: ${report.impacted_areas.join(", ")}
Audience: ${report.audience.join(", ")}

Return this exact JSON:
{
  "changelog_md": "full markdown changelog with ## Added/Changed/Fixed/Breaking sections as appropriate, risk badge, and generation timestamp",
  "docs_patch_md": "brief markdown suggestion for what docs need updating and how, with specific file paths",
  "plain_summary": "2-3 sentence plain-language summary for non-technical stakeholders, zero jargon, clearly states impact and any action needed"
}`;
}
