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
- `_shared/` — shared helpers (Supabase service client, admin-secret auth, Cloudflare AI
  provider, chunking/checksum, prompt building, memory/summary, vector search, shared types).

Function-level auth/enable state is declared in `supabase/config.toml` (`verify_jwt` per
function). `ingest`, `reindex`, and the delete path on `knowledge` additionally require the
`x-admin-secret` header checked in `_shared/admin-auth.ts`.

## Environment variables

| Variable                                                                                                          | Where                                  | Purpose                                            |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`                                                                    | root `.env.local`                      | CLI auth for `db:push` / `supabase:*` scripts only |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`                                                  | injected by Supabase CLI/runtime       | Never set manually                                 |
| `CF_ACCOUNT_ID`, `CF_AI_GATEWAY_ID`, `CF_AI_GATEWAY_TOKEN`, `CF_CHAT_MODEL_DEFAULT`, `CF_EMBEDDING_MODEL_DEFAULT` | `supabase/functions/.env(.production)` | Cloudflare AI Gateway access for chat/embeddings   |
| `INGEST_ADMIN_SECRET`                                                                                             | `supabase/functions/.env(.production)` | Shared secret required on admin-mutating requests  |

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

## Acceptance Criteria

- `supabase/config.toml` declares exactly one `[functions.<name>]` entry per directory under
  `supabase/functions/` (excluding `_shared`), matching what's on disk.
- Every file in `supabase/migrations/` follows the `<14-digit-timestamp>_<slug>.sql` naming
  convention with no duplicate timestamps, so ordering is deterministic.
- `npm run db:push` applies all migrations against a freshly linked Supabase project with no
  manual schema edits required.
