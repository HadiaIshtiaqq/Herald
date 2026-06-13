// ─── adjudicator.ts — the Release Verdict ─────────────────────────────────────
// Herald's reasoning agents (Reasoning, Readiness) FORM the analysis. This
// deterministic module OWNS the verdict — the same inputs always yield the same
// decision, and every decision carries the evidence that produced it.
//
//   Semantic reasoning forms the question. Deterministic policy owns the verdict.
//
// Three things make this a *reasoning* verdict rather than a rubber stamp:
//
//   1. Authority resolution — every changed path is attributed to an owning team
//      from the ownership map, INDEPENDENTLY of what the model claimed. The model
//      is free to guess "core-service"; the adjudicator checks whether any team
//      actually owns the code.
//
//   2. Abstention — when the change cannot be attributed to any team, or an owning
//      team is unstaffed, Herald REFUSES to certify readiness it cannot ground.
//      It escalates for an ownership decision instead of emitting a confident
//      green light it has no basis for. (Refusing to decide is a first-class
//      outcome, not an error.)
//
//   3. False-conflict rejection — a "missing" certification that is already
//      satisfied by a superseding credential is not a real gap. It is struck from
//      the blocker, with the reason recorded, so Herald never blocks a release on
//      a conflict that does not really exist.

import type {
  OwnershipMap, AreaCertData, CertData, ImpactReport, TeamReadinessReport,
  ReleaseVerdict, VerdictEvidence, AuthorityRecord, FalseConflict
} from "../src/types.js";

const VERDICT_TAGLINE = "Semantic reasoning forms the question. Deterministic policy owns the verdict.";

// Microsoft certification hierarchy — a senior credential satisfies the
// requirement for the junior certs it supersedes. Conservative, defensible
// pairs only (Microsoft positions the junior certs as prerequisites for the
// senior ones). Data-driven override lives in area-cert-requirements.json.
const DEFAULT_SUPERSEDES: Record<string, string[]> = {
  "SC-100": ["SC-300", "AZ-500"], // Cybersecurity Architect ⊃ Identity Admin, Security Engineer
  "AZ-400": ["AZ-104"]            // DevOps Engineer Expert ⊃ Administrator
};

export interface AdjudicateInput {
  changedPaths: string[];
  impactReport: ImpactReport;
  teamReadiness: TeamReadinessReport;
  ownershipMap: OwnershipMap;
  areaCertData: AreaCertData;
  certData: CertData;
}

// Paths that never require certification ownership — flagging them as
// "unowned" would be noise, not signal.
function isNonSubstantivePath(p: string): boolean {
  const pl = p.toLowerCase();
  return /\.md$|\.mdx$|readme|changelog|license|\.txt$|\.lock$|package-lock|\.gitignore|\.editorconfig/.test(pl);
}

