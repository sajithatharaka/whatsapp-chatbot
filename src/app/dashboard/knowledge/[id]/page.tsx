import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { KnowledgeChunksView } from '@/components/knowledge/KnowledgeChunksView';
import { KnowledgeFormDialog } from '@/components/knowledge/KnowledgeFormDialog';
import { KnowledgeDetailDeleteAction } from '@/components/knowledge/KnowledgeDetailDeleteAction';
import { EdgeFunctionError, getKnowledgeDocument } from '@/lib/supabase/admin-api';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getKnowledgeDocument>>;
  try {
    data = await getKnowledgeDocument(id);
  } catch (error) {
    if (error instanceof EdgeFunctionError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const { document, chunks } = data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/knowledge"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Knowledge Base
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {document.title ?? document.source ?? document.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {document.source_type ?? 'unknown'} · version {document.version}
            {document.source ? ` · ${document.source}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <KnowledgeFormDialog
            mode="edit"
            initialValues={{
              documentId: document.id,
              title: document.title ?? '',
              sourceType: (document.source_type as KnowledgeSourceType | null) ?? 'text',
              source: document.source ?? '',
            }}
            trigger={
              <Button variant="outline" data-testid="knowledge-detail-edit-button">
                <Pencil className="size-4" />
                Edit
              </Button>
            }
          />
          <KnowledgeDetailDeleteAction
            documentId={document.id}
            documentTitle={document.title ?? document.id}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Ingested chunks ({chunks.length})
        </h2>
        <KnowledgeChunksView chunks={chunks} />
      </div>
    </div>
  );
}
