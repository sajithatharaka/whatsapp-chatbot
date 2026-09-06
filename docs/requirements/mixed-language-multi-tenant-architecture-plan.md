# Multi-Tenant + Mixed-Language Architecture — Migration Plan

_Created: 2026-09-06_
_Status: Planning only — no implementation yet. Source spec: architecture doc supplied by Sajitha
(2026-09-06), summarized as "AI WhatsApp Sales & Customer Support Assistant — Technical
Architecture & Claude Code Build Specification v1.0"._

## 1. Purpose

Compare the target architecture (multi-tenant SaaS, first-class Language Engine for
Sinhala/English/Singlish/mixed conversations, tool-calling, RAG, human handoff) against what is
actually built in this repo today, and lay out a phased path from one to the other. This document
is the plan of record — implementation should follow it phase by phase, updating it as scope
changes, per CLAUDE.md's planning rule.

## 2. What exists today (as of this plan)

The current system is a **single-tenant** knowledge-base chatbot with WhatsApp reached through an
external relay (ManyChat), not a direct Meta Cloud API webhook:

```text
WhatsApp customer → ManyChat (Default Reply automation) → POST /chat (Supabase Edge Function)
                                                                  |
                                                                  v
                                                     runRagPipeline() in _shared/rag-pipeline.ts
                                                                  |
                              +----------------+-----------------+------------------+
                              v                v                                    v
                    embed(query) via       searchKnowledge()               appendMessage() /
                    OpenRouter              (pgvector, global,              loadRecentTurns()
                                             no tenant filter)              (conversation_messages)
                              |                |                                    |
                              +----------------+------------------------------------+
                                                v
                                     buildMessages() → chatComplete() (OpenRouter)
                                                v
                                     reply + confidence + sources
                                                v
                                   ManyChat sends reply back to WhatsApp
```

Confirmed by reading `supabase/migrations/*.sql`, `supabase/functions/_shared/*.ts`,
`supabase/functions/chat/index.ts`, and `docs/requirements/*.md`:

- **Tenancy**: none. `grep -rn "business_id|tenant" supabase/migrations` returns nothing. One
  `ai_configuration` row for the whole deployment (`loadActiveConfig`), one global `customers`
  table, one global `knowledge_chunks` table. There is no `businesses` table and no RLS policy
  anywhere that scopes data per tenant.
- **Channel**: WhatsApp is not connected via Meta Cloud API directly. `/chat` is a generic
  provider-agnostic endpoint; ManyChat (formerly Make.com) is the relay that owns the actual Meta
  webhook, per `docs/requirements/manychat-whatsapp-integration.md`. There's also a `web-chat`
  function for the website widget, using the same `runRagPipeline`.
- **AI provider abstraction**: partial. `_shared/ai-provider.ts` isolates all OpenRouter API shape
  knowledge behind `embed()` / `embedBatch()` / `chatComplete()` — good separation — but there is
  no `AIProvider` interface/class; swapping providers means editing this file, not implementing a
  new class. No `classify()` capability exists.
- **Language Engine**: does not exist. No language/script/style/formality detection, no
  `primary_language`/`secondary_language`/`style` fields anywhere in the schema, and the system
  prompt (`_shared/prompt-builder.ts`) has no language-mirroring rules at all — it's tuned for
  fallback-message fidelity and date/time awareness, not code-switching. `customers.preferred_language`
  exists as a single free-text column but nothing writes or reads it.
- **RAG**: implemented and reasonably solid — `_shared/vector-search.ts` + `_shared/chunk.ts` +
  `_shared/knowledge.ts`, pgvector via `match_knowledge_chunks` RPC, checksum-based re-ingestion
  guard, grapheme-safe chunking (fixed for Sinhala per the 2026-08-27 OpenRouter migration). Matches
  the target's ingestion pipeline shape closely. Missing: `business_id` filter (§11 of the spec is
  violated by construction, since there's only one tenant right now).
