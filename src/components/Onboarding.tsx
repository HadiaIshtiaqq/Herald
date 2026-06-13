import { useState } from "react";
import { motion } from "motion/react";
import { Github, Loader2, ArrowRight, CheckCircle2, Sun, Moon, X, ShieldCheck, PlayCircle } from "lucide-react";
import MarketingPage from "./MarketingPage.js";
import HeraldLogo from "./HeraldLogo.js";
import { apiFetch } from "../lib/api.js";

export interface Session {
  login: string;
  name: string | null;
  avatar_url: string;
}

interface OnboardingProps {
  onSignIn: (s: Session) => void;
  onDemo?: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
}

export default function Onboarding({ onSignIn, onDemo, isDarkMode, setIsDarkMode }: OnboardingProps) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = async () => {
    const u = username.trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/\/.*$/, "");
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(u)) { setErr("Enter a valid GitHub username"); return; }
    setChecking(true); setErr(null); setPreview(null);
    try {
      const res = await apiFetch(`/api/github/profile?user=${encodeURIComponent(u)}`);
      const data = await res.json() as { ok: boolean; user?: Session; reason?: string };
      if (!data.ok || !data.user) setErr(data.reason ?? "That GitHub profile wasn't found");
      else setPreview({ login: data.user.login, name: data.user.name, avatar_url: data.user.avatar_url });
    } catch {
      setErr("Could not reach the server — is Herald running?");
    } finally {
      setChecking(false);
    }
  };

  const openSignup = () => { setOpen(true); setErr(null); };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-[#1a1c1c] dark:text-slate-100 font-sans antialiased overflow-x-hidden">

      {/* slim top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 md:px-8 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-[#EDEBE9] dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <HeraldLogo size={30} />
          <span className="text-xl font-bold text-slate-900 dark:text-blue-400 tracking-wider">HERALD</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Toggle dark mode">
            {isDarkMode ? <Sun className="w-[18px] h-[18px] text-amber-500" /> : <Moon className="w-[18px] h-[18px] text-slate-600" />}
          </button>
          {onDemo && (
            <button onClick={onDemo}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-[#605E5C] dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
              <PlayCircle className="w-4 h-4 text-[#EC7A3C]" /> Live demo
            </button>
          )}
          <button onClick={openSignup}
            className="flex items-center gap-2 bg-[#0078D4] hover:bg-[#005faa] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer shadow-sm">
            <Github className="w-4 h-4" /> Sign in
          </button>
        </div>
      </header>

      {/* the landing page itself */}
      <MarketingPage onBackToApp={openSignup} ctaLabel="Get started — connect GitHub" onDemo={onDemo} />

      {/* ── Sign-in modal ──────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800 shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* header */}
            <div className="relative px-6 pt-7 pb-5 text-center bg-gradient-to-br from-[#0f1830] to-[#15233f]">
              <button onClick={() => setOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-3">
                <Github className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-extrabold text-white font-display">Connect your GitHub</h2>
              <p className="text-xs text-blue-100/70 mt-1 max-w-xs mx-auto leading-relaxed">
                Just your username — no token, no webhook setup. Herald reviews your open pull requests automatically.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {!preview ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      GitHub username
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">@</span>
                      <input
                        autoFocus
                        value={username}
                        onChange={e => { setUsername(e.target.value); setErr(null); }}
                        onKeyDown={e => e.key === "Enter" && check()}
                        placeholder="your-github-username"
                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg text-sm dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] placeholder:text-gray-400 font-mono"
                      />
                    </div>
                    {err && (
                      <p className="text-xs text-red-500 font-medium mt-2 flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 shrink-0" />{err}
                      </p>
                    )}
                  </div>
                  <button onClick={check} disabled={checking || !username.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                    {checking ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking you up…</> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700">
                    <img src={preview.avatar_url} alt={preview.login} className="w-12 h-12 rounded-full border border-gray-200 dark:border-slate-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#201F1E] dark:text-slate-100 truncate">{preview.name ?? preview.login}</p>
                      <p className="text-xs text-[#7C8499] dark:text-slate-400 font-mono">@{preview.login}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto shrink-0" />
                  </div>
                  <button onClick={() => onSignIn(preview)}
                    className="w-full flex items-center justify-center gap-2 bg-[#0078D4] hover:bg-[#005faa] text-white py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                    Continue as @{preview.login} <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setPreview(null); setUsername(""); }}
                    className="w-full text-xs font-semibold text-[#7C8499] dark:text-slate-400 hover:text-[#0078D4] transition-colors cursor-pointer">
                    Use a different account
                  </button>
                </>
              )}

              <p className="text-[10px] text-center text-gray-400 dark:text-slate-500 leading-relaxed flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                Reads only public profile &amp; PR data. No password, no token.
              </p>

              {onDemo && (
                <button onClick={onDemo}
                  className="w-full pt-1 text-xs font-bold text-[#0078D4] hover:underline cursor-pointer">
                  or explore the demo without signing in →
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
