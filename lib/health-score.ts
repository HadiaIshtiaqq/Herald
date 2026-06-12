// ─── health-score.ts — Release Health Score (architecture-health pattern) ─────
// A quantified, multi-dimension assessment of a single release decision —
// deterministic so the same run always scores the same, with every dimension
// carrying the evidence that produced it. Dimensions:
//   • readiness          — team certification coverage for the changed areas
//   • blast_containment  — inverse of the ontology blast score (smaller radius = healthier)
//   • approval_hygiene   — where the run sits relative to the human gate
//   • ai_grounding       — which tier produced the reasoning (Foundry-first scoring)
//
// Also derives a phased remediation roadmap (modernization-roadmap pattern):
// what to do this week / next / ongoing, with effort projections from the
// ontology's per-cert study hours.

import { FabricIQ } from "./fabric-iq.js";
import type { BlastRadiusReport } from "./fabric-iq.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthDimension {
  id: "readiness" | "blast_containment" | "approval_hygiene" | "ai_grounding";
  label: string;
  score: number;       // 0–100
  weight: number;      // sums to 1 across dimensions
  evidence: string;
}

export interface ReleaseHealth {
  overall: number;     // 0–100, weighted
  grade: "A" | "B" | "C" | "D";
  dimensions: HealthDimension[];
}

export interface RoadmapItem {
  member: string;
  certification: string;
  hours: number;
  critical: boolean;
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  timeframe: string;
  items: string[];
  effort_hours: number;
}

// Structural input — matches Herald's Run without importing UI types.
export interface HealthInput {
  status: string;
  ai_tier_used?: string;
  team_readiness?: {
    overall_score: number;
    blocking_deployment: boolean;
    gaps: Array<{ name: string; missing_certs: string[] }>;
  };
  impact_report?: { risk?: { level?: string } };
}

// ── Score ─────────────────────────────────────────────────────────────────────

const TIER_GROUNDING: Record<string, { score: number; note: string }> = {
  "foundry-agent": { score: 100, note: "Microsoft Foundry Agent (track-required tool) produced the reasoning" },
  "phi4":          { score: 90,  note: "Phi-4-reasoning on the Foundry inference endpoint" },
  "azure-openai":  { score: 85,  note: "Azure OpenAI deployment" },
  "gemini":        { score: 65,  note: "non-Microsoft fallback tier (Gemini)" },
  "simulation":    { score: 40,  note: "deterministic heuristic — no model available" }
};

export function computeReleaseHealth(run: HealthInput, blast: BlastRadiusReport): ReleaseHealth {
  const readinessScore = run.team_readiness?.overall_score ?? 50;
  const blocking = run.team_readiness?.blocking_deployment ?? false;

  const approval =
    run.status === "done" ? { score: 100, note: "human approved; gated actions executed" } :
    run.status === "rejected" ? { score: 95, note: "human rejected — the gate did its job" } :
    run.status === "ready_for_review" ? { score: 70, note: "awaiting human review — no org-visible action taken" } :
    run.status === "error" ? { score: 30, note: "pipeline error — investigate before acting" } :
    { score: 60, note: `status: ${run.status}` };

  const grounding = TIER_GROUNDING[run.ai_tier_used ?? ""] ?? { score: 50, note: `unknown tier "${run.ai_tier_used}"` };

  const dimensions: HealthDimension[] = [
    {
      id: "readiness",
      label: "Team readiness",
      score: readinessScore,
      weight: 0.35,
      evidence: `${readinessScore}% certification coverage for the changed areas` +
        (blocking ? " — critical gaps are blocking deployment" : "")
    },
    {
      id: "blast_containment",
      label: "Blast containment",
      score: Math.max(0, 100 - blast.blast_score),
      weight: 0.30,
      evidence: `blast score ${blast.blast_score}/100 across ${blast.total_areas_affected} dependent area(s) — lower radius scores higher`
    },
    {
      id: "approval_hygiene",
      label: "Approval hygiene",
      score: approval.score,
      weight: 0.20,
      evidence: approval.note
    },
    {
      id: "ai_grounding",
      label: "AI grounding",
      score: grounding.score,
      weight: 0.15,
      evidence: grounding.note
    }
  ];

  const overall = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));
  const grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 50 ? "C" : "D";
  return { overall, grade, dimensions };
}

// ── Remediation roadmap ───────────────────────────────────────────────────────

export function buildRemediationRoadmap(
  run: HealthInput,
  fabric: FabricIQ,
  criticalCerts: string[]
): RoadmapPhase[] {
  const gaps = run.team_readiness?.gaps ?? [];
  const critical = new Set(criticalCerts.map(c => c.toUpperCase()));

  const items: RoadmapItem[] = gaps.flatMap(g =>
    g.missing_certs.map(cert => ({
      member: g.name,
      certification: cert,
      hours: fabric.cert(cert)?.hours ?? 20,
      critical: critical.has(cert.toUpperCase())
    }))
  );

  const p1 = items.filter(i => i.critical);
  const p2 = items.filter(i => !i.critical);

  const phases: RoadmapPhase[] = [];
  phases.push({
    phase: 1,
    title: "Close critical certification gaps",
    timeframe: "This week",
    items: p1.length
      ? p1.map(i => `${i.member} → ${i.certification} (~${i.hours}h, capacity-aware study plan issued)`)
      : ["No critical-cert gaps — confirm the deployment block (if any) is lifted"],
    effort_hours: p1.reduce((s, i) => s + i.hours, 0)
  });
  phases.push({
    phase: 2,
    title: "Complete remaining certifications",
    timeframe: "Next 2–4 weeks",
    items: p2.length
      ? p2.map(i => `${i.member} → ${i.certification} (~${i.hours}h)`)
      : ["All remaining gaps are critical-tier and covered in Phase 1"],
    effort_hours: p2.reduce((s, i) => s + i.hours, 0)
  });
  phases.push({
    phase: 3,
    title: "Sustain readiness",
    timeframe: "Ongoing",
    items: [
      "Re-run grounded assessments after each study plan completes (target ≥75%)",
      "Review /insights/team monthly for at-risk areas and capacity constraints",
      "Keep the ontology's area→cert requirements in sync with ownership changes"
    ],
    effort_hours: 2
  });
  return phases;
}
