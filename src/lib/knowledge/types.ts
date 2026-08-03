// Mirrors supabase/functions/_shared/knowledge.ts. Duplicated deliberately:
// the Edge Functions run on Deno and can't be imported into the Next.js
// build — these are two separate deployables sharing a wire format.

export interface KnowledgeDocumentRecord {
  id: string;
  title: string | null;
  source: string | null;
  source_type: string | null;
  checksum: string | null;
  version: number;
  created_at?: string;
  updated_at?: string;
}

export interface ViewableChunk {
  id: string;
  chunk_text: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type KnowledgeSourceType = 'text' | 'markdown' | 'csv' | 'website' | 'pdf' | 'docx';

export interface IngestRequestBody {
  documentId?: string;
  title?: string;
  source?: string;
  sourceType: KnowledgeSourceType;
  content?: string;
  contentBase64?: string;
}

export interface IngestResponse {
  documentId: string;
  status: 'unchanged' | 'updated' | 'created';
  version: number;
  chunksCreated: number;
}

/** Shape collected by KnowledgeFormDialog before being mapped to IngestRequestBody. */
export interface KnowledgeFormValues {
  documentId?: string;
  title: string;
  sourceType: KnowledgeSourceType;
  source: string;
  content: string;
  contentBase64: string;
}
