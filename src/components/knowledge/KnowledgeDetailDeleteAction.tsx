'use client';

import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DeleteKnowledgeDialog } from '@/components/knowledge/DeleteKnowledgeDialog';

interface KnowledgeDetailDeleteActionProps {
  documentId: string;
  documentTitle: string;
}

export function KnowledgeDetailDeleteAction({
  documentId,
  documentTitle,
}: KnowledgeDetailDeleteActionProps) {
  const router = useRouter();

  return (
    <DeleteKnowledgeDialog
      documentId={documentId}
      documentTitle={documentTitle}
      onDeleted={() => router.push('/dashboard/knowledge')}
      trigger={
        <Button variant="destructive" data-testid="knowledge-detail-delete-button">
          <Trash2 className="size-4" />
          Delete
        </Button>
      }
    />
  );
}
