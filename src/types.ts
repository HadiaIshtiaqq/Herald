export type PRType = 'FEATURE' | 'BUGFIX' | 'CHORE' | 'REFACTOR';
export type PRStatus = 'Released' | 'In Progress' | 'Pending Review';

export interface ReasoningStep {
  title: string;
  description: string;
  status: 'success' | 'warning' | 'info' | 'error';
  icon: string; // mapped to lucide icons
}

export interface PullRequest {
  id: string; // e.g. "PR-4209"
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
  reviewer?: string; // assigned reviewer name (e.g. "Sarah Jenkins")
  changedFiles?: string[]; // files changed (for overlap analysis)
  priority?: 'Low' | 'Medium' | 'High' | 'Critical'; // priority status
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
