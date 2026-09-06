import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { AiConfiguration } from './types.ts';

const AI_CONFIG_COLUMNS =
  'id, chat_model, embedding_model, fallback_model, similarity_threshold, temperature, max_tokens, top_k, system_prompt, business_rules_prompt, fallback_message, timezone';

// No caching: Phase 1 traffic doesn't need it, and reading fresh means
// tuning ai_configuration takes effect immediately with no redeploy.
// One active row per business (ai_configuration_business_id_active_idx), so businessId is
// required to know which tenant's configuration to load.
export async function loadActiveConfig(
  supabase: SupabaseClient,
  businessId: string
): Promise<AiConfiguration> {
  const { data, error } = await supabase
    .from('ai_configuration')
    .select(AI_CONFIG_COLUMNS)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data as AiConfiguration;
}

export interface UpdateAiConfigInput {
  chatModel?: string;
  embeddingModel?: string;
  fallbackModel?: string | null;
  similarityThreshold?: number;
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  systemPrompt?: string;
  businessRulesPrompt?: string | null;
  fallbackMessage?: string;
  timezone?: string;
}

// Mirrors widget-config.ts's updateWidgetConfig: partial patch of the single
// active row per business, no caching anywhere so a dashboard edit takes effect on the very
// next /chat request via loadActiveConfig.
export async function updateActiveConfig(
  supabase: SupabaseClient,
  businessId: string,
  input: UpdateAiConfigInput
): Promise<AiConfiguration> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.chatModel !== undefined) patch.chat_model = input.chatModel;
  if (input.embeddingModel !== undefined) patch.embedding_model = input.embeddingModel;
  if (input.fallbackModel !== undefined) patch.fallback_model = input.fallbackModel;
  if (input.similarityThreshold !== undefined)
    patch.similarity_threshold = input.similarityThreshold;
  if (input.temperature !== undefined) patch.temperature = input.temperature;
  if (input.maxTokens !== undefined) patch.max_tokens = input.maxTokens;
  if (input.topK !== undefined) patch.top_k = input.topK;
  if (input.systemPrompt !== undefined) patch.system_prompt = input.systemPrompt;
  if (input.businessRulesPrompt !== undefined)
    patch.business_rules_prompt = input.businessRulesPrompt;
  if (input.fallbackMessage !== undefined) patch.fallback_message = input.fallbackMessage;
  if (input.timezone !== undefined) patch.timezone = input.timezone;

  const { data, error } = await supabase
    .from('ai_configuration')
    .update(patch)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .select(AI_CONFIG_COLUMNS)
    .single();

  if (error) throw error;
  return data as AiConfiguration;
}
