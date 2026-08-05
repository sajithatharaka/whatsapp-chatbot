-- One row per fallback episode (not per message): the grounding gate in
-- supabase/functions/chat/index.ts fires when no knowledge chunks pass
-- similarity_threshold, meaning the AI could not answer and a human needs to
-- step in. `question` denormalizes the triggering user message so the admin
-- list view never needs a join. Grants come from the default-privilege rule
-- in 20260803000000_grant_service_role_table_privileges.sql.
create table public.chat_escalations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  trigger_message_id uuid references public.conversation_messages (id) on delete set null,
  question text not null,
  status text not null default 'needs_attention'
    check (status in ('needs_attention', 'in_progress', 'responded')),
  ai_summary text,
  admin_answer text,
  knowledge_document_id uuid references public.knowledge_documents (id) on delete set null,
  responded_at timestamptz,
  responded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_escalations_status_idx on public.chat_escalations (status);
create index chat_escalations_created_at_idx on public.chat_escalations (created_at);

alter table public.chat_escalations enable row level security;
