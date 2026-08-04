-- @cf/meta/llama-3.1-8b-instruct (chat_model) and @cf/meta/llama-3-8b-instruct
-- (fallback_model) were deprecated by Cloudflare on 2026-05-30, causing every
-- /chat request to fail with a 410 from the Workers AI v1 API once the
-- fallback attempt also hit the same deprecation (see
-- docs/requirements/whatsapp-supabase-backend.md, "chat 500s: deprecated
-- Workers AI models"). Both models were still current when originally seeded
-- in 20260802000008_seed_ai_configuration_default.sql.
--
-- Replacements confirmed current on https://developers.cloudflare.com/workers-ai/models/
-- at the time of this migration:
--   chat_model:     @cf/meta/llama-3.1-8b-instruct-fast (same model family, 128K context)
--   fallback_model: @cf/meta/llama-3.2-3b-instruct (distinct model, 80K context)
-- embedding_model (@cf/baai/bge-base-en-v1.5) is unaffected — still current,
-- and its 768-dim output must not change without a knowledge_chunks re-embed.
update public.ai_configuration
set
  chat_model = '@cf/meta/llama-3.1-8b-instruct-fast',
  fallback_model = '@cf/meta/llama-3.2-3b-instruct'
where is_active = true
  and chat_model = '@cf/meta/llama-3.1-8b-instruct';
