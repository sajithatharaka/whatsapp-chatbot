import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('ai_configuration')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    return json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('health function error:', error);
    return json({ status: 'error', timestamp: new Date().toISOString() }, 503);
  }
});