- **Conversation memory**: short-term only (`loadRecentTurns`, last 10 messages). `conversation_summary`
  table exists but `maybeUpdateSummary()` is a stub ("Phase 1 heuristic... deferred"). No long-term
  customer memory fields (guests count, product interest, etc.) beyond the single `preferred_language`
  column.
- **Tools / function calling**: does not exist. The LLM only ever answers from retrieved knowledge
  or emits the exact configured `fallback_message`. No `create_lead`, `create_order`,
  `check_availability`, `notify_team`, or `request_human` tool. `ChatResponse.tool` is always `null`.
- **Human handoff**: partially implemented, but reactively rather than as an LLM-driven decision.
  `_shared/escalations.ts` + `chat_escalations` table auto-create an escalation only when the
  zero-chunk grounding gate fires (no knowledge found) — there's no `conversation.status`
  (`ai_active`/`human_requested`/`human_active`/`resolved`) state machine, and the AI never chooses
  to hand off for reasons like anger, repeated failure, or an explicit "talk to a human" request.
  Dashboard UI exists for agents to view/respond to escalations (`docs/requirements/human-attention-escalations.md`).
- **Response validation**: does not exist. No language-match / factuality / tool-claim / length
  check before sending. The only safety net is the grounding gate (no chunks → forced fallback) and
  a hardcoded verbatim-fallback instruction in the prompt.
- **Dashboard**: exists and covers knowledge, settings, escalations, widget config, API docs,
  analytics (per `src/app/dashboard/*`) — but nothing for products, leads, orders, or per-business
  AI settings, since there's only one business.
- **Database schema**: `customers`, `ai_configuration`, `knowledge_documents`, `knowledge_chunks`,
  `conversation_messages`, `conversation_summary`, `chat_escalations`, `web_widget_config`. No
  `businesses`, `business_users`, `whatsapp_numbers`, `products`, `leads`, `orders`, `ai_events`.
