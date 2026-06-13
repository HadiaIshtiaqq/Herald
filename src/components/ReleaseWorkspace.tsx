import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "../context/ToastContext.js";
import { makeAvatarSvg } from "../lib/avatar.js";
import { 
  ChevronRight, 
  AlertTriangle, 
  BarChart4, 
  Brain, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  Compass, 
  Scroll, 
  Users, 
  FileText, 
  Network, 
  ShieldAlert, 
  FileEdit, 
  Sparkles, 
  RefreshCw,
  Rocket,
  Download,
  ChevronDown,
  FileDown,
  Mic,
  MicOff,
  MessageSquare,
  Trash2,
  Volume2,
  Bell,
  GitBranch,
  Server,
  Workflow
} from "lucide-react";
import { PullRequest, PRComment } from "../types";
import { apiFetch } from "../lib/api.js";
import conciergeMascot from "../assets/images/concierge_mascot_1780564508408.png";

// Helper to map keyword strings to real Lucide icon components representing the reasoning trace steps
function renderStepIcon(iconName: string, status: string) {
  const baseClass = "w-4 h-4";
  switch (iconName) {
    case "FileSearch":
    case "Inbox":
      return <FileText className={baseClass} />;
    case "GitBranch":
    case "Network":
      return <Network className={baseClass} />;
    case "ShieldAlert":
    case "ShieldCheck":
      return <ShieldAlert className={baseClass} />;
    case "FileSignature":
    case "FileCheck":
      return <FileEdit className={baseClass} />;
    default:
      return <Compass className={baseClass} />;
  }
}

interface ReleaseWorkspaceProps {
  pr: PullRequest | null;
  allPrs?: PullRequest[];
  onApprovePr: (prId: string, verified: boolean) => Promise<void>;
  onAnalyzePr: (prId: string) => Promise<void>;
  isAnalyzing: boolean;
  onBackToDashboard: () => void;
  onUpdateReviewer?: (prId: string, reviewer: string) => Promise<void>;
  onUpdatePriority?: (prId: string, priority: 'Low' | 'Medium' | 'High' | 'Critical') => Promise<void>;
}

