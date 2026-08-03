# Tracking & CAPTCHA — Requirements

_Created: 2026-07-02_

## Overview

Integrate Google Tag Manager (GTM), Facebook Pixel, and Cloudflare Turnstile into the Next.js application for analytics tracking and bot/spam protection on forms.

## Components

### Google Tag Manager

- Inject GTM loader script in `<head>` via `<GoogleTagManagerHead>`.
- Inject GTM `<noscript>` fallback as first child of `<body>` via `<GoogleTagManagerBody>`.
- Controlled by `NEXT_PUBLIC_GTM_ID` env var. Renders nothing when the var is absent.

### Facebook Pixel

- Load `fbevents.js` script once, initialise pixel, and fire an initial `PageView`.
- Re-fire `PageView` on every client-side navigation (pathname/search param change).
- Controlled by `NEXT_PUBLIC_FB_PIXEL_ID` env var. Renders nothing when absent.

### Cloudflare Turnstile

- Client widget rendered by `<CloudflareTurnstile>` — wraps the Turnstile JS API.
- Calls `onSuccess(token)` with the challenge token on pass.
- `verifyTurnstileToken(token)` utility verifies the token server-side via POST to Cloudflare's siteverify endpoint.
- Server verification must happen in an API route or Server Action before processing any form submission.
- Widget is destroyed and re-created on unmount/remount to avoid stale widget IDs.

## Required Environment Variables

| Variable | Side | Format | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | Client | `GTM-XXXXXXX` | Google Tag Manager > Admin > Container ID |
| `NEXT_PUBLIC_FB_PIXEL_ID` | Client | Numeric string e.g. `1234567890` | Meta Events Manager > Pixel ID |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Client | String from Cloudflare dashboard | Cloudflare Dashboard > Turnstile > Site Key |
| `TURNSTILE_SECRET_KEY` | Server only | String from Cloudflare dashboard | Cloudflare Dashboard > Turnstile > Secret Key |

## Acceptance Criteria

- GTM container fires `gtm.js` on initial page load.
- FB Pixel fires `PageView` on initial load and on every client-side navigation.
- Forms protected by Turnstile cannot be submitted without a valid challenge token.
- Server-side token verification rejects expired or forged tokens.
- All components render nothing (no errors) when their env vars are absent.
