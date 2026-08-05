import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ConversationTurn } from './types.ts';

const RECENT_TURNS_LIMIT = 10;

export async function loadRecentTurns(
  supabase: SupabaseClient,
  customerId: string,
  limit: number = RECENT_TURNS_LIMIT
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('role, message')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as ConversationTurn[]).reverse();
}

export async function loadSummary(
  supabase: SupabaseClient,
  customerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversation_summary')
    .select('summary')
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
  customerId: string,
  input: AppendMessageInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
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
  _customerId: string
): Promise<void> {
  return;
}
