import { useState, useEffect, useCallback } from "react";
import { useToast } from "../context/ToastContext.js";
import {
  Github,
  RefreshCw,
  GitPullRequest,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles,
  Lock,
  Globe,
  User,
  Building2,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Pin,
  Users,
} from "lucide-react";
import { apiFetch } from "../lib/api.js";
import type { Run } from "../types.js";

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  private_repos: number;
  followers: number;
  html_url: string;
  company: string | null;
  location: string | null;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  private: boolean;
  updated_at: string;
  open_issues_count: number;
  html_url: string;
  default_branch: string;
  fork: boolean;
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  draft: boolean;
  labels: string[];
}

// Aggregated open PR (from /api/github/open-prs — across all of a user's repos)
interface OpenPR {
  number: number;
  title: string;
  repo: string;
  html_url: string;
  user: { login: string; avatar_url: string };
  updated_at: string;
  draft: boolean;
  labels: string[];
}

// Inline examination result — Herald's real pipeline run, summarised in place.
interface ExamResult {
  status: "running" | "done" | "error";
  aiTier?: string;
  // The adjudicator's verdict — the deterministic decision that OWNS the result.
  verdict?: { decision: "CLEAR" | "BLOCKED" | "ABSTAIN"; headline: string; rationale: string; falseConflicts: number; unownedPaths: number };
  risk?: { level: string; rationale: string };
  areas?: string[];
  summary?: string;
  readiness?: { score: number; ready: number; total: number; blocking: boolean; gaps: { name: string; missing: string[] }[] };
  error?: string;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", "C#": "#178600",
  "C++": "#f34b7d", Ruby: "#701516", Swift: "#F05138",
  Kotlin: "#A97BFF", Dart: "#00B4AB", HTML: "#e34c26", CSS: "#563d7c"
};

function timeSince(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── localStorage helpers (persist the profiles & repos added via the UI) ──────
const readLS = (k: string): string[] => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : []; } catch { return []; }
};
const writeLS = (k: string, v: string[]) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota — ignore */ }
};
// Stable negative id for synthetic (pinned) repos so they never collide with real ids.
const stableId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return -Math.abs(h) - 1;
};

interface GitHubPanelProps {
  onNavigateToRuns?: () => void;
  signedInUser?: string;
}

