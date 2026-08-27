# Migrate AI Provider: Cloudflare Workers AI → OpenRouter (Sinhala Retrieval Fix)

_Created: 2026-08-26_

## Overview

Sinhala knowledge retrieval is currently imprecise, and sometimes returns the fallback
("couldn't find the answer") even when the answer exists in `knowledge_chunks`. Root cause
(documented in this session's analysis, not yet written up elsewhere): the active embedding
model, `@cf/baai/bge-base-en-v1.5` (`ai_configuration.embedding_model`, seeded in
`20260802000008_seed_ai_configuration_default.sql`), is English-only. Sinhala query/chunk
embeddings it produces are low-quality, so genuine matches often score below
`similarity_threshold` (0.75) in `match_knowledge_chunks` and get dropped by the grounding gate
in `_shared/rag-pipeline.ts` before the LLM ever sees them; when chunks do clear the bar, they're
often the wrong ones, producing imprecise answers.

This requirement replaces Cloudflare Workers AI entirely with **OpenRouter** for both chat
completion and embeddings, and switches to models with confirmed Sinhala support:

- **Embedding**: `qwen/qwen3-embedding-8b` — explicitly lists Sinhala in its supported languages,
  ranks #1 on the MTEB multilingual leaderboard, and is the cheapest option evaluated
  (~$0.01/M tokens). Supports Matryoshka (MRL) dimension truncation.
- **Chat**: `google/gemini-2.5-flash` — stronger Sinhala/Brahmic-script fluency than
  OpenAI's mini tier in practice; $0.30/$2.50 per M input/output tokens.
- **Fallback chat**: `openai/gpt-4o-mini` — cheapest reasonable fallback ($0.15/$0.60 per M
  tokens), used only when the primary model call fails (existing `config.fallback_model`
  mechanism in `rag-pipeline.ts:56-72`, unchanged).

Both OpenRouter endpoints (`/chat/completions`, `/embeddings`) are OpenAI-compatible, matching
the request/response shapes `_shared/ai-provider.ts` already parses — this is a provider/endpoint
swap, not a rewrite of the calling code's data shapes.

## Scope

### `_shared/ai-provider.ts`

- `apiUrl()` → `https://openrouter.ai/api/v1/{chat/completions|embeddings}` (drop the
  `CF_ACCOUNT_ID`-scoped Cloudflare URL).
- `authHeaders()` → `Authorization: Bearer ${OPENROUTER_API_KEY}`; add OpenRouter's optional
  `HTTP-Referer` / `X-Title` attribution headers (static values, not env-dependent). Drop
  `CF_API_TOKEN` and `CF_AI_GATEWAY_ID` / `cf-aig-gateway-id` entirely — OpenRouter has no
  equivalent gateway-id header, and no gateway opt-in exists to preserve.
- `fetchWithRetry()` (429 retry with `Retry-After` honoring) is provider-agnostic and stays as
  written — OpenRouter also returns 429 on rate limits.
- Response parsing (`body.choices[0].message.content`, `body.data[].embedding`) is unchanged.

### Environment variables

- `.env.example` and `supabase/functions/.env.example`: remove `CF_ACCOUNT_ID`, `CF_API_TOKEN`,
  `CF_AI_GATEWAY_ID`; add `OPENROUTER_API_KEY`.
- Deployed function secrets: same swap, applied via `supabase secrets set`.

### Database — embedding dimension change

`knowledge_chunks.embedding` is `vector(768)`, pinned to `bge-base-en-v1.5`'s output size (see
comment in `20260802000004_create_knowledge_chunks.sql`). Qwen3-Embedding's native output is
larger; decide and record the target dimension (recommend truncating via MRL to `1024` to keep
the existing HNSW index size/query latency reasonable — confirm the exact truncation mechanism
Qwen3-Embedding exposes via OpenRouter before finalizing).

New migration(s) required:

- Alter `knowledge_chunks.embedding` to `vector(<new_dim>)`.
- Recreate `match_knowledge_chunks` with `query_embedding extensions.vector(<new_dim>)`.
- Update the comment on `knowledge_chunks.embedding` to reference the new model/dimension instead
  of `bge-base-en-v1.5`/768.

### Config data change

New migration updating the active `ai_configuration` row:

- `chat_model` → `google/gemini-2.5-flash`
- `fallback_model` → `openai/gpt-4o-mini`
- `embedding_model` → `qwen/qwen3-embedding-8b`
- `similarity_threshold` → recalibrated value (see Testing) — do **not** carry over `0.75`
  unexamined; it was tuned against a different model's score distribution.

### Reindex

After the schema + config migrations land, every existing `knowledge_chunks` row must be
re-embedded with the new model before search will work — old 768-dim vectors are incompatible
with the new column and, even if dimensions matched, would be in the wrong embedding space. Use
the existing `/reindex` function (already model-agnostic, batches via `embedBatch`) with no body
(reindex everything).

### Docs

- `docs/requirements/whatsapp-supabase-backend.md` describes `_shared/ai-provider.ts` as calling
  Cloudflare Workers AI (its "Edge Functions" section and several "Change history" entries). Once
  this migration ships, add a "Change history" entry there cross-referencing this document, since
  that's the doc of record for that shared module.

## Explicitly out of scope

- Building a dashboard UI to edit `ai_configuration` (still DB/migration-only, as today).
- A reranking layer on top of vector search.
- Automatic query-language detection/routing (e.g. picking an embedding model per message
  language) — one embedding model is used for all traffic.
