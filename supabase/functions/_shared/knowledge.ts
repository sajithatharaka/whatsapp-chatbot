import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

const DOCUMENT_COLUMNS =
  'id, title, source, source_type, checksum, version, created_at, updated_at';

export async function findDocumentBySource(
  supabase: SupabaseClient,
  source: string
): Promise<KnowledgeDocumentRecord | null> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('source', source)
    .maybeSingle();
  if (error) throw error;
  return data as KnowledgeDocumentRecord | null;
}

export async function findDocumentById(
  supabase: SupabaseClient,
  id: string
): Promise<KnowledgeDocumentRecord | null> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as KnowledgeDocumentRecord | null;
}

export async function listDocuments(
  supabase: SupabaseClient,
  limit = 200
): Promise<KnowledgeDocumentRecord[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(DOCUMENT_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as KnowledgeDocumentRecord[];
}

export interface UpsertDocumentInput {
  id?: string;
  title: string;
  source?: string;
  sourceType: string;
  checksum: string;
  version: number;
}

export async function upsertDocument(
  supabase: SupabaseClient,
  input: UpsertDocumentInput
): Promise<KnowledgeDocumentRecord> {
  if (input.id) {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .update({
        title: input.title,
        source_type: input.sourceType,
        checksum: input.checksum,
        version: input.version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('id, title, source, source_type, checksum, version')
      .single();
    if (error) throw error;
    return data as KnowledgeDocumentRecord;
  }

  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({
      title: input.title,
      source: input.source,
      source_type: input.sourceType,
      checksum: input.checksum,
      version: input.version,
    })
    .select('id, title, source, source_type, checksum, version')
    .single();
  if (error) throw error;
  return data as KnowledgeDocumentRecord;
}

export interface ChunkInput {
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

// Delete-then-insert: simple and correct, at the cost of a brief window
// where this document's chunks aren't retrievable mid-request. Acceptable
// for Phase 2 scope; a zero-downtime swap would insert new chunks first and
// delete the old ones after, which needs a way to distinguish "old" vs
// "new" chunks for the same document (e.g. an ingestion-batch id) — not
// implemented here.
export async function replaceChunks(
  supabase: SupabaseClient,
  documentId: string,
  chunks: ChunkInput[]
): Promise<number> {
  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', documentId);
  if (deleteError) throw deleteError;

  if (chunks.length === 0) return 0;

  const rows = chunks.map((chunk, index) => ({
    document_id: documentId,
    chunk_text: chunk.text,
    embedding: chunk.embedding,
    metadata: { ...chunk.metadata, chunk_index: index },
  }));

  const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);
  if (insertError) throw insertError;

  return rows.length;
}

// checksum-matches-existing is only a valid reason to skip re-ingesting if
// the document's chunks actually made it in — an earlier ingest can create
// the document row and then fail before writing chunks (e.g. a permissions
// error), leaving a checksum with nothing behind it.
export async function documentHasChunks(
  supabase: SupabaseClient,
  documentId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function deleteDocument(supabase: SupabaseClient, id: string): Promise<void> {
  // knowledge_chunks rows cascade-delete via the document_id FK.
  const { error } = await supabase.from('knowledge_documents').delete().eq('id', id);
  if (error) throw error;
}

export interface ReindexableChunk {
  id: string;
  chunk_text: string;
}

export async function listChunksForReindex(
  supabase: SupabaseClient,
  documentId?: string
): Promise<ReindexableChunk[]> {
  let query = supabase.from('knowledge_chunks').select('id, chunk_text');
  if (documentId) query = query.eq('document_id', documentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ReindexableChunk[];
}

export interface ViewableChunk {
  id: string;
  chunk_text: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listChunksForDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<ViewableChunk[]> {
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('id, chunk_text, metadata, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const chunks = (data ?? []) as ViewableChunk[];
  // created_at ties for chunks inserted in the same batch; chunk_index in
  // metadata (set by replaceChunks) is the real ordering.
  return chunks.sort((a, b) => {
    const ai = (a.metadata?.chunk_index as number | undefined) ?? 0;
    const bi = (b.metadata?.chunk_index as number | undefined) ?? 0;
    return ai - bi;
  });
}

export async function updateChunkEmbedding(
  supabase: SupabaseClient,
  id: string,
  embedding: number[]
): Promise<void> {
  const { error } = await supabase.from('knowledge_chunks').update({ embedding }).eq('id', id);
  if (error) throw error;
}
