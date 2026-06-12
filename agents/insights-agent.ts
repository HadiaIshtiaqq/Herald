// ─── insights-agent.ts — Manager Insights Agent ───────────────────────────────
// Challenge A: "Surface manager-level insights across team readiness and risk"
// and "Present insights without exposing sensitive personal data."
//
// Deterministic by design — manager reporting must be reproducible and
// auditable, so this agent computes from data, never from a model:
//   • per-area certification coverage with criticality weighting (Fabric IQ)
//   • at-risk areas (high-criticality + low coverage)
//   • capacity-constrained members (Work IQ meeting/focus signals)
//   • one recommended next cert per gap, with the ontology path that justifies it
//
// Privacy: per-member details are aggregated; the report names members only in
// gap counts (synthetic demo data), never exposes calendars or raw signals.

import { FabricIQ } from "../lib/fabric-iq.js";

// ── Loose input types (structural — match Herald's data files defensively) ────

export interface InsightsMember {
  name?: string;
  upn?: string;
  role?: string;
  certifications?: string[];
  // Work IQ synthetic/live signals, if present on the member record:
  meeting_hours_per_week?: number;
  focus_hours_per_week?: number;
}

export interface InsightsParams {
  members: InsightsMember[];
  fabric: FabricIQ;
  /** Optional: areas touched by recent runs, to rank "areas under change" first */
  recentAreas?: string[];
  capacityMeetingThreshold?: number;   // default 20 h/week (per synthetic workload guidance)
}

export interface AreaInsight {
  area: string;
  criticality: "low" | "medium" | "high";
  coverage_pct: number;            // % of team holding ALL required certs for the area
  covered_members: number;
  team_size: number;
  missing_certs_histogram: Record<string, number>;
  recommended_cert: string | null;
  recommendation_path: string[];   // Fabric IQ relation chain — explainable
  under_recent_change: boolean;
}

export interface TeamInsightsReport {
  generated_at: string;
  team_size: number;
  overall_readiness: number;       // criticality-weighted mean of area coverage
  areas: AreaInsight[];
  at_risk_areas: string[];         // high criticality + coverage < 50%
  capacity_constrained: { name: string; meeting_hours: number; note: string }[];
  summary: string;                 // 2–3 sentence manager-ready narrative
  privacy_note: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function generateTeamInsights(params: InsightsParams): TeamInsightsReport {
  const { members, fabric } = params;
  const threshold = params.capacityMeetingThreshold ?? 20;
  const recent = new Set((params.recentAreas ?? []).map(a => a.toLowerCase()));

  const areas: AreaInsight[] = fabric.ontology.areas.map(area => {
    const required = area.required_certs.map(c => c.toUpperCase());
    let covered = 0;
    const histogram: Record<string, number> = {};

    for (const m of members) {
      const held = new Set((m.certifications ?? []).map(c => c.toUpperCase()));
      const missing = required.filter(c => !held.has(c));
      if (missing.length === 0 && required.length > 0) covered++;
      for (const c of missing) histogram[c] = (histogram[c] ?? 0) + 1;
    }

    // Recommend the cert that unblocks the most members, justified via ontology.
    const topMissing = Object.entries(histogram).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const rec = fabric.recommendNextCert([], area.id);
    const recommendedCert = topMissing ?? rec.value?.id ?? null;

    return {
      area: area.id,
      criticality: area.criticality ?? "medium",
      coverage_pct: members.length && required.length
        ? Math.round((covered / members.length) * 100)
        : 100,
      covered_members: covered,
      team_size: members.length,
      missing_certs_histogram: histogram,
      recommended_cert: recommendedCert,
      recommendation_path: topMissing
        ? [`${histogram[topMissing]} member(s) ─missing→ cert:${topMissing} ─required-by→ area:${area.id}`]
        : (required.length > 0 ? ["fully covered"] : rec.path),
      under_recent_change: recent.has(area.id.toLowerCase())
    };
  })
  // Areas under recent change first, then by risk (high criticality, low coverage).
  .sort((a, b) =>
    Number(b.under_recent_change) - Number(a.under_recent_change) ||
    weight(b) - weight(a)
  );

  const atRisk = areas
    .filter(a => a.criticality === "high" && a.coverage_pct < 50)
    .map(a => a.area);

  const capacityConstrained = members
    .filter(m => (m.meeting_hours_per_week ?? 0) > threshold)
    .map(m => ({
      name: m.name ?? "(unnamed)",
      meeting_hours: m.meeting_hours_per_week ?? 0,
      note: `>${threshold}h meetings/week — schedule study in focus windows (Work IQ signal)`
    }));

  const weights = { high: 3, medium: 2, low: 1 } as const;
  const weightSum = areas.reduce((s, a) => s + weights[a.criticality], 0) || 1;
  const overall = Math.round(
    areas.reduce((s, a) => s + a.coverage_pct * weights[a.criticality], 0) / weightSum
  );

  const summary =
    `Team readiness is ${overall}% (criticality-weighted across ${areas.length} service areas). ` +
    (atRisk.length
      ? `At-risk: ${atRisk.join(", ")} — high-criticality areas where under half the team holds the required certifications. `
      : `No high-criticality area is below 50% coverage. `) +
    (capacityConstrained.length
      ? `${capacityConstrained.length} member(s) are capacity-constrained (>${threshold}h meetings/week); study plans should target their focus windows.`
      : `No member is currently capacity-constrained for study.`);

  return {
    generated_at: new Date().toISOString(),
    team_size: members.length,
    overall_readiness: overall,
    areas,
    at_risk_areas: atRisk,
    capacity_constrained: capacityConstrained,
    summary,
    privacy_note: "Aggregated synthetic demo data. No calendars, message content, or real PII are read or exposed."
  };
}

function weight(a: AreaInsight): number {
  const crit = { high: 3, medium: 2, low: 1 }[a.criticality];
  return crit * (100 - a.coverage_pct);
}
