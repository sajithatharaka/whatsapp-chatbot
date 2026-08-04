# Make.com — WhatsApp Orchestration — Requirements

_Created: 2026-08-03_

## Overview

Documents the exact Make.com scenario needed to sit between a WhatsApp number (Twilio WhatsApp
API or Meta Cloud API) and this repo's Supabase Edge Functions. No code in this repo implements
or requires this scenario — it is external configuration in a Make.com account — but the backend
was deliberately designed for it:

- `supabase/functions/_shared/admin-auth.ts` (comment, not enforced by a different mechanism):
  `/chat` and `/search` stay anon-key-only "since they're read-only or meant to be called from a
  semi-trusted orchestrator (Make.com)". Nothing else in the backend restricts who can call them
  beyond the Supabase anon key, which is public by design (see
  [whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md)).
- [admin-dashboard-ui.md](./admin-dashboard-ui.md#api-documentation) already states `/chat` is
  "not a drop-in Twilio/Meta Cloud API webhook URL" and that connecting a real WhatsApp number
  "requires the customer's own relay ... that receives the provider's webhook, calls `/chat`, and
  sends the `reply` back out via the provider's send API." Make.com is that relay.

This doc exists so that whoever builds the Make.com scenario doesn't have to reverse-engineer the
contract from the Edge Function source.

## What Make.com is for

A single Make.com scenario does three things, in order, per inbound WhatsApp message:

1. **Trigger** — watch for an inbound WhatsApp message on the connected number.
2. **Call `/chat`** — forward `{ phone, message, name }` to the Supabase Edge Function and get
   back `{ reply, confidence, intent, handover, tool, sources }`.
3. **Reply** — send `reply` back to the same contact via the WhatsApp provider's send action.

Nothing else in this repo needs to be built for this to work — the Edge Function contract already
exists and is stable (`supabase/functions/chat/index.ts`, mirrored in
`src/lib/api-docs/apiEndpoints.ts` for the admin dashboard's API docs page).

## Exact modules to use

### 1. Trigger module — WhatsApp inbound

Use whichever provider owns the WhatsApp Business number:

- **Twilio**: `Twilio > Watch Incoming Messages` (or a Twilio Function that posts into a Make.com
  webhook — either works). The codebase already assumes Twilio-shaped fields —
  `supabase/functions/_shared/db.ts` has a comment referencing "Twilio's WhatsApp ProfileName" as
  the source of the customer's display name, i.e. Twilio's `ProfileName` field maps to `name`.
- **Meta Cloud API**: `WhatsApp Business Cloud API > Watch Events`, if the number is provisioned
  directly through Meta instead of Twilio.

Either way, the trigger module's output must be mapped to the `/chat` request body below — Make.com
doesn't need a specific module beyond whatever the provider offers; the contract on the Supabase
side is provider-agnostic JSON.

### 2. Action module — call `/chat`

`HTTP > Make a request` (or the native `Supabase` app if used — a plain HTTP call is simplest and
is what the admin dashboard's API docs page documents):

| Field       | Value                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------- |
| URL         | `{SUPABASE_URL}/functions/v1/chat` — e.g. `https://<project-ref>.supabase.co/functions/v1/chat`     |
| Method      | `POST`                                                                                              |
| Headers     | `apikey: <anon key>`, `Authorization: Bearer <anon key>`, `Content-Type: application/json`          |
| Body (JSON) | `{ "phone": "{{trigger.From}}", "message": "{{trigger.Body}}", "name": "{{trigger.ProfileName}}" }` |

Field mapping notes:

- `phone` is **required**, non-empty, and should be the E.164 number Twilio/Meta gives you (e.g.
  `+15551234567`, with Twilio's `whatsapp:` prefix stripped if present) — this is the key
  `findOrCreateCustomer` (`supabase/functions/_shared/db.ts`) matches against in the `customers`
  table.
- `message` is **required**, non-empty — the inbound text body.
- `name` is **optional** — if omitted, `findOrCreateCustomer` leaves it null and backfills it on a
  later message once available.
- Both `apikey` and `Authorization: Bearer <anon key>` are required because
  `supabase/config.toml` sets `verify_jwt = true` for `chat`. Use the **anon** key
  (`SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), never the service role key, in Make.com —
  the service role key must never leave the Edge Function runtime.

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

Error responses to handle explicitly in the Make.com scenario (add an error handler / router after
the HTTP module, don't let a 4xx/5xx silently drop the customer's message):

- `400` — malformed body (shouldn't happen if the mapping above is correct; indicates a trigger
  field came through empty).
- `500` — `{ "error": "Internal error" }` — upstream failure (DB, Cloudflare Workers AI, etc.). No
  retry-with-backoff logic exists Edge-Function-side; if Make.com retries, it will re-append the
  same user message to conversation history each time (`appendMessage` in
  `supabase/functions/_shared/memory.ts` has no idempotency key), so prefer a single retry at most
  or route to a human-handover fallback message instead of looping.

### 3. Action module — send the reply

Whatever the provider's outbound send action is (`Twilio > Send a Message` /
`WhatsApp Business Cloud API > Send a Message Template/Session Message`), mapped to:

- To: the same contact/`phone` used in step 2.
- Body: `{{2.reply}}` (the `reply` field from the `/chat` HTTP module's response).

## What NOT to point Make.com at

- `/ingest`, `/reindex`, and the delete path on `/knowledge` require an `x-admin-secret` header
  (`INGEST_ADMIN_SECRET`, checked in `supabase/functions/_shared/admin-auth.ts`) — these are
  admin-mutating and are wired to the dashboard UI
  ([admin-dashboard-ui.md](./admin-dashboard-ui.md)), not Make.com. Do not put
  `INGEST_ADMIN_SECRET` in a Make.com scenario.
- `/search` exists for developer/debugging retrieval testing (see comment in
  `supabase/functions/search/index.ts`), not for the live chat flow — Make.com's live scenario
  should only call `/chat`.

## Credentials Make.com needs (Make.com side, not this repo)

| Credential                                                           | Where it comes from                             | Sensitivity                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                                                       | Supabase project settings                       | Public                                                                                                      |
| Supabase anon key                                                    | Supabase project settings (`SUPABASE_ANON_KEY`) | Public by design — see [whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md#environment-variables) |
| Twilio Account SID / Auth Token, or Meta Cloud API system-user token | Provider console                                | Secret — store in Make.com's connection vault, not inline in the scenario                                   |

No new environment variables or secrets are needed in this repo for this integration — it only
consumes the already-deployed `/chat` endpoint's public-by-design anon-key auth.

## Explicitly out of scope

- Building or configuring the actual Make.com scenario — that's done in the Make.com account, not
  this repo; this doc is the reference for whoever does it.
- Any code change to `supabase/functions/chat` — the contract is already stable and used as-is.
- WhatsApp Business number provisioning (Twilio or Meta) — assumed to already exist.

## Acceptance Criteria

- A Make.com scenario built from this doc can take a real inbound WhatsApp message and produce a
  reply without any changes to `supabase/functions/chat`.
- The scenario never sends the Supabase service role key or `INGEST_ADMIN_SECRET`.
- The scenario has explicit handling (not silent drop) for non-200 responses from `/chat`.
