import React, { useState, useEffect, useCallback, useRef, ReactNode, useId } from "react";
import { useToast } from "../context/ToastContext.js";
import ReactMarkdown from "react-markdown";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Shield,
  Zap,
  RefreshCw,
  Send,
  Ban,
  MessageSquare,
  BookOpen,
  FileText,
  Sparkles,
  ExternalLink,
  GitBranch,
  Calendar,
  Users,
  Plus,
  Play,
  GraduationCap,
  Database,
  GitPullRequest,
  RotateCcw,
  Cpu,
  Scale,
  ShieldCheck
} from "lucide-react";
import { Run, RunStatus, RiskLevel, PipelineStageStatus, ReleaseVerdict } from "../types";
import TeamReadinessPanel from "./TeamReadinessPanel";
import BlastRadiusPanel from "./BlastRadiusPanel";
import RepoConnectPanel from "./RepoConnectPanel";
import { apiFetch } from "../lib/api.js";

interface RunReviewScreenProps {
  onBack: () => void;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel | undefined }) {
  const cfgMap: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    low:    { bg: "bg-[#2E9E6B]/10 border-[#2E9E6B]/30", text: "text-[#2E9E6B]", icon: <Shield className="w-3 h-3" />, label: "Low Risk" },
    medium: { bg: "bg-[#E0A93B]/10 border-[#E0A93B]/30", text: "text-[#E0A93B]", icon: <AlertTriangle className="w-3 h-3" />, label: "Medium Risk" },
    high:   { bg: "bg-[#D5544A]/10 border-[#D5544A]/30", text: "text-[#D5544A]", icon: <Zap className="w-3 h-3" />, label: "High Risk" }
  };
  const cfg = cfgMap[level ?? "low"] ?? cfgMap.low;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.text}`}
      role="status" aria-label={`Risk level: ${cfg.label}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── AI Tier badge ─────────────────────────────────────────────────────────────

