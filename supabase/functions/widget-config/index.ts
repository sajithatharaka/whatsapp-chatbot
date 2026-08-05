import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import {
  loadActiveWidgetConfig,
  updateWidgetConfig,
  type UpdateWidgetConfigInput,
} from '../_shared/widget-config.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const VALID_POSITIONS = ['bottom-right', 'bottom-left'];

function isValidUpdateBody(body: unknown): body is UpdateWidgetConfigInput {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') return false;
  if (b.title !== undefined && typeof b.title !== 'string') return false;
  if (b.welcomeMessage !== undefined && typeof b.welcomeMessage !== 'string') return false;
  if (b.primaryColor !== undefined && typeof b.primaryColor !== 'string') return false;
  if (b.position !== undefined && !VALID_POSITIONS.includes(b.position as string)) return false;
  if (b.allowedOrigins !== undefined) {
    if (!Array.isArray(b.allowedOrigins)) return false;
    if (!b.allowedOrigins.every((o) => typeof o === 'string')) return false;
  }
  return true;
}

// Admin-only settings for the website chat widget — the dashboard's
// /dashboard/widget page reads and writes this exclusively through
// src/app/api/widget-config/route.ts (never called directly from the
// browser, same server-only pattern as /ingest). This is a different,
// non-public surface from supabase/functions/web-chat's own GET, which
// exposes only the safe-to-expose branding subset to the embedded widget.
// GET   /widget-config -> full config incl. allowed_origins
// PATCH /widget-config -> partial update
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json({ error: 'Method not allowed, use GET or PATCH' }, 405);
  }

  const authError = requireAdminSecret(req);
  if (authError) return authError;

  try {
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      const config = await loadActiveWidgetConfig(supabase);
      return json({ config });
    }

    // PATCH
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!isValidUpdateBody(body)) {
      return json({ error: 'Invalid update payload' }, 400);
    }

    const config = await updateWidgetConfig(supabase, body);
    return json({ config });
  } catch (error) {
    console.error('widget-config function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
