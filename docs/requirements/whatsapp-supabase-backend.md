# WhatsApp AI Assistant — Supabase Backend — Requirements

_Created: 2026-08-03_

## Overview

Migrate the Supabase backend (Postgres schema + Edge Functions) that powers the WhatsApp AI
assistant from the `whatsapp-chatbot` repo into this repo, unchanged. This covers the data layer
and Edge Functions only — no Next.js pages, Clerk auth, Stripe billing, or Prisma-owned SaaS
tables were brought over, and no UI was implemented. The dashboard/admin UI that calls these
functions will be implemented separately in this repo.

## Scope

### Database schema (`supabase/migrations/`)

Applied in order via `npm run db:push`:

- `enable_pgvector` — enables the `pgvector` extension.
- `create_customers` — WhatsApp customers keyed by phone number.
- `create_ai_configuration` — tunable model/prompt config, with a single active row.
- `create_knowledge_documents` / `create_knowledge_chunks` — ingested knowledge base and its
  vector-embedded chunks.
- `match_knowledge_chunks_rpc` — RPC used for similarity search over `knowledge_chunks`.
- `create_conversation_messages` / `create_conversation_summary` — per-customer chat history and
  rolling summaries.
- `seed_ai_configuration_default` — default active `ai_configuration` row.
- `add_knowledge_documents_source_unique` — uniqueness constraint on document source.
- `add_timezone_to_ai_configuration` — adds `ai_configuration.timezone` (default `'UTC'`), used to
  render the current date/time in the system prompt (see Change history).
- `grant_service_role_table_privileges` — plain SQL `GRANT`s for `service_role` on every table above
  plus `match_knowledge_chunks`, and a `default privileges` rule so future tables/functions inherit
  them. RLS-enabled-with-no-policies only blocks anon/authenticated; `service_role` has `BYPASSRLS`
  but still needs the underlying grant, which nothing had issued until this migration (see Change
  history).

### Edge Functions (`supabase/functions/`)

- `chat` — inbound WhatsApp message handling, RAG-augmented reply generation.
- `search` — similarity search over the knowledge base.
- `ingest` — admin-only: add/update knowledge documents (chunk + embed).
- `reindex` — admin-only: re-chunk/re-embed existing documents.
- `knowledge` — admin CRUD over knowledge documents (delete is admin-only).
- `health` — unauthenticated liveness check.
- `_shared/` — shared helpers (Supabase service client, admin-secret auth, OpenRouter provider,
  chunking/checksum, prompt building, memory/summary, vector search, shared types).

`_shared/ai-provider.ts` calls OpenRouter's (OpenAI-compatible) API —
`https://openrouter.ai/api/v1/{chat/completions|embeddings}` — using
`Authorization: Bearer {OPENROUTER_API_KEY}`, plus static `HTTP-Referer`/`X-Title` attribution
headers. As of 2026-08-27 this replaced Cloudflare Workers AI entirely (see Change history and
`docs/requirements/openrouter-migration.md`, the doc of record for that migration); no gateway/
opt-in header concept carried over. `config.chat_model` / `config.embedding_model` /
`config.fallback_model` (from `ai_configuration`) are passed straight through as the `model`
field — OpenRouter's aggregated catalog (e.g. `google/gemini-2.5-flash`, `openai/gpt-4o-mini`,
`qwen/qwen3-embedding-8b`) is accepted, not any single vendor's native ids.

Function-level auth/enable state is declared in `supabase/config.toml` (`verify_jwt` per
function). `ingest`, `reindex`, and the delete path on `knowledge` additionally require the
`x-admin-secret` header checked in `_shared/admin-auth.ts`.

## Environment variables

