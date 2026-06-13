import { useState, useEffect, useCallback } from "react";
import { useToast } from "../context/ToastContext.js";
import {
  GitBranch, Plus, Trash2, CheckCircle2, AlertTriangle,
  ExternalLink, Loader2, RefreshCw
} from "lucide-react";
import { TrackedRepo } from "../types.js";
import { apiFetch } from "../lib/api.js";

// ─── Repo card ────────────────────────────────────────────────────────────────

function RepoCard({ repo, onDelete }: { repo: TrackedRepo; onDelete: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

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

        <button
          onClick={() => { if (!confirmDelete) setConfirmDelete(true); else onDelete(repo.id); }}
          onBlur={() => setConfirmDelete(false)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer shrink-0 ${
            confirmDelete
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
          }`}
        >
          <Trash2 className="w-3 h-3" />
          {confirmDelete ? "Confirm" : "Remove"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
          repo.auto_registered
            ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
            : "bg-gray-50 dark:bg-slate-800/40 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700"
        }`}>
          {repo.auto_registered
            ? <><CheckCircle2 className="w-3 h-3" /> Watching</>
            : <><GitBranch className="w-3 h-3" /> Connected</>}
        </span>
        {repo.pr_count > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40">
            {repo.pr_count} PR{repo.pr_count !== 1 ? "s" : ""} analyzed
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
  onConnected: (repo: TrackedRepo) => void;
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
      const data = await res.json() as { repo: TrackedRepo; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to connect repository"); return; }
      onConnected(data.repo);
      showToast(
        `${data.repo.full_name} connected${data.repo.auto_registered ? " — watching for PRs" : ""}`,
        "success"
      );
      onClose();
    } catch {
      setError("Server error — check that Herald is running.");
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
              <p className="text-xs text-[#605E5C] dark:text-slate-400">Herald watches PRs in repos you own</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5">
                GitHub repository
              </label>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setError(null); }}
                placeholder="owner/repo  or  https://github.com/owner/repo"
                className="w-full text-sm font-mono bg-gray-50 dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#0078D4] transition-all text-[#201F1E] dark:text-slate-100 placeholder-gray-400"
                autoFocus
              />
              {error && (
                <p className="text-xs text-red-500 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </p>
              )}
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function RepoConnectPanel() {
  const { showToast } = useToast();
  const [repoList, setRepoList] = useState<TrackedRepo[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch("/api/repos");
      if (res.ok) setRepoList(await res.json());
    } catch { /* offline graceful */ }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleConnected(repo: TrackedRepo) {
    setRepoList(prev => [repo, ...prev]);
  }

  async function handleDelete(id: string) {
    try {
      const res = await apiFetch(`/api/repos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRepoList(prev => prev.filter(r => r.id !== id));
        showToast("Repository removed", "info");
      } else {
        showToast("Failed to remove repository", "error");
      }
    } catch {
      showToast("Server error while removing repository", "error");
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-5 p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#18223B] dark:text-slate-100">Connected Repositories</h2>
          <p className="text-sm text-[#7C8499] dark:text-slate-400 mt-0.5">
            Repos you own auto-analyze every PR. To analyze any other public PR, use the <strong>GitHub</strong> tab → Examine.
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

      {/* Repo list */}
      {repoList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-[#EDEBE9] dark:border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-[#0078D4]/10 flex items-center justify-center mb-4">
            <GitBranch className="w-7 h-7 text-[#0078D4]" />
          </div>
          <h3 className="text-base font-bold text-[#201F1E] dark:text-slate-200">No repositories connected</h3>
          <p className="text-sm text-[#605E5C] dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
            Connect a repository you own and Herald analyzes every pull request automatically.
          </p>
          <button onClick={() => setShowDialog(true)}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-[#0078D4] hover:bg-[#005faa] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md">
            <Plus className="w-4 h-4" /> Connect your first repository
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {repoList.map(repo => (
            <RepoCard key={repo.id} repo={repo} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showDialog && (
        <ConnectDialog onClose={() => setShowDialog(false)} onConnected={handleConnected} />
      )}
    </div>
  );
}
