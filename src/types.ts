export type PRType = 'FEATURE' | 'BUGFIX' | 'CHORE' | 'REFACTOR';

// ─── Shared domain types used by both server.ts and lib/pipeline.ts ──────────

export interface OwnershipArea {
  name: string;
  pathPatterns: string[];
  team: string;
  contacts: string[];
}

export interface OwnershipMap {
  areas: OwnershipArea[];
  default_audience: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  team: string;
  certifications: string[];
  meeting_hours_per_week: number;
  focus_hours_per_week: number;
  preferred_learning_slot: string;
  upn?: string; // M365 User Principal Name — used by Work IQ to fetch live calendar signals
}

interface CertMetadata { name: string; recommended_hours: number; level: string; }
interface AreaCertRequirement { required: string[]; recommended: string[]; rationale: string; }

export interface CertData { team_members: TeamMember[]; }

export interface AreaCertData {
  cert_metadata: Record<string, CertMetadata>;
  critical_certs: string[];
  requirements: Record<string, AreaCertRequirement>;
  // Microsoft certification hierarchy: a senior credential satisfies the
  // requirement for the junior certs it supersedes. Used by the adjudicator to
  // reject *false* certification conflicts. Optional — falls back to a built-in
  // default when absent.
  cert_supersedes?: Record<string, string[]>;
}

// Persisted review comment (stored server-side under /api/prs/:id/comments)
export interface PRComment {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  text: string;
  created_at: string;
  is_voice_note?: boolean;
  reactions?: Record<string, string[]>;
}
export type PRStatus = 'Released' | 'In Progress' | 'Pending Review';

export interface ReasoningStep {
  title: string;
  description: string;
  status: 'success' | 'warning' | 'info' | 'error';
  icon: string;
}

export interface PullRequest {
  id: string;
  title: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  type: PRType;
  branch: string;
  risk: 'Low' | 'Medium' | 'High';
  riskDetail: string;
  filesChanged: number;
  methodsImpacted: number;
  status: PRStatus;
  description: string;
  version: string;
  changelog: string;
  teamsPost: string;
  reasoningTrace: ReasoningStep[];
  approved?: boolean;
  verified?: boolean;
  reviewer?: string;
  changedFiles?: string[];
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface DashboardStats {
  activePRsCount: number;
  avgRiskLevel: 'Low' | 'Medium' | 'High';
  deploySpeed: string;
  rollbackRate: string;
  totalReleases7d: number;
  successRate: string;
  activePipelinesCount: number;
}

// ─── Herald Run (TRD §6 + §7a) ───────────────────────────────────────────────

export type ChangeType = 'feature' | 'bugfix' | 'breaking' | 'chore';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RunStatus =
  | 'reasoning'
  | 'ready_for_review'
  | 'approved'
  | 'acting'
  | 'done'
  | 'error';

export interface ImpactRisk {
  level: RiskLevel;
  rationale: string;
}

export interface ImpactReport {
  summary: string;
  change_type: ChangeType;
  risk: ImpactRisk;
  breaking_changes: string[];
  impacted_areas: string[];
  audience: string[];
  reasoning_trace: string[];
}

export interface RunArtifacts {
  changelog_md: string;
  docs_patch_md: string;
  plain_summary: string;
}

export interface ActionsResult {
  teams?: string | null;
  sharepoint?: string | null;
  outlook?: string | null;
  study_plans?: string | null;
}

// ─── Team Readiness (Reasoning Agents track — certification readiness agent) ──

export interface CertStudyPlan {
  certification: string;
  cert_name: string;
  recommended_hours: number;
  priority: 'high' | 'medium' | 'low';
  suggested_window: string;
  weekly_capacity_hours: number;
  estimated_weeks: number;
}

export interface CertGap {
  member_id: string;
  name: string;
  role: string;
  team: string;
  missing_certs: string[];
  study_plans: CertStudyPlan[];
}

export interface TeamReadinessReport {
  overall_score: number;
  required_certifications: string[];
  ready_count: number;
  total_count: number;
  gaps: CertGap[];
  blocking_deployment: boolean;
  reasoning_trace: string[];
}

// ─── Release Verdict (the adjudicator) ────────────────────────────────────────
// The AI agents FORM the analysis; the adjudicator OWNS the verdict. Exactly one
// decision is emitted, grounded in cited evidence:
//   CLEAR   — attributable, staffed, no real certification blocker
//   BLOCKED — a real (non-superseded) critical certification gap blocks rollout
//   ABSTAIN — Herald refuses to certify readiness it cannot ground (unattributable
//             change or unstaffed owning team) and escalates instead of guessing
export type VerdictDecision = 'CLEAR' | 'BLOCKED' | 'ABSTAIN';

export interface VerdictEvidence {
  kind: 'authority' | 'abstention' | 'false_conflict' | 'blocker' | 'readiness' | 'policy';
  detail: string;
  source: string; // where it was grounded (ownership.json, area-cert-requirements.json, …)
}

export interface AuthorityRecord {
  area: string;
  team: string;
  staffed: boolean;
  member_count: number;
  paths: string[];
}

export interface FalseConflict {
  member: string;
  member_id: string;
  required_cert: string;
  superseded_by: string;
  note: string;
}

export interface ReleaseVerdict {
  decision: VerdictDecision;
  headline: string;
  rationale: string;
  tagline: string;
  authority: AuthorityRecord[];
  unowned_paths: string[];        // changed paths attributable to no owning team
  unstaffed_areas: string[];      // owned areas whose team has zero roster members
  false_conflicts_rejected: FalseConflict[];
  real_blockers: string[];        // critical gaps that survive false-conflict rejection
  evidence: VerdictEvidence[];
  escalation?: string[];          // who Herald escalates to when it abstains
}

// ─── Tracked GitHub Repository ────────────────────────────────────────────────

export interface TrackedRepo {
  id: string;
  full_name: string;           // "owner/repo"
  webhook_id?: number;         // GitHub webhook ID if auto-registered
  webhook_secret?: string;     // stripped from list API; present only in creation response and /api/repos/:id/secret
  auto_registered: boolean;    // true when Herald registered the webhook via API
  added_at: string;
  last_event_at?: string;
  pr_count: number;
}

export interface PipelineStageStatus {
  name: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export interface Run {
  run_id: string;
  status: RunStatus;
  trigger_event?: "opened" | "synchronize" | "merged" | "demo" | "manual";
  ai_tier_used?: string; // "foundry-agent" | "phi4" | "azure-openai" | "gemini" | "simulation"
  pipeline_stages?: PipelineStageStatus[];
  pr_title: string;
  pr_number: number;
  repository: string;
  merged_by: string;
  merged_at: string;
  branch: string;
  diff_url?: string;
  impact_report?: ImpactReport;
  artifacts?: RunArtifacts;
  actions_result?: ActionsResult;
  team_readiness?: TeamReadinessReport;
  release_verdict?: ReleaseVerdict;
  error?: string | null;
  created_at: string;
  updated_at: string;
  // Pipeline metadata — set at creation time, not part of the AI output
  linked_pr_id?: string;
  delivery_id?: string;
  fixture_name?: string | null;
  fixture_paths?: string[];
  fixture_commits?: string[];
}
