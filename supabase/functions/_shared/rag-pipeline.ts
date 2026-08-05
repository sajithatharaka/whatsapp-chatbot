import { chatComplete, embed } from './ai-provider.ts';
import { createEscalationIfNeeded } from './escalations.ts';
import { appendMessage, loadRecentTurns, loadSummary, maybeUpdateSummary } from './memory.ts';
import { buildMessages } from './prompt-builder.ts';
import type { AiConfiguration, ChatResponse, Customer } from './types.ts';
import { searchKnowledge } from './vector-search.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Shared by both supabase/functions/chat (WhatsApp) and supabase/functions/web-chat
// (website widget): embed the message, retrieve grounded knowledge, gate on
// having something to ground the reply in, generate a reply, and persist
// conversation memory. The two callers differ only in how they resolve a
// Customer (phone vs. session id) before calling this.
export async function runRagPipeline(
  supabase: SupabaseClient,
  config: AiConfiguration,
  customer: Customer,
  message: string
): Promise<ChatResponse> {
  const queryEmbedding = await embed(message, config.embedding_model);
  const chunks = await searchKnowledge(
    supabase,
    queryEmbedding,
    config.top_k,
    config.similarity_threshold
  );

  // Grounding gate: never call the LLM without supporting context. This is
  // what actually prevents hallucination, not prompt instructions.
  if (chunks.length === 0) {
    const userMessage = await appendMessage(supabase, customer.id, { role: 'user', message });
    await appendMessage(supabase, customer.id, {
      role: 'assistant',
      message: config.fallback_message,
      confidence: 0,
    });
    await createEscalationIfNeeded(supabase, customer.id, userMessage.id, message);

    return {
      reply: config.fallback_message,
      confidence: 0,
      intent: 'fallback',
      handover: false,
      tool: null,
      sources: [],
    };
  }

  const [summary, recentTurns] = await Promise.all([
    loadSummary(supabase, customer.id),
    loadRecentTurns(supabase, customer.id),
  ]);

  const promptMessages = buildMessages(config, summary, recentTurns, chunks, message);

  let reply: string;
  let modelUsed = config.chat_model;
  try {
    reply = await chatComplete(promptMessages, {
      model: config.chat_model,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
    });
  } catch (primaryError) {
    if (!config.fallback_model) throw primaryError;
    modelUsed = config.fallback_model;
    reply = await chatComplete(promptMessages, {
      model: config.fallback_model,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
    });
  }

  // Phase 1 heuristic: use the top retrieved chunk's similarity as a proxy
  // for answer confidence. Real intent classification is a later phase.
  const confidence = chunks[0].similarity;
  const sources = chunks.map((chunk) => `chunk_${chunk.id}`);

  await appendMessage(supabase, customer.id, { role: 'user', message });
  await appendMessage(supabase, customer.id, {
    role: 'assistant',
    message: reply,
    confidence,
    model: modelUsed,
    sourceChunks: sources,
  });
  await maybeUpdateSummary(supabase, customer.id);

  return {
    reply,
    confidence,
    intent: 'knowledge',
    handover: false,
    tool: null,
    sources,
  };
}