| Variable                                                         | Where                                  | Purpose                                            |
| ---------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`                   | root `.env.local`                      | CLI auth for `db:push` / `supabase:*` scripts only |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | injected by Supabase CLI/runtime       | Never set manually                                 |
| `OPENROUTER_API_KEY`                                             | `supabase/functions/.env(.production)` | OpenRouter API access for chat/embeddings          |
| `INGEST_ADMIN_SECRET`                                            | `supabase/functions/.env(.production)` | Shared secret required on admin-mutating requests  |

`supabase/functions/.env.example` is the template for the function-local file; it is not
committed with real values (see `.gitignore`).

## package.json scripts

- `db:push` — link the project and push migrations (pre-existing).
- `supabase:functions:serve` — run Edge Functions locally against `supabase/functions/.env`.
- `supabase:functions:deploy` — deploy all six functions.
- `supabase:secrets:set` — push `supabase/functions/.env.production` as deployed secrets.

## Explicitly out of scope

- Next.js routes/pages, Clerk auth, Stripe billing, Prisma schema/client, Upstash rate limiting —
  these belonged to the source repo's SaaS shell, not the WhatsApp backend, and are not migrated.
- Any dashboard/admin UI for knowledge management — tracked separately when the UI is built.

## Change history

- **2026-08-03 — `service_role` permission denied (`42501`) on `knowledge_documents` and other
  tables.** Every table was created with RLS enabled and no policies, and `service_role`'s
  `BYPASSRLS` attribute was mistakenly assumed to be sufficient — but plain SQL-level `GRANT`s are
  a separate mechanism from RLS, and none had ever been issued to `service_role`. Every Edge
  Function call that touched the database failed with `42501`. Fixed by
  `grant_service_role_table_privileges` (see schema list above); required a Postgres
  `NOTIFY pgrst, 'reload schema'` afterwards for PostgREST to pick up the new grants on an
  already-linked project.
- **2026-08-03 — `ingest` could permanently orphan a document with no chunks.** `ingest`'s
  checksum-based short-circuit (`existing.checksum === checksum` ⇒ skip re-chunking) assumed a
  matching checksum implies the document's chunks exist. During the incident above, two documents
  got their `knowledge_documents` row written but failed before `replaceChunks` ran, leaving a
  valid checksum with zero `knowledge_chunks` rows — re-submitting the same content would then
  permanently no-op instead of backfilling. Fixed in `supabase/functions/ingest/index.ts` by also checking
  `documentHasChunks()` (`supabase/functions/_shared/knowledge.ts`) before taking the `unchanged`
  path; covered by `supabase/functions/_shared/knowledge.test.ts` (Deno test runner — not wired
  into `npm test`, which only covers the Next.js/Vitest side of this repo).
- **2026-08-04 — switched `_shared/ai-provider.ts` from AI Gateway to Workers AI v1 directly.**
  Chat/embedding calls previously went through `gateway.ai.cloudflare.com/v1/{account}/{gateway}/workers-ai/{model}`
  using Workers AI's native request/response shape (`{text: [...]}` / `{result: {response}}`).
  Rewritten to call `api.cloudflare.com/client/v4/accounts/{account}/ai/v1/{chat/completions|embeddings}`
  directly, OpenAI-compatible request/response shape (`{model, messages}` → `choices[0].message.content`;
  `{model, input}` → `data[].embedding`). Drops the `CF_AI_GATEWAY_ID` env var (no longer needed —
  no gateway in the path) and renames `CF_AI_GATEWAY_TOKEN` to `CF_API_TOKEN` (a plain Cloudflare
  API token with `Account > Workers AI > Read`, not a gateway-specific credential). Also removed
  the unused `CF_CHAT_MODEL_DEFAULT` / `CF_EMBEDDING_MODEL_DEFAULT` vars from
  `supabase/functions/.env.example` — dead even before this change, since model selection has
  always come from `ai_configuration.chat_model` / `embedding_model` / `fallback_model`, not env
  vars. Existing `@cf/...` model ids in that table still work against the new endpoint unchanged;
  the new endpoint additionally accepts the wider aggregated catalog (e.g. `openai/gpt-5-nano`).
  Trade-off: losing AI Gateway's request logging/caching/rate-limiting, accepted for simplicity.
  Covered by `supabase/functions/_shared/ai-provider.test.ts`.
- **2026-08-04 — Workers AI 429s (`code 971`, account rate limit) surfaced as `chat` 500s.**
  Observed in production logs immediately after the change above: a burst of requests tripped
  Cloudflare's account-level Workers AI rate limit, and the resulting 429 propagated straight up
  as an uncaught error, returning `Internal error` to the WhatsApp user for what's normally a
  transient condition. Fixed by adding `fetchWithRetry()` in `_shared/ai-provider.ts` — retries a
  429 up to twice with backoff (honoring `Retry-After` when Cloudflare sends one, else 500ms then
  1500ms) before giving up; applies to both `chatComplete()` and `embedBatch()`. Covered by the
  retry-succeeds / retries-exhausted / `Retry-After`-honored cases in
  `supabase/functions/_shared/ai-provider.test.ts`.
- **2026-08-04 — `chat` 500s: deprecated Workers AI models.** `ai_configuration.chat_model`
  (`@cf/meta/llama-3.1-8b-instruct`) was deprecated by Cloudflare on 2026-05-30 and started
  returning `410 { errors: [{ code: 5028, message: "Model has been deprecated" }] }` from the
  Workers AI v1 API. Initially misdiagnosed as the 429/rate-limit issue above because the API
  gateway log alone doesn't surface the underlying error — the function's own execution log
  (`console.error('chat function error:', error)`) had the real `410`. `chat/index.ts`'s
  primary/fallback logic only retries once with `config.fallback_model`, which was
  `@cf/meta/llama-3-8b-instruct` — an older, also-deprecated model — so every request failed
  end-to-end regardless. Not a code bug: the ai-provider retry/fallback logic worked as designed,
  the configured model ids were just stale. Fixed by
  `20260804010000_update_deprecated_chat_models.sql`, which updates the active `ai_configuration`
  row to `chat_model = @cf/meta/llama-3.1-8b-instruct-fast` and
  `fallback_model = @cf/meta/llama-3.2-3b-instruct` (both confirmed current on
  https://developers.cloudflare.com/workers-ai/models/ as of this fix). `embedding_model`
  (`@cf/baai/bge-base-en-v1.5`) was unaffected and confirmed still current — left unchanged, since
  changing it would require re-embedding every existing `knowledge_chunks` row. No application
  code change was needed or made; this is a data-only migration.
- **2026-08-04 — Workers AI 429s (`code 971`) persisted under real traffic; re-added AI Gateway
  coverage.** The `fetchWithRetry()` fix above clears an isolated blip but not sustained
  throttling: `chat` embeds+completes on every inbound message, and `ingest`/`reindex` batch-embed
  on the same shared account-level quota, so a burst of either still exhausts the two-retry budget
  and surfaces as a 500. Root cause traced back to the AI Gateway removal earlier the same day
  (previous entry), which explicitly traded away gateway-side caching/rate-limiting for simplicity.
  Reinstated, but not by reverting to the old `gateway.ai.cloudflare.com/v1/{account}/{gateway}/workers-ai/{model}`
  URL/native-shape setup — Cloudflare's REST API now supports attaching full Gateway behavior
  (caching, rate-limit queuing, logging) to the same `api.cloudflare.com/.../ai/v1/*`
  OpenAI-compatible endpoint already in use, via a `cf-aig-gateway-id` request header, with no URL
  or request/response shape change. `authHeaders()` in `_shared/ai-provider.ts` now adds that
  header when the new `CF_AI_GATEWAY_ID` env var is set; unset, behavior is unchanged, so this is
  an opt-in rollout gated on creating a Gateway in the Cloudflare dashboard and setting the secret
  — no code path breaks if it's left unconfigured. Postgres-backed embedding caching and isolating
  `ingest`/`reindex` bulk traffic onto a separate rate budget from live `chat` traffic were
  considered and deliberately deferred; the Gateway's own caching/queuing covers the immediate
  production issue. Covered by the `cf-aig-gateway-id` header-present/absent cases in
  `supabase/functions/_shared/ai-provider.test.ts`. Note: Cloudflare's own docs were unreachable
  from the environment this fix was written in (network policy blocked `developers.cloudflare.com`),
  so the header name/behavior was corroborated via search rather than a direct docs read — worth a
  quick cross-check against current Cloudflare AI Gateway docs if this doesn't clear the 429s.
- **2026-08-05 — `chat` couldn't answer "what day is it" / "are you open today".** The model has
  no clock, and the system prompt built by `_shared/prompt-builder.ts` never told it the current
  date, so any question needing today's day-of-week (open/closed checks against business hours in
  the retrieved knowledge) got a "I don't have real-time access to the date" non-answer instead of
  a real one. Fixed by adding `ai_configuration.timezone` (new column, default `'UTC'`, migration
  `20260805010000_add_timezone_to_ai_configuration.sql`) and having `buildMessages()` inject a
  `Current date and time: <weekday, date, time> (<timezone>)` line into the system prompt, computed
  via `Intl.DateTimeFormat` in that timezone so the day-of-week is correct for the business's
  locale, not the server's. `buildMessages()` takes an optional trailing `now: Date` (defaults to
  `new Date()`) so tests can pin a specific instant instead of depending on wall-clock time.
  Business hours themselves are unaffected — they still come entirely from retrieved knowledge
  chunks; this change only gives the model the "today is ___" fact needed to reason about them.
  Covered by `supabase/functions/_shared/prompt-builder.test.ts`. No admin UI exists yet to edit
  `timezone` per business — it defaults to `'UTC'` until one is built; update via the Supabase
  dashboard/SQL in the meantime.
  Follow-up same day: the first version of this instruction led the model to narrate its
  reasoning back to the customer (e.g. "Today is Wednesday, and according to our opening hours,
  we are open from 08 to 05, so yes, we are open today") instead of just answering. The date/time
  instruction in `buildMessages()` now explicitly says to use the date "silently" and to state the
  conclusion directly (e.g. "Yes, we're open until 5pm today") without narrating how the day or
  date was determined. Covered by the added "answer directly, don't narrate" case in
  `prompt-builder.test.ts`.
- **2026-08-08 — `chat` fallback replies didn't match `ai_configuration.fallback_message`
  exactly.** The zero-chunk grounding gate (`rag-pipeline.ts`) always returns `fallback_message`
  verbatim, but when at least one chunk _did_ clear `similarity_threshold` and the LLM still
  couldn't answer the specific question from it, the model fell back to its own wording (e.g. "I'm
  sorry, I couldn't find that information in our knowledge base...") instead of the configured
  text. Root cause: the seeded default `system_prompt` only told the model to "say so plainly" in
  its own words — it never referenced `fallback_message` at all. This broke downstream automation
  (the Make.com/WhatsApp relay) that branches on an exact string match against `fallback_message`
  to decide whether to hand a conversation to a human.
  Fixed by having `buildMessages()` in `_shared/prompt-builder.ts` append a final, non-optional
  instruction — sourced from `config.fallback_message` itself rather than duplicated as a second
  hardcoded string — telling the model to reply with that exact text and nothing else when the
  retrieved knowledge doesn't answer the question. This applies regardless of what a business's
  own `system_prompt`/`business_rules_prompt` say, since it's appended by code, not by prompt
  content. The conflicting "say so plainly" clause was removed from the default seed prompt
  (`20260802000008_seed_ai_configuration_default.sql`) and from any already-migrated database via
  `20260808000000_fix_default_system_prompt_fallback_wording.sql` (matches only rows still holding
  the exact original default text, so a customized prompt is left untouched).
  Covered by the new "echo fallback_message verbatim" case in `prompt-builder.test.ts`.
  Note: this is prompt-level compliance, not a deterministic code gate — the LLM can still fail to
  follow the instruction, unlike the zero-chunk path which never calls the LLM at all. It also
  doesn't create a `chat_escalations` row when it fires this way (only the zero-chunk gate does,
  per the explicit "no confidence-threshold-based escalation trigger" scope decision in
  [human-attention-escalations.md](./human-attention-escalations.md)) — worth revisiting if these
  paraphrased-fallback episodes need the same human follow-up as zero-chunk ones.
- **2026-08-27 — replaced Cloudflare Workers AI with OpenRouter (imprecise Sinhala retrieval).**
  `@cf/baai/bge-base-en-v1.5`, the embedding model in place since this backend's original
  migration, is English-only; Sinhala query/chunk embeddings it produced were low-quality enough
  that genuine matches often scored below `similarity_threshold` and got dropped by the grounding
  gate in `_shared/rag-pipeline.ts`, or the wrong chunks cleared the bar instead. Full detail,
  model selection rationale, and testing in
  [openrouter-migration.md](./openrouter-migration.md) — the doc of record for this change; this
  entry only cross-references it per that document's own Scope. Summary: `_shared/ai-provider.ts`
  now calls `https://openrouter.ai/api/v1/{chat/completions|embeddings}` instead of
  `api.cloudflare.com`, dropping `CF_ACCOUNT_ID` / `CF_API_TOKEN` / `CF_AI_GATEWAY_ID` for
  `OPENROUTER_API_KEY`; the active `ai_configuration` row now points at
  `chat_model = google/gemini-2.5-flash`, `fallback_model = openai/gpt-4o-mini`,
  `embedding_model = qwen/qwen3-embedding-8b` (chosen for confirmed Sinhala support); and
  `knowledge_chunks.embedding` / `match_knowledge_chunks.query_embedding` were resized from
  `vector(768)` to `vector(1024)` (Qwen3-Embedding truncated via OpenRouter's `dimensions` request
  field — MRL truncation, confirmed against OpenRouter's API reference) via
  `20260827000000_resize_knowledge_chunks_embedding.sql` and
  `20260827000001_update_match_knowledge_chunks_dimension.sql`. Every existing chunk needs a
  `/reindex` run after these migrations land — old vectors are wiped, not cast, since they're from
  an incompatible embedding space. Also fixed a latent bug in `_shared/chunk.ts` surfaced by this
  migration: its hard-split path sliced text by raw UTF-16 code-unit index, which can land inside
  a Sinhala grapheme cluster (base consonant + dependent vowel sign/virama); rewritten to cut only
  on `Intl.Segmenter` grapheme boundaries, covered by the new `_shared/chunk.test.ts`.
  `similarity_threshold` was set to a **provisional** `0.50` in
  `20260827000002_switch_ai_configuration_to_openrouter.sql` — `0.75` was tuned against
  `bge-base-en-v1.5`'s score distribution and doesn't carry over; the real value still needs the
  functional acceptance run against actual Sinhala question/expected-chunk pairs described in
  openrouter-migration.md's Testing §6, which has not been executed yet (no live OpenRouter
  key/knowledge base in the environment this migration was implemented in). Whoever runs that test
  should land a follow-up migration with the calibrated threshold and record the results in
  openrouter-migration.md's own Change history, per that document's Acceptance Criteria.

## Acceptance Criteria

- `supabase/config.toml` declares exactly one `[functions.<name>]` entry per directory under
  `supabase/functions/` (excluding `_shared`), matching what's on disk.
- Every file in `supabase/migrations/` follows the `<14-digit-timestamp>_<slug>.sql` naming
  convention with no duplicate timestamps, so ordering is deterministic.
- `npm run db:push` applies all migrations against a freshly linked Supabase project with no
  manual schema edits required.
