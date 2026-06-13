import { useState, useEffect } from "react";
import {
  Cpu, Globe, Github, Play, Loader2, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, Copy, Check, Database, Sparkles, Zap, BookOpen,
  GitBranch, Users, Bot, Terminal
} from "lucide-react";
import { apiFetch } from "../lib/api.js";

interface DiagnosticData {
  ai: {
    tier1_foundry_agent: { configured: boolean; agent_id: string | null };
    tier2_phi4: { configured: boolean; deployment: string; endpoint: string | null };
    tier3_azure_openai: { configured: boolean; deployment: string; endpoint: string | null };
    tier4_gemini: { configured: boolean };
  };
  graph: { token_acquired: boolean; tenant_id: string | null; client_id: string | null };
  teams: { team_id: string | null; channel_id: string | null; channel_id_valid: boolean; channel_id_hint: string };
  sharepoint: { configured: boolean; status: string };
  outlook: { user_id: string | null };
  github: { token_set: boolean; webhook_secret_set: boolean };
  work_iq?: { graph_available: boolean; upn_count: number; note: string; admin_consent_url: string | null };
  ownership_map: { areas: number };
  cert_data: { members: number; area_requirements: number };
  persistence: { runs: number; prs: number };
  app_url: string;
  webhook_url: string;
  repos: { connected: number };
}

interface Props { onBack: () => void; }

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatusPill({ ok, partial, label }: { ok?: boolean; partial?: boolean; label?: string }) {
  if (ok) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
      <CheckCircle2 className="w-2.5 h-2.5" />{label ?? "ACTIVE"}
    </span>
  );
  if (partial) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
      <AlertTriangle className="w-2.5 h-2.5" />{label ?? "PARTIAL"}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800/60">
      <XCircle className="w-2.5 h-2.5" />{label ?? "NOT SET"}
    </span>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EDEBE9] dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/60">
      <span className="text-[#0078D4]">{icon}</span>
      <div>
        <p className="text-sm font-extrabold text-[#18223B] dark:text-slate-100 tracking-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ConfigRow({ label, ok, partial, note }: { label: string; ok?: boolean; partial?: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-5 border-b border-[#EDEBE9]/60 dark:border-slate-800/60 last:border-0">
      <div>
        <p className="text-xs font-bold text-[#323130] dark:text-slate-300">{label}</p>
        {note && <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-0.5 font-mono">{note}</p>}
      </div>
      <StatusPill ok={ok} partial={partial} />
    </div>
  );
}

// ── AI Tier flow card ─────────────────────────────────────────────────────────

