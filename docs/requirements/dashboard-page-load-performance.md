# Dashboard Page-Load Performance — Requirements

_Created: 2026-08-27_

## Overview

The admin dashboard ([admin-dashboard-ui.md](./admin-dashboard-ui.md)) was slow to load on
every page, in both local dev and production. The cause was structural rather than
page-specific: each `/dashboard/*` navigation was gated behind a chain of **sequential
network round-trips** before any content rendered, and none of the read data was cached.

Per full page load of any dashboard route, in series:

1. `src/lib/supabase/middleware.ts` → `supabase.auth.getUser()` → round-trip to
   `${SUPABASE_URL}/auth/v1/user` (runs on every request the matcher covers — pages, RSC
   payloads, every `/api/*` call).
2. `src/app/dashboard/layout.tsx` → `supabase.auth.getUser()` → the **same round-trip again**
   (independent "defense in depth" re-check).
3. The page's data fetch → a Supabase Edge Function with `cache: 'no-store'`
   (`src/lib/supabase/admin-api.ts`) — cold starts add 0.5–2s.

The **Needs Attention** page was worst: `src/app/dashboard/escalations/layout.tsx` and
`EscalationList` were `'use client'`, so the page shipped an empty shell, hydrated, then
called `/api/escalations`, which ran `requireAuthenticatedUser()` (**a third `getUser()`
round-trip**) and then the Edge Function — three serial auth round-trips + one edge call +
a hydrate-before-fetch delay.

Locally, `package.json` ran `next dev` without Turbopack, so each route also paid a
multi-second on-demand webpack compile on first visit.

## Changes

### 1. Turbopack for local dev

- `package.json`: `"dev": "next dev"` → `"dev": "next dev --turbopack"`. Dev only; `build` /
  `start` unchanged. Production build verified still green.

### 2. Cache read-only Edge Function reads (`src/lib/supabase/admin-api.ts`)

- New `CACHE_TAGS` constant (`knowledge`, `escalations`, `widget-config`) and
  `READ_REVALIDATE_SECONDS = 15`.
- The GET helpers — `listKnowledgeDocuments`, `getKnowledgeDocument`, `getWidgetConfig`,
  `listEscalations`, `getEscalation` — now pass
  `next: { revalidate: 15, tags: [<tag>] }` instead of `cache: 'no-store'`, so repeat
  dashboard navigations are served from Next's Data Cache rather than re-hitting a
  (possibly cold) Edge Function on every render.
- POST/PATCH/DELETE helpers are unchanged (non-cacheable methods).
- `listEscalations(params, { fresh })` gained a second argument. `fresh: true` forces
  `cache: 'no-store'`; it is passed by `src/app/api/escalations/route.ts`, which backs the
  client-side refresh / "Retry" in `EscalationList` and must never serve stale rows.
- Mutating route handlers call `revalidateTag(<tag>)` after a successful edge call so edits
  are reflected immediately rather than after the 15s TTL:
  - `src/app/api/knowledge/route.ts` (POST) and `src/app/api/knowledge/[id]/route.ts`
    (DELETE) → `revalidateTag('knowledge')`
  - `src/app/api/escalations/[id]/route.ts` (PATCH) → `revalidateTag('escalations')`
  - `src/app/api/widget-config/route.ts` (PATCH) → `revalidateTag('widget-config')`

### 3. Local JWT verification instead of auth round-trips

`getUser()` (always a network call to the Auth server) → `getClaims()` (verifies the JWT
signature **locally** against the project's cached JWKS when the project uses asymmetric JWT
signing keys; transparently falls back to a `getUser()` network call for legacy HS256
secrets — **no behavioural regression** before keys are rotated, and it becomes fast the
moment they are). Unlike bare `getSession()`, an asymmetric `getClaims()` is
cryptographically trustworthy, so it is safe in middleware and the layout.

- `src/lib/supabase/middleware.ts`: `getClaims()`; `data?.claims` truthy ⇒ authenticated.
  Redirect logic unchanged.
