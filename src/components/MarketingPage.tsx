import { motion, useReducedMotion } from "motion/react";
import {
  ShieldCheck, GitMerge, Radiation, Brain, BarChart3, FileBadge,
  Sparkles, ArrowRight, PlayCircle, Workflow, Network, GraduationCap,
  Bot, CheckCircle2, QrCode, Activity, Layers, Boxes, ScanLine, Scale,
} from "lucide-react";
import { AnimatedCounter, Reveal, Stagger, StaggerItem } from "../lib/motion.js";
import HeraldLogo from "./HeraldLogo.js";

interface MarketingPageProps {
  onBackToApp: () => void;
  ctaLabel?: string;
  onDemo?: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

// ── Hero centerpiece: an animated "release passport" ─────────────────────────
function ReleasePassport() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.35, ease: EASE }}
      className="relative w-full max-w-md"
      style={{ perspective: 1200 }}
    >
      <motion.div
        animate={reduce ? {} : { y: [0, -12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="gradient-border rounded-2xl"
      >
        <div className="rounded-2xl bg-[#0f1830] text-white p-5 shadow-2xl shadow-blue-950/40 border border-white/10 overflow-hidden relative">
          {/* faint grid + glow */}
          <div className="absolute inset-0 grid-backdrop opacity-40 pointer-events-none" />
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#EC7A3C]/20 blur-3xl pointer-events-none" />

          {/* header row */}
          <div className="relative flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HeraldLogo size={28} />
              <div className="leading-tight">
                <p className="text-[11px] font-bold tracking-wide">Release Passport</p>
                <p className="text-[9px] text-blue-200/70 font-mono">herald-attestation/v1</p>
              </div>
            </div>
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.5, ease: EASE }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[9px] font-bold"
            >
              <ShieldCheck className="w-3 h-3" /> SIGNATURE VERIFIED
            </motion.span>
          </div>

          {/* health ring + meta */}
          <div className="relative flex items-center gap-4 mb-4">
            <HealthRing value={92} />
            <div className="flex-1 space-y-1.5 text-[10px]">
              <Row label="AI tier" value="foundry-agent" tone="blue" />
              <Row label="Risk" value="contained" tone="emerald" />
              <Row label="Human approval" value="granted" tone="emerald" />
            </div>
          </div>

          {/* mini dependency graph */}
          <div className="relative rounded-xl bg-black/30 border border-white/10 p-3 mb-3">
            <p className="text-[8px] font-bold text-blue-200/60 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Network className="w-2.5 h-2.5" /> Blast radius
            </p>
            <MiniGraph />
          </div>

          {/* footer: QR passport + tier chips */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] text-blue-200/70">
              <QrCode className="w-7 h-7 text-white/80" />
              <span className="font-mono leading-tight">
                trace 9f3c…a21e<br />verifiable in 1 call
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[8px] font-bold tracking-wide">GROUNDED · CITED</span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[8px] font-bold tracking-wide">TAMPER-EVIDENT</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "blue" | "emerald" }) {
  const c = tone === "blue" ? "text-blue-300" : "text-emerald-300";
  return (
    <div className="flex items-center justify-between">
      <span className="text-blue-200/50">{label}</span>
      <span className={`font-mono font-bold ${c}`}>{value}</span>
    </div>
  );
}

function HealthRing({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <motion.circle
          cx="34" cy="34" r={r} fill="none" stroke="#34d399" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: reduce ? circ * (1 - value / 100) : circ * (1 - value / 100) }}
          transition={{ duration: 1.6, delay: 0.8, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold leading-none">
          <AnimatedCounter value={value} duration={1.6} />
        </span>
        <span className="text-[7px] font-bold text-emerald-300 tracking-widest">HEALTH</span>
      </div>
    </div>
  );
}

function MiniGraph() {
  // small fixed layout: 5 nodes, one hot cascade edge that "flows"
  const nodes = [
    { x: 24, y: 34, hot: true, origin: true },
    { x: 70, y: 16, hot: true },
    { x: 70, y: 52, hot: false },
    { x: 116, y: 22, hot: false },
    { x: 116, y: 50, hot: true },
  ];
  const edges = [
    { a: 0, b: 1, hot: true },
    { a: 0, b: 2, hot: false },
    { a: 1, b: 3, hot: false },
    { a: 1, b: 4, hot: true },
  ];
  return (
    <svg viewBox="0 0 140 68" className="w-full h-[56px]">
      {edges.map((e, i) => {
        const A = nodes[e.a], B = nodes[e.b];
        return (
          <line
            key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
            stroke={e.hot ? "#f87171" : "rgba(148,163,184,0.4)"}
            strokeWidth={e.hot ? 1.6 : 1}
            strokeDasharray={e.hot ? "4 4" : ""}
            className={e.hot ? "edge-flow" : ""}
          />
        );
      })}
      {nodes.map((n, i) => (
        <g key={i}>
          {n.origin && (
            <circle cx={n.x} cy={n.y} r="8" fill="none" stroke="#f87171" strokeWidth="1.5" className="glow-pulse" />
          )}
          <circle
            cx={n.x} cy={n.y} r="5"
            fill={n.hot ? "#f87171" : "#60a5fa"}
            stroke="#0f1830" strokeWidth="1.5"
          />
        </g>
      ))}
    </svg>
  );
}

