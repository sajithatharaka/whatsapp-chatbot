-- Settings for the embeddable website chat widget (public/widget.js +
-- supabase/functions/web-chat). Mirrors ai_configuration's single-active-row
-- pattern rather than inventing a new one. `enabled` defaults false and
-- `allowed_origins` defaults empty so the widget is inert until an admin
-- explicitly turns it on and lists at least one domain — a safe default,
-- not an opt-out.
create table public.web_widget_config (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  enabled boolean not null default false,
  title text not null default 'Chat with us',
  welcome_message text not null default 'Hi! Ask me anything and I''ll do my best to help.',
  primary_color text not null default '#111827',
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left')),
  allowed_origins text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index web_widget_config_single_active_idx
  on public.web_widget_config (is_active)
  where is_active;

alter table public.web_widget_config enable row level security;
-- No policies: only the service-role key (used exclusively by Edge
-- Functions) can read/write this table, same as every other table here.
-- Grants come from the default-privilege rule in
-- 20260803000000_grant_service_role_table_privileges.sql.

insert into public.web_widget_config (is_active) values (true);