export function adjudicate(input: AdjudicateInput): ReleaseVerdict {
  const { changedPaths, impactReport, teamReadiness, ownershipMap, areaCertData, certData } = input;
  const evidence: VerdictEvidence[] = [];

  // ── 1. Authority resolution (deterministic, path-based) ─────────────────────
  // Re-derive ownership straight from the diff — do not trust the model's
  // impacted_areas. Each path is attributed to every area whose patterns it
  // matches; paths that match nothing are unattributable.
  const areaToPaths = new Map<string, string[]>();
  const unownedPaths: string[] = [];

  for (const rawPath of changedPaths) {
    const pl = rawPath.toLowerCase();
    const matched = ownershipMap.areas.filter(area =>
      area.pathPatterns.some(pat => pl.includes(pat.toLowerCase()))
    );
    if (matched.length === 0) {
      if (!isNonSubstantivePath(rawPath)) unownedPaths.push(rawPath);
      continue;
    }
    for (const area of matched) {
      const list = areaToPaths.get(area.name) ?? [];
      list.push(rawPath);
      areaToPaths.set(area.name, list);
    }
  }

  const ownedAreaNames = Array.from(areaToPaths.keys());

  // Staffing: does the owning team actually have engineers we can assess?
  const authority: AuthorityRecord[] = ownedAreaNames.map(area => {
    const team = ownershipMap.areas.find(a => a.name === area)?.team ?? "";
    const memberCount = certData.team_members.filter(m => m.team === team).length;
    return { area, team, staffed: memberCount > 0, member_count: memberCount, paths: areaToPaths.get(area) ?? [] };
  });
  const unstaffedAreas = authority.filter(a => !a.staffed).map(a => a.area);

  if (authority.length > 0) {
    evidence.push({
      kind: "authority",
      detail: `Authority resolved from the diff: ${authority.map(a => `${a.area} → ${a.team} (${a.member_count} engineer${a.member_count === 1 ? "" : "s"})`).join("; ")}.`,
      source: "config/ownership.json + data/team-certifications.json"
    });
  }
  if (unownedPaths.length > 0) {
    evidence.push({
      kind: "authority",
      detail: `${unownedPaths.length} changed path(s) match no owning team: ${unownedPaths.join(", ")}.`,
      source: "config/ownership.json"
    });
  }

  const escalation = (impactReport.audience && impactReport.audience.length > 0)
    ? impactReport.audience
    : ownershipMap.default_audience;

  // ── 2. False-conflict rejection (cert supersession) ─────────────────────────
  const supersedes = areaCertData.cert_supersedes ?? DEFAULT_SUPERSEDES;
  const criticalCerts = new Set((areaCertData.critical_certs ?? []).map(c => c.toUpperCase()));
  const certName = (c: string) => areaCertData.cert_metadata?.[c]?.name;

  // Which held cert (if any) supersedes the required one?
  function supersedingCert(heldCerts: string[], requiredCert: string): string | null {
    const req = requiredCert.toUpperCase();
    for (const held of heldCerts) {
      const covers = (supersedes[held] ?? supersedes[held.toUpperCase()] ?? []).map(x => x.toUpperCase());
      if (covers.includes(req)) return held;
    }
    return null;
  }

  const falseConflicts: FalseConflict[] = [];
  const realBlockers: string[] = [];

  for (const gap of teamReadiness.gaps) {
    const member = certData.team_members.find(m => m.id === gap.member_id);
    const held = member?.certifications ?? [];
    for (const missing of gap.missing_certs) {
      const superseded = supersedingCert(held, missing);
      if (superseded) {
        const heldName = certName(superseded);
        const reqName = certName(missing);
        falseConflicts.push({
          member: gap.name,
          member_id: gap.member_id,
          required_cert: missing,
          superseded_by: superseded,
          note: `${gap.name} holds ${superseded}${heldName ? ` (${heldName})` : ""}, which supersedes the required ${missing}${reqName ? ` (${reqName})` : ""} — not a real gap.`
        });
      } else if (criticalCerts.has(missing.toUpperCase())) {
        realBlockers.push(`${gap.name} (${gap.team}) lacks ${missing}${certName(missing) ? ` — ${certName(missing)}` : ""} [critical]`);
      }
    }
  }

  if (falseConflicts.length > 0) {
    evidence.push({
      kind: "false_conflict",
      detail: `${falseConflicts.length} certification conflict(s) rejected as false — a superseding credential already satisfies the requirement: ${falseConflicts.map(f => `${f.member} (${f.required_cert} ⊃ ${f.superseded_by})`).join("; ")}.`,
      source: "adjudicator: cert supersession"
    });
  }

  const hasRealCriticalBlocker = realBlockers.length > 0;

  // ── 3. Verdict ──────────────────────────────────────────────────────────────
  // ABSTAIN takes precedence: if Herald cannot ground the decision, it does not
  // decide, regardless of what the readiness score happened to come out as.
  if (ownedAreaNames.length === 0) {
    evidence.push({
      kind: "abstention",
      detail: `No team owns the changed paths. The reasoning agent reported impacted_areas=[${impactReport.impacted_areas.join(", ")}], but that is a guess — the diff matches no ownership pattern, so readiness cannot be certified.`,
      source: "config/ownership.json"
    });
    return {
      decision: "ABSTAIN",
      headline: "Herald abstains — ownership unresolved",
      rationale: `This change cannot be attributed to any owning team, so Herald will not certify readiness it cannot ground. Escalating for an ownership decision rather than emitting a green light it has no basis for.`,
      tagline: VERDICT_TAGLINE,
      authority,
      unowned_paths: unownedPaths,
      unstaffed_areas: unstaffedAreas,
      false_conflicts_rejected: falseConflicts,
      real_blockers: realBlockers,
      evidence,
      // We could not attribute the change, so the model's audience guess is moot —
      // escalate to the release owners to assign an owner.
      escalation: ownershipMap.default_audience
    };
  }

  if (unstaffedAreas.length > 0) {
    evidence.push({
      kind: "abstention",
      detail: `Owning team(s) for [${unstaffedAreas.join(", ")}] have no engineers on the roster — readiness cannot be assessed against an empty team.`,
      source: "data/team-certifications.json"
    });
    return {
      decision: "ABSTAIN",
      headline: "Herald abstains — owning team unstaffed",
      rationale: `The team(s) that own [${unstaffedAreas.join(", ")}] have no members Herald can assess. It will not certify readiness for an unstaffed area; escalating for staffing/ownership.`,
      tagline: VERDICT_TAGLINE,
      authority,
      unowned_paths: unownedPaths,
      unstaffed_areas: unstaffedAreas,
      false_conflicts_rejected: falseConflicts,
      real_blockers: realBlockers,
      evidence,
      escalation
    };
  }

  // Grounded — now decide CLEAR vs BLOCKED on the *real* (post-rejection) gaps.
  if (teamReadiness.blocking_deployment && hasRealCriticalBlocker) {
    evidence.push({
      kind: "blocker",
      detail: `Real critical certification gap(s) remain after false-conflict rejection: ${realBlockers.join("; ")}. Team readiness ${teamReadiness.overall_score}%.`,
      source: "readiness-agent + area-cert-requirements.json"
    });
    return {
      decision: "BLOCKED",
      headline: "Blocked — unresolved critical certification gap",
      rationale: `A real, non-superseded critical certification gap owns this verdict: ${realBlockers[0]}${realBlockers.length > 1 ? ` (+${realBlockers.length - 1} more)` : ""}. Resolve before rollout.`,
      tagline: VERDICT_TAGLINE,
      authority,
      unowned_paths: unownedPaths,
      unstaffed_areas: unstaffedAreas,
      false_conflicts_rejected: falseConflicts,
      real_blockers: realBlockers,
      evidence,
      escalation
    };
  }

  // CLEAR. Note when a readiness block was *lifted* purely by false-conflict
  // rejection — that is the adjudicator out-reasoning the raw score.
  if (teamReadiness.blocking_deployment && !hasRealCriticalBlocker) {
    evidence.push({
      kind: "policy",
      detail: `Readiness flagged a deployment block, but every critical gap was a false conflict (superseding credential held). Block lifted — no real blocker remains.`,
      source: "adjudicator"
    });
  } else {
    evidence.push({
      kind: "readiness",
      detail: `Change attributed to staffed owning team(s) with no unresolved critical certification gap. Team readiness ${teamReadiness.overall_score}%.`,
      source: "readiness-agent"
    });
  }

  return {
    decision: "CLEAR",
    headline: teamReadiness.blocking_deployment ? "Clear — readiness block lifted (false conflict)" : "Clear to ship",
    rationale: teamReadiness.blocking_deployment
      ? `Ownership is resolved and every critical gap was a false conflict — a superseding credential already covers it. No real blocker remains.`
      : `Ownership is resolved, the owning team is staffed, and no real critical certification gap blocks this release.`,
    tagline: VERDICT_TAGLINE,
    authority,
    unowned_paths: unownedPaths,
    unstaffed_areas: unstaffedAreas,
    false_conflicts_rejected: falseConflicts,
    real_blockers: realBlockers,
    evidence,
    escalation
  };
}