// ── Stat band ─────────────────────────────────────────────────────────────────
const STATS = [
  { value: 4, suffix: "-tier", label: "Live Azure AI fallback chain" },
  { value: 8, suffix: "", label: "Coordinated specialist agents" },
  { value: 100, suffix: "%", label: "Self-check evaluation suite" },
  { value: 2, prefix: "<", suffix: " min", label: "Merge → org-wide rollout" },
];

// ── IQ layers ───────────────────────────────────────────────────────────────
const IQ_LAYERS = [
  {
    icon: Brain, tint: "#0078D4",
    name: "Foundry IQ",
    tag: "Grounding",
    body: "Impact analysis and practice questions are grounded in a curated knowledge base — every claim cites its source file and heading, or it doesn't ship.",
  },
  {
    icon: Activity, tint: "#2E9E6B",
    name: "Work IQ",
    tag: "Work context",
    body: "Live Microsoft 365 calendar signals shape study plans around real meeting load and focus hours — capacity-aware, not calendar-blind.",
  },
  {
    icon: Network, tint: "#EC7A3C",
    name: "Fabric IQ",
    tag: "Semantic layer",
    body: "A deterministic ontology links service areas to skills, certifications and roles — so every recommendation carries the relation path that justified it.",
  },
];

// ── Capability bento (the differentiators) ───────────────────────────────────
const CAPS = [
  { icon: Scale, tint: "#A4262C", title: "A verdict it can defend", body: "AI forms the analysis; a deterministic policy owns the call — Clear, Blocked, or Abstain. It re-derives ownership from the diff, rejects false cert conflicts, and refuses to certify a change it can't ground." },
  { icon: FileBadge, tint: "#0078D4", title: "Signed provenance + QR passport", body: "HMAC-signed attestation of AI tier, content hashes and human approval — rendered as a scannable release passport, verifiable in one call." },
  { icon: Radiation, tint: "#EC7A3C", title: "Blast radius & failure replay", body: "Walk the dependency graph in reverse to score transitive impact, then watch a deterministic worst-case cascade replay with a live integrity meter." },
  { icon: BarChart3, tint: "#2E9E6B", title: "Release health score", body: "A 0–100 grade across readiness, blast containment, approval hygiene and AI grounding — each dimension carrying the evidence behind it." },
  { icon: GraduationCap, tint: "#9B30FF", title: "Grounded, graded assessments", body: "Cited practice questions per cert gap, graded with per-question feedback and score trends across attempts." },
  { icon: Bot, tint: "#0078D4", title: "GitHub Copilot extension", body: "@herald commands stream straight into Copilot Chat — status, analyze, readiness — RSA-SHA256 verified." },
  { icon: ScanLine, tint: "#A4262C", title: "Executive report", body: "One click renders a print-ready leadership brief: scorecard, cascade table, cert gaps and a phased remediation roadmap." },
];

// ── Pipeline steps ────────────────────────────────────────────────────────────
const PIPELINE = [
  { icon: GitMerge, label: "PR merged", sub: "HMAC-verified webhook" },
  { icon: Brain, label: "Reason", sub: "6-step impact analysis" },
  { icon: GraduationCap, label: "Assess readiness", sub: "Cert gaps + study plans" },
  { icon: Scale, label: "Verdict", sub: "Clear · Blocked · Abstain" },
  { icon: ShieldCheck, label: "Human gate", sub: "Approve with edits" },
  { icon: Workflow, label: "Act", sub: "Teams · SharePoint · Outlook" },
];

