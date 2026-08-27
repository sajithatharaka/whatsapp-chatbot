// Mirrors supabase/functions/_shared/types.ts's AiConfiguration (minus the
// internal `is_active` flag). Duplicated deliberately: the Edge Functions run
// on Deno and can't be imported into the Next.js build — these are two separate
// deployables sharing a wire format.

export interface AiConfig {
  id: string;
  chat_model: string;
  embedding_model: string;
  fallback_model: string | null;
  similarity_threshold: number;
  temperature: number;
  max_tokens: number;
  top_k: number;
  system_prompt: string;
  business_rules_prompt: string | null;
  fallback_message: string;
  timezone: string;
}

// Matches UpdateAiConfigInput in supabase/functions/_shared/config.ts.
export interface UpdateAiConfigPayload {
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
