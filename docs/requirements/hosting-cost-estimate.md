# Hosting & Third-Party Service Cost Estimate

_Created: 2026-08-06_

## Overview

Reference doc, not a feature spec — an estimated monthly cost breakdown for running this project
in production, based on the services actually wired into the codebase: Netlify (frontend hosting),
Supabase (Postgres + Auth + Edge Functions + pgvector), Cloudflare Workers AI (chat completions +
embeddings, see `supabase/functions/_shared/ai-provider.ts`), ManyChat (WhatsApp relay, see
[manychat-whatsapp-integration.md](./manychat-whatsapp-integration.md)), and the WhatsApp Business
Platform itself (Meta, via ManyChat's Cloud API connection). Google Tag Manager, Facebook Pixel,
and Cloudflare Turnstile (see [tracking-and-captcha.md](./tracking-and-captcha.md)) are free at any
scale this project would reach and are excluded from the table below.

This is an **estimate**, not a bill — actual cost depends on conversation volume, contact count, and
which provider tiers are chosen. Update this doc if the stack changes (new paid service added,
provider swapped, e.g. the Make.com → ManyChat switch this doc's ManyChat numbers already reflect)
or if a pricing change is discovered to be materially wrong.

## Key finding: WhatsApp messaging itself is likely $0

Meta's per-message pricing (in effect since July 2025) only charges for **business-initiated**
template messages (marketing/utility/authentication categories). This bot only ever _replies_ to
inbound customer messages within the 24-hour free service window (`chat/index.ts` → ManyChat →
send reply) — that's the **free "service" category**. Per-message costs only apply if proactive
outbound messaging (reminders, campaigns) is added later; nothing in this repo does that today.

## Monthly cost breakdown

| Service                               | Free tier covers                                                                                                                       | Paid tier if you outgrow it                                                                                                          | Driven by                                                                                                                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**                          | 500MB DB, 5GB egress — fine to start                                                                                                   | Pro: **$25/mo** (adds $10 compute credit)                                                                                            | DB size, Edge Function invocations, egress                                                                                                                                                               |
| **Netlify**                           | 100GB bandwidth, 300 build min — likely enough for an admin dashboard + widget.js                                                      | Pro: **$20/mo** (3,000 credits, credit-based since Sept 2025)                                                                        | Widget traffic, dashboard bandwidth                                                                                                                                                                      |
| **Cloudflare Workers AI**             | 10,000 Neurons/day free                                                                                                                | ~**$0.011/1,000 Neurons** beyond that                                                                                                | At $0.045/M input + $0.384/M output tokens for `llama-3.1-8b-instruct-fast`, each chat turn (~1,500 in / 150 out tokens) costs roughly **$0.0001** — negligible even at thousands of conversations/month |
| **ManyChat**                          | None for WhatsApp — WhatsApp automation requires Pro at minimum (free/Essential plans dropped WhatsApp in a March 2026 pricing change) | Pro: **from $29/mo**, scaling with active-contact count (roughly $29→$45→$65/mo as monthly active contacts grow toward 2,500→5,000+) | Number of unique WhatsApp contacts messaged per month, not message volume                                                                                                                                |
| **WhatsApp Business Platform (Meta)** | Unlimited **service**-category replies (within the 24h customer-initiated window) — this is 100% of this bot's current traffic         | Marketing/utility/authentication templates: ~$0.004–$0.06+ per message, market-dependent                                             | Only relevant if proactive/template messaging is added later — not used today                                                                                                                            |

## Estimated totals

- **Low volume** (a few hundred WhatsApp contacts/month): Supabase free + Netlify free + Workers AI
  ~$0 + ManyChat Pro floor → **~$29–35/month**. ManyChat Pro's $29 floor (required for WhatsApp at
  all) dominates at this scale, not the AI or database costs.
- **Small business in production** (Supabase Pro, ManyChat Pro scaling into the low thousands of
  contacts, Netlify free, trivial Workers AI spend): **~$55–75/month**.
- **Growing volume** (Netlify Pro, Supabase Pro, ManyChat scaling toward 5,000+ contacts):
  **~$115–130/month**.

The biggest lever is **ManyChat's active-contact tier**, since WhatsApp requires its paid plan
outright and pricing scales with unique contacts rather than message count. Supabase and Netlify's
base subscription fees are the other fixed floor; Cloudflare Workers AI stays close to free at this
app's scale regardless of volume.

## Caveats

- Figures are current as of this doc's creation date and were pulled from provider pricing pages
  and pricing-summary articles, not a live quote — verify against each provider's current pricing
  page before budgeting against these numbers, since all four paid services (Netlify, Supabase,
  ManyChat, Cloudflare) have changed pricing structure at least once within the last year.
- Assumes the reactive-only chat flow this repo currently implements (see
  [manychat-whatsapp-integration.md](./manychat-whatsapp-integration.md)) — adding proactive/
  broadcast WhatsApp messaging would introduce real per-message Meta template costs on top of this
  estimate.
- Does not include one-off costs (custom domain registration, ManyChat/Meta Business verification,
  design/dev time).