- **Reliability/observability**: no `provider_message_id` idempotency key on inbound messages (the
  spec's §29 requirement), no `ai_events` logging table — token usage/latency aren't tracked
  anywhere.

## 3. Gap summary (target vs. actual)

| Area                | Target spec                                                                | Current repo                                                       | Gap                                                                                                      |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Tenancy             | `business_id` on every table, RLS-enforced                                 | Single global tenant, no RLS scoping                               | **Full rebuild**                                                                                         |
| WhatsApp channel    | Direct Meta Cloud API webhook, `WhatsAppProvider` abstraction              | ManyChat relay owns the webhook; repo only exposes generic `/chat` | **New integration** — build direct Meta webhook, keep ManyChat as a supported mode (per-business choice) |
| AI provider         | `AIProvider` interface (`generateResponse`/`generateEmbedding`/`classify`) | Free functions in one file, OpenRouter-only, no `classify`         | **Refactor**                                                                                             |
| Language Engine     | Dedicated pre-response stage, output schema, language memory               | Nonexistent                                                        | **New component**                                                                                        |
| RAG                 | Per-business filtered pgvector retrieval                                   | Working, but global (no tenant filter)                             | **Extend**                                                                                               |
| Memory              | Short + long-term, structured customer facts                               | Short-term only; summary stubbed                                   | **Extend**                                                                                               |
| Tools               | Registry (`create_lead`, `create_order`, `check_availability`, etc.)       | None                                                               | **New component**                                                                                        |
| Human handoff       | LLM-driven + explicit conversation status machine                          | Reactive, zero-chunk-only trigger                                  | **Extend**                                                                                               |
| Response validation | Language/factuality/tool-claim/length checks pre-send                      | None                                                               | **New component**                                                                                        |
| Dashboard           | + Products, Leads, Orders, per-business AI settings                        | Knowledge/Settings/Escalations/Widget/Analytics only               | **Extend**                                                                                               |
| Reliability         | Idempotent webhook via `provider_message_id`                               | No idempotency key                                                 | **Add**                                                                                                  |
| Observability       | `ai_events` table, full trace logging                                      | None                                                               | **Add**                                                                                                  |

## 4. Key decisions

1. **Channel strategy: support BOTH ManyChat-per-tenant and a direct Meta Cloud API webhook.**
   `whatsapp_numbers` gets an `integration_mode` column (`'manychat' | 'meta_direct'`) so each
   business independently picks how its number is connected — no forced migration off ManyChat for
   existing/less technical tenants, while giving power tenants (and the product's own long-term
   direction, per spec §16/§38) a first-party Meta integration with no third party in the loop.
   Both modes terminate at the same per-tenant `AI Orchestrator` call, so Language Engine / RAG /
   Tools / validation are written once and are channel-agnostic. Tenant resolution differs by mode
   (see §5 Phase 6 for the exact mechanism — ManyChat can't supply a trustworthy `business_id`
   directly, so it authenticates via a per-business API key instead of the client asserting an id):
   - `meta_direct`: webhook payload carries Meta's `phone_number_id` → looked up in
     `whatsapp_numbers` → resolves `business_id`. No client-supplied tenant id at all.
   - `manychat`: each business gets its own per-business secret (`whatsapp_numbers.manychat_api_key`
     or similar), sent as a header in the ManyChat External Request; the Edge Function maps that
     key to `business_id` server-side. The client never asserts a raw `business_id` — it asserts a
     secret that the server resolves, same trust model as the `x-admin-secret` pattern already used
     for `/ingest`.
2. **Migration strategy: hard-cut.** All existing single-tenant data (customers, knowledge,
   config, conversations, escalations, widget config) is backfilled into one seeded business named
   **`mk-agency`** (`slug: mk-agency`). No dual-schema/parallel-write period — there's one
   deployment today with no other tenant depending on the pre-migration shape, so a single
   backfill migration is simpler and lower-risk than maintaining two data shapes at once.
3. **Scope of Phase 1.** The spec's own §35 phases (Foundation → WhatsApp → AI → Knowledge → Tools
   → Dashboard → Evaluation) assume a greenfield build. Since RAG/knowledge/memory/escalations
   already exist, Phase order should be re-sequenced to layer tenancy underneath what's there
   first, then bolt on Language Engine + Tools — not rebuild from scratch. Reflected in §5 below.

## 5. Proposed phased plan (re-sequenced for this codebase)

### Phase 0 — Foundation: tenancy schema + hard-cut migration — **done, 2026-09-06**

Full change log in
[whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md)'s Change history. Summary against
the original scope below:

- Added `businesses`, `business_users` (roles: owner/admin/agent/viewer), `whatsapp_numbers`
  (including the new `integration_mode` + per-mode credential columns from §4.1) tables. Done as
  planned.
- Seeded exactly one `businesses` row: `name = 'MK Agency'`, `slug = 'mk-agency'`. Done.
- Migrated every existing table (`customers`, `ai_configuration`, `knowledge_documents`,
  `knowledge_chunks`, `conversation_messages`, `conversation_summary`, `chat_escalations`,
  `web_widget_config`) to carry a `business_id` column, backfilled to the `mk-agency` row's id for
  every existing row. Hard-cut, single migration set — no parallel/dual-write period (§4.2).
  Deviation from the original scope note above: `ai_configuration` was **not** renamed to
  `ai_settings` — kept the existing name to minimize blast radius on this pass; revisit in a later
  phase if the rename still seems worth it once ai_settings grows business-specific fields the
  spec's §18 schema doesn't have yet (language/tone/handoff settings, Phase 7).
- RLS policies were added on every business-scoped table, but scoped to `business_users`
  membership via `auth.uid()` as originally planned — **not yet the operative access control**,
  because nothing in this codebase queries Postgres as an authenticated user yet: every Edge
  Function uses the service-role client (bypasses RLS), and the dashboard still authenticates
  mutations via a single global `INGEST_ADMIN_SECRET`, not a per-user session tied to a business.
  The policies are forward-looking/defense-in-depth for when that changes (dashboard auth is a
  later phase). The actual, currently-operative isolation mechanism is explicit `business_id`
  filtering added to every Edge Function query.
