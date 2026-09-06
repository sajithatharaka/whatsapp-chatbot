import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { resolveDefaultBusinessId } from '../_shared/business.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import {
  loadActiveConfig,
  updateActiveConfig,
  type UpdateAiConfigInput,
} from '../_shared/config.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isValidUpdateBody(body: unknown): body is UpdateAiConfigInput {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  if (b.chatModel !== undefined && typeof b.chatModel !== 'string') return false;
  if (b.embeddingModel !== undefined && typeof b.embeddingModel !== 'string') return false;
  if (b.fallbackModel !== undefined && !isNullableString(b.fallbackModel)) return false;
  if (b.systemPrompt !== undefined && typeof b.systemPrompt !== 'string') return false;
  if (b.businessRulesPrompt !== undefined && !isNullableString(b.businessRulesPrompt)) return false;
  if (b.fallbackMessage !== undefined && typeof b.fallbackMessage !== 'string') return false;
  if (b.timezone !== undefined && typeof b.timezone !== 'string') return false;

  if (b.similarityThreshold !== undefined) {
    if (!isFiniteNumber(b.similarityThreshold)) return false;
    if (b.similarityThreshold < 0 || b.similarityThreshold > 1) return false;
  }
  if (b.temperature !== undefined) {
    if (!isFiniteNumber(b.temperature)) return false;
    if (b.temperature < 0 || b.temperature > 2) return false;
  }
  if (b.maxTokens !== undefined && !isPositiveInteger(b.maxTokens)) return false;
  if (b.topK !== undefined && !isPositiveInteger(b.topK)) return false;

  return true;
}

// Admin-only settings for the AI assistant — the dashboard's /dashboard/settings
// page reads and writes the single active ai_configuration row exclusively
// through src/app/api/ai-config/route.ts (never called directly from the
// browser, same server-only pattern as /widget-config and /ingest).
// GET   /ai-config -> full active config row
// PATCH /ai-config -> partial update of the active row
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json({ error: 'Method not allowed, use GET or PATCH' }, 405);
  }

  const authError = requireAdminSecret(req);
  if (authError) return authError;

  try {
    const supabase = getServiceClient();
    // Phase 0: this is the one seeded business until the dashboard resolves a business from an
    // authenticated per-user session (see supabase/functions/_shared/business.ts).
    const businessId = await resolveDefaultBusinessId(supabase);

    if (req.method === 'GET') {
      const config = await loadActiveConfig(supabase, businessId);
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

    const config = await updateActiveConfig(supabase, businessId, body);
    return json({ config });
  } catch (error) {
    console.error('ai-config function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
