import { useState, useEffect } from "react";
import { LayoutDashboard, Rocket, FileBarChart, Settings, Sparkles, Scale, GitBranch, RefreshCw, Github, AlertCircle, GitPullRequest, Bot } from "lucide-react";
import { PullRequest } from "../types.js";
import { apiFetch } from "../lib/api.js";

interface ReviewerEntry {
  name: string;
  login: string;
  count: number;
  avatar: string;
  source: "github" | "local";
}

interface ReviewersData {
  reviewers: ReviewerEntry[];
  source: "github" | "local";
  github_user: string | null;
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  conciergeActiveTime: string;
  prs: PullRequest[];
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}

// Deterministic color from reviewer name — matches the SVG avatar palette
const AVATAR_COLORS = [
  "bg-[#0078D4]","bg-[#107C10]","bg-[#D83B01]","bg-[#8764B8]",
  "bg-[#038387]","bg-[#CA5010]","bg-[#C239B3]","bg-[#10893E]"
];
function avatarColor(name: string): string {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  conciergeActiveTime,
  prs = [],
  searchQuery = "",
  setSearchQuery
}: SidebarProps) {
  const navItems = [
    { id: "dashboard",  label: "Dashboard",      icon: LayoutDashboard },
    { id: "workspace",  label: "Releases",        icon: Rocket },
    { id: "github",     label: "GitHub",          icon: GitPullRequest },
    { id: "runs",       label: "Webhook Runs",    icon: GitBranch },
    { id: "marketing",  label: "Overview",  icon: FileBarChart },
    { id: "copilot",    label: "Copilot Chat",    icon: Bot },
    { id: "settings",   label: "Settings",        icon: Settings },
  ];

  const [reviewersData, setReviewersData] = useState<ReviewersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReviewers = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch("/api/reviewers");
      if (res.ok) setReviewersData(await res.json() as ReviewersData);
    } catch { /* offline graceful */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load + re-fetch whenever the prs list changes (new PRs added)
  useEffect(() => { fetchReviewers(); }, [prs.length]);

  const maxCount = Math.max(...(reviewersData?.reviewers ?? []).map(r => r.count), 1);

  const handleReviewerClick = (name: string) => {
    if (!setSearchQuery) return;
    setSearchQuery(searchQuery === name ? "" : name);
    if (searchQuery !== name) setActiveTab("dashboard");
  };

  function loadLabel(count: number): { tag: string; bar: string; text: string } {
    if (count === 0) return { tag: "text-gray-400 dark:text-slate-500 font-mono",              bar: "bg-gray-300 dark:bg-slate-700",      text: "Idle" };
    if (count <= 2)  return { tag: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50", bar: "bg-emerald-500",  text: "Low" };
    if (count === 3) return { tag: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50",           bar: "bg-amber-500",    text: "Busy" };
    return            { tag: "text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border border-red-200/50 animate-pulse",             bar: "bg-red-500",      text: "Overloaded" };
  }

  return (
    <aside className="hidden md:flex flex-col h-[calc(100vh-64px)] w-64 py-6 bg-[#f3f3f4] dark:bg-slate-900 border-r border-[#EDEBE9] dark:border-slate-800 sticky top-16 shrink-0 z-10 overflow-y-auto transition-colors">
      <nav className="flex-none px-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer text-left ${
                isActive
                  ? "text-[#005faa] dark:text-blue-400 border-r-4 border-[#005faa] dark:border-blue-400 bg-[#0078d4]/10 dark:bg-blue-950/40"
                  : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-[18px] h-[18px] ${isActive ? "text-[#005faa] dark:text-blue-400" : ""}`} />
                <span>{label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* ── REVIEWER LOAD ─────────────────────────────────────────────────── */}
      <div className="mx-4 mb-4 p-3 bg-white dark:bg-slate-950/45 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 flex flex-col gap-3 transition-all">

        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-900">
          <div className="flex items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-[#005faa] dark:text-blue-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Reviewers Load
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {reviewersData?.source === "github" && (
              <Github className="w-3 h-3 text-slate-400 dark:text-slate-500" aria-label="Live from GitHub" />
            )}
            <button
              onClick={() => fetchReviewers(true)}
              disabled={refreshing}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Refresh reviewer data"
            >
              <RefreshCw className={`w-3 h-3 text-gray-400 dark:text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Source label */}
        {reviewersData && (
          <p className="text-[9px] text-gray-400 dark:text-slate-600 -mt-1 font-medium">
            {reviewersData.source === "github"
              ? `Live · github.com/${reviewersData.github_user ?? "…"}`
              : "From connected PRs · connect a GitHub repo for live data"}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-1.5 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-slate-700 shrink-0" />
                  <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded w-24" />
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && (!reviewersData || reviewersData.reviewers.length === 0) && (
          <div className="text-center py-2">
            <AlertCircle className="w-4 h-4 text-gray-300 dark:text-slate-600 mx-auto mb-1" />
            <p className="text-[9px] text-gray-400 dark:text-slate-600 leading-tight">
              No reviewer data yet.<br />
              Connect a GitHub repo to see live load.
            </p>
            <button
              onClick={() => setActiveTab("runs")}
              className="mt-1.5 text-[9px] font-bold text-[#0078D4] hover:underline cursor-pointer"
            >
              Go to Repositories →
            </button>
          </div>
        )}

        {/* Reviewer rows */}
        {!loading && reviewersData && reviewersData.reviewers.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {reviewersData.reviewers.map(rev => {
              const { tag, bar, text } = loadLabel(rev.count);
              const isFiltered = searchQuery === rev.name;
              const isSvgAvatar = rev.avatar.startsWith("data:image/svg");

              return (
                <button
                  key={rev.login}
                  onClick={() => handleReviewerClick(rev.name)}
                  className={`w-full text-left group flex flex-col gap-1.5 focus:outline-none cursor-pointer transition-all p-1 rounded-md ${
                    isFiltered
                      ? "bg-slate-100 dark:bg-slate-800/60 ring-1 ring-blue-500/35"
                      : "hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                  }`}
                  title={`Filter to PRs assigned to ${rev.name}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 pr-1">
                      {isSvgAvatar ? (
                        <div className={`w-4 h-4 rounded-full ${avatarColor(rev.name)} text-[7px] font-extrabold text-white flex items-center justify-center shrink-0`}>
                          {initials(rev.name)}
                        </div>
                      ) : (
                        <img
                          src={rev.avatar}
                          alt={rev.name}
                          className="w-4 h-4 rounded-full shrink-0 object-cover"
                          onError={e => {
                            // fallback to initials on load error
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <span className="font-bold text-gray-700 dark:text-slate-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {rev.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[8px] leading-3 font-extrabold px-1 rounded uppercase tracking-wider ${tag}`}>
                        {text}
                      </span>
                      <span className="font-mono text-[10px] font-extrabold text-gray-800 dark:text-slate-200">
                        {rev.count}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-350 ${bar}`}
                      style={{ width: rev.count === 0 ? "4%" : `${(rev.count / maxCount) * 100}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {searchQuery && (
          <button
            onClick={() => setSearchQuery?.("")}
            className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 hover:underline text-center w-full mt-1 cursor-pointer"
          >
            Clear reviewer filter
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 mt-auto space-y-3">
        <div className="p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#005faa] dark:text-blue-400" />
            <span className="text-xs font-bold text-[#005faa] dark:text-blue-400 uppercase tracking-wider">HERALD PIPELINE ACTIVE</span>
          </div>
          <p className="text-[11px] text-[#605E5C] dark:text-slate-400">Artifacts generated {conciergeActiveTime || "idle"}</p>
        </div>
        <div className="bg-[#0078d4]/5 dark:bg-blue-950/20 rounded-lg p-3 border border-[#0078d4]/15 dark:border-blue-900/30 transition-colors">
          <p className="text-[10px] font-bold text-[#005faa] dark:text-blue-400 uppercase tracking-widest font-sans">Enterprise Edition</p>
          <p className="text-[11px] text-[#605E5C] dark:text-slate-400 mt-1 font-mono">v2.4.1-stable</p>
        </div>
      </div>
    </aside>
  );
}
