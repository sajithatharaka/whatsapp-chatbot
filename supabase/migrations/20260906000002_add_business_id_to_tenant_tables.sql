-- Phase 0 tenancy cutover (docs/requirements/mixed-language-multi-tenant-architecture-plan.md).
-- Adds business_id to every table that previously assumed a single global tenant, backfills it
-- to the seeded "mk-agency" business (previous migration), then tightens uniqueness constraints
-- that were correct for one tenant but would silently leak across tenants otherwise (e.g. two
-- businesses both wanting an ai_configuration active row, or two businesses each having a
-- customer with the same phone number).
--
-- RLS policies added per table are read-only and forward-looking, same rationale as
-- 20260906000000_create_business_tenancy_tables.sql: today's Edge Functions use the
-- service-role client (bypasses RLS) and enforce isolation via explicit business_id filters in
-- application code (see the _shared/*.ts changes landing alongside this migration) — these
-- policies matter once/if the dashboard queries Postgres directly as an authenticated user.

-- customers ------------------------------------------------------------------------------------
alter table public.customers add column business_id uuid;
update public.customers set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.customers alter column business_id set not null;
alter table public.customers
  add constraint customers_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index customers_business_id_idx on public.customers (business_id);

drop index public.customers_phone_unique_idx;
drop index public.customers_session_id_unique_idx;

create unique index customers_business_id_phone_unique_idx
  on public.customers (business_id, phone)
  where phone is not null;

create unique index customers_business_id_session_id_unique_idx
  on public.customers (business_id, session_id)
  where session_id is not null;

create policy "members can view their business's customers"
  on public.customers
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- ai_configuration -------------------------------------------------------------------------------
alter table public.ai_configuration add column business_id uuid;
update public.ai_configuration set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.ai_configuration alter column business_id set not null;
alter table public.ai_configuration
  add constraint ai_configuration_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index ai_configuration_business_id_idx on public.ai_configuration (business_id);

drop index public.ai_configuration_single_active_idx;
create unique index ai_configuration_business_id_active_idx
  on public.ai_configuration (business_id)
  where is_active;

create policy "members can view their business's ai configuration"
  on public.ai_configuration
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- knowledge_documents ------------------------------------------------------------------------------
alter table public.knowledge_documents add column business_id uuid;
update public.knowledge_documents set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.knowledge_documents alter column business_id set not null;
alter table public.knowledge_documents
  add constraint knowledge_documents_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index knowledge_documents_business_id_idx on public.knowledge_documents (business_id);

drop index public.knowledge_documents_source_key;
create unique index knowledge_documents_business_id_source_key
  on public.knowledge_documents (business_id, source)
  where source is not null;

create policy "members can view their business's knowledge documents"
  on public.knowledge_documents
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- knowledge_chunks ---------------------------------------------------------------------------------
-- Denormalized (not just reachable via document_id -> knowledge_documents.business_id) so
-- match_knowledge_chunks can filter by business_id directly in the same index scan as the vector
-- search, and so RLS can scope this table without a join. Backfilling from businesses directly
-- (rather than joining knowledge_documents) is equivalent here since every existing row — chunks
-- included — belongs to the single pre-cutover tenant.
alter table public.knowledge_chunks add column business_id uuid;
update public.knowledge_chunks set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.knowledge_chunks alter column business_id set not null;
alter table public.knowledge_chunks
  add constraint knowledge_chunks_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index knowledge_chunks_business_id_idx on public.knowledge_chunks (business_id);

create policy "members can view their business's knowledge chunks"
  on public.knowledge_chunks
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- conversation_messages ----------------------------------------------------------------------------
alter table public.conversation_messages add column business_id uuid;
update public.conversation_messages set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.conversation_messages alter column business_id set not null;
alter table public.conversation_messages
  add constraint conversation_messages_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index conversation_messages_business_id_idx on public.conversation_messages (business_id);

create policy "members can view their business's conversation messages"
  on public.conversation_messages
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- conversation_summary -----------------------------------------------------------------------------
alter table public.conversation_summary add column business_id uuid;
update public.conversation_summary set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.conversation_summary alter column business_id set not null;
alter table public.conversation_summary
  add constraint conversation_summary_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index conversation_summary_business_id_idx on public.conversation_summary (business_id);

create policy "members can view their business's conversation summaries"
  on public.conversation_summary
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- chat_escalations ----------------------------------------------------------------------------------
alter table public.chat_escalations add column business_id uuid;
update public.chat_escalations set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.chat_escalations alter column business_id set not null;
alter table public.chat_escalations
  add constraint chat_escalations_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index chat_escalations_business_id_idx on public.chat_escalations (business_id);

create policy "members can view their business's chat escalations"
  on public.chat_escalations
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );

-- web_widget_config -----------------------------------------------------------------------------------
alter table public.web_widget_config add column business_id uuid;
update public.web_widget_config set business_id = (select id from public.businesses where slug = 'mk-agency');
alter table public.web_widget_config alter column business_id set not null;
alter table public.web_widget_config
  add constraint web_widget_config_business_id_fkey foreign key (business_id) references public.businesses (id) on delete cascade;
create index web_widget_config_business_id_idx on public.web_widget_config (business_id);

drop index public.web_widget_config_single_active_idx;
create unique index web_widget_config_business_id_active_idx
  on public.web_widget_config (business_id)
  where is_active;

create policy "members can view their business's web widget config"
  on public.web_widget_config
  for select
  to authenticated
  using (
    business_id in (select business_id from public.business_users where user_id = auth.uid())
  );
