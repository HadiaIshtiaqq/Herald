// ─── assessment-agent.ts — grounded, cited practice questions ─────────────────
// Challenge A explicitly requires: "Provide grounded practice questions from
// approved knowledge sources" and "generate credible, cited questions."
//
// For each certification a team member is missing, this agent retrieves
// matching chunks from the Foundry IQ knowledge base (knowledge/), asks the AI
// to write questions grounded ONLY in those chunks, and attaches a citation
// { file, heading } to every question. If every AI tier is down, a
// deterministic generator builds questions straight from the knowledge chunks —
// the demo can never show an empty assessment.
//
// Wiring (server.ts):
//   const set = await generateAssessment({ certId: "AZ-204", knowledgeDir, count: 4 });

import fs from "fs";
import path from "path";
import { extractJson } from "../lib/extract-json.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Citation { file: string; heading: string; }

export interface AssessmentQuestion {
  question: string;
  options: string[];          // exactly 4, one correct
  answer_index: number;       // 0-3
  why: string;                // grounded rationale
  citation: Citation;         // which knowledge chunk grounds this question
  skill?: string;
}

export interface AssessmentSet {
  cert_id: string;
  generated_at: string;
  generator: "ai" | "deterministic";
  grounded: true;
  source_chunks: Citation[];
  questions: AssessmentQuestion[];
}

export interface AssessmentParams {
  certId: string;
  knowledgeDir: string;
  count?: number;                                   // default 4
  skills?: string[];                                // from FabricIQ — sharpens retrieval
  /** Optional: plug in Herald's existing 4-tier chain. Return raw model text. */
  callAI?: (prompt: string) => Promise<string>;
}

// ── Knowledge retrieval (Foundry IQ pattern: cite or it didn't happen) ────────

interface Chunk { file: string; heading: string; text: string; }

