import { useState, useEffect, useRef } from "react";
import { 
  GitPullRequest, 
  AlertTriangle, 
  Flame, 
  RotateCcw, 
  ArrowUp, 
  ArrowDown, 
  SlidersHorizontal, 
  Download, 
  CheckCircle, 
  HelpCircle, 
  MoreVertical, 
  Activity, 
  Sparkles,
  RefreshCw,
  Plus,
  Terminal,
  Play,
  Pause,
  Cpu,
  Layers,
  MessageSquare,
  ThumbsUp,
  Rocket,
  Clock,
  Check
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from "recharts";
import { PullRequest, DashboardStats } from "../types";
import conciergeMascot from "../assets/images/concierge_mascot_1780564508408.png";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 dark:bg-slate-800 border border-slate-800 dark:border-slate-700 text-white p-2.5 rounded-lg shadow-xl text-left text-xs">
        <p className="font-bold text-slate-400 mb-0.5">{label}</p>
        <p className="font-semibold text-[13px] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Releases: <span className="font-mono text-white text-sm font-bold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

const getTrendData = (total: number) => {
  const weights = [12, 4, 6, 18, 26, 28, 20];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const factor = total / weightSum;
  
  const labels = ["May 29", "May 30", "May 31", "Jun 01", "Jun 02", "Jun 03", "Jun 04"];
  return weights.map((w, idx) => ({
    day: labels[idx],
    count: Math.round(w * factor)
  }));
};

interface LogLine {
  type: "info" | "command" | "success" | "warn" | "error";
  text: string;
  timestamp: string;
}

const generateLogSequences = (pr: PullRequest): LogLine[] => {
  const commitSha = Math.random().toString(16).substring(2, 10).toUpperCase();
  const buildId = Math.floor(Math.random() * 90000) + 10000;
  
  const basePrefix = `[${new Date().toISOString().split("T")[1].slice(0, 8)}]`;
  
  const lines: { type: "info" | "command" | "success" | "warn" | "error"; text: string }[] = [
    { type: "info", text: `Initializing HERALD pipeline client (Build ID: #H-${buildId})...` },
    { type: "info", text: `Git Reference: refs/pull/${pr.id.replace("PR-", "")}/merge` },
    { type: "info", text: `Source Target: origin/${pr.branch} -> origin/main` },
    { type: "info", text: `Triggered by push event on commit [${commitSha}] by @${pr.authorHandle}` },
    { type: "command", text: `npm ci --prefer-offline --no-audit` },
    { type: "success", text: `✓ Cleaned 1,424 cached npm dependencies in 1.45s` },
  ];

  if (pr.type === "BUGFIX") {
    lines.push(
      { type: "info", text: `Analyzing hotfix critical telemetry and regression paths...` },
      { type: "command", text: `npx jest --findRelatedTests src/` },
      { type: "success", text: `✓ 14 hotfix-related regression test specs executed successfully` }
    );
  } else if (pr.type === "FEATURE") {
    lines.push(
      { type: "info", text: `Analyzing feature-flag registry and relational schema bounds...` },
      { type: "command", text: `npm run db:migrate:dry-run` },
      { type: "success", text: `✓ Safe dry-run schema optimization verification complete` }
    );
  } else if (pr.type === "REFACTOR") {
    lines.push(
      { type: "info", text: `Running structural mutations and architecture linter...` },
      { type: "command", text: `npm run coverage` },
      { type: "info", text: `System Coverage Metrics: Core: 94.6% (+0.2% change shift), API: 98.1%` }
    );
  } else {
    lines.push(
      { type: "info", text: `Auditing active dependencies for license and security faults...` },
      { type: "command", text: `npm audit --audit-level=high` },
      { type: "success", text: `✓ No critical vulnerability alerts blocking deployment.` }
    );
  }

  if (pr.risk === "High") {
    lines.push(
      { type: "warn", text: `⚠️ WARNING: High risk signature detected (Changed Files: ${pr.filesChanged || 8}, Impacted Methods: ${pr.methodsImpacted || 5})` },
      { type: "warn", text: `⚠️ Enforcing enhanced integration assertions and load suite triggers...` },
      { type: "command", text: `npx cypress run --spec "cypress/e2e/load/*"` },
      { type: "success", text: `✓ Heavy integration suite completed. Avg latency: 198ms (SLA: 500ms max)` }
    );
  } else if (pr.risk === "Medium") {
    lines.push(
      { type: "info", text: `Medium risk path. Resolving critical static lint bounds...` },
      { type: "command", text: `npm run lint` },
      { type: "success", text: `✓ Static validation successfully cleared.` }
    );
  } else {
    lines.push(
      { type: "info", text: `Low risk pipeline path selected. Proceeding to compilation...` }
    );
  }

  lines.push(
    { type: "command", text: `npm run build` },
    { type: "info", text: `vite building for production in workspace...` },
    { type: 'success', text: `✓ client-side bundles compiled in 2.18s (~198kb index.js, ~42kb styles.css)` },
    { type: "command", text: `docker build -t gcr.io/herald-prod/service:${pr.version || "v2.0"} .` },
    { type: "info", text: `Step 1/5 : FROM node:20-alpine` },
    { type: "info", text: `Step 2/5 : COPY package*.json ./ && RUN npm ci` },
    { type: "info", text: `Step 3/5 : COPY . . && RUN npm run build` },
    { type: "success", text: `✓ Container layers tagged: gcr.io/herald-prod/service:${pr.version || "v2.0"}` },
    { type: "command", text: `kubectl rollouts status deployment/herald-${pr.id.toLowerCase()}-service -n production` },
    { type: "info", text: `Publishing canary containers to live cluster...` },
    { type: "success", text: `✓ Pod herald-canary-01 online (Status: READY, CPU: 8%)` },
    { type: "success", text: `✓ Pod herald-canary-02 online (Status: READY, CPU: 12%)` },
    { type: "success", text: `✓ Pod herald-canary-03 online (Status: READY, CPU: 10%)` },
    { type: "success", text: `🎉 Canary rollout complete. Deployment active on production gateway.` }
  );

  return lines.map(line => ({
    ...line,
    timestamp: basePrefix
  }));
};

export interface TeamActivityEvent {
  id: string;
  type: "approval" | "comment" | "deployment" | "creation";
  user: {
    name: string;
    handle: string;
    avatarColor: string; 
  };
  target: string; 
  targetTitle: string; 
  details?: string;
  timeLabel: string; 
}

const INITIAL_TEAM_ACTIVITIES: TeamActivityEvent[] = [
  {
    id: "act-1",
    type: "deployment",
    user: { name: "Herald bot", handle: "herald-deployer", avatarColor: "bg-blue-600 text-white" },
    target: "PR-1046",
    targetTitle: "Optimize DB indexing rules",
    details: "Canary rollout v2.4.1 completed successfully across 3 available production nodes.",
    timeLabel: "4m ago"
  },
  {
    id: "act-2",
    type: "approval",
    user: { name: "Sarah Jenkins", handle: "sarah_eng", avatarColor: "bg-emerald-600 text-white" },
    target: "PR-1049",
    targetTitle: "Dynamic theme and telemetry layers",
    details: "Approved code structure changes. High performance assurance cleared.",
    timeLabel: "14m ago"
  },
  {
    id: "act-3",
    type: "comment",
    user: { name: "Alex Rover", handle: "alex_dev", avatarColor: "bg-indigo-600 text-white" },
    target: "PR-1047",
    targetTitle: "Clean terminal layout regressions",
    details: "Let's check the line break scaling. Make sure we use overflow-x-hidden to prevent body bleed.",
    timeLabel: "38m ago"
  },
  {
    id: "act-4",
    type: "creation",
    user: { name: "Emily Diaz", handle: "emily_qa", avatarColor: "bg-amber-600 text-white" },
    target: "PR-1051",
    targetTitle: "Fix auto refresh race conditions",
    details: "Opened pull request with critical hotfix for useEffect interval leaks.",
    timeLabel: "1h ago"
  },
  {
    id: "act-5",
    type: "approval",
    user: { name: "Carter Smith", handle: "carter_sys", avatarColor: "bg-rose-600 text-white" },
    target: "PR-1045",
    targetTitle: "Add Recharts Volume Volume widget",
    details: "Changes approved. Verified dynamic bounds are robust.",
    timeLabel: "2h ago"
  }
];

const SIMULATION_POOL: Omit<TeamActivityEvent, "id" | "timeLabel">[] = [
  {
    type: "comment",
    user: { name: "Sarah Jenkins", handle: "sarah_eng", avatarColor: "bg-emerald-600 text-white" },
    target: "PR-1049",
    targetTitle: "Dynamic theme and telemetry layers",
    details: "Could you re-verify if this compiles fine with Vite production config limits?"
  },
  {
    type: "approval",
    user: { name: "Alex Rover", handle: "alex_dev", avatarColor: "bg-indigo-600 text-white" },
    target: "PR-1051",
    targetTitle: "Fix auto refresh race conditions",
    details: "LGTM! Approved. Nice catch on the cleanup hooks."
  },
  {
    type: "deployment",
    user: { name: "Herald bot", handle: "herald-deployer", avatarColor: "bg-blue-600 text-white" },
    target: "PR-1049",
    targetTitle: "Dynamic theme and telemetry layers",
    details: "Active canary rollout tagged v2.5.0 initiated in k8s deployment pool."
  },
  {
    type: "comment",
    user: { name: "Carter Smith", handle: "carter_sys", avatarColor: "bg-rose-600 text-white" },
    target: "PR-1046",
    targetTitle: "Optimize DB indexing rules",
    details: "Let's double-check the index limits on our secondary SQL metrics table."
  },
  {
    type: "approval",
    user: { name: "Emily Diaz", handle: "emily_qa", avatarColor: "bg-amber-600 text-white" },
    target: "PR-1047",
    targetTitle: "Clean terminal layout regressions",
    details: "All regression specs passed. Approved for release."
  }
];

interface ActivityDashboardProps {
  prs: PullRequest[];
  stats: DashboardStats;
  searchQuery: string;
  onSelectPr: (pr: PullRequest) => void;
  onOpenCreatePr: () => void;
  isLoading: boolean;
  onRefreshData?: () => void;
}

export default function ActivityDashboard({ 
  prs, 
  stats, 
  searchQuery, 
  onSelectPr, 
  onOpenCreatePr,
  isLoading,
  onRefreshData
}: ActivityDashboardProps) {
  
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");

  const [activities, setActivities] = useState<TeamActivityEvent[]>(INITIAL_TEAM_ACTIVITIES);
  const [activityFilter, setActivityFilter] = useState<"all" | "approval" | "comment" | "deployment" | "creation">("all");

  const handleSimulateActivity = () => {
    const randomIndex = Math.floor(Math.random() * SIMULATION_POOL.length);
    const template = SIMULATION_POOL[randomIndex];
    
    let targetId = template.target;
    let targetTitle = template.targetTitle;
    if (prs && prs.length > 0) {
      const randomPr = prs[Math.floor(Math.random() * prs.length)];
      targetId = randomPr.id;
      targetTitle = randomPr.title;
    }

    const newActivity: TeamActivityEvent = {
      id: `act-${Date.now()}`,
      type: template.type as any,
      user: template.user,
      target: targetId,
      targetTitle: targetTitle,
      details: template.details,
      timeLabel: "Just now"
    };

    setActivities(prev => {
      const updated = [newActivity, ...prev];
      return updated.slice(0, 15);
    });
  };

  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(30);

  useEffect(() => {
    if (!autoRefresh) return;
    
    setTimeLeft(30);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (onRefreshData) {
            onRefreshData();
          }
          handleSimulateActivity();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, onRefreshData, prs]);

  // CI/CD Terminal Simulator States
  const [selectedPrId, setSelectedPrId] = useState<string>("");
  const [buildStatus, setBuildStatus] = useState<"IDLE" | "RUNNING" | "SUCCESS" | "FAILED">("IDLE");
  const [printedLogs, setPrintedLogs] = useState<LogLine[]>([]);
  const [allLogsForSelectedPr, setAllLogsForSelectedPr] = useState<LogLine[]>([]);
  const [logIndex, setLogIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [logSpeed, setLogSpeed] = useState<number>(1); // Speed index: 1, 2, 4, or 0 (Instant)
  const [terminalFilter, setTerminalFilter] = useState<"ALL" | "COMMAND" | "INFO" | "SUCCESS" | "WARN">("ALL");
  
  // Real-time server vital simulations
  const [cpuLoad, setCpuLoad] = useState<number>(24);
  const [memoryUsage, setMemoryUsage] = useState<number>(412);
  const [elapsedBuildTime, setElapsedBuildTime] = useState<number>(0);
  
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prs.length > 0 && !selectedPrId) {
      setSelectedPrId(prs[0].id);
    }
  }, [prs, selectedPrId]);

  const startBuildSequence = (prId: string) => {
    const targetPr = prs.find(p => p.id === prId);
    if (!targetPr) return;
    const generated = generateLogSequences(targetPr);
    setAllLogsForSelectedPr(generated);
    setPrintedLogs([]);
    setLogIndex(0);
    setBuildStatus("RUNNING");
    setIsPaused(false);
    setElapsedBuildTime(0);
  };

  useEffect(() => {
    if (selectedPrId) {
      startBuildSequence(selectedPrId);
    }
  }, [selectedPrId]);

  useEffect(() => {
    if (logSpeed === 0 && buildStatus === "RUNNING") {
      setPrintedLogs(allLogsForSelectedPr);
      setLogIndex(allLogsForSelectedPr.length);
      setBuildStatus("SUCCESS");
      setCpuLoad(8);
      setMemoryUsage(420);
      setElapsedBuildTime(2.4);
    }
  }, [logSpeed, buildStatus, allLogsForSelectedPr]);

  useEffect(() => {
    if (buildStatus !== "RUNNING" || isPaused || logSpeed === 0) return;
    if (logIndex >= allLogsForSelectedPr.length) {
      setBuildStatus("SUCCESS");
      return;
    }

    const baseDelay = 450; 
    const currentDelay = baseDelay / logSpeed;

    const timer = setTimeout(() => {
      const nextLine = allLogsForSelectedPr[logIndex];
      setPrintedLogs(prev => [...prev, nextLine]);
      setLogIndex(prev => prev + 1);
      
      setCpuLoad(Math.floor(Math.random() * 45) + (nextLine.type === "command" ? 35 : 15));
      setMemoryUsage(prev => {
        const delta = Math.floor(Math.random() * 15) - 6;
        const nextVal = prev + delta;
        return nextVal < 300 ? 300 : nextVal > 950 ? 950 : nextVal;
      });
      setElapsedBuildTime(prev => parseFloat((prev + (currentDelay / 1000)).toFixed(1)));
    }, currentDelay);

    return () => clearTimeout(timer);
  }, [buildStatus, isPaused, logIndex, allLogsForSelectedPr, logSpeed]);

  useEffect(() => {
    if (consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [printedLogs]);

  // Filtering Logic
  const filteredPrs = prs.filter((pr) => {
    const matchesSearch = 
      pr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pr.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pr.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pr.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pr.reviewer && pr.reviewer.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === "all" || pr.type === filterType;
    const matchesRisk = filterRisk === "all" || pr.risk === filterRisk;

    return matchesSearch && matchesType && matchesRisk;
  });

  return (
    <div className="flex-1 p-6 md:p-8 max-w-[1440px] mx-auto w-full">
      
      {/* Top Title & Command Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-[#201F1E] dark:text-slate-100 tracking-tight">Release Dashboard</h1>
          <p className="text-sm text-[#605E5C] dark:text-slate-400 mt-1 font-medium">Overview of ongoing deployment pipelines and code quality metrics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 border shadow-sm transition-all duration-150 active:scale-95 cursor-pointer ${
              autoRefresh
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-250 dark:border-emerald-800/80"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-[#EDEBE9] dark:border-slate-800 hover:bg-gray-50/80 dark:hover:bg-slate-800/80"
            }`}
            title="Toggle Auto-refresh data polling every 30 seconds"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
            <span>Auto-Refresh</span>
            {autoRefresh ? (
              <span className="font-mono text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded ml-0.5">
                {timeLeft}s
              </span>
            ) : (
              <span className="text-[9px] text-gray-400 dark:text-slate-500 font-semibold px-1 rounded ml-0.5 uppercase">
                Off
              </span>
            )}
          </button>

          <button 
            onClick={onOpenCreatePr}
            className="bg-[#0078d4] hover:bg-[#005faa] text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-md transition-all duration-150 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            TRIGGER MANUAL RELEASE
          </button>
        </div>
      </div>

      {/* Bento Grid Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* Active PRs Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-1.5">
            <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">Active PRs</p>
            <GitPullRequest className="w-5 h-5 text-primary dark:text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-[#201F1E] dark:text-slate-50">{prs.length}</p>
          <p className="text-xs text-[#107C10] dark:text-emerald-400 mt-1.5 flex items-center gap-1 font-semibold">
            <ArrowUp className="w-3.5 h-3.5" />
            12% from last week
          </p>
        </div>

        {/* Avg Risk Level Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-1.5">
            <div className="flex items-center gap-1.5 relative group/tooltip">
              <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">Avg Risk Level</p>
              <HelpCircle className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 cursor-help hover:text-gray-600 dark:hover:text-slate-400 transition-colors" />
              
              {/* Tooltip */}
              <div className="absolute z-50 bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-64 p-3 bg-gray-900 border border-gray-800 text-[11px] text-gray-200 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:pointer-events-auto transition-all duration-200 text-left normal-case font-medium leading-relaxed">
                <p className="font-bold text-white mb-1">Average Risk Calculation</p>
                Calculated as a weighted matrix based on total files changed, lines of code added/deleted, complexity of impacted methods, and the deployment safety history of the target branch.
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-800"></div>
              </div>
            </div>
            <AlertTriangle className="w-5 h-5 text-[#D83B01]" />
          </div>
          <p className="text-2xl font-bold text-[#201F1E] dark:text-slate-50">{stats.avgRiskLevel}</p>
          <div className="w-full bg-[#eeeeee] dark:bg-slate-800 h-1.5 rounded-full mt-3.5 overflow-hidden">
            <div className="bg-[#D83B01] h-full rounded-full w-2/3"></div>
          </div>
        </div>

        {/* Deploy Speed Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-1.5">
            <div className="flex items-center gap-1.5 relative group/tooltip">
              <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">Deploy Speed</p>
              <HelpCircle className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 cursor-help hover:text-gray-600 dark:hover:text-slate-400 transition-colors" />
              
              {/* Tooltip */}
              <div className="absolute z-50 bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-64 p-3 bg-gray-900 border border-gray-800 text-[11px] text-gray-200 rounded-lg shadow-xl opacity-0 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:pointer-events-auto transition-all duration-200 text-left normal-case font-medium leading-relaxed">
                <p className="font-bold text-white mb-1">Deploy Speed Calculation</p>
                Represents the rolling average latency from code approval of release candidates until they are successfully built, run through static regression suites, and verified live on production container runs.
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-800"></div>
              </div>
            </div>
            <Flame className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-[#201F1E] dark:text-slate-50">{stats.deploySpeed}</p>
          <p className="text-xs text-[#107C10] dark:text-emerald-400 mt-1.5 flex items-center gap-1 font-semibold">
            <ArrowDown className="w-3.5 h-3.5" />
            -2m improvement
          </p>
        </div>

        {/* Rollback Rate Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-1.5">
            <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">Rollback Rate</p>
            <RotateCcw className="w-5 h-5 text-[#A4262C]" />
          </div>
          <p className="text-2xl font-bold text-[#201F1E] dark:text-slate-50">{stats.rollbackRate}</p>
          <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-1.5 font-medium">Excellent stability</p>
        </div>
      </div>

      {/* Main Bottom Section: Active Table vs Side bar */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Release Overview Table (Left Flex Column) */}
        <div className="flex-[3] flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col justify-between transition-colors w-full">
          <div>
            {/* Table Header Controls */}
            <div className="px-5 py-4 border-b border-[#EDEBE9] dark:border-slate-800 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50 dark:bg-slate-900/30">
              <h3 className="text-lg font-bold text-[#201F1E] dark:text-slate-100">Release Overview</h3>
              
              {/* Filter badging row */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <select 
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border border-[#c0c7d4] dark:border-slate-700 rounded px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-[#404752] dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="FEATURE">Features</option>
                    <option value="BUGFIX">Bugfixes</option>
                    <option value="CHORE">Chores</option>
                    <option value="REFACTOR">Refactors</option>
                  </select>

                  <select 
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value)}
                    className="border border-[#c0c7d4] dark:border-slate-700 rounded px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-[#404752] dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="all">All Risks</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <button 
                  onClick={() => { setFilterType("all"); setFilterRisk("all"); }}
                  title="Clear Filters"
                  className="px-2.5 py-1 rounded bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs font-semibold border border-transparent hover:border-[#EDEBE9] dark:hover:border-slate-700 text-[#201F1E] dark:text-slate-300 transition-colors cursor-pointer animate-none"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Overflow Responsive Table container */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/40">
                    <th className="text-left py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">PR Title</th>
                    <th className="text-left py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">Author</th>
                    <th className="text-left py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">Type</th>
                    <th className="text-left py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">Risk</th>
                    <th className="text-left py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">Status</th>
                    <th className="text-right py-3.5 px-6 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider border-b border-[#EDEBE9] dark:border-slate-800">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDEBE9] dark:divide-slate-800">
                  {filteredPrs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16 bg-white dark:bg-slate-900 border-b border-[#EDEBE9] dark:border-slate-800">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                          <div className="relative group mb-4">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[#0078D4]/15 to-teal-500/10 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                            <img
                              src={conciergeMascot}
                              alt="HERALD Mascot Robot Helper"
                              className="relative w-28 h-28 object-contain drop-shadow-sm select-none transition-transform duration-300 hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <h4 className="text-sm font-bold text-[#201F1E] dark:text-slate-100">No matching pull requests</h4>
                          <p className="text-[11px] text-[#605E5C] dark:text-slate-400 mt-1 leading-relaxed max-w-xs">
                            HERALD searched everywhere but couldn't find any pull requests matching your active query. Try clearing some filters!
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredPrs.map((pr) => (
                      <tr 
                        key={pr.id} 
                        onClick={() => onSelectPr(pr)}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors duration-100 group cursor-pointer"
                      >
                        {/* Title details */}
                        <td className="py-4 px-6 max-w-xs md:max-w-md">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-[#201F1E] dark:text-slate-100 group-hover:text-[#0078D4] dark:group-hover:text-blue-400 transition-colors">{pr.title}</span>
                            <span className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5">{pr.id} • branch: <span className="font-mono bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] text-[#201F1E] dark:text-slate-300">{pr.branch}</span></span>
                          </div>
                        </td>

                        {/* Author metadata */}
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <img 
                              alt={pr.authorName} 
                              className="w-[22px] h-[22px] rounded-full border border-gray-100 dark:border-slate-800" 
                              referrerPolicy="no-referrer"
                              src={pr.authorAvatar} 
                            />
                            <span className="text-xs text-[#201F1E] dark:text-slate-200 font-semibold">{pr.authorName}</span>
                          </div>
                        </td>

                        {/* Tag category */}
                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            pr.type === 'FEATURE' 
                              ? "bg-[#0078D4]/5 text-[#0078D4] border-[#0078D4]/15" 
                              : pr.type === 'BUGFIX'
                              ? "bg-[#9B30FF]/5 text-[#9B30FF] border-[#9B30FF]/15"
                              : pr.type === 'REFACTOR'
                              ? "bg-teal-500/5 text-teal-600 border-teal-500/15"
                              : "bg-gray-500/5 text-gray-600 border-gray-500/15"
                          }`}>
                            {pr.type}
                          </span>
                        </td>

                        {/* Evaluated risk */}
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              pr.risk === 'High' 
                                ? "bg-[#A4262C]" 
                                : pr.risk === 'Medium'
                                ? "bg-[#D83B01]"
                                : "bg-[#107C10]"
                            }`}></span>
                            <span className="text-xs text-[#201F1E] dark:text-slate-200 font-medium">{pr.risk}</span>
                          </div>
                        </td>

                        {/* Deployment progress status */}
                        <td className="py-4 px-6 whitespace-nowrap">
                          {pr.status === 'Released' ? (
                            <span className="flex items-center gap-1.5 text-xs text-[#107C10] dark:text-emerald-400 font-semibold">
                              <CheckCircle className="w-4 h-4" />
                              Released
                            </span>
                          ) : pr.status === 'In Progress' ? (
                            <span className="flex items-center gap-1.5 text-xs text-[#0078D4] dark:text-blue-400 font-semibold">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              In Progress
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-[#605E5C] dark:text-slate-400 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                              Pending Review
                            </span>
                          )}
                        </td>

                        {/* Interactive ellipsis action cell */}
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPr(pr);
                            }}
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 opacity-50 group-hover:opacity-100 p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-all cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table total indicator footer */}
          <div className="px-5 py-3.5 border-t border-[#EDEBE9] dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 text-xs text-[#605E5C] dark:text-slate-400 font-medium flex justify-between items-center">
            <span>Showing {filteredPrs.length} of {prs.length} pull requests</span>
            {filteredPrs.length > 0 && (
              <span className="italic">Click a row to audit detailed AI reasoning workspace</span>
            )}
          </div>
        </div>

        {/* Terminal CI/CD Build Logs Component */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col font-mono text-xs text-gray-300 w-full">
          {/* Terminal Header */}
          <div className="bg-[#161b22] px-4 py-3 border-b border-[#21262d] flex justify-between items-center select-none">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 ml-1">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
              </div>
              <div className="h-4 w-px bg-slate-700 mx-2" />
              <div className="flex items-center gap-2 font-semibold text-slate-400 text-[11px] uppercase tracking-wider font-sans">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>CI/CD Pipeline Console</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Build status label indicator */}
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold font-sans ${
                buildStatus === "RUNNING" 
                  ? "bg-blue-950/60 border border-blue-800 text-blue-400 animate-pulse" 
                  : buildStatus === "SUCCESS"
                    ? "bg-emerald-950/60 border border-emerald-800 text-emerald-400"
                    : "bg-slate-900 border border-slate-800 text-slate-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  buildStatus === "RUNNING" ? "bg-blue-450" : buildStatus === "SUCCESS" ? "bg-emerald-400" : "bg-slate-400"
                }`} />
                {buildStatus}
              </span>
            </div>
          </div>

          {/* Live Metrics / Server telemetry bar */}
          <div className="bg-[#0d1117]/85 px-5 py-2.5 border-b border-[#1f242c] flex flex-wrap justify-between items-center gap-4 text-[10px] text-slate-400 font-sans tracking-wide">
            <div className="flex flex-wrap items-center gap-y-1 gap-x-6">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                <span>CPU Load: <strong className="font-mono text-blue-300">{cpuLoad}%</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Cores Allocation: <strong className="font-mono text-purple-300">8 / 8 Active</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                <span>Mem Alloc: <strong className="font-mono text-teal-300">{memoryUsage}MB / 2.0GB</strong></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4">
              <span>Time Elapsed: <strong className="font-mono text-amber-400">{elapsedBuildTime}s</strong></span>
              <span>Canary Scale: 
                <strong className="font-mono ml-1 text-emerald-400">
                  {printedLogs.some(l => l.text.includes("Canary rollout complete")) ? "3/3 Ready" : 
                   printedLogs.some(l => l.text.includes("herald-canary-02")) ? "2/3 Ready" : 
                   printedLogs.some(l => l.text.includes("herald-canary-01")) ? "1/3 Ready" : "0/3 Scaling"}
                </strong>
              </span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-[#161b22] px-4 py-2 flex flex-wrap justify-between items-center gap-3 border-b border-[#21262d] font-sans">
            <div className="flex items-center gap-2.5">
              <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider block">PR Target:</span>
              <select
                value={selectedPrId}
                onChange={(e) => setSelectedPrId(e.target.value)}
                className="bg-[#0d1117] border border-slate-750 rounded px-2.5 py-1 text-xs text-[#cad5e2] font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[200px]"
              >
                {prs.map(prItem => (
                  <option key={prItem.id} value={prItem.id}>{prItem.id} ({prItem.title.substring(0, 15)}...)</option>
                ))}
              </select>
              
              <button
                onClick={() => startBuildSequence(selectedPrId)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                title="Force re-run the build sequence"
              >
                <RotateCcw className="w-3 h-3" />
                Re-run Build
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Play / Pause Toggle */}
              <button
                onClick={() => setIsPaused(!isPaused)}
                disabled={buildStatus !== "RUNNING"}
                className={`p-1.5 rounded border transition-all cursor-pointer ${
                  buildStatus !== "RUNNING"
                    ? "border-slate-800 text-slate-600 bg-transparent opacity-50 cursor-not-allowed"
                    : isPaused
                      ? "border-amber-400 text-amber-400 bg-amber-950/20 hover:bg-amber-950/40"
                      : "border-slate-750 hover:border-slate-500 text-slate-300 hover:bg-slate-800"
                }`}
                title={isPaused ? "Play build logs feed" : "Pause build logs feed"}
              >
                {isPaused ? <Play className="w-3 h-3 fill-amber-450" /> : <Pause className="w-3 h-3" />}
              </button>

              {/* Speed buttons */}
              <div className="flex items-center bg-[#0d1117] rounded border border-slate-755 p-0.5 overflow-hidden">
                {[
                  { label: "1x", val: 1 },
                  { label: "2x", val: 2 },
                  { label: "4x", val: 4 },
                  { label: "⚡ Ins", val: 0 },
                ].map(speedBtn => (
                  <button
                    key={speedBtn.label}
                    onClick={() => setLogSpeed(speedBtn.val)}
                    className={`text-[9px] font-bold py-0.5 px-1.5 rounded transition-all cursor-pointer ${
                      logSpeed === speedBtn.val
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {speedBtn.label}
                  </button>
                ))}
              </div>

              {/* Terminal line filter */}
              <div className="h-4 w-px bg-slate-700 mx-1" />
              <select
                value={terminalFilter}
                onChange={(e) => setTerminalFilter(e.target.value as any)}
                className="bg-[#0d1117] border border-slate-750 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="ALL">ALL LOGS</option>
                <option value="COMMAND">COMMANDS</option>
                <option value="INFO">INFO ONLY</option>
                <option value="SUCCESS">SUCCESS ONLY</option>
                <option value="WARN">WARNINGS</option>
              </select>
            </div>
          </div>

          {/* Scrollable Log Lines Body */}
          <div className="bg-[#0c0f17] px-5 py-4 h-64 overflow-y-auto font-mono scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <div className="space-y-1 text-left">
              {printedLogs
                .filter(l => {
                  if (terminalFilter === "ALL") return true;
                  if (terminalFilter === "COMMAND") return l.type === "command";
                  if (terminalFilter === "INFO") return l.type === "info";
                  if (terminalFilter === "SUCCESS") return l.type === "success";
                  if (terminalFilter === "WARN") return l.type === "warn" || l.type === "error";
                  return true;
                })
                .map((log, index) => {
                  let colorClass = "text-slate-300";
                  if (log.type === "command") colorClass = "text-sky-300 font-bold";
                  if (log.type === "success") colorClass = "text-emerald-400";
                  if (log.type === "warn") colorClass = "text-amber-400";
                  if (log.type === "error") colorClass = "text-rose-400 font-bold";
                  
                  return (
                    <div key={index} className="flex items-start gap-3 transition-colors duration-200 hover:bg-slate-900/30 p-0.5 rounded">
                      <span className="text-slate-600 select-none text-[10px] mt-0.5 shrink-0">{log.timestamp}</span>
                      {log.type === "command" && (
                        <span className="text-slate-550 select-none text-[10px] mt-0.5 shrink-0">$</span>
                      )}
                      <span className={`leading-relaxed text-[11px] whitespace-pre-wrap break-all ${colorClass}`}>
                        {log.text}
                      </span>
                    </div>
                  );
                })}

              {/* Pulsing blinking loading cursor */}
              {buildStatus === "RUNNING" && !isPaused && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-slate-600 select-none text-[10px] shrink-0">
                    [{new Date().toISOString().split("T")[1].slice(0, 8)}]
                  </span>
                  <span className="text-blue-400 select-none text-[10px] shrink-0">$</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-550 italic">Executing pipeline step...</span>
                    <span className="w-1.5 h-4 bg-sky-400 animate-[pulse_0.75s_infinite] inline-block shrink-0" />
                  </div>
                </div>
              )}
              
              {isPaused && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-slate-600 select-none text-[10px] shrink-0">
                    [{new Date().toISOString().split("T")[1].slice(0, 8)}]
                  </span>
                  <div className="text-[11px] text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <span>● Stream Paused</span>
                  </div>
                </div>
              )}

              {buildStatus === "SUCCESS" && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-slate-600 select-none text-[10px] shrink-0">
                    [{new Date().toISOString().split("T")[1].slice(0, 8)}]
                  </span>
                  <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <span>✓ PIPELINE STABLE • ALL VERIFICATIONS CLEARED</span>
                  </div>
                </div>
              )}

              <div ref={consoleBottomRef} />
            </div>
          </div>

          {/* Interactive Terminal Footer Details */}
          <div className="bg-[#161b22] border-t border-[#21262d] px-4 py-3 flex justify-between items-center text-[10px] text-slate-500 font-sans">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live socket tunnel connected to k8s-cluster-active-pool
            </span>
            <span>
              L: {printedLogs.length} | S: {logSpeed === 0 ? "Instant" : `${logSpeed}x`}
            </span>
          </div>
        </div>
      </div>

        {/* Right Sidebar Activity Logs (Right Column) */}
        <div className="flex-1 flex flex-col gap-4">
          
          {/* Release Trend Line Chart Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm transition-colors flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xs font-extrabold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest leading-none">Release Volume</h3>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-medium">Daily rolls over last 7 days</p>
              </div>
              <span className="text-[11px] font-mono font-bold bg-[#F3F2F1] dark:bg-slate-800 text-[#201F1E] dark:text-slate-200 px-2 py-0.5 rounded border border-[#EDEBE9] dark:border-slate-700/80">
                {stats.totalReleases7d} Total
              </span>
            </div>

            {/* Recharts Container */}
            <div className="w-full h-36 mt-1 flex justify-center items-center">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={getTrendData(stats.totalReleases7d)}
                  margin={{ top: 5, right: 10, left: -28, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f3f5" strokeOpacity={0.4} className="dark:stroke-slate-800" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: '#8a8a8a', fontSize: 9, fontWeight: 500 }}
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fill: '#8a8a8a', fontSize: 9, fontWeight: 500 }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,120,212,0.15)', strokeWidth: 1 }} />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#0078D4" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, stroke: '#0078D4', strokeWidth: 1.5, fill: '#ffffff' }}
                    activeDot={{ r: 5, stroke: '#0078D4', strokeWidth: 0, fill: '#0078D4' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Release Stats Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm transition-colors">
            <h3 className="text-base font-bold text-[#201F1E] dark:text-slate-100 mb-4">Release Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#605E5C] dark:text-slate-400 font-semibold">Total Releases (7d)</span>
                <span className="text-xs font-bold text-[#201F1E] dark:text-slate-250 bg-[#F3F2F1] dark:bg-slate-800 px-2.5 py-1 rounded">
                  {stats.totalReleases7d}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#605E5C] dark:text-slate-400 font-semibold">Success Rate</span>
                <span className="text-xs font-extrabold text-[#107C10] dark:text-emerald-400">{stats.successRate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#605E5C] dark:text-slate-400 font-semibold">Average Risk</span>
                <span className="text-xs font-extrabold text-[#D83B01]">{stats.avgRiskLevel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#605E5C] dark:text-slate-400 font-semibold">Active Pipelines</span>
                <span className="text-xs font-extrabold text-[#0078D4] dark:text-blue-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  {prs.filter(p => p.status === 'In Progress').length || 3} Running
                </span>
              </div>
            </div>
          </div>

          {/* Team Activity Sidebar Widget */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm transition-colors flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-xs font-extrabold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest leading-none">Team Activity</h3>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-medium">Real-time collaboration feed</p>
              </div>
              <button
                onClick={handleSimulateActivity}
                className="text-[10px] bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950/60 text-[#0078D4] dark:text-sky-300 border border-sky-200 dark:border-sky-800/80 px-2.5 py-1 rounded-md font-bold transition-all uppercase flex items-center gap-1 active:scale-95 cursor-pointer"
                title="Post simulated team update"
              >
                <Sparkles className="w-2.5 h-2.5" />
                Simulate
              </button>
            </div>

            {/* Filters chips row */}
            <div className="flex flex-wrap gap-1 mb-4 select-none">
              {(["all", "approval", "comment", "deployment"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setActivityFilter(f)}
                  className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider transition-all cursor-pointer ${
                    activityFilter === f
                      ? "bg-[#0078D4] text-white shadow-sm"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {f === "all" ? "All" : f + "s"}
                </button>
              ))}
            </div>

            {/* Timeline Area */}
            <div className="relative border-l border-gray-200 dark:border-slate-800 ml-2.5 pl-4 pb-1 space-y-4 max-h-[340px] overflow-y-auto scrollbar-thin pr-1 text-left">
              {activities
                .filter(act => activityFilter === "all" || act.type === activityFilter)
                .map((act) => {
                  let badgeIcon = <Activity className="w-3 h-3 text-slate-500" />;
                  let iconBg = "bg-slate-100 dark:bg-slate-800";
                  let borderClass = "border-slate-200 dark:border-slate-700";

                  if (act.type === "approval") {
                    badgeIcon = <ThumbsUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />;
                    iconBg = "bg-emerald-50 dark:bg-emerald-950/60";
                    borderClass = "border-emerald-200 dark:border-emerald-900";
                  } else if (act.type === "comment") {
                    badgeIcon = <MessageSquare className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />;
                    iconBg = "bg-indigo-50 dark:bg-indigo-950/60";
                    borderClass = "border-indigo-200 dark:border-indigo-900";
                  } else if (act.type === "deployment") {
                    badgeIcon = <Rocket className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
                    iconBg = "bg-blue-50 dark:bg-blue-950/60";
                    borderClass = "border-blue-200 dark:border-blue-900";
                  } else if (act.type === "creation") {
                    badgeIcon = <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
                    iconBg = "bg-amber-50 dark:bg-amber-950/60";
                    borderClass = "border-amber-200 dark:border-amber-900";
                  }

                  return (
                    <div key={act.id} className="relative group/timeline transition-all duration-200">
                      {/* Anchor Timeline Icon */}
                      <span className={`absolute -left-[23px] top-1.5 flex items-center justify-center w-4 h-4 rounded-full border ${borderClass} ${iconBg} z-10 transition-transform group-hover/timeline:scale-110 shadow-sm`}>
                        {badgeIcon}
                      </span>

                      {/* Header user handle */}
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] uppercase select-none ${act.user.avatarColor}`}>
                          {act.user.name.split(" ").map(w => w[0]).join("")}
                        </span>
                        <span className="font-bold text-gray-800 dark:text-slate-250 hover:underline cursor-pointer select-all">
                          @{act.user.handle}
                        </span>
                        <div className="flex items-center text-gray-400 dark:text-slate-500 font-medium ml-auto select-none gap-0.5 text-[9px] shrink-0 font-sans">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{act.timeLabel}</span>
                        </div>
                      </div>

                      {/* Content block detail */}
                      <div className="mt-1 text-xs">
                        <p className="text-gray-650 dark:text-slate-400 leading-tight font-medium">
                          {act.type === "approval" && <span>Approved candidate </span>}
                          {act.type === "comment" && <span>Commented on </span>}
                          {act.type === "deployment" && <span>Ran canary on </span>}
                          {act.type === "creation" && <span>Opened integration </span>}
                          
                          {/* Anchor Link to specific target PR */}
                          <button
                            onClick={() => {
                              const foundPr = prs.find(p => p.id === act.target);
                              if (foundPr) {
                                onSelectPr(foundPr);
                              } else {
                                setSelectedPrId(act.target);
                              }
                            }}
                            className="font-mono font-bold text-[#0078D4] hover:text-[#005faa] dark:text-blue-400 dark:hover:text-blue-300 ml-0.5 underline decoration-dotted underline-offset-2 transition-colors cursor-pointer"
                            title={`Inspect ${act.target}`}
                          >
                            {act.target}
                          </button>
                          <span className="text-gray-400 dark:text-slate-500 font-sans italic text-[10px] block mt-0.5 truncate max-w-[240px]">
                            {act.targetTitle}
                          </span>
                        </p>

                        {/* Speech bubbles or quote details */}
                        {act.details && (
                          <div className="mt-2 bg-gray-50/70 dark:bg-slate-900/60 border border-gray-150/50 dark:border-slate-800 rounded-lg p-2 text-[10.5px] text-gray-600 dark:text-slate-400 font-sans leading-relaxed break-words shadow-sm">
                            {act.details}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {activities.filter(act => activityFilter === "all" || act.type === activityFilter).length === 0 && (
                <div className="text-center py-6 select-none font-sans">
                  <Activity className="w-6 h-6 mx-auto text-gray-300 dark:text-slate-700 animate-pulse" />
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">No active records for this type</p>
                </div>
              )}
            </div>
          </div>

          {/* Health Check Systems Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm transition-colors">
            <h3 className="text-base font-bold text-[#201F1E] dark:text-slate-100 mb-4">Health Check</h3>
            <div className="space-y-4">
              
              {/* Endpoint 1 */}
              <div className="flex items-start gap-3">
                <div className="w-[5px] h-9 bg-[#107C10] rounded-full shrink-0"></div>
                <div>
                  <p className="text-[11px] font-bold text-[#201F1E] dark:text-slate-300 uppercase tracking-wider">API GATEWAY</p>
                  <p className="text-xs text-[#107C10] dark:text-emerald-400 font-semibold mt-0.5">Operational • 12ms latency</p>
                </div>
              </div>

              {/* Endpoint 2 */}
              <div className="flex items-start gap-3">
                <div className="w-[5px] h-9 bg-[#107C10] rounded-full shrink-0"></div>
                <div>
                  <p className="text-[11px] font-bold text-[#201F1E] dark:text-slate-300 uppercase tracking-wider">CDN EDGE</p>
                  <p className="text-xs text-[#107C10] dark:text-emerald-400 font-semibold mt-0.5">Operational • 4 nodes active</p>
                </div>
              </div>

              {/* Endpoint 3 */}
              <div className="flex items-start gap-3 bg-red-50/20 dark:bg-red-950/10 p-1.5 rounded-lg">
                <div className="w-[5px] h-9 bg-[#D83B01] rounded-full shrink-0"></div>
                <div>
                  <p className="text-[11px] font-bold text-[#201F1E] dark:text-slate-300 uppercase tracking-wider">DB CLUSTER</p>
                  <p className="text-xs text-[#D83B01] font-semibold mt-0.5">Degraded • High I/O wait</p>
                </div>
              </div>

            </div>
          </div>

          {/* Auto-Release Policy Actions Card */}
          <div className="bg-gradient-to-br from-[#005faa] to-[#0078d4] p-5 rounded-xl text-white shadow-md relative overflow-hidden">
            <div className="absolute right-[-10px] top-[-10px] opacity-10">
              <Sparkles className="w-24 h-24" />
            </div>
            
            <Sparkles className="w-8 h-8 text-blue-200 mb-2.5" />
            
            <h3 className="text-base font-bold mb-1">Auto-Release Enabled</h3>
            <p className="text-xs text-blue-100 leading-relaxed mb-4">
              HERALD is currently managing automatic canary deployments for 'Core-Service' microservices array.
            </p>
            <button 
              onClick={() => alert("Configure Policy modal triggered. Default auto-release parameters are stable.")}
              className="w-full bg-white text-[#005faa] hover:bg-gray-100 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Configure Policy
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
