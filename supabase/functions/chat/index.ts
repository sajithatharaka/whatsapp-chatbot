import { corsHeaders } from '../_shared/cors.ts';
import { findOrCreateCustomer, getServiceClient } from '../_shared/db.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import { runRagPipeline } from '../_shared/rag-pipeline.ts';
import type { ChatRequest, ChatResponse } from '../_shared/types.ts';

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

    const response: ChatResponse = await runRagPipeline(supabase, config, customer, message);
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
