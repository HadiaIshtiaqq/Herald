import { useState, useEffect, useCallback } from "react";
import { useToast } from "../context/ToastContext.js";
import {
  GitBranch,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Webhook,
  Lock,
  Globe,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from "lucide-react";
import { TrackedRepo } from "../types.js";
import { apiFetch } from "../lib/api.js";

interface SetupInfo {
  message: string;
  url: string;
  secret: string;
  events: string[];
  content_type: string;
}

interface ConnectResponse {
  repo: TrackedRepo;
  setup: SetupInfo | null;
}

const SESSION_KEY = "herald_webhook_setups";

function saveSetupToSession(repo: TrackedRepo, setup: SetupInfo) {
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, { repo: TrackedRepo; setup: SetupInfo }>;
    all[repo.id] = { repo, setup };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch { /* sessionStorage unavailable */ }
}

function loadSetupsFromSession(): Record<string, { repo: TrackedRepo; setup: SetupInfo }> {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}"); }
  catch { return {}; }
}

function clearSetupFromSession(repoId: string) {
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, unknown>;
    delete all[repoId];
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// ─── Setup instructions card ─────────────────────────────────────────────────

function SetupCard({ repo, setup, onDismiss }: { repo: TrackedRepo; setup: SetupInfo; onDismiss: () => void }) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(true);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`${label} copied to clipboard`, "info"),
      () => showToast("Copy failed — select and copy manually", "error")
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide cursor-pointer">
          <Webhook className="w-3.5 h-3.5" />
          Manual webhook setup — {repo.full_name}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onDismiss} className="text-[10px] font-bold text-amber-500 hover:text-amber-700 uppercase cursor-pointer px-2 py-1">Dismiss</button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Herald couldn&apos;t auto-register the webhook (token may lack <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">admin:repo_hook</code> scope).
            Go to <strong>{repo.full_name}</strong> → Settings → Webhooks → Add webhook.
          </p>
          <div className="space-y-2">
            <Field label="Payload URL" value={setup.url} onCopy={() => copy(setup.url, "URL")} />
            <Field label="Content type" value="application/json" />
            <Field label="Secret" value={setup.secret} onCopy={() => copy(setup.secret, "Secret")} secret />
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Select <strong>Pull requests</strong> under event triggers, then click <strong>Add webhook</strong>.</span>
            </div>
          </div>
          <a
            href={`https://github.com/${repo.full_name}/settings/hooks/new`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Open webhook settings on GitHub
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onCopy, secret }: { label: string; value: string; onCopy?: () => void; secret?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const display = secret && !revealed ? "•".repeat(Math.min(value.length, 32)) : value;
  return (
    <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
      <p className="text-[9px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono text-[#323130] dark:text-slate-300 break-all">{display}</code>
        {secret && (
          <button onClick={() => setRevealed(!revealed)} className="text-[10px] font-bold text-amber-500 hover:text-amber-700 uppercase shrink-0 cursor-pointer">
            {revealed ? "Hide" : "Show"}
          </button>
        )}
        {onCopy && (
          <button onClick={onCopy} className="shrink-0 cursor-pointer text-amber-500 hover:text-amber-700 transition-colors" title={`Copy ${label}`}>
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Repo card ────────────────────────────────────────────────────────────────

function RepoCard({
  repo,
  onDelete,
  onShowSecret
}: {
  repo: TrackedRepo;
  onDelete: (id: string) => void;
  onShowSecret: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const timeSince = repo.last_event_at
    ? (() => {
        const secs = Math.floor((Date.now() - new Date(repo.last_event_at).getTime()) / 1000);
        if (secs < 60) return "just now";
        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
        if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
        return `${Math.floor(secs / 86400)}d ago`;
      })()
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#0078D4]/10 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4 text-[#0078D4]" />
          </div>
          <div className="min-w-0">
            <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 font-bold text-sm text-[#201F1E] dark:text-slate-100 hover:underline truncate">
              {repo.full_name}
              <ExternalLink className="w-3 h-3 text-gray-400 shrink-0" />
            </a>
            <p className="text-[10px] text-[#605E5C] dark:text-slate-500 mt-0.5 font-medium">
              Connected {new Date(repo.added_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Fix 11: Reveal existing webhook secret */}
          {!repo.auto_registered && (
            <button
              onClick={() => onShowSecret(repo.id)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
              title="Reveal webhook secret"
            >
              <Eye className="w-3 h-3" /> Secret
            </button>
          )}
          <button
            onClick={() => { if (!confirmDelete) { setConfirmDelete(true); } else { onDelete(repo.id); } }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer ${
              confirmDelete
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
            }`}
            onBlur={() => setConfirmDelete(false)}
          >
            <Trash2 className="w-3 h-3" />
            {confirmDelete ? "Confirm" : "Remove"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
          repo.auto_registered
            ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
            : "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
        }`}>
          {repo.auto_registered
            ? <><CheckCircle2 className="w-3 h-3" /> Auto-registered</>
            : <><AlertTriangle className="w-3 h-3" /> Manual setup</>}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40">
          <Globe className="w-3 h-3" />
          {repo.pr_count} PR{repo.pr_count !== 1 ? "s" : ""} opened
        </span>
        {timeSince && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-gray-50 dark:bg-slate-800/40 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700">
            Last event {timeSince}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Connect dialog ───────────────────────────────────────────────────────────

function ConnectDialog({
  onClose,
  onConnected
}: {
  onClose: () => void;
  onConnected: (repo: TrackedRepo, setup: SetupInfo | null) => void;
}) {
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = input.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: trimmed })
      });
      const data = await res.json() as ConnectResponse & { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to connect repository"); return; }
      onConnected(data.repo, data.setup);
      showToast(
        data.setup
          ? `${data.repo.full_name} connected — follow the manual webhook setup.`
          : `${data.repo.full_name} connected and webhook auto-registered!`,
        data.setup ? "info" : "success"
      );
      onClose();
    } catch {
      setError("Server error — check that HERALD is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#0078D4]/10 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-[#0078D4]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#201F1E] dark:text-slate-100">Connect Repository</h2>
              <p className="text-xs text-[#605E5C] dark:text-slate-400">Herald will watch every PR in this repo</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5">
                GitHub Repository URL or owner/repo
              </label>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setError(null); }}
                placeholder="https://github.com/owner/repo  or  owner/repo"
                className="w-full text-sm font-mono bg-gray-50 dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0078D4] transition-all text-[#201F1E] dark:text-slate-100 placeholder-gray-400"
                autoFocus
              />
              {error && (
                <p className="text-xs text-red-500 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </p>
              )}
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400 space-y-1 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5"><Lock className="w-3 h-3" /> What Herald needs</p>
              <p>• <strong>GITHUB_TOKEN</strong> with <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">repo</code> scope → auto-registers the webhook.</p>
              <p>• Without admin scope you get a manual setup guide with the webhook URL and secret.</p>
              <p>• Herald triggers impact analysis on every PR <strong>opened</strong>, <strong>updated</strong>, and <strong>merged</strong>.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[#EDEBE9] dark:border-slate-700 text-xs font-bold text-[#605E5C] dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={loading || !input.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {loading ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Secret reveal modal ──────────────────────────────────────────────────────

function SecretModal({ repoId, fullName, onClose }: { repoId: string; fullName: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    apiFetch(`/api/repos/${repoId}/secret`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { webhook_secret?: string } | null) => { setSecret(d?.webhook_secret ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [repoId]);

  function copy() {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(
      () => showToast("Secret copied to clipboard", "info"),
      () => showToast("Copy failed — select manually", "error")
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-700/50 shadow-2xl w-full max-w-sm p-6 animate-in fade-in duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#201F1E] dark:text-slate-100">Webhook Secret</h3>
            <p className="text-[10px] text-[#605E5C] dark:text-slate-400 font-mono">{fullName}</p>
          </div>
        </div>
        {loading && <p className="text-sm text-gray-400 animate-pulse text-center py-4">Loading…</p>}
        {!loading && !secret && <p className="text-sm text-red-500 text-center py-4">Could not retrieve secret — check API_SECRET.</p>}
        {!loading && secret && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
              <code className="text-[11px] font-mono text-[#201F1E] dark:text-slate-200 break-all">
                {revealed ? secret : "•".repeat(Math.min(secret.length, 40))}
              </code>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRevealed(!revealed)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button onClick={copy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer transition-colors">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>
        )}
        <button onClick={onClose}
          className="mt-4 w-full py-2 rounded-xl border border-[#EDEBE9] dark:border-slate-700 text-xs font-bold text-[#605E5C] dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function RepoConnectPanel() {
  const { showToast } = useToast();
  const [repoList, setRepoList] = useState<TrackedRepo[]>([]);
  // Fix 4: setupPending survives page refresh via sessionStorage
  const [setupPending, setSetupPending] = useState<Record<string, { repo: TrackedRepo; setup: SetupInfo }>>(() => loadSetupsFromSession());
  const [showDialog, setShowDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Fix 19: webhook URL from server-side config, not window.location.origin
  const [webhookUrl, setWebhookUrl] = useState<string>(`${window.location.origin}/webhook/github`);
  const [secretModalRepo, setSecretModalRepo] = useState<TrackedRepo | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [reposRes, diagRes] = await Promise.all([
        apiFetch("/api/repos"),
        apiFetch("/diagnostic")
      ]);
      if (reposRes.ok) setRepoList(await reposRes.json());
      if (diagRes.ok) {
        const diag = await diagRes.json() as { webhook_url?: string };
        if (diag.webhook_url) setWebhookUrl(diag.webhook_url);
      }
    } catch { /* offline graceful */ }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleConnected(repo: TrackedRepo, setup: SetupInfo | null) {
    setRepoList(prev => [repo, ...prev]);
    if (setup) {
      // Fix 4: persist setup to sessionStorage so it survives refresh
      saveSetupToSession(repo, setup);
      setSetupPending(prev => ({ ...prev, [repo.id]: { repo, setup } }));
    }
  }

  function dismissSetup(repoId: string) {
    clearSetupFromSession(repoId);
    setSetupPending(prev => { const n = { ...prev }; delete n[repoId]; return n; });
  }

  async function handleDelete(id: string) {
    try {
      const res = await apiFetch(`/api/repos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRepoList(prev => prev.filter(r => r.id !== id));
        // Fix 20: clear setup for deleted repo from both state and sessionStorage
        clearSetupFromSession(id);
        setSetupPending(prev => { const n = { ...prev }; delete n[id]; return n; });
        showToast("Repository disconnected", "info");
      } else {
        showToast("Failed to remove repository", "error");
      }
    } catch {
      showToast("Server error while removing repository", "error");
    }
  }

  const pendingSetups = Object.values(setupPending).filter(p =>
    repoList.some(r => r.id === p.repo.id)
  );

  return (
    <div className="flex-1 flex flex-col gap-5 p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#18223B] dark:text-slate-100">Connected Repositories</h2>
          <p className="text-sm text-[#7C8499] dark:text-slate-400 mt-0.5">
            Herald watches every PR in connected repos and auto-triggers an analysis run.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load}
            className="p-2 rounded-lg border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-[#605E5C] dark:text-slate-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0078D4] hover:bg-[#005faa] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Connect Repository
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: <GitBranch className="w-4 h-4 text-[#0078D4]" />, title: "PR Opened", body: "Immediately triggers Foundry impact analysis as soon as a PR is created." },
          { icon: <RefreshCw className="w-4 h-4 text-purple-500" />, title: "PR Updated", body: "Re-analyzes when new commits are pushed — only if no run is already in progress." },
          { icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, title: "PR Merged", body: "Runs full release pipeline — artifacts, Teams announcement, Outlook reminder." }
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

      {/* Pending manual setups — persisted across refresh */}
      {pendingSetups.map(({ repo, setup }) => (
        <SetupCard key={repo.id} repo={repo} setup={setup} onDismiss={() => dismissSetup(repo.id)} />
      ))}

      {/* Repo list */}
      {repoList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-[#EDEBE9] dark:border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-[#0078D4]/10 flex items-center justify-center mb-4">
            <GitBranch className="w-7 h-7 text-[#0078D4]" />
          </div>
          <h3 className="text-base font-bold text-[#201F1E] dark:text-slate-200">No repositories connected</h3>
          <p className="text-sm text-[#605E5C] dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
            Connect a GitHub repository and Herald will analyze every pull request automatically.
          </p>
          <button onClick={() => setShowDialog(true)}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-[#0078D4] hover:bg-[#005faa] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md">
            <Plus className="w-4 h-4" /> Connect your first repository
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {repoList.map(repo => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onDelete={handleDelete}
              onShowSecret={id => setSecretModalRepo(repoList.find(r => r.id === id) ?? null)}
            />
          ))}
        </div>
      )}

      {/* Webhook URL info — Fix 19: uses server-side APP_URL */}
      {repoList.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-900/50 border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 flex items-start gap-3">
          <Webhook className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">Herald Webhook Endpoint</p>
            <code className="text-xs font-mono text-[#201F1E] dark:text-slate-300 break-all">{webhookUrl}</code>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
              All connected repositories send PR events to this endpoint. Update <code>APP_URL</code> in <code>.env</code> if this shows localhost.
            </p>
          </div>
        </div>
      )}

      {showDialog && (
        <ConnectDialog onClose={() => setShowDialog(false)} onConnected={handleConnected} />
      )}

      {/* Fix 11: Secret reveal modal */}
      {secretModalRepo && (
        <SecretModal
          repoId={secretModalRepo.id}
          fullName={secretModalRepo.full_name}
          onClose={() => setSecretModalRepo(null)}
        />
      )}
    </div>
  );
}
