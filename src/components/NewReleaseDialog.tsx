import { useState, FormEvent } from "react";
import { X, SendHorizontal, CodeXml, Github, Link, AlertCircle, Loader2 } from "lucide-react";
import { PRType } from "../types";

interface NewReleaseDialogProps {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    authorName: string;
    type: PRType;
    branch: string;
    description: string;
    reviewer: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
  }) => Promise<void>;
}

export default function NewReleaseDialog({ onClose, onSubmit }: NewReleaseDialogProps) {
  const [mode, setMode] = useState<"manual" | "github">("github");

  // Manual mode fields
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("Monica Davis");
  const [type, setType] = useState<PRType>("FEATURE");
  const [branch, setBranch] = useState("");
  const [description, setDescription] = useState("");
  const [reviewer, setReviewer] = useState("Sarah Jenkins");
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>("Medium");

  // GitHub URL mode fields
  const [githubUrl, setGithubUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [githubResult, setGithubResult] = useState<{ run_id: string; pr_title: string; repository: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValidGithubUrl = (url: string) =>
    /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);

  const handleGithubSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUrlError("");

    if (!githubUrl.trim()) { setUrlError("Please paste a GitHub PR URL."); return; }
    if (!isValidGithubUrl(githubUrl)) {
      setUrlError("URL must look like: https://github.com/owner/repo/pull/123");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/runs/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: githubUrl })
      });
      const data = await res.json() as { run_id?: string; pr_title?: string; repository?: string; error?: string };

      if (!res.ok) {
        setUrlError(data.error ?? `Server error ${res.status}`);
        return;
      }

      setGithubResult({ run_id: data.run_id!, pr_title: data.pr_title!, repository: data.repository! });
    } catch {
      setUrlError("Could not reach server — is HERALD running?");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        authorName,
        type,
        branch: branch || `${type.toLowerCase()}/custom-${Math.floor(100 + Math.random() * 900)}`,
        description: description || "Manual override deployment synced and submitted.",
        reviewer,
        priority
      });
      onClose();
    } catch {
      // parent handles error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EDEBE9] dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#201F1E] dark:text-slate-100 flex items-center gap-2">
            <CodeXml className="w-5 h-5 text-[#0078D4]" />
            Trigger Release Pipeline
          </h2>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex border-b border-[#EDEBE9] dark:border-slate-700 bg-gray-50 dark:bg-slate-800/30">
          <button
            onClick={() => setMode("github")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              mode === "github"
                ? "border-[#0078D4] text-[#0078D4] bg-white dark:bg-slate-900"
                : "border-transparent text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E]"
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            REAL GITHUB PR
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              mode === "manual"
                ? "border-[#0078D4] text-[#0078D4] bg-white dark:bg-slate-900"
                : "border-transparent text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E]"
            }`}
          >
            <CodeXml className="w-3.5 h-3.5" />
            MANUAL ENTRY
          </button>
        </div>

        {/* ── GitHub URL mode ── */}
        {mode === "github" && (
          <form onSubmit={handleGithubSubmit} className="p-6 space-y-4">

            {!githubResult ? (
              <>
                <p className="text-xs text-[#605E5C] dark:text-slate-400 leading-relaxed">
                  Paste any public GitHub PR URL. HERALD will fetch the real files changed,
                  commit messages, and PR title — then run the full AI analysis pipeline.
                </p>

                <div>
                  <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    GitHub Pull Request URL *
                  </label>
                  <div className="relative">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={e => { setGithubUrl(e.target.value); setUrlError(""); }}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-[#201F1E] dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] placeholder:text-gray-400 font-mono"
                      placeholder="https://github.com/owner/repo/pull/123"
                    />
                  </div>
                  {urlError && (
                    <p className="flex items-center gap-1.5 mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {urlError}
                    </p>
                  )}
                  <p className="mt-1.5 text-[10px] text-[#7C8499] dark:text-slate-500 font-medium">
                    Works with any public repo. Private repos need a valid GITHUB_TOKEN in .env
                  </p>
                </div>

                <div className="pt-2 border-t border-[#EDEBE9] dark:border-slate-700 flex justify-end gap-3">
                  <button type="button" onClick={onClose}
                    className="px-4 py-2 border border-[#EDEBE9] dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold text-[#404752] dark:text-slate-400 transition-colors cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting || !githubUrl.trim()}
                    className="px-5 py-2.5 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-40 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md">
                    {isSubmitting
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching from GitHub…</>
                      : <><Github className="w-3.5 h-3.5" /> Analyze Real PR</>
                    }
                  </button>
                </div>
              </>
            ) : (
              /* Success state */
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-2">
                    Pipeline started — real GitHub data is being analyzed
                  </p>
                  <p className="text-sm font-semibold text-[#201F1E] dark:text-slate-200">{githubResult.pr_title}</p>
                  <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-1 font-mono">{githubResult.repository}</p>
                  <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-2 font-mono">Run ID: {githubResult.run_id}</p>
                </div>
                <p className="text-xs text-[#605E5C] dark:text-slate-400">
                  Go to the <strong>Webhook Runs</strong> tab to see the live analysis, edit artifacts, and approve the release.
                </p>
                <div className="flex justify-end gap-3 pt-2 border-t border-[#EDEBE9] dark:border-slate-700">
                  <button type="button" onClick={onClose}
                    className="px-5 py-2.5 bg-[#0078D4] hover:bg-[#005faa] text-white rounded-lg text-xs font-bold cursor-pointer">
                    Go to Runs Tab
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ── Manual mode ── */}
        {mode === "manual" && (
          <form onSubmit={handleManualSubmit} className="p-6 space-y-4">

            <div>
              <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-title">
                Pull Request Title *
              </label>
              <input id="pr-title" type="text" required value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-[#201F1E] dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] placeholder:text-gray-400"
                placeholder="e.g. feat: Implement Slack API webhook notifications" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-author">Author Profile</label>
                <select id="pr-author" value={authorName} onChange={e => setAuthorName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-[#201F1E] dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] cursor-pointer">
                  <option>Monica Davis (@dev_monica)</option>
                  <option>Alex Chen (@alex_chen)</option>
                  <option>Sarah Miller (@sarah_m)</option>
                  <option>John Doe (@john_doe)</option>
                  <option>Elena Rodriguez (@elena_r)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-type">Change Type</label>
                <select id="pr-type" value={type} onChange={e => setType(e.target.value as PRType)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-[#201F1E] dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] cursor-pointer">
                  <option value="FEATURE">FEATURE</option>
                  <option value="BUGFIX">BUGFIX</option>
                  <option value="CHORE">CHORE</option>
                  <option value="REFACTOR">REFACTOR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-branch">Branch</label>
                <input id="pr-branch" type="text" value={branch} onChange={e => setBranch(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] placeholder:text-gray-400 font-mono text-xs"
                  placeholder="feature/my-branch" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-reviewer">Reviewer</label>
                <select id="pr-reviewer" value={reviewer} onChange={e => setReviewer(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-[#201F1E] dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] cursor-pointer h-[38px]">
                  <option>Sarah Jenkins</option><option>Alex Rover</option><option>Emily Diaz</option><option>Carter Smith</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-priority">Priority</label>
                <select id="pr-priority" value={priority} onChange={e => setPriority(e.target.value as 'Low' | 'Medium' | 'High' | 'Critical')}
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-bold text-[#201F1E] dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] cursor-pointer h-[38px]">
                  <option value="Low">Low 🟢</option><option value="Medium">Medium 🟡</option>
                  <option value="High">High 🟠</option><option value="Critical">Critical 🔴</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="pr-desc">
                Description (helps AI generate better notes)
              </label>
              <textarea id="pr-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-[#201F1E] dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0078D4] placeholder:text-gray-400 leading-normal"
                placeholder="Describe what changed, why, and what files are involved..." />
            </div>

            <div className="pt-3 border-t border-[#EDEBE9] dark:border-slate-700 flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border border-[#EDEBE9] dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-xs font-bold text-[#404752] dark:text-slate-400 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting}
                className="px-5 py-2.5 bg-[#0078D4] hover:bg-[#005faa] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50">
                <SendHorizontal className="w-4 h-4" />
                {isSubmitting ? "Queueing…" : "Submit to Release Queue"}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
