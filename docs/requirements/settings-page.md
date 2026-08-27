# Settings Page — Requirements

_Created: 2026-08-27_

## Overview

Adds a **Settings** screen (`/dashboard/settings`) to the admin dashboard
([admin-dashboard-ui.md](./admin-dashboard-ui.md)) for managing the project's two configuration
tables from one place:

- **`ai_configuration`** — the single active row that drives the assistant's runtime behaviour
  (models, retrieval tuning, prompts, timezone). Until now it could only be changed with raw SQL
  or a migration. The OpenRouter migration
  ([openrouter-migration.md](./openrouter-migration.md)) left `similarity_threshold` at a
  provisional `0.50` that an operator is expected to re-tune against real traffic — that is the
  concrete motivating case for a UI.
- **`web_widget_config`** — already fully managed at `/dashboard/widget`
  ([website-chat-widget.md](./website-chat-widget.md)). The Settings page only **surfaces** it
  (status + a link); editing stays on the widget page.

The implementation mirrors the existing `web_widget_config` end-to-end pattern exactly, so no new
architecture is introduced.

## Scope

### Edge Function — `supabase/functions/ai-config/`

`index.ts` — admin-only, `verify_jwt = true` + `requireAdminSecret` (same second-secret gate as
`/widget-config` and `/ingest`; reuses `INGEST_ADMIN_SECRET`). Registered in
`supabase/config.toml` and added to the `supabase:functions:deploy` script in `package.json`.

- `GET /ai-config` → `{ config }` — the active row via `loadActiveConfig` (unchanged, reused from
  `_shared/config.ts`).
- `PATCH /ai-config` → `{ config }` — partial update via the new `updateActiveConfig` in
  `_shared/config.ts`. Body is validated by `isValidUpdateBody`: every key optional; string
  fields must be strings; `fallbackModel` / `businessRulesPrompt` may be `string | null`; numeric
  fields must be finite; `similarityThreshold` ∈ [0, 1]; `temperature` ∈ [0, 2]; `maxTokens` /
  `topK` positive integers. Invalid JSON → 400; invalid payload → 400.

`_shared/config.ts` — adds `UpdateAiConfigInput` (camelCase) + `updateActiveConfig(supabase,
input)`: builds a `patch` with `updated_at = now()`, sets only provided fields (camelCase →
snake_case), `.update(patch).eq('is_active', true).select(...).single()`. Direct analogue of
`updateWidgetConfig` in `_shared/widget-config.ts`. No caching anywhere, so an edit takes effect
on the very next `/chat` message (which calls `loadActiveConfig` fresh).

**No migration.** `ai_configuration` already has a seeded active row
(`20260802000008_seed_ai_configuration_default.sql`); the screen only ever `UPDATE`s it. There is
still exactly one active row (the partial unique index on `is_active` is untouched).

### Next.js data layer

