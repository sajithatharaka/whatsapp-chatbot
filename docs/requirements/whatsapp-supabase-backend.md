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
- `_shared/` — shared helpers (Supabase service client, admin-secret auth, Cloudflare Workers AI
  provider, chunking/checksum, prompt building, memory/summary, vector search, shared types).

`_shared/ai-provider.ts` calls Cloudflare's Workers AI v1 (OpenAI-compatible) API —
`https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/v1/{chat/completions|embeddings}`
— using `Authorization: Bearer {CF_API_TOKEN}`. When `CF_AI_GATEWAY_ID` is set, requests also carry
a `cf-aig-gateway-id` header, routing them through that Cloudflare AI Gateway for gateway-side
caching/rate-limiting/logging (see Change history); left unset, requests go straight to
`api.cloudflare.com` with none of that. `config.chat_model` / `config.embedding_model` /
`config.fallback_model` (from `ai_configuration`) are passed straight through as the `model`
field; both native Workers AI ids (`@cf/...`) and the broader aggregated catalog (e.g.
`openai/gpt-5-nano`) are accepted.

Function-level auth/enable state is declared in `supabase/config.toml` (`verify_jwt` per
function). `ingest`, `reindex`, and the delete path on `knowledge` additionally require the
`x-admin-secret` header checked in `_shared/admin-auth.ts`.

## Environment variables

| Variable                                                         | Where                                  | Purpose                                                 |
| ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`                   | root `.env.local`                      | CLI auth for `db:push` / `supabase:*` scripts only      |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | injected by Supabase CLI/runtime       | Never set manually                                      |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN`                                  | `supabase/functions/.env(.production)` | Workers AI v1 API access for chat/embeddings            |
| `CF_AI_GATEWAY_ID`                                               | `supabase/functions/.env(.production)` | Optional: routes Workers AI calls through an AI Gateway |
| `INGEST_ADMIN_SECRET`                                            | `supabase/functions/.env(.production)` | Shared secret required on admin-mutating requests       |

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

## Acceptance Criteria

- `supabase/config.toml` declares exactly one `[functions.<name>]` entry per directory under
  `supabase/functions/` (excluding `_shared`), matching what's on disk.
- Every file in `supabase/migrations/` follows the `<14-digit-timestamp>_<slug>.sql` naming
  convention with no duplicate timestamps, so ordering is deterministic.
- `npm run db:push` applies all migrations against a freshly linked Supabase project with no
  manual schema edits required.