- Updated every Edge Function query (`db.ts`, `vector-search.ts`, `knowledge.ts`,
  `escalations.ts`, `config.ts`, `widget-config.ts`, `memory.ts`, `rag-pipeline.ts`) to scope by
  `business_id`, and updated `match_knowledge_chunks` to accept and filter on a new
  `p_business_id` parameter (closes the cross-tenant retrieval leak risk called out in spec §11).
  Every entrypoint (`chat`, `web-chat`, `knowledge`, `ingest`, `reindex`, `search`,
  `widget-config`, `ai-config`, `escalations`) resolves the tenant via a new
  `_shared/business.ts#resolveDefaultBusinessId()` — an interim resolver that always returns
  `mk-agency` until Phase 6 gives each channel/dashboard session its own real tenant identity.
  This is a deliberate scope boundary, not a gap: no caller anywhere yet has its own business
  identity to resolve from, so building real per-request resolution now would have nothing to
  branch on.
- Cross-tenant isolation gate: since there's no live Postgres/RLS integration test harness in this
  repo (all existing tests mock `SupabaseClient` — no DB is spun up), the "seed two businesses,
  assert isolation" test originally scoped here was adapted to what's actually testable today:
  `_shared/business-scoping.test.ts` calls each of a representative set of scoped functions
  (`findOrCreateCustomer`, `loadActiveConfig`, `findDocumentById`, `createEscalationIfNeeded`)
  twice with two different business ids and asserts the query/insert actually tracks the argument
  each time — the regression this guards against (a function silently dropping its `businessId`
  parameter) is the realistic failure mode given RLS isn't the operative enforcement yet. A true
  live-Postgres RLS isolation test is still owed once Phase 6/7 introduces authenticated
  per-business dashboard queries and there's a database to run it against.

### Phase 1 — Language Engine

- New `_shared/language-engine.ts`: detect `{primary_language, secondary_language, style, script,
formality, confidence}` from the latest message + recent turns (LLM classification call, not
  naive char-detection — spec explicitly warns Singlish written in Latin script gets misclassified
  as English by character-level detectors).
- Add `primary_language`/`secondary_language`/`style`/`formality`/`confidence`/`last_detected_at`
  to `conversations` (a table that doesn't exist yet either — currently conversation state is
  implicit in `customers` + `conversation_messages`; needs to be introduced, see Phase 0/2 note
  below) or, minimally, to `customers` if conversation-level granularity is deferred.
- Rewrite `_shared/prompt-builder.ts`'s system prompt to include the LANGUAGE RULES section from
  spec §8 (mirror style, preserve code-switching, never over-translate prices/names/dates, low
  confidence → simple English or ask).
- Build the Sinhala/Singlish/mixed evaluation dataset (spec §23) as fixtures under
  `supabase/functions/_shared/language-engine.test.ts`, targeting ≥95% language accuracy on the
  seeded examples before calling this phase done.

### Phase 2 — Conversation entity + orchestrator shape

- Introduce a proper `conversations` table (currently missing — messages/summary key off
  `customer_id` directly) with `status` (`ai_active`/`human_requested`/`human_active`/`resolved`),
  `assigned_user_id`, language fields from Phase 1. This is a prerequisite for both human handoff
  state and per-conversation language memory.
- Refactor `rag-pipeline.ts` into an explicit `AI Orchestrator` (`_shared/orchestrator.ts`) matching
  spec §10's step list, with Language Engine and (later) Tool Engine as pluggable stages rather than
  RAG being the only path.

### Phase 3 — Tools