- Evaluating Sinhala-specific monolingual models (e.g. HelaBERT) — OpenRouter's catalog is
  chat-completion/embedding aggregation only and doesn't carry those; would require a separate
  self-hosted inference path.
- Cohere `embed-v4` (documented Sinhala support, considered as an alternative) — not adopted now;
  worth revisiting if Qwen3-Embedding's real-world Sinhala precision disappoints.

## Environment variables

| Variable | Status |
|---|---|
| `CF_ACCOUNT_ID` | Removed |
| `CF_API_TOKEN` | Removed |
| `CF_AI_GATEWAY_ID` | Removed |
| `OPENROUTER_API_KEY` | Added — required |

## Testing

Every behavioral change below needs test coverage before merge, per this repo's non-negotiable
testing rule. Supabase Edge Function code is tested with `Deno.test` (colocated `*.test.ts` next
to the module, e.g. `ai-provider.test.ts`), not Vitest — Vitest (`tests/**`) only covers `/src`.

1. **`_shared/ai-provider.test.ts` — rewrite for OpenRouter** (replaces the current
   Cloudflare-shaped suite):
   - `chatComplete` posts to `https://openrouter.ai/api/v1/chat/completions` with
     `Authorization: Bearer <OPENROUTER_API_KEY>` and the expected `HTTP-Referer`/`X-Title`
     headers; request body shape (`model`/`messages`/`temperature`/`max_tokens`) unchanged.
   - `chatComplete` throws when `OPENROUTER_API_KEY` is not set (replaces the old
     `CF_ACCOUNT_ID`/`CF_API_TOKEN`-not-set cases).
   - `chatComplete` throws with response body text on non-ok response (unchanged behavior, new
     endpoint).
   - `chatComplete` throws when the response is missing `choices[0].message.content`.
   - 429 retry cases carried over as-is against the new URL: retry-then-succeed, retries
     exhausted (still 3 total attempts), `Retry-After` header honored.
   - `embedBatch` posts to `https://openrouter.ai/api/v1/embeddings`, returns each item's
     embedding in input order, throws when the response is missing `data`.
   - `embed` returns the first vector from `embedBatch`.
   - Remove all `cf-aig-gateway-id` header present/absent cases — no equivalent concept on
     OpenRouter.

2. **`_shared/chunk.test.ts` (new file — doesn't exist today)**:
   - A Sinhala paragraph longer than `CHUNK_SIZE * 1.5` (forcing the hard-split branch) splits
     without breaking a base-consonant + dependent-vowel-sign/virama cluster — assert via
     `Intl.Segmenter(locale, {granularity: 'grapheme'})` that no chunk boundary falls inside a
     grapheme the segmenter would keep together.
   - Overlap (`CHUNK_OVERLAP` chars carried into the next chunk) is preserved after switching the
     split to grapheme-aware boundaries.
   - Existing English paragraph-packing behavior (paragraph-aware greedy packing, overlap on
     normal paragraph-boundary splits) is unchanged — regression coverage, since today there is no
     `chunk.test.ts` at all and this logic is currently untested.

3. **`_shared/rag-pipeline.test.ts` — regression additions**:
   - Grounding gate (`chunks.length === 0` → fallback message + escalation, no LLM call) still
     fires correctly with the new embedding model's response shape mocked in.
   - `confidence` still derived from `chunks[0].similarity` and `sources` still built as
     `chunk_${chunk.id}` — unaffected by the provider swap, asserted as a regression check.

4. **`_shared/knowledge.test.ts` — regression addition**:
   - `updateChunkEmbedding` (used by `/reindex`) accepts a vector of the new dimension length
     without truncation/rejection.

5. **Migration verification (manual, not an automated test suite — this repo has no automated
   Postgres migration tests today, consistent with existing migrations)**:
   - `npm run db:push` against a scratch/staging project applies the new migrations cleanly.
   - `\d knowledge_chunks` shows `embedding vector(<new_dim>)`; `match_knowledge_chunks` RPC
     signature matches.
   - Post-`/reindex`, spot-check a few `knowledge_chunks` rows have non-null, correctly-sized
     embeddings.

6. **Functional acceptance test (manual, drives the threshold recalibration and proves the fix)**:
   - Assemble a fixed set of real Sinhala question → expected-chunk pairs from the actual
     knowledge base (document them in this file's Change history once run).
   - Run each through `/search` post-migration; record the similarity scores returned for the
     correct chunk.
   - Set `similarity_threshold` just below the lowest observed good-match score (with margin),
     not left at the old `0.75`.
   - Re-run the same set through `/chat` (or `/web-chat`) and confirm each produces a grounded,
     accurate Sinhala answer instead of the fallback message.

## Acceptance Criteria

- No references to `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_AI_GATEWAY_ID`, or
  `api.cloudflare.com` remain in `supabase/functions/` or the `.env.example` files.
- `ai_configuration` (active row) has `embedding_model = 'qwen/qwen3-embedding-8b'`,
  `chat_model = 'google/gemini-2.5-flash'`, `fallback_model = 'openai/gpt-4o-mini'`, and a
  `similarity_threshold` set from real measured scores (not the untouched `0.75` default).
- `knowledge_chunks.embedding` and `match_knowledge_chunks.query_embedding` agree on vector
  dimension, and every existing chunk has been re-embedded (no stale 768-dim vectors left).
- All test files listed under Testing exist and pass (`deno test` for `supabase/functions/_shared`,
  `npm run test` for anything under `tests/`).
- The functional acceptance test set (Testing §6) is run once against the live migrated system and
  its results are recorded in this document's Change history.
