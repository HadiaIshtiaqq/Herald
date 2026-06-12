import React, { useState } from "react";
import {
  GraduationCap, ChevronDown, ChevronRight, CheckCircle2,
  AlertTriangle, Clock, BookOpen, Zap, Users, TrendingUp,
  FileText, XCircle, Loader2
} from "lucide-react";
import { TeamReadinessReport, CertGap } from "../types";
import { apiFetch } from "../lib/api";

// ── Practice questions (Assessment Agent — grounded, cited, graded) ──────────

interface PracticeQuestion {
  question: string;
  options: string[];
  answer_index: number;
  why: string;
  citation: { file: string; heading: string };
}

interface PracticeSet {
  cert_id: string;
  generator: "ai" | "deterministic";
  questions: PracticeQuestion[];
}

interface GradeResult {
  score_pct: number;
  correct: number;
  total: number;
  passed: boolean;
  trend: string;
  attempts_for_cert: number;
  feedback: { correct: boolean; why: string; citation: { file: string; heading: string } }[];
}

function PracticeSection({ certs, member }: { certs: string[]; member: string }) {
  const [set, setSet] = useState<PracticeSet | null>(null);
  const [selections, setSelections] = useState<number[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = async (cert: string) => {
    setLoading(cert); setError(null); setResult(null); setSet(null);
    try {
      const res = await apiFetch(`/assessment/${cert}?n=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as PracticeSet;
      setSet(data);
      setSelections(new Array(data.questions.length).fill(-1));
    } catch (e) {
      setError(`Could not generate questions: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const grade = async () => {
    if (!set) return;
    setLoading("grade"); setError(null);
    try {
      const res = await apiFetch(`/assessment/${set.cert_id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member, questions: set.questions, selections, generator: set.generator })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json() as GradeResult);
    } catch (e) {
      setError(`Grading failed: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const allAnswered = set !== null && selections.every(s => s >= 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold text-[#7C8499] dark:text-slate-500 uppercase tracking-widest">
          Practice questions
        </span>
        {certs.map(cert => (
          <button key={cert} onClick={() => loadQuestions(cert)} disabled={loading !== null}
            className="flex items-center gap-1 px-2 py-0.5 bg-[#0078D4]/5 hover:bg-[#0078D4]/15 border border-[#0078D4]/25 rounded text-[10px] font-extrabold text-[#0078D4] uppercase transition-colors cursor-pointer disabled:opacity-50">
            {loading === cert ? <Loader2 className="w-3 h-3 animate-spin" /> : <GraduationCap className="w-3 h-3" />}
            {cert}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-[10px] text-[#D5544A] font-semibold">{error}</p>
      )}

      {set && (
        <div className="space-y-2">
          <p className="text-[10px] text-[#605E5C] dark:text-slate-400">
            {set.questions.length} question{set.questions.length !== 1 ? "s" : ""} for <strong>{set.cert_id}</strong>,
            grounded in the approved knowledge base
            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
              set.generator === "ai" ? "bg-[#2E9E6B]/10 text-[#2E9E6B]" : "bg-[#E0A93B]/10 text-[#E0A93B]"
            }`}>{set.generator === "ai" ? "AI-generated" : "Deterministic"}</span>
          </p>
          {set.questions.map((q, qi) => {
            const fb = result?.feedback[qi];
            return (
              <div key={qi} className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800 space-y-1.5">
                <p className="text-[11px] font-bold text-[#201F1E] dark:text-slate-200 leading-snug">
                  {qi + 1}. {q.question}
                </p>
                <div className="space-y-1">
                  {q.options.map((opt, oi) => {
                    const selected = selections[qi] === oi;
                    const showCorrect = result !== null && oi === q.answer_index;
                    const showWrong = result !== null && selected && oi !== q.answer_index;
                    return (
                      <button key={oi} disabled={result !== null}
                        onClick={() => setSelections(prev => prev.map((s, i) => i === qi ? oi : s))}
                        className={`w-full text-left px-2 py-1 rounded border text-[10px] leading-snug transition-colors cursor-pointer disabled:cursor-default ${
                          showCorrect ? "border-[#2E9E6B] bg-[#2E9E6B]/8 text-[#2E9E6B] font-bold" :
                          showWrong ? "border-[#D5544A] bg-[#D5544A]/8 text-[#D5544A]" :
                          selected ? "border-[#0078D4] bg-[#0078D4]/8 text-[#0078D4] font-semibold" :
                          "border-[#EDEBE9] dark:border-slate-800 text-[#323130] dark:text-slate-300 hover:border-[#0078D4]/40"
                        }`}>
                        {showCorrect && <CheckCircle2 className="w-3 h-3 inline mr-1 -mt-0.5" />}
                        {showWrong && <XCircle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {fb && (
                  <p className="text-[10px] text-[#605E5C] dark:text-slate-400 leading-snug">{fb.why}</p>
                )}
                <p className="flex items-center gap-1 text-[9px] text-[#7C8499] dark:text-slate-500">
                  <FileText className="w-2.5 h-2.5" />
                  {q.citation.file} · {q.citation.heading}
                </p>
              </div>
            );
          })}

          {result === null ? (
            <button onClick={grade} disabled={!allAnswered || loading === "grade"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0078D4] hover:bg-[#106EBE] disabled:opacity-40 rounded text-[11px] font-bold text-white transition-colors cursor-pointer disabled:cursor-default">
              {loading === "grade" && <Loader2 className="w-3 h-3 animate-spin" />}
              Check answers
            </button>
          ) : (
            <div className={`flex items-start gap-2 p-2 rounded-lg border ${
              result.passed ? "bg-[#2E9E6B]/5 border-[#2E9E6B]/25" : "bg-[#E0A93B]/5 border-[#E0A93B]/25"
            }`}>
              {result.passed
                ? <CheckCircle2 className="w-4 h-4 text-[#2E9E6B] shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-[#E0A93B] shrink-0 mt-0.5" />}
              <div className="text-[11px] leading-snug">
                <p className={`font-bold ${result.passed ? "text-[#2E9E6B]" : "text-[#E0A93B]"}`}>
                  {result.score_pct}% — {result.correct}/{result.total} correct
                  {result.passed ? " · ready" : " · keep studying"}
                </p>
                <p className="text-[10px] text-[#605E5C] dark:text-slate-400 mt-0.5">
                  Attempt {result.attempts_for_cert} · {result.trend}
                </p>
                <button onClick={() => loadQuestions(set.cert_id)}
                  className="text-[10px] font-bold text-[#0078D4] hover:underline mt-1 cursor-pointer">
                  Try a new set →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessScore({ score, blocking }: { score: number; blocking: boolean }) {
  const color = blocking ? "#D5544A" : score >= 80 ? "#2E9E6B" : score >= 50 ? "#E0A93B" : "#D5544A";
  const label = blocking ? "Deployment Risk" : score >= 80 ? "Ready" : score >= 50 ? "Partial" : "At Risk";

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16 shrink-0">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor"
            className="text-gray-100 dark:text-slate-800" strokeWidth="6" />
          <circle cx="36" cy="36" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold"
          style={{ color }}>{score}%</span>
      </div>
      <div>
        <p className="text-sm font-bold" style={{ color }}>{label}</p>
        <p className="text-[11px] text-[#605E5C] dark:text-slate-400 mt-0.5 leading-snug">
          Team certification readiness
        </p>
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: CertGap; [k: string]: unknown }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[#EDEBE9] dark:border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#D5544A]/10 border border-[#D5544A]/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-3 h-3 text-[#D5544A]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#201F1E] dark:text-slate-200 truncate">{gap.name}</p>
            <p className="text-[10px] text-[#605E5C] dark:text-slate-400">{gap.role} · {gap.team}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="flex gap-1">
            {gap.missing_certs.map(cert => (
              <span key={cert}
                className="px-1.5 py-0.5 bg-[#D5544A]/8 border border-[#D5544A]/20 rounded text-[9px] font-extrabold text-[#D5544A] uppercase">
                {cert}
              </span>
            ))}
          </div>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-gray-50/50 dark:bg-slate-900/30 border-t border-[#EDEBE9] dark:border-slate-800 space-y-2">
          {gap.study_plans.map(plan => (
            <div key={plan.certification}
              className="flex items-start gap-2.5 p-2 bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800">
              <BookOpen className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${plan.priority === "high" ? "text-[#D5544A]" : plan.priority === "medium" ? "text-[#E0A93B]" : "text-[#0078D4]"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-extrabold text-[#201F1E] dark:text-slate-200">{plan.certification}</span>
                  <span className="text-[10px] text-[#605E5C] dark:text-slate-400">— {plan.cert_name}</span>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                    plan.priority === "high" ? "bg-[#D5544A]/10 text-[#D5544A]" :
                    plan.priority === "medium" ? "bg-[#E0A93B]/10 text-[#E0A93B]" :
                    "bg-[#0078D4]/10 text-[#0078D4]"
                  }`}>{plan.priority}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-[10px] text-[#605E5C] dark:text-slate-400">
                    <Clock className="w-3 h-3" />{plan.recommended_hours}h total
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[#605E5C] dark:text-slate-400">
                    <TrendingUp className="w-3 h-3" />{plan.weekly_capacity_hours}h/week capacity
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[#605E5C] dark:text-slate-400">
                    <Zap className="w-3 h-3" />~{plan.estimated_weeks}w to complete
                  </span>
                  <span className="text-[10px] font-semibold text-[#0078D4]">
                    {plan.suggested_window} slot
                  </span>
                </div>
              </div>
            </div>
          ))}

          <PracticeSection certs={gap.missing_certs} member={gap.name} />
        </div>
      )}
    </div>
  );
}

interface TeamReadinessPanelProps {
  report: TeamReadinessReport;
}

export default function TeamReadinessPanel({ report }: TeamReadinessPanelProps) {
  const [traceExpanded, setTraceExpanded] = useState(false);

  return (
    <div className="space-y-4">

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <ReadinessScore score={report.overall_score} blocking={report.blocking_deployment} />
        <div className="flex items-center gap-2 text-xs font-semibold text-[#605E5C] dark:text-slate-400">
          <Users className="w-3.5 h-3.5" />
          {report.ready_count} of {report.total_count} engineers certified
        </div>
      </div>

      {/* Blocking banner */}
      {report.blocking_deployment && (
        <div className="flex items-start gap-2.5 p-3 bg-[#D5544A]/5 border border-[#D5544A]/25 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-[#D5544A] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-[#D5544A]">Deployment risk detected</p>
            <p className="text-[11px] text-[#605E5C] dark:text-slate-400 mt-0.5 leading-relaxed">
              Critical certification gaps found in teams owning the affected services.
              Study plans have been generated — resolve before rolling out.
            </p>
          </div>
        </div>
      )}

      {report.total_count > 0 && !report.blocking_deployment && report.gaps.length > 0 && (
        <div className="flex items-start gap-2.5 p-3 bg-[#E0A93B]/5 border border-[#E0A93B]/25 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-[#E0A93B] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#605E5C] dark:text-slate-400 leading-relaxed">
            Some engineers have cert gaps — study plans generated below.
            Deployment can proceed with awareness.
          </p>
        </div>
      )}

      {report.gaps.length === 0 && report.total_count > 0 && (
        <div className="flex items-center gap-2.5 p-3 bg-[#2E9E6B]/5 border border-[#2E9E6B]/25 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-[#2E9E6B] shrink-0" />
          <p className="text-[11px] text-[#2E9E6B] font-semibold">
            All engineers on affected teams are certified — safe to proceed.
          </p>
        </div>
      )}

      {/* Required certs */}
      {report.required_certifications.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-500 uppercase tracking-widest mb-1.5">
            Required for affected areas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {report.required_certifications.map(cert => (
              <span key={cert}
                className="px-2 py-0.5 bg-[#0078D4]/5 border border-[#0078D4]/20 rounded text-[10px] font-extrabold text-[#0078D4] uppercase">
                {cert}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {report.gaps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-500 uppercase tracking-widest">
            Study plans — {report.gaps.length} engineer{report.gaps.length !== 1 ? "s" : ""} with gaps
          </p>
          {report.gaps.map(gap => (
            <GapCard key={gap.member_id} gap={gap} />
          ))}
        </div>
      )}

      {/* Reasoning trace */}
      {report.reasoning_trace.length > 0 && (
        <div className="border border-[#EDEBE9] dark:border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setTraceExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-900/50 hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
            aria-expanded={traceExpanded}
          >
            <span className="flex items-center gap-2 text-xs font-bold text-[#605E5C] dark:text-slate-400 uppercase tracking-wider">
              <GraduationCap className="w-3.5 h-3.5 text-emerald-500" />
              Readiness reasoning ({report.reasoning_trace.length} steps)
            </span>
            {traceExpanded
              ? <ChevronDown className="w-4 h-4 text-gray-400" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
          {traceExpanded && (
            <ol className="divide-y divide-[#EDEBE9] dark:divide-slate-800" aria-label="Readiness reasoning steps">
              {report.reasoning_trace.map((step, i) => (
                <li key={i} className="flex gap-3 px-4 py-3 text-xs text-[#323130] dark:text-slate-300">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center border border-emerald-200 dark:border-emerald-800/60">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed font-medium">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