- `_shared/tools.ts`: tool registry (`name`, `description`, `input_schema`, `handler`,
  `permission`), starting with `create_lead`, `update_customer`, `request_human`, `notify_team` —
  these map directly onto tables that already exist or are trivial to add (`leads` is new;
  `chat_escalations` already covers `request_human`'s data half, needs wiring to trigger from tool
  calls, not only the zero-chunk gate).
- Switch `chatComplete()` (or a new `generateResponse`) to OpenRouter's tool-calling request shape;
  extend `AIProvider` abstraction (see Phase 5) to expose this uniformly.
- `create_order`/`check_availability` deferred until `products` table + basic order flow exist
  (dashboard work, Phase 6).

### Phase 4 — Response validation

- `_shared/response-validator.ts`: language-match check (reuse Language Engine's detection against
  the reply), tool-claim check (did the model claim an action completed without a successful tool
  result?), length/WhatsApp-friendliness check. On failure, regenerate once with corrective
  instructions per spec §22, otherwise fall back to the existing verbatim `fallback_message` path.

### Phase 5 — AI provider abstraction cleanup

- Formalize `_shared/ai-provider.ts`'s free functions into an `AIProvider` interface
  (`generateResponse`/`generateEmbedding`/`classify`) with `OpenRouterProvider` as the sole
  implementation for now — mechanical refactor, low risk, unblocks future provider swaps and gives
  Language Engine's classification step (Phase 1) and Tool Engine (Phase 3) a shared `classify()`
  contract instead of ad hoc `chatComplete()` calls.

### Phase 6 — WhatsApp channel: both ManyChat-per-tenant and direct Meta webhook

- **`WhatsAppProvider` abstraction first**: `receiveMessage`/`sendMessage`/`sendMedia`/
  `sendTemplate`/`markRead`, so both integration modes and any future channel share one interface
  and the orchestrator never branches on "which relay sent this."
- **`meta_direct` mode**: new `whatsapp-webhook` Edge Function — verify Meta's webhook signature,
  map inbound `phone_number_id` → `business_id` via `whatsapp_numbers`, store the message with
  `unique(business_id, provider_message_id)` idempotency per spec §29, queue/async-process so the
  webhook returns fast (§30), send replies via Meta's Send API directly.
- **`manychat` mode**: keep today's generic `/chat` contract working, but make it multi-tenant —
  add the per-business API key lookup from §4.1 so `/chat` resolves `business_id` from the key
  instead of assuming the single global tenant it does today. Existing `docs/requirements/manychat-whatsapp-integration.md`
  needs a follow-up describing the per-business key step once this ships.
- Dashboard: `whatsapp_numbers` settings page lets a business owner pick `integration_mode` per
  number and see the mode-appropriate setup instructions (Meta app credentials vs. ManyChat API
  key), rather than assuming one path for everyone.

### Phase 7 — Dashboard extensions + observability

- Add Products, Leads, Orders pages/CRUD (mirrors existing Knowledge/Escalations page patterns).
- Add `ai_events` table + logging call at the end of the orchestrator (spec §31), surfaced in the
  existing Analytics page.
- Per-business AI Settings page already has a settings shell (`src/app/dashboard/settings`) — extend
  it with the language/tone/response-length/handoff controls from spec §27.

## 6. Testing strategy carried through every phase

Per CLAUDE.md: every phase above gets its own tests under `supabase/functions/_shared/*.test.ts`
(Deno, matching existing convention) and, for dashboard changes, Vitest specs under
`src/**/__tests__` or `tests/`, added in the same change as the code, not after. RLS policies from
Phase 0 additionally need a cross-tenant-isolation test (Business A cannot read Business B's rows)
before any other phase builds on top of them — this is the spec's own MVP acceptance criterion
(§36) and the highest-risk regression if skipped.

## 7. Recommended immediate next step

Decisions in §4 are resolved (both WhatsApp channel modes supported; hard-cut migration into a
single `mk-agency` business). Phase 0 (tenancy schema + migrations + RLS) is unblocked and is the
correct starting point — every later phase depends on `business_id` existing and being enforced.
