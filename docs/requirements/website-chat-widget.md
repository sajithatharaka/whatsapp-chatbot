# Website Chat Widget — Requirements

_Created: 2026-08-05_

## Overview

Adds a second customer-facing channel to the assistant already powering WhatsApp
(`supabase/functions/chat`): an embeddable chat bubble any website can add with a single
`<script>` tag, backed by the exact same knowledge base, RAG pipeline, conversation memory, and
human-attention escalation flow as WhatsApp. See
[whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md) for the pipeline this reuses and
[human-attention-escalations.md](./human-attention-escalations.md) for the escalation flow shared
by both channels.

## Scope

### Database schema (`supabase/migrations/`)

- `add_web_channel_to_customers` — `customers.phone` becomes nullable (website visitors have none);
  adds `channel` (`'whatsapp' | 'web'`, default `'whatsapp'`) and `session_id` (browser-generated,
  persisted client-side in `localStorage`); replaces the old plain-unique index on `phone` with a
  partial unique index (`where phone is not null`) plus a matching one on `session_id`.
- `create_web_widget_config` — settings for the widget (`enabled`, `title`, `welcome_message`,
  `primary_color`, `position`, `allowed_origins`), modeled on `ai_configuration`'s single-active-row
  pattern. Seeded with `enabled = false` and `allowed_origins = '{}'` — the widget is inert until an
  admin explicitly turns it on and lists at least one domain.

### Shared backend logic (`supabase/functions/_shared/`)

- `rag-pipeline.ts` — the embed → retrieve → grounding-gate → generate → persist-memory pipeline,
  extracted out of `chat/index.ts` so `chat` (WhatsApp) and `web-chat` (website) share one
  implementation instead of two copies of the same business logic.
- `db.ts` — `findOrCreateWebCustomer(supabase, sessionId)` alongside the existing
  `findOrCreateCustomer(supabase, phone)`; both resolve to the same `Customer` shape so the rest of
  the pipeline (memory, summaries, escalations) doesn't need to know which channel it's serving.
- `rate-limit.ts` — `isRateLimited()`, a soft per-customer cap (20 user messages / 5 minutes) counted
  against the existing `conversation_messages` table (no new table). Applied only to `web-chat`:
  WhatsApp traffic is already gated by needing a real phone number behind a provider, but the widget
  is reachable by anyone who can load the page it's embedded on.
- `widget-config.ts` — `loadActiveWidgetConfig()`, `updateWidgetConfig()`, and
  `isOriginAllowed(config, origin)` (exact-match against `allowed_origins`, and requires
  `enabled: true`).

### Edge Functions (`supabase/functions/`)

- `web-chat` — public-facing, called directly from the browser by `widget.js`.
  - `GET`: returns only the safe-to-expose branding subset (`enabled, title, welcomeMessage,
primaryColor, position`), or `403` if the calling `Origin` isn't allowlisted / the widget is
    disabled. This is what the widget calls on load to decide whether to render itself.
  - `POST { sessionId, message }`: same origin/enabled check, resolves the customer via
    `findOrCreateWebCustomer`, applies the rate limit, then runs the same `runRagPipeline()` as
    WhatsApp. Returns the same `ChatResponse` shape as `/chat`.
- `widget-config` — admin-only (`x-admin-secret`, same as `/ingest` and `/reindex`), used
  exclusively by the dashboard's `/dashboard/widget` settings page through
  `src/app/api/widget-config/route.ts` (never called directly from the browser). `GET` returns the
  full config including `allowed_origins`; `PATCH` updates any subset of fields.

### Widget script (`src/app/widget.js/route.ts`, `src/lib/widget/buildWidgetScript.ts`)

Served as a real `.js` URL by a Next.js Route Handler rather than a static `public/` file, so the
embed snippet needs zero configuration:

```html
<script src="https://<your-app-domain>/widget.js" async></script>
```

For example, this deployment's own login page embeds itself as a live demo:

```html
<script src="https://manychat-wa-agent.netlify.app/widget.js" async></script>
```

The Supabase URL and anon key are interpolated server-side from `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the same public, client-safe values already used by
`src/lib/supabase/client.ts`) at request time. The script itself is dependency-free vanilla JS: it
mounts a Shadow DOM root on `document.body` (isolates its CSS from the arbitrary third-party page
it's embedded on), fetches branding from `GET /functions/v1/web-chat`, renders nothing if the
widget is disabled or the page's origin isn't allowlisted, otherwise shows a floating bubble that
opens a chat panel. A session id is generated once via `crypto.randomUUID()` and persisted in
`localStorage` so a returning visitor keeps their conversation memory, same as a returning WhatsApp
customer. No streaming — matches `/chat`'s existing non-streaming design.

### Admin dashboard (`/dashboard/widget`)

New sidebar entry "Website Widget". The settings page lets an admin enable/disable the widget, set
its title/welcome message/color/position, list the domains it's allowed to run on, and copy the
embed snippet (reusing the existing `CopyCodeButton` from the API docs page). Reads happen directly
through `src/lib/supabase/admin-api.ts` server-side (same pattern as `/dashboard/knowledge`);
saves go through `src/app/api/widget-config/route.ts`, which re-checks auth via
`requireAuthenticatedUser()` before calling the `widget-config` Edge Function.

### Escalations (shared with WhatsApp)

Website conversations that can't be grounded in the knowledge base escalate through the exact same
`chat_escalations` table and `/dashboard/escalations` UI as WhatsApp — there is no separate "web
escalations" view. Because `customers.phone` is now nullable, the list and detail views fall back to
showing "Website visitor" (`src/lib/escalations/customerDisplay.ts`) and a `WhatsApp`/`Website`
channel badge next to the customer name, so both channels read side by side in one list.

### Security model

- The anon key embedded in `widget.js` is intentionally public — it's the same trust level as any
  Supabase browser client and only satisfies `verify_jwt`. The actual authorization is the `Origin`
  allowlist checked in `widget-config.ts`/`web-chat`, plus the `x-admin-secret` gate on the
  `widget-config` admin function.
- `allowed_origins` defaults to empty and `enabled` defaults to `false`: the widget is opt-in, not
  opt-out.
- The rate limit (`rate-limit.ts`) protects LLM spend against a single session hammering the
  endpoint; it does not replace the Origin allowlist as the primary abuse control.

## Environment variables

No new environment variables — reuses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(already required by `src/lib/supabase/client.ts`) and `INGEST_ADMIN_SECRET` (already required by
`admin-api.ts`'s `adminHeaders()`).

## Explicitly out of scope

- Streaming responses — matches `/chat`'s existing non-streaming design.
- Multi-widget / multi-tenant support — one widget configuration per deployment, same
  single-business assumption `ai_configuration` already makes.
- File/image attachments in the widget conversation.
- Editing `web_widget_config.allowed_origins`/branding via anything other than
  `/dashboard/widget` (no public self-serve signup flow).

## Acceptance Criteria

- `npm run db:push` applies both new migrations cleanly.
- With the widget `enabled` and the calling page's origin listed in `allowed_origins`,
  `widget.js` renders a working chat bubble that gets grounded replies from the same knowledge base
  WhatsApp uses, and unanswerable questions create a `chat_escalations` row visible in
  `/dashboard/escalations` alongside WhatsApp conversations.
- With the widget disabled, or the calling origin not allowlisted, `GET /functions/v1/web-chat`
  returns `403` and the widget renders nothing.
- `chat` (WhatsApp) behavior is unchanged after the `rag-pipeline.ts` extraction — same request/
  response shape, same grounding-gate/escalation behavior.
