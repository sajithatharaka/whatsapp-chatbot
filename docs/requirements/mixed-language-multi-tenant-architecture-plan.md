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

| Area | Target spec | Current repo | Gap |
| --- | --- | --- | --- |
| Tenancy | `business_id` on every table, RLS-enforced | Single global tenant, no RLS scoping | **Full rebuild** |
| WhatsApp channel | Direct Meta Cloud API webhook, `WhatsAppProvider` abstraction | ManyChat relay owns the webhook; repo only exposes generic `/chat` | **New integration**, ManyChat becomes optional/legacy |
| AI provider | `AIProvider` interface (`generateResponse`/`generateEmbedding`/`classify`) | Free functions in one file, OpenRouter-only, no `classify` | **Refactor** |
| Language Engine | Dedicated pre-response stage, output schema, language memory | Nonexistent | **New component** |
| RAG | Per-business filtered pgvector retrieval | Working, but global (no tenant filter) | **Extend** |
| Memory | Short + long-term, structured customer facts | Short-term only; summary stubbed | **Extend** |
| Tools | Registry (`create_lead`, `create_order`, `check_availability`, etc.) | None | **New component** |
| Human handoff | LLM-driven + explicit conversation status machine | Reactive, zero-chunk-only trigger | **Extend** |
| Response validation | Language/factuality/tool-claim/length checks pre-send | None | **New component** |
| Dashboard | + Products, Leads, Orders, per-business AI settings | Knowledge/Settings/Escalations/Widget/Analytics only | **Extend** |
| Reliability | Idempotent webhook via `provider_message_id` | No idempotency key | **Add** |
| Observability | `ai_events` table, full trace logging | None | **Add** |

## 4. Key open decisions (need your call before Phase 1 starts)

1. **ManyChat vs. direct Meta webhook.** The spec assumes a direct `/webhooks/whatsapp` Edge
   Function per §16. Today ManyChat plays that role and is documented/relied on
   (`manychat-whatsapp-integration.md`). Options: (a) keep ManyChat as the relay per business
   (simplest, but each tenant needs their own ManyChat account/automation — doesn't scale as a
   SaaS), or (b) build the direct Meta Cloud API webhook per the spec and retire ManyChat. For a
   true multi-tenant SaaS where you provision WhatsApp numbers per customer, (b) is what the spec
   intends and what "SaaS from day one" requires — ManyChat can't dynamically route to N tenants.
2. **Migration strategy for existing single-tenant data.** Whether to (a) hard-cut to
   multi-tenant with a single migrated "default business" row, or (b) run both schemas in parallel
   during transition. Recommend (a) — the app has no external customers depending on the current
   shape yet (confirm), so a clean cutover with one backfilled `businesses` row is far simpler than
   a dual-write period.
3. **Scope of Phase 1.** The spec's own §35 phases (Foundation → WhatsApp → AI → Knowledge → Tools
   → Dashboard → Evaluation) assume a greenfield build. Since RAG/knowledge/memory/escalations
   already exist, Phase order should be re-sequenced to layer tenancy underneath what's there
   first, then bolt on Language Engine + Tools — not rebuild from scratch. Reflected in §5 below.

## 5. Proposed phased plan (re-sequenced for this codebase)

### Phase 0 — Decisions + foundation prep
- Resolve the 3 open decisions above.
- Add `businesses`, `business_users` (roles: owner/admin/agent/viewer), `whatsapp_numbers` tables.
- Migrate every existing table (`customers`, `ai_configuration` → becomes `ai_settings` per
  business, `knowledge_documents`, `knowledge_chunks`, `conversation_messages`,
  `conversation_summary`, `chat_escalations`, `web_widget_config`) to carry `business_id`, backfilled
  against one seeded "default" business row.
- Write RLS policies: every table filtered by `business_id` resolved from the authenticated
  session (Supabase Auth + `business_users`), never trusted from client input, per spec §17.
- Update every Edge Function query (`db.ts`, `vector-search.ts`, `knowledge.ts`, `escalations.ts`,
  `config.ts`) to scope by `business_id`, and update `match_knowledge_chunks` RPC to accept and
  filter on it (critical: closes the cross-tenant retrieval leak risk called out in spec §11).

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

### Phase 6 — Direct WhatsApp channel (pending Decision 1)
- If direct Meta Cloud API is chosen: `whatsapp-webhook` Edge Function (verify signature, map
  `phone_number_id` → `business_id` via `whatsapp_numbers`, store message with
  `unique(business_id, provider_message_id)` idempotency per spec §29), async processing (§30) so
  the webhook returns fast, and a `WhatsAppProvider` abstraction so ManyChat/Meta/future channels
  share one interface (`receiveMessage`/`sendMessage`/`sendMedia`/`sendTemplate`/`markRead`).
- If ManyChat is kept per-tenant instead: document the multi-tenant ManyChat pattern (one
  automation per business, each posting `business_id` or a per-business API key so `/chat` can
  resolve tenant) — much smaller change, but doesn't fully satisfy spec §16/§38's channel-agnostic
  intent.

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

Get a decision on §4.1 (ManyChat vs. direct Meta webhook) and §4.2 (hard-cut vs. parallel
migration), since those two answers change the shape of Phase 0's migrations and Phase 6 entirely.
Everything else in this plan can start (Phase 0 tenancy work, Phase 1 Language Engine) without
waiting on them.
