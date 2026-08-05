# ManyChat — WhatsApp Orchestration — Requirements

_Created: 2026-08-05_

## Overview

Documents the exact ManyChat automation needed to sit between a WhatsApp Business number (Meta
Cloud API, via ManyChat's official WhatsApp channel) and this repo's Supabase Edge Functions. No
code in this repo implements or requires this automation — it is external configuration in a
ManyChat account — but the backend was deliberately designed for it:

- `supabase/functions/_shared/admin-auth.ts` (comment, not enforced by a different mechanism):
  `/chat` and `/search` stay anon-key-only "since they're read-only or meant to be called from a
  semi-trusted orchestrator (ManyChat)". Nothing else in the backend restricts who can call them
  beyond the Supabase anon key, which is public by design (see
  [whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md)).
- [admin-dashboard-ui.md](./admin-dashboard-ui.md#api-documentation) already states `/chat` is
  "not a drop-in Twilio/Meta Cloud API webhook URL" and that connecting a real WhatsApp number
  "requires the customer's own relay ... that receives the provider's webhook, calls `/chat`, and
  sends the `reply` back out via the provider's send API." ManyChat is that relay.

This doc supersedes [make-com-whatsapp-integration.md](./make-com-whatsapp-integration.md), which
documented a Make.com-based relay that this project does not use. That doc is kept only as a
reference for the equivalent Make.com module mapping, in case the orchestrator changes again.

This doc exists so that whoever builds the ManyChat automation doesn't have to reverse-engineer
the contract from the Edge Function source.

## What ManyChat is for

A single ManyChat automation does three things, in order, per inbound WhatsApp message:

1. **Trigger** — a **Default Reply** automation (Automation > Default Reply), set to fire on every
   unrecognized incoming message so it acts as a catch-all rather than requiring specific keywords.
   Keyword-triggered flows (if any are added later for menu-style shortcuts) take priority over
   Default Reply automatically — ManyChat runs the more specific trigger first — so they can coexist
   without conflicting with this catch-all.
2. **Call `/chat`** — an **External Request** action (Dev Tools > External Request) forwards
   `{ phone, message, name }` to the Supabase Edge Function and maps the JSON response
   (`{ reply, confidence, intent, handover, tool, sources }`) onto ManyChat custom fields via
   JSON Path.
3. **Reply** — a **Send Message** step referencing the custom field that captured `reply`.

Nothing else in this repo needs to be built for this to work — the Edge Function contract already
exists and is stable (`supabase/functions/chat/index.ts`, mirrored in
`src/lib/api-docs/apiEndpoints.ts` for the admin dashboard's API docs page).

## Exact steps to configure

### 1. Trigger — Default Reply

Automation > Default Reply > "When user sends a message" > choose **"for unrecognized user input"**
(not "once every 24 hours" — every inbound message needs a live `/chat` call, this isn't a one-off
nudge). ManyChat's WhatsApp channel is provisioned through Meta's Cloud API directly (ManyChat is
an official Meta Business Partner), so no separate Twilio/Meta webhook wiring is needed — connecting
the WhatsApp number inside ManyChat's own Settings > WhatsApp is sufficient.

### 2. Action — External Request to `/chat`

Add an **External Request** action block (Dev Tools) inside the Default Reply automation:

| Field         | Value                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| URL           | `{SUPABASE_URL}/functions/v1/chat` — e.g. `https://<project-ref>.supabase.co/functions/v1/chat`  |
| Method        | `POST`                                                                                            |
| Headers       | `apikey: <anon key>`, `Authorization: Bearer <anon key>`, `Content-Type: application/json`       |
| Request body  | `{ "phone": "{{contact_phone}}", "message": "{{last_text_input}}", "name": "{{full_name}}" }`     |

Field mapping notes:

- `phone` is **required**, non-empty — ManyChat's `{{contact_phone}}` system field is already
  E.164-formatted for WhatsApp contacts, matching what `findOrCreateCustomer`
  (`supabase/functions/_shared/db.ts`) expects.
- `message` is **required**, non-empty — `{{last_text_input}}` is the inbound text body. Only text
  messages are supported end-to-end; ManyChat delivers non-text input (button taps, attachments)
  through different variables that this flow does not map.
- `name` is **optional** — `{{full_name}}` (or `{{first_name}}`) from the WhatsApp contact profile.
  If unavailable, `findOrCreateCustomer` leaves it null and backfills it on a later message once
  available, same as the Make.com relay this replaces.
- Both `apikey` and `Authorization: Bearer <anon key>` are required because
  `supabase/config.toml` sets `verify_jwt = true` for `chat`. Use the **anon** key
  (`SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), never the service role key, in ManyChat —
  the service role key must never leave the Edge Function runtime.

**Response mapping** (External Request's "Response" tab, after a live test call — mapping only
takes effect once the automation is actually triggered by a real contact, not on a manual test run):

| JSON Path       | Custom Field           |
| ---------------- | ----------------------- |
| `$.reply`         | `chat_reply` (text)      |
| `$.handover`       | `chat_handover` (text/boolean) — optional, for future routing to a human-handoff flow |

Only `reply` is required for the current flow; `confidence`, `intent`, `tool`, and `sources` don't
need a custom field unless a later automation branches on them.

Expected response (200):

```json
{
  "reply": "We're open Mon–Fri, 9am–6pm EST.",
  "confidence": 0.87,
  "intent": "knowledge",
  "handover": false,
  "tool": null,
  "sources": ["chunk_1a2b3c"]
}
```

Error responses to handle explicitly (add a **Condition** step after the External Request, branching
on the HTTP status or on `chat_reply` being empty — don't let a 4xx/5xx silently drop the customer's
message):

- `400` — malformed body (shouldn't happen if the mapping above is correct; indicates a ManyChat
  system field came through empty).
- `500` — `{ "error": "Internal error" }` — upstream failure (DB, Cloudflare Workers AI, etc.). No
  retry-with-backoff logic exists Edge-Function-side; if the Condition step retries the External
  Request, it will re-append the same user message to conversation history each time (`appendMessage`
  in `supabase/functions/_shared/memory.ts` has no idempotency key), so prefer a single retry at most
  or fall back to a static "we're having trouble, hang tight" **Send Message** instead of looping.

### 3. Action — Send Message

A **Send Message** step referencing `{{chat_reply}}` (the custom field captured above), sent back
to the same contact that triggered the automation — ManyChat keeps this implicit since the whole
automation runs in that contact's context, unlike Make.com where the destination has to be mapped
explicitly.

## What NOT to point ManyChat at

- `/ingest`, `/reindex`, and the delete path on `/knowledge` require an `x-admin-secret` header
  (`INGEST_ADMIN_SECRET`, checked in `supabase/functions/_shared/admin-auth.ts`) — these are
  admin-mutating and are wired to the dashboard UI
  ([admin-dashboard-ui.md](./admin-dashboard-ui.md)), not ManyChat. Do not put
  `INGEST_ADMIN_SECRET` in a ManyChat External Request.
- `/search` exists for developer/debugging retrieval testing (see comment in
  `supabase/functions/search/index.ts`), not for the live chat flow — the ManyChat automation
  should only call `/chat`.

## Credentials ManyChat needs (ManyChat side, not this repo)

| Credential          | Where it comes from                             | Sensitivity                                                                                                 |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`        | Supabase project settings                        | Public                                                                                                        |
| Supabase anon key      | Supabase project settings (`SUPABASE_ANON_KEY`)   | Public by design — see [whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md#environment-variables) |
| WhatsApp Business number connection | ManyChat Settings > WhatsApp (Meta Cloud API OAuth flow) | Managed entirely inside ManyChat/Meta — no token this repo needs to store |

No new environment variables or secrets are needed in this repo for this integration — it only
consumes the already-deployed `/chat` endpoint's public-by-design anon-key auth.

## Explicitly out of scope

- Building or configuring the actual ManyChat automation — that's done in the ManyChat account, not
  this repo; this doc is the reference for whoever does it.
- Any code change to `supabase/functions/chat` — the contract is already stable and used as-is,
  and is provider-agnostic (the same `/chat` contract that Make.com or a Twilio relay could call).
- WhatsApp Business number provisioning — assumed to already exist and be connected inside ManyChat.
- Non-text inbound message types (button taps, images, voice notes) — `{{last_text_input}}` only
  covers plain text; handling other input types would need additional ManyChat-side branching not
  covered here.

## Acceptance Criteria

- A ManyChat Default Reply automation built from this doc can take a real inbound WhatsApp message
  and produce a reply without any changes to `supabase/functions/chat`.
- The automation never sends the Supabase service role key or `INGEST_ADMIN_SECRET`.
- The automation has explicit handling (not silent drop) for non-200 responses or an empty
  `chat_reply` from `/chat`.
