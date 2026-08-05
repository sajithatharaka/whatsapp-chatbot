import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Counts against the existing conversation_messages table rather than a new
// one — cheap, and this is the same "Phase 1 heuristic over existing data"
// approach the rest of this codebase uses (e.g. the confidence heuristic in
// rag-pipeline.ts). Only applied to the website widget: WhatsApp traffic is
// already gated by needing a real phone number behind a provider, but the
// widget is reachable by anyone who can load the embedding page.
export interface RateLimitOptions {
  maxMessages: number;
  windowSeconds: number;
}

export async function isRateLimited(
  supabase: SupabaseClient,
  customerId: string,
  options: RateLimitOptions
): Promise<boolean> {
  const since = new Date(Date.now() - options.windowSeconds * 1000).toISOString();

  const { count, error } = await supabase
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('role', 'user')
    .gte('created_at', since);

  if (error) throw error;
  return (count ?? 0) >= options.maxMessages;
}
