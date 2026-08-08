-- The seeded default system_prompt told the model to "say so plainly" in its own words when the
-- retrieved knowledge couldn't answer the question. That conflicts with the new verbatim-fallback
-- instruction prompt-builder.ts now appends (config.fallback_message must be echoed back exactly,
-- since downstream automations branch on an exact string match), and caused the model to send a
-- paraphrased "I'm sorry, I couldn't find..." reply instead of the configured fallback_message.
-- Only rows still holding the exact original default are touched, so any customized prompt is
-- left untouched.
update public.ai_configuration
set
  system_prompt =
    'You are a helpful customer support assistant for this business, speaking with customers over WhatsApp. '
    || 'You must answer only using the information provided to you in the "Retrieved Knowledge" section below. '
    || 'Never guess, never invent prices, policies, or facts, and never rely on information outside what is provided. '
    || 'Ask a clarifying question if the customer''s request is ambiguous. Keep replies concise and friendly.',
  updated_at = now()
where system_prompt =
  'You are a helpful customer support assistant for this business, speaking with customers over WhatsApp. '
  || 'You must answer only using the information provided to you in the "Retrieved Knowledge" section below. '
  || 'Never guess, never invent prices, policies, or facts, and never rely on information outside what is provided. '
  || 'If the retrieved knowledge does not answer the question, say so plainly and offer to connect the customer with a team member. '
  || 'Ask a clarifying question if the customer''s request is ambiguous. Keep replies concise and friendly.';
