# Admin Dashboard UI — Requirements

_Created: 2026-08-03_

## Overview

First real UI consumer of the Supabase backend migrated in
[whatsapp-supabase-backend.md](./whatsapp-supabase-backend.md). A login-gated, sidebar-nav admin
app (Next.js App Router, Tailwind + shadcn/ui) so a team member can manage the WhatsApp
assistant's knowledge base and find the API contract needed to wire up a WhatsApp Business
number. This is the first time this repo has any `next`/`react` dependencies, `app/` directory,
or build tooling for them — previously only the standalone analytics/turnstile pieces existed.

## Components

### Auth (Supabase Auth, invite-only)

- `src/lib/supabase/{client,server}.ts` — browser/server Supabase clients (`@supabase/ssr`).
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — redirects unauthenticated requests to
  `/login` for every path except `/login` itself (matcher includes `/api/*`); redirects an
  already-authenticated visitor away from `/login` to `/dashboard`. Uses `getUser()` (revalidates
  against the Auth server), not `getSession()`.
- `src/lib/supabase/requireUser.ts` — re-checked independently inside every Route Handler
  (defense in depth beyond the middleware).
- `src/app/login/{page.tsx,actions.ts}` + `src/components/auth/LoginForm.tsx` — email/password
  sign-in via a Server Action (`useActionState`). **No sign-up page exists.** Admins are
  provisioned via the Supabase Dashboard (Authentication → Users → Invite) or
  `supabase.auth.admin.inviteUserByEmail` — this is an operational step, not a code path.
- `src/app/dashboard/layout.tsx` re-checks auth again before rendering the shell.

### Sidebar shell

`src/components/navigation/SidebarNav.tsx` — two items only (Knowledge Base, API Docs) under a
"WORKSPACE" heading, active-state highlighting via `usePathname()`. `src/components/navigation/
SignOutButton.tsx` calls the `signOut` Server Action. `src/app/dashboard/page.tsx` redirects to
`/dashboard/knowledge` (no separate "Overview" page).

### Knowledge management (add/update/delete)

Wired directly to the real Edge Function contracts (`supabase/functions/knowledge` and
`supabase/functions/ingest` — see the backend requirements doc for the full contract):

- `src/lib/supabase/admin-api.ts` (`import 'server-only'`) — the one place holding
  `INGEST_ADMIN_SECRET`; calls the Edge Functions with `apikey`/`Authorization`/`x-admin-secret`.
  Reads (list/detail) are called in-process from Server Components; writes go through:
  - `src/app/api/knowledge/route.ts` — `POST` (create **and** update — passing an existing
    `documentId` re-ingests it; the underlying contract has no separate PATCH).
  - `src/app/api/knowledge/[id]/route.ts` — `DELETE`.
- `src/lib/knowledge/mapFormToIngestPayload.ts` — pure function mapping form values to the
  `/ingest` body, including only the field(s) relevant to the selected `sourceType`
  (`text|markdown|csv` → `content`, `website` → `source`, `pdf|docx` → `contentBase64`).
- `src/components/knowledge/{KnowledgeListSection,KnowledgeFormDialog,DeleteKnowledgeDialog,
KnowledgeChunksView,KnowledgeRowActions,KnowledgeDetailDeleteAction}.tsx` +
  `src/app/dashboard/knowledge/{page.tsx,[id]/page.tsx}`.
- **"Update" re-ingests, it doesn't edit in place**: only chunked/derived text is stored, not the
  original raw content, so the edit dialog prefills title/source/sourceType but requires fresh
  content — the dialog copy says this explicitly.
- `reindex` is **not** wired into this UI (not requested; the Edge Function exists for future use).

### API documentation

`src/app/dashboard/api-docs/page.tsx` + `src/lib/api-docs/apiEndpoints.ts` +
`src/components/api-docs/{EndpointCard,CopyCodeButton}.tsx`. Documents `chat`, `search`, `health`.
Explicitly states that `/chat` is **not** a drop-in Twilio/Meta Cloud API webhook URL — it's a
generic `{phone, message, name?}` JSON API; connecting a real WhatsApp number requires the
customer's own relay (Twilio Function / Meta webhook handler / small server) that receives the
provider's webhook, calls `/chat`, and sends the `reply` back out via the provider's send API.