function TierCard({
  number, name, description, configured, deployment, active
}: {
  number: number; name: string; description: string; configured: boolean; deployment?: string; active?: boolean;
}) {
  return (
    <div className={`relative flex flex-col p-4 rounded-xl border-2 transition-all ${
      configured
        ? "border-[#0078D4]/40 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-800/50"
        : "border-[#EDEBE9] dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/30 opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`w-6 h-6 rounded-full text-[10px] font-extrabold flex items-center justify-center border ${
          configured
            ? "bg-[#0078D4] text-white border-[#0078D4]"
            : "bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-gray-300 dark:border-slate-600"
        }`}>
          {number}
        </span>
        <StatusPill ok={configured} label={configured ? "READY" : "NOT SET"} />
      </div>
      <p className="text-xs font-extrabold text-[#18223B] dark:text-slate-100 mb-0.5">{name}</p>
      <p className="text-[10px] text-[#7C8499] dark:text-slate-500 leading-tight">{description}</p>
      {deployment && configured && (
        <p className="mt-2 text-[9px] font-mono text-[#0078D4] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/50 truncate">
          {deployment}
        </p>
      )}
    </div>
  );
}

// ── Teams channel URL decoder ─────────────────────────────────────────────────
// Lets the user paste a Teams channel link and auto-extracts the channel ID.
// Avoids the common mistake of using a UUID instead of a 19:...@thread.tacv2 ID.

function TeamsChannelDecoder() {
  const [url, setUrl] = useState("");
  const [decoded, setDecoded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const decode = () => {
    const match = url.match(/\/channel\/([^/?&]+)/);
    if (!match) {
      setError("No channel path found — right-click a channel in Teams → Get link to channel, then paste the full URL here.");
      setDecoded(null);
      return;
    }
    try {
      const channelId = decodeURIComponent(match[1]);
      if (/^19:.+@thread\.(tacv2|skype)$/.test(channelId)) {
        setDecoded(channelId);
        setError(null);
      } else {
        setError(`Decoded: "${channelId}" — doesn't match the expected 19:…@thread.tacv2 format. Make sure you copied the channel link, not the team link.`);
        setDecoded(null);
      }
    } catch {
      setError("Could not decode URL — paste the full Teams channel link.");
      setDecoded(null);
    }
  };

  const copy = () => {
    if (!decoded) return;
    navigator.clipboard.writeText(decoded).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-5 mb-5 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Fix: Teams Channel ID</p>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-bold border border-amber-300/50 dark:border-amber-700/50">
          Channel IDs start with 19:
        </span>
      </div>
      <p className="text-[10px] text-amber-600/80 dark:text-amber-500 leading-relaxed">
        In Microsoft Teams: right-click the target channel → <strong>Get link to channel</strong> → paste the full URL below.
        Herald decodes the channel ID automatically.
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); setDecoded(null); setError(null); }}
          onKeyDown={e => e.key === "Enter" && decode()}
          placeholder="https://teams.microsoft.com/l/channel/19%3Axxxxxxxx%40thread.tacv2/General?groupId=…"
          className="flex-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400 text-[#323130] dark:text-slate-300 placeholder-gray-400"
        />
        <button onClick={decode}
          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 active:scale-95">
          Decode
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500 font-medium leading-snug">{error}</p>}
      {decoded && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Decoded successfully — copy and paste into .env
          </p>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3 py-2.5">
            <code className="flex-1 text-xs font-mono text-[#0078D4] dark:text-blue-400 break-all">{decoded}</code>
            <button onClick={copy} className="shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors" title="Copy">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>
          <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500 leading-relaxed font-mono">
            TEAMS_CHANNEL_ID="{decoded}"
          </p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500">
            Paste into .env, save, then restart <code>npm run dev</code>. Refresh this page to verify.
          </p>
        </div>
      )}
    </div>
  );
}

// ── SharePoint Site ID discovery ──────────────────────────────────────────────
// Calls /api/sharepoint/discover to resolve SHAREPOINT_SITE_ID automatically via Graph.
// Falls back to Graph Explorer link when the app is cross-tenant.