function loadKnowledgeChunks(knowledgeDir: string): Chunk[] {
  const chunks: Chunk[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(knowledgeDir).filter(f => /\.(md|txt)$/i.test(f));
  } catch {
    return chunks;
  }
  for (const file of files) {
    let raw = "";
    try { raw = fs.readFileSync(path.join(knowledgeDir, file), "utf-8"); } catch { continue; }
    let heading = file;
    let buf: string[] = [];
    const flush = () => {
      const text = buf.join("\n").trim();
      if (text.length > 40) chunks.push({ file, heading, text });
      buf = [];
    };
    for (const line of raw.split(/\r?\n/)) {
      const h = line.match(/^#{1,4}\s+(.+)/);
      if (h) { flush(); heading = h[1].trim(); }
      else buf.push(line);
    }
    flush();
  }
  return chunks;
}

function scoreChunk(chunk: Chunk, certId: string, skills: string[]): number {
  const hay = (chunk.heading + " " + chunk.text).toLowerCase();
  let score = 0;
  if (hay.includes(certId.toLowerCase())) score += 5;
  for (const s of skills) {
    if (s && hay.includes(s.toLowerCase())) score += 2;
  }
  // Generic study-methodology chunks are useful low-priority filler.
  if (/study|practice|assessment|readiness/.test(hay)) score += 1;
  return score;
}

function retrieveChunks(knowledgeDir: string, certId: string, skills: string[], n: number): Chunk[] {
  const all = loadKnowledgeChunks(knowledgeDir);
  return all
    .map(c => ({ c, s: scoreChunk(c, certId, skills) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.c);
}

// ── AI generation (grounded-only prompt, parsed defensively) ──────────────────

function buildPrompt(certId: string, chunks: Chunk[], count: number): string {
  const sources = chunks
    .map((c, i) => `[SOURCE ${i}] file="${c.file}" heading="${c.heading}"\n${c.text.slice(0, 1200)}`)
    .join("\n\n");
  return `You are an assessment generator for an enterprise certification readiness system.
Write exactly ${count} multiple-choice practice questions for certification ${certId}.

HARD RULES:
- Ground every question ONLY in the SOURCE blocks below. Do not use outside knowledge.
- Each question cites the source it came from via its index.
- 4 options each, exactly one correct.
- "why" must reference the source content in one sentence.

Respond with ONLY this JSON, no prose, no markdown fences:
{"questions":[{"question":"...","options":["a","b","c","d"],"answer_index":0,"why":"...","source_index":0}]}

${sources}`;
}

async function callGeminiDirect(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? "";
}

// ── Deterministic fallback (demo insurance — never returns empty) ─────────────

function deterministicQuestions(certId: string, chunks: Chunk[], count: number): AssessmentQuestion[] {
  const qs: AssessmentQuestion[] = [];
  const distractors = [
    "It is handled automatically and requires no configuration",
    "It only applies to on-premises deployments",
    "It is deprecated and should not be used"
  ];
  for (const chunk of chunks) {
    if (qs.length >= count) break;
    const firstSentence = chunk.text.split(/(?<=[.!?])\s+/)[0]?.replace(/\s+/g, " ").trim();
    if (!firstSentence || firstSentence.length < 25) continue;
    const correct = firstSentence.length > 140 ? firstSentence.slice(0, 137) + "…" : firstSentence;
    const options = [correct, ...distractors];
    qs.push({
      question: `According to the team's approved guidance ("${chunk.heading}"), which statement is accurate for ${certId} preparation?`,
      options,
      answer_index: 0,
      why: `Stated directly in ${chunk.file} under "${chunk.heading}".`,
      citation: { file: chunk.file, heading: chunk.heading }
    });
  }
  if (qs.length === 0) {
    qs.push({
      question: `No knowledge-base content matched ${certId}. What should the team do before assessment?`,
      options: [
        `Add approved ${certId} study material to the knowledge/ folder so questions can be grounded`,
        "Generate questions from the model's general knowledge",
        "Skip the assessment step",
        "Lower the readiness threshold"
      ],
      answer_index: 0,
      why: "Herald only issues assessments grounded in approved sources (Foundry IQ pattern).",
      citation: { file: "knowledge/", heading: "(no matching chunk)" }
    });
  }
  return qs;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateAssessment(params: AssessmentParams): Promise<AssessmentSet> {
  const count = Math.min(Math.max(params.count ?? 4, 1), 8);
  const skills = params.skills ?? [];
  const chunks = retrieveChunks(params.knowledgeDir, params.certId, skills, Math.max(count, 4));
  const citations: Citation[] = chunks.map(c => ({ file: c.file, heading: c.heading }));

  // AI path — injected chain first, direct Gemini second.
  if (chunks.length > 0) {
    const prompt = buildPrompt(params.certId, chunks, count);
    const callers: Array<() => Promise<string>> = [];
    if (params.callAI) callers.push(() => params.callAI!(prompt));
    callers.push(() => callGeminiDirect(prompt));

    for (const call of callers) {
      try {
        const raw = await call();
        const parsed = extractJson<{ questions?: Array<{
          question?: string; options?: string[]; answer_index?: number; why?: string; source_index?: number;
        }> }>(raw);
        const valid = (parsed?.questions ?? []).filter(q =>
          typeof q.question === "string" &&
          Array.isArray(q.options) && q.options.length === 4 &&
          typeof q.answer_index === "number" && q.answer_index >= 0 && q.answer_index < 4
        );
        if (valid.length > 0) {
          return {
            cert_id: params.certId,
            generated_at: new Date().toISOString(),
            generator: "ai",
            grounded: true,
            source_chunks: citations,
            questions: valid.slice(0, count).map(q => {
              const src = chunks[Math.min(q.source_index ?? 0, chunks.length - 1)];
              return {
                question: q.question!, options: q.options!, answer_index: q.answer_index!,
                why: q.why ?? "Grounded in approved knowledge source.",
                citation: { file: src.file, heading: src.heading },
                skill: skills[0]
              };
            })
          };
        }
      } catch { /* fall through to next caller / deterministic */ }
    }
  }

  return {
    cert_id: params.certId,
    generated_at: new Date().toISOString(),
    generator: "deterministic",
    grounded: true,
    source_chunks: citations,
    questions: deterministicQuestions(params.certId, chunks, count)
  };
}
