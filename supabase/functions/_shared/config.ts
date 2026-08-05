import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AiConfiguration } from './types.ts';

// No caching: Phase 1 traffic doesn't need it, and reading fresh means
// tuning ai_configuration takes effect immediately with no redeploy.
export async function loadActiveConfig(supabase: SupabaseClient): Promise<AiConfiguration> {
  const { data, error } = await supabase
    .from('ai_configuration')
    .select(
      'id, chat_model, embedding_model, fallback_model, similarity_threshold, temperature, max_tokens, top_k, system_prompt, business_rules_prompt, fallback_message, timezone'
    )
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data as AiConfiguration;
}
