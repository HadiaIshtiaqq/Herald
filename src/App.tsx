import { useState, useEffect, Profiler } from "react";
import Header from "./components/Header.js";
import Sidebar from "./components/Sidebar.js";
import ActivityDashboard from "./components/ActivityDashboard.js";
import ReleaseWorkspace from "./components/ReleaseWorkspace.js";
import MarketingPage from "./components/MarketingPage.js";
import NewReleaseDialog from "./components/NewReleaseDialog.js";
import PerformanceMonitor, { trackComponentRender } from "./components/PerformanceMonitor.js";
import { PullRequest, DashboardStats } from "./types.js";
import { 
  LayoutDashboard, 
  Rocket, 
  Sparkles, 
  Library, 
  AlertCircle
} from "lucide-react";

export default function App() {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activePRsCount: 24,
    avgRiskLevel: "Medium",
    deploySpeed: "12m 40s",
    rollbackRate: "0.4%",
    totalReleases7d: 114,
    successRate: "99.2%",
    activePipelinesCount: 3,
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("releaseConciergeTheme");
      if (stored) return stored === "dark";
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("releaseConciergeTheme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("releaseConciergeTheme", "light");
    }
  }, [isDarkMode]);

  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPr, setSelectedPr] = useState<PullRequest | null>(null);
  
  const [isNewPrOpen, setIsNewPrOpen] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [conciergeActiveTime, setConciergeActiveTime] = useState<string>("4m ago");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Profile icon fallback
  const userAvatar = "https://lh3.googleusercontent.com/aida-public/AB6AXuDqU3rG9YPjyhepXCHsapkuHHDRrcFWonLC8pJpNHSZeeYp0GBhBNd_E1KzvVNxaOIq-23bVKXdBiitCPIuommGSxzOygbM-S0xWKdSJz6AQo234TbFC8J_AiQkXCweW15lLeKMqySD7dznnBqevvQJ9EieCLG4HLE2CmbJL8H2O0DMk5mj95-2LW3YzFpCbZU7gX5hdNjfFMVYKNtqMpso8gCCJIn9VFrD0OFc3ESYOWXM3WJw_KJTUbInIO4F1Yo_4vqBzQUOIPY";

  // Load Data
  const loadPrs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/prs");
      if (response.ok) {
        const data = await response.json();
        setPrs(data);
        
        // Default to PR-42 as selected initially
        const defaultPr = data.find((p: PullRequest) => p.id === "PR-42");
        if (defaultPr) {
          setSelectedPr(defaultPr);
        } else if (data.length > 0) {
          setSelectedPr(data[0]);
        }
      }
    } catch {
      setErrorNotice("Server connection is booting up. Working locally via memory buffers.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch("/api/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch {
      // stats fallback
    }
  };

  useEffect(() => {
    loadPrs();
    loadStats();
  }, []);

  // Submit manual PR
  const handleCreatePr = async (data: {
    title: string;
    authorName: string;
    type: any;
    branch: string;
    description: string;
  }) => {
    try {
      const response = await fetch("/api/prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        const newPr = await response.json();
        // pre-analyze custom PR right away using a quick back-ground trigger
        setPrs(prev => [newPr, ...prev]);
        setSelectedPr(newPr);
        setActiveTab("workspace");
        
        // Refresh server lists
        loadPrs();
        loadStats();
      }
    } catch {
      alert("Submission offline. Connecting...");
    }
  };

  // Submit AI analysis request on selected PR
  const handleAnalyzePr = async (prId: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/prs/${prId}/analyze`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        // Update arrays & active select
        setPrs(prev => prev.map(p => p.id === prId ? data.pr : p));
        setSelectedPr(data.pr);
        setConciergeActiveTime("Just now");
      }
    } catch {
      alert("AI compile sweep disconnected.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Safe Approve release trigger
  const handleApprovePr = async (prId: string, verified: boolean) => {
    try {
      const response = await fetch(`/api/prs/${prId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      if (response.ok) {
        const data = await response.json();
        setPrs(prev => prev.map(p => p.id === prId ? data.pr : p));
        setSelectedPr(data.pr);
        loadStats();
      }
    } catch {
      // offline fallback
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, status: "Released", approved: true, verified } : p));
    }
  };

  // Navigate to detailed workspace when row clicked
  const handleSelectPr = (pr: PullRequest) => {
    setSelectedPr(pr);
    setActiveTab("workspace");
  };

  // Workload balancing re-assignment handler
  const handleUpdatePrReviewer = async (prId: string, reviewer: string) => {
    try {
      const response = await fetch(`/api/prs/${prId}/reviewer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer }),
      });
      if (response.ok) {
        const updatedPr = await response.json();
        setPrs(prev => prev.map(p => p.id === prId ? updatedPr : p));
        if (selectedPr?.id === prId) {
          setSelectedPr(updatedPr);
        }
      }
    } catch {
      // offline fallback
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, reviewer } : p));
      if (selectedPr?.id === prId) {
        setSelectedPr(prev => prev ? { ...prev, reviewer } : null);
      }
    }
  };

  // Re-prioritise pull request handler
  const handleUpdatePrPriority = async (prId: string, priority: 'Low' | 'Medium' | 'High' | 'Critical') => {
    try {
      const response = await fetch(`/api/prs/${prId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (response.ok) {
        const updatedPr = await response.json();
        setPrs(prev => prev.map(p => p.id === prId ? updatedPr : p));
        if (selectedPr?.id === prId) {
          setSelectedPr(updatedPr);
        }
      }
    } catch {
      // offline fallback
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, priority } : p));
      if (selectedPr?.id === prId) {
        setSelectedPr(prev => prev ? { ...prev, priority } : null);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950 text-[#1a1c1c] dark:text-slate-100 font-sans antialiased overflow-x-hidden transition-colors duration-150">
      
      {/* App Header layout template */}
      <Profiler id="Header" onRender={trackComponentRender}>
        <Header 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          userAvatar={userAvatar}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
        />
      </Profiler>

      {/* Main split dashboard section */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Left column pinned sidebar navigation */}
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          conciergeActiveTime={conciergeActiveTime}
          prs={prs}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Server status banner */}
        {errorNotice && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 text-center text-xs text-[#D83B01] font-semibold flex items-center justify-center gap-1.5 z-40 animate-pulse">
            <AlertCircle className="w-4 h-4" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Main Content Pane Router */}
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          
          {activeTab === "dashboard" && (
            <Profiler id="ActivityDashboard" onRender={trackComponentRender}>
              <ActivityDashboard 
                prs={prs}
                stats={stats}
                searchQuery={searchQuery}
                onSelectPr={handleSelectPr}
                onOpenCreatePr={() => setIsNewPrOpen(true)}
                isLoading={isLoading}
                onRefreshData={() => {
                  loadPrs();
                  loadStats();
                }}
                onUpdatePriority={handleUpdatePrPriority}
              />
            </Profiler>
          )}

          {activeTab === "workspace" && (
            <Profiler id="ReleaseWorkspace" onRender={trackComponentRender}>
              <ReleaseWorkspace 
                pr={selectedPr}
                allPrs={prs}
                onApprovePr={handleApprovePr}
                onAnalyzePr={handleAnalyzePr}
                isAnalyzing={isAnalyzing}
                onBackToDashboard={() => setActiveTab("dashboard")}
                onUpdateReviewer={handleUpdatePrReviewer}
                onUpdatePriority={handleUpdatePrPriority}
              />
            </Profiler>
          )}

          {activeTab === "marketing" && (
            <Profiler id="MarketingPage" onRender={trackComponentRender}>
              <MarketingPage 
                onBackToApp={() => setActiveTab("dashboard")}
              />
            </Profiler>
          )}

          {activeTab === "settings" && (
            <div className="p-8 max-w-lg mx-auto py-16 text-center bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-2xl shadow-sm mt-12 animate-in fade-in duration-200">
              <Sparkles className="w-12 h-12 text-[#0078D4] mx-auto mb-4 animate-pulse" />
              <h1 className="text-xl font-bold text-[#201F1E] dark:text-slate-100">Configuration Settings</h1>
              <p className="text-sm text-[#404752] dark:text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                Configure your continuous deployment loops, trigger rules, auto-analyzers pipelines, and GitHub integration webhooks securely.
              </p>
              
              <div className="mt-8 space-y-3 pl-1 text-left">
                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-slate-800/40 border border-[#EDEBE9] dark:border-slate-800 rounded-xl">
                  <span className="text-xs font-bold text-[#201F1E] dark:text-slate-300 uppercase">Gemini Agent Sweep</span>
                  <span className="text-xs text-[#107C10] dark:text-emerald-400 font-extrabold shadow-inner bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-slate-800/40 border border-[#EDEBE9] dark:border-slate-800 rounded-xl">
                  <span className="text-xs font-bold text-[#201F1E] dark:text-slate-300 uppercase">Microsoft Teams Integration</span>
                  <span className="text-xs text-[#107C10] dark:text-emerald-400 font-extrabold shadow-inner bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded">CONNECTED</span>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-slate-800/40 border border-[#EDEBE9] dark:border-slate-800 rounded-xl">
                  <span className="text-xs font-bold text-[#201F1E] dark:text-slate-300 uppercase">Build Telemetry Storage</span>
                  <span className="text-xs text-[#605E5C] dark:text-slate-400 font-extrabold shadow-inner bg-[#F3F2F1] dark:bg-slate-800 px-2.5 py-1 rounded">LOCAL VOLUMES</span>
                </div>
              </div>

              <button 
                onClick={() => setActiveTab("dashboard")}
                className="mt-8 w-full py-3 bg-primary hover:bg-[#005faa] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Reactive Floating Bottom Navigation Sheet (Shown in Screen 3 bottom as Mobile nav) */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center h-16 bg-white dark:bg-slate-900 border-t border-[#EDEBE9] dark:border-slate-800 shadow-lg transition-colors">
        
        {/* Tab 1: Activity */}
        <button 
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl cursor-pointer transition-all ${
            activeTab === "dashboard"
              ? "bg-blue-50 dark:bg-slate-800 text-[#0078D4] dark:text-blue-400 font-bold shadow-inner"
              : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100"
          }`}
        >
          <LayoutDashboard className="w-[18px] h-[18px]" />
          <span className="text-[10px] uppercase font-bold tracking-widest mt-0.5">Activity</span>
        </button>

        {/* Tab 2: Reviews */}
        <button 
          onClick={() => setActiveTab("workspace")}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl cursor-pointer transition-all ${
            activeTab === "workspace"
              ? "bg-blue-50 dark:bg-slate-800 text-[#0078D4] dark:text-blue-400 font-bold shadow-inner"
              : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100"
          }`}
        >
          <Rocket className="w-[18px] h-[18px]" />
          <span className="text-[10px] uppercase font-bold tracking-widest mt-0.5">Reviews</span>
        </button>

        {/* Tab 3: Marketing */}
        <button 
          onClick={() => setActiveTab("marketing")}
          className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl cursor-pointer transition-all ${
            activeTab === "marketing"
              ? "bg-blue-50 dark:bg-slate-800 text-[#0078D4] dark:text-blue-400 font-bold shadow-inner"
              : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100"
          }`}
        >
          <Library className="w-[18px] h-[18px]" />
          <span className="text-[10px] uppercase font-bold tracking-widest mt-0.5">Marketing</span>
        </button>

      </nav>

      {/* Manual Release creation Dialog Drawer wrapper */}
      {isNewPrOpen && (
        <NewReleaseDialog 
          onClose={() => setIsNewPrOpen(false)}
          onSubmit={handleCreatePr}
        />
      )}

      {/* Floating Performance Monitor Overlay */}
      <PerformanceMonitor />

    </div>
  );
}
