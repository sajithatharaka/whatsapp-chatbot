import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ConversationTurn } from './types.ts';

const RECENT_TURNS_LIMIT = 10;

// businessId scopes every query so a customer_id can never be used to read or append to another
// tenant's conversation history (see
// docs/requirements/mixed-language-multi-tenant-architecture-plan.md, Phase 0). customer_id
// alone would already imply the right business via customers.business_id, but the explicit
// filter here is defense in depth and keeps this table's RLS policy meaningful.
export async function loadRecentTurns(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  limit: number = RECENT_TURNS_LIMIT
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('role, message')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as ConversationTurn[]).reverse();
}

export async function loadSummary(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversation_summary')
    .select('summary')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (error) throw error;
  return data?.summary ?? null;
}

export interface AppendMessageInput {
  role: 'user' | 'assistant';
  message: string;
  confidence?: number;
  model?: string;
  toolUsed?: string | null;
  sourceChunks?: string[];
}

export async function appendMessage(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  input: AppendMessageInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      role: input.role,
      message: input.message,
      confidence: input.confidence ?? null,
      model: input.model ?? null,
      tool_used: input.toolUsed ?? null,
      source_chunks: input.sourceChunks ?? [],
    })
    .select('id')
    .single();

  if (error) throw error;
  return data as { id: string };
}

// Phase 1 stub: rolling summarization is deferred until conversations are
// long enough to need it. Signature is kept stable so chat/index.ts already
// has the seam for Phase 2 to fill in.
export async function maybeUpdateSummary(
  _supabase: SupabaseClient,
  _businessId: string,
  _customerId: string
): Promise<void> {
  return;
}
