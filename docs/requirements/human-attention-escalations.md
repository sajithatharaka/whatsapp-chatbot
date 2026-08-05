# Human-Attention Escalations — Requirements

_Created: 2026-08-05_

## Overview

Adds a "Needs Attention" admin page that surfaces WhatsApp conversations the AI assistant could
not handle, so a human can review, respond, and — optionally — fold the resolution back into the
knowledge base. Builds on [admin-dashboard-ui.md](./admin-dashboard-ui.md) (sidebar shell, auth,
knowledge management UI) and [whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md) (the
`chat` Edge Function and its grounding gate).

Before this change there was no concept of a conversation "status" anywhere in the schema — just
a flat, per-`customer_id` message log — and the existing `ChatResponse.handover` field was an
unused stub (always `false`). This introduces that missing state via a new `chat_escalations`
table, driven off the one real "AI couldn't help" signal that already exists: the grounding gate
in `supabase/functions/chat/index.ts`, which skips the LLM entirely and sends a canned
`fallback_message` when zero knowledge chunks pass `similarity_threshold`.

## Components

### Detection (chat Edge Function)

- `supabase/functions/_shared/memory.ts` — `appendMessage` now returns `{ id }` (previously
  `void`), so the fallback branch can capture the triggering user message's id.
- `supabase/functions/_shared/escalations.ts` — `createEscalationIfNeeded` inserts a
  `chat_escalations` row only if the customer doesn't already have one open
  (`needs_attention`/`in_progress`), preventing duplicate rows when a customer repeats an
  unanswered question.
- `supabase/functions/chat/index.ts` — the grounding-gate branch (previously lines 73-92) now
  calls `createEscalationIfNeeded` after logging the user/fallback messages. No other change to
  the chat flow; escalation creation never blocks or alters the reply sent back to the customer.

### Schema

`supabase/migrations/20260805000000_create_chat_escalations.sql` — one row per fallback episode:

| Column                        | Type             | Notes                                                        |
| ----------------------------- | ---------------- | ------------------------------------------------------------ |
| `id`                          | uuid             | PK                                                           |
| `customer_id`                 | uuid             | FK → `customers`                                             |
| `trigger_message_id`          | uuid             | FK → `conversation_messages`, the question that triggered it |
| `question`                    | text             | Denormalized copy of the triggering message                  |
| `status`                      | text             | `needs_attention` \| `in_progress` \| `responded`            |
| `ai_summary`                  | text             | Lazily generated + cached (see below)                        |
| `admin_answer`                | text             | What the admin recorded as their reply to the customer       |
| `knowledge_document_id`       | uuid             | FK → `knowledge_documents`, set if a KB update was linked    |
| `responded_at`/`responded_by` | timestamptz/text | Set when status → `responded`                                |
| `created_at`/`updated_at`     | timestamptz      |                                                              |

RLS enabled, no policies — service-role only, same as every other table in this schema.

### Admin API (Edge Function + Next.js proxy)

- `supabase/functions/escalations/index.ts` — `GET /escalations` (list, filtered by
  `?status=a,b&from=...&to=...`), `GET /escalations/{id}` (escalation + full message history +
  AI summary, generated on first view via `chatComplete` and cached on the row), `PATCH
/escalations/{id}` (status/`admin_answer`/`knowledge_document_id` updates). Gated by
  `requireAdminSecret`, same sensitivity as `knowledge`.
- `src/lib/supabase/admin-api.ts` — `listEscalations`, `getEscalation`, `updateEscalation`,
  `searchKnowledgeMatches` (new: wraps the previously-unwrapped `search` Edge Function).
- Next.js routes: `src/app/api/escalations/route.ts` (GET), `src/app/api/escalations/[id]/
route.ts` (GET, PATCH — PATCH derives `respondedBy` from the authenticated session, not the
  client payload), `src/app/api/knowledge/search/route.ts` (POST, new).

### Admin UI

- `src/components/navigation/SidebarNav.tsx` — new "Needs Attention" item
  (`/dashboard/escalations`), between Knowledge Base and API Docs.
- Persistent 3-pane layout — `src/app/dashboard/escalations/layout.tsx` (client component; the
  outer app `SidebarNav` from `dashboard/layout.tsx` is unchanged and sits outside this) renders a
  shared filter bar, then a middle list column (`EscalationList`) beside a right-hand detail pane
  (`{children}`) that swaps via Next.js navigation to `/dashboard/escalations/[id]` while the list
  stays mounted. `src/app/dashboard/escalations/page.tsx` is just the "select a conversation" empty
  state shown in the right pane when nothing is selected.
- `src/components/escalations/EscalationFilters.tsx` — a single-line bar rendered once at the top
  of the layout, above both the list and detail panes (not scoped to the list column), so it stays
  visible and usable regardless of which pane is open. Status is a multiselect dropdown
  (`DropdownMenu` + the new `DropdownMenuCheckboxItem` primitive in `src/components/ui/
dropdown-menu.tsx`) instead of inline checkboxes — its trigger button summarizes the current
  selection (e.g. "Status: Needs attention, In progress"). The dropdown is rendered with
  `modal={false}`: Radix's default modal mode sets `pointer-events: none` on the rest of the page
  while open, which would force a user to click "Apply filters" twice (once to dismiss the menu,
  once to register the click) — `modal={false}` keeps the rest of the bar clickable while the
  status menu is open.
