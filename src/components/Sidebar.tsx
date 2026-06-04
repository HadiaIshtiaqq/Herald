import { LayoutDashboard, Rocket, FileBarChart, Settings, Sparkles, Users, Scale } from "lucide-react";
import { PullRequest } from "../types.js";

interface SidebarProps {
  activeTab: string; // 'dashboard' | 'workspace' | 'marketing' | 'impact' | 'settings'
  setActiveTab: (tab: string) => void;
  conciergeActiveTime: string;
  prs: PullRequest[];
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "workspace", label: "Releases", icon: Rocket },
    { id: "marketing", label: "Impact Reports", icon: FileBarChart }, // We map Impact Reports to 'marketing page' or general sheets
    { id: "settings", label: "Settings", icon: Settings },
  ];

  // Core reviewers to track in the workspace load chart
  const coreReviewers = [
    { name: "Sarah Jenkins", handle: "sarah_eng", initial: "SJ", color: "bg-emerald-500" },
    { name: "Alex Rover", handle: "alex_dev", initial: "AR", color: "bg-indigo-500" },
    { name: "Emily Diaz", handle: "emily_qa", initial: "ED", color: "bg-amber-500" },
    { name: "Carter Smith", handle: "carter_sys", initial: "CS", color: "bg-rose-500" },
  ];

  // Calculate assigned PR count (under review / non-released status) for each reviewer
  const reviewerLoads = coreReviewers.map((rev) => {
    const activeReviews = prs.filter(
      (p) => p.reviewer === rev.name && p.status !== "Released"
    );
    return {
      ...rev,
      count: activeReviews.length,
      prIds: activeReviews.map((p) => p.id),
    };
  });

  const maxReviews = Math.max(...reviewerLoads.map((r) => r.count), 1);

  const handleReviewerClick = (name: string) => {
    if (!setSearchQuery) return;
    if (searchQuery === name) {
      setSearchQuery(""); // toggle off
    } else {
      setSearchQuery(name);
      setActiveTab("dashboard"); // redirect to main dashboard table
    }
  };

  return (
    <aside className="hidden md:flex flex-col h-[calc(100vh-64px)] w-64 py-6 bg-[#f3f3f4] dark:bg-slate-900 border-r border-[#EDEBE9] dark:border-slate-800 sticky top-16 shrink-0 z-10 transition-colors">
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = 
            item.id === "dashboard" && activeTab === "dashboard" ||
            item.id === "workspace" && activeTab === "workspace" ||
            item.id === "marketing" && activeTab === "marketing" ||
            item.id === "settings" && activeTab === "settings";

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "marketing") {
                  setActiveTab("marketing");
                } else if (item.id === "dashboard") {
                  setActiveTab("dashboard");
                } else if (item.id === "workspace") {
                  setActiveTab("workspace");
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer text-left ${
                isActive
                  ? "text-[#005faa] dark:text-blue-400 border-r-4 border-[#005faa] dark:border-blue-400 bg-[#0078d4]/10 dark:bg-blue-950/40"
                  : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100 hover:bg-gray-200 dark:hover:bg-slate-800/60"
              }`}
              id={`sidebar-tab-${item.id}`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-[18px] h-[18px] ${isActive ? "text-[#005faa] dark:text-blue-400" : ""}`} />
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* REVIEWER LOAD WORKLOAD BALANCER */}
      <div className="mx-4 mb-4 p-3 bg-white dark:bg-slate-950/45 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 flex flex-col gap-3 transition-all">
        <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-900">
          <div className="flex items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-[#005faa] dark:text-blue-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Reviewers Load
            </span>
          </div>
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500">
            Active
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {reviewerLoads.map((rev) => {
            // Determine severity colors based on workload
            let tagBg = "text-gray-400 dark:text-slate-500 font-mono";
            let tagLabel = "Idle";
            let fillClass = "bg-emerald-500";
            
            if (rev.count === 1 || rev.count === 2) {
              tagBg = "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50";
              tagLabel = "Low";
              fillClass = "bg-emerald-500";
            } else if (rev.count === 3) {
              tagBg = "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200/50";
              tagLabel = "Busy";
              fillClass = "bg-amber-500";
            } else if (rev.count >= 4) {
              tagBg = "text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 border-red-200/50 animate-pulse";
              tagLabel = "Overloaded";
              fillClass = "bg-red-500";
            }

            const isFiltered = searchQuery === rev.name;

            return (
              <button
                key={rev.name}
                onClick={() => handleReviewerClick(rev.name)}
                className={`w-full text-left group flex flex-col gap-1.5 focus:outline-none cursor-pointer transition-all p-1 rounded-md ${
                  isFiltered 
                    ? "bg-slate-100 dark:bg-slate-800/60 ring-1 ring-blue-500/35" 
                    : "hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                }`}
                title={`Filter system for reviews assigned to ${rev.name}`}
              >
                {/* Reviewer Meta info */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0 pr-1">
                    <div className={`w-4 h-4 rounded-full ${rev.color} text-[8px] font-extrabold text-white flex items-center justify-center shrink-0`}>
                      {rev.initial}
                    </div>
                    <span className="font-bold text-gray-700 dark:text-slate-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {rev.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[8px] leading-3 font-extrabold px-1 rounded border border-transparent uppercase tracking-wider ${tagBg}`}>
                      {tagLabel}
                    </span>
                    <span className="font-mono text-[10px] font-extrabold text-gray-800 dark:text-slate-200">
                      {rev.count}
                    </span>
                  </div>
                </div>

                {/* Progress bar visualizer */}
                <div className="w-full bg-gray-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-350 ${fillClass}`}
                    style={{ width: `${(rev.count / maxReviews) * 100}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {searchQuery && (
          <button
            onClick={() => setSearchQuery?.("")}
            className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 hover:underline text-center w-full mt-1 cursor-pointer"
          >
            Clear active reviewer filter
          </button>
        )}
      </div>

      {/* Footer Indicators */}
      <div className="px-4 mt-auto space-y-3">
        {/* Status indicator shown in Screen 2 */}
        <div className="p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#005faa] dark:text-blue-400" />
            <span className="text-xs font-bold text-[#005faa] dark:text-blue-400 uppercase tracking-wider">HERALD PIPELINE ACTIVE</span>
          </div>
          <p className="text-[11px] text-[#605E5C] dark:text-slate-400">Artifacts generated {conciergeActiveTime || '4m ago'}</p>
        </div>

        {/* Enterprise Edition banner shown in Screen 1 */}
        <div className="bg-[#0078d4]/5 dark:bg-blue-950/20 rounded-lg p-3 border border-[#0078d4]/15 dark:border-blue-900/30 transition-colors">
          <p className="text-[10px] font-bold text-[#005faa] dark:text-blue-400 uppercase tracking-widest font-sans">Enterprise Edition</p>
          <p className="text-[11px] text-[#605E5C] dark:text-slate-400 mt-1 font-mono">v2.4.1-stable</p>
        </div>
      </div>
    </aside>
  );
}

