# AI Engineering Guide — Herald Knowledge Base
*Foundry IQ-pattern knowledge source · Synthetic data only*

## Purpose
This guide covers the applied AI concepts used by Herald's own reasoning pipeline and required for AI-feature contributors, aligned to AI-102 certification objectives.

## Grounding and retrieval (AI-102)
A generative model should answer from retrieved, approved sources rather than from parametric memory whenever the answer must be trustworthy. Grounded generation attaches a citation to every claim so a reviewer can verify it against the source; an answer that cannot cite its source should be rejected or clearly labelled as ungrounded. Retrieval quality dominates answer quality: a perfect prompt cannot recover from retrieving the wrong chunks.

## Prompt engineering for structured output (AI-102)
When a model's output feeds a program rather than a person, constrain it: specify the exact JSON schema, instruct "no prose, no markdown fences," and validate the parsed result against the schema before use. Reasoning models may wrap answers in thinking blocks or add commentary despite instructions, so parsers must strip reasoning artifacts and scan for the first balanced JSON object rather than calling JSON.parse on raw output. Temperature and sampling parameters should be omitted for reasoning models that reject them.

## Fallback chains and graceful degradation (AI-102)
A production AI feature needs a defined behavior for every failure mode: model unavailable, quota exhausted, malformed output, and timeout. Tiered fallback tries progressively simpler providers and ends in a deterministic path so the feature degrades rather than disappears. Every response should disclose which tier produced it, because silent substitution of a weaker model erodes trust in the strong one.

## Responsible AI in agent systems (AI-102)
Agents that take actions visible to other people must keep a human approval gate between reasoning and execution, enforced server-side where the user cannot bypass it. Reasoning traces should be persisted and displayable so a reviewer can audit why the agent decided what it decided. Synthetic or de-identified data belongs in demos and evaluations; real personal data requires consent, minimization, and a deletion path.

## Evaluating AI features (AI-102)
Fixed fixtures with known expected properties catch regressions that ad-hoc testing misses: schema validity, required fields, safety overrides, and deterministic fallback correctness. Self-authored checks validate behavior against your own specification — valuable for regression safety, but they are not external benchmarks and should not be presented as such. Rate limits make AI tests flaky; evaluation harnesses need retry policies and must distinguish "model failed" from "model rate-limited."

## Cost and latency management (AI-102)
Token budgets are a real constraint: reasoning models consume output budget on hidden thinking, so max-token limits must leave room for the visible answer. Caching identical prompts, truncating retrieved context to what the question needs, and choosing the smallest model that meets quality bars are the three highest-leverage cost controls.

## Study guidance for AI-feature contributors
AI-102 candidates should be fluent in retrieval-augmented patterns, responsible AI requirements, and Azure AI service configuration before the exam. The team's bar is a 75% practice score on grounded assessments plus a reviewed contribution to the evaluation harness.
