-- Part of the Cloudflare Workers AI -> OpenRouter migration (see
-- docs/requirements/openrouter-migration.md). Swaps the active
-- ai_configuration row's models to OpenRouter ids with confirmed Sinhala
-- support, chosen over the previous Cloudflare-only models specifically to
-- fix imprecise/fallback-prone Sinhala knowledge retrieval (root cause:
-- @cf/baai/bge-base-en-v1.5 is English-only).
--
-- similarity_threshold: 0.75 was tuned against bge-base-en-v1.5's score
-- distribution and must not carry over unexamined to qwen/qwen3-embedding-8b,
-- a different model with a different embedding space. 0.5 here is a
-- provisional starting point, NOT a measured value from real traffic — this
-- repo's Testing §6 functional acceptance test (real Sinhala
-- question/expected-chunk pairs run through /search post-reindex) has not
-- been executed yet. It's better-informed than a blind guess, though: a
-- synthetic single-pair check during implementation (one Sinhala question
-- embedded with input_type=search_query against its correct answer chunk
-- embedded with input_type=search_document, both via
-- qwen/qwen3-embedding-8b at 1024 dims) scored 0.594 cosine similarity,
-- against 0.34-0.45 for unrelated chunks — see
-- _shared/ai-provider.ts's EmbeddingInputType comment for why input_type
-- matters here, and openrouter-migration.md's Change history for the full
-- numbers. Whoever runs the real Testing §6 test MUST follow up with another
-- migration setting the real calibrated threshold and record the results in
-- openrouter-migration.md's Change history, per that document's Acceptance
-- Criteria.
update public.ai_configuration
set
  chat_model = 'google/gemini-2.5-flash',
  fallback_model = 'openai/gpt-4o-mini',
  embedding_model = 'qwen/qwen3-embedding-8b',
  similarity_threshold = 0.50
where is_active = true;
