/**
 * Herald — Foundry Agent + Azure AI Inference client utilities
 *
 * Tier 1: callFoundryAgent  — Azure AI Foundry Agents API (thread/run/poll)
 * Tier 2: callPhi4          — Azure AI Inference API (phi-4-reasoning or any deployment)
 *
 * Project endpoint format (paste from Foundry UI → your agent → Details tab):
 *   https://{account}.services.ai.azure.com/api/projects/{project}
 * Example:
 *   https://heraldai.services.ai.azure.com/api/projects/proj-default
 */

const AGENTS_API_VERSION = "2025-05-15-preview";
const INFERENCE_API_VERSION = "2024-05-01-preview";
const POLL_INTERVAL_MS = 1500;

// ─── Entra ID auth for the Agents API ────────────────────────────────────────
// The Agents API on services.ai.azure.com project endpoints authorizes with
// Entra ID (RBAC) bearer tokens, NOT api-key headers — sending the key yields
// 403 even with correct roles. DefaultAzureCredential resolves the Azure CLI
// login locally and managed identity in Azure. Falls back to api-key headers
// only if no token source is available, so dev setups without az keep working
// (and fail through to Tier 2 as before).

import { DefaultAzureCredential } from "@azure/identity";

let agentsCredential: DefaultAzureCredential | null = null;
let agentsTokenCache: { token: string; expiresOnTimestamp: number } | null = null;

async function getAgentsAuthHeader(apiKey: string): Promise<Record<string, string>> {
  try {
    if (!agentsTokenCache || agentsTokenCache.expiresOnTimestamp - 120_000 < Date.now()) {
      agentsCredential ??= new DefaultAzureCredential();
      const t = await agentsCredential.getToken("https://ai.azure.com/.default");
      if (t) agentsTokenCache = { token: t.token, expiresOnTimestamp: t.expiresOnTimestamp };
    }
    if (agentsTokenCache) return { Authorization: `Bearer ${agentsTokenCache.token}` };
  } catch (err) {
    console.warn("[FoundryAgent] Entra token unavailable, falling back to api-key:", (err as Error).message);
  }
  return { "api-key": apiKey };
}

// ─── Foundry Agent (thread / run / poll) ─────────────────────────────────────

// HERALD override — injected into every run to redirect the agent away from its
// documentation-generator persona toward structured JSON output for release analysis.
const HERALD_OVERRIDE =
  "OVERRIDE: You are Herald's release analysis agent. Ignore any prior documentation-generator " +
  "instructions. Your sole task is to analyze the pull request data provided and return structured " +
  "JSON as specified in the user message. Return ONLY valid JSON — no prose, no markdown fences.";

export async function callFoundryAgent(
  agentId: string,
  projectEndpoint: string,
  apiKey: string,
  userMessage: string,
  timeoutMs = 30000  // Foundry agents need 15–30s for thread/run/poll cycles
): Promise<string | null> {
  // Catch display-name mistakes early so the failure is visible in logs.
  // Accept UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) OR asst_ prefix
  if (!/^asst_[A-Za-z0-9]{8,}/.test(agentId) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
    console.error(
      `[FoundryAgent] INVALID agent ID "${agentId}" — must be asst_XXXXXXXX, not a display name. ` +
      "Check Foundry UI → Build → Agents → Details tab."
    );
    return null;
  }
  const base = projectEndpoint.replace(/\/$/, "");
  const auth = await getAgentsAuthHeader(apiKey);
  const h = { "Content-Type": "application/json", ...auth };

  try {
    // 1. Create thread
    const tRes = await fetch(`${base}/threads?api-version=${AGENTS_API_VERSION}`, {
      method: "POST", headers: h, body: JSON.stringify({})
    });
    if (!tRes.ok) {
      console.warn(`[FoundryAgent] thread create failed: ${tRes.status}`);
      return null;
    }
    const { id: threadId } = await tRes.json() as { id: string };

    // 2. Post user message
    const mRes = await fetch(`${base}/threads/${threadId}/messages?api-version=${AGENTS_API_VERSION}`, {
      method: "POST", headers: h,
      body: JSON.stringify({ role: "user", content: userMessage })
    });
    if (!mRes.ok) return null;

    // 3. Start run with the agent + override instructions
    const rRes = await fetch(`${base}/threads/${threadId}/runs?api-version=${AGENTS_API_VERSION}`, {
      method: "POST", headers: h,
      body: JSON.stringify({ assistant_id: agentId, additional_instructions: HERALD_OVERRIDE })
    });
    if (!rRes.ok) {
      console.warn(`[FoundryAgent] run create failed: ${rRes.status}`);
      return null;
    }
    const { id: runId } = await rRes.json() as { id: string };

    // 4. Poll until complete or timed out
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const pRes = await fetch(
        `${base}/threads/${threadId}/runs/${runId}?api-version=${AGENTS_API_VERSION}`,
        { headers: auth }
      );
      const run = await pRes.json() as { status: string };
      if (run.status === "completed") break;
      if (["failed", "cancelled", "expired"].includes(run.status)) {
        console.warn(`[FoundryAgent] run ended with status: ${run.status}`);
        return null;
      }
    }

    // 5. Fetch latest assistant message
    const msgRes = await fetch(
      `${base}/threads/${threadId}/messages?api-version=${AGENTS_API_VERSION}&order=desc&limit=5`,
      { headers: auth }
    );
    const msgs = await msgRes.json() as {
      data: Array<{
        role: string;
        content: Array<{ type: string; text?: { value: string } }>;
      }>;
    };
    const assistant = msgs.data?.find(m => m.role === "assistant");
    return assistant?.content?.find(c => c.type === "text")?.text?.value ?? null;
  } catch (err) {
    console.warn("[FoundryAgent] error:", (err as Error).message);
    return null;
  }
}

