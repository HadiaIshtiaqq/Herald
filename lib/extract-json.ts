// ─── extract-json.ts — resilient JSON extraction from LLM responses ──────────
// Reasoning models (Phi-4-reasoning, DeepSeek-R1 style) wrap answers in
// <think>…</think> blocks and markdown fences, so a bare JSON.parse() finds
// "no recognizable fields" and the tier falls through. This utility strips
// reasoning blocks and fences, then scans for the first balanced JSON object
// or array, returning the *parsed* value (or null to fall through).
//
// Note: agents/foundry-agent-client.ts exports a string-returning extractJson
// used by the tier chain; this module is the typed, parse-to-object variant
// used by the Assessment Agent and any new code.
//
// Usage:
//   import { extractJson } from "../lib/extract-json.js";
//   const parsed = extractJson<MyShape>(rawModelText);
//   if (!parsed) { /* fall through to next tier */ }

export function extractJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw || typeof raw !== "string") return null;

  let text = raw;

  // 1. Remove reasoning-model thinking blocks.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Unclosed think block (model hit token limit mid-thought): keep what follows
  // the LAST <think> open tag only if a brace appears after it; else drop it.
  const lastOpen = text.toLowerCase().lastIndexOf("<think>");
  if (lastOpen !== -1) {
    const after = text.slice(lastOpen + 7);
    text = /[{[]/.test(after) ? after : text.slice(0, lastOpen);
  }

  // 2. Strip markdown code fences (```json … ``` or ``` … ```).
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1];

  // 3. Fast path.
  const direct = tryParse<T>(text.trim());
  if (direct !== null) return direct;

  // 4. Scan for the first balanced {...} or [...] (string-aware).
  for (const opener of ["{", "["] as const) {
    const candidate = firstBalanced(text, opener);
    if (candidate) {
      const parsed = tryParse<T>(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function tryParse<T>(s: string): T | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as T;
    // Reject bare primitives — agents always expect an object/array payload.
    return typeof v === "object" && v !== null ? v : null;
  } catch {
    return null;
  }
}

function firstBalanced(text: string, opener: "{" | "["): string | null {
  const closer = opener === "{" ? "}" : "]";
  const start = text.indexOf(opener);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // truncated response — caller falls through to next tier
}
