import { requireAdminSecret } from '../_shared/admin-auth.ts';
import { embedBatch } from '../_shared/ai-provider.ts';
import { sha256 } from '../_shared/checksum.ts';
import { chunkText, cleanText } from '../_shared/chunk.ts';
import { loadActiveConfig } from '../_shared/config.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { extractText, UnsupportedSourceTypeError } from '../_shared/extract.ts';
import {
  documentHasChunks,
  findDocumentById,
  findDocumentBySource,
  replaceChunks,
  upsertDocument,
} from '../_shared/knowledge.ts';

interface IngestRequest {
  documentId?: string; // update this specific document directly, bypassing source matching
  title?: string;
  source?: string;
  sourceType: string;
  content?: string;
  contentBase64?: string;
}

function isValidIngestRequest(body: unknown): body is IngestRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.sourceType === 'string';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authError = requireAdminSecret(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!isValidIngestRequest(body)) {
    return json({ error: 'sourceType is required' }, 400);
  }

  try {
    const supabase = getServiceClient();
    const config = await loadActiveConfig(supabase);

    const rawText = await extractText({
      sourceType: body.sourceType as never,
      content: body.content,
      contentBase64: body.contentBase64,
      source: body.source,
    });

    const cleaned = cleanText(rawText);
    if (!cleaned) return json({ error: 'Extracted content is empty' }, 422);

    const checksum = await sha256(cleaned);

    let existing = null;
    if (body.documentId) {
      existing = await findDocumentById(supabase, body.documentId);
      if (!existing) return json({ error: `No document with id ${body.documentId}` }, 404);
    } else if (body.source) {
      existing = await findDocumentBySource(supabase, body.source);
    }

    if (existing && existing.checksum === checksum) {
      const hasChunks = await documentHasChunks(supabase, existing.id);
      if (hasChunks) {
        return json({
          documentId: existing.id,
          status: 'unchanged',
          version: existing.version,
          chunksCreated: 0,
        });
      }
    }

    const document = await upsertDocument(supabase, {
      id: existing?.id,
      title: body.title ?? existing?.title ?? body.source ?? 'Untitled',
      source: body.source,
      sourceType: body.sourceType,
      checksum,
      version: (existing?.version ?? 0) + 1,
    });

    const chunks = chunkText(cleaned);
    const embeddings = await embedBatch(chunks, config.embedding_model);
    const chunksCreated = await replaceChunks(
      supabase,
      document.id,
      chunks.map((text, i) => ({ text, embedding: embeddings[i] }))
    );

    return json({
      documentId: document.id,
      status: existing ? 'updated' : 'created',
      version: document.version,
      chunksCreated,
    });
  } catch (error) {
    if (error instanceof UnsupportedSourceTypeError) {
      return json({ error: error.message }, 501);
    }
    console.error('ingest function error:', error);
    return json({ error: 'Internal error' }, 500);
  }
});