const AI_TIER_CONFIG: Record<string, { label: string; color: string }> = {
  "foundry-agent": { label: "Foundry Agent",  color: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-800/50" },
  "phi4":          { label: "Phi-4 Reasoning", color: "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-800/50" },
  "azure-openai":  { label: "Azure OpenAI",    color: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-800/50" },
  "gemini":        { label: "Gemini",           color: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800/50" },
  "simulation":    { label: "Heuristic",        color: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/50" },
};

function AiTierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const cfg = AI_TIER_CONFIG[tier] ?? AI_TIER_CONFIG["simulation"];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${cfg.color}`}>
      <Cpu className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function StageChip({ stage }: { stage: PipelineStageStatus }) {
  const variants = {
    done:    "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/50",
    running: "bg-[#0078D4]/8 text-[#0078D4] border-[#0078D4]/30 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/50",
    error:   "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800/50",
    pending: "bg-gray-100 text-gray-400 border-gray-200 dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${variants[stage.status]}`}>
      {stage.status === "done"    && <CheckCircle2 className="w-3 h-3 shrink-0" />}
      {stage.status === "running" && <Loader2 className="w-3 h-3 shrink-0 animate-spin" />}
      {stage.status === "error"   && <XCircle className="w-3 h-3 shrink-0" />}
      {stage.status === "pending" && <span className="w-3 h-3 shrink-0 rounded-full border-2 border-current opacity-40 inline-block" />}
      {stage.label}
    </span>
  );
}

function StatusBanner({ status, error, tier, stages }: { status: RunStatus; error?: string | null; tier?: string; stages?: PipelineStageStatus[] }) {
  if (status === "reasoning") {
    return (
      <div className="flex flex-col gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[#0078D4] animate-spin shrink-0" />
          <div>
            <p className="text-sm font-bold text-[#0078D4]">Analyzing change…</p>
            <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5">Herald AI pipeline is reasoning through the impact of this change.</p>
          </div>
        </div>
        {stages && stages.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pl-8">
            {stages.map((stage, i) => (
              <span key={stage.name} className="inline-flex items-center gap-1.5">
                <StageChip stage={stage} />
                {i < stages.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-[#0078D4]/30 dark:text-blue-800 shrink-0" />
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (status === "acting") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 text-[#E0A93B] animate-spin shrink-0" />
        <div>
          <p className="text-sm font-bold text-[#E0A93B]">Executing enterprise actions…</p>
          <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5">Sending to Microsoft 365 via Graph API.</p>
        </div>
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl" role="status">
        <CheckCircle2 className="w-5 h-5 text-[#2E9E6B] shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-[#2E9E6B]">Release complete — all actions sent successfully.</p>
          {tier && <div className="mt-1"><AiTierBadge tier={tier} /></div>}
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-xl" role="alert">
        <XCircle className="w-5 h-5 text-[#D5544A] shrink-0" />
        <div>
          <p className="text-sm font-bold text-[#D5544A]">Pipeline error</p>
          <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-0.5">{error || "An unexpected error occurred."}</p>
        </div>
      </div>
    );
  }
  return null;
}

// ── Release Verdict banner ────────────────────────────────────────────────────
// The adjudicator's decision — the thing that actually owns the ship/block call.
// The AI agents form the analysis; this deterministic verdict owns the outcome.

const VERDICT_CFG: Record<ReleaseVerdict["decision"], {
  label: string; icon: React.ReactNode; ring: string; chip: string; accent: string; bar: string;
}> = {
  CLEAR: {
    label: "Clear to ship",
    icon: <ShieldCheck className="w-6 h-6" />,
    ring: "bg-emerald-50/80 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/60",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
    accent: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500"
  },
  BLOCKED: {
    label: "Blocked",
    icon: <Ban className="w-6 h-6" />,
    ring: "bg-red-50/80 border-red-300 dark:bg-red-950/20 dark:border-red-800/60",
    chip: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60",
    accent: "text-red-700 dark:text-red-300",
    bar: "bg-red-500"
  },
  ABSTAIN: {
    label: "Herald abstains",
    icon: <AlertTriangle className="w-6 h-6" />,
    ring: "bg-amber-50/80 border-amber-300 dark:bg-amber-950/20 dark:border-amber-800/60",
    chip: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
    accent: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500"
  }
};

function VerdictBanner({ verdict }: { verdict: ReleaseVerdict }) {
  const cfg = VERDICT_CFG[verdict.decision];
  return (
    <div className={`rounded-2xl border-2 shadow-sm overflow-hidden ${cfg.ring}`} role="status" aria-label={`Release verdict: ${verdict.decision}`}>
      <div className={`h-1 w-full ${cfg.bar}`} />
      <div className="p-5 space-y-4">
        {/* Decision header */}
        <div className="flex items-start gap-4">
          <span className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border ${cfg.chip}`}>
            {cfg.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#7C8499] dark:text-slate-500 flex items-center gap-1">
                <Scale className="w-3 h-3" /> Release Verdict
              </span>
              <span className={`text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded border ${cfg.chip}`}>
                {verdict.decision}
              </span>
            </div>
            <h3 className={`text-xl font-extrabold tracking-tight mt-0.5 ${cfg.accent}`}>{verdict.headline}</h3>
            <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-1 leading-relaxed font-medium">{verdict.rationale}</p>
          </div>
        </div>

        {/* Real blockers */}
        {verdict.real_blockers.length > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/60 dark:bg-red-950/10 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
              <Ban className="w-3 h-3" /> Real blocker{verdict.real_blockers.length !== 1 ? "s" : ""}
            </p>
            <ul className="space-y-1">
              {verdict.real_blockers.map((b, i) => (
                <li key={i} className="text-xs text-red-700 dark:text-red-300 font-medium">{b}</li>
              ))}
            </ul>
          </div>
        )}

        {/* False conflicts rejected — the discrimination story */}
        {verdict.false_conflicts_rejected.length > 0 && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/10 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> False conflict{verdict.false_conflicts_rejected.length !== 1 ? "s" : ""} rejected
            </p>
            <ul className="space-y-1">
              {verdict.false_conflicts_rejected.map((f, i) => (
                <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  <span className="font-mono font-bold">{f.required_cert} ⊃ {f.superseded_by}</span> — {f.note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Unattributed paths + escalation (abstention surface) */}
        {(verdict.unowned_paths.length > 0 || (verdict.escalation && verdict.decision === "ABSTAIN")) && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10 p-3 space-y-2">
            {verdict.unowned_paths.length > 0 && (
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-1.5">
                  Unattributed path{verdict.unowned_paths.length !== 1 ? "s" : ""} — no team owns
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {verdict.unowned_paths.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-white/70 dark:bg-slate-900/50 border border-amber-200 dark:border-amber-800/50 text-[10px] font-mono text-amber-800 dark:text-amber-300">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {verdict.decision === "ABSTAIN" && verdict.escalation && verdict.escalation.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-bold">Escalated to:</span> {verdict.escalation.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Evidence — the grounding behind the verdict */}
        {verdict.evidence.length > 0 && (
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#7C8499] dark:text-slate-500 mb-2">Why this verdict</p>
            <ol className="space-y-1.5">
              {verdict.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="shrink-0 text-[#7C8499] dark:text-slate-600 font-mono">{i + 1}.</span>
                  <span className="text-[#323130] dark:text-slate-300 leading-relaxed">
                    {e.detail} <span className="text-[10px] text-[#7C8499] dark:text-slate-500 font-mono">[{e.source}]</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-[10px] italic text-[#7C8499] dark:text-slate-500 border-t border-black/5 dark:border-white/10 pt-2">{verdict.tagline}</p>
      </div>
    </div>
  );
}

function ReasoningTrace({ steps, tier }: { steps: string[]; tier?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isSimulation = tier === "simulation" || steps.some(s => s.includes("[SIMULATION]"));

  return (
    <div className={`border rounded-lg overflow-hidden ${
      isSimulation
        ? "border-amber-200 dark:border-amber-800/50"
        : "border-[#EDEBE9] dark:border-slate-800"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-4 py-3 hover:opacity-90 transition-opacity text-left cursor-pointer ${
          isSimulation
            ? "bg-amber-50/80 dark:bg-amber-950/20"
            : "bg-gray-50 dark:bg-slate-900/50"
        }`}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">
          {isSimulation
            ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            : <Sparkles className="w-3.5 h-3.5 text-purple-500" />}
          Reasoning Trace ({steps.length} steps)
          {isSimulation && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 font-extrabold normal-case tracking-normal">
              HEURISTIC MODE
            </span>
          )}
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <ol className="divide-y divide-[#EDEBE9] dark:divide-slate-800" aria-label="Reasoning steps">
          {steps.map((step, i) => {
            const isSim = step.includes("[SIMULATION]");
            const cleanStep = step.replace(/\[SIMULATION\]\s*/g, "");
            return (
              <li key={i} className={`flex gap-3 px-4 py-3 text-xs ${isSim ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                <span className={`shrink-0 w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center border ${
                  isSim
                    ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                    : "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60"
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`leading-relaxed font-medium ${
                    isSim ? "text-amber-800 dark:text-amber-300" : "text-[#323130] dark:text-slate-300"
                  }`}>
                    {cleanStep}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {isSimulation && (
        <div className="px-4 py-2.5 bg-amber-50/50 dark:bg-amber-950/10 border-t border-amber-200/60 dark:border-amber-800/30">
          <p className="text-[10px] text-amber-600/80 dark:text-amber-500 font-medium">
            Configure <code className="font-mono text-amber-700 dark:text-amber-400">GEMINI_API_KEY</code> or Foundry credentials in <strong>Settings</strong> for AI-powered reasoning.
          </p>
        </div>
      )}
    </div>
  );
}

function ArtifactEditor({
  value,
  onChange,
  readOnly,
  label
}: {
  value: string;
  onChange: (val: string) => void;
  readOnly: boolean;
  label?: string;
}) {
  const [preview, setPreview] = useState(true);
  const editorId = useId();

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex items-center gap-2" role="group" aria-label="View mode">
          <button
            onClick={() => setPreview(true)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4] ${preview ? "bg-[#0078D4] text-white" : "bg-gray-100 dark:bg-slate-800 text-[#605E5C] dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
            aria-pressed={preview}
          >Preview</button>
          <button
            onClick={() => setPreview(false)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4] ${!preview ? "bg-[#0078D4] text-white" : "bg-gray-100 dark:bg-slate-800 text-[#605E5C] dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"}`}
            aria-pressed={!preview}
          >Edit</button>
        </div>
      )}

      {(preview || readOnly) ? (
        <div
          id={editorId}
          className="prose prose-sm dark:prose-invert max-w-none text-xs text-[#323130] dark:text-slate-300 bg-[#FAFAFA] dark:bg-slate-950/50 border border-[#EDEBE9] dark:border-slate-800 rounded-lg p-4 min-h-[200px] overflow-auto
            prose-headings:text-[#18223B] dark:prose-headings:text-slate-100 prose-headings:font-extrabold
            prose-code:bg-gray-100 dark:prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded prose-code:text-[11px]
            prose-strong:text-[#201F1E] dark:prose-strong:text-slate-100
            prose-li:marker:text-[#0078D4]
            prose-a:text-[#0078D4] prose-a:no-underline hover:prose-a:underline"
          aria-label={label ?? "Artifact preview"}
          tabIndex={0}
        >
          <ReactMarkdown>{value || "*No content generated yet.*"}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          id={editorId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          className="w-full text-xs font-mono text-[#323130] dark:text-slate-300 bg-[#FAFAFA] dark:bg-slate-950/50 border border-[#EDEBE9] dark:border-slate-800 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#0078D4] leading-relaxed"
          aria-label={`${label ?? "Artifact"} editor`}
        />
      )}
    </div>
  );
}

function ActionToggle({
  id,
  label,
  description,
  icon,
  checked,
  onChange,
  disabled
}: {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none group ${
        checked
          ? "bg-[#0078D4]/5 border-[#0078D4]/40 dark:bg-blue-950/20 dark:border-blue-700/50 shadow-sm"
          : "bg-white dark:bg-slate-900 border-[#EDEBE9] dark:border-slate-800 hover:border-[#0078D4]/20 dark:hover:border-slate-600"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      {/* Custom checkbox indicator */}
      <span className={`absolute top-3 right-3 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
        checked ? "bg-[#0078D4] border-[#0078D4]" : "border-gray-300 dark:border-slate-600 group-hover:border-[#0078D4]/50"
      }`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
        checked ? "bg-[#0078D4]/10 text-[#0078D4]" : "bg-gray-100 dark:bg-slate-800 text-[#605E5C] dark:text-slate-400"
      }`}>
        {icon}
      </span>
      <div>
        <p className={`text-sm font-bold transition-colors ${checked ? "text-[#0078D4]" : "text-[#201F1E] dark:text-slate-200"}`}>{label}</p>
        <p className="text-xs text-[#7C8499] dark:text-slate-400 mt-0.5 leading-snug">{description}</p>
      </div>
    </label>
  );
}

// Renders the exact message Herald would post to Teams — shows judges the real
// content even when cross-tenant access prevents the live Graph API call.
function TeamsMessagePreview({ run }: { run: Run }) {
  const report = run.impact_report;
  if (!report) return null;
  const riskEmoji = report.risk.level === "high" ? "⛔" : report.risk.level === "medium" ? "⚠️" : "✅";
  const riskColor = report.risk.level === "high"
    ? "text-[#D5544A]"
    : report.risk.level === "medium"
    ? "text-[#E0A93B]"
    : "text-[#2E9E6B]";

  return (
    <div className="mt-2 rounded-xl border border-[#0078D4]/20 overflow-hidden">
      {/* Teams-style header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#464775] text-white">
        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-bold tracking-wide">Microsoft Teams · HERALD Channel</span>
        <span className="text-[9px] opacity-60 ml-auto">Herald Release Concierge App</span>
      </div>
      {/* Message body */}
      <div className="px-3 py-3 bg-white dark:bg-slate-900/80 space-y-1.5 text-xs">
        <p className="font-extrabold text-[#201F1E] dark:text-slate-100 text-sm">
          {riskEmoji} Release: {run.pr_title}
        </p>
        <p className="text-[#605E5C] dark:text-slate-400">
          <span className="font-bold">Risk:</span>{" "}
          <span className={`font-bold ${riskColor}`}>{report.risk.level.toUpperCase()}</span>
          {" "}— {report.risk.rationale}
        </p>
        {run.artifacts && (
          <p className="text-[#605E5C] dark:text-slate-400">
            <span className="font-bold">Summary:</span>{" "}
            {run.artifacts.plain_summary.slice(0, 140)}{run.artifacts.plain_summary.length > 140 ? "…" : ""}
          </p>
        )}
        <p className="text-[#605E5C] dark:text-slate-400">
          <span className="font-bold">Impacted areas:</span>{" "}
          {report.impacted_areas.join(", ")}
        </p>
        {report.breaking_changes.length > 0 && (
          <p className="text-[#D5544A] font-semibold">
            ⚠️ Breaking changes: {report.breaking_changes[0]}
          </p>
        )}
        {run.team_readiness && (
          <p className="text-[#605E5C] dark:text-slate-400">
            <span className="font-bold">🎓 Team Readiness:</span>{" "}
            {run.team_readiness.overall_score}% — {run.team_readiness.ready_count}/{run.team_readiness.total_count} certified.
            {run.team_readiness.blocking_deployment ? " ⛔ Deployment blocked pending cert gaps." : " Readiness threshold met."}
          </p>
        )}
        <p className="text-[9px] text-gray-400 italic border-t border-gray-100 dark:border-slate-800 pt-1 mt-2">
          Approved via Herald Release Concierge · Run #{run.pr_number}
        </p>
      </div>
      <div className="px-3 py-1.5 bg-[#0078D4]/5 border-t border-[#0078D4]/10">
        <p className="text-[9px] text-[#0078D4]/70 dark:text-blue-400">
          Live Teams posting requires the herald-graph app in the same Entra tenant as your Teams team · <span className="font-bold">Graph API call ready</span>
        </p>
      </div>
    </div>
  );
}

function ConfirmationView({ run }: { run: Run }) {
  const r = run.actions_result;
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[#2E9E6B] flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5" />
        Release successfully executed!
      </p>
      <div className="grid gap-2">
        {r?.teams && (
          r.teams.startsWith("herald:") ? (
            <div className="bg-[#0078D4]/5 border border-[#0078D4]/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 p-3">
                <MessageSquare className="w-4 h-4 text-[#0078D4] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200">Teams announcement — message preview</span>
                  <p className="text-[10px] text-[#0078D4]/70 dark:text-blue-400 font-medium mt-0.5">
                    Herald generated this message via Graph API · cross-tenant posting requires app in same Entra tenant
                  </p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-[#2E9E6B] shrink-0" />
              </div>
              <TeamsMessagePreview run={run} />
            </div>
          ) : (
            <a href={r.teams} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 p-3 bg-[#0078D4]/5 border border-[#0078D4]/20 rounded-xl hover:bg-[#0078D4]/10 transition-colors group">
              <MessageSquare className="w-4 h-4 text-[#0078D4]" />
              <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200 group-hover:underline">Teams announcement posted</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
          )
        )}
        {r?.sharepoint ? (
          (r.sharepoint.startsWith("simulated") || r.sharepoint.startsWith("herald:release-log")) ? (
            <div className="flex items-center gap-2.5 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl">
              <BookOpen className="w-4 h-4 text-[#0078D4]" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200">Release log — Teams channel</span>
                <p className="text-[10px] text-[#0078D4]/70 dark:text-blue-400 font-medium mt-0.5">
                  Release record posted to Teams via Graph API · configure SHAREPOINT_SITE_ID for SharePoint list logging
                </p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-[#2E9E6B] shrink-0 ml-auto" />
            </div>
          ) : (
            <a href={r.sharepoint} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-950/30 transition-colors group">
              <BookOpen className="w-4 h-4 text-[#2E9E6B]" />
              <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200 group-hover:underline">SharePoint release log</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
          )
        ) : null}
        {r?.outlook ? (
          r.outlook.startsWith("herald:") ? (
            <div className="flex items-center gap-2.5 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-xl">
              <Calendar className="w-4 h-4 text-purple-500" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200">Outlook reminder</span>
                <p className="text-[10px] text-purple-600/70 dark:text-purple-400 font-medium mt-0.5">
                  Configure OUTLOOK_USER_ID in .env to enable live Outlook calendar events
                </p>
              </div>
            </div>
          ) : (
            <a href={r.outlook} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-950/30 transition-colors group">
              <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200 group-hover:underline">Outlook rollout reminder</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
          )
        ) : null}
        {r?.study_plans && (
          r.study_plans.startsWith("herald:") ? (
            <div className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
              <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200">Certification study plans</span>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400 font-medium mt-0.5">
                  Configure Teams to send personalized cert study plans to engineers
                </p>
              </div>
            </div>
          ) : (
            <a href={r.study_plans} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-950/30 transition-colors group">
              <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-[#201F1E] dark:text-slate-200 group-hover:underline">Study plans sent to team</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
            </a>
          )
        )}
      </div>
    </div>
  );
}

// ─── Run list item ───────────────────────────────────────────────────────────

function RunListItem({ run, selected, onClick }: { key?: React.Key; run: Run; selected: boolean; onClick: () => void }) {
  const statusDot: Record<RunStatus, string> = {
    reasoning:       "bg-blue-500 animate-pulse",
    ready_for_review:"bg-amber-400",
    approved:        "bg-purple-500",
    acting:          "bg-orange-400 animate-pulse",
    done:            "bg-emerald-500",
    error:           "bg-red-500"
  };

  const statusLabel: Record<RunStatus, string> = {
    reasoning:        "Reasoning…",
    ready_for_review: "Ready",
    approved:         "Approved",
    acting:           "Sending…",
    done:             "Done",
    error:            "Error"
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
        selected
          ? "bg-[#0078D4]/5 border-[#0078D4]/30 dark:bg-blue-950/20 dark:border-blue-800/40"
          : "bg-white dark:bg-slate-900 border-[#EDEBE9] dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${statusDot[run.status]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#201F1E] dark:text-slate-200 truncate">{run.pr_title}</p>
          <p className="text-[10px] text-[#605E5C] dark:text-slate-400 mt-0.5 font-mono">{run.repository} #{run.pr_number}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-slate-500">{statusLabel[run.status]}</span>
            {run.trigger_event && (
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                run.trigger_event === "merged"
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/50"
                  : run.trigger_event === "synchronize"
                  ? "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800/50"
                  : run.trigger_event === "opened"
                  ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/50"
                  : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:border-slate-700"
              }`}>
                {run.trigger_event === "merged" && <GitPullRequest className="w-2.5 h-2.5" />}
                {run.trigger_event === "synchronize" && <RotateCcw className="w-2.5 h-2.5" />}
                {run.trigger_event === "opened" && <Plus className="w-2.5 h-2.5" />}
                {run.trigger_event}
              </span>
            )}
            {run.impact_report && <RiskBadge level={run.impact_report.risk.level} />}
            {run.release_verdict && (
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${VERDICT_CFG[run.release_verdict.decision].chip}`}>
                {run.release_verdict.decision}
              </span>
            )}
            {run.ai_tier_used && run.status !== "reasoning" && (
              <AiTierBadge tier={run.ai_tier_used} />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function RunReviewScreen({ onBack }: RunReviewScreenProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"runs" | "repos">("runs");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isDemoTriggering, setIsDemoTriggering] = useState(false);

  // F8: persist edits per run ID so switching runs doesn't lose unsaved changes
  const editCache = useRef<Record<string, { changelog: string; docs: string; summary: string }>>({});
  const [editedChangelog, setEditedChangelog] = useState("");
  const [editedDocs, setEditedDocs] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [activeArtifactTab, setActiveArtifactTab] = useState<"changelog" | "docs" | "summary">("changelog");

  // Action toggles
  const [actTeams, setActTeams] = useState(true);
  const [actSharepoint, setActSharepoint] = useState(true);
  const [actOutlook, setActOutlook] = useState(false);
  const [actStudyPlans, setActStudyPlans] = useState(false);

  // High-risk confirm gate
  const [showHighRiskConfirm, setShowHighRiskConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRun = runs.find(r => r.run_id === selectedRunId) ?? null;

  // ── Load from cache or artifacts when run changes ─────────────────────────
  useEffect(() => {
    if (!selectedRun?.run_id) return;
    const cached = editCache.current[selectedRun.run_id];
    if (cached) {
      setEditedChangelog(cached.changelog);
      setEditedDocs(cached.docs);
      setEditedSummary(cached.summary);
    } else if (selectedRun.artifacts) {
      setEditedChangelog(selectedRun.artifacts.changelog_md);
      setEditedDocs(selectedRun.artifacts.docs_patch_md);
      setEditedSummary(selectedRun.artifacts.plain_summary);
    }
  }, [selectedRun?.run_id, selectedRun?.status]);

  // Save edits to cache whenever they change
  useEffect(() => {
    if (!selectedRunId) return;
    editCache.current[selectedRunId] = { changelog: editedChangelog, docs: editedDocs, summary: editedSummary };
  }, [selectedRunId, editedChangelog, editedDocs, editedSummary]);

  // ── Fetch runs ──────────────────────────────────────────────────────────────
  const fetchRuns = useCallback(async () => {
    try {
      const res = await apiFetch("/runs");
      if (res.ok) {
        const body = await res.json() as { items?: Run[] } | Run[];
        const data: Run[] = Array.isArray(body) ? body : (body.items ?? []);
        setRuns(data);
        if (!selectedRunId && data.length > 0) {
          setSelectedRunId(data[0].run_id);
        }
      }
    } catch {
      // offline graceful
    }
  }, [selectedRunId]);

  // Initial load
  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Poll while any run is in a transient state
  useEffect(() => {
    const hasTransient = runs.some(r => r.status === "reasoning" || r.status === "acting");
    if (!hasTransient) { setIsPolling(false); return; }

    setIsPolling(true);
    const id = setInterval(fetchRuns, 2500);
    return () => clearInterval(id);
  }, [runs, fetchRuns]);

  // ── Demo trigger ────────────────────────────────────────────────────────────
  const triggerDemo = async (fixture?: string) => {
    setIsDemoTriggering(true);
    try {
      const body = fixture
        ? { fixture }
        : { pr_title: "feat: Add Microsoft Graph webhook integration", branch: "feature/graph-webhooks", repository: "org/herald" };

      const res = await apiFetch("/runs/demo/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRunId(data.run_id);
        await fetchRuns();
      }
    } catch {
      showToast("Could not trigger demo run — server may be starting up.", "error");
    } finally {
      setIsDemoTriggering(false);
    }
  };

  // ── Approve ─────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selectedRun || selectedRun.status !== "ready_for_review") return;

    const isHighRisk = selectedRun.impact_report?.risk.level === "high";
    if (isHighRisk && !showHighRiskConfirm) {
      setShowHighRiskConfirm(true);
      return;
    }

    setShowHighRiskConfirm(false);
    setIsSubmitting(true);
    try {
      const approved_actions = [
        ...(actTeams ? ["teams"] : []),
        ...(actSharepoint ? ["sharepoint"] : []),
        ...(actOutlook ? ["outlook"] : []),
        ...(actStudyPlans ? ["study_plans"] : [])
      ];

      const res = await apiFetch(`/runs/${selectedRun.run_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edited_artifacts: {
            changelog_md: editedChangelog,
            docs_patch_md: editedDocs,
            plain_summary: editedSummary
          },
          approved_actions
        })
      });

      if (res.ok) {
        await fetchRuns();
      }
    } catch {
      showToast("Approve request failed — check server logs.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRun) return;
    await apiFetch(`/runs/${selectedRun.run_id}/reject`, { method: "POST" });
    await fetchRuns();
  };

  const approvedActionsCount = [actTeams, actSharepoint, actOutlook, actStudyPlans].filter(Boolean).length;
  const canApprove = selectedRun?.status === "ready_for_review" && approvedActionsCount > 0;
  const isReadOnly = !selectedRun || selectedRun.status !== "ready_for_review";

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F4F6FB] dark:bg-slate-950 transition-colors">

      {/* Page header + tab bar */}
      <div className="px-6 pt-6 pb-0 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#18223B] dark:text-slate-100 tracking-tight">
              {activeTab === "repos" ? "Repository Integration" : "Webhook Runs"}
            </h1>
            <p className="text-sm text-[#7C8499] dark:text-slate-400 mt-0.5">
              {activeTab === "repos"
                ? "Connect GitHub repos — every PR automatically triggers a Herald analysis run"
                : "PR events → Foundry reasoning → review → Microsoft 365 rollout"}
            </p>
          </div>
          {activeTab === "runs" && (
            <div className="flex items-center gap-3">
              {isPolling && (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#0078D4] uppercase tracking-wider">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Polling
                </span>
              )}
              <button
                onClick={() => fetchRuns()}
                className="p-2 rounded-lg border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Refresh runs"
              >
                <RefreshCw className="w-4 h-4 text-[#605E5C] dark:text-slate-400" />
              </button>
              <button
                onClick={() => triggerDemo()}
                disabled={isDemoTriggering}
                className="flex items-center gap-2 px-4 py-2 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                {isDemoTriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Demo Run
              </button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#EDEBE9] dark:border-slate-800">
          {([
            { id: "runs" as const, label: "Pipeline Runs", icon: <GitBranch className="w-3.5 h-3.5" />, count: runs.filter(r => r.status === "reasoning" || r.status === "acting").length },
            { id: "repos" as const, label: "Repositories", icon: <Database className="w-3.5 h-3.5" />, count: null }
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer -mb-px ${
                activeTab === tab.id
                  ? "border-[#0078D4] text-[#0078D4]"
                  : "border-transparent text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-200"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-[#0078D4]/10 text-[#0078D4]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Repos tab */}
      {activeTab === "repos" && <RepoConnectPanel />}

      {/* Runs tab body */}
      {activeTab === "runs" && <div className="flex flex-1 gap-4 px-6 pb-6 pt-4 min-h-0 flex-col lg:flex-row">

        {/* Left: Run list */}
        <aside className="lg:w-72 shrink-0 flex flex-col gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-3 flex flex-col gap-2 max-h-[60vh] lg:max-h-none lg:flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <div className="text-center py-8 px-3">
                <GitBranch className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-[#605E5C] dark:text-slate-400">No runs yet</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 mb-4 leading-relaxed">
                  Connect a repo in the <strong>Repositories</strong> tab, or trigger a curated demo run:
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { fixture: "feature-pr", label: "Feature PR", color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800/50 dark:text-blue-400" },
                    { fixture: "bugfix-pr", label: "Bugfix PR", color: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/20 dark:border-purple-800/50 dark:text-purple-400" },
                    { fixture: "breaking-pr", label: "Breaking Change", color: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-400" },
                    { fixture: "unowned-pr", label: "Unowned Change → Abstain", color: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800/50 dark:text-amber-400" }
                  ].map(f => (
                    <button
                      key={f.fixture}
                      onClick={() => triggerDemo(f.fixture)}
                      disabled={isDemoTriggering}
                      className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${f.color}`}
                    >
                      {isDemoTriggering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              runs.map((run: Run) => (
                <RunListItem
                  key={run.run_id}
                  run={run}
                  selected={selectedRunId === run.run_id}
                  onClick={() => setSelectedRunId(run.run_id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Right: Review screen */}
        <main className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">

          {!selectedRun ? (
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-12 text-center">
              <div>
                <Sparkles className="w-12 h-12 mx-auto text-[#0078D4]/30 mb-4" />
                <h3 className="text-base font-bold text-[#201F1E] dark:text-slate-200">Select a run</h3>
                <p className="text-sm text-[#605E5C] dark:text-slate-400 mt-1 max-w-sm">
                  Choose a pipeline run from the list, or trigger a demo to see Herald in action.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header card */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest mb-1 font-mono">
                      {selectedRun.repository} #{selectedRun.pr_number}
                    </p>
                    <h2 className="text-lg font-extrabold text-[#18223B] dark:text-slate-100 tracking-tight">{selectedRun.pr_title}</h2>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[#7C8499] dark:text-slate-400 font-medium">
                      <span className="flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" />{selectedRun.branch}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />by {selectedRun.merged_by}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(selectedRun.merged_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {selectedRun.impact_report && (
                    <RiskBadge level={selectedRun.impact_report.risk.level} />
                  )}
                </div>

                <StatusBanner status={selectedRun.status} error={selectedRun.error} tier={selectedRun.ai_tier_used} stages={selectedRun.pipeline_stages} />
              </div>

              {/* Release Verdict — the deterministic adjudicator's decision */}
              {selectedRun.release_verdict && (
                <VerdictBanner verdict={selectedRun.release_verdict} />
              )}

              {/* Confirmation view */}
              {selectedRun.status === "done" && selectedRun.actions_result && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-800/40 shadow-sm p-5">
                  <ConfirmationView run={selectedRun} />
                </div>
              )}

              {/* Two-column body (only when report is available) */}
              {selectedRun.impact_report && (
                <div className="flex flex-col xl:flex-row gap-4">

                  {/* Impact panel */}
                  <div className="xl:w-80 shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest">Impact</h3>
                      <AiTierBadge tier={selectedRun.ai_tier_used} />
                    </div>

                    <div>
                      <RiskBadge level={selectedRun.impact_report.risk.level} />
                      <p className="text-xs text-[#605E5C] dark:text-slate-400 mt-2 leading-relaxed font-medium">
                        {selectedRun.impact_report.risk.rationale}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest mb-2">Summary</p>
                      <p className="text-xs text-[#323130] dark:text-slate-300 leading-relaxed">{selectedRun.impact_report.summary}</p>
                    </div>

                    {selectedRun.impact_report.breaking_changes.length > 0 && (
                      <div className="p-3 bg-[#D5544A]/5 border border-[#D5544A]/20 rounded-lg">
                        <p className="text-[10px] font-bold text-[#D5544A] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" /> Breaking Changes
                        </p>
                        <ul className="space-y-1">
                          {selectedRun.impact_report.breaking_changes.map((bc, i) => (
                            <li key={i} className="text-xs text-[#D5544A] font-medium">{bc}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedRun.impact_report.impacted_areas.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest mb-2">Impacted Areas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRun.impact_report.impacted_areas.map((area, i) => (
                            <span key={i} className="px-2 py-0.5 bg-[#0078D4]/5 border border-[#0078D4]/15 rounded text-[10px] font-bold text-[#0078D4]">
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedRun.impact_report.audience.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest mb-2">Notification Audience</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedRun.impact_report.audience.map((a, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 rounded text-[10px] font-medium text-[#605E5C] dark:text-slate-400">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <ReasoningTrace steps={selectedRun.impact_report.reasoning_trace} tier={selectedRun.ai_tier_used} />

                    {/* Team Readiness (Reasoning Agents track) */}
                    {selectedRun.team_readiness && (
                      <div className="border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-900/30">
                        <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-500" />
                          Team Readiness
                        </p>
                        <TeamReadinessPanel report={selectedRun.team_readiness} />
                      </div>
                    )}

                    {/* Blast radius + provenance (ontology cascade + signed attestation) */}
                    {selectedRun.impact_report && (
                      <BlastRadiusPanel runId={selectedRun.run_id} />
                    )}
                  </div>

                  {/* Artifacts panel */}
                  <div className="flex-1 flex flex-col gap-4 min-w-0">
                    {selectedRun.artifacts && (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col">

                        {/* Tabs */}
                        <div className="flex border-b border-[#EDEBE9] dark:border-slate-800 bg-gray-50 dark:bg-slate-900/40">
                          {[
                            { id: "changelog" as const, label: "Changelog", icon: <FileText className="w-3.5 h-3.5" /> },
                            { id: "docs" as const, label: "Docs Update", icon: <BookOpen className="w-3.5 h-3.5" /> },
                            { id: "summary" as const, label: "Plain Summary", icon: <MessageSquare className="w-3.5 h-3.5" /> }
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveArtifactTab(tab.id)}
                              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                                activeArtifactTab === tab.id
                                  ? "border-[#0078D4] text-[#0078D4] bg-white dark:bg-slate-900"
                                  : "border-transparent text-[#605E5C] dark:text-slate-400 hover:text-[#201F1E] dark:hover:text-slate-200"
                              }`}
                              aria-selected={activeArtifactTab === tab.id}
                              role="tab"
                            >
                              {tab.icon}
                              {tab.label}
                              {!isReadOnly && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Editable" />}
                            </button>
                          ))}
                        </div>

                        <div className="p-4 flex-1">
                          {activeArtifactTab === "changelog" && (
                            <ArtifactEditor value={editedChangelog} onChange={setEditedChangelog} readOnly={isReadOnly} label="Changelog" />
                          )}
                          {activeArtifactTab === "docs" && (
                            <ArtifactEditor value={editedDocs} onChange={setEditedDocs} readOnly={isReadOnly} label="Docs update" />
                          )}
                          {activeArtifactTab === "summary" && (
                            <ArtifactEditor value={editedSummary} onChange={setEditedSummary} readOnly={isReadOnly} label="Plain summary" />
                          )}
                          {!isReadOnly && (
                            <p className="text-[10px] text-[#7C8499] dark:text-slate-500 mt-2 font-medium">
                              Edits are saved in the approval request — your changes will be sent as-is.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions bar */}
                    {selectedRun.status === "ready_for_review" && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-[#EDEBE9] dark:border-slate-800/80 shadow-sm p-6">
                        <div className="mb-5">
                          <p className="text-sm font-bold text-[#201F1E] dark:text-slate-100">Select Enterprise Actions</p>
                          <p className="text-xs text-[#7C8499] dark:text-slate-400 mt-0.5">Choose where to send this release notification</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-5">
                          <ActionToggle
                            id="act-teams"
                            label="Teams"
                            description="Post announcement to your Microsoft Teams channel"
                            icon={<MessageSquare className="w-5 h-5" />}
                            checked={actTeams}
                            onChange={setActTeams}
                            disabled={isSubmitting}
                          />
                          <ActionToggle
                            id="act-sharepoint"
                            label="SharePoint"
                            description="Append entry to the SharePoint release log"
                            icon={<BookOpen className="w-5 h-5" />}
                            checked={actSharepoint}
                            onChange={setActSharepoint}
                            disabled={isSubmitting}
                          />
                          <ActionToggle
                            id="act-outlook"
                            label="Outlook"
                            description="Create a rollout reminder in Outlook calendar"
                            icon={<Calendar className="w-5 h-5" />}
                            checked={actOutlook}
                            onChange={setActOutlook}
                            disabled={isSubmitting}
                          />
                          {selectedRun.team_readiness && selectedRun.team_readiness.gaps.length > 0 && (
                            <ActionToggle
                              id="act-study-plans"
                              label="Study Plans"
                              description={`Send cert study plans to ${selectedRun.team_readiness.gaps.length} engineer${selectedRun.team_readiness.gaps.length !== 1 ? "s" : ""} via Teams`}
                              icon={<GraduationCap className="w-5 h-5" />}
                              checked={actStudyPlans}
                              onChange={setActStudyPlans}
                              disabled={isSubmitting}
                            />
                          )}
                        </div>

                        {/* High-risk confirmation gate */}
                        {showHighRiskConfirm && (
                          <div className="p-3 mb-3 bg-[#D5544A]/5 border border-[#D5544A]/30 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-[#D5544A] shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-[#D5544A] mb-1">High-risk change — please confirm</p>
                              <p className="text-xs text-[#605E5C] dark:text-slate-400 leading-relaxed">
                                This PR has been classified as <strong>high risk</strong>. Clicking Approve below will send the notification to <strong>{approvedActionsCount} target{approvedActionsCount !== 1 ? "s" : ""}</strong>. Are you sure?
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={handleReject}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-5 py-3 border-2 border-[#EDEBE9] dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-[#605E5C] dark:text-slate-400 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Ban className="w-4 h-4" /> Reject
                          </button>
                          <button
                            onClick={handleApprove}
                            disabled={!canApprove || isSubmitting}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0078D4] hover:bg-[#005faa] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md"
                            aria-label={`Approve and send to ${approvedActionsCount} action${approvedActionsCount !== 1 ? "s" : ""}`}
                          >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {showHighRiskConfirm ? "Confirm & Send" : `Approve & Send (${approvedActionsCount})`}
                          </button>
                        </div>

                        {approvedActionsCount === 0 && (
                          <p className="text-xs text-[#D5544A] font-semibold text-center mt-3">
                            Select at least one action before approving.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>}

    </div>
  );
}
