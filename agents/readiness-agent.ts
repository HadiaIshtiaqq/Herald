/**
 * Herald Team Readiness Agent — Microsoft Foundry IQ + Work IQ
 * Assesses team certification readiness for affected service areas.
 * Uses Work IQ signals (meeting load, focus hours) to generate capacity-aware study plans.
 * Study plans are AI-generated via Foundry for personalized, grounded recommendations.
 */
import { GoogleGenAI } from "@google/genai";
import { TeamReadinessReport, CertGap, CertStudyPlan } from "../src/types.js";
import { callFoundryAgent, callPhi4, stripJsonFences, extractJson, retryFetch, callGeminiWithRetry } from "./foundry-agent-client.js";
import type { WorkIQSignalMap } from "./work-iq.js";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  team: string;
  certifications: string[];
  meeting_hours_per_week: number;
  focus_hours_per_week: number;
  preferred_learning_slot: string;
  upn?: string;
}

export interface CertMetadata {
  name: string;
  recommended_hours: number;
  level: string;
}

export interface AreaCertRequirement {
  required: string[];
  recommended: string[];
  rationale: string;
}

export interface ReadinessCertData {
  team_members: TeamMember[];
}

export interface ReadinessAreaData {
  cert_metadata: Record<string, CertMetadata>;
  critical_certs: string[];
  requirements: Record<string, AreaCertRequirement>;
}

export interface ReadinessAgentInput {
  impactedAreas: string[];
  prTitle: string;
  changeType: string;
  riskLevel: string;
}