- `src/lib/ai-config/types.ts` — `AiConfig` (snake_case wire shape, mirrors
  `_shared/types.ts`'s `AiConfiguration` minus `is_active`) and `UpdateAiConfigPayload`
  (camelCase). Same "two deployables sharing a wire format" duplication as
  `src/lib/widget/types.ts`.
- `src/lib/supabase/admin-api.ts` — `CACHE_TAGS.aiConfig = 'ai-config'`; `getAiConfig()` (tagged
  Data Cache, 15s revalidate) and `updateAiConfig(payload)`. Same shape as the widget helpers.
- `src/app/api/ai-config/route.ts` — `GET` + `PATCH`, `requireAuthenticatedUser()` first
  (defense in depth), `UnauthenticatedError` → 401, `EdgeFunctionError` → passthrough status,
  else 500. `PATCH` calls `revalidateTag(CACHE_TAGS.aiConfig)` on success. Never called from the
  browser directly except through the form. Middleware already covers `/dashboard/*` and
  `/api/*`.

### UI

- `src/app/dashboard/settings/page.tsx` — Server Component, parallel-fetches `getAiConfig()` and
  `getWidgetConfig()`; renders the AI form and the widget summary card. `max-w-2xl` layout like
  the widget page.
- `src/components/settings/AiConfigForm.tsx` (`'use client'`) — modelled on
  `WidgetSettingsForm.tsx`. One field per `ai_configuration` column, each with a `<Label>` and a
  unique `data-testid` (`ai-config-<field>-input` / `-textarea`, save button
  `ai-config-save-button`):
  - text inputs: `chat_model`, `embedding_model`, `fallback_model` (blank = `null`), `timezone`.
  - number inputs (with `min`/`max`/`step`): `similarity_threshold` (0–1), `temperature` (0–2),
    `max_tokens` (≥1), `top_k` (≥1).
  - textareas: `system_prompt`, `business_rules_prompt` (blank = `null`), `fallback_message`.
  - Inline note under `embedding_model`: changing it does **not** re-embed stored chunks — run a
    reindex afterwards.
  - `similarity_threshold`, `temperature` and `top_k` each carry a `FieldHint`
    (`src/components/settings/FieldHint.tsx`) — an info icon next to the label that reveals a
    one-paragraph plain-language explanation on hover **and** keyboard focus, tied to the trigger
    via `aria-describedby` / `role="tooltip"`. Dependency-free (no popover primitive added).
    Copy lives in the `FIELD_HINTS` constant in `AiConfigForm.tsx`.
  - Submit: client-side validation (numeric ranges + `chat_model` / `embedding_model` /
    `system_prompt` / `fallback_message` / `timezone` non-empty, since those columns are
    `NOT NULL`); on failure a `toast.error` and no request. On success updates local state from
    the response, `toast.success`, `router.refresh()`.
- `src/components/settings/WidgetConfigCard.tsx` — read-only: title, allowed-domain count,
  enabled/disabled `Badge`, and a `Link` button (`settings-widget-config-link`) to
  `/dashboard/widget`.
- `src/components/navigation/SidebarNav.tsx` — new `Settings` nav item
  (`/dashboard/settings`, `lucide-react` `Settings` icon).

## Security

Two gates, unchanged from the widget-config pattern: the dashboard route handler requires an
authenticated Supabase user (`requireAuthenticatedUser`), and the Edge Function requires
`x-admin-secret` = `INGEST_ADMIN_SECRET` (held server-side only, in `admin-api.ts`). No new env
vars. `ai_configuration` RLS stays closed — only the service-role key (Edge Functions) touches
the table.

## Tests

- `supabase/functions/_shared/config.test.ts` (new) — `loadActiveConfig` returns the active row /
  throws on error; `updateActiveConfig` patches only provided fields, always stamps `updated_at`,
  maps camelCase → snake_case including explicit `null`s, throws on error.
- `tests/app/api/ai-config/route.test.ts` (new) — `GET`/`PATCH` 401 unauthenticated, success
  returns `{ config }`, `EdgeFunctionError` status passthrough, `PATCH` calls
  `revalidateTag('ai-config')`.
- `tests/components/settings/AiConfigForm.test.tsx` (new) — renders initial values; a valid save
  issues the expected `PATCH` body and success toast + `router.refresh()`; numeric inputs carry
  their `min`/`max` bounds; the temperature / top-k / similarity-threshold `FieldHint`s reveal a
  `role="tooltip"` on focus wired via `aria-describedby`; clearing a required prompt blocks the
  request with an error toast; clearing the optional fallback model sends `null`; a failed
  response surfaces its error.
- `tests/lib/supabase/admin-api.test.ts` (updated) — `getAiConfig` uses the tagged Data Cache
  with admin headers; `updateAiConfig` `PATCH`es the payload and propagates edge errors.
- `tests/app/dashboard/settings/page.test.tsx` (new) — page renders the form (stubbed) and the
  widget card from fetched data.

Deno tests (`config.test.ts`) were not executed in the implementing environment (no `deno`
binary); they mirror `_shared/widget-config.test.ts` exactly and were reviewed by hand. Vitest
suites, `eslint`, and `tsc --noEmit` all pass.

## Explicitly out of scope

- Editing `web_widget_config` from this page (stays on `/dashboard/widget`).
- Creating/activating alternative `ai_configuration` rows or an `is_active` toggle — there is one
  active row and the screen edits it in place.
- The abandoned `feature/openrouter-ai-provider-settings` dual-provider toggle design (see
  `openrouter-migration.md` Change history) — unrelated, not revived here.

## Change history

- **2026-08-27 — implemented.** New `ai-config` Edge Function (+ `config.toml` /
  `package.json`), `updateActiveConfig` in `_shared/config.ts`, `src/lib/ai-config/types.ts`,
  `getAiConfig`/`updateAiConfig` in `admin-api.ts`, `src/app/api/ai-config/route.ts`,
  `/dashboard/settings` page, `AiConfigForm` + `WidgetConfigCard`, and the sidebar item. Tests as
  listed above. No migration. Manual verification against a live Supabase project (Edge Function
  serve + `curl`, and the dashboard round trip) is left for whoever deploys — it needs a linked
  project this environment doesn't have.
- **2026-08-27 — field explanations.** Added `src/components/settings/FieldHint.tsx` and
  hover/focus tooltips for `temperature`, `top_k` and `similarity_threshold` on the settings form
  (copy in `AiConfigForm.tsx`'s `FIELD_HINTS`), with a matching test.