- `src/app/dashboard/layout.tsx`: `getClaims()`; `redirect('/login')` when no claims; the
  sidebar email now comes from `claims.email`.
- `src/lib/supabase/requireUser.ts`: `requireAuthenticatedUser()` uses `getClaims()`, throws
  `UnauthenticatedError` when there are no claims, and returns
  `{ id: claims.sub, email: claims.email ?? null }` (typed `AuthenticatedUser`) so the one
  caller that needs it — `src/app/api/escalations/[id]/route.ts` PATCH → `respondedBy` —
  keeps working.

#### Operational prerequisite (not a code change)

In the Supabase Dashboard → **Project Settings → JWT Keys**, migrate to **asymmetric JWT
signing keys**. Until then, change 3 is behaviourally identical to before (one auth
round-trip) with no speed-up; changes 1, 2 and 4 help regardless.

### 4. Server-render the escalations list

- `src/app/dashboard/escalations/layout.tsx` is now a **server component**: it fetches the
  default (unfiltered) list via `listEscalations({ statuses: DEFAULT_STATUSES })` (cached per
  change 2) and passes it to the new client shell.
- `src/components/escalations/EscalationsWorkspace.tsx` (new, client): owns the `refreshKey`
  and `EscalationListRefreshProvider` that the detail pane bumps after a status change /
  answer, and lays the list out next to the routed detail `children`.
- `src/components/escalations/EscalationList.tsx`: new optional `initialEscalations` prop.
  When present it seeds `state` as `loaded` and, if the URL carries no `status`/`from`/`to`
  filter, skips the mount-time fetch (tracked with a `useRef` guard). Any later filter
  change / retry / `refreshKey` bump still fetches `/api/escalations` with
  `cache: 'no-store'` as before, so loading/error/empty states are unchanged.

## Tests

- `tests/lib/supabase/middleware.test.ts` — mock switched from `getUser` to `getClaims`
  (`{ data: null }` vs `{ data: { claims } }`); the four redirect / pass-through cases hold.
- `tests/middleware.test.ts` (matcher regex) — unchanged, still green.
- `tests/app/dashboard/layout.test.tsx` (new) — no claims ⇒ `redirect('/login')`; valid
  claims ⇒ shell renders with `claims.email`; claims without an email don't throw.
- `tests/lib/supabase/admin-api.test.ts` — GET helpers assert
  `next: { revalidate: 15, tags: [...] }` and no `cache`; `listEscalations({}, { fresh: true })`
  asserts `cache: 'no-store'` and no `next`.
- `tests/app/api/{knowledge/route,knowledge/id-route,escalations/id-route,widget-config/route}.test.ts`
  — mock `next/cache`, assert `revalidateTag` is called with the right tag on success and
  not called on the 401 path.
- `tests/components/escalations/EscalationList.test.tsx` — new cases: seeded rows render with
  no initial fetch; a URL filter still forces a fetch; a `refreshKey` bump still refetches
  when seeded. Existing no-prop cases unchanged.
- Full suite: 119 passing / 26 files. `eslint`, `prettier --check` (on changed files),
  `tsc --noEmit` (app sources), and `next build` all clean.

## Verification

1. `npm test` — all green, coverage thresholds held.
2. `npm run lint && npm run format:check`.
3. `npm run build` — succeeds; `/dashboard/escalations` drops to the layout-shell size with
   the list server-rendered.
4. Local `npm run dev`: first compile is Turbopack-fast; second visit to a page is
   near-instant (change 2). With asymmetric JWT keys enabled, the Network tab shows no
   `/auth/v1/user` call on navigations (change 3).
5. Mutations still reflect immediately: add a knowledge doc → list updates on next load;
   PATCH an escalation → list/detail update (change 2 `revalidateTag`).
6. Needs Attention with JS disabled / via view-source: the escalation rows are in the
   server HTML, not just a loading state (change 4).