export default function ReleaseWorkspace({
  pr,
  allPrs = [],
  onApprovePr,
  onAnalyzePr,
  isAnalyzing,
  onBackToDashboard,
  onUpdateReviewer,
  onUpdatePriority
}: ReleaseWorkspaceProps) {
  
  const { showToast } = useToast();
  const [activeArtifactTab, setActiveArtifactTab] = useState<"changelog" | "teams" | "analysis">("changelog");
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // === INTERACTIVE DEPENDENCY GRAPH STATE ===
  interface GraphNode {
    id: string;
    label: string;
    subtitle: string;
    type: "pr" | "service" | "branch" | "current";
    status: "synced" | "diverged" | "building" | "unknown";
    lagCommits: number;
    x?: number;
    y?: number;
  }

  interface GraphEdge {
    from: string;
    to: string;
    animated: boolean;
  }

  const [rawGraphNodes, setRawGraphNodes] = useState<Omit<GraphNode, "x" | "y">[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isFlowActive, setIsFlowActive] = useState<boolean>(true);
  const [graphFilter, setGraphFilter] = useState<"all" | "services" | "prs">("all");

  // Init/Update graph whenever current active PR targets change
  useEffect(() => {
    if (!pr) return;

    const parentBranch = pr.branch.includes("/") ? pr.branch.split("/")[0] : "main";

    const baseNodes: Omit<GraphNode, "x" | "y">[] = [
      {
        id: "parent",
        label: parentBranch,
        subtitle: "Target Branch",
        type: "branch",
        status: "synced",
        lagCommits: 0
      },
      {
        id: "root",
        label: pr.branch,
        subtitle: `${pr.id} (Source)`,
        type: "current",
        status: "building",
        lagCommits: 0
      }
    ];

    const baseEdges: GraphEdge[] = [
      { from: "parent", to: "root", animated: true }
    ];

    // Derive downstream nodes generically from the PR's changed files and type
    const files = pr.changedFiles ?? [];
    const lower = pr.title.toLowerCase();
    const hasAuth   = files.some(f => f.includes("auth")) || lower.includes("auth") || lower.includes("login") || lower.includes("token");
    const hasFront  = files.some(f => f.includes("src/") || f.includes("component")) || pr.type === "FEATURE";
    const hasApi    = files.some(f => f.includes("server") || f.includes("route") || f.includes("api"));
    const hasData   = files.some(f => f.includes("db") || f.includes("sql") || f.includes("schema"));

    const downstreamPool: Array<Omit<GraphNode, "x" | "y">> = [];
    if (hasAuth)  downstreamPool.push({ id: "d-auth",  label: "auth-gateway",  subtitle: "Authentication Service", type: "service", status: "diverged", lagCommits: 2 });
    if (hasFront) downstreamPool.push({ id: "d-ui",    label: "frontend-ui",   subtitle: "React Client Bundle",   type: "service", status: "synced",   lagCommits: 0 });
    if (hasApi)   downstreamPool.push({ id: "d-api",   label: "api-gateway",   subtitle: "Central Route Ingress", type: "service", status: "synced",   lagCommits: 0 });
    if (hasData)  downstreamPool.push({ id: "d-data",  label: "data-layer",    subtitle: "DB Migration Worker",   type: "service", status: "diverged", lagCommits: 1 });
    // Always include at least one node
    if (downstreamPool.length === 0) {
      downstreamPool.push({ id: "d-core", label: "core-service", subtitle: "Primary Service", type: "service", status: "synced", lagCommits: 0 });
    }

    downstreamPool.slice(0, 3).forEach(node => {
      baseNodes.push(node);
      baseEdges.push({ from: "root", to: node.id, animated: node.status === "diverged" });
    });

    setRawGraphNodes(baseNodes);
    setGraphEdges(baseEdges);
    setSelectedNodeId("root");
  }, [pr?.id]);

  const handleSimulateNewNode = () => {
    const servicePool = [
      { label: "search-index-sync", subtitle: "ElasticSearch Feed", type: "service" as const },
      { label: "email-sender-daemon", subtitle: "SES Mailer Worker", type: "service" as const },
      { label: "audit-logger-stream", subtitle: "Kafka Audit Sink", type: "service" as const },
      { label: "metrics-collector", subtitle: "Prometheus Exporter", type: "service" as const },
      { label: "notification-dispatcher", subtitle: "PR-1250 (In Queue)", type: "pr" as const }
    ];

    const unusedPool = servicePool.filter(p => !rawGraphNodes.some(n => n.label === p.label));
    if (unusedPool.length === 0) {
      showToast("All simulated dependencies are already mapped.", "info");
      return;
    }

    const template = unusedPool[Math.floor(Math.random() * unusedPool.length)];
    const newId = `sim-${Date.now()}`;

    const newNode: Omit<GraphNode, "x" | "y"> = {
      id: newId,
      label: template.label,
      subtitle: template.subtitle,
      type: template.type,
      status: Math.random() > 0.45 ? "synced" : "diverged",
      lagCommits: Math.random() > 0.45 ? Math.floor(Math.random() * 4) + 1 : 0
    };

    setRawGraphNodes(prev => [...prev, newNode]);
    setGraphEdges(prev => [...prev, { from: "root", to: newId, animated: true }]);
    setSelectedNodeId(newId);
  };

  const handleSyncSelectedNode = () => {
    if (!selectedNodeId) return;
    setRawGraphNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          status: "synced",
          lagCommits: 0
        };
      }
      return n;
    }));
  };

  const getLayoutedNodes = (): GraphNode[] => {
    const parent = rawGraphNodes.find(n => n.id === "parent");
    const root = rawGraphNodes.find(n => n.id === "root");
    
    let downstreams = rawGraphNodes.filter(n => n.id !== "root" && n.id !== "parent");
    if (graphFilter === "services") {
      downstreams = downstreams.filter(n => n.type === "service");
    } else if (graphFilter === "prs") {
      downstreams = downstreams.filter(n => n.type === "pr");
    }

    const processedNodes: GraphNode[] = [];
    
    // Columns are inset from the viewBox edges (540 wide) so the fixed-width
    // node cards (125px, centered via -translate-x-1/2) never spill past the
    // container — left ≈18%, centre 50%, right ≈82%.
    if (parent) {
      processedNodes.push({ ...parent, x: 100, y: 120 });
    }
    if (root) {
      processedNodes.push({ ...root, x: 270, y: 120 });
    }

    const N = downstreams.length;
    downstreams.forEach((node, idx) => {
      let nodeY = 120;
      if (N > 1) {
        const topPadding = 35;
        const bottomPadding = 205;
        nodeY = topPadding + (idx * (bottomPadding - topPadding) / (N - 1));
      }
      processedNodes.push({
        ...node,
        x: 440,
        y: nodeY
      });
    });

    return processedNodes;
  };

  const layoutedNodes = getLayoutedNodes();

  // === Comments & Speech Recognition Core Configuration ===
  const CURRENT_USER = {
    name: "You (Reviewer)",
    handle: "@reviewer_lead",
    avatar: makeAvatarSvg("Herald User")
  };

  // Comments are persisted server-side at /api/prs/:id/comments
  const [commentsByPr, setCommentsByPr] = useState<Record<string, PRComment[]>>({});

  useEffect(() => {
    if (!pr) return;
    apiFetch(`/api/prs/${pr.id}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then((comments: PRComment[]) => {
        setCommentsByPr(prev => ({ ...prev, [pr.id]: comments }));
      })
      .catch(() => {});
  }, [pr?.id]);

  const [isListening, setIsListening] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recognitionInstance, setRecognitionInstance] = useState<any>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  // === Verbal notes localStorage autosave and recovery ===
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const commentTextRef = useRef(commentText);

  useEffect(() => {
    commentTextRef.current = commentText;
  }, [commentText]);

  // Load draft when PR changes
  useEffect(() => {
    if (!pr) return;
    const saved = localStorage.getItem(`verbal_note_draft_${pr.id}`);
    if (saved) {
      setCommentText(saved);
      setLastSavedTime("Draft loaded");
    } else {
      setCommentText("");
      setLastSavedTime(null);
    }

    // Save current text before PR switches or on unmount
    return () => {
      const text = commentTextRef.current;
      if (text.trim() && pr) {
        localStorage.setItem(`verbal_note_draft_${pr.id}`, text);
      } else if (pr) {
        localStorage.removeItem(`verbal_note_draft_${pr.id}`);
      }
    };
  }, [pr?.id]);

  // Autosave interval every 5 seconds
  useEffect(() => {
    if (!pr) return;

    const interval = setInterval(() => {
      const text = commentTextRef.current;
      const savedInStorage = localStorage.getItem(`verbal_note_draft_${pr.id}`) || "";

      if (text.trim()) {
        if (text !== savedInStorage) {
          localStorage.setItem(`verbal_note_draft_${pr.id}`, text);
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLastSavedTime(`Autosaved at ${timeStr}`);
        }
      } else {
        if (savedInStorage) {
          localStorage.removeItem(`verbal_note_draft_${pr.id}`);
          setLastSavedTime(null);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pr?.id]);

  const startSpeechRecognition = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      setRecognitionError("Speech Recognition is not supported in this browser. Try Chrome/Safari, or write manually.");
      showToast("Speech recognition is not supported in this browser. Please use Chrome or write manually.", "warning");
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setRecognitionError(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setCommentText(prev => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${finalTranscript.trim()}` : finalTranscript.trim();
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event);
        if (event.error === 'not-allowed') {
          setRecognitionError("Microphone permission denied. Provide hardware bounds in secure settings.");
        } else {
          setRecognitionError(`Error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      setRecognitionInstance(recognition);
    } catch (e: any) {
      setRecognitionError(e.message || "Failed to initialize microphone connection.");
      setIsListening(false);
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionInstance) {
      recognitionInstance.stop();
      setIsListening(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !pr) return;
    const text = commentText.trim();
    try {
      const res = await apiFetch(`/api/prs/${pr.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: CURRENT_USER.name,
          handle: CURRENT_USER.handle,
          avatar: CURRENT_USER.avatar,
          text,
          is_voice_note: isListening
        })
      });
      if (res.ok) {
        const saved = await res.json() as PRComment;
        setCommentsByPr(prev => ({ ...prev, [pr.id]: [saved, ...(prev[pr.id] ?? [])] }));
      } else {
        // Optimistic local fallback so UI never blocks
        const localComment: PRComment = {
          id: `local-${Date.now()}`,
          author: CURRENT_USER.name, handle: CURRENT_USER.handle, avatar: CURRENT_USER.avatar,
          text, created_at: new Date().toISOString(), is_voice_note: isListening
        };
        setCommentsByPr(prev => ({ ...prev, [pr.id]: [localComment, ...(prev[pr.id] ?? [])] }));
      }
    } catch {
      const localComment: PRComment = {
        id: `local-${Date.now()}`,
        author: CURRENT_USER.name, handle: CURRENT_USER.handle, avatar: CURRENT_USER.avatar,
        text, created_at: new Date().toISOString(), is_voice_note: isListening
      };
      setCommentsByPr(prev => ({ ...prev, [pr.id]: [localComment, ...(prev[pr.id] ?? [])] }));
    }
    localStorage.removeItem(`verbal_note_draft_${pr.id}`);
    setLastSavedTime(null);
    setCommentText("");
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!pr) return;
    // Optimistic removal
    setCommentsByPr(prev => ({ ...prev, [pr.id]: (prev[pr.id] ?? []).filter(c => c.id !== commentId) }));
    try {
      await apiFetch(`/api/prs/${pr.id}/comments/${commentId}`, { method: "DELETE" });
    } catch { /* local removal already applied */ }
  };

  const [activePickerCommentId, setActivePickerCommentId] = useState<string | null>(null);

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    if (!pr) return;
    // Optimistic local update
    setCommentsByPr(prev => {
      const list = prev[pr.id] ?? [];
      return {
        ...prev,
        [pr.id]: list.map(c => {
          if (c.id !== commentId) return c;
          const reactions = { ...(c.reactions ?? {}) };
          const reactors = reactions[emoji] ?? [];
          const idx = reactors.indexOf(CURRENT_USER.handle);
          if (idx > -1) {
            const next = reactors.filter(h => h !== CURRENT_USER.handle);
            if (next.length === 0) delete reactions[emoji]; else reactions[emoji] = next;
          } else {
            reactions[emoji] = [...reactors, CURRENT_USER.handle];
          }
          return { ...c, reactions };
        })
      };
    });
    // Persist to server (non-blocking)
    apiFetch(`/api/prs/${pr.id}/comments/${commentId}/reactions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, handle: CURRENT_USER.handle })
    }).catch(() => {});
  };

  const [playingCommentId, setPlayingCommentId] = useState<string | null>(null);

  const handlePlayVoiceComment = (commentId: string, text: string) => {
    if ('speechSynthesis' in window) {
      if (playingCommentId === commentId) {
        window.speechSynthesis.cancel();
        setPlayingCommentId(null);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        setPlayingCommentId(null);
      };
      utterance.onerror = () => {
        setPlayingCommentId(null);
      };
      setPlayingCommentId(commentId);
      window.speechSynthesis.speak(utterance);
    } else {
      showToast("Voice synthesis is not supported in this browser.", "warning");
    }
  };

  // === Reminders & Browser Local Notifications ===
  interface PRReminder {
    id: string;
    prId: string;
    prTitle: string;
    targetTimestamp: number;
    durationText: string;
  }

  const [reminders, setReminders] = useState<PRReminder[]>([]);
  const [customDelayValue, setCustomDelayValue] = useState<string>("5");
  const [customDelayUnit, setCustomDelayUnit] = useState<"seconds" | "minutes" | "hours">("seconds");
  const [notificationPermissionState, setNotificationPermissionState] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'disabled'
  );
  const [inAppNotifications, setInAppNotifications] = useState<{id: string; title: string; body: string; prId: string}[]>([]);

  const playReminderChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.3);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, audioCtx.currentTime); // E6
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.35);
      }, 140);
    } catch (e) {
      console.warn("AudioContext tone failed:", e);
    }
  };

  const triggerReminderNotification = (reminder: PRReminder) => {
    const title = `PR Review Alert: ${reminder.prId}`;
    const desc = `Pending checklist review for: ${reminder.prTitle}`;
    
    // 1. Native Notification if allowed
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: desc,
          icon: makeAvatarSvg("Herald")
        });
      } catch (err) {
        console.warn("Native notify failed inside sandbox:", err);
      }
    }

    // 2. Play acoustic chime
    playReminderChime();

    // 3. Native in-app popup toast fallback
    const toastId = `toast-${Date.now()}-${Math.random()}`;
    setInAppNotifications(prev => [
      ...prev,
      {
        id: toastId,
        title: title,
        body: reminder.prTitle,
        prId: reminder.prId
      }
    ]);
  };

  // Timer Tick Interval Hook
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      setReminders(prev => {
        const active: PRReminder[] = [];
        const expired: PRReminder[] = [];
        
        prev.forEach(r => {
          if (r.targetTimestamp <= now) {
            expired.push(r);
          } else {
            active.push(r);
          }
        });

        if (expired.length > 0) {
          expired.forEach(r => {
            triggerReminderNotification(r);
          });
        }

        return active;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast("Browser notifications are not enabled. Allow notifications in your browser settings.", "warning");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermissionState(permission);
    } catch (err) {
      try {
        Notification.requestPermission((p) => setNotificationPermissionState(p));
      } catch (e) {
        setNotificationPermissionState('denied');
      }
    }
  };

  const scheduleReminder = (seconds: number, label: string) => {
    if (!pr) return;
    
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestNotificationPermission();
    }

    const newReminder: PRReminder = {
      id: `rem-${Date.now()}-${Math.random()}`,
      prId: pr.id,
      prTitle: pr.title,
      targetTimestamp: Date.now() + (seconds * 1000),
      durationText: label
    };

    setReminders(prev => [...prev, newReminder]);
  };

  const cancelReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  if (!pr) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F3F2F1] dark:bg-slate-950 text-center min-h-[500px] transition-colors">
        <div className="relative group mb-4">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#0078D4]/10 to-teal-500/10 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
          <img
            src={conciergeMascot}
            alt="HERALD Mascot Robot Helper"
            className="relative w-36 h-36 object-contain drop-shadow-md select-none transition-transform duration-300 hover:scale-105"
            referrerPolicy="no-referrer"
          />
        </div>
        <h3 className="text-lg font-bold text-[#201F1E] dark:text-slate-100">No Release Target Selected</h3>
        <p className="text-sm text-[#605E5C] dark:text-slate-400 max-w-sm mt-1">
          Select an active pull request from the Release Dashboard or trigger a manual rollout to begin.
        </p>
        <button 
          onClick={onBackToDashboard}
          className="mt-4 px-4 py-2 bg-[#0078d4] text-white rounded font-bold text-xs hover:bg-primary transition-colors cursor-pointer"
        >
          View Dashboard
        </button>
      </div>
    );
  }

  const handleApproveAndRelease = async () => {
    if (!isVerified) {
      showToast("Please check the safety gate: verify all artifacts before release.", "warning");
      return;
    }
    
    setIsDeploying(true);
    try {
      await onApprovePr(pr.id, isVerified);
      setIsDeploying(false);
      setShowSuccessOverlay(true);
    } catch (err) {
      setIsDeploying(false);
      showToast("Release failed to complete — check server logs.", "error");
    }
  };

  const exportToMarkdown = () => {
    if (!pr) return;
    
    const traceSection = pr.reasoningTrace?.map((step, idx) => {
      return `${idx + 1}. **${step.title}** [${step.status.toUpperCase()}]\n   ${step.description}`;
    }).join('\n') || "No reasoning trace checkpoints generated.";

    const mdContent = `# Release Workspace: ${pr.id} - ${pr.title}

## Metadata
- **Author:** ${pr.authorName} (${pr.authorHandle})
- **Release Version:** ${pr.version}
- **Type:** ${pr.type}
- **Branch:** ${pr.branch}
- **Risk Level:** ${pr.risk} - ${pr.riskDetail}
- **Current Status:** ${pr.status}
- **File Changes:** ${pr.filesChanged} files changed
- **Impacted Methods:** ${pr.methodsImpacted} methods impacted

## Description
${pr.description}

## AI Reasoning Trace Checkpoints
${traceSection}

## Code Analysis & Changelog
\`\`\`markdown
${pr.changelog}
\`\`\`

## Communication & Teams Broadcast Notification Preview
\`\`\`text
${pr.teamsPost}
\`\`\`

---
*Report generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}*
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${pr.id}_release_summary.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const exportToPDF = () => {
    if (!pr) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast("Could not open export window — please allow popups for this site.", "warning");
      return;
    }

    // Escape all user-derived strings injected into the popup DOM to prevent XSS
    const esc = (s: string) => s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");

    const traceStepsHtml = pr.reasoningTrace?.map((step) => {
      let statusColor = '#0078D4';
      if (step.status === 'success') statusColor = '#107C10';
      if (step.status === 'warning') statusColor = '#D83B01';
      if (step.status === 'error') statusColor = '#A4262C';

      return `
        <div class="trace-step" style="border-left: 3px solid ${statusColor};">
          <div class="step-title" style="color: ${statusColor};">${step.title}</div>
          <div class="step-desc">${step.description}</div>
        </div>
      `;
    }).join('') || '<p style="color: #605E5C; font-style: italic;">No reasoning trace checkpoints available.</p>';

    const cleanChangelog = pr.changelog
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const cleanTeamsPost = pr.teamsPost
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${pr.id} Release Workspace Analysis</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
            
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #201F1E;
              line-height: 1.6;
              padding: 40px;
              max-width: 900px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            
            .header-bar {
              border-bottom: 2px solid #EDEBE9;
              padding-bottom: 24px;
              margin-bottom: 30px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            
            .pr-id-pill {
              background-color: #0078D4;
              color: #ffffff;
              font-size: 11px;
              font-weight: 800;
              padding: 4px 10px;
              border-radius: 4px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: inline-block;
              margin-bottom: 12px;
            }
            
            .title-text {
              font-size: 26px;
              font-weight: 800;
              color: #111;
              margin: 0 0 8px 0;
              letter-spacing: -0.5px;
            }
            
            .subtitle-text {
              font-size: 13px;
              color: #605E5C;
              margin: 0;
              font-weight: 500;
            }
            
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 14px;
              margin-bottom: 30px;
              background-color: #F3F2F1;
              border: 1px solid #EDEBE9;
              padding: 18px;
              border-radius: 8px;
            }
            
            .meta-item {
              font-size: 13px;
              font-weight: 500;
              color: #323130;
            }
            
            .meta-label {
              font-weight: 700;
              color: #605E5C;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.5px;
              display: block;
              margin-bottom: 2px;
            }
            
            .section {
              margin-bottom: 35px;
            }
            
            .section-title {
              font-size: 13px;
              font-weight: 800;
              color: #0078D4;
              text-transform: uppercase;
              letter-spacing: 1px;
              border-bottom: 1px solid #EDEBE9;
              padding-bottom: 6px;
              margin-bottom: 16px;
            }
            
            .description-box {
              font-size: 14px;
              color: #323130;
              background-color: #FAF9F8;
              border-left: 4px solid #0078D4;
              padding: 16px;
              border-radius: 0 6px 6px 0;
              margin-bottom: 24px;
            }
            
            .trace-step {
              padding: 12px 16px;
              margin-bottom: 12px;
              background-color: #FAF9F8;
              border-radius: 0 6px 6px 0;
            }
            
            .step-title {
              font-size: 13px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }
            
            .step-desc {
              font-size: 12px;
              color: #605E5C;
              font-weight: 500;
            }
            
            .code-block {
              background-color: #201F1E;
              color: #F3F2F1;
              padding: 20px;
              border-radius: 8px;
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
              line-height: 1.6;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-all;
              border: 1px solid #323130;
            }
            
            .teams-box {
              background-color: #F3F2F1;
              border: 1px solid #EDEBE9;
              padding: 16px;
              border-radius: 6px;
              font-size: 13px;
              color: #323130;
              white-space: pre-line;
            }
            
            .footer-note {
              border-top: 1px solid #EDEBE9;
              padding-top: 20px;
              margin-top: 50px;
              text-align: center;
              font-size: 11px;
              color: #a19f9d;
              font-weight: 500;
            }
            
            @media print {
              body {
                padding: 0;
              }
              .page-break {
                page-break-before: always;
              }
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div>
              <span class="pr-id-pill" style="background-color: ${pr.type === 'FEATURE' ? '#0078D4' : pr.type === 'BUGFIX' ? '#9B30FF' : '#605E5C'};">${esc(pr.type)}</span>
              <h1 class="title-text">${esc(pr.id)}: ${esc(pr.title)}</h1>
              <p class="subtitle-text">Analyzed on ${new Date().toLocaleDateString()} • Created by <strong>${esc(pr.authorName)} (${esc(pr.authorHandle)})</strong></p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px; font-weight: bold; color: #107C10; background-color: #DEECF9; border: 1px solid #DEECF9; padding: 4px 8px; border-radius: 4px; display: inline-block;">${esc(pr.status.toUpperCase())}</div>
              <p style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #605E5C; margin: 6px 0 0 0;">${esc(pr.version)}</p>
            </div>
          </div>
          
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Branch Source</span>
              <code>${esc(pr.branch)}</code>
            </div>
            <div class="meta-item">
              <span class="meta-label">Risk Assessment Profile</span>
              <strong style="color: ${pr.risk === 'High' ? '#A4262C' : pr.risk === 'Medium' ? '#D83B01' : '#107C10'}; text-transform: uppercase;">${esc(pr.risk)} Profile</strong>
            </div>
            <div class="meta-item">
              <span class="meta-label">Scope Magnitude</span>
              ${pr.filesChanged} file${pr.filesChanged === 1 ? '' : 's'} changed • ~${pr.methodsImpacted} method${pr.methodsImpacted === 1 ? '' : 's'} impacted (estimated)
            </div>
            <div class="meta-item">
              <span class="meta-label">Deployment Status</span>
              <strong style="text-transform: uppercase;">${esc(pr.status)}</strong>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Core Pull Request Description</div>
            <div class="description-box">
              ${esc(pr.description)}
            </div>
          </div>

          <div class="section">
            <div class="section-title">AI Reasoning Trace Checkpoints</div>
            <div style="margin-top: 10px;">
              ${traceStepsHtml}
            </div>
          </div>
          
          <div class="section page-break">
            <div class="section-title">Automated Changelog Snippet</div>
            <pre class="code-block">${cleanChangelog}</pre>
          </div>
          
          <div class="section">
            <div class="section-title">Teams Stream Broadcast Notification Preview</div>
            <div class="teams-box">
              ${cleanTeamsPost}
            </div>
          </div>
          
          <div class="footer-note">
            Generated by Herald Release Concierge · ${new Date().toISOString()}<br>
            © ${new Date().getFullYear()} Herald. For internal release review use only.
          </div>
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setShowExportMenu(false);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#F3F2F1] dark:bg-slate-950 h-screen overflow-hidden relative transition-colors duration-150">
      
      {/* Floating In-App Toast Notification fallbacks */}
      {inAppNotifications.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 min-w-[320px] max-w-sm animate-in fade-in slide-in-from-bottom-5">
          {inAppNotifications.map((toast) => (
            <div 
              key={toast.id}
              className="bg-slate-900 border border-slate-750 text-white rounded-lg p-4 shadow-2xl flex gap-3 select-none relative group border-l-4 border-l-blue-500 overflow-hidden text-left"
            >
              <div className="bg-blue-900/50 text-blue-400 p-2 rounded-full h-8 w-8 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <span className="text-[10px] font-bold text-blue-405 block uppercase tracking-widest font-mono">REMINDER TRIGGERED</span>
                <h4 className="text-xs font-bold text-white mt-0.5">{toast.title}</h4>
                <p className="text-[11px] text-slate-350 mt-1 line-clamp-2 leading-relaxed">{toast.body}</p>
              </div>
              <button
                onClick={() => setInAppNotifications(prev => prev.filter(t => t.id !== toast.id))}
                className="absolute top-2 right-2 text-slate-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer text-xs font-bold"
                title="Dismiss alert"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Breadcrumb Tab Bar (Shown in Screen 2) */}
      <div className="h-10 border-b border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 select-none transition-colors relative">
        <div className="flex items-center gap-2">
          <button 
            onClick={onBackToDashboard}
            className="text-[11px] font-bold text-[#605E5C] dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            RELEASES
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[11px] font-bold text-primary dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded uppercase tracking-wider">
            REVIEW_WORKSPACE_{pr.id.replace(/-/, '_')}
          </span>
        </div>

        {/* Dynamic Export Workspace Summary Menu */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-[10px] sm:text-[11px] font-extrabold text-[#201F1E] dark:text-slate-200 border border-[#EDEBE9] dark:border-slate-750 rounded transition-colors duration-150 cursor-pointer"
          >
            <Download className="w-3 h-3 text-primary dark:text-blue-400" />
            <span>EXPORT WORKSPACE</span>
            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>

          {showExportMenu && (
            <>
              {/* Invisible Backdrop Scrim for secure click-away toggles */}
              <div 
                className="fixed inset-0 z-30 cursor-default" 
                onClick={() => setShowExportMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800 shadow-xl z-45 py-1 text-xs transition-all animate-in fade-in slide-in-from-top-1 duration-100">
                <div className="px-3 py-1.5 text-[9px] font-extrabold text-[#605E5C] dark:text-slate-500 uppercase tracking-widest border-b border-[#EDEBE9]/60 dark:border-slate-800/60">
                  Select Export Format
                </div>
                
                <button
                  onClick={exportToMarkdown}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-850 flex items-center gap-2.5 text-[#201F1E] dark:text-slate-200 font-medium transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <div>
                    <span className="block font-bold text-[11px]">Markdown Document (.md)</span>
                    <span className="block text-[9px] text-[#605E5C] dark:text-slate-400 font-normal">Offline Git-friendly report</span>
                  </div>
                </button>

                <button
                  onClick={exportToPDF}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-850 flex items-center gap-2.5 text-[#201F1E] dark:text-slate-200 font-medium transition-colors cursor-pointer border-t border-gray-100 dark:border-slate-800/50"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <div>
                    <span className="block font-bold text-[11px]">System PDF Audit Report</span>
                    <span className="block text-[9px] text-[#605E5C] dark:text-slate-400 font-normal">Print-optimized file export</span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Workspace Three Panes Container (Shown in Screen 2) */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden p-3 gap-3">
        
        {/* Left/Center Column Stack (Files, details & risk assessment cards) */}
        <div className="flex-[1.5] flex flex-col gap-3 min-w-0 overflow-y-auto">
          
          {/* PR Details Header Card */}
          <section className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-6 flex flex-col gap-4 shadow-sm transition-colors">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    pr.type === 'FEATURE' 
                      ? "bg-[#0078D4]/5 text-[#0078D4] border-[#0078D4]/15" 
                      : pr.type === 'BUGFIX'
                      ? "bg-[#9B30FF]/5 text-[#9B30FF] border-[#9B30FF]/15"
                      : "bg-gray-500/5 text-gray-600 border-gray-500/15"
                  }`}>
                    {pr.type}
                  </span>
                  <span className="text-[#605E5C] dark:text-slate-400 text-xs font-semibold">
                    {pr.id} • Created by <span className="text-[#201F1E] dark:text-slate-200 font-bold">{pr.authorHandle}</span>
                  </span>
                </div>
                <h1 className="text-xl font-bold text-[#201F1E] dark:text-slate-100 tracking-tight">{pr.title}</h1>
              </div>

              <div className="flex flex-col items-end shrink-0 sm:text-right">
                <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest leading-none ${
                  pr.status === "Released"
                    ? "bg-[#107C10]/10 text-[#107C10] border border-[#107C10]/20"
                    : pr.status === "In Progress"
                    ? "bg-[#0078D4]/10 text-[#0078D4] border border-[#0078D4]/20"
                    : "bg-[#D83B01]/10 text-[#D83B01] border border-[#D83B01]/20"
                }`}>
                  {pr.status === "Released" ? "Deployed" : pr.status === "In Progress" ? "In Progress" : "Pending Review"}
                </span>
                <span className="text-xs text-[#605E5C] dark:text-slate-400 mt-1.5 font-mono">{pr.version}</span>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed bg-[#f9f9f9] dark:bg-slate-800/50 p-4 rounded-lg font-sans border border-[#EDEBE9]/50 dark:border-slate-800 transition-colors bg-opacity-70">
              {pr.description}
            </p>

            {/* Workload Balancer: Dynamic Reviewer Selection control */}
            <div className="flex flex-col sm:flex-row border-t border-gray-100 dark:border-slate-800/60 pt-4 items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#0078D4] dark:text-blue-400 shrink-0 animate-pulse" />
                <span className="font-extrabold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest text-[10px]">
                  Assigned Reviewer:
                </span>
                <span className="font-bold text-[#201F1E] dark:text-slate-200 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  {pr.reviewer || "Unassigned"}
                </span>
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono hidden sm:inline">
                  Redistribute Workload:
                </span>
                <select
                  value={pr.reviewer || ""}
                  onChange={async (e) => {
                    if (onUpdateReviewer) {
                      await onUpdateReviewer(pr.id, e.target.value);
                    }
                  }}
                  className="w-full sm:w-auto text-xs bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm hover:border-gray-300 dark:hover:border-slate-650"
                >
                  <option value="" disabled>-- Select Team Member --</option>
                  <option value="Sarah Jenkins">Sarah Jenkins</option>
                  <option value="Alex Rover">Alex Rover</option>
                  <option value="Emily Diaz">Emily Diaz</option>
                  <option value="Carter Smith">Carter Smith</option>
                </select>
              </div>
            </div>
          </section>

          {/* Impact Summary Bento Grid Section */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
            
            {/* Risk Assessment Block */}
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-5 flex flex-col gap-4 shadow-sm justify-between transition-colors">
              <div>
                <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3.5">
                  <AlertTriangle className="w-4 h-4 text-[#D83B01]" />
                  Risk Assessment
                </h3>
                
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full border-4 ${
                    pr.risk === 'High' 
                      ? 'border-[#A4262C] text-[#A4262C]' 
                      : pr.risk === 'Medium'
                      ? 'border-[#D83B01] text-[#D83B01]'
                      : 'border-[#107C10] text-[#107C10]'
                  } flex items-center justify-center font-extrabold text-lg bg-gray-50 dark:bg-slate-800 shrink-0`}>
                    {pr.risk[0]}
                  </div>
                  <div>
                    <span className={`text-xs font-bold tracking-wider uppercase ${
                      pr.risk === 'High' 
                        ? 'text-[#A4262C]' 
                        : pr.risk === 'Medium'
                        ? 'text-[#D83B01]'
                        : 'text-[#107C10]'
                    }`}>
                      {pr.risk} Risk Profile
                    </span>
                    <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5 font-medium leading-tight">
                      {pr.riskDetail || "Analyzed against current repositories."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#EDEBE9] dark:border-slate-800 mt-3">
                <p className="text-[11px] text-gray-500 dark:text-slate-400 italic leading-relaxed">
                  "Minimum overhead impact on legacy systems; highly optimized array integration."
                </p>
              </div>

            </div>

            {/* Change Magnitude Block */}
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-5 flex flex-col gap-4 shadow-sm justify-between transition-colors">
              <div>
                <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-3.5">
                  <BarChart4 className="w-4 h-4 text-primary" />
                  Change Magnitude
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded border border-[#EDEBE9] dark:border-slate-800 text-center transition-colors">
                    <p className="text-[9px] text-[#605E5C] dark:text-slate-400 uppercase tracking-wider font-bold">Files Changed</p>
                    <p className="text-2xl font-extrabold text-[#005faa] dark:text-blue-400 mt-1">{pr.filesChanged}</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded border border-[#EDEBE9] dark:border-slate-800 text-center transition-colors">
                    <p className="text-[9px] text-[#605E5C] dark:text-slate-400 uppercase tracking-wider font-bold">Methods Impacted <span className="normal-case font-normal text-gray-400">(est.)</span></p>
                    <p className="text-2xl font-extrabold text-[#005faa] dark:text-blue-400 mt-1">~{pr.methodsImpacted}</p>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-center text-[#605E5C] dark:text-slate-400 font-semibold bg-[#eeeeee]/40 dark:bg-slate-800/20 py-1.5 rounded border border-[#EDEBE9]/30 dark:border-slate-800/30 transition-colors">
                Static analysis sweeps completed
              </div>

            </div>

          </section>

          {/* Re-analyze Action Trigger Block */}
          <button
            disabled={isAnalyzing}
            onClick={() => onAnalyzePr(pr.id)}
            className="w-full bg-[#f3f3f4] dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 py-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border border-gray-300 dark:border-slate-800 active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
            )}
            {isAnalyzing ? "Running AI analysis pipeline..." : "Re-trigger AI Analysis & Notes Generation"}
          </button>

          {/* Interactive Dependency Tree & Impact Map Section */}
          <section className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-5 shadow-sm transition-colors flex flex-col gap-4 text-left">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#EDEBE9] dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-purple-600" />
                  Dependency Tree & Impact Map
                </h3>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1 font-medium">
                  Live topology of release targets, adjacent PRs, and consuming downstream systems.
                </p>
              </div>
              
              <button
                onClick={handleSimulateNewNode}
                className="text-[10px] bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-950/60 text-purple-705 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 px-2.5 py-1 rounded-md font-bold transition-all uppercase flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
                title="Simulate injection of a new downstream consumer service"
              >
                <Sparkles className="w-3 h-3" />
                Inject Service
              </button>
            </div>

            {/* Sub-toolbar for filters & telemetry flows */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#fafafa] dark:bg-slate-950/25 p-2 rounded-lg border border-gray-150 dark:border-slate-800/60">
              {/* Filter Chips */}
              <div className="flex items-center gap-1">
                {(["all", "services", "prs"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      setGraphFilter(f);
                      setSelectedNodeId("root");
                    }}
                    className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider transition-all cursor-pointer ${
                      graphFilter === f
                        ? "bg-purple-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-slate-850 text-gray-500 dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-200"
                    }`}
                  >
                    {f === "all" ? "All Nodes" : f === "services" ? "Only Services" : "Only PRs"}
                  </button>
                ))}
              </div>

              {/* Pulse Switch */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFlowActive(!isFlowActive)}
                  className={`text-[9px] font-extrabold px-2 py-1 rounded border transition-all uppercase tracking-wider flex items-center gap-1.5 cursor-pointer ${
                    isFlowActive
                      ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border-emerald-200 dark:border-emerald-800"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-500 border-gray-250 dark:border-slate-700"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isFlowActive ? "bg-emerald-500 animate-ping" : "bg-gray-400"}`} />
                  <span>Telemetry Pulse: {isFlowActive ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>

            {/* Core Diagram Area */}
            <div className="relative w-full h-[240px] bg-[#FAF9F8] dark:bg-slate-950/50 rounded-xl border border-gray-150 dark:border-slate-850 overflow-hidden select-none">
              
              {/* Dynamic S-curve Connections SVG Canvas */}
              <svg viewBox="0 0 540 240" className="absolute inset-0 w-full h-full pointer-events-none z-10">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 2.5 L 6.5 5 L 0 7.5 z" className="fill-purple-600/30 dark:fill-slate-650" />
                  </marker>
                </defs>

                {graphEdges.map((edge, idx) => {
                  const src = layoutedNodes.find(n => n.id === edge.from);
                  const dest = layoutedNodes.find(n => n.id === edge.to);
                  if (!src || !dest) return null;

                  const dx = Math.abs(dest.x! - src.x!) * 0.45;
                  const dPath = `M ${src.x} ${src.y} C ${src.x! + dx} ${src.y}, ${dest.x! - dx} ${dest.y}, ${dest.x} ${dest.y}`;

                  const isEdgeHighlighted = selectedNodeId === edge.from || selectedNodeId === edge.to;

                  return (
                    <g key={idx}>
                      <path
                        d={dPath}
                        fill="none"
                        stroke={isEdgeHighlighted ? "#8b5cf6" : "#cbd5e1"}
                        strokeWidth={isEdgeHighlighted ? 1.8 : 1}
                        className={`transition-all duration-300 ${
                          isFlowActive && edge.animated ? "animate-dash-flow opacity-95" : "opacity-40"
                        }`}
                        style={{
                          stroke: isEdgeHighlighted ? undefined : "var(--color-slate-705, currentColor)"
                        }}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Absolutely Positioned HTML Nodes mapped onto the SVG viewbox */}
              <div className="absolute inset-0 z-20">
                {layoutedNodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const leftPercentage = (node.x! / 540) * 100;
                  const topPercentage = (node.y! / 240) * 100;

                  let iconElement = <GitBranch className="w-3.5 h-3.5" />;
                  let nodeBg = "bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 border-gray-200 dark:border-slate-800";
                  
                  if (node.type === "current") {
                    iconElement = <Rocket className="w-3.5 h-3.5 text-blue-500 animate-pulse" />;
                    nodeBg = isSelected 
                      ? "bg-blue-600 border-blue-450 text-white shadow-lg shadow-blue-500/20 ring-2 ring-blue-400" 
                      : "bg-blue-50 dark:bg-blue-950/40 border-blue-400/55 text-[#0078D4] dark:text-blue-300";
                  } else if (node.type === "branch") {
                    iconElement = <Network className="w-3.5 h-3.5 text-slate-500" />;
                    nodeBg = isSelected 
                      ? "bg-slate-800 border-slate-650 text-white shadow-lg ring-2 ring-slate-500" 
                      : "bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300";
                  } else if (node.type === "service") {
                    iconElement = <Server className="w-3.5 h-3.5 text-purple-500" />;
                    nodeBg = isSelected 
                      ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/25 ring-2 ring-purple-500" 
                      : "bg-purple-100/10 dark:bg-purple-950/15 border-purple-500/40 text-purple-700 dark:text-purple-300";
                  } else if (node.type === "pr") {
                    iconElement = <FileText className="w-3.5 h-3.5 text-[#107C10]" />;
                    nodeBg = isSelected 
                      ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500" 
                      : "bg-emerald-100/10 dark:bg-emerald-950/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
                  }

                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{
                        left: `${leftPercentage}%`,
                        top: `${topPercentage}%`,
                      }}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 z-20 px-3 py-1.5 rounded-lg border text-left flex items-center gap-2 max-w-[125px] w-[125px] hover:scale-105 active:scale-95 shadow-sm transition-all duration-200 cursor-pointer ${nodeBg}`}
                    >
                      <div className="shrink-0">{iconElement}</div>
                      <div className="min-w-0 pr-0.5">
                        <span className="text-[10px] font-bold block truncate tracking-tight">{node.label}</span>
                        <span className={`text-[8px] block truncate font-medium ${isSelected ? "text-white/80" : "text-gray-400 dark:text-slate-500"}`}>
                          {node.status === "diverged" ? `${node.lagCommits} Commits behind` : node.subtitle}
                        </span>
                      </div>
                      
                      {node.status === "diverged" && !isSelected && (
                        <span className="absolute -top-1 -right-0.5 w-2 h-2 rounded-full bg-amber-500 shadow animate-pulse border border-white dark:border-slate-900" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Labels overlay bottom indicators */}
              <div className="absolute bottom-2 inset-x-2 flex justify-between text-[8px] font-extrabold uppercase text-gray-400 dark:text-slate-500 tracking-wider">
                <span>← Upstream targets</span>
                <span>Branch Pipeline</span>
                <span>Downstream consumers →</span>
              </div>
            </div>

            {/* Dynamic Node Detail Inspector Panel */}
            {selectedNodeId && (
              (() => {
                const node = rawGraphNodes.find(n => n.id === selectedNodeId);
                if (!node) return null;

                return (
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-150 dark:border-slate-850 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="flex items-start gap-3 text-left">
                      <div className={`mt-0.5 p-1.5 rounded-full ${
                        node.type === "current" 
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" 
                          : node.type === "service"
                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600"
                          : node.type === "pr"
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                          : "bg-slate-100 dark:bg-slate-850 text-slate-600"
                      }`}>
                        {node.type === "branch" && <Network className="w-4 h-4" />}
                        {node.type === "current" && <Rocket className="w-4 h-4" />}
                        {node.type === "service" && <Server className="w-4 h-4" />}
                        {node.type === "pr" && <FileText className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-gray-800 dark:text-slate-200 uppercase">{node.label}</span>
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded leading-none ${
                            node.status === "synced" 
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" 
                              : node.status === "diverged"
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/25 dark:text-amber-400"
                              : "bg-blue-50 text-blue-600 dark:bg-blue-950/20"
                          }`}>
                            {node.status === "synced" ? "Aligned & Synced" : node.status === "diverged" ? "Lag commits - Diverged" : "Active Release"}
                          </span>
                        </div>
                        
                        <p className="text-[11px] text-[#605E5C] dark:text-slate-400 leading-normal mt-0.5 font-medium max-w-lg">
                          {node.type === "branch" && "The integration branch that this PR will merge code targets directly into."}
                          {node.type === "current" && `The chosen source branch for ${pr.id}. Reorganizes changed structures and evaluates risk models dynamically.`}
                          {node.type === "service" && `Downstream microservice '${node.label}' consumes this branch of code. Re-verification tests triggers on pipeline release.`}
                          {node.type === "pr" && `An adjacent pending Pull Request that contains parent references or requires files changed in ${pr.id}.`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 md:self-end">
                      {node.status === "diverged" ? (
                        <button
                          onClick={handleSyncSelectedNode}
                          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-[10px] font-extrabold uppercase tracking-wide transition-all shadow active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          ⚡ Sync & Forward-port
                        </button>
                      ) : (
                        node.id !== "root" && node.id !== "parent" && (
                          <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-900/40 uppercase">
                            ✓ Core Verified
                          </span>
                        )
                      )}
                      
                      <button
                        onClick={() => setSelectedNodeId(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 px-2.5 py-1.5 transition-colors uppercase font-bold"
                      >
                        Minimize
                      </button>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Injected style snippet for Bezier dashed path flowing animations */}
            <style>{`
              @keyframes dashMover {
                to {
                  stroke-dashoffset: -12;
                }
              }
              .animate-dash-flow {
                stroke-dasharray: 6, 3;
                animation: dashMover 0.8s linear infinite;
              }
            `}</style>

          </section>

          {/* PR REVIEW REMINDER SCHEDULER BLOCK */}
          <section className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-5 shadow-sm transition-colors flex flex-col gap-4 text-left">
            <div className="flex justify-between items-center border-b border-[#EDEBE9] dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0078D4]" />
                Review Reminders
              </h3>
              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                notificationPermissionState === 'granted' 
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                  : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
              }`}>
                {notificationPermissionState === 'granted' ? 'Native Alerts Active' : 'In-App Toasts Ready'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Form: Schedule delay */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] text-[#605E5C] dark:text-slate-400 leading-relaxed font-semibold">
                  Queue up a responsive timer reminder to review or follow up on this open pull request.
                </p>

                {/* Preset buttons row */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => scheduleReminder(5, "5 Sec")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    🚀 5s (Test)
                  </button>
                  <button
                    onClick={() => scheduleReminder(60, "1 Min")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    ⏱️ 1 Min
                  </button>
                  <button
                    onClick={() => scheduleReminder(300, "5 Min")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    ⏳ 5 Min
                  </button>
                  <button
                    onClick={() => scheduleReminder(900, "15 Min")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    ⏰ 15 Min
                  </button>
                  <button
                    onClick={() => scheduleReminder(1800, "30 Min")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    📅 30 Min
                  </button>
                  <button
                    onClick={() => scheduleReminder(3600, "1 Hr")}
                    className="py-1.5 px-2 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-[#EDEBE9] dark:border-slate-750 rounded text-[10px] font-bold text-gray-700 dark:text-slate-200 text-center transition-colors cursor-pointer"
                  >
                    🛎️ 1 Hr
                  </button>
                </div>

                {/* Custom unit entry form */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="1"
                      value={customDelayValue}
                      onChange={(e) => setCustomDelayValue(e.target.value)}
                      className="w-full text-xs text-gray-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 focus:border-primary dark:focus:border-blue-400 focus:ring-1 focus:ring-primary dark:focus:ring-blue-400 rounded p-1.5 outline-none font-sans"
                      placeholder="Amt"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={customDelayUnit}
                      onChange={(e: any) => setCustomDelayUnit(e.target.value)}
                      className="text-xs text-gray-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 focus:border-primary dark:focus:border-blue-400 rounded p-1.5 outline-none font-sans"
                    >
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      const val = parseInt(customDelayValue) || 1;
                      let secs = val;
                      if (customDelayUnit === "minutes") secs = val * 60;
                      if (customDelayUnit === "hours") secs = val * 3600;
                      scheduleReminder(secs, `${val} ${customDelayUnit[0].toUpperCase()}${customDelayUnit.substring(1, 4)}`);
                    }}
                    className="bg-[#0078D4] hover:bg-[#005faa] text-white px-3 py-1.5 rounded text-[11px] font-bold uppercase transition-colors whitespace-nowrap cursor-pointer shadow-sm"
                  >
                    Set Alert
                  </button>
                </div>

                {/* Proactive permission status block */}
                {notificationPermissionState === 'default' && (
                  <button
                    onClick={requestNotificationPermission}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold text-left flex items-center gap-1 mt-1 cursor-pointer"
                  >
                    🔒 Click to grant browser notification bounds
                  </button>
                )}
              </div>

              {/* Right list: Active reminders list */}
              <div className="flex flex-col gap-2 bg-[#fafafa] dark:bg-slate-800/40 border border-gray-200/60 dark:border-slate-800/80 rounded-lg p-3 max-h-[190px] overflow-y-auto">
                <span className="text-[10px] font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest block border-b border-gray-200/65 dark:border-slate-800/60 pb-1.5 mb-1">
                  PENDING REMINDERS ({reminders.filter(r => r.prId === pr.id).length})
                </span>

                {reminders.filter(r => r.prId === pr.id).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-4 text-gray-400 dark:text-slate-500">
                    <Clock className="w-5 h-5 mb-1.5 text-gray-300 dark:text-slate-700 animate-pulse" />
                    <span className="text-[10px] font-bold block">No active alerts scheduled</span>
                    <span className="text-[8px] mt-0.5 block">Trigger presets above for countdown feeds.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {reminders.filter(r => r.prId === pr.id).map((rem) => {
                      const secondsLeft = Math.max(0, Math.round((rem.targetTimestamp - Date.now()) / 1000));
                      let displayTime = `${secondsLeft}s`;
                      if (secondsLeft > 60) {
                        const m = Math.floor(secondsLeft / 60);
                        const s = secondsLeft % 60;
                        displayTime = `${m}m ${s}s`;
                      }

                      return (
                        <div key={rem.id} className="flex gap-2 items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-gray-100 dark:border-slate-800/80 transition-shadow hover:shadow-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shadow shrink-0" />
                            <div className="min-w-0">
                              <span className="text-[11px] font-bold text-[#201F1E] dark:text-slate-300 block truncate leading-tight">
                                Alert in {displayTime}
                              </span>
                              <span className="text-[9px] font-mono text-gray-400 dark:text-slate-500 block leading-tight">
                                Span: {rem.durationText}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => cancelReminder(rem.id)}
                            className="text-[9px] font-extrabold uppercase text-gray-400 hover:text-red-500 px-1.5 py-1 bg-gray-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/20 rounded transition-colors cursor-pointer"
                            title="Cancel reminder timer"
                          >
                            Cancel
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Audio Wave Custom Styling */}
          <style>{`
            @keyframes bounceSound {
              0%, 100% { transform: scaleY(0.3); }
              50% { transform: scaleY(1); }
            }
            .audio-wave-bar {
              animation: bounceSound 1.2s ease-in-out infinite;
              transform-origin: center;
            }
            .delay-100 { animation-delay: 100ms; }
            .delay-200 { animation-delay: 200ms; }
            .delay-300 { animation-delay: 300ms; }
            .delay-400 { animation-delay: 400ms; }
            .delay-500 { animation-delay: 500ms; }
          `}</style>

          {/* PR VERBAL NOTES & DISCUSSION BOARD */}
          <section className="bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800/80 p-5 shadow-sm transition-colors flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-[#EDEBE9] dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Review Comments & Verbal Notes
              </h3>
              <span className="text-[10px] font-bold text-[#0078D4] bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded uppercase">
                {(commentsByPr[pr.id] || []).length} Threaded {(commentsByPr[pr.id] || []).length === 1 ? 'Note' : 'Notes'}
              </span>
            </div>

            {/* Speech Recorder Toolbar Section */}
            <div className={`p-4 rounded-lg border flex flex-col gap-3 transition-all duration-200 ${
              isListening 
                ? 'bg-red-50/50 border-red-200 dark:bg-red-950/10 dark:border-red-900/40' 
                : 'bg-[#fafafa] dark:bg-slate-800/40 border-[#EDEBE9] dark:border-slate-800'
            }`}>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                      isListening 
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse scale-105' 
                        : 'bg-primary hover:bg-[#005faa] text-white'
                    } cursor-pointer shrink-0`}
                    title={isListening ? "Stop voice transcription" : "Start verbal note voice recorder"}
                  >
                    {isListening ? (
                      <MicOff className="w-5 h-5 animate-spin" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </button>

                  <div>
                    <span className="text-xs font-bold text-[#201F1E] dark:text-slate-200 block uppercase tracking-wider">
                      {isListening ? "RECORDING SPEECH ACTIVELY..." : "RECORD VERBAL FEEDBACK"}
                    </span>
                    <span className="text-[11px] text-[#605E5C] dark:text-slate-400 block font-medium">
                      {isListening 
                        ? "Transcribing your speech in real-time. Speak now." 
                        : "Click the mic to speak observations. Saved instantly."}
                    </span>
                  </div>
                </div>

                {/* Animated Waveform Visualizer */}
                {isListening && (
                  <div className="flex items-center gap-1 h-6 px-1 shrink-0">
                    <div className="w-1 h-3 bg-red-600 rounded-full audio-wave-bar delay-100" />
                    <div className="w-1 h-5 bg-red-600 rounded-full audio-wave-bar delay-300" />
                    <div className="w-1 h-6 bg-red-600 rounded-full audio-wave-bar delay-500" />
                    <div className="w-1 h-4 bg-red-600 rounded-full audio-wave-bar delay-200" />
                    <div className="w-1 h-2 bg-red-600 rounded-full audio-wave-bar delay-400" />
                  </div>
                )}
              </div>

              {recognitionError && (
                <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded border border-red-100 dark:border-red-950/40">
                  {recognitionError}
                </div>
              )}

              {/* Text comment entry */}
              <div className="relative">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={isListening ? "Listening..." : "Type review notes manually or record via mic above..."}
                  className="w-full min-h-[72px] text-xs font-sans text-gray-800 dark:text-slate-100 placeholder-gray-400 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 focus:border-primary dark:focus:border-blue-400 focus:ring-1 focus:ring-primary dark:focus:ring-blue-400 rounded-lg p-3 outline-none resize-none transition-all duration-150 shadow-inner"
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">
                    {commentText.length} characters
                  </span>
                  {lastSavedTime && (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wide flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/40 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      {lastSavedTime}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {commentText && (
                    <button
                      onClick={() => setCommentText("")}
                      className="px-3 py-1.5 text-[10px] uppercase font-bold text-gray-500 hover:text-red-500 bg-transparent hover:bg-gray-100 dark:hover:bg-slate-800/60 rounded-md transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim()}
                    className="px-4 py-1.5 bg-primary hover:bg-[#005faa] disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 text-white rounded-md text-[10px] font-extrabold uppercase tracking-wider transition-colors duration-150 cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <span>Save Note</span>
                  </button>
                </div>
              </div>

            </div>

            {/* List of comments / Notes Feed */}
            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {!(commentsByPr[pr.id] || []).length ? (
                <div className="text-center py-6 border border-dashed border-gray-200 dark:border-slate-800 rounded-lg">
                  <MessageSquare className="w-8 h-8 text-gray-300 dark:text-slate-700 mx-auto mb-2 animate-pulse" />
                  <p className="text-[11px] font-bold text-[#605E5C] dark:text-slate-400">Collaborative board is currently empty</p>
                  <p className="text-[9px] text-[#201F1E] dark:text-slate-500 mt-0.5">Use the microphone recorder to document review notes instantly.</p>
                </div>
              ) : (
                (commentsByPr[pr.id] || []).map((comment) => (
                  <div key={comment.id} className="p-3 bg-[#fafafa] dark:bg-slate-850 border border-gray-100 dark:border-slate-800/60 rounded-lg flex gap-3 transition-colors duration-150 hover:bg-gray-50/80 dark:hover:bg-slate-800/40 relative group">
                    <img
                      src={comment.avatar || ""}
                      alt={comment.author}
                      className="w-7 h-7 rounded-full shadow-sm shrink-0 border border-white dark:border-slate-900 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-extrabold text-[#201F1E] dark:text-slate-200">{comment.author}</span>
                          <span className="text-[9px] font-mono text-[#605E5C] dark:text-slate-500">{comment.handle}</span>
                        </div>
                        <span className="text-[9px] text-gray-400 dark:text-slate-500 font-medium shrink-0">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-xs text-gray-700 dark:text-slate-300 font-sans mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
                        {comment.text}
                      </p>

                      {/* Interactive audio play button */}
                      {comment.is_voice_note && (
                        <div className="mt-2.5 flex items-center gap-2.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100/40 dark:border-blue-900/20 p-1.5 rounded-md max-w-sm">
                          <button
                            onClick={() => handlePlayVoiceComment(comment.id, comment.text)}
                            className="w-6 h-6 rounded-full bg-[#0078D4] text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm"
                            title={playingCommentId === comment.id ? "Stop Voice Feed" : "Listen to Verbal Comment"}
                          >
                            {playingCommentId === comment.id ? (
                              <span className="flex gap-0.5 justify-center items-center h-full">
                                <span className="w-0.5 h-2.5 bg-white rounded-full animate-pulse" />
                                <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
                                <span className="w-0.5 h-1.5 bg-white rounded-full animate-pulse" />
                              </span>
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-extrabold text-[#0078D4] dark:text-blue-400 tracking-wider">SPEECH BROADCAST</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          </div>
                          
                          {playingCommentId === comment.id && (
                            <span className="text-[8px] font-mono text-[#605E5C] dark:text-slate-500 animate-pulse">Now speaking...</span>
                          )}
                        </div>
                      )}

                      {/* Comment Reaction Badges and Picker Row */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {comment.reactions && (Object.entries(comment.reactions) as [string, string[]][]).map(([emoji, reactors]) => {
                          if (!reactors || reactors.length === 0) return null;
                          const hasReacted = reactors.includes(CURRENT_USER.handle);
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleToggleReaction(comment.id, emoji)}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all cursor-pointer relative group/badge ${
                                hasReacted
                                  ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-300 hover:bg-blue-100/80 dark:hover:bg-blue-950/60"
                                  : "bg-gray-100/50 dark:bg-slate-800/30 border-gray-200/40 dark:border-slate-800/60 text-gray-500 dark:text-slate-400 hover:bg-gray-150/50 dark:hover:bg-slate-800/60 hover:border-gray-200 dark:hover:border-slate-700"
                              }`}
                              title={`${reactors.join(", ")} reacted with ${emoji}`}
                            >
                              <span>{emoji}</span>
                              <span className="font-mono text-[9px] font-extrabold">{reactors.length}</span>
                              
                              {/* Hover Tooltip of Reactors */}
                              <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover/badge:block bg-slate-900 dark:bg-slate-850 text-white text-[9px] rounded py-1 px-2 whitespace-nowrap shadow-xl z-30 pointer-events-none uppercase tracking-wider font-semibold font-mono">
                                {reactors.map(r => r === CURRENT_USER.handle ? "You" : r).join(", ")}
                              </span>
                            </button>
                          );
                        })}

                        {/* Reaction Picker Popover */}
                        <div className="relative">
                          <button
                            onClick={() => setActivePickerCommentId(activePickerCommentId === comment.id ? null : comment.id)}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-150 text-[10px] font-bold cursor-pointer shadow-sm bg-white dark:bg-slate-900"
                            title="Add reaction feedback"
                          >
                            +🤩
                          </button>

                          {activePickerCommentId === comment.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setActivePickerCommentId(null)} 
                              />
                              <div className="absolute left-0 bottom-full mb-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg shadow-xl p-1.5 flex gap-1 z-50 animate-in fade-in slide-in-from-bottom-1 max-w-[220px] shrink-0 items-center">
                                {["👍", "🎉", "❤️", "👀", "🚀", "👎", "💬", "🔥"].map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      handleToggleReaction(comment.id, emoji);
                                      setActivePickerCommentId(null);
                                    }}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-all text-xs cursor-pointer hover:scale-120 active:scale-95 duration-100"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Delete action toolbar */}
                    {comment.handle === CURRENT_USER.handle && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 hover:text-red-500 text-gray-400 transition-opacity p-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

          </section>

        </div>

        {/* Right Column Pane — tabs: Changelog | Teams Post | AI Analysis */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800 shadow-sm flex flex-col overflow-hidden min-w-[300px] transition-colors">

          {/* Tab bar */}
          <div className="flex border-b border-[#EDEBE9] dark:border-slate-800 bg-[#F3F2F1] dark:bg-slate-950/40 shrink-0">
            {([
              { id: "changelog", Icon: Scroll,  label: "Changelog" },
              { id: "teams",     Icon: Users,   label: "Teams Post" },
              { id: "analysis",  Icon: Brain,   label: "AI Analysis" },
            ] as const).map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveArtifactTab(id)}
                className={`flex-1 py-3 text-[11px] font-bold tracking-wide flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  activeArtifactTab === id
                    ? "border-[#0078D4] text-[#0078D4] dark:text-blue-400 bg-white dark:bg-slate-900"
                    : "border-transparent text-[#605E5C] dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar transition-colors">

            {isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center py-20 text-center px-6">
                <Rocket className="w-9 h-9 text-purple-500 animate-bounce mb-4" />
                <p className="font-bold text-sm text-[#201F1E] dark:text-slate-200">Compiling artifacts…</p>
              </div>
            )}

            {!isAnalyzing && activeArtifactTab === "changelog" && (
              <div className="p-6">
                <div className="whitespace-pre-line font-mono text-[11px] leading-relaxed bg-[#fafafa] dark:bg-slate-950 border border-[#EDEBE9] dark:border-slate-800 p-5 rounded-xl shadow-inner text-gray-800 dark:text-slate-200">
                  {pr.changelog}
                </div>
              </div>
            )}

            {!isAnalyzing && activeArtifactTab === "teams" && (
              <div className="p-6">
                <div className="font-sans text-sm text-gray-700 dark:text-slate-300 whitespace-pre-line bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-5 rounded-xl leading-relaxed shadow-inner">
                  {pr.teamsPost}
                </div>
              </div>
            )}

            {!isAnalyzing && activeArtifactTab === "analysis" && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[#0078D4]" />
                    AI Reasoning Trace
                  </h3>
                  <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/30 text-[#107C10] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-2 py-1 rounded-full font-bold flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> 1.2s
                  </span>
                </div>

                {(!pr.reasoningTrace || pr.reasoningTrace.length === 0) ? (
                  <div className="text-center py-16 text-[#605E5C] dark:text-slate-500">
                    <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Click Analyze PR to generate the reasoning trace.</p>
                  </div>
                ) : (
                  <ol className="relative border-l-2 border-gray-100 dark:border-slate-800 ml-3 space-y-6">
                    {pr.reasoningTrace.map((step, idx) => {
                      const isSuccess = step.status === "success";
                      const isWarning = step.status === "warning";
                      const isError   = step.status === "error";
                      const dotColor  = isSuccess ? "bg-[#107C10]" : isWarning ? "bg-[#D83B01]" : isError ? "bg-[#A4262C]" : "bg-[#0078D4]";
                      const iconColor = isSuccess ? "text-[#107C10] dark:text-emerald-400" : isWarning ? "text-[#D83B01]" : isError ? "text-[#A4262C]" : "text-[#0078D4]";

                      return (
                        <li key={idx} className="pl-6 relative">
                          <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${dotColor} shadow-sm`} />
                          <div className={`flex items-center gap-2 mb-1 ${iconColor}`}>
                            {renderStepIcon(step.icon, step.status)}
                            <p className="text-xs font-extrabold uppercase tracking-wider text-[#201F1E] dark:text-slate-200">{step.title}</p>
                          </div>
                          <p className="text-xs text-[#605E5C] dark:text-slate-400 leading-relaxed">{step.description}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer Gate Approval Bar (Shown in Screen 2) */}
      <footer className="h-20 bg-white dark:bg-slate-900 border-t border-[#EDEBE9] dark:border-slate-800 px-6 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0 z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.03)] transition-colors">
        
        {/* Reviewer Row */}
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 overflow-hidden">
            <img 
              alt="Architect Reviewer" 
              className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 skeleton shrink-0" 
              src={makeAvatarSvg("Monica Davis")}
            />
            <img 
              alt="Manager Reviewer" 
              className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 skeleton shrink-0" 
              src={makeAvatarSvg("Alex Rover")}
            />
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-[#eeeedd] dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold text-[#605E5C] dark:text-slate-400 shrink-0 animate-none">
              +3
            </div>
          </div>
          <span className="text-xs text-[#605E5C] dark:text-slate-400 font-semibold flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-blue-500" />
            Awaiting formal approval from DevOps Lead
          </span>
        </div>

        {/* Release Actions */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          
          <button 
            onClick={() => { showToast("Draft saved locally.", "success"); }}
            className="px-4 py-2 border border-[#EDEBE9] dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold text-[#404752] dark:text-slate-350 transition-colors cursor-pointer shrink-0"
          >
            SAVE DRAFT
          </button>

          {/* Safety Gate Trigger */}
          <div className="flex items-[#center] gap-2 select-none shrink-0">
            <input 
              onChange={(e) => setIsVerified(e.target.checked)}
              checked={isVerified}
              className="rounded border-[#c0c7d4] dark:border-slate-700 dark:bg-slate-800 text-[#0078D4] focus:ring-[#0078D4] h-4 w-4 cursor-pointer" 
              id="verification-gate" 
              type="checkbox"
            />
            <label 
              className="text-[10px] font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none" 
              htmlFor="verification-gate"
            >
              I verify all artifacts
            </label>
          </div>

          <button 
            onClick={handleApproveAndRelease}
            disabled={isDeploying || pr.status === 'Released'}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              pr.status === 'Released'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary hover:brightness-115'
            }`}
          >
            {isDeploying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4 text-white" />
            )}
            {pr.status === 'Released' ? "COMMITTED" : "APPROVE AND RELEASE"}
          </button>

        </div>
      </footer>

      {/* Success Scrim/Overlay Dialog (Shown in Screen 2 bottom) */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none p-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-[#EDEBE9] dark:border-slate-800 shadow-2xl relative z-10 text-center max-w-sm w-full animate-in zoom-in duration-150">
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 text-[#107C10] dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-950/40 shadow-sm animate-pulse">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <h2 className="text-lg font-bold text-[#201F1E] dark:text-slate-100 mb-1">Release Initiated</h2>
            <p className="text-xs text-[#605E5C] dark:text-slate-400 mb-6 leading-relaxed">
              Artifacts for pull request <span className="font-bold text-[#201F1E] dark:text-slate-200">{pr.id}</span> are currently building and deploying to Kubernetes node clusters.
            </p>

            <div className="bg-[#f3f3f4] dark:bg-slate-950 border border-[#EDEBE9] dark:border-slate-800 p-3 rounded-lg text-left text-xs text-[#605E5C] dark:text-slate-400 mb-6 leading-relaxed">
              <p className="flex justify-between">
                <span>Deployment Triggers:</span>
                <span className="font-mono font-bold text-gray-800 dark:text-slate-200">SUCCESS</span>
              </p>
              <p className="flex justify-between mt-1">
                <span>Telemetry ID:</span>
                <span className="font-mono text-xs font-bold text-primary dark:text-blue-400">RC-992-04X</span>
              </p>
            </div>

            <button 
              onClick={() => {
                setShowSuccessOverlay(false);
                onBackToDashboard();
              }}
              className="w-full py-3 bg-primary hover:bg-[#005faa] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md"
            >
              CLOSE WORKSPACE
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
