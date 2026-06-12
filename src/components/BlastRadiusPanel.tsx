import React, { useEffect, useRef, useState } from "react";
import {
  Radiation, ShieldCheck, ShieldAlert, Loader2, ChevronRight, FileBadge
} from "lucide-react";
import { apiFetch } from "../lib/api";

// ── Types (mirror server responses) ──────────────────────────────────────────

interface BlastHop {
  area: string;
  criticality: "low" | "medium" | "high";
  distance: number;
  severity: number;
  via: string;
  failure_mode: string;
}

interface CascadeStep { t: string; area: string; event: string; integrity_after: number; }

interface BlastReport {
  origin_areas: string[];
  total_areas_affected: number;
  blast_score: number;
  hops: BlastHop[];
  cascade: CascadeStep[];
}

interface GraphNode { id: string; title: string; criticality: "low" | "medium" | "high"; }
interface GraphEdge { from: string; to: string; }
interface FabricGraph { nodes: GraphNode[]; edges: GraphEdge[]; }

interface Attestation {
  schema: string;
  generated_at: string;
  predicate: {
    ai_tier: string;
    risk: string;
    impacted_areas: string[];
    reasoning_trace_sha256: string;
    impact_report_sha256: string;
    human_approval: { status: string; actions_executed: string[] };
  };
  signature: { alg: string; value: string };
}

const critColor = { high: "#D5544A", medium: "#E0A93B", low: "#0078D4" } as const;

// ── Dependency graph (CodeAtlas pattern: see the blast, not just read it) ─────

