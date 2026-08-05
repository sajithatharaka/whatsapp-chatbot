// Mirrors supabase/functions/_shared/escalations.ts. Duplicated deliberately:
// the Edge Functions run on Deno and can't be imported into the Next.js
// build — these are two separate deployables sharing a wire format.

export type EscalationStatus = 'needs_attention' | 'in_progress' | 'responded';

export interface EscalationCustomer {
  id: string;
  phone: string | null;
  name: string | null;
  channel: 'whatsapp' | 'web';
}

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

export interface EscalationListItem extends ChatEscalationRecord {
  customer: EscalationCustomer;
}

export interface ConversationMessageRecord {
  id: string;
  role: 'user' | 'assistant' | 'system';
  message: string;
  confidence: number | null;
  created_at: string;
}

export interface UpdateEscalationPayload {
  status?: EscalationStatus;
  adminAnswer?: string;
  knowledgeDocumentId?: string;
  respondedBy?: string;
}

export interface ListEscalationsParams {
  statuses?: EscalationStatus[];
  from?: string;
  to?: string;
}

export interface KnowledgeSearchMatch {
  id: string;
  document_id: string;
  chunk_text: string;
  similarity: number;
}
