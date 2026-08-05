import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import {
  type EscalationStatus,
  findEscalationById,
  generateSummary,
  listEscalations,
  listMessagesForCustomer,
  updateEscalation,
} from '../_shared/escalations.ts';

const VALID_STATUSES: EscalationStatus[] = ['needs_attention', 'in_progress', 'responded'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseStatuses(raw: string | null): EscalationStatus[] | undefined {
  if (!raw) return undefined;
  const statuses = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is EscalationStatus => (VALID_STATUSES as string[]).includes(s));
  return statuses.length > 0 ? statuses : undefined;
}

interface UpdateEscalationBody {
  status?: EscalationStatus;
  adminAnswer?: string;
  knowledgeDocumentId?: string;
  respondedBy?: string;
}

function isValidUpdateBody(body: unknown): body is UpdateEscalationBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (b.status !== undefined && !(VALID_STATUSES as string[]).includes(b.status as string)) {
    return false;
  }
  if (b.adminAnswer !== undefined && typeof b.adminAnswer !== 'string') return false;
  if (b.knowledgeDocumentId !== undefined && typeof b.knowledgeDocumentId !== 'string') {
    return false;
  }
  if (b.respondedBy !== undefined && typeof b.respondedBy !== 'string') return false;
  return true;
}

// Supabase Edge Functions route by function name only; the /{id} segment is
// parsed from the request path here (same convention as supabase/functions/knowledge).
// GET   /escalations      -> list, filtered by ?status=a,b&from=...&to=...
// GET   /escalations/{id} -> escalation + customer + full chat history + AI summary
// PATCH /escalations/{id} -> update status / admin_answer / knowledge_document_id
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return json({ error: 'Method not allowed, use GET or PATCH' }, 405);
  }

  // This exposes customer conversation content, same sensitivity as
  // /knowledge, so it requires the same admin secret rather than just the
  // anon key.
  const authError = requireAdminSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const id = last && last !== 'escalations' ? last : undefined;

  try {
    const supabase = getServiceClient();

    if (req.method === 'GET') {
      if (!id) {
        const statuses = parseStatuses(url.searchParams.get('status'));
        const from = url.searchParams.get('from') ?? undefined;
        const to = url.searchParams.get('to') ?? undefined;
        const escalations = await listEscalations(supabase, { statuses, from, to });
        return json({ escalations });
      }

      const escalation = await findEscalationById(supabase, id);
      if (!escalation) return json({ error: `No escalation with id ${id}` }, 404);

      const messages = await listMessagesForCustomer(supabase, escalation.customer_id);
      const config = await loadActiveConfig(supabase);
      const aiSummary = await generateSummary(supabase, config, escalation, messages);

      return json({ escalation: { ...escalation, ai_summary: aiSummary }, messages });
    }

    // PATCH
    if (!id) return json({ error: 'Expected PATCH /escalations/{id}' }, 400);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!isValidUpdateBody(body)) {
      return json({ error: 'Invalid update payload' }, 400);
    }

    const escalation = await updateEscalation(supabase, id, body);
    return json({ escalation });
  } catch (error) {
    console.error('escalations function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
