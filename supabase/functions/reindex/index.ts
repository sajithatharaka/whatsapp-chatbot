import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { embedBatch } from '../_shared/ai-provider.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { listChunksForReindex, updateChunkEmbedding } from '../_shared/knowledge.ts';

const BATCH_SIZE = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Re-embeds existing chunks with the currently active embedding_model —
// needed after switching embedding models in ai_configuration (old vectors
// are the wrong dimension/space to compare against new query embeddings).
// Runs synchronously in request/response; not queued or backgrounded, so
// large knowledge bases will take a while and risk hitting the function's
// request timeout — fine for Phase 2 scope, revisit if this becomes slow.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authError = requireAdminSecret(req);
  if (authError) return authError;

  let body: { documentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body means "reindex everything" — allowed.
  }

  try {
    const supabase = getServiceClient();
    const config = await loadActiveConfig(supabase);
    const chunks = await listChunksForReindex(supabase, body.documentId);

    let reindexed = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedBatch(
        batch.map((chunk) => chunk.chunk_text),
        config.embedding_model
      );
      await Promise.all(
        batch.map((chunk, idx) => updateChunkEmbedding(supabase, chunk.id, embeddings[idx]))
      );
      reindexed += batch.length;
    }

    return json({ chunksReindexed: reindexed, embeddingModel: config.embedding_model });
  } catch (error) {
    console.error('reindex function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
