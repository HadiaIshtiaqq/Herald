import { useState, useEffect, useCallback, useRef } from "react";
import Header from "./components/Header.js";
import Sidebar from "./components/Sidebar.js";
import ActivityDashboard from "./components/ActivityDashboard.js";
import ReleaseWorkspace from "./components/ReleaseWorkspace.js";
import MarketingPage from "./components/MarketingPage.js";
import Onboarding, { Session } from "./components/Onboarding.js";
import NewReleaseDialog from "./components/NewReleaseDialog.js";
import RunReviewScreen from "./components/RunReviewScreen.js";
import { PullRequest, DashboardStats } from "./types.js";
import { useToast } from "./context/ToastContext.js";
import ErrorBoundary from "./components/ErrorBoundary.js";
import SettingsPanel from "./components/SettingsPanel.js";
import GitHubPanel from "./components/GitHubPanel.js";
import CopilotChatPanel from "./components/CopilotChatPanel.js";
import { apiFetch } from "./lib/api.js";
import { makeAvatarSvg } from "./lib/avatar.js";
import { LayoutDashboard, Rocket, Library, AlertCircle, GitBranch, GitPullRequest } from "lucide-react";

export default function App() {
  const { showToast } = useToast();

  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    activePRsCount: 0,
    avgRiskLevel: "Medium",
    deploySpeed: "—",
    rollbackRate: "0%",
    totalReleases7d: 0,
    successRate: "100%",
    activePipelinesCount: 0,
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

  const [activeTab, setActiveTab] = useState<string>("github");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ── GitHub sign-in session (landing → connect username → app) ──────────────
  // Intentionally NOT persisted — every fresh page load (i.e. opening the link)
  // starts on the landing page. Sign-in / demo last only for the current tab.
  const [session, setSession] = useState<Session | null>(null);
  // Demo mode: explore the full app with no GitHub sign-in (the previous behavior).
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const handleSignIn = (s: Session) => {
    setDemoMode(false);
    setSession(s);
    setActiveTab("github");
  };
  const handleDemo = () => {
    setDemoMode(true);
    setActiveTab("dashboard");
  };
  const handleSignOut = () => {
    setSession(null);
    setDemoMode(false);
  };
  const [selectedPr, setSelectedPr] = useState<PullRequest | null>(null);

  const [isNewPrOpen, setIsNewPrOpen] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // F14: derive from actual run activity instead of hardcoding "4m ago"
  const [conciergeActiveTime, setConciergeActiveTime] = useState<string>("idle");
  const updateConciergeTime = useCallback(() => {
    apiFetch("/runs")
      .then(r => r.ok ? r.json() : { items: [] })
      .then((body: { items?: Array<{ updated_at: string }> }) => {
        const runs = body.items ?? [];
        if (!runs.length) return;
        const latest = [...runs].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        const secs = Math.floor((Date.now() - new Date(latest.updated_at).getTime()) / 1000);
        if (secs < 60) setConciergeActiveTime("just now");
        else if (secs < 3600) setConciergeActiveTime(`${Math.floor(secs / 60)}m ago`);
        else setConciergeActiveTime(`${Math.floor(secs / 3600)}h ago`);
      })
      .catch(() => {});
  }, []);

  const userAvatar = makeAvatarSvg("Herald User");

  const loadPrs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch("/api/prs");
      if (response.ok) {
        const body = await response.json() as { items?: PullRequest[] } | PullRequest[];
        const data: PullRequest[] = Array.isArray(body) ? body : (body.items ?? []);
        setPrs(data);
        const defaultPr = data.find((p: PullRequest) => p.id === "PR-42");
        if (defaultPr) setSelectedPr(defaultPr);
        else if (data.length > 0) setSelectedPr(data[0]);
      }
    } catch {
      setErrorNotice("Server connection is booting up. Working locally via memory buffers.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await apiFetch("/api/stats");
      if (response.ok) setStats(await response.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadPrs();
    loadStats();
    updateConciergeTime();
  }, [loadPrs, loadStats, updateConciergeTime]);

  // F3: poll a run until complete, then refresh the linked PR
  const pollRunForPr = useCallback(async (runId: string, prId: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const runRes = await apiFetch(`/runs/${runId}`);
        if (!runRes.ok) break;
        const run = await runRes.json() as { status: string };
        if (run.status === "ready_for_review" || run.status === "done" || run.status === "error") {
          const prRes = await apiFetch(`/api/prs/${prId}`);
          if (prRes.ok) {
            const updated = await prRes.json() as PullRequest;
            setPrs(prev => prev.map(p => p.id === prId ? updated : p));
            setSelectedPr(prev => prev?.id === prId ? updated : prev);
            updateConciergeTime();
            loadStats();
          }
          if (run.status === "error") showToast("AI analysis encountered an error — check Runs tab for details", "error");
          break;
        }
      } catch { break; }
    }
  }, [updateConciergeTime, loadStats, showToast]);

  const handleCreatePr = async (data: {
    title: string;
    authorName: string;
    type: string;
    branch: string;
    description: string;
  }) => {
    try {
      const response = await apiFetch("/api/prs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        const newPr = await response.json() as PullRequest;
        setPrs(prev => [newPr, ...prev]);
        setSelectedPr(newPr);
        setActiveTab("workspace");
        loadPrs();
        loadStats();
      }
    } catch {
      showToast("Submission failed — server may be starting up.", "error");
    }
  };

  const handleAnalyzePr = async (prId: string) => {
    setIsAnalyzing(true);
    try {
      const response = await apiFetch(`/api/prs/${prId}/analyze`, { method: "POST" });
      if (response.ok) {
        const data = await response.json() as { pr: PullRequest; run_id?: string };
        setPrs(prev => prev.map(p => p.id === prId ? data.pr : p));
        setSelectedPr(data.pr);
        setConciergeActiveTime("just now");
        // F3: if server started a Run, poll it and bridge results back to the PR
        if (data.run_id) {
          showToast("AI analysis started — Runs tab is processing.", "info");
          pollRunForPr(data.run_id, prId);
        }
      }
    } catch {
      showToast("AI analysis request failed — check server connection.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApprovePr = async (prId: string, verified: boolean) => {
    try {
      const response = await apiFetch(`/api/prs/${prId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      if (response.ok) {
        const data = await response.json() as { pr: PullRequest };
        setPrs(prev => prev.map(p => p.id === prId ? data.pr : p));
        setSelectedPr(data.pr);
        loadStats();
      }
    } catch {
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, status: "Released" as const, approved: true, verified } : p));
    }
  };

  const handleSelectPr = (pr: PullRequest) => {
    setSelectedPr(pr);
    setActiveTab("workspace");
  };

  const handleUpdatePrReviewer = async (prId: string, reviewer: string) => {
    try {
      const response = await apiFetch(`/api/prs/${prId}/reviewer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer }),
      });
      if (response.ok) {
        const updatedPr = await response.json();
        setPrs(prev => prev.map(p => p.id === prId ? updatedPr : p));
        if (selectedPr?.id === prId) setSelectedPr(updatedPr);
      }
    } catch {
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, reviewer } : p));
      if (selectedPr?.id === prId) setSelectedPr(prev => prev ? { ...prev, reviewer } : null);
    }
  };

  const handleUpdatePrPriority = async (prId: string, priority: 'Low' | 'Medium' | 'High' | 'Critical') => {
    try {
      const response = await apiFetch(`/api/prs/${prId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (response.ok) {
        const updatedPr = await response.json();
        setPrs(prev => prev.map(p => p.id === prId ? updatedPr : p));
        if (selectedPr?.id === prId) setSelectedPr(updatedPr);
      }
    } catch {
      setPrs(prev => prev.map(p => p.id === prId ? { ...p, priority } : p));
      if (selectedPr?.id === prId) setSelectedPr(prev => prev ? { ...prev, priority } : null);
    }
  };

  // Not signed in and not in demo → the landing page is the first thing shown.
  if (!session && !demoMode) {
    return <Onboarding onSignIn={handleSignIn} onDemo={handleDemo} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-950 text-[#1a1c1c] dark:text-slate-100 font-sans antialiased transition-colors duration-150">

      {/* F13: Profiler removed — was wrapping every component unnecessarily */}
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        userAvatar={session?.avatar_url || userAvatar}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onNavigate={setActiveTab}
        session={session}
        onSignOut={handleSignOut}
      />

      <div className="flex flex-1 relative overflow-hidden min-h-0">

        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          conciergeActiveTime={conciergeActiveTime}
          prs={prs}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {errorNotice && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 text-center text-xs text-[#D83B01] font-semibold flex items-center justify-center gap-1.5 z-40 animate-pulse">
            <AlertCircle className="w-4 h-4" />
            <span>{errorNotice}</span>
          </div>
        )}

        <div className={`flex-1 min-h-0 pb-16 md:pb-0 ${activeTab === 'copilot' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>

          {activeTab === "dashboard" && (
            <ErrorBoundary label="Dashboard">
              <ActivityDashboard
                prs={prs}
                stats={stats}
                searchQuery={searchQuery}
                onSelectPr={handleSelectPr}
                onOpenCreatePr={() => setIsNewPrOpen(true)}
                isLoading={isLoading}
                onRefreshData={() => { loadPrs(); loadStats(); }}
                onUpdatePriority={handleUpdatePrPriority}
              />
            </ErrorBoundary>
          )}

          {activeTab === "workspace" && (
            <ErrorBoundary label="Release Workspace">
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
            </ErrorBoundary>
          )}

          {activeTab === "runs" && (
            <ErrorBoundary label="Webhook Runs">
              <RunReviewScreen onBack={() => setActiveTab("dashboard")} />
            </ErrorBoundary>
          )}

          {activeTab === "marketing" && (
            <ErrorBoundary label="Reports">
              <MarketingPage onBackToApp={() => setActiveTab("dashboard")} />
            </ErrorBoundary>
          )}

          {activeTab === "github" && (
            <ErrorBoundary label="GitHub">
              <GitHubPanel onNavigateToRuns={() => setActiveTab("runs")} signedInUser={session?.login} />
            </ErrorBoundary>
          )}

          {activeTab === "copilot" && (
            <ErrorBoundary label="Copilot Chat">
              <CopilotChatPanel />
            </ErrorBoundary>
          )}

          {activeTab === "settings" && (
            <ErrorBoundary label="Settings">
              <SettingsPanel onBack={() => setActiveTab("dashboard")} />
            </ErrorBoundary>
          )}

        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center h-16 bg-white dark:bg-slate-900 border-t border-[#EDEBE9] dark:border-slate-800 shadow-lg transition-colors">
        {[
          { id: "dashboard", Icon: LayoutDashboard, label: "Activity" },
          { id: "workspace", Icon: Rocket, label: "Reviews" },
          { id: "github", Icon: GitPullRequest, label: "GitHub" },
          { id: "runs", Icon: GitBranch, label: "Webhook" },
        ].map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center py-1 px-4 rounded-xl cursor-pointer transition-all ${
              activeTab === id
                ? "bg-blue-50 dark:bg-slate-800 text-[#0078D4] dark:text-blue-400 font-bold shadow-inner"
                : "text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-100"
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
            <span className="text-[10px] uppercase font-bold tracking-widest mt-0.5">{label}</span>
          </button>
        ))}
      </nav>

      {isNewPrOpen && (
        <NewReleaseDialog
          onClose={() => setIsNewPrOpen(false)}
          onSubmit={handleCreatePr}
        />
      )}

      {/* Toasts rendered by ToastProvider in main.tsx */}
    </div>
  );
}

// SettingsPanel is in src/components/SettingsPanel.tsx
