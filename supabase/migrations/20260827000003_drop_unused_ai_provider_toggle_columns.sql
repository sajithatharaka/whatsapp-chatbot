-- Cleanup for schema drift left by an abandoned, never-merged design: an earlier attempt at
-- OpenRouter support (feature/openrouter-ai-provider-settings, 2026-08-21,
-- docs/requirements/ai-provider-settings.md) added a dual-provider *toggle*
-- (ai_configuration.chat_provider / .embedding_provider, 'cloudflare' | 'openrouter', switched via
-- a planned /dashboard/settings page) instead of replacing Cloudflare outright. That branch's
-- migrations (20260821000000_add_ai_provider_columns.sql,
-- 20260821000001_widen_knowledge_chunks_embedding_dimension.sql) were applied to the shared
-- Supabase project at some point, but the branch itself was never merged — so `main` (and this
-- migration set) has no record of those files, which is what makes `supabase db push` fail with
-- "remote migration versions not found in local migrations directory" for a fresh checkout of
-- `main`. The full-replacement approach in docs/requirements/openrouter-migration.md (this
-- migration set) is the confirmed direction going forward, not that toggle design — see its
-- Change history for the reconciliation decision.
--
-- Reconciling the remote project requires two things together, in this order:
--   1. `supabase migration repair --status reverted 20260821000000 20260821000001` — tells the
--      Supabase CLI's bookkeeping table those two versions didn't run, so `db push` stops
--      expecting local files for them. This does NOT undo their actual schema changes.
--   2. This migration, which does the actual undo: drops the chat_provider/embedding_provider
--      columns those migrations added. (Their other schema change — widening
--      knowledge_chunks.embedding — is already independently superseded by this migration set's
--      own 20260827000000_resize_knowledge_chunks_embedding.sql, which re-widens the column to
--      1024 regardless of whatever width it starts from.)
--
-- `if exists` throughout so this migration is also a clean no-op against a fresh project that
-- never had 20260821000000 applied at all (e.g. Testing §5's scratch/staging project).
alter table public.ai_configuration
  drop column if exists chat_provider,
  drop column if exists embedding_provider;
