import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import {
  deleteDocument,
  findDocumentById,
  listChunksForDocument,
  listDocuments,
} from '../_shared/knowledge.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Supabase Edge Functions route by function name only; the /{id} segment is
// parsed from the request path here.
// GET    /knowledge      -> list documents
// GET    /knowledge/{id} -> a document + its chunks
// DELETE /knowledge/{id} -> delete a document (chunks cascade via FK)
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return json({ error: 'Method not allowed, use GET or DELETE' }, 405);
  }

  // Every method here reads or mutates the full knowledge base, so all of
  // them require the admin secret, not just DELETE.
  const authError = requireAdminSecret(req);
  if (authError) return authError;

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const id = last && last !== 'knowledge' ? last : undefined;

  try {
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      if (!id) {
        const documents = await listDocuments(supabase);
        return json({ documents });
      }

      const document = await findDocumentById(supabase, id);
      if (!document) return json({ error: `No document with id ${id}` }, 404);

      const chunks = await listChunksForDocument(supabase, id);
      return json({ document, chunks });
    }

    // DELETE
    if (!id) return json({ error: 'Expected DELETE /knowledge/{id}' }, 400);
    await deleteDocument(supabase, id);
    return json({ status: 'deleted', documentId: id });
  } catch (error) {
    console.error('knowledge function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
