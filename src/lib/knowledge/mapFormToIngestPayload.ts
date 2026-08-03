import type { IngestRequestBody, KnowledgeFormValues } from '@/lib/knowledge/types';

const TEXT_LIKE_SOURCE_TYPES = new Set<KnowledgeFormValues['sourceType']>([
  'text',
  'markdown',
  'csv',
]);

/**
 * Pure mapping from form input to the /ingest request body — only the field(s)
 * relevant to the selected sourceType are included, matching what the Edge
 * Function's validation actually requires per type.
 */
export function mapFormToIngestPayload(form: KnowledgeFormValues): IngestRequestBody {
  const base: IngestRequestBody = {
    sourceType: form.sourceType,
    ...(form.documentId ? { documentId: form.documentId } : {}),
    ...(form.title ? { title: form.title } : {}),
  };

  if (TEXT_LIKE_SOURCE_TYPES.has(form.sourceType)) {
    return { ...base, content: form.content };
  }

  if (form.sourceType === 'website') {
    return { ...base, source: form.source };
  }

  // pdf | docx
  return { ...base, contentBase64: form.contentBase64 };
}
