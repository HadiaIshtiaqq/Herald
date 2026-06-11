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
  CheckCircle2
} from "lucide-react";
import { apiFetch } from "../lib/api.js";

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

interface GitHubPanelProps {
  onNavigateToRuns?: () => void;
}

export default function GitHubPanel({ onNavigateToRuns }: GitHubPanelProps) {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, reposRes] = await Promise.all([
        apiFetch("/api/github/profile"),
        apiFetch("/api/github/user-repos")
      ]);
      const profileData = await profileRes.json() as { ok: boolean; user?: GitHubUser; reason?: string };
      const reposData = await reposRes.json() as { ok: boolean; repos?: GitHubRepo[]; reason?: string };

      if (!profileData.ok) {
        setError(profileData.reason ?? "GITHUB_TOKEN not configured. Add it to .env to connect your GitHub profile.");
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
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const filteredRepos = repos
    .filter(r => {
      if (repoFilter === "active") return !r.fork && r.open_issues_count > 0;
      if (repoFilter === "owned") return !r.fork;
      return true;
    })
    .slice(0, 60);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0078D4] animate-spin" />
          <p className="text-sm text-[#605E5C] dark:text-slate-400 font-medium">Loading GitHub profile…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-amber-500" />
        </div>
        <div>
          <h3 className="font-bold text-[#201F1E] dark:text-slate-100 mb-1">GitHub Not Connected</h3>
          <p className="text-sm text-[#605E5C] dark:text-slate-400 max-w-sm leading-relaxed">{error}</p>
        </div>
        <div className="bg-gray-50 dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 text-left max-w-sm w-full">
          <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-2">Add to .env</p>
          <code className="text-xs font-mono text-[#0078D4] dark:text-blue-400">GITHUB_TOKEN=ghp_your_token_here</code>
          <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            Create a token at <strong>github.com/settings/tokens</strong> with <code>repo</code> scope for private repos, or use a classic token with <code>public_repo</code> for public-only access.
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-[#0078D4] text-white text-xs font-bold rounded-lg transition-colors hover:bg-[#005faa] cursor-pointer shadow-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 overflow-y-auto">

      {/* ── GitHub Profile Banner ───────────────────────────────────────────── */}
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
              <button onClick={load} title="Refresh"
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

      {/* ── How it works strip ──────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: <Github className="w-4 h-4 text-[#0078D4]" />, title: "Connect Account", body: "Your GitHub profile and all accessible repositories are loaded automatically from your GITHUB_TOKEN." },
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

      {/* ── Repository Grid ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-extrabold text-[#18223B] dark:text-slate-100">
              Repositories
              {repos.length > 0 && (
                <span className="ml-2 text-xs font-normal text-[#7C8499] dark:text-slate-500">
                  ({filteredRepos.length} shown)
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

        {filteredRepos.length === 0 ? (
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
            {filteredRepos.map(repo => {
              const isExpanded = expandedRepo === repo.full_name;
              const prs = repoPRs[repo.full_name];
              const isLoadingPRs = loadingPRs.has(repo.full_name);
              const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "#8b949e") : "#8b949e";

              return (
                <div key={repo.id}
                  className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">

                  {/* Repo header row */}
                  <button
                    onClick={() => fetchPRs(repo.full_name)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#201F1E] dark:text-slate-100 truncate">
                          {repo.full_name}
                        </span>
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
                      ) : (
                        <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700">
                          <CheckCircle2 className="w-3 h-3" /> Clean
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 hidden md:block">
                        {timeSince(repo.updated_at)}
                      </span>
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

      {/* ── Footer tip ─────────────────────────────────────────────────────── */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4 flex gap-3">
        <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
            Want real-time automatic analysis?
          </p>
          <p className="text-xs text-blue-600/70 dark:text-blue-500 mt-0.5 leading-relaxed">
            Go to <strong>Settings → Connected Repositories</strong> and connect a repo via webhook.
            Herald will then automatically analyze every PR opened, pushed to, or merged — no manual click needed.
          </p>
        </div>
      </div>

    </div>
  );
}
