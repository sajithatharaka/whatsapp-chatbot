export interface ChatRequest {
  customerId?: string;
  phone: string;
  message: string;
  name?: string;
}

export interface ChatResponse {
  reply: string;
  confidence: number;
  intent: string;
  handover: boolean;
  tool: string | null;
  sources: string[];
}

export interface AiConfiguration {
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
}

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string | null;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  chunk_text: string;
  similarity: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  message: string;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
