-- Every table so far was created with RLS enabled and no policies, which is
-- correctly interpreted as "no client-side access" — but that's separate
-- from plain SQL-level GRANTs, which were never issued at all. service_role
-- has BYPASSRLS (so RLS was never the blocker), but every Edge Function
-- call was still failing with `42501 permission denied` because the role
-- had no SELECT/INSERT/UPDATE/DELETE grant on these tables to begin with.
-- All access to these tables goes exclusively through the Edge Functions'
-- service-role client (see supabase/functions/_shared/db.ts) — anon/
-- authenticated never touch them directly, so grants are scoped to
-- service_role only.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.customers,
  public.ai_configuration,
  public.knowledge_documents,
  public.knowledge_chunks,
  public.conversation_messages,
  public.conversation_summary
to service_role;

grant execute on function public.match_knowledge_chunks(extensions.vector, int, float)
  to service_role;

-- Keep this project-wide so future tables/functions created by whichever
-- role runs migrations don't silently repeat this gap.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