**Bug fix (2026-08-03)**: `CopyCodeButton` crashed with `Cannot read properties of undefined
(reading 'writeText')` — `navigator.clipboard` is only defined in secure contexts (HTTPS or
`localhost`), so it's `undefined` when the dashboard is accessed over plain HTTP (e.g. a LAN IP
during dev/testing). `handleCopy` now falls back to a hidden `<textarea>` +
`document.execCommand('copy')` when `navigator.clipboard` is absent.

## Environment variables

| Variable                        | Side          | Purpose                                                                                                                                        |
| ------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Client+Server | Supabase Auth clients + Edge Function base URL                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client+Server | Supabase Auth clients + `apikey`/`Authorization` on Edge Function calls (public by design)                                                     |
| `INGEST_ADMIN_SECRET`           | Server only   | Sent as `x-admin-secret`; **must match** the value already set in `supabase/functions/.env(.production)` — two deployables sharing one secret. |

Deliberately not added: `SUPABASE_SERVICE_ROLE_KEY` — the app never queries Postgres directly,
everything goes through the Edge Functions.

## Deviations from the original plan (worth flagging)

- **`eslint-plugin-react` was dropped**, not just deferred. Its latest release (7.37.5) crashes
  outright under this repo's already-pinned ESLint 10 (`context.getFilename is not a function` —
  a removed API, and its peer range confirms it only supports ESLint ≤9). `eslint-plugin-
react-hooks` and `eslint-plugin-jsx-a11y` do work under ESLint 10 despite similar peer-range
  lag, so they're kept; only the genuinely broken one was removed. `react-hooks/rules-of-hooks`
  (error) and `react-hooks/exhaustive-deps` (warn) — the two CLAUDE.md explicitly names — are
  both enforced via `eslint-plugin-react-hooks`.
- **TypeScript pinned to `^6.0.3`**, not whatever npm resolves as latest. `typescript-eslint@8.x`
  (already pinned before this change) hard-requires `typescript <6.1.0`; npm had resolved `^7.0.2`
  by default, which crashed `typescript-estree`'s internals outright. `^6.0.3` matches what the
  sibling `whatsapp-chatbot` repo already runs successfully.
- Tailwind v4 (`@tailwindcss/postcss`, CSS-first config) and shadcn "New York" / neutral base —
  both were flagged as defaults in the plan and not challenged.

## Acceptance Criteria

- Visiting any `/dashboard/*` or `/api/*` route while unauthenticated redirects to `/login`.
- Visiting `/login` while already authenticated redirects to `/dashboard`.
- Creating a knowledge document (any of the six supported `sourceType`s) appears in the list.
- Re-submitting with the same document's id updates it (`status: "updated"`) rather than creating
  a duplicate.
- Deleting requires an explicit confirmation dialog before the request fires.
- The API docs page's example base URL matches `NEXT_PUBLIC_SUPABASE_URL` and accurately describes
  the relay pattern for `/chat` (not a fictitious drop-in webhook).
- Every form input has a unique `data-testid`.
- `npm run lint` — zero errors (`react-hooks/rules-of-hooks` included).
- `npm test` — all unit/component tests pass; `/src` coverage thresholds (85%/85%/75%/75%) hold.
- `npm run test:e2e` — unauthenticated-redirect smoke test passes (requires
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` pointing at a reachable Supabase
  project, local or hosted, since middleware calls `auth.getUser()` on every request).

## Explicitly out of scope

- CI/CD (GitHub Actions → Netlify) wiring for deploying this Next.js app — no workflow or
  `netlify.toml` exists in this repo yet; not part of this change.
- `reindex` UI action, a public sign-up flow, a "successful login" e2e test (needs a seeded test
  admin or network mocking), Turnstile on the login form (invite-only internal tool).
