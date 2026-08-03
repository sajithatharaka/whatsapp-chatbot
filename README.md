# Starter

A Next.js + TypeScript starter template with analytics tracking and bot protection pre-wired.

---

## Required credentials before going live

Before the app will track or protect forms, you need IDs/keys from three services. Add them to `.env.local` (never commit this file).

### 1 — Google Tag Manager

| Env var | Format | How to get it |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` | [tagmanager.google.com](https://tagmanager.google.com) → Admin → **Container ID** (top right of the container settings page) |

> GTM acts as a tag container — once the GTM snippet is live you can add Google Analytics 4, conversion tags, and third-party pixels through the GTM UI without re-deploying code.

---

### 2 — Facebook / Meta Pixel

| Env var | Format | How to get it |
|---|---|---|
| `NEXT_PUBLIC_FB_PIXEL_ID` | numeric string e.g. `1234567890123` | [Meta Events Manager](https://business.facebook.com/events_manager) → select your pixel → **Settings** → Pixel ID |

> The pixel fires `PageView` on initial load and on every client-side navigation automatically.

---

### 3 — Cloudflare Turnstile (CAPTCHA replacement)

| Env var | Side | How to get it |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Client (public) | [Cloudflare Dashboard](https://dash.cloudflare.com) → Turnstile → **Add site** → copy **Site Key** |
| `TURNSTILE_SECRET_KEY` | Server only — never expose | Same page → copy **Secret Key** |

> The site key is embedded in the client widget. The secret key is used server-side to verify the challenge token before trusting any form submission — keep it out of the browser.

---

## `.env.local` template

```
# Google Tag Manager
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX

# Facebook Pixel
NEXT_PUBLIC_FB_PIXEL_ID=your_pixel_id_here

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

---

## Usage

### Add GTM to your root layout (`app/layout.tsx`)

```tsx
import { GoogleTagManagerHead, GoogleTagManagerBody } from '@/components/analytics/GoogleTagManager';
import { analyticsConfig } from '@/lib/analytics/config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <GoogleTagManagerHead gtmId={analyticsConfig.gtmId} />
      </head>
      <body>
        <GoogleTagManagerBody gtmId={analyticsConfig.gtmId} />
        {children}
      </body>
    </html>
  );
}
```

### Add Facebook Pixel to your root layout

```tsx
import { FacebookPixel } from '@/components/analytics/FacebookPixel';
import { Suspense } from 'react';

// inside <body>, after GoogleTagManagerBody:
<Suspense fallback={null}>
  <FacebookPixel pixelId={analyticsConfig.fbPixelId} />
</Suspense>
```

> Wrap in `<Suspense>` because `FacebookPixel` uses `useSearchParams()` which requires it in the App Router.

### Add Turnstile to a form

```tsx
'use client';
import { useState } from 'react';
import { CloudflareTurnstile } from '@/components/turnstile/CloudflareTurnstile';
import { analyticsConfig } from '@/lib/analytics/config';

export function ContactForm() {
  const [token, setToken] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // token is verified server-side in your API route / Server Action
    await fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify({ token, /* ...form fields */ }),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <CloudflareTurnstile
        siteKey={analyticsConfig.turnstileSiteKey}
        onSuccess={setToken}
      />
      <button type="submit" disabled={!token}>Submit</button>
    </form>
  );
}
```

### Verify Turnstile server-side (API route or Server Action)

```ts
import { verifyTurnstileToken } from '@/lib/analytics/turnstileVerify';

export async function POST(request: Request) {
  const { token } = await request.json();
  const { success } = await verifyTurnstileToken(token);
  if (!success) return Response.json({ error: 'Bot check failed' }, { status: 400 });
  // process the form ...
}
```

---

## File map

```
src/
  components/
    analytics/
      GoogleTagManager.tsx   # GTM head + body fragments
      FacebookPixel.tsx      # FB Pixel script + SPA PageView tracking
    turnstile/
      CloudflareTurnstile.tsx  # Turnstile widget (client)
  lib/
    analytics/
      config.ts              # reads env vars into a typed config object
      turnstileVerify.ts     # server-side token verification

docs/requirements/
  tracking-and-captcha.md   # full requirements for this feature

tests/components/
  analytics.test.ts         # Vitest unit tests
```