export default function GitHubPanel({ onNavigateToRuns, signedInUser }: GitHubPanelProps) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [repoPRs, setRepoPRs] = useState<Record<string, GitHubPR[]>>({});
  const [loadingPRs, setLoadingPRs] = useState<Set<string>>(new Set());
  const [analyzingPR, setAnalyzingPR] = useState<Set<string>>(new Set());
  const [repoFilter, setRepoFilter] = useState<"active" | "owned" | "all">("active");

  // ── Multi-profile + pinned-repo state (all driven from the UI) ──────────────
  const homeUser = signedInUser ?? null;                              // the signed-in account
  const [viewedUser, setViewedUser] = useState<string | null>(signedInUser ?? null);
  const [profiles, setProfiles] = useState<string[]>(() => readLS("heraldGithubProfiles"));
  const [pinnedRepos, setPinnedRepos] = useState<string[]>(() => readLS("heraldPinnedRepos"));
  const [entry, setEntry] = useState("");

  // Auto-aggregated open PRs for the active profile (no webhook, no manual entry)
  const [openPRs, setOpenPRs] = useState<OpenPR[]>([]);
  const [openPRsLoading, setOpenPRsLoading] = useState(false);
  const [openPRsError, setOpenPRsError] = useState<string | null>(null);
  const [exams, setExams] = useState<Record<string, ExamResult>>({});

  const load = useCallback(async (user: string | null) => {
    setLoading(true);
    setError(null);
    setExpandedRepo(null);
    setRepoPRs({});
    setRepos([]);
    try {
      const q = user ? `?user=${encodeURIComponent(user)}` : "";
      const [profileRes, reposRes] = await Promise.all([
        apiFetch(`/api/github/profile${q}`),
        apiFetch(`/api/github/user-repos${q}`)
      ]);
      const profileData = await profileRes.json() as { ok: boolean; user?: GitHubUser; reason?: string };
      const reposData = await reposRes.json() as { ok: boolean; repos?: GitHubRepo[]; reason?: string };

      if (!profileData.ok) {
        if (user) {
          // a profile the user added failed — don't blank the whole panel, just revert
          showToast(profileData.reason ?? `Could not load @${user}`, "error");
          setViewedUser(null);
        } else {
          setError(profileData.reason ?? "GITHUB_TOKEN not configured. Add it to .env, or add any public GitHub profile below.");
        }
        setLoading(false);
        return;
      }
      if (profileData.user) setProfile(profileData.user);
      if (reposData.repos) setRepos(reposData.repos);
    } catch {
      setError("Could not reach server — make sure Herald is running.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(viewedUser); }, [viewedUser, load]);

  // The "active" profile = whichever profile is being viewed (defaults to signed-in user).
  const activeUser = viewedUser ?? signedInUser ?? null;

  const scanOpenPRs = useCallback(async (user: string) => {
    setOpenPRsLoading(true);
    setOpenPRsError(null);
    try {
      const res = await apiFetch(`/api/github/open-prs?user=${encodeURIComponent(user)}`);
      const data = await res.json() as { ok: boolean; prs?: OpenPR[]; reason?: string };
      if (data.ok) setOpenPRs(data.prs ?? []);
      else { setOpenPRs([]); setOpenPRsError(data.reason ?? "Could not load pull requests"); }
    } catch {
      setOpenPRs([]);
      setOpenPRsError("Could not reach the server.");
    } finally {
      setOpenPRsLoading(false);
    }
  }, []);

  useEffect(() => { if (activeUser) scanOpenPRs(activeUser); }, [activeUser, scanOpenPRs]);

  const fetchPRs = useCallback(async (repoFullName: string) => {
    if (repoPRs[repoFullName] !== undefined) {
      setExpandedRepo(prev => prev === repoFullName ? null : repoFullName);
      return;
    }
    setLoadingPRs(prev => new Set(prev).add(repoFullName));
    setExpandedRepo(repoFullName);
    try {
      const res = await apiFetch(`/api/github/repo-prs?repo=${encodeURIComponent(repoFullName)}`);
      const data = await res.json() as { ok: boolean; prs?: GitHubPR[] };
      setRepoPRs(prev => ({ ...prev, [repoFullName]: data.prs ?? [] }));
    } catch {
      setRepoPRs(prev => ({ ...prev, [repoFullName]: [] }));
    } finally {
      setLoadingPRs(prev => { const n = new Set(prev); n.delete(repoFullName); return n; });
    }
  }, [repoPRs]);

  const handleAnalyzePR = useCallback(async (pr: GitHubPR, repoFullName: string) => {
    const key = `${repoFullName}#${pr.number}`;
    setAnalyzingPR(prev => new Set(prev).add(key));
    try {
      const res = await apiFetch("/runs/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: pr.html_url })
      });
      if (res.ok) {
        showToast(`Analysis started for PR #${pr.number} — opening Webhook Runs`, "success");
        onNavigateToRuns?.();
      } else {
        const err = await res.json() as { error?: string };
        showToast(err.error ?? "Analysis failed — check server logs", "error");
      }
    } catch {
      showToast("Server error — make sure Herald is running", "error");
    } finally {
      setAnalyzingPR(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [onNavigateToRuns, showToast]);

  // Examine an open PR IN PLACE: run Herald's real pipeline on the actual PR
  // diff, poll the run, and summarise risk / impacted areas / team readiness.
  const examinePR = useCallback(async (htmlUrl: string) => {
    setExams(prev => ({ ...prev, [htmlUrl]: { status: "running" } }));
    try {
      const res = await apiFetch("/runs/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: htmlUrl })
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setExams(prev => ({ ...prev, [htmlUrl]: { status: "error", error: err.error ?? "Examination failed" } }));
        return;
      }
      const { run_id } = await res.json() as { run_id: string };
      for (let i = 0; i < 48; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const rr = await apiFetch(`/runs/${run_id}`);
        if (!rr.ok) continue;
        const run = await rr.json() as Run;
        if (run.status === "ready_for_review" || run.status === "done") {
          const ir = run.impact_report;
          const tr = run.team_readiness;
          const v = run.release_verdict;
          setExams(prev => ({
            ...prev,
            [htmlUrl]: {
              status: "done",
              aiTier: run.ai_tier_used,
              verdict: v ? { decision: v.decision, headline: v.headline, rationale: v.rationale, falseConflicts: v.false_conflicts_rejected.length, unownedPaths: v.unowned_paths.length } : undefined,
              risk: ir ? { level: ir.risk.level, rationale: ir.risk.rationale } : undefined,
              areas: ir?.impacted_areas ?? [],
              summary: ir?.summary,
              readiness: tr ? {
                score: tr.overall_score, ready: tr.ready_count, total: tr.total_count,
                blocking: tr.blocking_deployment,
                gaps: (tr.gaps ?? []).slice(0, 4).map(g => ({ name: g.name, missing: g.missing_certs }))
              } : undefined
            }
          }));
          return;
        }
        if (run.status === "error") {
          setExams(prev => ({ ...prev, [htmlUrl]: { status: "error", error: run.error ?? "Pipeline error" } }));
          return;
        }
      }
      setExams(prev => ({ ...prev, [htmlUrl]: { status: "error", error: "Timed out — open Webhook Runs for details" } }));
    } catch {
      setExams(prev => ({ ...prev, [htmlUrl]: { status: "error", error: "Server error — is Herald running?" } }));
    }
  }, []);

  // ── Add a profile (username / profile URL) or pin a repo (owner/repo / URL) ──
  const addEntry = () => {
    const raw = entry.trim();
    if (!raw) return;
    const s = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/+$/, "");
    const parts = s.split("/").filter(Boolean);

    if (parts.length >= 2) {
      // owner/repo → pin the repository so its PRs can be browsed & analyzed
      const repo = `${parts[0]}/${parts[1]}`;
      if (!/^[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_.-]+$/.test(repo)) {
        showToast("That doesn't look like a valid owner/repo", "error");
        return;
      }
      setPinnedRepos(prev => {
        const next = [repo, ...prev.filter(r => r !== repo)].slice(0, 20);
        writeLS("heraldPinnedRepos", next);
        return next;
      });
      showToast(`Pinned ${repo} — expand it below to browse & analyze its PRs`, "success");
      setEntry("");
      return;
    }

    // single token → a GitHub username/profile
    const user = parts[0];
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(user)) {
      showToast("Enter a GitHub username, profile URL, or owner/repo", "error");
      return;
    }
    setProfiles(prev => {
      const next = [user, ...prev.filter(u => u.toLowerCase() !== user.toLowerCase())].slice(0, 12);
      writeLS("heraldGithubProfiles", next);
      return next;
    });
    setViewedUser(user);
    setEntry("");
  };

  const removeProfile = (u: string) => {
    setProfiles(prev => {
      const next = prev.filter(p => p !== u);
      writeLS("heraldGithubProfiles", next);
      return next;
    });
    if (viewedUser === u) setViewedUser(null);
  };

  const removePin = (fn: string) => {
    setPinnedRepos(prev => {
      const next = prev.filter(r => r !== fn);
      writeLS("heraldPinnedRepos", next);
      return next;
    });
    setRepoPRs(prev => { const n = { ...prev }; delete n[fn]; return n; });
    setExpandedRepo(prev => prev === fn ? null : prev);
  };

  const pinnedSet = new Set(pinnedRepos);

  const filteredRepos = repos
    .filter(r => {
      if (pinnedSet.has(r.full_name)) return false; // pinned shown separately, always
      if (repoFilter === "active") return !r.fork && r.open_issues_count > 0;
      if (repoFilter === "owned") return !r.fork;
      return true;
    })
    .slice(0, 60);

  // Pinned repos as synthetic entries so they always render (any owner, even orgs).
  const syntheticPinned: GitHubRepo[] = pinnedRepos.map(fn => ({
    id: stableId(fn),
    full_name: fn,
    description: "Pinned via the UI — expand to browse & analyze its pull requests",
    language: null, private: false,
    updated_at: new Date().toISOString(),
    open_issues_count: 0,
    html_url: `https://github.com/${fn}`,
    default_branch: "main", fork: false,
  }));

  const displayRepos = [...syntheticPinned, ...filteredRepos];

  // ── Profile switcher bar (always rendered, even with no token) ───────────────
  const switcher = (
    <div className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-[#0078D4]" />
        <p className="text-xs font-extrabold text-[#18223B] dark:text-slate-100 uppercase tracking-wide">GitHub Profiles</p>
        <span className="text-[10px] text-[#7C8499] dark:text-slate-500">add any username, profile URL, or owner/repo</span>
      </div>

      {/* chips */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          onClick={() => setViewedUser(homeUser)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            viewedUser === homeUser
              ? "bg-[#0078D4] text-white shadow-sm"
              : "bg-gray-100 dark:bg-slate-800 text-[#605E5C] dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
          }`}
        >
          <Github className="w-3 h-3" /> {signedInUser ? `@${signedInUser} · you` : "My Account"}
        </button>
        {profiles.filter(u => !signedInUser || u.toLowerCase() !== signedInUser.toLowerCase()).map(u => (
          <span
            key={u}
            className={`group inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              viewedUser === u
                ? "bg-[#0078D4] text-white shadow-sm"
                : "bg-gray-100 dark:bg-slate-800 text-[#605E5C] dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
            }`}
          >
            <button onClick={() => setViewedUser(u)} className="cursor-pointer flex items-center gap-1">
              <User className="w-3 h-3" /> @{u}
            </button>
            <button
              onClick={() => removeProfile(u)}
              title={`Remove @${u}`}
              className={`p-0.5 rounded cursor-pointer ${viewedUser === u ? "hover:bg-white/20" : "hover:bg-gray-300 dark:hover:bg-slate-600"}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* add input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={entry}
            onChange={e => setEntry(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addEntry()}
            placeholder="e.g. octocat   ·   github.com/vercel   ·   facebook/react"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-[#201F1E] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] placeholder:text-gray-400 font-mono"
          />
        </div>
        <button
          onClick={addEntry}
          disabled={!entry.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto">

      {switcher}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#0078D4] animate-spin" />
            <p className="text-sm text-[#605E5C] dark:text-slate-400 font-medium">
              {viewedUser ? `Loading @${viewedUser}…` : "Loading GitHub profile…"}
            </p>
          </div>
        </div>
      ) : error && !profile ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <h3 className="font-bold text-[#201F1E] dark:text-slate-100 mb-1">No account connected</h3>
            <p className="text-sm text-[#605E5C] dark:text-slate-400 max-w-sm leading-relaxed">{error}</p>
          </div>
          <div className="bg-gray-50 dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 text-left max-w-sm w-full">
            <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-2">Two ways in</p>
            <p className="text-[11px] text-[#605E5C] dark:text-slate-400 leading-relaxed mb-2">
              <strong>1.</strong> Add any public profile above (no token needed) — e.g. <code className="font-mono text-[#0078D4]">octocat</code>.
            </p>
            <p className="text-[11px] text-[#605E5C] dark:text-slate-400 leading-relaxed">
              <strong>2.</strong> For your own private repos, set <code className="font-mono text-[#0078D4]">GITHUB_TOKEN</code> in <code>.env</code>.
            </p>
          </div>
          <button onClick={() => load(viewedUser)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0078D4] text-white text-xs font-bold rounded-lg transition-colors hover:bg-[#005faa] cursor-pointer shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : (
        <>
          {/* ── GitHub Profile Banner ───────────────────────────────────────── */}
          {profile && (
            <div className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <img
                  src={profile.avatar_url}
                  alt={profile.login}
                  className="w-16 h-16 rounded-2xl border-2 border-[#EDEBE9] dark:border-slate-700 shadow-sm shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-extrabold text-[#18223B] dark:text-slate-100 font-display">
                      {profile.name ?? profile.login}
                    </h2>
                    <span className="text-xs font-mono text-[#7C8499] dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      @{profile.login}
                    </span>
                    {viewedUser === homeUser
                      ? <span className="text-[9px] font-extrabold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 px-2 py-0.5 rounded-full">Your account</span>
                      : <span className="text-[9px] font-extrabold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full">Added profile</span>}
                  </div>
                  {profile.bio && (
                    <p className="text-sm text-[#605E5C] dark:text-slate-400 mt-1 leading-relaxed">{profile.bio}</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2.5">
                    {profile.company && (
                      <span className="flex items-center gap-1 text-xs text-[#605E5C] dark:text-slate-400">
                        <Building2 className="w-3 h-3" /> {profile.company}
                      </span>
                    )}
                    {profile.location && (
                      <span className="flex items-center gap-1 text-xs text-[#605E5C] dark:text-slate-400">
                        <MapPin className="w-3 h-3" /> {profile.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-[#605E5C] dark:text-slate-400">
                      <Globe className="w-3 h-3" />
                      {(profile.public_repos ?? 0) + (profile.private_repos ?? 0)} repositories
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#605E5C] dark:text-slate-400">
                      <User className="w-3 h-3" /> {profile.followers} followers
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => load(viewedUser)} title="Refresh"
                    className="p-2 rounded-lg border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                    <RefreshCw className="w-4 h-4 text-[#605E5C] dark:text-slate-400" />
                  </button>
                  <a href={profile.html_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-gray-700 dark:hover:bg-slate-700 transition-colors">
                    <Github className="w-3.5 h-3.5" /> View Profile
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── Pull requests to review (auto-aggregated, no webhook/token) ──── */}
          {activeUser && (
            <div className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[#EDEBE9] dark:border-slate-800 bg-gradient-to-r from-[#0078D4]/5 to-transparent">
                <div>
                  <h3 className="text-base font-extrabold text-[#18223B] dark:text-slate-100 flex items-center gap-2">
                    <GitPullRequest className="w-4 h-4 text-[#0078D4]" />
                    Pull requests to review
                    <span className="text-xs font-normal text-[#7C8499] dark:text-slate-500">
                      ({openPRs.length} open in @{activeUser}'s repos)
                    </span>
                  </h3>
                  <p className="text-xs text-[#7C8499] dark:text-slate-400 mt-0.5">
                    Gathered automatically — no webhook, no token, nothing to wire up. Click Analyze to run the full Herald pipeline.
                  </p>
                </div>
                <button onClick={() => scanOpenPRs(activeUser)} disabled={openPRsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700 rounded-lg text-xs font-bold text-[#605E5C] dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-sm disabled:opacity-60">
                  <RefreshCw className={`w-3.5 h-3.5 ${openPRsLoading ? "animate-spin" : ""}`} /> Rescan
                </button>
              </div>

              {openPRsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 text-[#0078D4] animate-spin" />
                </div>
              ) : openPRsError ? (
                <div className="px-5 py-8 text-center">
                  <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-xs text-[#605E5C] dark:text-slate-400">{openPRsError}</p>
                </div>
              ) : openPRs.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[#605E5C] dark:text-slate-300">No open pull requests right now</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                    When @{activeUser} opens a PR in any of their repos, it appears here automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#EDEBE9]/70 dark:divide-slate-800/70">
                  {openPRs.map(pr => {
                    const exam = exams[pr.html_url];
                    const busy = exam?.status === "running";
                    return (
                      <div key={pr.html_url}>
                        <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                          <img src={pr.user.avatar_url} alt={pr.user.login} className="w-7 h-7 rounded-full border border-gray-200 dark:border-slate-700 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#201F1E] dark:text-slate-100 truncate">
                              {pr.draft && <span className="mr-1 text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-400 border border-gray-200 dark:border-slate-700">Draft</span>}
                              {pr.title}
                            </p>
                            <p className="text-[10px] text-[#605E5C] dark:text-slate-400 mt-0.5">
                              <span className="font-mono text-[#0078D4] dark:text-blue-400">{pr.repo}</span>
                              <span className="font-mono"> #{pr.number}</span> · @{pr.user.login} · {timeSince(pr.updated_at)}
                            </p>
                            {pr.labels.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {pr.labels.slice(0, 4).map(l => (
                                  <span key={l} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40">{l}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a href={pr.html_url} target="_blank" rel="noreferrer"
                              className="p-1.5 rounded-lg border border-[#EDEBE9] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors" title="Open on GitHub">
                              <ExternalLink className="w-3 h-3 text-gray-400" />
                            </a>
                            <button onClick={() => examinePR(pr.html_url)} disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-60 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95">
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              {busy ? "Examining…" : exam?.status === "done" ? "Re-examine" : "Examine"}
                            </button>
                          </div>
                        </div>

                        {/* inline examination result — Herald's real pipeline on this PR */}
                        {busy && (
                          <div className="px-5 pb-3 -mt-1">
                            <div className="flex items-center gap-2 text-[10px] text-[#0078D4] font-semibold bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-lg px-3 py-2">
                              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                              Running Herald's 4-tier AI analysis on the real PR diff — reasoning → certification readiness…
                            </div>
                          </div>
                        )}
                        {exam?.status === "error" && (
                          <div className="px-5 pb-3 -mt-1">
                            <p className="text-[10px] text-[#D5544A] font-semibold flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3 shrink-0" /> {exam.error}
                            </p>
                          </div>
                        )}
                        {exam?.status === "done" && (
                          <div className="px-5 pb-4 -mt-1">
                            <div className="rounded-xl border border-[#EDEBE9] dark:border-slate-800 bg-gray-50/70 dark:bg-slate-950/40 p-3 space-y-2.5">
                              {/* Release Verdict — the deterministic adjudicator owns the decision */}
                              {exam.verdict && (() => {
                                const d = exam.verdict.decision;
                                const tone = d === "CLEAR"
                                  ? { fg: "#2E9E6B", bg: "#2E9E6B12", label: "Clear to ship" }
                                  : d === "BLOCKED"
                                  ? { fg: "#D5544A", bg: "#D5544A12", label: "Blocked" }
                                  : { fg: "#C98A1E", bg: "#E0A93B18", label: "Herald abstains" };
                                return (
                                  <div className="rounded-lg p-2.5 border" style={{ backgroundColor: tone.bg, borderColor: tone.fg + "40" }}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-[#7C8499]">Release Verdict</span>
                                      <span className="text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded border" style={{ color: tone.fg, borderColor: tone.fg + "55", backgroundColor: "transparent" }}>{d}</span>
                                      {exam.verdict.falseConflicts > 0 && (
                                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#2E9E6B]/10 text-[#2E9E6B]">{exam.verdict.falseConflicts} false conflict{exam.verdict.falseConflicts !== 1 ? "s" : ""} rejected</span>
                                      )}
                                      {d === "ABSTAIN" && exam.verdict.unownedPaths > 0 && (
                                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#E0A93B]/15 text-[#C98A1E]">{exam.verdict.unownedPaths} unowned path{exam.verdict.unownedPaths !== 1 ? "s" : ""}</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] font-extrabold mt-1" style={{ color: tone.fg }}>{exam.verdict.headline}</p>
                                    <p className="text-[10px] text-[#605E5C] dark:text-slate-400 leading-snug mt-0.5">{exam.verdict.rationale}</p>
                                  </div>
                                );
                              })()}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0078D4]/10 text-[#0078D4]">AI tier: {exam.aiTier ?? "simulation"}</span>
                                {exam.risk && (
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{
                                    backgroundColor: exam.risk.level === "High" ? "#D5544A15" : exam.risk.level === "Medium" ? "#E0A93B15" : "#2E9E6B15",
                                    color: exam.risk.level === "High" ? "#D5544A" : exam.risk.level === "Medium" ? "#E0A93B" : "#2E9E6B"
                                  }}>{exam.risk.level} risk</span>
                                )}
                                {exam.readiness && (
                                  <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${exam.readiness.blocking ? "bg-[#D5544A]/10 text-[#D5544A]" : "bg-[#2E9E6B]/10 text-[#2E9E6B]"}`}>
                                    {exam.readiness.blocking ? "Deployment blocked" : "Clear to ship"}
                                  </span>
                                )}
                              </div>
                              {exam.summary && <p className="text-[11px] text-[#323130] dark:text-slate-300 leading-snug">{exam.summary}</p>}
                              {exam.areas && exam.areas.length > 0 && (
                                <div className="flex flex-wrap gap-1 items-center">
                                  <span className="text-[9px] font-bold text-[#7C8499] uppercase tracking-wider">Impacted areas:</span>
                                  {exam.areas.map(a => <span key={a} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-700 text-[#605E5C] dark:text-slate-300">{a}</span>)}
                                </div>
                              )}
                              {exam.readiness && (
                                <div className="space-y-1.5 pt-0.5 border-t border-[#EDEBE9]/70 dark:border-slate-800/70">
                                  <div className="flex items-center gap-2 pt-1.5">
                                    <span className="text-[10px] font-bold text-[#323130] dark:text-slate-300">Owning-team certification readiness</span>
                                    <span className="text-[10px] font-extrabold" style={{ color: exam.readiness.score >= 80 ? "#2E9E6B" : exam.readiness.score >= 50 ? "#E0A93B" : "#D5544A" }}>{exam.readiness.score}%</span>
                                    <span className="text-[9px] text-[#7C8499]">({exam.readiness.ready}/{exam.readiness.total} certified)</span>
                                  </div>
                                  <p className="text-[8px] text-[#7C8499] dark:text-slate-500 italic leading-snug">
                                    Readiness maps the change's impacted areas → required certs → Herald's configured team roster (synthetic demo data — GitHub exposes no certification data).
                                  </p>
                                  {exam.readiness.gaps.length > 0 && (
                                    <div className="space-y-0.5">
                                      {exam.readiness.gaps.map(g => (
                                        <p key={g.name} className="text-[9px] text-[#605E5C] dark:text-slate-400">
                                          <span className="font-semibold text-[#323130] dark:text-slate-300">{g.name}</span> needs {g.missing.join(", ")}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <button onClick={() => onNavigateToRuns?.()}
                                className="text-[10px] font-bold text-[#0078D4] hover:underline cursor-pointer">
                                Open full run — artifacts, blast radius &amp; signed attestation →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── How it works strip ──────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: <Users className="w-4 h-4 text-[#0078D4]" />, title: "Any Profile", body: "Add any GitHub username or owner/repo above — no .env edit needed. Set GITHUB_TOKEN for your own private repos." },
              { icon: <GitPullRequest className="w-4 h-4 text-purple-500" />, title: "Discover PRs", body: "Expand any repository to see its open pull requests with author, branch, and age at a glance." },
              { icon: <Sparkles className="w-4 h-4 text-emerald-500" />, title: "Analyze with Herald", body: "Click Analyze on any PR to run the full Herald AI pipeline — impact report, changelog, and M365 actions." }
            ].map(({ icon, title, body }) => (
              <div key={title} className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center shrink-0">{icon}</div>
                <div>
                  <p className="text-xs font-extrabold text-[#201F1E] dark:text-slate-200 uppercase tracking-wide">{title}</p>
                  <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-1 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Repository Grid ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-extrabold text-[#18223B] dark:text-slate-100">
                  Repositories
                  {displayRepos.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-[#7C8499] dark:text-slate-500">
                      ({displayRepos.length} shown{pinnedRepos.length > 0 ? `, ${pinnedRepos.length} pinned` : ""})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[#7C8499] dark:text-slate-400 mt-0.5">
                  Click a repo to expand its open pull requests, then click Analyze to run Herald.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(["active", "owned", "all"] as const).map(f => (
                  <button key={f} onClick={() => setRepoFilter(f)}
                    className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wide transition-all cursor-pointer ${
                      repoFilter === f
                        ? "bg-[#0078D4] text-white shadow-sm"
                        : "bg-white dark:bg-slate-900 text-[#605E5C] dark:text-slate-400 border border-[#EDEBE9] dark:border-slate-800 hover:border-[#0078D4]/40 dark:hover:border-blue-700/50"
                    }`}>
                    {f === "active" ? "Has PRs" : f === "owned" ? "Mine" : "All"}
                  </button>
                ))}
              </div>
            </div>

            {displayRepos.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-[#EDEBE9] dark:border-slate-800">
                <GitPullRequest className="w-8 h-8 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#605E5C] dark:text-slate-400">No repositories match this filter.</p>
                <button onClick={() => setRepoFilter("all")}
                  className="mt-3 text-xs font-bold text-[#0078D4] dark:text-blue-400 hover:underline cursor-pointer">
                  Show all repositories
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayRepos.map(repo => {
                  const isExpanded = expandedRepo === repo.full_name;
                  const prs = repoPRs[repo.full_name];
                  const isLoadingPRs = loadingPRs.has(repo.full_name);
                  const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "#8b949e") : "#8b949e";
                  const isPinned = pinnedSet.has(repo.full_name);

                  return (
                    <div key={repo.id}
                      className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                        isPinned ? "border-purple-300 dark:border-purple-800/60" : "border-[#EDEBE9] dark:border-slate-800"
                      }`}>

                      {/* Repo header row */}
                      <button
                        onClick={() => fetchPRs(repo.full_name)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-left">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[#201F1E] dark:text-slate-100 truncate">
                              {repo.full_name}
                            </span>
                            {isPinned && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                                <Pin className="w-2.5 h-2.5" /> Pinned
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); removePin(repo.full_name); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removePin(repo.full_name); } }}
                                  className="ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-purple-200 dark:hover:bg-purple-900/60 cursor-pointer"
                                  title="Unpin"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </span>
                              </span>
                            )}
                            {repo.private && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                                <Lock className="w-2.5 h-2.5" /> Private
                              </span>
                            )}
                            {repo.fork && (
                              <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                                Fork
                              </span>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5 truncate">{repo.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {repo.language && (
                            <span className="hidden sm:flex items-center gap-1.5 text-xs text-[#605E5C] dark:text-slate-400">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor }} />
                              {repo.language}
                            </span>
                          )}
                          {repo.open_issues_count > 0 ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
                              <GitPullRequest className="w-3 h-3" />
                              {repo.open_issues_count} open
                            </span>
                          ) : !isPinned ? (
                            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700">
                              <CheckCircle2 className="w-3 h-3" /> Clean
                            </span>
                          ) : null}
                          {!isPinned && (
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 hidden md:block">
                              {timeSince(repo.updated_at)}
                            </span>
                          )}
                          {isLoadingPRs ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#0078D4]" />
                          ) : isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {/* Expanded PR list */}
                      {isExpanded && prs !== undefined && (
                        <div className="border-t border-[#EDEBE9] dark:border-slate-800">
                          {prs.length === 0 ? (
                            <div className="px-4 py-6 text-center">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                              <p className="text-xs text-[#605E5C] dark:text-slate-400 font-medium">No open pull requests</p>
                              <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                                This repo is all clear — no PRs awaiting review.
                              </p>
                            </div>
                          ) : (
                            <div>
                              {/* PR list header */}
                              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-950/30 border-b border-[#EDEBE9]/60 dark:border-slate-800/60">
                                <p className="text-[10px] font-extrabold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest">
                                  {prs.length} Open Pull Request{prs.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                              {prs.map((pr, idx) => {
                                const key = `${repo.full_name}#${pr.number}`;
                                const isAnalyzing = analyzingPR.has(key);
                                return (
                                  <div key={pr.number}
                                    className={`flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors ${
                                      idx < prs.length - 1 ? "border-b border-[#EDEBE9]/60 dark:border-slate-800/60" : ""
                                    }`}>

                                    <img
                                      src={pr.user.avatar_url}
                                      alt={pr.user.login}
                                      className="w-7 h-7 rounded-full border border-gray-200 dark:border-slate-700 shrink-0"
                                    />

                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold text-[#201F1E] dark:text-slate-100 truncate">
                                        {pr.draft && (
                                          <span className="mr-1 text-[9px] font-bold px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700">
                                            Draft
                                          </span>
                                        )}
                                        {pr.title}
                                      </p>
                                      <p className="text-[10px] text-[#605E5C] dark:text-slate-400 mt-0.5 font-mono">
                                        #{pr.number} · {pr.head.ref} → {pr.base.ref}
                                        <span className="font-sans"> · @{pr.user.login} · {timeSince(pr.updated_at)}</span>
                                      </p>
                                      {pr.labels.length > 0 && (
                                        <div className="flex gap-1 mt-1.5 flex-wrap">
                                          {pr.labels.slice(0, 4).map(l => (
                                            <span key={l}
                                              className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200/60 dark:border-blue-800/40">
                                              {l}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <a href={pr.html_url} target="_blank" rel="noreferrer"
                                        className="p-1.5 rounded-lg border border-[#EDEBE9] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                                        title="Open on GitHub">
                                        <ExternalLink className="w-3 h-3 text-gray-400" />
                                      </a>
                                      <button
                                        onClick={() => handleAnalyzePR(pr, repo.full_name)}
                                        disabled={isAnalyzing}
                                        title="Run Herald AI analysis on this pull request"
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-60 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95">
                                        {isAnalyzing ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3 h-3" />
                                        )}
                                        {isAnalyzing ? "Analyzing…" : "Analyze"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer tip ─────────────────────────────────────────────────── */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4 flex gap-3">
            <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                Want real-time automatic analysis?
              </p>
              <p className="text-xs text-blue-600/70 dark:text-blue-500 mt-0.5 leading-relaxed">
                Go to <strong>Webhook Runs → Connect Repository</strong> to register a webhook.
                Herald will then automatically analyze every PR opened, pushed to, or merged — no manual click needed.
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
