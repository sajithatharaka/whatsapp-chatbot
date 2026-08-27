insert into public.ai_configuration (
  is_active,
  chat_model,
  embedding_model,
  fallback_model,
  similarity_threshold,
  temperature,
  max_tokens,
  top_k,
  system_prompt,
  business_rules_prompt
) values (
  true,
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/baai/bge-base-en-v1.5',
  '@cf/meta/llama-3-8b-instruct',
  0.75,
  0.30,
  512,
  5,
  'You are a helpful customer support assistant for this business, speaking with customers over WhatsApp. '
    || 'You must answer only using the information provided to you in the "Retrieved Knowledge" section below. '
    || 'Never guess, never invent prices, policies, or facts, and never rely on information outside what is provided. '
    || 'Ask a clarifying question if the customer''s request is ambiguous. Keep replies concise and friendly.',
  'Always respond in the customer''s language when possible. Never make commitments (prices, availability, dates) that are not explicitly stated in the retrieved knowledge.'
);
