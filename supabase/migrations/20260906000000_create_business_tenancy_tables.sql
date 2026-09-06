-- Foundation for multi-tenancy (see
-- docs/requirements/mixed-language-multi-tenant-architecture-plan.md, Phase 0). Every
-- business-scoped table added after this migration carries a business_id column resolved
-- server-side (never trusted from client input, per that plan's spec references) — this
-- migration only introduces the tenant registry itself.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text,
  description text,
  timezone text not null default 'UTC',
  default_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

create table public.business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'agent', 'viewer')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_users_user_id_idx on public.business_users (user_id);
create index business_users_business_id_idx on public.business_users (business_id);

alter table public.business_users enable row level security;

-- Dashboard authentication (src/app/login) already gates access to the Next.js app itself,
-- but today's admin dashboard reads/writes exclusively through the admin-secret-protected Edge
-- Functions using the service-role client (see supabase/functions/_shared/admin-auth.ts) —
-- service_role bypasses RLS entirely, so these policies are not yet the operative access
-- control for the running app. They exist as forward-looking isolation for when the dashboard
-- moves to authenticated per-user queries against a business, and as defense in depth
-- regardless. The primary tenant-isolation mechanism today is the business_id scoping added to
-- every Edge Function query in this same phase.
--
-- Read-only, own-row-only policy: a user can see which businesses they belong to. Membership
-- management (invites, role changes) has no dashboard UI yet, so writes stay service-role-only
-- for now rather than building a policy for a flow that doesn't exist — revisit when Phase 7's
-- team management UI is built.
create policy "users can view their own memberships"
  on public.business_users
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "members can view their businesses"
  on public.businesses
  for select
  to authenticated
  using (
    id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- integration_mode picks which WhatsApp connection path this number uses (see the plan doc's
-- §4.1 decision to support both): 'manychat' resolves the business server-side from
-- manychat_api_key (a per-business secret sent as a request header, same trust model as
-- INGEST_ADMIN_SECRET); 'meta_direct' resolves the business from phone_number_id on Meta's
-- webhook payload. Both credential columns are nullable because only one set is populated,
-- depending on integration_mode.
create table public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone_number text,
  display_name text,
  integration_mode text not null check (integration_mode in ('manychat', 'meta_direct')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  -- meta_direct credentials
  phone_number_id text,
  waba_id text,
  access_token_encrypted text,
  -- manychat credentials
  manychat_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_numbers_business_id_idx on public.whatsapp_numbers (business_id);

create unique index whatsapp_numbers_phone_number_id_key
  on public.whatsapp_numbers (phone_number_id)
  where phone_number_id is not null;

create unique index whatsapp_numbers_manychat_api_key_key
  on public.whatsapp_numbers (manychat_api_key)
  where manychat_api_key is not null;

alter table public.whatsapp_numbers enable row level security;

create policy "members can view their business's whatsapp numbers"
  on public.whatsapp_numbers
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- Grants for service_role come from the default-privilege rule in
-- 20260803000000_grant_service_role_table_privileges.sql (same pattern already relied on by
-- every table added since that migration, e.g. chat_escalations, web_widget_config).