export interface ReadinessAgentConfig {
  certData: ReadinessCertData;
  areaCertData: ReadinessAreaData;
  ownershipTeamMap: Record<string, string>;
  // Live Work IQ signals from Microsoft 365 calendar (optional — falls back to synthetic)
  liveWorkIQSignals?: WorkIQSignalMap;
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

export async function assessTeamReadiness(
  input: ReadinessAgentInput,
  config: ReadinessAgentConfig
): Promise<TeamReadinessReport> {
  const { impactedAreas } = input;

  const criticalCerts = new Set(config.areaCertData.critical_certs);
  const liveSignalCount = config.liveWorkIQSignals
    ? Object.values(config.liveWorkIQSignals).filter(s => s.source === "live").length
    : 0;

  // Per-area scoring: each area is evaluated against its own team and its own required certs.
  // This avoids the union-cert trap where no single engineer holds certs for every area combined.
  interface AreaResult {
    area: string;
    team: string;
    required: string[];
    memberCount: number;
    readyCount: number;
    gaps: CertGap[];
    score: number;
  }

  const areaResults: AreaResult[] = [];

  for (const area of impactedAreas) {
    const req = config.areaCertData.requirements[area];
    const areaCerts = req?.required ?? [];
    const teamName = config.ownershipTeamMap[area] ?? "";

    if (areaCerts.length === 0) {
      areaResults.push({ area, team: teamName, required: [], memberCount: 0, readyCount: 0, gaps: [], score: 100 });
      continue;
    }

    const areaMembers = config.certData.team_members.filter(m =>
      !teamName || m.team === teamName
    ).slice(0, 8);

    if (areaMembers.length === 0) {
      areaResults.push({ area, team: teamName, required: areaCerts, memberCount: 0, readyCount: 0, gaps: [], score: 100 });
      continue;
    }

    let areaReadyCount = 0;
    const areaGaps: CertGap[] = [];

    for (const member of areaMembers) {
      const missingCerts = areaCerts.filter(c => !member.certifications.includes(c));
      if (missingCerts.length === 0) { areaReadyCount++; continue; }

      // Work IQ: use live M365 calendar signals when available, fall back to synthetic
      const liveSignal = config.liveWorkIQSignals?.[member.id];
      const meetingHours = liveSignal?.meeting_hours_per_week ?? member.meeting_hours_per_week;
      const focusHours = liveSignal?.focus_hours_per_week ?? member.focus_hours_per_week;
      const learningSlot = liveSignal?.preferred_learning_slot ?? member.preferred_learning_slot;

      const availableHours = Math.max(2, focusHours - 4);
      const weeklyCapacity = meetingHours > 20 ? Math.min(4, availableHours) : Math.min(8, availableHours);

      const studyPlans: CertStudyPlan[] = missingCerts.map(cert => {
        const meta = config.areaCertData.cert_metadata[cert] ?? { name: cert, recommended_hours: 20, level: "intermediate" };
        return {
          certification: cert,
          cert_name: meta.name,
          recommended_hours: meta.recommended_hours,
          priority: criticalCerts.has(cert) ? "high" : missingCerts.length > 1 ? "medium" : "low",
          suggested_window: learningSlot,
          weekly_capacity_hours: weeklyCapacity,
          estimated_weeks: Math.ceil(meta.recommended_hours / Math.max(1, weeklyCapacity))
        };
      });

      areaGaps.push({ member_id: member.id, name: member.name, role: member.role, team: member.team, missing_certs: missingCerts, study_plans: studyPlans });
    }

    const areaScore = Math.round((areaReadyCount / areaMembers.length) * 100);
    areaResults.push({ area, team: teamName, required: areaCerts, memberCount: areaMembers.length, readyCount: areaReadyCount, gaps: areaGaps, score: areaScore });
  }

  // All required certs (union, for display)
  const allRequired = [...new Set(areaResults.flatMap(ar => ar.required))];

  if (allRequired.length === 0) {
    return {
      overall_score: 100, required_certifications: [], ready_count: 0, total_count: 0,
      gaps: [], blocking_deployment: false,
      reasoning_trace: [
        `Step 1 — Cert lookup: No certifications required for areas [${impactedAreas.join(", ")}].`,
        `Step 2 — Team assessment: No gaps to analyze.`,
        `Step 3 — Readiness: 100% — no cert blockers for this release.`
      ]
    };
  }

  // Merge gaps by member ID — a member may own multiple areas
  const gapsByMember = new Map<string, CertGap>();
  for (const ar of areaResults) {
    for (const gap of ar.gaps) {
      const existing = gapsByMember.get(gap.member_id);
      if (existing) {
        const merged = new Set([...existing.missing_certs, ...gap.missing_certs]);
        existing.missing_certs = Array.from(merged);
        for (const plan of gap.study_plans) {
          if (!existing.study_plans.some(p => p.certification === plan.certification)) {
            existing.study_plans.push(plan);
          }
        }
      } else {
        gapsByMember.set(gap.member_id, { ...gap, missing_certs: [...gap.missing_certs], study_plans: [...gap.study_plans] });
      }
    }
  }
  const allGapsBase = Array.from(gapsByMember.values());

  // Enrich gaps with AI-generated study plan narratives (Foundry IQ grounding)
  const gaps = allGapsBase.length > 0
    ? await enrichGapsWithAI(allGapsBase, input, config)
    : allGapsBase;

  // Overall score: weighted average across areas (by member count)
  const areasWithMembers = areaResults.filter(ar => ar.memberCount > 0);
  const totalCount = areasWithMembers.reduce((s, ar) => s + ar.memberCount, 0);
  const readyCount = areasWithMembers.reduce((s, ar) => s + ar.readyCount, 0);
  const overallScore = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 100;

  const hasCriticalGap = gaps.some(g => g.missing_certs.some(c => criticalCerts.has(c)));
  const blockingDeployment = hasCriticalGap && overallScore < 70;

  const relevantTeams = new Set(areaResults.map(ar => ar.team).filter(Boolean));
  const areaScoreSummary = areaResults.map(ar => `${ar.area}: ${ar.score}%`).join(", ");

  return {
    overall_score: overallScore,
    required_certifications: allRequired,
    ready_count: readyCount,
    total_count: totalCount,
    gaps,
    blocking_deployment: blockingDeployment,
    reasoning_trace: [
      `Step 1 — Foundry IQ: Areas [${impactedAreas.join(", ")}] require certs: ${allRequired.join(", ")}.`,
      `Step 2 — Work IQ (${liveSignalCount > 0 ? `live M365 calendar signals: ${liveSignalCount} member(s)` : "synthetic signals from team-certifications.json"}): Per-area teams: ${areaResults.map(ar => `${ar.area} → ${ar.team || "all"} (${ar.memberCount} members)`).join("; ")}.`,
      `Step 3 — Gap analysis: ${gaps.length} engineer(s) missing area-specific certs. Per-area scores: ${areaScoreSummary}.`,
      `Step 4 — Study plans: ${liveSignalCount > 0 ? "Capacity-aware schedules from live M365 calendar signals" : "Capacity-aware schedules from Work IQ signals"} — weekly capacity ${gaps[0]?.study_plans[0]?.weekly_capacity_hours ?? "N/A"}h for highest-gap engineer.`,
      `Step 5 — Readiness score: ${overallScore}% (${readyCount}/${totalCount} across ${areasWithMembers.length} area(s)). ${hasCriticalGap ? `Critical cert gaps detected: ${Array.from(criticalCerts).filter(c => allRequired.includes(c)).join(", ")}.` : "No critical cert gaps."} ${blockingDeployment ? "Deployment BLOCKED — resolve gaps before rollout." : "Readiness threshold met."}`
    ]
  };
}

const READINESS_SYSTEM = "You are Herald's team readiness agent. Generate personalized, actionable certification study plans grounded in the engineer's work context. Return ONLY valid JSON.";

async function enrichGapsWithAI(
  gaps: CertGap[],
  input: ReadinessAgentInput,
  config: ReadinessAgentConfig
): Promise<CertGap[]> {
  const prompt = buildStudyPlanPrompt(gaps, input);
  let aiText: string | null = null;

  // Tier 1: Foundry Agent
  if (!aiText && config.foundryAgentId && config.foundryProjectEndpoint && config.foundryApiKey) {
    try {
      aiText = await callFoundryAgent(config.foundryAgentId, config.foundryProjectEndpoint, config.foundryApiKey, `${READINESS_SYSTEM}\n\n${prompt}\n\nReturn ONLY valid JSON.`);
    } catch { /* fall through */ }
  }

  // Tier 2: Phi-4-reasoning
  if (!aiText && config.foundryInferenceEndpoint && config.foundryApiKey) {
    try {
      aiText = await callPhi4(config.foundryInferenceEndpoint, config.foundryApiKey, config.foundryInferenceDeployment ?? "phi-4-reasoning", [
        { role: "system", content: READINESS_SYSTEM },
        { role: "user", content: prompt }
      ], 1200, 0.3);
    } catch { /* fall through */ }
  }

  // Tier 3: Azure OpenAI (classic deployment path OR AI Foundry serverless /openai/v1)
  if (!aiText && config.foundryEndpoint && config.foundryApiKey) {
    try {
      const deployment = config.foundryDeployment ?? "gpt-4o";
      const aoaiBase = config.foundryEndpoint.replace(/\/$/, "");
      const msgs = [{ role: "system", content: READINESS_SYSTEM }, { role: "user", content: prompt }];
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
          aiText = data.choices?.[0]?.message?.content ?? null;
          if (aiText) break;
        }
      }
    } catch { /* fall through */ }
  }

  // Tier 4: Gemini
  if (!aiText && config.gemini) {
    try {
      const result = await callGeminiWithRetry(() => config.gemini!.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
        contents: `${prompt}\n\nReturn ONLY valid JSON, no markdown.`
      }));
      aiText = result.text ?? null;
    } catch { /* fall through */ }
  }

  if (!aiText) return gaps;

  try {
    const cleaned = extractJson(aiText);
    const enriched: Array<{ member_id: string; ai_recommendation: string }> = JSON.parse(cleaned);
    return gaps.map(gap => {
      const match = enriched.find(e => e.member_id === gap.member_id);
      if (!match) return gap;
      return {
        ...gap,
        study_plans: gap.study_plans.map(plan => ({
          ...plan,
          ai_recommendation: match.ai_recommendation
        } as CertStudyPlan & { ai_recommendation: string }))
      };
    });
  } catch {
    return gaps;
  }
}

function buildStudyPlanPrompt(gaps: CertGap[], input: ReadinessAgentInput): string {
  const gapSummary = gaps.map(g =>
    `- ${g.name} (${g.role}, ${g.team}): missing ${g.missing_certs.join(", ")}. ` +
    `Weekly capacity: ${g.study_plans[0]?.weekly_capacity_hours ?? "?"}h. Preferred: ${g.study_plans[0]?.suggested_window ?? "?"}.`
  ).join("\n");

  return `Generate personalized AI study plan recommendations for these engineers who have certification gaps related to a ${input.riskLevel}-risk ${input.changeType} change ("${input.prTitle}").

Engineers with gaps:
${gapSummary}

For each engineer, provide a brief, actionable 1-2 sentence recommendation that:
- References their specific missing certs
- Accounts for their schedule capacity
- Gives a realistic timeline
- Suggests a study approach

Return this exact JSON:
[
  {
    "member_id": "ENG-XXX",
    "ai_recommendation": "personalized 1-2 sentence recommendation"
  }
]`;
}