function DependencyGraph({ graph, blast }: { graph: FabricGraph; blast: BlastReport }) {
  const W = 360, H = 240, CX = W / 2, CY = H / 2, R = 88;
  const pos = new Map<string, { x: number; y: number }>();
  graph.nodes.forEach((n, i) => {
    const angle = (i / graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) });
  });
  const hopByArea = new Map(blast.hops.map(h => [h.area, h]));
  const origins = new Set(blast.origin_areas);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto" role="img"
      aria-label="Service dependency graph with blast radius highlighted">
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
        </marker>
        <marker id="arrow-hot" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#D5544A" />
        </marker>
      </defs>
      {graph.edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        // shorten the line so arrowheads sit outside node circles
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const pad = 17;
        const x1 = a.x + (dx / len) * pad, y1 = a.y + (dy / len) * pad;
        const x2 = b.x - (dx / len) * pad, y2 = b.y - (dy / len) * pad;
        // edge is "hot" when the dependency (to) is in the blast and the consumer (from) is too
        const hot = hopByArea.has(e.to) && hopByArea.has(e.from);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={hot ? "#D5544A" : "#cbd5e1"} strokeWidth={hot ? 1.6 : 1}
            strokeDasharray={hot ? "" : "3 3"} opacity={hot ? 0.9 : 0.55}
            markerEnd={hot ? "url(#arrow-hot)" : "url(#arrow)"} />
        );
      })}
      {graph.nodes.map(n => {
        const p = pos.get(n.id)!;
        const hop = hopByArea.get(n.id);
        const isOrigin = origins.has(n.id);
        const fill = hop ? critColor[n.criticality] : "#e2e8f0";
        return (
          <g key={n.id}>
            {isOrigin && (
              <circle cx={p.x} cy={p.y} r={14} fill="none" stroke={critColor[n.criticality]} strokeWidth="2" opacity="0.6">
                <animate attributeName="r" values="14;20;14" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={p.x} cy={p.y} r={12} fill={fill} opacity={hop ? 0.92 : 0.8}
              stroke={hop ? "#fff" : "#cbd5e1"} strokeWidth="1.5" />
            {hop && (
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
                {hop.severity}
              </text>
            )}
            <text x={p.x} y={p.y + 24} textAnchor="middle" fontSize="8" fontWeight="700"
              fill={hop ? critColor[n.criticality] : "#94a3b8"}>
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function BlastRadiusPanel({ runId }: { runId: string }) {
  const [blast, setBlast] = useState<BlastReport | null>(null);
  const [graph, setGraph] = useState<FabricGraph | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [verify, setVerify] = useState<{ valid: boolean; reason: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sandbox-style replay: reveal cascade steps one at a time, meter draining.
  useEffect(() => {
    if (!blast) return;
    setRevealed(0);
    revealTimer.current = setInterval(() => {
      setRevealed(prev => {
        if (prev >= blast.cascade.length) {
          if (revealTimer.current) clearInterval(revealTimer.current);
          return prev;
        }
        return prev + 1;
      });
    }, 700);
    return () => { if (revealTimer.current) clearInterval(revealTimer.current); };
  }, [blast]);

  const loadBlast = async () => {
    setLoading("blast"); setError(null);
    try {
      const [bRes, gRes] = await Promise.all([
        apiFetch(`/runs/${runId}/blast-radius`),
        graph ? Promise.resolve(null) : apiFetch(`/fabric/graph`)
      ]);
      if (!bRes.ok) throw new Error(`HTTP ${bRes.status}`);
      setBlast(await bRes.json() as BlastReport);
      if (gRes && gRes.ok) setGraph(await gRes.json() as FabricGraph);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(null); }
  };

  const loadAttestation = async () => {
    setLoading("attest"); setError(null); setVerify(null);
    try {
      const res = await apiFetch(`/runs/${runId}/attestation`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAttestation(await res.json() as Attestation);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(null); }
  };

  const verifyAttestation = async () => {
    if (!attestation) return;
    setLoading("verify");
    try {
      const res = await apiFetch(`/attestation/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation)
      });
      setVerify(await res.json() as { valid: boolean; reason: string });
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(null); }
  };

  const replaying = blast !== null && revealed < blast.cascade.length;
  const currentIntegrity = blast && revealed > 0
    ? blast.cascade[Math.min(revealed, blast.cascade.length) - 1].integrity_after
    : 100;

  return (
    <div className="border border-[#EDEBE9] dark:border-slate-800 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-900/30 space-y-3">
      <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
        <Radiation className="w-3.5 h-3.5 text-orange-500" />
        Blast Radius &amp; Provenance
      </p>

      <div className="flex gap-2 flex-wrap">
        <button onClick={loadBlast} disabled={loading !== null || replaying}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded text-[10px] font-bold text-orange-600 dark:text-orange-400 transition-colors cursor-pointer disabled:opacity-50">
          {loading === "blast" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radiation className="w-3 h-3" />}
          Simulate failure cascade
        </button>
        <button onClick={loadAttestation} disabled={loading !== null}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0078D4]/10 hover:bg-[#0078D4]/20 border border-[#0078D4]/30 rounded text-[10px] font-bold text-[#0078D4] transition-colors cursor-pointer disabled:opacity-50">
          {loading === "attest" ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileBadge className="w-3 h-3" />}
          Issue signed attestation
        </button>
      </div>

      {error && <p className="text-[10px] text-[#D5544A] font-semibold">{error}</p>}

      {blast && (
        <div className="space-y-2">
          {/* Header: score + live damage meter */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-extrabold" style={{ color: blast.blast_score >= 60 ? "#D5544A" : blast.blast_score >= 30 ? "#E0A93B" : "#2E9E6B" }}>
              Blast score {blast.blast_score}/100
            </span>
            <span className="text-[10px] text-[#605E5C] dark:text-slate-400">
              {blast.total_areas_affected} area{blast.total_areas_affected !== 1 ? "s" : ""} in radius
            </span>
            <div className="ml-auto flex items-center gap-1.5 w-36">
              <span className="text-[9px] font-bold uppercase text-[#7C8499]">{replaying ? "Replaying" : "Integrity"}</span>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${currentIntegrity}%`, backgroundColor: currentIntegrity > 60 ? "#2E9E6B" : currentIntegrity > 30 ? "#E0A93B" : "#D5544A" }} />
              </div>
              <span className="text-[9px] font-bold w-7 text-right" style={{ color: currentIntegrity > 60 ? "#2E9E6B" : currentIntegrity > 30 ? "#E0A93B" : "#D5544A" }}>
                {currentIntegrity}%
              </span>
            </div>
          </div>

          {/* Dependency graph */}
          {graph && (
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800">
              <DependencyGraph graph={graph} blast={blast} />
              <p className="text-[9px] text-center text-[#7C8499] dark:text-slate-500 mt-1">
                Service dependency graph — pulsing nodes are where the change landed; numbers are severity; red edges carry the cascade.
              </p>
            </div>
          )}

          {/* Failure replay — steps appear in dependency order */}
          <div className="space-y-1">
            {blast.cascade.slice(0, revealed).map((step, i) => {
              const crit = critColor[blast.hops.find(h => h.area === step.area)?.criticality ?? "medium"];
              return (
                <div key={i} className="cascade-step p-1.5 bg-white dark:bg-slate-900 rounded border border-[#EDEBE9] dark:border-slate-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-12 text-[9px] font-mono font-bold text-[#7C8499]">{step.t}</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase"
                      style={{ color: crit, backgroundColor: `${crit}15` }}>
                      {step.area}
                    </span>
                    <div className="ml-auto shrink-0 flex items-center gap-1.5 w-24">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${step.integrity_after}%`, backgroundColor: step.integrity_after > 60 ? "#2E9E6B" : step.integrity_after > 30 ? "#E0A93B" : "#D5544A" }} />
                      </div>
                      <span className="text-[9px] font-bold text-[#605E5C] dark:text-slate-400 w-7 text-right">{step.integrity_after}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#323130] dark:text-slate-300 leading-snug">{step.event}</p>
                </div>
              );
            })}
            {replaying && (
              <p className="flex items-center gap-1.5 text-[10px] text-orange-500 font-bold px-1">
                <Loader2 className="w-3 h-3 animate-spin" /> propagating…
              </p>
            )}
          </div>
          {!replaying && (
            <p className="text-[9px] text-[#7C8499] dark:text-slate-500">
              Deterministic worst-case replay from the Fabric IQ ontology dependency graph — integrity meter shows cumulative system damage.
            </p>
          )}
        </div>
      )}

      {attestation && (
        <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-[#EDEBE9] dark:border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="font-extrabold text-[#201F1E] dark:text-slate-200">{attestation.schema}</span>
            <span className="px-1.5 py-0.5 bg-[#0078D4]/10 rounded font-bold text-[#0078D4] uppercase">tier: {attestation.predicate.ai_tier}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
              attestation.predicate.human_approval.status === "approved" ? "bg-[#2E9E6B]/10 text-[#2E9E6B]" :
              attestation.predicate.human_approval.status === "rejected" ? "bg-[#D5544A]/10 text-[#D5544A]" :
              "bg-[#E0A93B]/10 text-[#E0A93B]"
            }`}>human: {attestation.predicate.human_approval.status}</span>
          </div>
          <p className="text-[9px] font-mono text-[#605E5C] dark:text-slate-400 break-all">
            trace sha256: {attestation.predicate.reasoning_trace_sha256.slice(0, 24)}… ·
            sig ({attestation.signature.alg}): {attestation.signature.value.slice(0, 24)}…
          </p>
          <div className="flex items-center gap-2">
            <button onClick={verifyAttestation} disabled={loading !== null}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#2E9E6B]/10 hover:bg-[#2E9E6B]/20 border border-[#2E9E6B]/30 rounded text-[10px] font-bold text-[#2E9E6B] transition-colors cursor-pointer disabled:opacity-50">
              {loading === "verify" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              Verify signature
            </button>
            {verify && (
              <span className={`flex items-center gap-1 text-[10px] font-bold ${verify.valid ? "text-[#2E9E6B]" : "text-[#D5544A]"}`}>
                {verify.valid ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {verify.reason}
              </span>
            )}
          </div>
          <p className="text-[9px] text-[#7C8499] dark:text-slate-500 flex items-center gap-1">
            <ChevronRight className="w-2.5 h-2.5" />
            Tamper-evident record: which AI tier reasoned, content hashes of the trace, and the human approval decision — verifiable in seconds.
          </p>
        </div>
      )}
    </div>
  );
}