// ─── Phi-4-reasoning via Azure AI Foundry OpenAI-compatible endpoint ─────────
// Endpoint format from Foundry UI → Deployments → Phi-4-reasoning → Get code:
//   https://{resource}.openai.azure.com/openai/v1
// This endpoint accepts: POST /chat/completions  with { model, messages, ... }
// Auth: api-key header (same key as FOUNDRY_API_KEY)

export async function callPhi4(
  inferenceEndpoint: string,
  apiKey: string,
  deployment: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 800,
  temperature = 0.2,
  timeoutMs = 30000  // capped at 30s — stop sequences break echo loops much sooner
): Promise<string | null> {
  // inferenceEndpoint = "https://heraldai.openai.azure.com/openai/v1"
  // Phi-4-reasoning uses the OpenAI-compatible /chat/completions path directly.
  const base = inferenceEndpoint.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey        // Azure AI Foundry OpenAI-compat endpoint uses api-key header
      },
      body: JSON.stringify({
        model: deployment,       // "Phi-4-reasoning" passed in body as model field
        messages,
        max_tokens: maxTokens,
        temperature,
        // Stop sequences break the echo loop that Phi-4-reasoning enters on JSON tasks.
        // The model echoes "User instructs: User instructs: ..." until max_tokens is exhausted.
        stop: ["\nUser", "\n\nUser", "User instructs", "Instructions:"]
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Phi4] inference failed: ${res.status} — ${errText.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      console.warn(`[Phi4] timed out after ${timeoutMs}ms`);
    } else {
      console.warn("[Phi4] error:", (err as Error).message);
    }
    return null;
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wraps fetch with up to `maxRetries` retries on HTTP 5xx / network errors.
 * Uses exponential backoff: 1s, 2s, 4s, … Transient Azure quota/throttle
 * responses (429 / 503) are also retried.
 */
export async function retryFetch(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < maxRetries) await sleep(1000 * Math.pow(2, attempt));
  }
  throw lastErr;
}

/**
 * Wraps a Gemini generateContent call with exponential backoff on 429 quota errors.
 * The Google GenAI SDK throws errors whose message includes "429" or "quota" on rate limits.
 */
export async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource_exhausted");
      if (!isQuota) throw err;
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
        console.log(`[Gemini] 429 quota — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

export function stripJsonFences(text: string): string {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

// Extracts the best JSON object from text that may contain reasoning prose.
// Phi-4-reasoning outputs chain-of-thought THEN the final answer — often inside
// <think>…</think> blocks that hide the JSON from a naive parse.
// Strategy: strip think-blocks, then collect all top-level JSON objects and
// return the last one (final answer).
export function extractJson(text: string): string {
  // Remove closed reasoning blocks (Phi-4-reasoning, DeepSeek-R1 style).
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Unclosed think block (token limit hit mid-thought): keep what follows the
  // last <think> tag only if a brace appears after it; else drop the block.
  const lastOpen = cleaned.toLowerCase().lastIndexOf("<think>");
  if (lastOpen !== -1) {
    const after = cleaned.slice(lastOpen + 7);
    cleaned = /[{[]/.test(after) ? after : cleaned.slice(0, lastOpen);
  }
  const stripped = stripJsonFences(cleaned);

  // Fast path: the whole string is valid JSON
  try { JSON.parse(stripped); return stripped; } catch {}

  // Collect all top-level { ... } blocks
  const candidates: string[] = [];
  let i = 0;
  while (i < stripped.length) {
    if (stripped[i] !== "{") { i++; continue; }
    let depth = 0;
    let inString = false;
    let escape = false;
    const start = i;
    for (; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(stripped.slice(start, i + 1));
          i++;
          break;
        }
      }
    }
  }

  if (candidates.length === 0) return stripped;

  // Prefer the last valid parseable candidate (Phi-4 puts its answer last)
  for (let k = candidates.length - 1; k >= 0; k--) {
    try { JSON.parse(candidates[k]); return candidates[k]; } catch {}
  }

  return candidates[candidates.length - 1];
}
