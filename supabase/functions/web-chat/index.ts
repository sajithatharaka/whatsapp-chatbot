import { loadActiveConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { findOrCreateWebCustomer, getServiceClient } from '../_shared/db.ts';
import { isRateLimited } from '../_shared/rate-limit.ts';
import { runRagPipeline } from '../_shared/rag-pipeline.ts';
import type { ChatResponse, WebChatRequest } from '../_shared/types.ts';
import { isOriginAllowed, loadActiveWidgetConfig } from '../_shared/widget-config.ts';

const RATE_LIMIT = { maxMessages: 20, windowSeconds: 300 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidWebChatRequest(body: unknown): body is WebChatRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.sessionId === 'string' &&
    typeof b.message === 'string' &&
    b.sessionId.length > 0 &&
    b.message.length > 0
  );
}

// Public, unauthenticated-by-secret endpoint reachable from any page that
// embeds public/widget.js (see src/lib/widget/buildWidgetScript.ts). The
// Supabase anon key (required by verify_jwt) only proves the caller has the
// widget script, which is meant to be public — the actual authorization is
// the Origin allowlist configured per supabase/functions/widget-config,
// checked on every request below.
//
// GET  -> branding the widget needs to render itself (title, welcome
//         message, color, position); 403 if the widget is disabled or the
//         calling origin isn't allowlisted.
// POST -> { sessionId, message } -> same origin/enabled check, then the
//         same RAG pipeline supabase/functions/chat uses for WhatsApp.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed, use GET or POST' }, 405);
  }

  try {
    const supabase = getServiceClient();
    const widgetConfig = await loadActiveWidgetConfig(supabase);
    const origin = req.headers.get('origin');

    if (!isOriginAllowed(widgetConfig, origin)) {
      return json({ error: 'Widget is not enabled for this origin' }, 403);
    }

    if (req.method === 'GET') {
      return json({
        enabled: widgetConfig.enabled,
        title: widgetConfig.title,
        welcomeMessage: widgetConfig.welcome_message,
        primaryColor: widgetConfig.primary_color,
        position: widgetConfig.position,
      });
    }

    // POST
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!isValidWebChatRequest(body)) {
      return json({ error: 'Expected { sessionId: string, message: string }' }, 400);
    }

    const { sessionId, message } = body;
    const config = await loadActiveConfig(supabase);
    const customer = await findOrCreateWebCustomer(supabase, sessionId);

    if (await isRateLimited(supabase, customer.id, RATE_LIMIT)) {
      return json(
        { error: 'Too many messages, please wait a moment before sending another.' },
        429
      );
    }

    const response: ChatResponse = await runRagPipeline(supabase, config, customer, message);
    return json(response);
  } catch (error) {
    console.error('web-chat function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
