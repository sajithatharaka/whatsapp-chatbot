import { chatComplete, embed } from '../_shared/ai-provider.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { findOrCreateCustomer, getServiceClient } from '../_shared/db.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import {
  appendMessage,
  loadRecentTurns,
  loadSummary,
  maybeUpdateSummary,
} from '../_shared/memory.ts';
import { buildMessages } from '../_shared/prompt-builder.ts';
import type { ChatRequest, ChatResponse } from '../_shared/types.ts';
import { searchKnowledge } from '../_shared/vector-search.ts';

function isValidChatRequest(body: unknown): body is ChatRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.phone === 'string' &&
    typeof b.message === 'string' &&
    b.phone.length > 0 &&
    b.message.length > 0 &&
    (b.name === undefined || typeof b.name === 'string')
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isValidChatRequest(body)) {
    return new Response(JSON.stringify({ error: 'Expected { phone: string, message: string }' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { phone, message, name } = body;

  try {
    const supabase = getServiceClient();
    const config = await loadActiveConfig(supabase);
    const customer = await findOrCreateCustomer(supabase, phone, name);

    const queryEmbedding = await embed(message, config.embedding_model);
    const chunks = await searchKnowledge(
      supabase,
      queryEmbedding,
      config.top_k,
      config.similarity_threshold
    );

    // Grounding gate: never call the LLM without supporting context. This
    // is what actually prevents hallucination, not prompt instructions.
    if (chunks.length === 0) {
      await appendMessage(supabase, customer.id, { role: 'user', message });
      await appendMessage(supabase, customer.id, {
        role: 'assistant',
        message: config.fallback_message,
        confidence: 0,
      });

      const response: ChatResponse = {
        reply: config.fallback_message,
        confidence: 0,
        intent: 'fallback',
        handover: false,
        tool: null,
        sources: [],
      };
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const response: ChatResponse = {
      reply,
      confidence,
      intent: 'knowledge',
      handover: false,
      tool: null,
      sources,
    };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('chat function error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