- `src/components/escalations/EscalationList.tsx` — client component, fetches `GET
/api/escalations` directly (Next.js layouts don't receive a `searchParams` prop, so filtering has
  to be client-side via `useSearchParams()` rather than the old server-rendered
  `EscalationListSection`, which is deleted). Highlights the row matching the current route
  (`usePathname()`), same active-link convention as `SidebarNav`. Default filter (no query params)
  shows `needs_attention` + `in_progress` only — `responded` conversations are hidden until
  explicitly filtered for; the default/valid status lists live in `src/lib/escalations/constants.ts`
  (shared by `EscalationList`, `EscalationFilters`, and `api/escalations/route.ts` — extracted once
  three call sites needed the same values).
- `src/components/escalations/EscalationListRefreshContext.tsx` — small context so a status change
  made in the detail pane (a sibling subtree under the layout, not a descendant of the list) can
  tell `EscalationList` to refetch. `EscalationStatusActions` calls both `router.refresh()` (updates
  the detail pane's server-rendered data) and `bump()` (refetches the list) after a successful
  PATCH — without the latter, "Mark as responded" wouldn't visibly remove the row from the
  default-filtered list until a manual reload.
- Detail pane — `src/app/dashboard/escalations/[id]/page.tsx` (unchanged content, now rendered
  into the right pane instead of a standalone full page; the old "Back to Needs Attention" link was
  dropped since the list is always visible alongside it): AI-generated summary, the triggering
  question, `EscalationChatView` (full message history), `EscalationAnswerSection` (resolution
  workflow), `EscalationStatusActions` ("Mark in progress" / "Mark as responded").
- `EscalationChatView` renders the message history as WhatsApp-style chat bubbles instead of a
  plain bordered list: customer (`role: 'user'`) messages align left in a neutral bubble, assistant
  replies align right in a filled/primary-colored bubble (mirroring the "them" vs. "me" alignment of
  a WhatsApp thread), and `system` rows render as small centered notes rather than bubbles.

### Resolution workflow (`EscalationAnswerSection`)

Two independent, explicitly-confirmed steps — matches the product decision that a knowledge
update and marking an escalation "responded" are separate manual actions:

1. Admin records their answer to the customer (textarea → `PATCH admin_answer`). This is for
   context/knowledge-update purposes only — **replying to the customer still happens through the
   existing Make.com/WhatsApp channel outside this repo** (no outbound send capability was added).
2. After saving, the UI asks "Update the knowledge base with this answer?" On **Yes**, it calls
   `POST /api/knowledge/search` with the escalation's question, auto-picks the single top-ranked
   matching document, fetches its current content, and shows an editable proposal (`previous
content + "\n\n" + admin answer`, pre-filled but adjustable). Saving requires a second explicit
   click ("Confirm & save to knowledge base"), which reuses the existing `POST /api/knowledge` →
   `ingest` pipeline unchanged (re-chunks/re-embeds automatically) and records the linked
   `knowledge_document_id` on the escalation. No match found → points to
   `/dashboard/knowledge` to create a new document instead.

## Environment variables

No new variables — reuses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`INGEST_ADMIN_SECRET` from [admin-dashboard-ui.md](./admin-dashboard-ui.md).

## Acceptance Criteria

- A chatbot fallback reply (grounding gate, zero matching chunks) creates exactly one
  `chat_escalations` row with `status = 'needs_attention'`; repeating the same unanswered question
  does not create a second row while one is still open.
- The "Needs Attention" list defaults to showing `needs_attention` + `in_progress` only; filtering
  explicitly for `responded` reveals resolved ones.
- Filtering by date range only returns escalations with `created_at` inside `[from, to]`.
- Opening a detail page for the first time generates and persists an AI summary; opening it again
  does not re-call the LLM.
- "View complete chat" shows every message for that customer, not just the last N used for prompt
  building.
- Confirming a knowledge-base update re-embeds the target document (existing `/ingest` behavior)
  and does **not** change the escalation's status.
- "Mark as responded" sets `status`, `responded_at`, and `responded_by` (from the session email)
  and removes the row from the default list view without a manual page reload (via
  `EscalationListRefreshContext`).
- The list column stays mounted and visible while navigating between escalations, and highlights
  the row matching the currently open detail pane. Applying filters while a detail pane is open
  keeps that pane open (filters push to the current pathname, not a hardcoded index route).
- Every new form input has a unique `data-testid`.
- `npm run lint` — zero errors.
- `npm test` — all unit/component tests pass; `/src` coverage thresholds hold.

## Explicitly out of scope

- Outbound WhatsApp sending from this app — the admin's recorded answer is for context and the
  knowledge-update workflow only; the actual customer-facing reply still goes through the existing
  Make.com relay.
- A confidence-threshold-based escalation trigger (only the existing zero-chunk grounding gate is
  wired up, per product decision — see conversation history for this doc's origin).
- Letting the admin choose among multiple candidate knowledge documents — the workflow auto-picks
  the single most relevant match; manually browsing alternates means using the Knowledge Base page
  directly.
- Real-time notification (email/Slack/push) when a new escalation is created — this is a polling
  admin list only.
