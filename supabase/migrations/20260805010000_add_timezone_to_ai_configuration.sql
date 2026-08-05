alter table public.ai_configuration
  add column timezone text not null default 'UTC';
