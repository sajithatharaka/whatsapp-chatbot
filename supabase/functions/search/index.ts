import { embed } from '../_shared/ai-provider.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { searchKnowledge } from '../_shared/vector-search.ts';

interface SearchRequest {
  query: string;
  topK?: number;
  similarityThreshold?: number;
}

function isValidSearchRequest(body: unknown): body is SearchRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.query === 'string' && b.query.length > 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Developer testing endpoint (BRD §17): retrieval only, no LLM call, so you
// can tune similarity_threshold/top_k against real knowledge without paying
// for a chat completion each time.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!isValidSearchRequest(body)) {
    return json({ error: 'query is required' }, 400);
  }

  try {
    const supabase = getServiceClient();
    const config = await loadActiveConfig(supabase);
    const topK = body.topK ?? config.top_k;
    const similarityThreshold = body.similarityThreshold ?? config.similarity_threshold;

    const queryEmbedding = await embed(body.query, config.embedding_model);
    const results = await searchKnowledge(supabase, queryEmbedding, topK, similarityThreshold);

    return json({ query: body.query, topK, similarityThreshold, results });
  } catch (error) {
    console.error('search function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