function SharePointDiscovery() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ site_id?: string; display_name?: string; env_line?: string; error?: string; graph_explorer_query?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const discover = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/sharepoint/discover?hostname=pern.sharepoint.com&sitePath=HERALD");
      const data = await res.json() as typeof result;
      setResult(data);
    } catch {
      setResult({ error: "Network error — server may be starting up." });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!result?.env_line) return;
    navigator.clipboard.writeText(result.env_line).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-5 mb-5 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-[#0078D4] shrink-0" />
          <p className="text-xs font-bold text-[#0078D4]">Auto-discover SharePoint Site ID</p>
        </div>
        <button
          onClick={discover}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shrink-0"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Discover
        </button>
      </div>
      <p className="text-[10px] text-[#0078D4]/80 dark:text-blue-400 leading-relaxed">
        Resolves <code className="font-mono">pern.sharepoint.com/sites/HERALD</code> via Microsoft Graph API.
        If Herald's app is in a different tenant, use the Graph Explorer link instead.
      </p>
      {result?.error && (
        <div className="space-y-2">
          <p className="text-[10px] text-red-500 font-medium leading-snug">{result.error}</p>
          {result.graph_explorer_query && (
            <a
              href={`https://developer.microsoft.com/en-us/graph/graph-explorer?request=${encodeURIComponent(result.graph_explorer_query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#0078D4] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Open in Graph Explorer (sign in with Bahria/SharePoint account) →
            </a>
          )}
        </div>
      )}
      {result?.site_id && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Found: {result.display_name}
          </p>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-lg px-3 py-2.5">
            <code className="flex-1 text-[10px] font-mono text-[#0078D4] dark:text-blue-400 break-all">{result.env_line}</code>
            <button onClick={copy} className="shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors" title="Copy">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-slate-500">Copy into .env, then restart the server.</p>
        </div>
      )}
    </div>
  );
}

// ── Copilot Extension setup guide ─────────────────────────────────────────────

function CopilotSetupGuide({ webhookUrl }: { webhookUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testCommand, setTestCommand] = useState<"status" | "readiness" | "help" | "analyze">("status");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl + "/copilot").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/copilot/demo?command=${testCommand}`);
      if (res.ok) {
        const data = await res.json() as { response: string };
        setTestResult(data.response || "(empty response)");
      } else {
        setTestResult(`Error ${res.status} — make sure COPILOT_SKIP_SIG_VERIFY=1 is set in .env`);
      }
    } catch {
      setTestResult("Network error — is the server running?");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SectionCard>
      <SectionHeader
        icon={<Bot className="w-4 h-4" />}
        title="GitHub Copilot Extension"
        subtitle="Creative Apps track — @herald commands in GitHub Copilot Chat"
      />
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-[#0078D4] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#323130] dark:text-slate-300">Extension endpoint: <code className="font-mono text-[#0078D4]">POST /copilot</code></p>
              <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-0.5">RSA-SHA256 signature verified · SSE streaming · commands: status, analyze, readiness</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] font-bold text-[#0078D4] hover:underline cursor-pointer"
          >
            Setup Guide
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {open && (
          <div className="mt-4 space-y-3 border-t border-[#EDEBE9] dark:border-slate-800 pt-4">
            <p className="text-xs font-bold text-[#323130] dark:text-slate-300 mb-2">Register Herald as a GitHub Copilot Extension:</p>
            {[
              { n: 1, text: 'Go to github.com → Settings → Developer settings → GitHub Apps → New GitHub App' },
              { n: 2, text: 'Under "Copilot Extension", check "Enable" and set type to Agent' },
              { n: 3, text: 'Set Callback URL to your Herald /copilot endpoint:' },
              { n: 4, text: 'Install the app on your org/repo — users can then type @herald <command> in Copilot Chat' },
              { n: 5, text: 'Set COPILOT_SKIP_SIG_VERIFY=1 in .env for local dev to bypass RSA signature check' }
            ].map(step => (
              <div key={step.n} className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full bg-[#0078D4]/10 border border-[#0078D4]/30 text-[#0078D4] text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">{step.n}</span>
                <p className="text-xs text-[#605E5C] dark:text-slate-400 leading-relaxed">{step.text}</p>
              </div>
            ))}
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800/50 border border-[#EDEBE9] dark:border-slate-700 rounded-lg font-mono text-xs text-[#323130] dark:text-slate-300">
              <span className="flex-1 truncate">{webhookUrl}/copilot</span>
              <button onClick={copyUrl} className="shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded cursor-pointer transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
              </button>
            </div>
            <a
              href="https://docs.github.com/en/copilot/building-copilot-extensions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#0078D4] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub Copilot Extensions docs
            </a>

            {/* Live test widget */}
            <div className="mt-4 p-4 bg-slate-900 dark:bg-slate-950 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Test Extension Live</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700/50 font-bold">requires COPILOT_SKIP_SIG_VERIFY=1</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                {(["status", "readiness", "help", "analyze"] as const).map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => { setTestCommand(cmd); setTestResult(null); }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      testCommand === cmd
                        ? "bg-[#0078D4] text-white border-[#0078D4]"
                        : "text-slate-400 border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    @herald {cmd}
                  </button>
                ))}
                <button
                  onClick={runTest}
                  disabled={testing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold rounded border border-emerald-500 transition-colors cursor-pointer"
                >
                  {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Run
                </button>
              </div>
              {testResult && (
                <pre className="text-[10px] text-emerald-300 leading-relaxed whitespace-pre-wrap font-mono max-h-48 overflow-y-auto bg-black/30 rounded p-3 border border-slate-800">
                  {testResult}
                </pre>
              )}
              {!testResult && !testing && (
                <p className="text-[10px] text-slate-500 font-mono">$ @herald {testCommand} — click Run to see the extension response</p>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Demo Controls ─────────────────────────────────────────────────────────────

const FIXTURES = [
  { id: "feature-pr",  label: "Feature PR",    icon: <Zap className="w-3.5 h-3.5" />,       color: "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 dark:border-blue-800/50 dark:text-blue-400" },
  { id: "bugfix-pr",   label: "Bugfix PR",      icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:hover:bg-purple-950/40 dark:border-purple-800/50 dark:text-purple-400" },
  { id: "breaking-pr", label: "Breaking Change", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-50 hover:bg-red-100 border-red-200 text-red-700 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:border-red-800/50 dark:text-red-400" }
];

function DemoControls({ onRun }: { onRun: (msg: string) => void }) {
  const [running, setRunning] = useState<string | null>(null);

  const trigger = async (fixture: string, label: string) => {
    setRunning(fixture);
    try {
      const res = await apiFetch("/runs/demo/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture })
      });
      if (res.ok) {
        const data = await res.json() as { run_id: string };
        onRun(`${label} demo run started — run_id: ${data.run_id}`);
      }
    } catch {
      onRun("Could not start demo run — server may be starting up.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <SectionCard>
      <SectionHeader
        icon={<Play className="w-4 h-4" />}
        title="Demo Controls"
        subtitle="Trigger curated fixture runs without a real GitHub webhook"
      />
      <div className="grid grid-cols-3 gap-3 p-5">
        {FIXTURES.map(f => (
          <button
            key={f.id}
            onClick={() => trigger(f.id, f.label)}
            disabled={!!running}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${f.color}`}
          >
            {running === f.id
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : f.icon}
            {f.label}
          </button>
        ))}
      </div>
      <div className="px-5 pb-4 -mt-1">
        <p className="text-[10px] text-[#7C8499] dark:text-slate-500">
          After triggering, go to the <strong>Webhook Runs</strong> tab to review the AI analysis and approve enterprise actions.
        </p>
      </div>
    </SectionCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsPanel({ onBack }: Props) {
  const [diag, setDiag] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch("/diagnostic")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDiag(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const anyAi = diag
    ? diag.ai.tier1_foundry_agent.configured ||
      diag.ai.tier2_phi4.configured ||
      diag.ai.tier3_azure_openai.configured ||
      diag.ai.tier4_gemini.configured
    : null;

  const m365Partial = diag ? (diag.graph.token_acquired && (!diag.teams.channel_id_valid || !diag.sharepoint.configured)) : false;
  const m365Full = diag ? (diag.graph.token_acquired && diag.teams.channel_id_valid) : false;

  return (
    <div className="flex-1 bg-[#F4F6FB] dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#18223B] dark:text-slate-100 tracking-tight font-display">Configuration</h1>
            <p className="text-sm text-[#7C8499] dark:text-slate-400 mt-0.5">System status · integration health · setup guides</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl text-xs font-bold text-[#605E5C] dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {notice && (
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-xl text-xs font-semibold text-[#0078D4] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {notice}
            <button onClick={() => setNotice(null)} className="ml-auto text-[#0078D4]/60 hover:text-[#0078D4] cursor-pointer">✕</button>
          </div>
        )}

        {loading && !diag && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#0078D4]/30 animate-spin" />
          </div>
        )}

        {!loading && !diag && (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-800/40">
            <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-[#323130] dark:text-slate-300">Could not reach server</p>
            <p className="text-xs text-[#7C8499] dark:text-slate-500 mt-1">Make sure Herald is running on port 3000.</p>
          </div>
        )}

        {diag && (
          <>
            {/* AI Pipeline */}
            <SectionCard>
              <SectionHeader
                icon={<Cpu className="w-4 h-4" />}
                title="AI Reasoning Pipeline"
                subtitle="4-tier fallback chain — first configured tier runs; simulation is last resort"
              />
              <div className="p-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <TierCard
                    number={1} name="Foundry Agent" description="Microsoft Foundry IQ — thread/run/poll agent"
                    configured={diag.ai.tier1_foundry_agent.configured}
                    deployment={diag.ai.tier1_foundry_agent.agent_id ?? undefined}
                  />
                  <TierCard
                    number={2} name="Phi-4 Reasoning" description="Azure AI Inference · reasoning model"
                    configured={diag.ai.tier2_phi4.configured}
                    deployment={diag.ai.tier2_phi4.configured ? diag.ai.tier2_phi4.deployment : undefined}
                  />
                  <TierCard
                    number={3} name="Azure OpenAI" description="gpt-4o via Azure OpenAI service"
                    configured={diag.ai.tier3_azure_openai.configured}
                    deployment={diag.ai.tier3_azure_openai.configured ? diag.ai.tier3_azure_openai.deployment : undefined}
                  />
                  <TierCard
                    number={4} name="Google Gemini" description="Gemini 2.0 Flash · free-tier fallback"
                    configured={diag.ai.tier4_gemini.configured}
                  />
                </div>

                {anyAi === false && (
                  <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">No AI configured — runs will use heuristic simulation</p>
                      <p className="text-[11px] text-amber-600/80 dark:text-amber-500 leading-relaxed">
                        Set at least <code className="font-mono bg-amber-100 dark:bg-amber-950/50 px-1 rounded">GEMINI_API_KEY</code> in <code className="font-mono bg-amber-100 dark:bg-amber-950/50 px-1 rounded">.env</code> for free AI-powered reasoning.
                        Analysis will use Herald's built-in heuristic engine — shown as <strong>Heuristic</strong> in reasoning traces.
                      </p>
                    </div>
                  </div>
                )}

                {anyAi && (
                  <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      AI pipeline ready — {[
                        diag.ai.tier1_foundry_agent.configured && "Foundry Agent",
                        diag.ai.tier2_phi4.configured && "Phi-4",
                        diag.ai.tier3_azure_openai.configured && "Azure OpenAI",
                        diag.ai.tier4_gemini.configured && "Gemini"
                      ].filter(Boolean).join(" → ")} configured
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Microsoft 365 */}
            <SectionCard>
              <SectionHeader
                icon={<Globe className="w-4 h-4" />}
                title="Microsoft 365 Integration"
                subtitle="Enterprise Agents track · Graph API · Teams · SharePoint · Outlook · Work IQ"
              />

              {/* Admin consent CTA — shown prominently when token acquisition fails */}
              {!diag.graph.token_acquired && diag.work_iq?.admin_consent_url && (
                <div className="mx-5 mt-4 mb-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">Graph token not acquired — admin consent required</p>
                    <p className="text-[10px] text-red-600/80 dark:text-red-500 leading-relaxed mb-3">
                      The app registration exists but Azure has not granted admin consent for the required permissions
                      (<code className="font-mono">ChannelMessage.Send</code>, <code className="font-mono">Sites.ReadWrite.All</code>, <code className="font-mono">Calendars.ReadWrite</code>).
                      Click below to open the consent flow in Azure — you must be a tenant administrator.
                    </p>
                    <a
                      href={diag.work_iq.admin_consent_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#0078D4] hover:bg-[#005faa] text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Grant Admin Consent in Azure Portal
                    </a>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-2 leading-relaxed">
                      After granting consent, wait 1–2 minutes, then click Refresh above. If this is a personal account without an Entra tenant, see <code>scripts/fix-graph-token.md</code>.
                    </p>
                  </div>
                </div>
              )}

              <ConfigRow label="Graph API Token" ok={diag.graph.token_acquired}
                note={diag.graph.tenant_id ? `Tenant: ${diag.graph.tenant_id}` : "Set GRAPH_TENANT_ID + GRAPH_CLIENT_ID + GRAPH_CLIENT_SECRET"} />
              <ConfigRow label="Teams Channel" ok={diag.teams.channel_id_valid}
                note={diag.teams.channel_id_valid ? `Channel ID valid — ${diag.teams.channel_id}` : diag.teams.channel_id_hint || "Set TEAMS_TEAM_ID + TEAMS_CHANNEL_ID"} />
              {!diag.teams.channel_id_valid && <TeamsChannelDecoder />}
              <ConfigRow label="SharePoint Release Log"
                ok={diag.sharepoint.configured}
                partial={!diag.sharepoint.configured && diag.graph.token_acquired}
                note={diag.sharepoint.configured ? "SharePoint list configured" : "Fallback: Teams release log active · configure SHAREPOINT_SITE_ID for list logging"} />
              {!diag.sharepoint.configured && diag.graph.token_acquired && <SharePointDiscovery />}
              <ConfigRow label="Outlook Calendar" ok={!!diag.outlook.user_id}
                note={diag.outlook.user_id ? `User: ${diag.outlook.user_id}` : "Set OUTLOOK_USER_ID for rollout reminders"} />
              <div className="flex items-start justify-between py-3 px-5 border-b border-[#EDEBE9]/60 dark:border-slate-800/60 last:border-0">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-xs font-bold text-[#323130] dark:text-slate-300">Work IQ Signals</p>
                  <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-0.5 leading-relaxed">
                    {diag.work_iq?.note ?? (diag.graph.token_acquired
                      ? `Graph active — ${diag.work_iq?.upn_count ?? diag.cert_data.members} UPNs configured`
                      : "Graph token required for live signals")}
                  </p>
                  {diag.work_iq?.admin_consent_url && !diag.work_iq.graph_available && (
                    <a
                      href={diag.work_iq.admin_consent_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-[#0078D4] hover:underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Grant Calendars.Read admin consent →
                    </a>
                  )}
                  {diag.work_iq?.admin_consent_url && diag.work_iq.graph_available && (
                    <a
                      href={diag.work_iq.admin_consent_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-[#0078D4] hover:underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Grant Calendars.Read consent for live signals →
                    </a>
                  )}
                </div>
                <StatusPill
                  ok={diag.graph.token_acquired}
                  partial={!diag.graph.token_acquired}
                  label={diag.graph.token_acquired ? "LIVE" : "SYNTHETIC"}
                />
              </div>
            </SectionCard>

            {/* GitHub */}
            <SectionCard>
              <SectionHeader
                icon={<Github className="w-4 h-4" />}
                title="GitHub Integration"
                subtitle="Webhook receiver · PR analysis · repo connect"
              />
              <ConfigRow label="GitHub Token" ok={diag.github.token_set}
                note={diag.github.token_set ? "Real PR diff data from GitHub API" : "Heuristic path fallback — set GITHUB_TOKEN for live diffs"} />
              <ConfigRow label="Webhook Secret" ok={diag.github.webhook_secret_set}
                note={diag.github.webhook_secret_set ? "HMAC-SHA256 signature verified" : "Set GITHUB_WEBHOOK_SECRET (leave empty in dev to skip verification)"} />
              <div className="flex items-center justify-between py-3 px-5 border-b border-[#EDEBE9]/60 dark:border-slate-800/60">
                <div>
                  <p className="text-xs font-bold text-[#323130] dark:text-slate-300">Connected Repositories</p>
                  <p className="text-[10px] text-[#7C8499] dark:text-slate-500 font-mono mt-0.5">
                    Webhook URL: <span className="text-[#0078D4]">{diag.webhook_url}</span>
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                  diag.repos.connected > 0
                    ? "bg-blue-50 text-[#0078D4] border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/50"
                    : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
                }`}>{diag.repos.connected} repo{diag.repos.connected !== 1 ? "s" : ""}</span>
              </div>
            </SectionCard>

            {/* Copilot Extension */}
            <CopilotSetupGuide webhookUrl={diag.app_url} />

            {/* Demo Controls */}
            <DemoControls onRun={msg => setNotice(msg)} />

            {/* Knowledge + Persistence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-[#0078D4]" />
                  <p className="text-xs font-extrabold text-[#18223B] dark:text-slate-100">Foundry IQ Knowledge Base</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">Ownership areas</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.ownership_map.areas}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">Team members</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.cert_data.members}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">Cert area requirements</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.cert_data.area_requirements}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-[#0078D4]" />
                  <p className="text-xs font-extrabold text-[#18223B] dark:text-slate-100">Persistence</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">Pipeline runs</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.persistence.runs}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">PR records</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.persistence.prs}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#605E5C] dark:text-slate-400 font-medium">Connected repos</span>
                    <span className="font-extrabold text-[#323130] dark:text-slate-200">{diag.repos.connected}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <button
          onClick={onBack}
          className="w-full py-3.5 bg-[#0078D4] hover:bg-[#005faa] text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
        >
          ← Return to Dashboard
        </button>

      </div>
    </div>
  );
}
