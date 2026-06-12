// ─── provenance.ts — signed attestations for AI-assisted release decisions ───
// Pattern: in-toto-style provenance (the "code passport" idea) adapted to
// Herald's unit of work — a pipeline run. Every attestation records WHICH
// model tier produced the reasoning, content hashes of the reasoning trace and
// artifacts (tamper-evident), and the human approval decision, then signs the
// canonical payload with HMAC-SHA256. An auditor can verify in seconds that
// the analysis shown is the analysis that was approved — and that a human,
// not the model, authorized the org-visible actions.
//
// Honest scope: HMAC with a server-held key proves integrity + origin to
// anyone who trusts the server key (symmetric). Swapping in ed25519/Sigstore
// keyless signing is a drop-in upgrade path documented in the README.

import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttestationSubject {
  run_id: string;
  pr_number: number;
  pr_title: string;
  repository: string;
  branch: string;
}

export interface AttestationPredicate {
  ai_tier: string;                     // which model produced the reasoning
  risk: string;
  change_type: string;
  impacted_areas: string[];
  reasoning_trace_sha256: string;      // hash of the full reasoning trace
  impact_report_sha256: string;
  artifacts_sha256: string | null;
  human_approval: {
    status: "approved" | "rejected" | "pending";
    decided_at: string | null;
    actions_executed: string[];
  };
}

export interface RunAttestation {
  schema: "herald-attestation/v1";
  generated_at: string;
  subject: AttestationSubject;
  predicate: AttestationPredicate;
  signature: {
    alg: "HMAC-SHA256";
    key_id: "herald-server-key";
    value: string;                     // hex HMAC over canonical(subject+predicate+generated_at)
  };
}

// ── Canonicalization + crypto ─────────────────────────────────────────────────

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256(data: unknown): string {
  return crypto.createHash("sha256").update(typeof data === "string" ? data : canonicalJson(data)).digest("hex");
}

function signingKey(serverSecret: string): Buffer {
  // Domain-separated key derivation so the API secret itself never signs payloads.
  return crypto.createHash("sha256").update(`herald-attestation-key:${serverSecret}`).digest();
}

function signPayload(payload: object, serverSecret: string): string {
  return crypto.createHmac("sha256", signingKey(serverSecret)).update(canonicalJson(payload)).digest("hex");
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AttestationInput {
  run: {
    run_id: string;
    pr_number: number;
    pr_title: string;
    repository: string;
    branch: string;
    status: string;
    ai_tier_used?: string;
    updated_at: string;
    impact_report?: {
      risk?: { level?: string };
      change_type?: string;
      impacted_areas?: string[];
      reasoning_trace?: string[];
    };
    artifacts?: unknown;
    /** Herald's shape: { teams: "<link>"|null, sharepoint: ..., outlook: ..., study_plans: ... } */
    actions_result?: object | null;
  };
  serverSecret: string;
}

export function buildAttestation({ run, serverSecret }: AttestationInput): RunAttestation {
  const report = run.impact_report ?? {};
  const approvalStatus: AttestationPredicate["human_approval"]["status"] =
    run.status === "done" || run.status === "acting" || run.status === "approved" ? "approved"
    : run.status === "rejected" ? "rejected"
    : "pending";

  const subject: AttestationSubject = {
    run_id: run.run_id,
    pr_number: run.pr_number,
    pr_title: run.pr_title,
    repository: run.repository,
    branch: run.branch
  };

  const predicate: AttestationPredicate = {
    ai_tier: run.ai_tier_used ?? "unknown",
    risk: report.risk?.level ?? "unknown",
    change_type: report.change_type ?? "unknown",
    impacted_areas: report.impacted_areas ?? [],
    reasoning_trace_sha256: sha256(report.reasoning_trace ?? []),
    impact_report_sha256: sha256(report),
    artifacts_sha256: run.artifacts ? sha256(run.artifacts) : null,
    human_approval: {
      status: approvalStatus,
      decided_at: approvalStatus === "pending" ? null : run.updated_at,
      actions_executed: Object.entries((run.actions_result ?? {}) as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && v.length > 0)
        .map(([k]) => k)
    }
  };

  const generated_at = new Date().toISOString();
  const value = signPayload({ schema: "herald-attestation/v1", generated_at, subject, predicate }, serverSecret);

  return {
    schema: "herald-attestation/v1",
    generated_at,
    subject,
    predicate,
    signature: { alg: "HMAC-SHA256", key_id: "herald-server-key", value }
  };
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
}

export function verifyAttestation(attestation: RunAttestation, serverSecret: string): VerifyResult {
  if (attestation?.schema !== "herald-attestation/v1") {
    return { valid: false, reason: "unknown schema" };
  }
  if (attestation.signature?.alg !== "HMAC-SHA256") {
    return { valid: false, reason: `unsupported alg: ${attestation.signature?.alg}` };
  }
  const expected = signPayload({
    schema: attestation.schema,
    generated_at: attestation.generated_at,
    subject: attestation.subject,
    predicate: attestation.predicate
  }, serverSecret);
  const given = attestation.signature.value ?? "";
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given.length === expected.length ? given : "0".repeat(expected.length), "hex");
  const valid = given.length === expected.length && crypto.timingSafeEqual(a, b);
  return valid
    ? { valid: true, reason: "signature verified — subject and predicate are untampered" }
    : { valid: false, reason: "signature mismatch — attestation was modified or signed with a different key" };
}