export default function MarketingPage({ onBackToApp, ctaLabel, onDemo }: MarketingPageProps) {
  return (
    <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
        {/* aurora mesh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="aurora-blob bg-[#0078D4]/30 dark:bg-[#0078D4]/40 w-[40rem] h-[40rem] -top-40 -left-32" style={{ animationDelay: "0s" }} />
          <div className="aurora-blob bg-[#EC7A3C]/25 dark:bg-[#EC7A3C]/30 w-[34rem] h-[34rem] top-10 -right-32" style={{ animationDelay: "-6s" }} />
          <div className="aurora-blob bg-[#9B30FF]/15 dark:bg-[#9B30FF]/20 w-[30rem] h-[30rem] bottom-0 left-1/3" style={{ animationDelay: "-11s" }} />
        </div>
        <div className="absolute inset-0 grid-backdrop pointer-events-none" />

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          {/* left: copy */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 dark:bg-white/5 backdrop-blur border border-[#EDEBE9] dark:border-white/10 text-xs font-bold text-[#0078D4] dark:text-blue-300 shadow-sm mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Microsoft Agents League · AI Skills Fest 2026
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="font-display text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] text-[#0f1830] dark:text-white"
            >
              Every merge asks
              <br />
              one question.
              <br />
              <span className="shimmer-text">Can your team ship it?</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
              className="mt-6 text-base md:text-lg text-[#404752] dark:text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Herald turns every merged pull request into a reasoned, risk-scored,
              <span className="text-[#0f1830] dark:text-white font-semibold"> certification-aware </span>
              release — then returns a verdict it can defend:
              <span className="text-[#0f1830] dark:text-white font-semibold"> Clear, Blocked, or — when it can't ground the call — Abstain.</span>
              {" "}Grounded in live Azure AI, signed for audit, executed across Microsoft 365 behind a human gate.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
              className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
            >
              <button
                onClick={onBackToApp}
                className="group inline-flex items-center justify-center gap-2 bg-[#0078D4] hover:bg-[#005faa] text-white py-3.5 px-7 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
              >
                {ctaLabel ?? "Launch the console"}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                onClick={onDemo ?? onBackToApp}
                className="inline-flex items-center justify-center gap-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 text-[#201F1E] dark:text-slate-200 py-3.5 px-7 rounded-xl text-sm font-bold border border-[#EDEBE9] dark:border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                <PlayCircle className="w-4 h-4 text-[#EC7A3C]" />
                {onDemo ? "Explore the demo" : "Watch the demo"}
              </button>
            </motion.div>

            {/* runs-on strip */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center lg:justify-start text-[11px] font-bold text-[#7C8499] dark:text-slate-500 uppercase tracking-wider"
            >
              <span className="text-[#605E5C] dark:text-slate-400">Runs on</span>
              <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#0078D4]" /> Azure AI Foundry</span>
              <span className="flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5 text-[#2E9E6B]" /> Microsoft Graph</span>
              <span className="flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-[#9B30FF]" /> GitHub Copilot</span>
            </motion.div>
          </div>

          {/* right: animated passport */}
          <div className="flex justify-center lg:justify-end">
            <ReleasePassport />
          </div>
        </div>
      </section>

      {/* ── STAT BAND ────────────────────────────────────────────────────── */}
      <section className="relative border-y border-[#EDEBE9] dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-900/40">
        <Stagger className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#EDEBE9] dark:divide-slate-800">
          {STATS.map((s) => (
            <StaggerItem key={s.label} className="px-6 py-8 text-center">
              <div className="font-display text-4xl md:text-5xl font-extrabold text-[#0f1830] dark:text-white">
                <AnimatedCounter value={s.value} prefix={s.prefix ?? ""} suffix={s.suffix} />
              </div>
              <p className="mt-2 text-[11px] md:text-xs font-semibold text-[#605E5C] dark:text-slate-400 leading-snug">{s.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── THREE IQ LAYERS ──────────────────────────────────────────────── */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-bold text-[#0078D4] dark:text-blue-400 uppercase tracking-widest mb-3">Three IQ patterns, one runtime</p>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0f1830] dark:text-white tracking-tight">
            Answers you can trace, not vibes
          </h2>
          <p className="mt-4 text-[#605E5C] dark:text-slate-400 leading-relaxed">
            Herald implements Microsoft's Foundry, Work and Fabric IQ patterns as inspectable code — grounding, work context and a semantic layer working together on every release.
          </p>
        </Reveal>

        <Stagger className="grid md:grid-cols-3 gap-5">
          {IQ_LAYERS.map((l) => (
            <StaggerItem key={l.name}>
              <div className="group h-full rounded-2xl border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${l.tint}14`, color: l.tint }}>
                  <l.icon className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-[#0f1830] dark:text-white">{l.name}</h3>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${l.tint}14`, color: l.tint }}>{l.tag}</span>
                </div>
                <p className="text-sm text-[#605E5C] dark:text-slate-400 leading-relaxed">{l.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── CAPABILITY BENTO ─────────────────────────────────────────────── */}
      <section className="relative px-6 py-20 bg-[#f9fafb] dark:bg-slate-900/40 border-y border-[#EDEBE9] dark:border-slate-800">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-bold text-[#EC7A3C] uppercase tracking-widest mb-3">Beyond a changelog bot</p>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0f1830] dark:text-white tracking-tight">
            A release decision, made auditable
          </h2>
        </Reveal>

        <Stagger className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5" gap={0.06}>
          {CAPS.map((c) => (
            <StaggerItem key={c.title}>
              <div className="group h-full rounded-2xl border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ backgroundColor: `${c.tint}22` }} />
                <div className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${c.tint}14`, color: c.tint }}>
                  <c.icon className="w-5.5 h-5.5" style={{ width: 22, height: 22 }} />
                </div>
                <h3 className="relative text-base font-bold text-[#0f1830] dark:text-white mb-1.5">{c.title}</h3>
                <p className="relative text-[13px] text-[#605E5C] dark:text-slate-400 leading-relaxed">{c.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── PIPELINE FLOW ────────────────────────────────────────────────── */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-bold text-[#2E9E6B] uppercase tracking-widest mb-3">From merge to rollout</p>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0f1830] dark:text-white tracking-tight">
            Eight agents, one explicit pipeline
          </h2>
        </Reveal>

        <Stagger className="grid grid-cols-2 md:grid-cols-5 gap-4 relative" gap={0.12}>
          {PIPELINE.map((p, i) => (
            <StaggerItem key={p.label} className="relative">
              <div className="h-full rounded-2xl border border-[#EDEBE9] dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-center shadow-sm hover:shadow-lg transition-shadow">
                <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-[#0078D4] to-[#005faa] text-white flex items-center justify-center mb-3 shadow-md shadow-blue-600/20">
                  <p.icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-[#0f1830] dark:text-white">{p.label}</p>
                <p className="text-[11px] text-[#7C8499] dark:text-slate-500 mt-1 leading-snug">{p.sub}</p>
                <span className="absolute top-2 right-3 text-[10px] font-mono font-bold text-[#EDEBE9] dark:text-slate-700">{`0${i + 1}`}</span>
              </div>
              {i < PIPELINE.length - 1 && (
                <ArrowRight className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 w-5 h-5 text-[#c0c7d4] dark:text-slate-600 z-10" />
              )}
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal delay={0.1} className="mt-8 flex items-center justify-center gap-2 text-xs text-[#605E5C] dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-[#2E9E6B]" />
          No org-visible action fires without explicit human approval — enforced server-side.
        </Reveal>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <Reveal className="relative max-w-4xl mx-auto rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f1830] via-[#15233f] to-[#0f1830]" />
          <div className="absolute inset-0 grid-backdrop opacity-30" />
          <div className="aurora-blob bg-[#EC7A3C]/30 w-72 h-72 -bottom-20 -right-10" />
          <div className="aurora-blob bg-[#0078D4]/30 w-72 h-72 -top-20 -left-10" style={{ animationDelay: "-7s" }} />
          <div className="relative px-8 py-14 text-center">
            <div className="inline-flex items-center gap-2 mb-5">
              <HeraldLogo size={36} />
              <span className="text-2xl font-bold text-white tracking-wider font-display">HERALD</span>
            </div>
            <h3 className="font-display text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3">
              See a merge become a passport
            </h3>
            <p className="text-blue-100/70 max-w-lg mx-auto mb-8 leading-relaxed">
              Trigger a live pipeline run, watch the reasoning trace, replay the failure cascade, and verify the signed attestation — in under two minutes.
            </p>
            <button
              onClick={onBackToApp}
              className="group inline-flex items-center gap-2 bg-white text-[#0f1830] hover:bg-blue-50 font-bold text-sm py-3.5 px-8 rounded-xl shadow-xl transition-all active:scale-95 cursor-pointer"
            >
              {ctaLabel ?? "Open the release console"}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-semibold text-blue-100/60">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Synthetic data only</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Tamper-evident provenance</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Human-in-the-loop</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-[#EDEBE9] dark:border-slate-800 px-6 py-6 text-center">
        <p className="text-[11px] text-[#7C8499] dark:text-slate-500 flex items-center justify-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          Microsoft Agents League Hackathon · AI Skills Fest 2026
        </p>
      </footer>
    </div>
  );
}
