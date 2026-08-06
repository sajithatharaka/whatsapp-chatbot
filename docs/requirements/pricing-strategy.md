# Pricing Strategy — Selling Price & Margin per Customer

_Created: 2026-08-06_

## Overview

Reference doc, not a feature spec — a recommended monthly selling price and target gross margin
per customer, built on the infra cost tiers in
[hosting-cost-estimate.md](./hosting-cost-estimate.md) and benchmarked against comparable WhatsApp/
AI chatbot products in the market.

## Delivery model note

This codebase is architected single-tenant: one Supabase project, one Netlify site, one ManyChat
account per deployment (`website-chat-widget.md` calls this out explicitly — "one widget
configuration per deployment, same single-business assumption `ai_configuration` already makes").
That means infra cost scales roughly **linearly per customer**, unlike a typical multi-tenant SaaS
where one shared database/hosting bill is amortized across thousands of customers. This is the main
reason the margin target below (70–75%) sits below the "best-in-class" 80%+ SaaS benchmark — some
of that gap is recoverable later by consolidating customers onto shared Supabase/Netlify
infrastructure with row-level tenancy, but that's a genuine architecture change, not a pricing lever
available today.

## Target gross margin

SaaS benchmarks for 2026: 75% software gross margin is the practical floor for a healthy business,
72–78% is where most SaaS companies cluster, and 80%+ is considered best-in-class. Below 70% is
usually only acceptable in an early-stage/land-grab phase with a clear reason.

Given the single-tenant cost structure above, **70% is the floor, 75% is the target** for this
product — closer to "healthy SMB SaaS" than "best-in-class," which is appropriate for a per-customer
deployed service rather than a shared-infra platform.

## Competitive landscape (WhatsApp / AI support chatbots, 2026)

| Product         | Entry tier                         | Mid tier                                        | Notes                                        |
| --------------- | ---------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Wati            | $49/mo (Growth)                    | $119–149/mo (Pro)                               | Meta message costs passed through separately |
| AiSensy         | ~$45/mo (Basic)                    | +$80/mo for chatbot flows add-on                | Meta costs passed through separately         |
| Interakt        | $89/mo (Growth)                    | $197/mo (Scale), $377/mo (Pro)                  | Meta costs passed through separately         |
| Zoko            | $49.99/mo base                     | +$24.99/mo per AI agent                         | Meta costs passed through separately         |
| Tidio + Lyro AI | $29/mo base                        | ~$97–289/mo once AI add-on + flows are included | AI billed separately from base plan          |
| Chatfuel        | $20/mo                             | —                                               | 1,000 conversations included                 |
| Intercom Fin    | $29–132/seat/mo + $0.99/resolution | Scales fast with volume                         | Resolution-based, not flat                   |

Most competitors in this space charge a base subscription **and** pass Meta's per-message template
costs through with a 15–25% markup on top — they don't try to absorb that variable cost into a flat
price. This project should do the same (see "What's not included" below).

## Recommended pricing tiers

Applying a 75% target margin (price = cost ÷ 0.25 = cost × 4) to the three cost scenarios from
[hosting-cost-estimate.md](./hosting-cost-estimate.md), then rounding to normal SaaS price points:

| Tier                                                 | Infra cost/mo (from cost estimate) | List price/mo | Resulting gross margin |
| ---------------------------------------------------- | ---------------------------------- | ------------- | ---------------------- |
| **Starter** (a few hundred WhatsApp contacts)        | ~$29–35                            | **$129**      | ~75%                   |
| **Growth** (low thousands of contacts, Supabase Pro) | ~$55–75                            | **$249**      | ~74%                   |
| **Scale** (5,000+ contacts, Netlify + Supabase Pro)  | ~$115–130                          | **$499**      | ~76%                   |

These land inside or slightly above the competitor range (Interakt's top tier is $377, Intercom Fin
can exceed $500/mo at real volume) — defensible given this product bundles a full custom
RAG-grounded knowledge base, an admin dashboard, human-attention escalations, and a website widget
on the _same_ backend, rather than a single-channel bot builder.

## What's not included in the flat price

- **Meta template message costs** (marketing/utility/authentication categories) — not incurred by
  this app's current reactive-only flow (see
  [manychat-whatsapp-integration.md](./manychat-whatsapp-integration.md) and
  [hosting-cost-estimate.md](./hosting-cost-estimate.md#key-finding-whatsapp-messaging-itself-is-likely-0)),
  but if proactive/broadcast messaging is added later, bill it through separately with a markup
  (15–25%, matching Wati/AiSensy/Interakt's model) rather than folding variable Meta costs into the
  flat tier price.
- Custom domain registration, ManyChat/Meta Business verification, and initial setup/onboarding —
  one-off costs, not covered by the recurring margin above.

## Caveats

- These are list-price recommendations, not a finalized pricing page — validate against actual
  target-customer willingness to pay before publishing.
- Competitor prices were pulled from pricing-summary sources current as of this doc's creation date,
  not live quotes; WhatsApp chatbot tooling pricing has moved multiple times in the last year and
  should be re-checked before finalizing.
- If customer volume grows enough to justify consolidating multiple customers onto shared
  Supabase/Netlify infrastructure (see "Delivery model note" above), the cost side of this margin
  calculation improves and tier pricing could be revisited downward or margin could be pushed toward
  the 80%+ best-in-class band.
