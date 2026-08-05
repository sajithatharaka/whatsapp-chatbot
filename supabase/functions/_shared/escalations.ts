import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chatComplete } from './ai-provider.ts';
import type { AiConfiguration } from './types.ts';

export type EscalationStatus = 'needs_attention' | 'in_progress' | 'responded';

export interface ChatEscalationRecord {
  id: string;
  customer_id: string;
  trigger_message_id: string | null;
  question: string;
  status: EscalationStatus;
  ai_summary: string | null;
  admin_answer: string | null;
  knowledge_document_id: string | null;
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalationCustomer {
  id: string;
  phone: string | null;
  name: string | null;
  channel: 'whatsapp' | 'web';
}

export interface EscalationListItem extends ChatEscalationRecord {
  customer: EscalationCustomer;
}

export interface EscalationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  message: string;
  confidence: number | null;
  created_at: string;
}

const ESCALATION_COLUMNS =
  'id, customer_id, trigger_message_id, question, status, ai_summary, admin_answer, knowledge_document_id, responded_at, responded_by, created_at, updated_at';

const OPEN_STATUSES: EscalationStatus[] = ['needs_attention', 'in_progress'];

// One open escalation per customer at a time: repeating the same unanswered
// question shouldn't pile up duplicate rows in the admin list.
export async function createEscalationIfNeeded(
  supabase: SupabaseClient,
  customerId: string,
  triggerMessageId: string,
  question: string
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('chat_escalations')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', OPEN_STATUSES)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return;

  const { error: insertError } = await supabase.from('chat_escalations').insert({
    customer_id: customerId,
    trigger_message_id: triggerMessageId,
    question,
  });
  if (insertError) throw insertError;
}

// Two queries + an in-memory merge rather than a nested Supabase embedded
// select — keeps the mock-friendly shape the rest of this codebase's tests
// use (see knowledge.test.ts) and avoids relying on untested join syntax.
async function attachCustomers(
  supabase: SupabaseClient,
  escalations: ChatEscalationRecord[]
): Promise<EscalationListItem[]> {
  if (escalations.length === 0) return [];

  const customerIds = [...new Set(escalations.map((e) => e.customer_id))];
  const { data, error } = await supabase
    .from('customers')
    .select('id, phone, name, channel')
    .in('id', customerIds);
  if (error) throw error;

  const customersById = new Map(((data ?? []) as EscalationCustomer[]).map((c) => [c.id, c]));

  return escalations.map((escalation) => ({
    ...escalation,
    customer: customersById.get(escalation.customer_id) ?? {
      id: escalation.customer_id,
      phone: null,
      name: null,
      channel: 'whatsapp',
    },
  }));
}

export interface ListEscalationsFilter {
  statuses?: EscalationStatus[];
  from?: string;
  to?: string;
}

export async function listEscalations(
  supabase: SupabaseClient,
  filter: ListEscalationsFilter = {}
): Promise<EscalationListItem[]> {
  let query = supabase
    .from('chat_escalations')
    .select(ESCALATION_COLUMNS)
    .order('created_at', { ascending: false });

  if (filter.statuses && filter.statuses.length > 0) {
    query = query.in('status', filter.statuses);
  }
  if (filter.from) query = query.gte('created_at', filter.from);
  if (filter.to) query = query.lte('created_at', filter.to);

  const { data, error } = await query;
  if (error) throw error;
  return attachCustomers(supabase, (data ?? []) as ChatEscalationRecord[]);
}

export async function findEscalationById(
  supabase: SupabaseClient,
  id: string
): Promise<EscalationListItem | null> {
  const { data, error } = await supabase
    .from('chat_escalations')
    .select(ESCALATION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [withCustomer] = await attachCustomers(supabase, [data as ChatEscalationRecord]);
  return withCustomer;
}

export async function listMessagesForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<EscalationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, role, message, confidence, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EscalationMessage[];
}

export interface UpdateEscalationInput {
  status?: EscalationStatus;
  adminAnswer?: string;
  knowledgeDocumentId?: string;
  respondedBy?: string;
}

export async function updateEscalation(
  supabase: SupabaseClient,
  id: string,
  input: UpdateEscalationInput
): Promise<ChatEscalationRecord> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === 'responded') {
      patch.responded_at = new Date().toISOString();
      patch.responded_by = input.respondedBy ?? null;
    }
  }
  if (input.adminAnswer !== undefined) patch.admin_answer = input.adminAnswer;
  if (input.knowledgeDocumentId !== undefined) {
    patch.knowledge_document_id = input.knowledgeDocumentId;
  }

  const { data, error } = await supabase
    .from('chat_escalations')
    .update(patch)
    .eq('id', id)
    .select(ESCALATION_COLUMNS)
    .single();
  if (error) throw error;
  return data as ChatEscalationRecord;
}

// Lazily generated and cached on the row: cheap on repeat views, and keeps
// the extra LLM call off the WhatsApp-facing hot path in chat/index.ts.
export async function generateSummary(
  supabase: SupabaseClient,
  config: AiConfiguration,
  escalation: ChatEscalationRecord,
  messages: EscalationMessage[]
): Promise<string> {
  if (escalation.ai_summary) return escalation.ai_summary;

  const transcript =
    messages.map((m) => `${m.role}: ${m.message}`).join('\n') || escalation.question;

  const summary = await chatComplete(
    [
      {
        role: 'system',
        content:
          'Summarize this WhatsApp support conversation in 2-3 sentences for a human agent who is about to take over. State what the customer wants and why the assistant could not help.',
      },
      { role: 'user', content: transcript },
    ],
    { model: config.chat_model, temperature: 0.2, maxTokens: 200 }
  );

  const { error } = await supabase
    .from('chat_escalations')
    .update({ ai_summary: summary })
    .eq('id', escalation.id);
  if (error) throw error;

  return summary;
}
