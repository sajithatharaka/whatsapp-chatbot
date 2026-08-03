import { corsHeaders } from './cors.ts';

// The Supabase anon key (required by verify_jwt) is not a meaningful access
// control on its own — it's routinely embedded in public clients. /ingest,
// /reindex, and DELETE /knowledge/{id} mutate the knowledge base, so they
// require a second, non-public shared secret on top of the anon/service JWT.
// /chat and /search stay anon-key-only since they're read-only or meant to
// be called from a semi-trusted orchestrator (Make.com).
export function requireAdminSecret(req: Request): Response | null {
  const expected = Deno.env.get('INGEST_ADMIN_SECRET');
  if (!expected) {
    return new Response(
      JSON.stringify({ error: 'INGEST_ADMIN_SECRET is not configured on the server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const provided = req.headers.get('x-admin-secret');
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return null;
}
