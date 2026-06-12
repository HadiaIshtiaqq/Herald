// ─── exec-report.ts — print-ready executive release report ────────────────────
// Leadership-facing artifact for a single run: health score with dimension
// breakdown, impact summary, failure cascade, readiness gaps, phased
// remediation roadmap, and the signed attestation rendered as a scannable
// "release passport" QR (in-toto-passport pattern: verify the chain of
// custody in seconds). Self-contained HTML with inline CSS — print to PDF
// from any browser.

import QRCode from "qrcode";
import type { ReleaseHealth, RoadmapPhase } from "./health-score.js";
import type { BlastRadiusReport } from "./fabric-iq.js";
import type { RunAttestation } from "./provenance.js";

export interface ReportRun {
  run_id: string;
  pr_title: string;
  pr_number: number;
  repository: string;
  branch: string;
  status: string;
  ai_tier_used?: string;
  created_at: string;
  impact_report?: {
    summary?: string;
    risk?: { level?: string; rationale?: string };
    change_type?: string;
    impacted_areas?: string[];
  };
  team_readiness?: {
    overall_score: number;
    ready_count: number;
    total_count: number;
    blocking_deployment: boolean;
    gaps: Array<{ name: string; role: string; missing_certs: string[] }>;
  };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const RISK_COLOR: Record<string, string> = { high: "#D5544A", medium: "#E0A93B", low: "#2E9E6B" };
const scoreColor = (n: number) => (n >= 70 ? "#2E9E6B" : n >= 40 ? "#E0A93B" : "#D5544A");

export async function renderExecutiveReport(params: {
  run: ReportRun;
  health: ReleaseHealth;
  roadmap: RoadmapPhase[];
  blast: BlastRadiusReport;
  attestation: RunAttestation;
}): Promise<string> {
  const { run, health, roadmap, blast, attestation } = params;
  const risk = run.impact_report?.risk?.level ?? "unknown";
  const tr = run.team_readiness;

  // Release passport: compact, scannable fingerprint of the signed decision.
  const passportPayload = [
    "HERALD-ATTESTATION v1",
    `run: ${run.run_id}`,
    `pr: ${run.repository}#${run.pr_number}`,
    `tier: ${attestation.predicate.ai_tier}`,
    `risk: ${attestation.predicate.risk}`,
    `approval: ${attestation.predicate.human_approval.status}`,
    `trace-sha256: ${attestation.predicate.reasoning_trace_sha256}`,
    `sig-hmac256: ${attestation.signature.value}`
  ].join("\n");
  const qrDataUrl = await QRCode.toDataURL(passportPayload, { margin: 1, width: 168 });

  const dimRows = health.dimensions.map(d => `
    <tr>
      <td><strong>${esc(d.label)}</strong><br><span class="muted">${esc(d.evidence)}</span></td>
      <td class="num">${Math.round(d.weight * 100)}%</td>
      <td class="num" style="color:${scoreColor(d.score)};font-weight:800">${d.score}</td>
      <td style="width:160px"><div class="bar"><div style="width:${d.score}%;background:${scoreColor(d.score)}"></div></div></td>
    </tr>`).join("");

  const cascadeRows = blast.cascade.map(s => `
    <tr>
      <td class="mono">${esc(s.t)}</td>
      <td><strong>${esc(s.area)}</strong></td>
      <td>${esc(s.event)}</td>
      <td class="num" style="color:${scoreColor(s.integrity_after)};font-weight:800">${s.integrity_after}%</td>
    </tr>`).join("");

  const gapRows = (tr?.gaps ?? []).map(g => `
    <tr>
      <td><strong>${esc(g.name)}</strong></td>
      <td>${esc(g.role)}</td>
      <td class="mono">${g.missing_certs.map(esc).join(", ")}</td>
    </tr>`).join("");

  const phaseBlocks = roadmap.map(p => `
    <div class="phase">
      <div class="phase-head">
        <span class="phase-num">Phase ${p.phase}</span>
        <strong>${esc(p.title)}</strong>
        <span class="muted">${esc(p.timeframe)} · ~${p.effort_hours}h effort</span>
      </div>
      <ul>${p.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
    </div>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Herald Executive Report — ${esc(run.pr_title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #201F1E; margin: 0; background: #f6f7f9; }
  .page { max-width: 880px; margin: 0 auto; padding: 32px; background: #fff; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #0078D4; padding-bottom: 14px; margin-bottom: 20px; }
  .mark { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg,#EC7A3C,#F6B048); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:20px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 26px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: #0078D4; }
  .sub { color: #605E5C; font-size: 12px; margin-top: 2px; }
  .muted { color: #7C8499; font-size: 11px; }
  .mono { font-family: Consolas, monospace; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td, th { padding: 7px 8px; border-bottom: 1px solid #EDEBE9; text-align: left; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .bar { height: 8px; background: #EDEBE9; border-radius: 4px; overflow: hidden; } .bar div { height: 100%; border-radius: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 220px; gap: 20px; align-items: start; }
  .scorecard { border: 1px solid #EDEBE9; border-radius: 12px; padding: 16px; text-align: center; }
  .score-big { font-size: 44px; font-weight: 900; line-height: 1; }
  .grade { display:inline-block; margin-top: 6px; padding: 2px 12px; border-radius: 999px; color:#fff; font-weight: 800; }
  .pills span { display:inline-block; background:#0078D410; color:#0078D4; border:1px solid #0078D430; border-radius:999px; padding:2px 10px; font-size:11px; font-weight:700; margin: 0 6px 6px 0; }
  .risk { color: #fff; padding: 2px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; text-transform: uppercase; }
  .phase { border: 1px solid #EDEBE9; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
  .phase-head { display: flex; gap: 10px; align-items: baseline; font-size: 13px; }
  .phase-num { background:#0078D4; color:#fff; border-radius: 6px; padding: 1px 8px; font-size: 11px; font-weight: 800; }
  .phase ul { margin: 8px 0 2px; padding-left: 20px; font-size: 12px; } .phase li { margin-bottom: 3px; }
  .passport { display: flex; gap: 16px; border: 2px dashed #0078D4; border-radius: 12px; padding: 14px; align-items: center; }
  .passport img { width: 132px; height: 132px; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #EDEBE9; font-size: 10px; color: #7C8499; display: flex; justify-content: space-between; }
  @media print { body { background: #fff; } .page { padding: 12px; } }
</style></head>
<body><div class="page">
  <header>
    <div class="mark">H</div>
    <div>
      <h1>Executive Release Report</h1>
      <div class="sub">${esc(run.pr_title)} · ${esc(run.repository)}#${run.pr_number} · ${esc(new Date(run.created_at).toUTCString())}</div>
    </div>
  </header>

  <div class="grid">
    <div>
      <h2>Impact summary</h2>
      <p style="font-size:13px;line-height:1.55">${esc(run.impact_report?.summary ?? "—")}</p>
      <p>
        <span class="risk" style="background:${RISK_COLOR[risk] ?? "#7C8499"}">${esc(risk)} risk</span>
        &nbsp;<span class="muted">change type: <strong>${esc(run.impact_report?.change_type ?? "—")}</strong> · reasoning tier: <strong>${esc(run.ai_tier_used ?? "—")}</strong> · status: <strong>${esc(run.status)}</strong></span>
      </p>
      <div class="pills">${(run.impact_report?.impacted_areas ?? []).map(a => `<span>${esc(a)}</span>`).join("")}</div>
    </div>
    <div class="scorecard">
      <div class="muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">Release health</div>
      <div class="score-big" style="color:${scoreColor(health.overall)}">${health.overall}</div>
      <div class="grade" style="background:${scoreColor(health.overall)}">Grade ${health.grade}</div>
    </div>
  </div>

  <h2>Health dimensions</h2>
  <table><tr><th>Dimension</th><th class="num">Weight</th><th class="num">Score</th><th></th></tr>${dimRows}</table>

  <h2>Worst-case failure cascade (blast score ${blast.blast_score}/100 · ${blast.total_areas_affected} areas)</h2>
  <table><tr><th>T+</th><th>Area</th><th>Failure mode</th><th class="num">Integrity</th></tr>${cascadeRows}</table>

  <h2>Certification readiness ${tr ? `(${tr.overall_score}% · ${tr.ready_count}/${tr.total_count} certified${tr.blocking_deployment ? " · DEPLOYMENT BLOCKED" : ""})` : ""}</h2>
  ${gapRows ? `<table><tr><th>Engineer</th><th>Role</th><th>Missing certifications</th></tr>${gapRows}</table>` : `<p class="muted">No certification gaps for the affected areas.</p>`}

  <h2>Remediation roadmap</h2>
  ${phaseBlocks}

  <h2>Release passport — signed provenance</h2>
  <div class="passport">
    <img src="${qrDataUrl}" alt="QR code: signed attestation fingerprint">
    <div style="font-size:12px">
      <strong>${esc(attestation.schema)}</strong> · HMAC-SHA256 signed<br>
      <span class="muted mono">tier: ${esc(attestation.predicate.ai_tier)} · human approval: ${esc(attestation.predicate.human_approval.status)}</span><br>
      <span class="muted mono">trace sha256: ${esc(attestation.predicate.reasoning_trace_sha256.slice(0, 32))}…</span><br>
      <span class="muted mono">signature: ${esc(attestation.signature.value.slice(0, 32))}…</span><br>
      <span class="muted">Scan for the attestation fingerprint; verify any copy via <span class="mono">POST /attestation/verify</span>. Tampering with one field fails verification.</span>
    </div>
  </div>

  <footer>
    <span>Generated by Herald — release readiness, grounded, explainable, signed.</span>
    <span>Synthetic demo data · no real PII</span>
  </footer>
</div></body></html>`;
}
